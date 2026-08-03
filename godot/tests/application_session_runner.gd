extends SceneTree

const CanonicalJson = preload("res://src/domain/validation/canonical_json.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const ProductionDataRepository = preload("res://src/application/game_session/production_data_repository.gd")
const GameSession = preload("res://src/application/game_session/game_session.gd")
const GameState = preload("res://src/domain/game_state/game_state.gd")
const InternalAffairs = preload("res://src/domain/commands/internal_affairs_commands.gd")
const StrategicOrders = preload("res://src/domain/commands/strategic_order_commands.gd")
const CalendarEvents = preload("res://src/domain/progression/calendar_events.gd")
const AnnualProgression = preload("res://src/domain/progression/annual_progression.gd")
const OfficerLifecycle = preload("res://src/domain/progression/officer_lifecycle.gd")
const CampaignOutcome = preload("res://src/domain/progression/campaign_outcome.gd")

const FIXTURE_PATH: String = "res://data/fixtures/application-session-suite-v1.json"

var _assertions: int = 0
var _failures: Array[String] = []


func _initialize() -> void:
	print("[Godot application session] starting")
	_test_all_campaign_candidates()
	_test_transaction_fixture()
	if not _failures.is_empty():
		for failure: String in _failures:
			push_error("[Godot application session] " + failure)
		push_error("[Godot application session] FAILED: %d failure(s), %d assertions" % [_failures.size(), _assertions])
		quit(1)
		return
	print("[Godot application session] PASSED: %d assertions" % _assertions)
	quit(0)


func _test_all_campaign_candidates() -> void:
	var loaded: Dictionary = ProductionDataRepository.load_all()
	_assert_true(loaded["ok"], "production data must load: %s" % loaded.get("error", ""))
	if not loaded["ok"]:
		return
	var session: GameSession = GameSession.new()
	var envelopes: Dictionary = loaded["envelopes"]
	for period_id: int in [1, 2, 3, 4]:
		var envelope: Dictionary = envelopes[period_id]
		var expected_seed: int = int(envelope["state"]["rngSeed"])
		for raw_candidate: Variant in envelope["scenario"]["playerCandidates"]:
			var candidate: Dictionary = raw_candidate
			var started: Dictionary = session.start_campaign(period_id, candidate["sourceIndex"])
			_assert_true(started["ok"], "period %d candidate %s must start: %s" % [period_id, candidate["sourceIndex"], started.get("error", "")])
			if not started["ok"]:
				continue
			var state: Dictionary = session.snapshot()
			_assert_equal(state["rngSeed"], expected_seed, "candidate selection must not consume RNG")
			_assert_equal(state["playerFactionId"], candidate["factionId"], "player faction must match candidate")
			_assert_equal(state["activeFactionId"], candidate["factionId"], "active faction must match candidate")
			_assert_equal(Validator.validate(state), [], "started state must validate")
			var player_count: int = 0
			var faction_ids: Array[String] = []
			for raw_faction_id: Variant in (state["factions"] as Dictionary).keys():
				faction_ids.append(str(raw_faction_id))
			faction_ids.sort()
			for faction_id: String in faction_ids:
				if bool(state["factions"][faction_id].get("isPlayer", false)):
					player_count += 1
			_assert_equal(player_count, 1, "started state must have exactly one player faction")

	var before_invalid: String = session.state_sha256()
	_assert_true(not session.start_campaign(9, 1)["ok"], "unknown period must fail")
	_assert_equal(session.state_sha256(), before_invalid, "unknown period must not mutate active session")
	_assert_true(not session.start_campaign(1, 999)["ok"], "unknown candidate must fail")
	_assert_equal(session.state_sha256(), before_invalid, "unknown candidate must not mutate active session")
	_assert_true(not session.start_campaign("1", 1)["ok"], "wrong period type must fail")
	_assert_equal(session.state_sha256(), before_invalid, "wrong period type must not mutate active session")

	var restarted: Dictionary = session.start_campaign(1, 1)
	_assert_true(restarted["ok"], "query test campaign must start")
	if restarted["ok"]:
		var query_before: String = session.state_sha256()
		var detached: Dictionary = session.snapshot()
		detached["rngSeed"] = 0
		var city_result: Dictionary = session.city_query("city-12")
		_assert_true(city_result["found"], "city query must find city-12")
		_assert_equal(city_result["developFarming"]["defaultOfficerId"], "officer-1", "query must select stable default executor")
		var internal_affairs: Array = city_result["internalAffairs"]
		_assert_equal(internal_affairs.size(), 7, "city query must expose the seven internal-affairs commands")
		var internal_kinds: Array[String] = []
		for raw_command: Variant in internal_affairs:
			internal_kinds.append(str((raw_command as Dictionary)["kind"]))
		_assert_equal(internal_kinds, [
			"develop_farming", "develop_commerce", "govern_city", "inspect_city",
			"trade_food", "banquet_officer", "plunder_city",
		], "internal-affairs query order must be explicit")
		var officer_management: Dictionary = city_result["officerManagement"]
		_assert_equal((officer_management["officers"] as Array).size(), 7, "city query must expose all seven stationed player officers")
		var management_ids: Array[String] = []
		for raw_officer: Variant in officer_management["officers"]:
			management_ids.append(str((raw_officer as Dictionary)["id"]))
		_assert_equal(management_ids, [
			"officer-1", "officer-32", "officer-33", "officer-34",
			"officer-35", "officer-36", "officer-37",
		], "officer-management query order must follow officerOrder")
		_assert_equal(officer_management["inventory"], [], "period 1 player city starts without discovered inventory")
		_assert_equal(officer_management["equipmentLimit"], 2, "query must expose the domain equipment-slot limit")
		_assert_equal(officer_management["appointmentMode"], "automatic", "classic query must expose automatic appointment mode")
		_assert_equal(officer_management["officers"][1]["reward"]["moneyCost"], 100, "query must expose reward cost without presentation duplication")
		_assert_true(
			not bool(officer_management["officers"][1]["appoint"]["allowed"]),
			"classic ruleset query must reject manual satrap appointment"
		)
		_assert_equal(session.state_sha256(), query_before, "snapshot mutation and query must not mutate session")
		_assert_true(not session.save_game()["ok"], "production state must not use the MB01 spike save envelope")
		_assert_equal(session.state_sha256(), query_before, "rejected production save must not mutate session")
		var invalid_snapshot: Dictionary = session.snapshot()
		invalid_snapshot["rngSeed"] = "invalid"
		_assert_true(not session.restore_snapshot(invalid_snapshot)["ok"], "invalid snapshot restore must fail")
		_assert_equal(session.state_sha256(), query_before, "invalid snapshot restore must not mutate session")
		var missing_scenario: Dictionary = session.snapshot()
		missing_scenario.erase("scenario")
		_assert_true(not session.restore_snapshot(missing_scenario)["ok"], "snapshot without scenario must fail")
		_assert_equal(session.state_sha256(), query_before, "missing scenario must not partially restore")
		var missing_source_id: Dictionary = session.snapshot()
		var ruler_id: String = missing_source_id["factions"][missing_source_id["playerFactionId"]]["rulerOfficerId"]
		missing_source_id["officers"][ruler_id].erase("sourceId")
		_assert_true(not session.restore_snapshot(missing_source_id)["ok"], "snapshot without ruler sourceId must fail")
		_assert_equal(session.state_sha256(), query_before, "missing ruler sourceId must not partially restore")
		var wrong_scenario: Dictionary = session.snapshot()
		wrong_scenario["scenario"]["id"] = "wrong-period-id"
		_assert_true(not session.restore_snapshot(wrong_scenario)["ok"], "snapshot with changed scenario identity must fail")
		_assert_equal(session.state_sha256(), query_before, "changed scenario identity must not partially restore")
		var move_bonus_state: Dictionary = session.snapshot()
		(move_bonus_state["cities"]["city-27"]["hiddenItemIds"] as Array).erase("item-23")
		move_bonus_state["officers"]["officer-34"]["equipmentItemIds"] = ["item-23"]
		_assert_true(session.restore_snapshot(move_bonus_state)["ok"], "move-bonus query fixture must restore")
		var move_bonus_query: Dictionary = session.officer_management_query("city-12")["officerManagement"]
		_assert_equal(move_bonus_query["officers"][3]["effectiveMoveBonus"], 2, "query must project effective equipment move bonus")
		_assert_true(session.start_campaign(1, 1)["ok"], "personnel query campaign must restart")
		var personnel_state: Dictionary = session.snapshot()
		personnel_state["discoveredOfficerIds"] = ["officer-126"]
		var captive: Dictionary = personnel_state["officers"]["officer-30"]
		captive["status"] = "captive"
		captive["factionId"] = "neutral"
		captive["cityId"] = "city-12"
		captive["captorFactionId"] = "ruler-1"
		captive["formerFactionId"] = "ruler-0"
		captive["troops"] = 0
		captive["stamina"] = 0
		_assert_true(session.restore_snapshot(personnel_state)["ok"], "personnel query fixture must restore")
		var personnel_before: String = session.state_sha256()
		var personnel: Dictionary = session.personnel_lifecycle_query("city-12")["personnelLifecycle"]
		var personnel_kinds: Array[String] = []
		for raw_command: Variant in personnel["commands"]:
			personnel_kinds.append(str((raw_command as Dictionary)["kind"]))
		_assert_equal(personnel_kinds, [
			"search_city", "recruit_free_officer", "recruit_captive", "release_captive",
			"execute_captive", "banish_officer", "confiscate_equipment",
		], "personnel query command order must be explicit")
		_assert_equal(personnel["commands"][0]["defaultExecutorId"], "officer-1", "personnel query must select stable search executor")
		_assert_equal(personnel["commands"][1]["defaultTargetId"], "officer-126", "personnel query must expose discovered free target")
		_assert_equal(personnel["commands"][2]["defaultTargetId"], "officer-30", "personnel query must expose held captive")
		_assert_equal(personnel["commands"][2]["cost"], {"stamina": 15, "money": 100, "usesAction": true}, "personnel query must expose classic surrender cost")
		_assert_true(
			"降低 20" in personnel["commands"][6]["confirmationTemplate"],
			"personnel query must consume domain-owned confiscation impact text"
		)
		_assert_equal(session.state_sha256(), personnel_before, "personnel query must not mutate session")
		_assert_true(session.start_campaign(1, 1)["ok"], "diplomacy query campaign must restart")
		var recon_result: Dictionary = session.execute_command({
			"commandEnvelopeVersion": 1,
			"commandId": "mb10-query-recon-001",
			"expectedStateSha256": session.state_sha256(),
			"kind": "reconnoitre_city",
			"parameters": {"sourceCityId": "city-12", "targetCityId": "city-0", "officerId": "officer-1"},
		})
		_assert_true(recon_result["ok"], "diplomacy query setup reconnaissance must succeed")
		var diplomacy_before: String = session.state_sha256()
		var diplomacy: Dictionary = session.diplomacy_query("city-12")["diplomacy"]
		var diplomacy_kinds: Array[String] = []
		for raw_command: Variant in diplomacy["commands"]:
			diplomacy_kinds.append(str((raw_command as Dictionary)["kind"]))
		_assert_equal(diplomacy_kinds, [
			"issue_alienate_order", "issue_canvass_order",
			"issue_counterespionage_order", "issue_induce_order",
		], "diplomacy query command order must be explicit")
		_assert_true(not (diplomacy["targets"] as Array).is_empty(), "current report must expose reported diplomacy targets")
		for raw_target: Variant in diplomacy["targets"]:
			var target: Dictionary = raw_target
			for forbidden_key: String in ["loyalty", "intelligence", "cityId", "factionId", "stamina", "troops"]:
				_assert_true(not target.has(forbidden_key), "diplomacy target DTO must not expose live %s" % forbidden_key)
			_assert_equal(target["reportedCityId"], "city-0", "diplomacy target must retain report city evidence")
			_assert_equal(target["observedTurn"], 1, "diplomacy target must retain report turn evidence")
		_assert_equal(diplomacy["commands"][0]["cost"], {"stamina": 20, "money": 50, "usesAction": true}, "classic alienate query cost must match ruleset")
		_assert_equal(diplomacy["commands"][3]["cost"], {"stamina": 10, "money": 50, "usesAction": true}, "classic induce query cost must match ruleset")
		var hostile_diplomacy: Dictionary = session.diplomacy_query("city-0")
		_assert_true(not hostile_diplomacy["found"], "diplomacy query must reject a hostile source city")
		_assert_equal(hostile_diplomacy["sourceCity"], {}, "hostile diplomacy query must not expose live city resources")
		_assert_equal(session.state_sha256(), diplomacy_before, "diplomacy query must not mutate session")
		var stale_report_state: Dictionary = session.snapshot()
		stale_report_state["turn"] = 2
		stale_report_state["calendar"]["month"] = 2
		_assert_true(session.restore_snapshot(stale_report_state)["ok"], "stale diplomacy report state must restore")
		var stale_diplomacy: Dictionary = session.diplomacy_query("city-12")["diplomacy"]
		_assert_equal(stale_diplomacy["targets"], [], "stale report must not expose diplomacy targets")


func _test_transaction_fixture() -> void:
	var fixture: Dictionary = _read_json(FIXTURE_PATH)
	if fixture.is_empty():
		return
	_assert_equal(fixture.get("applicationSessionFixtureVersion"), 1.0, "fixture version must be 1")
	var algorithms: Dictionary = fixture.get("algorithms", {})
	_assert_equal(algorithms.get("canonicalJson"), "canonical-json-v1", "fixture canonical algorithm must be supported")
	_assert_equal(algorithms.get("digest"), "sha256", "fixture digest algorithm must be supported")
	_assert_equal(algorithms.get("numberDomain"), "safe-integer-or-decimal-6-v1", "fixture number domain must be supported")
	var session: GameSession = GameSession.new()
	var campaign: Dictionary = fixture["campaign"]
	var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
	_assert_true(started["ok"], "fixture campaign must start: %s" % started.get("error", ""))
	if not started["ok"]:
		return
	_assert_equal(session.state_sha256(), campaign["initialStateSha256"], "initial state digest must match TypeScript")
	var first_result: Dictionary = {}
	for raw_step: Variant in fixture["steps"]:
		var step: Dictionary = raw_step
		var before_digest: String = session.state_sha256()
		var actual: Dictionary = session.execute_command(step["command"])
		var expected: Dictionary = step["expected"]
		_assert_canonical_equal(actual, expected, "%s result must match TypeScript" % step["id"])
		if step["id"] == "success":
			first_result = actual.duplicate(true)
		if not bool(expected["stateChanged"]):
			_assert_equal(session.state_sha256(), before_digest, "%s failure must not mutate state" % step["id"])
	_assert_equal(session.state_sha256(), fixture["finalStateSha256"], "final state digest must match TypeScript")
	_test_internal_affairs_sequence(fixture, campaign)
	_test_internal_affairs_boundary_cases(fixture, campaign)
	_test_officer_management_sequence(fixture, campaign)
	_test_officer_management_boundary_cases(fixture, campaign)
	_test_personnel_lifecycle_sequence(fixture, campaign)
	_test_personnel_lifecycle_boundary_cases(fixture, campaign)
	_test_strategic_logistics_sequences(fixture, campaign)
	_test_strategic_logistics_boundary_cases(fixture, campaign)
	_test_strategic_route_cases(fixture)
	_test_strategic_lifecycle_cases(fixture)
	_test_reconnaissance_sequence(fixture)
	_test_reconnaissance_boundary_cases(fixture)
	_test_reconnaissance_legacy_report_case(fixture)
	_test_diplomatic_order_sequences(fixture)
	_test_diplomatic_order_boundary_cases(fixture)
	_test_diplomatic_order_settlement_sequences(fixture)
	_test_calendar_event_cases(fixture)
	_test_annual_progression_cases(fixture)
	_test_annual_progression_period_cases(fixture)
	_test_lifecycle_outcome_cases(fixture)
	_test_strategic_turn_cases(fixture)
	_test_validation_cases(fixture, campaign)
	_test_modern_ruleset_case(fixture, campaign)

	var restored: GameSession = GameSession.new()
	var restored_result: Dictionary = restored.restore_snapshot(first_result["state"])
	_assert_true(restored_result["ok"], "snapshot recovery rehearsal must restore a validated snapshot")
	if restored_result["ok"]:
		_assert_equal(restored.state_sha256(), first_result["afterStateSha256"], "restored snapshot digest must match committed state")
		_assert_equal(restored.city_query("city-12")["found"], true, "restored session queries must remain available")
		_assert_equal(restored.campaign_descriptor(), session.campaign_descriptor(), "restored campaign descriptor must match catalog identity")
		var continuation: Dictionary = fixture["restoredContinuation"]
		var continued: Dictionary = restored.execute_command(continuation["command"])
		_assert_canonical_equal(continued, continuation["expected"], "restored session must continue with the TypeScript transaction result")
	var v1_snapshot: Dictionary = _read_json("res://data/period-1.json")
	var before_v1_restore: String = restored.state_sha256()
	_assert_true(not restored.restore_snapshot(v1_snapshot)["ok"], "production restore must reject MB01 v1 snapshots")
	_assert_equal(restored.state_sha256(), before_v1_restore, "rejected v1 restore must not mutate restored session")
	var replayed_session: GameSession = GameSession.new()
	var replayed_start: Dictionary = replayed_session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
	_assert_true(replayed_start["ok"], "fresh-session replay must restart campaign")
	if replayed_start["ok"]:
		var replayed: Dictionary = replayed_session.execute_command(fixture["steps"][0]["command"])
		_assert_canonical_equal(replayed, first_result, "fresh-session replay must reproduce the committed transaction")

	var guarded: GameSession = GameSession.new()
	var guarded_start: Dictionary = guarded.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
	_assert_true(guarded_start["ok"], "canonical failure guard session must start")
	if guarded_start["ok"]:
		var guarded_success: Dictionary = guarded.execute_command(fixture["steps"][0]["command"])
		var guarded_digest: String = guarded.state_sha256()
		var guarded_campaign: Dictionary = guarded.campaign_descriptor()
		var unhashable: Dictionary = guarded.snapshot()
		unhashable["scenario"]["id"] = INF
		_assert_true(not guarded.restore_snapshot(unhashable)["ok"], "unhashable snapshot must fail")
		_assert_equal(guarded.state_sha256(), guarded_digest, "canonical hash failure must not mutate state")
		_assert_equal(guarded.campaign_descriptor(), guarded_campaign, "canonical hash failure must not mutate campaign")
		var duplicate_after_failure: Dictionary = guarded.execute_command(fixture["steps"][0]["command"])
		_assert_canonical_equal(duplicate_after_failure, guarded_success, "canonical hash failure must preserve idempotency cache")


func _test_internal_affairs_sequence(fixture: Dictionary, campaign: Dictionary) -> void:
	var sequence: Dictionary = fixture.get("internalAffairsSequence", {})
	_assert_true(not sequence.is_empty(), "fixture must include the MB05 internal-affairs sequence")
	if sequence.is_empty():
		return
	var session: GameSession = GameSession.new()
	var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
	_assert_true(started["ok"], "internal-affairs sequence campaign must start")
	if not started["ok"]:
		return
	_assert_equal(session.state_sha256(), sequence["initialStateSha256"], "internal-affairs initial digest must match")
	for raw_step: Variant in sequence["steps"]:
		var step: Dictionary = raw_step
		var before_digest: String = session.state_sha256()
		var actual: Dictionary = session.execute_command(step["command"])
		var actual_core: Dictionary = actual.duplicate(true)
		actual_core.erase("state")
		var expected_core: Dictionary = step["expectedCore"]
		_assert_canonical_equal(actual_core, expected_core, "%s internal-affairs result core must match TypeScript" % step["id"])
		_assert_equal(session.state_sha256(), actual["afterStateSha256"], "%s state must match its result digest" % step["id"])
		var returned_state_digest: Dictionary = CanonicalJson.try_sha256(actual["state"])
		_assert_true(returned_state_digest["ok"], "%s returned state must be canonical-hashable" % step["id"])
		if returned_state_digest["ok"]:
			_assert_equal(
				returned_state_digest["value"], step["expectedCore"]["afterStateSha256"],
				"%s returned state payload must match the TypeScript after-state digest" % step["id"]
			)
		if not bool(expected_core["stateChanged"]):
			_assert_equal(session.state_sha256(), before_digest, "%s rejection must not mutate state" % step["id"])
	_assert_equal(session.state_sha256(), sequence["finalStateSha256"], "internal-affairs final state must match TypeScript")


func _test_internal_affairs_boundary_cases(fixture: Dictionary, campaign: Dictionary) -> void:
	var cases: Array = fixture.get("internalAffairsBoundaryCases", [])
	_assert_true(not cases.is_empty(), "fixture must include MB05 boundary cases")
	for raw_case: Variant in cases:
		var test_case: Dictionary = raw_case
		var session: GameSession = GameSession.new()
		var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s boundary campaign must start" % test_case["id"])
		if not started["ok"]:
			continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, test_case["patches"])
		var restored: Dictionary = session.restore_snapshot(input)
		_assert_true(restored["ok"], "%s patched boundary state must restore" % test_case["id"])
		if not restored["ok"]:
			continue
		var actual: Dictionary = session.execute_command(test_case["command"])
		var actual_core: Dictionary = actual.duplicate(true)
		actual_core.erase("state")
		_assert_canonical_equal(
			actual_core, test_case["expectedCore"],
			"%s boundary result core must match TypeScript" % test_case["id"]
		)
		var state_digest: Dictionary = CanonicalJson.try_sha256(actual["state"])
		_assert_true(state_digest["ok"], "%s boundary returned state must hash" % test_case["id"])
		if state_digest["ok"]:
			_assert_equal(
				state_digest["value"], test_case["expectedStateSha256"],
				"%s boundary state must match TypeScript" % test_case["id"]
			)


