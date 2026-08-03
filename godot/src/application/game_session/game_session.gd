class_name GameSession
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const CanonicalJson = preload("res://src/domain/validation/canonical_json.gd")
const CommandDispatcher = preload("res://src/application/commands/command_dispatcher.gd")
const ProductionDataRepository = preload("res://src/application/game_session/production_data_repository.gd")
const GameSessionQueries = preload("res://src/application/game_session/game_session_queries.gd")
const SaveRepository = preload("res://src/application/persistence/json_save_repository.gd")
const BattleRecoveryRepository = preload("res://src/application/persistence/battle_recovery_repository.gd")
const CalendarEvents = preload("res://src/domain/progression/calendar_events.gd")
const AnnualProgression = preload("res://src/domain/progression/annual_progression.gd")
const OfficerLifecycle = preload("res://src/domain/progression/officer_lifecycle.gd")
const CampaignOutcome = preload("res://src/domain/progression/campaign_outcome.gd")
const StrategicTurn = preload("res://src/domain/progression/strategic_turn.gd")

const DEFAULT_PERIOD_PATH: String = "res://data/period-1.json"
const DEFAULT_SAVE_PATH: String = "user://godot-spike-save.json"
const RESULT_ENVELOPE_VERSION: int = 1
const IDEMPOTENCY_WINDOW_LIMIT: int = 256

var _state: GameState
var _repository: SaveRepository
var _recovery_repository: BattleRecoveryRepository
var _campaign: Dictionary = {}
var _completed_commands: Dictionary = {}
var _completed_command_order: Array[String] = []
var _compat_command_serial: int = 0
var _production_bundle: Dictionary = {}


func _init(save_path: String = DEFAULT_SAVE_PATH) -> void:
	_repository = SaveRepository.new(save_path)
	_recovery_repository = BattleRecoveryRepository.new(save_path + ".battle-recovery.json")


func start_campaign(period_id: Variant, ruler_source_index: Variant) -> Dictionary:
	if not _is_integer(period_id) or not _is_integer(ruler_source_index):
		return _failure("periodId and rulerSourceIndex must be integers")
	var loaded: Dictionary = _production_bundle
	if loaded.is_empty() or int(loaded.get("periodId", -1)) != int(period_id):
		loaded = ProductionDataRepository.load_period(int(period_id))
	if not loaded["ok"]:
		return _failure("production campaign data failed validation: %s" % loaded["error"])
	_production_bundle = loaded
	var normalized_period_id: int = int(period_id)
	var envelope: Dictionary = loaded["envelope"]
	var scenario: Dictionary = envelope["scenario"]
	var selected_candidate: Dictionary = {}
	for raw_candidate: Variant in scenario["playerCandidates"]:
		var candidate: Dictionary = raw_candidate
		if int(candidate["sourceIndex"]) == int(ruler_source_index):
			selected_candidate = candidate.duplicate(true)
			break
	if selected_candidate.is_empty():
		return _failure(
			"ruler source index %d is not a player candidate for period %d"
			% [int(ruler_source_index), normalized_period_id]
		)

	var initial_state: GameState = loaded["state"]
	var candidate_data: Dictionary = initial_state.snapshot()
	var initial_seed: int = int(candidate_data["rngSeed"])
	var faction_id: String = selected_candidate["factionId"]
	var factions: Dictionary = candidate_data["factions"]
	var faction_ids: Array[String] = []
	for raw_faction_id: Variant in factions.keys():
		faction_ids.append(str(raw_faction_id))
	faction_ids.sort()
	for candidate_faction_id: String in faction_ids:
		var faction: Dictionary = factions[candidate_faction_id].duplicate(true)
		faction["isPlayer"] = candidate_faction_id == faction_id
		factions[candidate_faction_id] = faction
	candidate_data["factions"] = factions
	candidate_data["phase"] = "player"
	candidate_data["playerFactionId"] = faction_id
	candidate_data["activeFactionId"] = faction_id
	var issues: Array[Dictionary] = Validator.validate_initial(candidate_data)
	if not issues.is_empty():
		return _failure("selected production campaign is invalid: %s" % Validator.first_error(issues))
	if int(candidate_data["rngSeed"]) != initial_seed:
		return _failure("player selection changed rngSeed")

	var next_state: GameState = GameState.new(candidate_data)
	var state_digest: Dictionary = CanonicalJson.try_sha256(candidate_data)
	if not state_digest["ok"]:
		return _failure("selected production campaign cannot be hashed: %s" % state_digest["error"])
	_state = next_state
	_campaign = {
		"productionDataContractVersion": int(envelope["productionDataContractVersion"]),
		"periodId": normalized_period_id,
		"title": scenario["title"],
		"rulerSourceIndex": int(selected_candidate["sourceIndex"]),
		"playerFactionId": faction_id,
		"rulerOfficerId": selected_candidate["rulerOfficerId"],
		"rulerName": selected_candidate["name"],
	}
	_completed_commands.clear()
	_completed_command_order.clear()
	_compat_command_serial = 0
	return {
		"ok": true,
		"error": "",
		"campaign": campaign_descriptor(),
		"stateSha256": state_digest["value"],
		"state": snapshot(),
	}


