class_name GameSession
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const CanonicalJson = preload("res://src/domain/validation/canonical_json.gd")
const CommandDispatcher = preload("res://src/application/commands/command_dispatcher.gd")
const ProductionDataRepository = preload("res://src/application/game_session/production_data_repository.gd")
const GameSessionQueries = preload("res://src/application/game_session/game_session_queries.gd")
const SaveRepository = preload("res://src/application/persistence/json_save_repository.gd")

const DEFAULT_PERIOD_PATH: String = "res://data/period-1.json"
const DEFAULT_SAVE_PATH: String = "user://godot-spike-save.json"
const RESULT_ENVELOPE_VERSION: int = 1

var _state: GameState
var _repository: SaveRepository
var _campaign: Dictionary = {}
var _completed_commands: Dictionary = {}
var _compat_command_serial: int = 0
var _production_bundle: Dictionary = {}


func _init(save_path: String = DEFAULT_SAVE_PATH) -> void:
	_repository = SaveRepository.new(save_path)


func start_campaign(period_id: Variant, ruler_source_index: Variant) -> Dictionary:
	if not _is_integer(period_id) or not _is_integer(ruler_source_index):
		return _failure("periodId and rulerSourceIndex must be integers")
	var loaded: Dictionary = _production_bundle
	if loaded.is_empty():
		loaded = ProductionDataRepository.load_all()
	if not loaded["ok"]:
		return _failure("production campaign data failed validation: %s" % loaded["error"])
	_production_bundle = loaded
	var normalized_period_id: int = int(period_id)
	var states: Dictionary = loaded["states"]
	var envelopes: Dictionary = loaded["envelopes"]
	if not states.has(normalized_period_id) or not envelopes.has(normalized_period_id):
		return _failure("unknown production period: %d" % normalized_period_id)

	var envelope: Dictionary = envelopes[normalized_period_id]
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

	var initial_state: GameState = states[normalized_period_id]
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
	var issues: Array[Dictionary] = Validator.validate(candidate_data)
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
			return (completed["result"] as Dictionary).duplicate(true)
		return _command_failure(
			envelope, "command_id_conflict", "commandId was already used for a different request", before_digest
		)
	if envelope["expectedStateSha256"] != before_digest:
		return _command_failure(envelope, "stale_state", "expectedStateSha256 does not match current state", before_digest)

	var domain_result: Dictionary = CommandDispatcher.dispatch(_state, envelope)
	if not domain_result["ok"]:
		return _command_failure(envelope, "domain_rejected", domain_result["error"], before_digest)
	var next_state: GameState = domain_result["next_state"]
	var next_snapshot: Dictionary = next_state.snapshot()
	var issues: Array[Dictionary] = Validator.validate(next_snapshot)
	if not issues.is_empty():
		return _command_failure(
			envelope, "invalid_next_state", Validator.first_error(issues), before_digest
		)
	var after_digest_result: Dictionary = CanonicalJson.try_sha256(next_snapshot)
	if not after_digest_result["ok"]:
		return _command_failure(envelope, "invalid_next_state", after_digest_result["error"], before_digest)

	_state = next_state
	var result: Dictionary = _command_result_base(envelope, true, "ok", "")
	result["stateChanged"] = true
	result["beforeStateSha256"] = before_digest
	result["afterStateSha256"] = after_digest_result["value"]
	result["receipt"] = (domain_result["receipt"] as Dictionary).duplicate(true)
	result["state"] = next_snapshot
	_completed_commands[command_id] = {
		"requestSha256": request_digest,
		"result": result.duplicate(true),
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


func save_game() -> Dictionary:
	if _state == null:
		return _failure("尚未载入战役")
	var result: Dictionary = _repository.save(_state, "Godot migration spike")
	if not result["ok"]:
		return result
	return {"ok": true, "error": "", "path": result["path"], "envelope": result["envelope"], "state": snapshot()}


func load_game() -> Dictionary:
	var result: Dictionary = _repository.load()
	if not result["ok"]:
		return result
	_state = result["state"]
	_campaign = {"periodId": 1, "legacySpikeSave": true, "playerFactionId": snapshot()["playerFactionId"]}
	_completed_commands.clear()
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
	return (typeof(raw) == TYPE_INT or typeof(raw) == TYPE_FLOAT) and floor(float(raw)) == float(raw)