func _test_officer_management_sequence(fixture: Dictionary, campaign: Dictionary) -> void:
	var sequence: Dictionary = fixture.get("officerManagementSequence", {})
	_assert_true(not sequence.is_empty(), "fixture must include the MB06 officer-management sequence")
	if sequence.is_empty():
		return
	var session: GameSession = GameSession.new()
	var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
	_assert_true(started["ok"], "officer-management sequence campaign must start")
	if not started["ok"]:
		return
	var input: Dictionary = session.snapshot()
	_apply_patches(input, sequence["initialPatches"])
	var restored: Dictionary = session.restore_snapshot(input)
	_assert_true(restored["ok"], "officer-management sequence state must restore: %s" % restored.get("error", ""))
	if not restored["ok"]:
		return
	_assert_equal(session.state_sha256(), sequence["initialStateSha256"], "officer-management initial digest must match")
	for raw_step: Variant in sequence["steps"]:
		var step: Dictionary = raw_step
		var before_digest: String = session.state_sha256()
		var actual: Dictionary = session.execute_command(step["command"])
		var actual_core: Dictionary = actual.duplicate(true)
		actual_core.erase("state")
		var expected_core: Dictionary = step["expectedCore"]
		_assert_canonical_equal(actual_core, expected_core, "%s officer-management result core must match TypeScript" % step["id"])
		var returned_state_digest: Dictionary = CanonicalJson.try_sha256(actual["state"])
		_assert_true(returned_state_digest["ok"], "%s officer-management state must hash" % step["id"])
		if returned_state_digest["ok"]:
			_assert_equal(returned_state_digest["value"], expected_core["afterStateSha256"], "%s officer-management state must match TypeScript" % step["id"])
		if not bool(expected_core["stateChanged"]):
			_assert_equal(session.state_sha256(), before_digest, "%s rejection must not mutate state" % step["id"])
	_assert_equal(session.state_sha256(), sequence["finalStateSha256"], "officer-management final state must match TypeScript")