func start_period_1(path: String = "") -> Dictionary:
	if not path.is_empty():
		return start_spike_period_1(path)
	return start_campaign(1, 1)


func start_spike_period_1(path: String = DEFAULT_PERIOD_PATH) -> Dictionary:
	if not FileAccess.file_exists(path):
		return _failure("时期数据不存在：%s" % path)
	var parser: JSON = JSON.new()
	var parse_error: Error = parser.parse(FileAccess.get_file_as_string(path))
	if parse_error != OK:
		return _failure(
			"时期数据不是有效的 JSON（第 %d 行：%s）" % [parser.get_error_line(), parser.get_error_message()]
		)
	if typeof(parser.data) != TYPE_DICTIONARY:
		return _failure("时期数据根节点必须是对象")
	var candidate_data: Dictionary = parser.data
	var issues: Array[Dictionary] = Validator.validate(candidate_data)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	_state = GameState.new(candidate_data)
	_campaign = {"periodId": 1, "legacySpike": true, "playerFactionId": candidate_data["playerFactionId"]}
	_completed_commands.clear()
	_completed_command_order.clear()
	_compat_command_serial = 0
	return _success_with_state()


func snapshot() -> Dictionary:
	return {} if _state == null else _state.snapshot()


func state_sha256() -> String:
	if _state == null:
		return ""
	var digest: Dictionary = CanonicalJson.try_sha256(_state.snapshot())
	return String(digest["value"]) if digest["ok"] else ""


func campaign_descriptor() -> Dictionary:
	return _campaign.duplicate(true)


func restore_snapshot(raw_snapshot: Variant, campaign_hint: Variant = null) -> Dictionary:
	if typeof(raw_snapshot) != TYPE_DICTIONARY:
		return _failure("snapshot must be an object")
	var candidate_data: Dictionary = (raw_snapshot as Dictionary).duplicate(true)
	var issues: Array[Dictionary] = Validator.validate_runtime(candidate_data)
	if not issues.is_empty():
		return _failure("snapshot is invalid: %s" % Validator.first_error(issues))
	if int(candidate_data.get("dataContractVersion", -1)) != 2:
		return _failure("snapshot must use production dataContractVersion 2")
	if typeof(candidate_data.get("scenario")) != TYPE_DICTIONARY:
		return _failure("snapshot scenario must be an object")
	var state_scenario: Dictionary = candidate_data["scenario"]
	if not _is_integer(state_scenario.get("period")) or int(state_scenario["period"]) < 1:
		return _failure("snapshot scenario.period must be a positive integer")
	var digest: Dictionary = CanonicalJson.try_sha256(candidate_data)
	if not digest["ok"]:
		return _failure("snapshot cannot be hashed: %s" % digest["error"])
	var player_faction_id: String = candidate_data["playerFactionId"]
	var player_faction: Dictionary = candidate_data["factions"][player_faction_id]
	var ruler_officer_id: String = player_faction["rulerOfficerId"]
	var ruler_officer: Dictionary = candidate_data["officers"][ruler_officer_id]
	if not _is_integer(ruler_officer.get("sourceId")):
		return _failure("snapshot player ruler sourceId must be an integer")
	var period_id: int = int(state_scenario["period"])
	var loaded: Dictionary = _production_bundle
	if loaded.is_empty() or int(loaded.get("periodId", -1)) != period_id:
		loaded = ProductionDataRepository.load_period(period_id)
	if not loaded["ok"]:
		return _failure("production campaign data failed validation: %s" % loaded["error"])
	var production_scenario: Dictionary = loaded["envelope"]["scenario"]
	var catalog_state_scenario: Dictionary = (loaded["state"] as GameState).snapshot()["scenario"]
	if state_scenario != catalog_state_scenario:
		return _failure("snapshot scenario identity does not match the production catalog")
	# The candidate identifies the immutable campaign origin. A legal succession
	# changes the current ruler, so restore must bind by player faction instead of
	# requiring the current ruler to still be the period's initial candidate.
	var matched_candidate: Dictionary = {}
	for raw_candidate: Variant in production_scenario["playerCandidates"]:
		var candidate: Dictionary = raw_candidate
		if candidate["factionId"] == player_faction_id:
			matched_candidate = candidate
			break
	if matched_candidate.is_empty():
		return _failure("snapshot player faction is not a production campaign candidate")
	var next_state: GameState = GameState.new(candidate_data)
	var next_campaign: Dictionary = {
		"productionDataContractVersion": int(candidate_data["dataContractVersion"]),
		"periodId": period_id,
		"title": production_scenario["title"],
		"rulerSourceIndex": int(matched_candidate["sourceIndex"]),
		"playerFactionId": player_faction_id,
		"rulerOfficerId": ruler_officer_id,
		"rulerName": ruler_officer["name"],
	}
	if campaign_hint != null:
		if not _campaign_matches(campaign_hint, next_campaign):
			return _failure("snapshot campaign descriptor does not match the production state")
	_state = next_state
	_campaign = next_campaign
	_production_bundle = loaded
	_completed_commands.clear()
	_completed_command_order.clear()
	_compat_command_serial = 0
	return {
		"ok": true,
		"error": "",
		"campaign": campaign_descriptor(),
		"stateSha256": digest["value"],
		"state": snapshot(),
	}


