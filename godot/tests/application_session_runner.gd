extends SceneTree

const CanonicalJson = preload("res://src/domain/validation/canonical_json.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const ProductionDataRepository = preload("res://src/application/game_session/production_data_repository.gd")
const GameSession = preload("res://src/application/game_session/game_session.gd")
const GameState = preload("res://src/domain/game_state/game_state.gd")
const InternalAffairs = preload("res://src/domain/commands/internal_affairs_commands.gd")

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