func _test_officer_management_boundary_cases(fixture: Dictionary, campaign: Dictionary) -> void:
	var cases: Array = fixture.get("officerManagementBoundaryCases", [])
	_assert_true(not cases.is_empty(), "fixture must include MB06 boundary cases")
	for raw_case: Variant in cases:
		var test_case: Dictionary = raw_case
		var session: GameSession = GameSession.new()
		var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s MB06 boundary campaign must start" % test_case["id"])
		if not started["ok"]:
			continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, test_case["patches"])
		var restored: Dictionary = session.restore_snapshot(input)
		_assert_true(restored["ok"], "%s patched MB06 state must restore: %s" % [test_case["id"], restored.get("error", "")])
		if not restored["ok"]:
			continue
		var actual: Dictionary = session.execute_command(test_case["command"])
		var actual_core: Dictionary = actual.duplicate(true)
		actual_core.erase("state")
		_assert_canonical_equal(actual_core, test_case["expectedCore"], "%s MB06 result core must match TypeScript" % test_case["id"])
		var state_digest: Dictionary = CanonicalJson.try_sha256(actual["state"])
		_assert_true(state_digest["ok"], "%s MB06 returned state must hash" % test_case["id"])
		if state_digest["ok"]:
			_assert_equal(state_digest["value"], test_case["expectedStateSha256"], "%s MB06 state must match TypeScript" % test_case["id"])