func execute_command(raw_envelope: Variant) -> Dictionary:
	var before_state: Dictionary = snapshot()
	var before_digest: String = state_sha256()
	if _state == null:
		return _command_failure(raw_envelope, "session_not_started", "campaign session has not started", before_digest)
	var validation: Dictionary = CommandDispatcher.validate_envelope(raw_envelope)
	if not validation["ok"]:
		return _command_failure(raw_envelope, validation["code"], validation["error"], before_digest)
	var envelope: Dictionary = validation["envelope"]
	var command_id: String = envelope["commandId"]
	var request_digest_result: Dictionary = CanonicalJson.try_sha256(envelope)
	if not request_digest_result["ok"]:
		return _command_failure(envelope, "invalid_envelope", request_digest_result["error"], before_digest)
	var request_digest: String = request_digest_result["value"]
	if _completed_commands.has(command_id):
		var completed: Dictionary = _completed_commands[command_id]
		if completed["requestSha256"] == request_digest:
			var cached_core: Dictionary = completed["resultCore"]
			if cached_core["afterStateSha256"] == before_digest:
				var cached_result: Dictionary = cached_core.duplicate(true)
				cached_result["state"] = before_state
				return cached_result
			var already_committed: Dictionary = _command_result_base(envelope, true, "already_committed", "")
			already_committed["stateChanged"] = false
			already_committed["beforeStateSha256"] = before_digest
			already_committed["afterStateSha256"] = before_digest
			already_committed["receipt"] = (cached_core["receipt"] as Dictionary).duplicate(true)
			already_committed["state"] = before_state
			return already_committed
		return _command_failure(
			envelope, "command_id_conflict", "commandId was already used for a different request", before_digest
		)
	if envelope["expectedStateSha256"] != before_digest:
		return _command_failure(envelope, "stale_state", "expectedStateSha256 does not match current state", before_digest)

	var domain_result: Dictionary = CommandDispatcher.dispatch(_state, envelope)
	if typeof(domain_result) != TYPE_DICTIONARY \
			or typeof(domain_result.get("ok")) != TYPE_BOOL \
			or typeof(domain_result.get("error")) != TYPE_STRING:
		return _command_failure(envelope, "invalid_adapter_result", "command adapter returned an invalid result", before_digest)
	if not domain_result["ok"]:
		return _command_failure(envelope, "domain_rejected", domain_result["error"], before_digest)
	if not domain_result.has("next_state") \
			or not domain_result["next_state"] is GameState \
			or typeof(domain_result.get("receipt")) != TYPE_DICTIONARY:
		return _command_failure(envelope, "invalid_adapter_result", "successful command adapter result is incomplete", before_digest)
	var next_state: GameState = domain_result["next_state"]
	var next_snapshot: Dictionary = next_state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(next_snapshot)
	if not issues.is_empty():
		return _command_failure(
			envelope, "invalid_next_state", Validator.first_error(issues), before_digest
		)
	var after_digest_result: Dictionary = CanonicalJson.try_sha256(next_snapshot)
	if not after_digest_result["ok"]:
		return _command_failure(envelope, "invalid_next_state", after_digest_result["error"], before_digest)

	if envelope["kind"] == "settle_tactical_battle" and not bool(_campaign.get("legacySpike", false)):
		var settlement_receipt: Dictionary = domain_result["receipt"]
		var settlement: Dictionary = envelope["parameters"].get("battleResult", {})
		var binding_order: Dictionary = {
			"sourceCityId": settlement.get("sourceCityId", ""),
			"targetCityId": settlement.get("targetCityId", ""),
			"officerIds": (settlement.get("attackerOfficerIds", []) as Array).duplicate(true),
			"provisions": settlement.get("provisions", 0),
		}
		var binding_resume: Dictionary = _recovery_resume_for_state(before_state)
		var binding_fingerprint := String((settlement.get("guard", {}) as Dictionary).get("strategicFingerprint", ""))
		var committed_recovery: Dictionary = _recovery_repository.save_committed(
			next_state, _campaign, String(settlement_receipt.get("battleId", "")), "战后已提交", "",
			binding_order, binding_resume, binding_fingerprint, before_state, _repository.current_save_revision(),
			settlement.duplicate(true),
		)
		if not committed_recovery["ok"]:
			return _command_failure(envelope, "persistence_failed", committed_recovery["error"], before_digest)
	_state = next_state
	if envelope["kind"] == "resolve_succession":
		var successor_id := String((domain_result["receipt"] as Dictionary).get("successorOfficerId", ""))
		var successor: Dictionary = next_snapshot.get("officers", {}).get(successor_id, {})
		if not successor.is_empty():
			_campaign["rulerOfficerId"] = successor_id
			_campaign["rulerName"] = String(successor.get("name", ""))
	var result: Dictionary = _command_result_base(envelope, true, "ok", "")
	result["stateChanged"] = after_digest_result["value"] != before_digest
	result["beforeStateSha256"] = before_digest
	result["afterStateSha256"] = after_digest_result["value"]
	result["receipt"] = (domain_result["receipt"] as Dictionary).duplicate(true)
	result["state"] = next_snapshot
	var result_core: Dictionary = result.duplicate(true)
	result_core.erase("state")
	if _completed_command_order.size() >= IDEMPOTENCY_WINDOW_LIMIT:
		var evicted_id: String = _completed_command_order.pop_front()
		_completed_commands.erase(evicted_id)
	_completed_command_order.append(command_id)
	_completed_commands[command_id] = {
		"requestSha256": request_digest,
		"resultCore": result_core,
	}
	return result.duplicate(true)


func execute_develop_farming(city_id: String, officer_id: String) -> Dictionary:
	_compat_command_serial += 1
	var result: Dictionary = execute_command({
		"commandEnvelopeVersion": 1,
		"commandId": "compat-develop-%06d" % _compat_command_serial,
		"expectedStateSha256": state_sha256(),
		"kind": "develop_farming",
		"parameters": {"cityId": city_id, "officerId": officer_id},
	})
	return {
		"ok": result["ok"],
		"error": result["error"],
		"receipt": (result.get("receipt", {}) as Dictionary).duplicate(true),
		"state": (result.get("state", snapshot()) as Dictionary).duplicate(true),
	}


func city_query(city_id: String) -> Dictionary:
	if _state == null:
		return {"found": false, "city": {}, "developFarming": {"allowed": false, "reason": "尚未载入战役"}}
	return GameSessionQueries.city(_state, city_id)


func internal_affairs_query(city_id: String) -> Dictionary:
	if _state == null:
		return {"found": false, "city": {}, "internalAffairs": []}
	return GameSessionQueries.internal_affairs_city(_state, city_id)


func officer_management_query(city_id: String) -> Dictionary:
	if _state == null:
		return {"found": false, "city": {}, "officerManagement": {}}
	return GameSessionQueries.officer_management_city(_state, city_id)


func personnel_lifecycle_query(city_id: String) -> Dictionary:
	if _state == null:
		return {"found": false, "city": {}, "personnelLifecycle": {}}
	return GameSessionQueries.personnel_lifecycle_city(_state, city_id)


func strategic_logistics_query(city_id: String) -> Dictionary:
	if _state == null:
		return {"found": false, "city": {}, "strategicLogistics": {}}
	return GameSessionQueries.strategic_logistics_city(_state, city_id)


func reconnaissance_query(source_city_id: String) -> Dictionary:
	if _state == null:
		return {"found": false, "sourceCity": {}, "reconnaissance": {}, "visibility": {"found": false}}
	return GameSessionQueries.reconnaissance_city(_state, source_city_id)


func diplomacy_query(source_city_id: String) -> Dictionary:
	if _state == null:
		return {"found": false, "sourceCity": {}, "diplomacy": {}}
	return GameSessionQueries.diplomacy_city(_state, source_city_id)


func city_visibility_query(city_id: String) -> Dictionary:
	if _state == null: return {"found": false, "knowledge": "unknown"}
	return GameSessionQueries.city_visibility(_state, city_id)


func advance_strategic_orders() -> Dictionary:
	return _advance_campaign_orders("advance_strategic_orders")


func advance_diplomatic_orders() -> Dictionary:
	return _advance_campaign_orders("advance_diplomatic_orders")


func settle_city_events() -> Dictionary:
	if _state == null: return _progression_not_started("settle_city_events")
	return _apply_progression_result(CalendarEvents.settle_city_events(_state), "settle_city_events")


func settle_annual_progression(previous_calendar: Dictionary) -> Dictionary:
	if _state == null: return _progression_not_started("settle_annual_progression")
	return _apply_progression_result(
		AnnualProgression.settle(_state, previous_calendar), "settle_annual_progression"
	)


func settle_captive_escapes() -> Dictionary:
	if _state == null: return _progression_not_started("settle_captive_escapes")
	return _apply_progression_result(
		OfficerLifecycle.settle_captive_escapes(_state), "settle_captive_escapes"
	)


func settle_natural_deaths() -> Dictionary:
	if _state == null: return _progression_not_started("settle_natural_deaths")
	return _apply_progression_result(
		OfficerLifecycle.settle_natural_deaths(_state), "settle_natural_deaths"
	)


func evaluate_campaign_outcome() -> Dictionary:
	if _state == null: return _progression_not_started("evaluate_outcome")
	return _apply_progression_result(CampaignOutcome.evaluate(_state), "evaluate_outcome", true)


func advance_turn_month(raw_envelope: Variant = null) -> Dictionary:
	var envelope: Variant = raw_envelope
	if envelope == null:
		_compat_command_serial += 1
		envelope = {
			"commandEnvelopeVersion": 1,
			"commandId": "compat-advance-turn-%06d" % _compat_command_serial,
			"expectedStateSha256": state_sha256(),
			"kind": "advance_turn_month",
			"parameters": {},
		}
	return execute_command(envelope)


func continue_ai_turn(raw_envelope: Variant = null) -> Dictionary:
	return advance_turn_month(raw_envelope)