func _test_personnel_lifecycle_sequence(fixture: Dictionary, campaign: Dictionary) -> void:
	var sequence: Dictionary = fixture.get("personnelLifecycleSequence", {})
	_assert_true(not sequence.is_empty(), "fixture must include the MB07 personnel-lifecycle sequence")
	if sequence.is_empty():
		return
	var session: GameSession = GameSession.new()
	var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
	_assert_true(started["ok"], "personnel-lifecycle sequence campaign must start")
	if not started["ok"]:
		return
	var input: Dictionary = session.snapshot()
	_apply_patches(input, sequence["initialPatches"])
	var restored: Dictionary = session.restore_snapshot(input)
	_assert_true(restored["ok"], "personnel-lifecycle sequence state must restore: %s" % restored.get("error", ""))
	if not restored["ok"]:
		return
	_assert_equal(session.state_sha256(), sequence["initialStateSha256"], "personnel-lifecycle initial digest must match")
	for raw_step: Variant in sequence["steps"]:
		var step: Dictionary = raw_step
		var before_digest: String = session.state_sha256()
		var actual: Dictionary = session.execute_command(step["command"])
		var actual_core: Dictionary = actual.duplicate(true)
		actual_core.erase("state")
		var expected_core: Dictionary = step["expectedCore"]
		_assert_canonical_equal(actual_core, expected_core, "%s personnel-lifecycle result core must match TypeScript" % step["id"])
		var returned_state_digest: Dictionary = CanonicalJson.try_sha256(actual["state"])
		_assert_true(returned_state_digest["ok"], "%s personnel-lifecycle state must hash" % step["id"])
		if returned_state_digest["ok"]:
			_assert_equal(returned_state_digest["value"], expected_core["afterStateSha256"], "%s personnel-lifecycle state must match TypeScript" % step["id"])
		if not bool(expected_core["stateChanged"]):
			_assert_equal(session.state_sha256(), before_digest, "%s personnel-lifecycle rejection must not mutate state" % step["id"])
	_assert_equal(session.state_sha256(), sequence["finalStateSha256"], "personnel-lifecycle final state must match TypeScript")


func _test_personnel_lifecycle_boundary_cases(fixture: Dictionary, campaign: Dictionary) -> void:
	var cases: Array = fixture.get("personnelLifecycleBoundaryCases", [])
	_assert_true(not cases.is_empty(), "fixture must include MB07 boundary cases")
	for raw_case: Variant in cases:
		var test_case: Dictionary = raw_case
		var session: GameSession = GameSession.new()
		var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s MB07 boundary campaign must start" % test_case["id"])
		if not started["ok"]:
			continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, test_case["patches"])
		var restored: Dictionary = session.restore_snapshot(input)
		_assert_true(restored["ok"], "%s patched MB07 state must restore: %s" % [test_case["id"], restored.get("error", "")])
		if not restored["ok"]:
			continue
		var actual: Dictionary = session.execute_command(test_case["command"])
		var actual_core: Dictionary = actual.duplicate(true)
		actual_core.erase("state")
		_assert_canonical_equal(actual_core, test_case["expectedCore"], "%s MB07 result core must match TypeScript" % test_case["id"])
		var state_digest: Dictionary = CanonicalJson.try_sha256(actual["state"])
		_assert_true(state_digest["ok"], "%s MB07 returned state must hash" % test_case["id"])
		if state_digest["ok"]:
			_assert_equal(state_digest["value"], test_case["expectedStateSha256"], "%s MB07 state must match TypeScript" % test_case["id"])


func _test_strategic_logistics_sequences(fixture: Dictionary, campaign: Dictionary) -> void:
	var sequences: Array = fixture.get("strategicLogisticsSequences", [])
	_assert_true(not sequences.is_empty(), "fixture must include MB08 strategic-logistics sequences")
	for raw_sequence: Variant in sequences:
		var sequence: Dictionary = raw_sequence
		var session: GameSession = GameSession.new()
		var sequence_campaign: Dictionary = sequence.get("campaign", campaign)
		var started: Dictionary = session.start_campaign(sequence_campaign["periodId"], sequence_campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s MB08 sequence campaign must start" % sequence["id"])
		if not started["ok"]:
			continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, sequence["initialPatches"])
		var restored: Dictionary = session.restore_snapshot(input)
		_assert_true(restored["ok"], "%s MB08 sequence state must restore: %s" % [sequence["id"], restored.get("error", "")])
		if not restored["ok"]:
			continue
		_assert_equal(session.state_sha256(), sequence["initialStateSha256"], "%s MB08 initial digest must match" % sequence["id"])
		for raw_step: Variant in sequence["steps"]:
			var step: Dictionary = raw_step
			if not (step.get("prePatches", []) as Array).is_empty():
				var patched: Dictionary = session.snapshot()
				_apply_patches(patched, step["prePatches"])
				var pre_restore: Dictionary = session.restore_snapshot(patched)
				_assert_true(pre_restore["ok"], "%s MB08 pre-advance state must restore: %s" % [step["id"], pre_restore.get("error", "")])
				if not pre_restore["ok"]:
					continue
				_assert_equal(session.state_sha256(), step["preStateSha256"], "%s MB08 pre-advance digest must match" % step["id"])
			var before_digest: String = session.state_sha256()
			var actual: Dictionary = session.execute_command(step["command"]) \
					if step["operation"] == "command" else session.advance_strategic_orders()
			var actual_core: Dictionary = actual.duplicate(true)
			actual_core.erase("state")
			_assert_canonical_equal(actual_core, step["expectedCore"], "%s MB08 result core must match TypeScript" % step["id"])
			var state_digest: Dictionary = CanonicalJson.try_sha256(actual["state"])
			_assert_true(state_digest["ok"], "%s MB08 returned state must hash" % step["id"])
			if state_digest["ok"]:
				_assert_equal(state_digest["value"], step["expectedCore"]["afterStateSha256"], "%s MB08 state must match TypeScript" % step["id"])
			if not bool(step["expectedCore"]["stateChanged"]):
				_assert_equal(session.state_sha256(), before_digest, "%s MB08 rejection/no-op must remain atomic" % step["id"])
		_assert_equal(session.state_sha256(), sequence["finalStateSha256"], "%s MB08 final state must match TypeScript" % sequence["id"])


func _test_strategic_logistics_boundary_cases(fixture: Dictionary, campaign: Dictionary) -> void:
	var cases: Array = fixture.get("strategicLogisticsBoundaryCases", [])
	_assert_true(not cases.is_empty(), "fixture must include MB08 strategic-logistics boundary cases")
	for raw_case: Variant in cases:
		var test_case: Dictionary = raw_case
		var session: GameSession = GameSession.new()
		var case_campaign: Dictionary = test_case.get("campaign", campaign)
		var started: Dictionary = session.start_campaign(case_campaign["periodId"], case_campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s MB08 boundary campaign must start" % test_case["id"])
		if not started["ok"]:
			continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, test_case["patches"])
		var restored: Dictionary = session.restore_snapshot(input)
		_assert_true(restored["ok"], "%s patched MB08 state must restore: %s" % [test_case["id"], restored.get("error", "")])
		if not restored["ok"]:
			continue
		var actual: Dictionary = session.execute_command(test_case["command"])
		var actual_core: Dictionary = actual.duplicate(true)
		actual_core.erase("state")
		_assert_canonical_equal(actual_core, test_case["expectedCore"], "%s MB08 boundary result core must match TypeScript" % test_case["id"])
		var state_digest: Dictionary = CanonicalJson.try_sha256(actual["state"])
		_assert_true(state_digest["ok"], "%s MB08 boundary state must hash" % test_case["id"])
		if state_digest["ok"]:
			_assert_equal(state_digest["value"], test_case["expectedStateSha256"], "%s MB08 boundary state must match TypeScript" % test_case["id"])


func _test_strategic_route_cases(fixture: Dictionary) -> void:
	var cases: Array = fixture.get("strategicRouteCases", [])
	_assert_true(not cases.is_empty(), "fixture must include MB08 route-order cases")
	for raw_case: Variant in cases:
		var test_case: Dictionary = raw_case
		var session: GameSession = GameSession.new()
		var campaign: Dictionary = test_case["campaign"]
		var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s route campaign must start" % test_case["id"])
		if not started["ok"]: continue
		var data: Dictionary = session.snapshot()
		for raw_patch: Variant in test_case["ownershipPatches"]:
			var patch: Dictionary = raw_patch
			data["cities"][patch["cityId"]]["ownerId"] = patch["ownerId"]
		var actual: Array[String] = StrategicOrders.find_owned_city_route(
			data, test_case["factionId"], test_case["sourceCityId"], test_case["targetCityId"]
		)
		_assert_equal(actual, test_case.get("expectedRouteCityIds", []), "%s route must match TypeScript" % test_case["id"])