## Deterministic, explicitly labeled acceptance states for the MB11 technical
## sample. This resets period 1 and never enters production campaign data.
func start_mb11_acceptance_demo(kind: String) -> Dictionary:
	if not ["city_event", "succession", "victory"].has(kind):
		return _failure("unknown MB11 acceptance demo: %s" % kind)
	var started: Dictionary = start_campaign(1, 1)
	if not started["ok"]: return started
	var input: Dictionary = snapshot()
	if kind == "city_event":
		for raw_city_id: Variant in input["cityOrder"]:
			var city_id: String = str(raw_city_id)
			var faction: Dictionary = input["factions"].get(input["cities"][city_id]["ownerId"], {})
			if faction.is_empty() or bool(faction.get("isNeutral", false)): continue
			input["cities"][city_id]["condition"] = "normal"
			input["cities"][city_id]["disasterPrevention"] = 100
			input["cities"][city_id]["publicLoyalty"] = 100
		input["cities"]["city-12"]["condition"] = "flood"
		input["cities"]["city-12"]["disasterPrevention"] = 0
		for field: String in ["farming", "commerce", "money", "food", "reserveTroops", "population"]:
			input["cities"]["city-12"][field] = 101
		_state = GameState.new(input)
		return settle_city_events()
	if kind == "succession":
		input["lifecyclePolicy"]["naturalDeath"] = "age-90-coinflip"
		input["rngSeed"] = 1972
		input["officers"]["officer-1"]["age"] = 90
		_state = GameState.new(input)
		return settle_natural_deaths()
	for raw_city_id: Variant in input["cityOrder"]:
		var city_id: String = str(raw_city_id)
		input["cities"][city_id]["ownerId"] = input["playerFactionId"]
		input["cities"][city_id].erase("satrapOfficerId")
	_state = GameState.new(input)
	return evaluate_campaign_outcome()


func _progression_not_started(kind: String) -> Dictionary:
	return {"ok": false, "error": "campaign session has not started", "stateChanged": false,
		"beforeStateSha256": "", "afterStateSha256": "", "receipt": {"kind": kind}, "state": {}}


func _apply_progression_result(
		domain_result: Dictionary, kind: String, allow_succession: bool = false
) -> Dictionary:
	var before: Dictionary = snapshot()
	var before_digest: String = state_sha256()
	if _state == null:
		return {"ok": false, "error": "campaign session has not started", "stateChanged": false,
			"beforeStateSha256": before_digest, "afterStateSha256": before_digest,
			"receipt": {}, "state": before}
	if before.get("phase", "") == "ended":
		return {"ok": true, "error": "", "stateChanged": false,
			"beforeStateSha256": before_digest, "afterStateSha256": before_digest,
			"receipt": {"kind": kind, "skipped": "campaign-ended"}, "state": before}
	if before.get("phase", "") == "succession" and not allow_succession:
		return {"ok": false, "error": "必须先拥立新君", "stateChanged": false,
			"beforeStateSha256": before_digest, "afterStateSha256": before_digest,
			"receipt": {}, "state": before}
	if not domain_result.get("ok", false):
		return {"ok": false, "error": domain_result.get("error", "progression failed"), "stateChanged": false,
			"beforeStateSha256": before_digest, "afterStateSha256": before_digest,
			"receipt": {}, "state": before}
	var next_state: GameState = domain_result["next_state"]
	var next_snapshot: Dictionary = next_state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(next_snapshot)
	if not issues.is_empty():
		return {"ok": false, "error": Validator.first_error(issues), "stateChanged": false,
			"beforeStateSha256": before_digest, "afterStateSha256": before_digest,
			"receipt": {}, "state": before}
	var digest: Dictionary = CanonicalJson.try_sha256(next_snapshot)
	if not digest["ok"]:
		return {"ok": false, "error": digest["error"], "stateChanged": false,
			"beforeStateSha256": before_digest, "afterStateSha256": before_digest,
			"receipt": {}, "state": before}
	_state = next_state
	return {"ok": true, "error": "", "stateChanged": digest["value"] != before_digest,
		"beforeStateSha256": before_digest, "afterStateSha256": digest["value"],
		"receipt": (domain_result["receipt"] as Dictionary).duplicate(true), "state": next_snapshot}


func _advance_campaign_orders(receipt_kind: String) -> Dictionary:
	var before: Dictionary = snapshot()
	var before_digest: String = state_sha256()
	if _state == null:
		return {"ok": false, "error": "campaign session has not started", "stateChanged": false,
			"beforeStateSha256": before_digest, "afterStateSha256": before_digest,
			"receipt": {}, "state": before}
	if before.get("phase", "") == "ended":
		return {"ok": true, "error": "", "stateChanged": false,
			"beforeStateSha256": before_digest, "afterStateSha256": before_digest,
			"receipt": {"kind": receipt_kind, "skipped": "campaign-ended"}, "state": before}
	if before.get("phase", "") == "succession":
		return {"ok": false, "error": "必须先拥立新君", "stateChanged": false,
			"beforeStateSha256": before_digest, "afterStateSha256": before_digest,
			"receipt": {}, "state": before}
	var StrategicOrders = preload("res://src/domain/commands/strategic_order_commands.gd")
	var DiplomaticOrders = preload("res://src/domain/commands/diplomatic_order_commands.gd")
	var settling: Dictionary = before.duplicate(true)
	settling["turn"] = int(before["turn"]) + 1
	var calendar: Dictionary = before["calendar"]
	settling["calendar"] = {"year": int(calendar["year"]) + 1, "month": 1} \
			if int(calendar["month"]) == 12 else {"year": int(calendar["year"]), "month": int(calendar["month"]) + 1}
	settling["phase"] = "player"
	settling["activeFactionId"] = before["playerFactionId"]
	settling["actedOfficerIds"] = []
	# Both order families observe one shared month boundary. Their deterministic
	# settlement order is fixed here; validation happens only after both finish.
	var strategic_result: Dictionary = StrategicOrders.advance(GameState.new(settling), false)
	if not strategic_result["ok"]:
		return {"ok": false, "error": strategic_result["error"], "stateChanged": false,
			"beforeStateSha256": before_digest, "afterStateSha256": before_digest,
			"receipt": {}, "state": before}
	var diplomatic_result: Dictionary = DiplomaticOrders.advance(strategic_result["next_state"], false)
	if not diplomatic_result["ok"]:
		return {"ok": false, "error": diplomatic_result["error"], "stateChanged": false,
			"beforeStateSha256": before_digest, "afterStateSha256": before_digest,
			"receipt": {}, "state": before}
	var next_state: GameState = diplomatic_result["next_state"]
	var next_snapshot: Dictionary = next_state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(next_snapshot)
	if not issues.is_empty():
		return {"ok": false, "error": Validator.first_error(issues), "stateChanged": false,
			"beforeStateSha256": before_digest, "afterStateSha256": before_digest,
			"receipt": {}, "state": before}
	var digest: Dictionary = CanonicalJson.try_sha256(next_snapshot)
	if not digest["ok"]:
		return {"ok": false, "error": digest["error"], "stateChanged": false,
			"beforeStateSha256": before_digest, "afterStateSha256": before_digest,
			"receipt": {}, "state": before}
	_state = next_state
	return {"ok": true, "error": "", "stateChanged": digest["value"] != before_digest,
		"beforeStateSha256": before_digest, "afterStateSha256": digest["value"],
		"receipt": _advance_orders_receipt(before, next_snapshot, receipt_kind),
		"state": next_snapshot}


func _advance_orders_receipt(before: Dictionary, after: Dictionary, kind: String) -> Dictionary:
	var record_name: String = "diplomaticOrders" if kind == "advance_diplomatic_orders" else "strategicOrders"
	var before_ids: Array[String] = []
	for raw_id: Variant in (before[record_name] as Dictionary).keys(): before_ids.append(str(raw_id))
	var after_ids: Array[String] = []
	for raw_id: Variant in (after[record_name] as Dictionary).keys(): after_ids.append(str(raw_id))
	if record_name == "diplomaticOrders":
		before_ids.sort_custom(_less_diplomatic_order_id)
		after_ids.sort_custom(_less_diplomatic_order_id)
	else:
		before_ids.sort()
		after_ids.sort()
	var completed_ids: Array[String] = []
	for order_id: String in before_ids:
		if not (after[record_name] as Dictionary).has(order_id): completed_ids.append(order_id)
	var active_orders: Array[Dictionary] = []
	for order_id: String in after_ids:
		active_orders.append((after[record_name][order_id] as Dictionary).duplicate(true))
	return {
		"kind": kind,
		"state": {"turn": after["turn"], "rngSeed": after["rngSeed"],
			"campaignStarted": after["campaignStarted"],
			"actedOfficerIds": (after["actedOfficerIds"] as Array).duplicate(true),
			"logCount": (after["logs"] as Array).size()},
		"completedOrderIds": completed_ids,
		"activeOrders": active_orders,
		"appendedLogs": (after["logs"] as Array).slice((before["logs"] as Array).size()).duplicate(true),
	}


func _less_diplomatic_order_id(left: String, right: String) -> bool:
	var left_serial: int = int(left.trim_prefix("diplomatic-order-"))
	var right_serial: int = int(right.trim_prefix("diplomatic-order-"))
	return left < right if left_serial == right_serial else left_serial < right_serial


func save_game() -> Dictionary:
	if _state == null:
		return _failure("尚未载入战役")
	if bool(_campaign.get("legacySpike", false)):
		var spike_result: Dictionary = _repository.save(_state, "Godot migration spike")
		if not spike_result["ok"]:
			return spike_result
		var spike_recovery_cleanup := _clear_committed_recovery_after_save()
		if not spike_recovery_cleanup["ok"]:
			return spike_recovery_cleanup
		return {"ok": true, "error": "", "path": spike_result["path"], "envelope": spike_result["envelope"], "state": snapshot()}
	var result: Dictionary = _repository.save_production(_state, _campaign, "Godot production campaign")
	if not result["ok"]:
		return result
	var recovery_cleanup := _clear_committed_recovery_after_save()
	if not recovery_cleanup["ok"]:
		return recovery_cleanup
	return {"ok": true, "error": "", "path": result["path"], "envelope": result["envelope"], "state": snapshot()}