func _test_strategic_lifecycle_cases(fixture: Dictionary) -> void:
	var cases: Array = fixture.get("strategicLifecycleCases", [])
	_assert_true(not cases.is_empty(), "fixture must include MB08 lifecycle-cancellation cases")
	for raw_case: Variant in cases:
		var test_case: Dictionary = raw_case
		var session: GameSession = GameSession.new()
		var campaign: Dictionary = test_case["campaign"]
		var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s lifecycle campaign must start" % test_case["id"])
		if not started["ok"]: continue
		var issued: Dictionary = session.execute_command(test_case["command"])
		_assert_true(issued["ok"], "%s lifecycle transport must issue" % test_case["id"])
		if not issued["ok"]: continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, test_case["prePatches"])
		_assert_equal(Validator.validate_runtime(input), [], "%s lifecycle input must validate" % test_case["id"])
		var input_digest: Dictionary = CanonicalJson.try_sha256(input)
		_assert_true(input_digest["ok"], "%s lifecycle input must hash" % test_case["id"])
		if input_digest["ok"]:
			_assert_equal(input_digest["value"], test_case["cancellationInputSha256"], "%s lifecycle input must match TypeScript" % test_case["id"])
		var canceled: Dictionary = StrategicOrders.cancel_officer_orders(input, "officer-56", "执行者失效")
		_assert_true(canceled["ok"], "%s lifecycle cancellation must succeed" % test_case["id"])
		if not canceled["ok"]: continue
		var next: Dictionary = canceled["next"]
		var next_digest: Dictionary = CanonicalJson.try_sha256(next)
		_assert_true(next_digest["ok"], "%s lifecycle output must hash" % test_case["id"])
		if next_digest["ok"]:
			_assert_equal(next_digest["value"], test_case["expectedStateSha256"], "%s lifecycle output must match TypeScript" % test_case["id"])
		_assert_equal(next["logs"][-1]["message"], test_case["expectedLog"], "%s lifecycle log must match TypeScript" % test_case["id"])
		_assert_true(input["strategicOrders"].has("strategic-order-1"), "%s lifecycle cancellation must not mutate input" % test_case["id"])


func _test_reconnaissance_sequence(fixture: Dictionary) -> void:
	var sequence: Dictionary = fixture.get("reconnaissanceSequence", {})
	_assert_true(not sequence.is_empty(), "fixture must include MB09 reconnaissance sequence")
	if sequence.is_empty(): return
	var session: GameSession = GameSession.new()
	var campaign: Dictionary = sequence["campaign"]
	var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
	_assert_true(started["ok"], "MB09 reconnaissance campaign must start")
	if not started["ok"]: return
	_assert_equal(session.state_sha256(), sequence["initialStateSha256"], "MB09 initial state must match TypeScript")
	var enemy_source_query: Dictionary = session.reconnaissance_query("city-0")
	_assert_true(enemy_source_query["found"], "existing enemy source query must remain structurally discoverable")
	var enemy_source_keys: Array = enemy_source_query["sourceCity"].keys()
	enemy_source_keys.sort()
	_assert_equal(enemy_source_keys, ["id", "name", "ownerId"], "enemy reconnaissance source must expose only public fields")
	_assert_equal(enemy_source_query["visibility"]["knowledge"], "public", "enemy reconnaissance source must be public-only before scouting")
	for index: int in range((sequence["steps"] as Array).size()):
		var step: Dictionary = sequence["steps"][index]
		if not (step["prePatches"] as Array).is_empty():
			var patched: Dictionary = session.snapshot()
			_apply_patches(patched, step["prePatches"])
			var restored: Dictionary = session.restore_snapshot(patched)
			_assert_true(restored["ok"], "%s MB09 patched state must restore" % step["id"])
			if not restored["ok"]: continue
		_assert_equal(session.state_sha256(), step["preStateSha256"], "%s MB09 pre-state must match TypeScript" % step["id"])
		var before_digest: String = session.state_sha256()
		var actual: Dictionary = session.execute_command(step["command"])
		var actual_core: Dictionary = actual.duplicate(true)
		actual_core.erase("state")
		_assert_canonical_equal(actual_core, step["expectedCore"], "%s MB09 result core must match TypeScript" % step["id"])
		_assert_equal(session.state_sha256(), step["expectedStateSha256"], "%s MB09 state must match TypeScript" % step["id"])
		_assert_equal(session.snapshot()["rngSeed"], sequence["initialSeed"], "%s reconnaissance must not consume RNG" % step["id"])
		if bool(step["expectedCore"]["stateChanged"]):
			_assert_true(session.state_sha256() != before_digest, "%s successful reconnaissance must commit" % step["id"])
		if index == 0:
			var stale_input: Dictionary = session.snapshot()
			_apply_patches(stale_input, sequence["steps"][1]["prePatches"])
			var stale_restore: Dictionary = session.restore_snapshot(stale_input)
			_assert_true(stale_restore["ok"], "MB09 stale-report rehearsal state must restore")
			if stale_restore["ok"]:
				var visibility: Dictionary = session.city_visibility_query("city-0")
				_assert_equal(visibility["knowledge"], "report", "scouted enemy city must expose report knowledge")
				_assert_canonical_equal(visibility["report"], step["expectedCore"]["receipt"]["report"], "stale report must not track live city changes")
				_assert_true(visibility["report"]["money"] != stale_input["cities"]["city-0"]["money"], "visibility query must not leak current enemy money")
	_assert_equal(session.state_sha256(), sequence["finalStateSha256"], "MB09 final state must match TypeScript")
	var recovered: GameSession = GameSession.new()
	var recovery: Dictionary = recovered.restore_snapshot(session.snapshot())
	_assert_true(recovery["ok"], "MB09 reconnaissance snapshot must restore")
	if recovery["ok"]:
		_assert_equal(recovered.state_sha256(), sequence["finalStateSha256"], "restored MB09 report state must retain SHA")
		_assert_canonical_equal(recovered.city_visibility_query("city-0"), session.city_visibility_query("city-0"), "restored MB09 visibility must be identical")


func _test_reconnaissance_boundary_cases(fixture: Dictionary) -> void:
	var cases: Array = fixture.get("reconnaissanceBoundaryCases", [])
	_assert_true(not cases.is_empty(), "fixture must include MB09 reconnaissance boundary cases")
	for raw_case: Variant in cases:
		var test_case: Dictionary = raw_case
		var session: GameSession = GameSession.new()
		var started: Dictionary = session.start_campaign(1, 1)
		_assert_true(started["ok"], "%s MB09 boundary campaign must start" % test_case["id"])
		if not started["ok"]: continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, test_case["patches"])
		var restored: Dictionary = session.restore_snapshot(input)
		_assert_true(restored["ok"], "%s MB09 boundary input must restore" % test_case["id"])
		if not restored["ok"]: continue
		_assert_equal(session.state_sha256(), test_case["inputStateSha256"], "%s MB09 boundary input must match TypeScript" % test_case["id"])
		var before_digest: String = session.state_sha256()
		var actual: Dictionary = session.execute_command(test_case["command"])
		var actual_core: Dictionary = actual.duplicate(true)
		actual_core.erase("state")
		_assert_canonical_equal(actual_core, test_case["expectedCore"], "%s MB09 boundary result must match TypeScript" % test_case["id"])
		_assert_equal(session.state_sha256(), test_case["expectedStateSha256"], "%s MB09 boundary state must match TypeScript" % test_case["id"])
		if not bool(test_case["expectedCore"]["stateChanged"]):
			_assert_equal(session.state_sha256(), before_digest, "%s MB09 rejection must remain atomic" % test_case["id"])


func _test_reconnaissance_legacy_report_case(fixture: Dictionary) -> void:
	var test_case: Dictionary = fixture.get("reconnaissanceLegacyReportCase", {})
	_assert_true(not test_case.is_empty(), "fixture must include MB09 legacy-report compatibility case")
	if test_case.is_empty(): return
	_assert_equal(Validator.validate_runtime(test_case["state"]), [], "legacy report without officerIds must remain valid")
	var session: GameSession = GameSession.new()
	var restored: Dictionary = session.restore_snapshot(test_case["state"])
	_assert_true(restored["ok"], "legacy report state must restore")
	if not restored["ok"]: return
	_assert_equal(session.state_sha256(), test_case["stateSha256"], "legacy report state SHA must match TypeScript")
	var visibility: Dictionary = session.city_visibility_query("city-0")
	_assert_equal(visibility["knowledge"], "report", "legacy report must remain visible")
	_assert_true(not visibility["report"].has("officerIds"), "legacy report query must not invent an officer list")


func _test_diplomatic_order_sequences(fixture: Dictionary) -> void:
	var sequences: Array = fixture.get("diplomaticOrderSequences", [])
	_assert_equal(sequences.size(), 4, "fixture must include all four MB10 diplomatic-order sequences")
	for raw_sequence: Variant in sequences:
		var sequence: Dictionary = raw_sequence
		var session: GameSession = GameSession.new()
		var campaign: Dictionary = sequence["campaign"]
		var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s MB10 campaign must start" % sequence["id"])
		if not started["ok"]: continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, sequence["initialPatches"])
		var restored: Dictionary = session.restore_snapshot(input)
		_assert_true(restored["ok"], "%s MB10 initial state must restore: %s" % [sequence["id"], restored.get("error", "")])
		if not restored["ok"]: continue
		_assert_equal(session.state_sha256(), sequence["initialStateSha256"], "%s MB10 initial SHA must match TypeScript" % sequence["id"])
		for raw_step: Variant in sequence["steps"]:
			var step: Dictionary = raw_step
			var actual: Dictionary
			if step["operation"] == "command":
				actual = session.execute_command(step["command"])
			else:
				_assert_equal(session.state_sha256(), step["preStateSha256"], "%s MB10 advance input must match TypeScript" % sequence["id"])
				var recovered: GameSession = GameSession.new()
				var recovery: Dictionary = recovered.restore_snapshot(session.snapshot())
				_assert_true(recovery["ok"], "%s MB10 in-transit save must restore" % sequence["id"])
				var recovered_result: Dictionary = recovered.advance_diplomatic_orders() if recovery["ok"] else {}
				actual = session.advance_diplomatic_orders()
				if recovery["ok"]:
					_assert_canonical_equal(recovered_result, actual, "%s MB10 restored settlement must equal continuous settlement" % sequence["id"])
			var actual_core: Dictionary = actual.duplicate(true)
			actual_core.erase("state")
			_assert_canonical_equal(actual_core, step["expectedCore"], "%s %s MB10 result core must match TypeScript" % [sequence["id"], step["id"]])
			_assert_equal(session.state_sha256(), step["expectedCore"]["afterStateSha256"], "%s %s MB10 state SHA must match TypeScript" % [sequence["id"], step["id"]])
			if step["operation"] == "command":
				_assert_equal(session.snapshot()["rngSeed"], sequence["initialSeed"], "%s issue must not consume RNG" % sequence["id"])
		_assert_equal(session.state_sha256(), sequence["finalStateSha256"], "%s MB10 final SHA must match TypeScript" % sequence["id"])


func _test_diplomatic_order_boundary_cases(fixture: Dictionary) -> void:
	var cases: Array = fixture.get("diplomaticOrderBoundaryCases", [])
	_assert_true(not cases.is_empty(), "fixture must include MB10 diplomatic-order boundaries")
	for raw_case: Variant in cases:
		var test_case: Dictionary = raw_case
		var session: GameSession = GameSession.new()
		var campaign: Dictionary = test_case["campaign"]
		var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s MB10 boundary campaign must start" % test_case["id"])
		if not started["ok"]: continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, test_case["patches"])
		var restored: Dictionary = session.restore_snapshot(input)
		_assert_true(restored["ok"], "%s MB10 boundary input must restore: %s" % [test_case["id"], restored.get("error", "")])
		if not restored["ok"]: continue
		_assert_equal(session.state_sha256(), test_case["inputStateSha256"], "%s MB10 boundary input SHA must match" % test_case["id"])
		var before_digest: String = session.state_sha256()
		var actual: Dictionary = session.execute_command(test_case["command"])
		var actual_core: Dictionary = actual.duplicate(true)
		actual_core.erase("state")
		_assert_canonical_equal(actual_core, test_case["expectedCore"], "%s MB10 boundary result must match TypeScript" % test_case["id"])
		_assert_equal(session.state_sha256(), test_case["expectedStateSha256"], "%s MB10 boundary state SHA must match" % test_case["id"])
		if not bool(test_case["expectedCore"]["stateChanged"]):
			_assert_equal(session.state_sha256(), before_digest, "%s MB10 rejection must remain atomic" % test_case["id"])


func _test_diplomatic_order_settlement_sequences(fixture: Dictionary) -> void:
	var sequences: Array = fixture.get("diplomaticOrderSettlementSequences", [])
	_assert_equal(sequences.size(), 14, "fixture must include MB10 settlement and RNG edge sequences")
	for raw_sequence: Variant in sequences:
		var sequence: Dictionary = raw_sequence
		var session := GameSession.new()
		var campaign: Dictionary = sequence["campaign"]
		var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s MB10 settlement campaign must start" % sequence["id"])
		if not started["ok"]:
			continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, sequence["initialPatches"])
		var restored: Dictionary = session.restore_snapshot(input)
		_assert_true(restored["ok"], "%s MB10 settlement input must restore: %s" % [sequence["id"], restored.get("error", "")])
		if not restored["ok"]:
			continue
		_assert_equal(session.state_sha256(), sequence["initialStateSha256"], "%s MB10 settlement initial SHA must match" % sequence["id"])
		for raw_step: Variant in sequence["steps"]:
			var step: Dictionary = raw_step
			var actual: Dictionary
			if step["operation"] == "command":
				actual = session.execute_command(step["command"])
				_assert_equal(session.snapshot()["rngSeed"], sequence["initialSeed"], "%s settlement issue must not consume RNG" % sequence["id"])
			else:
				var advance_patches: Array = step.get("prePatches", [])
				if not advance_patches.is_empty():
					var patched: Dictionary = session.snapshot()
					_apply_patches(patched, advance_patches)
					var patched_restore: Dictionary = session.restore_snapshot(patched)
					_assert_true(patched_restore["ok"], "%s MB10 advance patches must restore: %s" % [sequence["id"], patched_restore.get("error", "")])
					if not patched_restore["ok"]:
						continue
				_assert_equal(session.state_sha256(), step["preStateSha256"], "%s MB10 settlement advance input must match" % sequence["id"])
				var recovered := GameSession.new()
				var recovery: Dictionary = recovered.restore_snapshot(session.snapshot())
				_assert_true(recovery["ok"], "%s MB10 settlement in-transit save must restore" % sequence["id"])
				var recovered_result: Dictionary = recovered.advance_diplomatic_orders() if recovery["ok"] else {}
				actual = session.advance_diplomatic_orders()
				if recovery["ok"]:
					_assert_canonical_equal(recovered_result, actual, "%s MB10 recovered settlement must equal continuous settlement" % sequence["id"])
			var actual_core: Dictionary = actual.duplicate(true)
			actual_core.erase("state")
			_assert_canonical_equal(actual_core, step["expectedCore"], "%s %s MB10 settlement result must match TypeScript" % [sequence["id"], step["id"]])
			_assert_equal(session.state_sha256(), step["expectedCore"]["afterStateSha256"], "%s %s MB10 settlement state SHA must match" % [sequence["id"], step["id"]])
		_assert_equal(session.state_sha256(), sequence["finalStateSha256"], "%s MB10 settlement final SHA must match" % sequence["id"])
		if sequence["id"] in [
			"target-moved-without-rng", "landless-executor-released-without-rng",
			"induce-dominance-lost-without-rng", "target-allegiance-changed-without-rng",
		]:
			_assert_equal(session.snapshot()["rngSeed"], sequence["initialSeed"], "%s settlement must not consume RNG" % sequence["id"])


func _test_calendar_event_cases(fixture: Dictionary) -> void:
	var cases: Array = fixture.get("calendarEventCases", [])
	_assert_equal(cases.size(), 4, "fixture must include four MB11 calendar-event cases")
	for raw_case: Variant in cases:
		var test_case: Dictionary = raw_case
		var session: GameSession = GameSession.new()
		var campaign: Dictionary = test_case["campaign"]
		var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s MB11 event campaign must start" % test_case["id"])
		if not started["ok"]: continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, test_case["patches"])
		_assert_equal(CanonicalJson.try_sha256(input)["value"], test_case["initialStateSha256"], "%s MB11 event input must match TypeScript" % test_case["id"])
		var result: Dictionary = CalendarEvents.settle_city_events(GameState.new(input))
		_assert_true(result["ok"], "%s MB11 event settlement must succeed: %s" % [test_case["id"], result.get("error", "")])
		if not result["ok"]: continue
		_assert_canonical_equal(result["receipt"], test_case["expectedReceipt"], "%s MB11 event receipt must match TypeScript" % test_case["id"])
		_assert_equal(CanonicalJson.try_sha256(result["next_state"].snapshot())["value"], test_case["finalStateSha256"], "%s MB11 event state SHA must match TypeScript" % test_case["id"])