func save_battle_recovery_pending(order: Dictionary, resume: Dictionary, label: String = "", saved_at: String = "") -> Dictionary:
	if _state == null: return _failure("尚未载入战役")
	if bool(_campaign.get("legacySpike", false)): return _failure("战斗恢复只支持生产战役")
	return _recovery_repository.save_pending(_state, _campaign, order, resume, label, saved_at, _repository.current_save_revision())


func save_battle_recovery_committed(
	battle_id: String,
	label: String = "",
	saved_at: String = "",
	order: Dictionary = {},
	resume: Dictionary = {},
	strategic_fingerprint: String = "",
	source_state: Dictionary = {},
	parent_save_revision: int = -1,
	settlement_result: Dictionary = {},
) -> Dictionary:
	if _state == null: return _failure("尚未载入战役")
	if bool(_campaign.get("legacySpike", false)): return _failure("战斗恢复只支持生产战役")
	return _recovery_repository.save_committed(
		_state, _campaign, battle_id, label, saved_at, order, resume, strategic_fingerprint, source_state,
		_repository.current_save_revision() if parent_save_revision < 0 else parent_save_revision, settlement_result
	)


func load_battle_recovery() -> Dictionary:
	return _recovery_repository.load()


func clear_battle_recovery() -> Dictionary:
	return _recovery_repository.clear()


func resume_battle_recovery() -> Dictionary:
	var recovery: Dictionary = _recovery_repository.load()
	if not recovery["ok"] or not recovery.get("found", false): return recovery
	if recovery.has("recoveryPromotionError"):
		return _failure(String(recovery["recoveryPromotionError"]))
	var recovery_digest: Dictionary = CanonicalJson.try_sha256(recovery["state"])
	if not recovery_digest["ok"]:
		return _failure("战斗恢复状态无法计算摘要")
	if _state == null:
		# A cold process must not let an old committed marker roll back a newer
		# main save. If the main save is unavailable/corrupt, recovery remains a
		# valid last-resort source of truth.
		var main_save: Dictionary = _repository.load()
		if main_save.get("ok", false) and main_save.get("state") is GameState:
			var main_digest: Dictionary = CanonicalJson.try_sha256((main_save["state"] as GameState).snapshot())
			if main_digest.get("ok", false) and String(main_digest["value"]) != String(recovery_digest["value"]):
				var main_envelope: Dictionary = main_save.get("envelope", {})
				var recovery_envelope: Dictionary = recovery.get("envelope", {})
				var main_revision := int(main_envelope.get("saveRevision", 0))
				var parent_revision := int(recovery_envelope.get("parentSaveRevision", 0))
				if main_revision > parent_revision:
					return _failure("主存档已包含更新状态，拒绝回滚战斗恢复记录")
	if _state != null:
		if String(recovery_digest["value"]) != state_sha256():
			var main_save_for_warm_resume: Dictionary = _repository.load()
			var main_is_current_baseline := false
			if main_save_for_warm_resume.get("ok", false) and main_save_for_warm_resume.get("state") is GameState:
				var main_state_digest: Dictionary = CanonicalJson.try_sha256((main_save_for_warm_resume["state"] as GameState).snapshot())
				main_is_current_baseline = main_state_digest.get("ok", false) \
						and String(main_state_digest["value"]) == state_sha256()
			var main_revision := int(main_save_for_warm_resume.get("envelope", {}).get("saveRevision", 0))
			var parent_revision := int(recovery.get("envelope", {}).get("parentSaveRevision", 0))
			if not main_is_current_baseline or main_revision > parent_revision:
				return _failure("当前 session 已包含更新状态，拒绝覆盖战斗恢复记录")
	var envelope: Dictionary = recovery.get("envelope", {})
	var strategic_save: Dictionary = envelope.get("strategicSave", {})
	var restored: Dictionary = restore_snapshot(recovery["state"], strategic_save.get("campaign", null))
	if not restored["ok"]: return restored
	if recovery["status"] == "committed":
		return {"ok": true, "error": "", "code": "already_committed", "status": "committed", "stateChanged": false, "state": snapshot(), "battleId": recovery["battleId"]}
	return {"ok": true, "error": "", "code": "resumed", "status": "pending", "stateChanged": false, "state": snapshot(), "battleId": recovery["battleId"], "order": recovery["order"], "resume": recovery["resume"]}


func load_game() -> Dictionary:
	var result: Dictionary = _repository.load()
	if not result["ok"]:
		return result
	if result.has("recoveryPromotionError"):
		return _failure(String(result["recoveryPromotionError"]))
	var envelope: Dictionary = result.get("envelope", {})
	if envelope.get("format", "") == SaveRepository.SAVE_FORMAT:
		return _load_spike_result(result)
	var previous_state: GameState = _state
	var previous_campaign: Dictionary = _campaign.duplicate(true)
	var previous_bundle: Dictionary = _production_bundle
	var previous_completed: Dictionary = _completed_commands.duplicate(true)
	var previous_completed_order: Array[String] = _completed_command_order.duplicate()
	var previous_serial: int = _compat_command_serial
	var campaign_hint: Variant = envelope.get("campaign", null)
	var restored: Dictionary = restore_snapshot((result["state"] as GameState).snapshot(), campaign_hint)
	if not restored["ok"]:
		return restored
	var normalized_envelope: Dictionary = envelope.duplicate(true)
	if bool(result.get("migrated", false)):
		var migrated: Dictionary = _repository.create_production_envelope(
			_state, _campaign, String(envelope.get("label", "迁移的旧版生产存档")), String(envelope.get("savedAt", ""))
		)
		if not migrated["ok"]:
			_state = previous_state
			_campaign = previous_campaign
			_production_bundle = previous_bundle
			_completed_commands = previous_completed
			_completed_command_order = previous_completed_order
			_compat_command_serial = previous_serial
			return migrated
		normalized_envelope = migrated["envelope"]
	return {
		"ok": true,
		"error": "",
		"path": result["path"],
		"envelope": normalized_envelope,
		"migrated": bool(result.get("migrated", false)),
		"campaign": campaign_descriptor(),
		"recoveredFrom": result.get("recoveredFrom", ""),
		"state": snapshot(),
	}