func _test_annual_progression_cases(fixture: Dictionary) -> void:
	_test_annual_progression_case_list(
		fixture.get("annualProgressionCases", []), "annual-progression", 4
	)


func _test_annual_progression_period_cases(fixture: Dictionary) -> void:
	_test_annual_progression_case_list(
		fixture.get("annualProgressionPeriodCases", []), "annual-progression-period", 4
	)


func _test_annual_progression_case_list(cases: Array, label: String, expected_count: int) -> void:
	_assert_equal(cases.size(), expected_count, "fixture must include four MB11 %s cases" % label)
	for raw_case: Variant in cases:
		var test_case: Dictionary = raw_case
		var session: GameSession = GameSession.new()
		var campaign: Dictionary = test_case["campaign"]
		var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s MB11 %s campaign must start" % [test_case["id"], label])
		if not started["ok"]: continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, test_case["patches"])
		_assert_equal(CanonicalJson.try_sha256(input)["value"], test_case["initialStateSha256"], "%s MB11 %s input must match TypeScript" % [test_case["id"], label])
		var result: Dictionary = AnnualProgression.settle(GameState.new(input), test_case["previousCalendar"])
		_assert_true(result["ok"], "%s MB11 %s settlement must succeed: %s" % [test_case["id"], label, result.get("error", "")])
		if not result["ok"]: continue
		_assert_canonical_equal(result["receipt"], test_case["expectedReceipt"], "%s MB11 %s receipt must match TypeScript" % [test_case["id"], label])
		_assert_equal(CanonicalJson.try_sha256(result["next_state"].snapshot())["value"], test_case["finalStateSha256"], "%s MB11 %s state SHA must match TypeScript" % [test_case["id"], label])


func _test_lifecycle_outcome_cases(fixture: Dictionary) -> void:
	var cases: Array = fixture.get("lifecycleOutcomeCases", [])
	_assert_equal(cases.size(), 12, "fixture must include twelve MB11 lifecycle/outcome cases")
	for raw_case: Variant in cases:
		var test_case: Dictionary = raw_case
		var session: GameSession = GameSession.new()
		var campaign: Dictionary = test_case["campaign"]
		var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s MB11 lifecycle campaign must start" % test_case["id"])
		if not started["ok"]: continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, test_case["patches"])
		_assert_equal(CanonicalJson.try_sha256(input)["value"], test_case["initialStateSha256"], "%s MB11 lifecycle input must match TypeScript" % test_case["id"])
		var result: Dictionary
		match str(test_case["operation"]):
			"settle_captive_escapes":
				result = OfficerLifecycle.settle_captive_escapes(GameState.new(input))
			"settle_natural_deaths":
				result = OfficerLifecycle.settle_natural_deaths(GameState.new(input))
			"kill_officer":
				result = OfficerLifecycle.kill_officer(GameState.new(input), test_case["parameters"])
			"resolve_succession":
				var succession_restore: Dictionary = session.restore_snapshot(input)
				_assert_true(succession_restore["ok"], "%s pending succession must restore before command" % test_case["id"])
				var application_result: Dictionary = session.execute_command(test_case["parameters"]["command"]) \
						if succession_restore["ok"] else {"ok": false, "error": succession_restore["error"]}
				if application_result.get("ok", false):
					# Compare the restored continuation with a continuous domain path
					# that reaches the same pending-succession snapshot through the
					# real lifecycle operation. This proves save recovery preserves
					# the next step, not only the final output hash.
					var continuous := GameSession.new()
					var continuous_started: Dictionary = continuous.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
					_assert_true(continuous_started["ok"], "%s continuous succession campaign must start" % test_case["id"])
					if continuous_started["ok"]:
						var continuous_kill: Dictionary = OfficerLifecycle.kill_officer(
							GameState.new(continuous.snapshot()),
							{"officerId": "officer-1", "cause": "natural-death", "cityId": "city-12"},
						)
						_assert_true(continuous_kill.get("ok", false), "%s continuous ruler death must succeed" % test_case["id"])
						if continuous_kill.get("ok", false):
							var continuous_pending: Dictionary = continuous_kill["next_state"].snapshot()
							_assert_equal(CanonicalJson.try_sha256(continuous_pending)["value"], test_case["initialStateSha256"], "%s continuous pending succession SHA must match" % test_case["id"])
							var continuous_restore: Dictionary = continuous.restore_snapshot(continuous_pending)
							_assert_true(continuous_restore["ok"], "%s continuous pending succession must restore" % test_case["id"])
							var continuous_result: Dictionary = continuous.execute_command(test_case["parameters"]["command"]) \
									if continuous_restore["ok"] else {"ok": false, "error": continuous_restore.get("error", "")}
							_assert_true(continuous_result.get("ok", false), "%s continuous succession resolution must succeed" % test_case["id"])
							if continuous_result.get("ok", false):
								_assert_canonical_equal(continuous_result["receipt"], application_result["receipt"], "%s continuous/restored receipt must match" % test_case["id"])
								_assert_equal(continuous_result["afterStateSha256"], application_result["afterStateSha256"], "%s continuous/restored SHA must match" % test_case["id"])
								_assert_canonical_equal(continuous_result["state"], application_result["state"], "%s continuous/restored next state must match" % test_case["id"])
					var duplicate: Dictionary = session.execute_command(test_case["parameters"]["command"])
					_assert_equal(duplicate.get("code"), "ok", "%s exact succession replay must be idempotent" % test_case["id"])
					_assert_equal(duplicate.get("afterStateSha256"), application_result.get("afterStateSha256"), "%s succession replay SHA must be stable" % test_case["id"])
					result = {"ok": true, "error": "", "receipt": application_result["receipt"], "next_state": GameState.new(application_result["state"])}
				else:
					result = {"ok": false, "error": application_result.get("error", "succession command failed")}
			"evaluate_outcome":
				result = CampaignOutcome.evaluate(GameState.new(input))
			_:
				result = {"ok": false, "error": "unknown fixture operation"}
		_assert_true(result["ok"], "%s MB11 lifecycle operation must succeed: %s" % [test_case["id"], result.get("error", "")])
		if not result["ok"]: continue
		_assert_canonical_equal(result["receipt"], test_case["expectedReceipt"], "%s MB11 lifecycle receipt must match TypeScript" % test_case["id"])
		var output: Dictionary = result["next_state"].snapshot()
		_assert_equal(CanonicalJson.try_sha256(output)["value"], test_case["finalStateSha256"], "%s MB11 lifecycle state SHA must match TypeScript" % test_case["id"])
		_assert_equal(Validator.validate_runtime(output), [], "%s MB11 lifecycle output must validate" % test_case["id"])
		var recovered := GameSession.new()
		var recovery: Dictionary = recovered.restore_snapshot(output)
		_assert_true(recovery["ok"], "%s MB11 lifecycle output must survive save recovery: %s" % [test_case["id"], recovery.get("error", "")])
		if recovery["ok"]:
			_assert_equal(recovered.state_sha256(), test_case["finalStateSha256"], "%s MB11 recovered state SHA must match" % test_case["id"])


func _test_strategic_turn_cases(fixture: Dictionary) -> void:
	var cases: Array = fixture.get("strategicTurnCases", [])
	_assert_equal(cases.size(), 7, "fixture must include seven MB12 strategic-turn cases")
	for raw_case: Variant in cases:
		var test_case: Dictionary = raw_case
		var campaign: Dictionary = test_case["campaign"]
		var session := GameSession.new()
		var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
		_assert_true(started["ok"], "%s MB12 campaign must start" % test_case["id"])
		if not started["ok"]: continue
		var input: Dictionary = session.snapshot()
		_apply_patches(input, test_case["patches"])
		_assert_equal(CanonicalJson.try_sha256(input)["value"], test_case["initialStateSha256"], "%s MB12 input must match TypeScript" % test_case["id"])
		var restored: Dictionary = session.restore_snapshot(input)
		_assert_true(restored["ok"], "%s MB12 input must restore before month advance" % test_case["id"])
		if not restored["ok"]: continue
		var turn_command := {
			"commandEnvelopeVersion": 1,
			"commandId": "mb12-turn-%s" % test_case["id"],
			"expectedStateSha256": test_case["initialStateSha256"],
			"kind": "advance_turn_month",
			"parameters": {},
		}
		var result: Dictionary = session.advance_turn_month(turn_command)
		_assert_true(result["ok"], "%s MB12 month advance must succeed: %s" % [test_case["id"], result.get("error", "")])
		if not result["ok"]: continue
		_assert_canonical_equal(result["receipt"], test_case["expectedReceipt"], "%s MB12 receipt must match TypeScript" % test_case["id"])
		_assert_equal(result["afterStateSha256"], test_case["finalStateSha256"], "%s MB12 state SHA must match TypeScript" % test_case["id"])
		_assert_equal(Validator.validate_runtime(result["state"]), [], "%s MB12 output must validate" % test_case["id"])
		var duplicate: Dictionary = session.advance_turn_month(turn_command)
		_assert_true(["ok", "already_committed"].has(str(duplicate.get("code"))), "%s repeated month command must be idempotent" % test_case["id"])
		_assert_equal(duplicate.get("afterStateSha256"), result.get("afterStateSha256"), "%s repeated month command SHA must be stable" % test_case["id"])
		var stale_command: Dictionary = turn_command.duplicate(true)
		stale_command["commandId"] = "%s-stale" % test_case["id"]
		var stale: Dictionary = session.advance_turn_month(stale_command)
		_assert_equal(stale.get("code"), "stale_state", "%s stale month command must be rejected" % test_case["id"])
		var recovered := GameSession.new()
		var recovered_input: Dictionary = recovered.restore_snapshot(input)
		_assert_true(recovered_input["ok"], "%s MB12 recovered input must restore" % test_case["id"])
		if recovered_input["ok"]:
			var recovered_result: Dictionary = recovered.advance_turn_month()
			_assert_true(recovered_result["ok"], "%s MB12 recovered month advance must succeed" % test_case["id"])
			if recovered_result["ok"]:
				_assert_canonical_equal(recovered_result["receipt"], result["receipt"], "%s MB12 recovered receipt must match" % test_case["id"])
				_assert_equal(recovered_result["afterStateSha256"], result["afterStateSha256"], "%s MB12 recovered SHA must match" % test_case["id"])
		if test_case["id"] == "period-1-unattended-month":
			var second_command := {
				"commandEnvelopeVersion": 1,
				"commandId": "mb12-turn-second",
				"expectedStateSha256": result["afterStateSha256"],
				"kind": "advance_turn_month", "parameters": {},
			}
			var continuous_second: Dictionary = session.advance_turn_month(second_command)
			var restored_second_session := GameSession.new()
			var restored_second_input: Dictionary = restored_second_session.restore_snapshot(result["state"])
			_assert_true(restored_second_input["ok"], "MB12 second-month recovery input must restore")
			if restored_second_input["ok"]:
				var restored_second: Dictionary = restored_second_session.advance_turn_month(second_command)
				_assert_true(continuous_second["ok"] and restored_second["ok"], "MB12 continuous and restored second month must succeed")
				if continuous_second["ok"] and restored_second["ok"]:
					_assert_canonical_equal(continuous_second["receipt"], restored_second["receipt"], "MB12 second-month receipt must survive recovery")
					_assert_equal(continuous_second["afterStateSha256"], restored_second["afterStateSha256"], "MB12 second-month SHA must survive recovery")
	var ended_session := GameSession.new()
	var ended_started: Dictionary = ended_session.start_mb11_acceptance_demo("victory")
	_assert_true(ended_started["ok"], "MB12 ended guard fixture must initialize")
	if ended_started["ok"]:
		var ended_digest := ended_session.state_sha256()
		var ended_result := ended_session.advance_turn_month()
		_assert_true(ended_result["ok"] and not ended_result["stateChanged"], "ended month command must be an idempotent no-op")
		_assert_equal(ended_result["receipt"].get("skipped"), "campaign-ended", "ended month command must expose a stable skip reason")
		_assert_equal(ended_session.state_sha256(), ended_digest, "ended month command must preserve state SHA")
	var succession_session := GameSession.new()
	var succession_started: Dictionary = succession_session.start_mb11_acceptance_demo("succession")
	_assert_true(succession_started["ok"], "MB12 succession guard fixture must initialize")
	if succession_started["ok"]:
		var succession_digest := succession_session.state_sha256()
		var succession_result := succession_session.advance_turn_month()
		_assert_true(not succession_result["ok"] and "拥立新君" in str(succession_result["error"]), "succession month command must reject without mutation")
		_assert_equal(succession_session.state_sha256(), succession_digest, "succession month command must preserve state SHA")


func _test_validation_cases(fixture: Dictionary, campaign: Dictionary) -> void:
	var cases: Array = fixture.get("validationCases", [])
	_assert_true(not cases.is_empty(), "fixture must include shared invalid-state cases")
	var repository := ProductionDataRepository.new()
	var loaded: Dictionary = repository.load_period(campaign["periodId"])
	_assert_true(loaded["ok"], "validation fixture campaign data must load")
	if not loaded["ok"]:
		return
	for raw_case: Variant in cases:
		var test_case: Dictionary = raw_case
		var input: Dictionary = loaded["state"].snapshot()
		var patches: Array = test_case["patches"].duplicate(true)
		for raw_patch: Variant in patches:
			var patch: Dictionary = raw_patch
			if patch["value"] is String and str(patch["value"]).is_valid_int():
				patch["value"] = int(patch["value"])
		_apply_patches(input, patches)
		var issues: Array[Dictionary] = Validator.validate_runtime(input)
		var matched := false
		for issue: Dictionary in issues:
			if issue["path"] == test_case["expectedPath"] and issue["message"] == test_case["expectedMessage"]:
				matched = true
				break
		_assert_true(matched, "%s must produce the shared validator issue" % test_case["id"])


func _apply_patches(target: Dictionary, patches: Array) -> void:
	for raw_patch: Variant in patches:
		var patch: Dictionary = raw_patch
		var path: Array = patch["path"]
		var cursor: Dictionary = target
		for index: int in range(path.size() - 1):
			cursor = cursor[str(path[index])]
		if bool(patch.get("remove", false)):
			cursor.erase(str(path[-1]))
		else:
			cursor[str(path[-1])] = patch["value"]


func _test_modern_ruleset_case(fixture: Dictionary, campaign: Dictionary) -> void:
	var ruleset_case: Dictionary = fixture.get("modernRulesetCase", {})
	_assert_true(not ruleset_case.is_empty(), "fixture must include a modern ruleset cost case")
	if ruleset_case.is_empty():
		return
	var session: GameSession = GameSession.new()
	var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
	_assert_true(started["ok"], "modern ruleset case campaign must start")
	if not started["ok"]:
		return
	var input: Dictionary = session.snapshot()
	input["rulesetId"] = "modern-balanced-v1"
	_assert_equal(CanonicalJson.try_sha256(input)["value"], ruleset_case["inputStateSha256"], "modern ruleset input must match TypeScript")
	var result: Dictionary = InternalAffairs.execute(
		GameState.new(input), ruleset_case["kind"], ruleset_case["parameters"]
	)
	_assert_true(result["ok"], "modern ruleset domain command must succeed: %s" % result.get("error", ""))
	if not result["ok"]:
		return
	var after: Dictionary = result["next_state"].snapshot()
	_assert_equal(CanonicalJson.try_sha256(after)["value"], ruleset_case["expectedStateSha256"], "modern ruleset output must match TypeScript")
	_assert_equal(
		int(input["cities"]["city-12"]["money"]) - int(after["cities"]["city-12"]["money"]),
		int(ruleset_case["expectedMoneyCost"]), "modern govern money cost must match"
	)
	_assert_equal(
		int(input["officers"]["officer-1"]["stamina"]) - int(after["officers"]["officer-1"]["stamina"]),
		int(ruleset_case["expectedStaminaCost"]), "modern govern stamina cost must match"
	)


func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		_fail("missing fixture: %s" % path)
		return {}
	var parser: JSON = JSON.new()
	var error: Error = parser.parse(FileAccess.get_file_as_string(path))
	if error != OK or typeof(parser.data) != TYPE_DICTIONARY:
		_fail("invalid fixture: %s" % path)
		return {}
	return parser.data


func _assert_canonical_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	var actual_digest: Dictionary = CanonicalJson.try_sha256(actual)
	var expected_digest: Dictionary = CanonicalJson.try_sha256(expected)
	if not actual_digest["ok"] or not expected_digest["ok"] or actual_digest["value"] != expected_digest["value"]:
		_fail("%s\n expected=%s\n actual=%s" % [message, expected_digest, actual_digest])


func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value:
		_fail(message)


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if actual != expected:
		_fail("%s\n expected=%s\n actual=%s" % [message, expected, actual])


func _fail(message: String) -> void:
	_failures.append(message)