func load_spike_game() -> Dictionary:
	var result: Dictionary = _repository.load()
	if not result["ok"]:
		return result
	if result.get("envelope", {}).get("format", "") != SaveRepository.SAVE_FORMAT:
		return _failure("load_spike_game requires the legacy spike save format")
	return _load_spike_result(result)


func _clear_committed_recovery_after_save() -> Dictionary:
	var recovery: Dictionary = _recovery_repository.load()
	if not recovery.get("ok", false) or not recovery.get("found", false):
		return {"ok": true, "error": ""}
	if recovery.get("status", "") != "committed":
		return {"ok": true, "error": ""}
	# The successful main save is authoritative. A committed marker from an
	# earlier state is stale once the player has continued and saved again; it
	# must not survive into a cold-start recovery-first path.
	var cleared := _recovery_repository.clear()
	if not cleared.get("ok", false):
		return _failure("主存档已写入，但战斗提交标记清理失败：%s" % cleared.get("error", ""))
	return {"ok": true, "error": ""}


func _load_spike_result(result: Dictionary) -> Dictionary:
	_state = result["state"]
	_campaign = {"periodId": 1, "legacySpike": true, "restoredFromSpikeSave": true, "playerFactionId": snapshot()["playerFactionId"]}
	_completed_commands.clear()
	_completed_command_order.clear()
	_compat_command_serial = 0
	return {"ok": true, "error": "", "path": result["path"], "envelope": result["envelope"], "state": snapshot()}


func find_default_executor(city_id: String) -> String:
	if _state == null:
		return ""
	return GameSessionQueries.find_default_executor(_state, city_id)


func _command_failure(raw: Variant, code: String, error: String, digest: String) -> Dictionary:
	var result: Dictionary = _command_result_base(raw, false, code, error)
	result["stateChanged"] = false
	result["beforeStateSha256"] = digest
	result["afterStateSha256"] = digest
	result["receipt"] = {}
	result["state"] = snapshot()
	return result


func _command_result_base(raw: Variant, ok: bool, code: String, error: String) -> Dictionary:
	var envelope: Dictionary = raw if typeof(raw) == TYPE_DICTIONARY else {}
	return {
		"resultEnvelopeVersion": RESULT_ENVELOPE_VERSION,
		"commandEnvelopeVersion": envelope.get("commandEnvelopeVersion", null),
		"commandId": envelope.get("commandId", ""),
		"kind": envelope.get("kind", ""),
		"ok": ok,
		"code": code,
		"error": error,
	}


func _success_with_state() -> Dictionary:
	return {"ok": true, "error": "", "state": snapshot()}


func _failure(reason: String) -> Dictionary:
	return {"ok": false, "error": reason, "state": snapshot()}


func _is_integer(raw: Variant) -> bool:
	return (typeof(raw) == TYPE_INT or typeof(raw) == TYPE_FLOAT) \
			and is_finite(float(raw)) \
			and floor(float(raw)) == float(raw)


func _campaign_matches(raw: Variant, expected: Dictionary) -> bool:
	if typeof(raw) != TYPE_DICTIONARY:
		return false
	var actual: Dictionary = raw
	var keys: Array[String] = [
		"productionDataContractVersion", "periodId", "title", "rulerSourceIndex",
		"playerFactionId", "rulerOfficerId", "rulerName",
	]
	if actual.size() != keys.size():
		return false
	for key: String in keys:
		if not actual.has(key) or not expected.has(key):
			return false
	for key: String in ["productionDataContractVersion", "periodId", "rulerSourceIndex"]:
		if not _is_integer(actual[key]) or int(actual[key]) != int(expected[key]):
			return false
	for key: String in ["title", "playerFactionId", "rulerOfficerId", "rulerName"]:
		if typeof(actual[key]) != TYPE_STRING or String(actual[key]) != String(expected[key]):
			return false
	return true


func _recovery_resume_for_state(state_data: Dictionary) -> Dictionary:
	if state_data.get("phase", "") == "player":
		return {"kind": "player-phase"}
	if state_data.get("phase", "") == "ai":
		var faction_order: Array = state_data.get("factionOrder", [])
		return {"kind": "ai-phase", "nextFactionIndex": faction_order.find(state_data.get("activeFactionId")) + 1}
	return {}
