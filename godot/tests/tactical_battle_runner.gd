extends SceneTree

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Commands = preload("res://src/domain/tactical/battle_commands.gd")
const Session = preload("res://src/application/tactical_battle/tactical_battle_session.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")

const CAMPAIGN_PATH: String = "res://data/campaigns/period-1.json"
const FIXTURE_PATH: String = "res://data/fixtures/tactical-battle-v1.json"

var _failures := 0
var _assertions := 0


func _initialize() -> void:
	print("[Godot tactical battle] starting")
	var fixture := _read_dictionary(FIXTURE_PATH)
	var campaign := _read_dictionary(CAMPAIGN_PATH)
	if fixture.is_empty() or campaign.is_empty():
		quit(1)
		return
	var selected_state: Dictionary = campaign["state"].duplicate(true)
	selected_state["phase"] = "player"
	selected_state["playerFactionId"] = "ruler-1"
	selected_state["activeFactionId"] = "ruler-1"
	for faction_id: Variant in selected_state["factions"].keys():
		selected_state["factions"][faction_id]["isPlayer"] = String(faction_id) == "ruler-1"
	_assert_equal(_digest(selected_state), fixture["campaign"]["initialStateSha256"], "selected campaign state must match TypeScript oracle")
	var state := GameState.new(selected_state)
	var created: Dictionary = Commands.create(state, fixture["order"])
	_assert_true(created.get("ok", false), "battle creation must succeed: %s" % created.get("error", ""))
	if created.get("ok", false):
		_assert_equal(created["battle"].snapshot(), fixture["create"]["expectedBattle"], "create battle snapshot must match TypeScript oracle")
		_assert_equal(created["receipt"]["battleStateSha256"], fixture["create"]["expectedBattleStateSha256"], "create battle digest must match TypeScript oracle")
		_assert_equal(created["receipt"]["rngSeed"], fixture["create"]["expectedRngSeed"], "battle creation must not consume RNG")
		_test_session(fixture, created["battle"].snapshot())
		_test_boundaries(fixture, created["battle"].snapshot())
		_test_equipment_case(fixture, selected_state)
		_test_reserve_case(fixture, selected_state)
		_test_create_guards(fixture, selected_state)
	if _failures > 0:
		push_error("[Godot tactical battle] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions])
		quit(1)
		return
	print("[Godot tactical battle] PASSED: %d assertion(s)" % _assertions)
	quit(0)


func _test_equipment_case(fixture: Dictionary, selected_state: Dictionary) -> void:
	var equipment_state: Dictionary = selected_state.duplicate(true)
	var patch: Dictionary = fixture["equipmentCase"]["statePatch"]
	for clear_id: Variant in patch["clearOfficerIds"]: equipment_state["officers"][clear_id]["equipmentItemIds"] = []
	equipment_state["officers"][patch["officerId"]]["equipmentItemIds"] = patch["equipmentItemIds"].duplicate(true)
	var created: Dictionary = Commands.create(GameState.new(equipment_state), fixture["order"])
	_assert_true(created.get("ok", false), "equipped battle creation must succeed: %s" % created.get("error", ""))
	if created.get("ok", false):
		_assert_equal(created["battle"].snapshot(), fixture["equipmentCase"]["expectedBattle"], "equipped battle must use effective attributes and equipment guard")
		_assert_equal(created["receipt"]["battleStateSha256"], fixture["equipmentCase"]["expectedBattleStateSha256"], "equipped battle digest must match TypeScript oracle")


func _test_reserve_case(fixture: Dictionary, selected_state: Dictionary) -> void:
	var reserve_state: Dictionary = selected_state.duplicate(true)
	var patch: Dictionary = fixture["reserveCase"]["statePatch"]
	reserve_state["cities"][patch["cityId"]]["reserveTroops"] = patch["reserveTroops"]
	var created: Dictionary = Commands.create(GameState.new(reserve_state), fixture["order"])
	_assert_true(created.get("ok", false), "reserve battle creation must succeed: %s" % created.get("error", ""))
	if created.get("ok", false):
		_assert_equal(created["battle"].snapshot(), fixture["reserveCase"]["expectedBattle"], "reserve battle must include the city garrison unit")
		_assert_equal(created["receipt"]["battleStateSha256"], fixture["reserveCase"]["expectedBattleStateSha256"], "reserve battle digest must match TypeScript oracle")


func _test_session(fixture: Dictionary, initial_battle: Dictionary) -> void:
	var session := Session.from_snapshot(initial_battle)
	for step: Dictionary in fixture["steps"]:
		var actual: Dictionary = session.execute(step["command"])
		_assert_equal(actual, step["expected"], "session step %s must match TypeScript oracle" % step["id"])
	var restored := Session.from_snapshot(session.snapshot())
	var continuation: Dictionary = fixture["restoredContinuation"]
	_assert_equal(restored.execute(continuation["command"]), continuation["expected"], "restored continuation must match TypeScript oracle")


func _test_boundaries(fixture: Dictionary, initial_battle: Dictionary) -> void:
	for boundary: Dictionary in fixture["boundaryCases"]:
		var boundary_snapshot: Dictionary = boundary.get("snapshot", initial_battle).duplicate(true)
		var session := Session.from_snapshot(boundary_snapshot)
		if boundary["id"] == "both-sides-zero":
			_assert_true(session == null, "ongoing battle with both sides at zero troops must be rejected")
			continue
		if boundary["id"] == "ended-guard":
			var duplicate_case: Dictionary = {}
			for candidate: Dictionary in fixture["boundaryCases"]:
				if candidate["id"] == "duplicate-command": duplicate_case = candidate
			session.execute(duplicate_case["command"])
			var ended_snapshot: Dictionary = session.snapshot()
			ended_snapshot["phase"] = "ended"
			ended_snapshot["status"] = "defender-won"
			ended_snapshot["outcome"] = "day-limit"
			session = Session.from_snapshot(ended_snapshot)
		for prelude: Dictionary in boundary.get("prelude", []): session.execute(prelude)
		var actual: Dictionary = session.execute(boundary["command"])
		_assert_equal(actual, boundary["expected"], "boundary %s must match TypeScript oracle" % boundary["id"])
		if boundary.has("duplicateExpected"):
			_assert_equal(session.execute(boundary["command"]), boundary["duplicateExpected"], "duplicate %s must be idempotent" % boundary["id"])
	var malformed := initial_battle.duplicate(true)
	malformed["deployment"]["attacker"] = ["malformed"]
	_assert_true(Session.from_snapshot(malformed) == null, "malformed snapshot must be rejected before session creation")
	var malformed_deployment := initial_battle.duplicate(true)
	malformed_deployment["deployment"] = []
	_assert_true(Session.from_snapshot(malformed_deployment) == null, "malformed deployment object must be rejected without a type crash")
	var malformed_unit := initial_battle.duplicate(true)
	malformed_unit["units"]["bad"] = "bad"
	_assert_true(Session.from_snapshot(malformed_unit) == null, "malformed unit record must be rejected without a type crash")
	var malformed_contract := initial_battle.duplicate(true)
	malformed_contract["contractVersion"] = {"bad": true}
	_assert_true(Session.from_snapshot(malformed_contract) == null, "malformed contract version must be rejected without a type crash")
	var decimal_contract := initial_battle.duplicate(true)
	decimal_contract["contractVersion"] = 1.5
	_assert_true(Session.from_snapshot(decimal_contract) == null, "decimal contract version must be rejected without truncation")
	var malformed_dimensions := initial_battle.duplicate(true)
	malformed_dimensions["width"] = []
	_assert_true(Session.from_snapshot(malformed_dimensions) == null, "malformed dimensions must be rejected without a type crash")
	var malformed_slot := initial_battle.duplicate(true)
	malformed_slot["deployment"]["attacker"][0]["slotX"] = 9.5
	_assert_true(Session.from_snapshot(malformed_slot) == null, "decimal deployment slot must be rejected without truncation")
	var malformed_guard := initial_battle.duplicate(true)
	malformed_guard["guard"]["version"] = 2.5
	_assert_true(Session.from_snapshot(malformed_guard) == null, "decimal guard version must be rejected without truncation")
	var missing_encoding := initial_battle.duplicate(true)
	missing_encoding["guard"]["participants"][0].erase("equipmentKeyEncoding")
	_assert_true(Session.from_snapshot(missing_encoding) == null, "missing equipment key encoding must be rejected")
	var ongoing_day_limit := initial_battle.duplicate(true)
	ongoing_day_limit["phase"] = "battle"; ongoing_day_limit["day"] = ongoing_day_limit["maxDays"] + 1
	_assert_true(Session.from_snapshot(ongoing_day_limit) == null, "ongoing battle beyond maxDays must be rejected")
	var canonical_invalid := initial_battle.duplicate(true)
	canonical_invalid["units"][1] = canonical_invalid["units"].values()[0]
	_assert_true(Session.from_snapshot(canonical_invalid) == null, "canonical-invalid snapshot must be rejected before session creation")
	var canonical_command_session := Session.from_snapshot(initial_battle)
	var canonical_invalid_command: Dictionary = {
		"commandEnvelopeVersion": 1, "commandId": "canonical-invalid-command", "expectedBattleStateSha256": canonical_command_session.state_sha256(),
		"kind": "confirm_deployment", "parameters": {1: true},
	}
	var canonical_command_result: Dictionary = canonical_command_session.execute(canonical_invalid_command)
	_assert_true(not canonical_command_result.get("ok", false), "canonical-invalid command must be rejected")
	_assert_true(String(canonical_command_result.get("error", "")).begins_with("战斗命令无法生成摘要"), "canonical-invalid command must expose digest failure")
	var malformed_faction := initial_battle.duplicate(true)
	malformed_faction["attackerFactionId"] = []
	_assert_true(Session.from_snapshot(malformed_faction) == null, "malformed faction id must be rejected without a type crash")
	var malformed_acted_id := initial_battle.duplicate(true)
	malformed_acted_id["actedUnitIds"] = [{}]
	_assert_true(Session.from_snapshot(malformed_acted_id) == null, "malformed acted id must be rejected without a type crash")
	var malformed_officer_id := initial_battle.duplicate(true)
	malformed_officer_id["units"]["officer:officer-1"]["officerId"] = {}
	_assert_true(Session.from_snapshot(malformed_officer_id) == null, "malformed officer id must be rejected without a type crash")
	var malformed_approach := initial_battle.duplicate(true)
	malformed_approach["approach"] = []
	_assert_true(Session.from_snapshot(malformed_approach) == null, "malformed approach must be rejected without a type crash")


func _test_create_guards(fixture: Dictionary, selected_state: Dictionary) -> void:
	for guard_case: Dictionary in fixture["createGuardCases"]:
		var guarded_state: Dictionary = selected_state.duplicate(true)
		for key: String in guard_case["statePatch"].keys(): guarded_state[key] = guard_case["statePatch"][key]
		for officer_id: Variant in guard_case.get("officerTroopPatch", []):
			guarded_state["officers"][officer_id]["troops"] = 0
		var guard_order: Dictionary = fixture["order"].duplicate(true)
		for key: String in guard_case.get("orderPatch", {}).keys(): guard_order[key] = guard_case["orderPatch"][key]
		var created: Dictionary = Commands.create(GameState.new(guarded_state), guard_order)
		if guard_case.get("expectedOk", false):
			_assert_true(created.get("ok", false), "create guard %s must succeed" % guard_case["id"])
			if created.get("ok", false):
				_assert_equal(created["battle"].snapshot(), guard_case["expectedBattle"], "create guard %s battle must match oracle" % guard_case["id"])
				_assert_equal(created["receipt"]["battleStateSha256"], guard_case["expectedBattleStateSha256"], "create guard %s digest must match oracle" % guard_case["id"])
		else:
			_assert_true(not created.get("ok", false), "create guard %s must reject" % guard_case["id"])
			_assert_equal(created.get("error", ""), guard_case["expectedError"], "create guard %s error must match oracle" % guard_case["id"])


func _read_dictionary(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		_fail("fixture file is missing: %s" % path)
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		_fail("cannot open fixture: %s" % path)
		return {}
	var parser := JSON.new()
	var error := parser.parse(file.get_as_text())
	file.close()
	if error != OK or typeof(parser.data) != TYPE_DICTIONARY:
		_fail("cannot parse fixture: %s" % path)
		return {}
	return parser.data


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if not _equivalent(actual, expected):
		_fail("%s\n  difference: %s\n  expected: %s\n  actual:   %s" % [message, _difference(actual, expected, "$"), str(expected), str(actual)])


func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value: _fail(message)


func _equivalent(actual: Variant, expected: Variant) -> bool:
	var actual_type := typeof(actual); var expected_type := typeof(expected)
	if (actual_type == TYPE_INT or actual_type == TYPE_FLOAT) and (expected_type == TYPE_INT or expected_type == TYPE_FLOAT): return float(actual) == float(expected)
	if actual_type != expected_type: return false
	if actual_type == TYPE_ARRAY:
		if actual.size() != expected.size(): return false
		for index: int in range(actual.size()):
			if not _equivalent(actual[index], expected[index]): return false
		return true
	if actual_type == TYPE_DICTIONARY:
		if actual.size() != expected.size(): return false
		for key: Variant in actual.keys():
			if not expected.has(key) or not _equivalent(actual[key], expected[key]): return false
		return true
	return actual == expected


func _fail(message: String) -> void:
	_failures += 1
	push_error("[Godot tactical battle] %s" % message)


func _digest(value: Variant) -> String:
	var result: Dictionary = Canonical.try_sha256(value)
	return String(result.get("value", ""))


func _difference(actual: Variant, expected: Variant, path: String) -> String:
	if (typeof(actual) == TYPE_INT or typeof(actual) == TYPE_FLOAT) and (typeof(expected) == TYPE_INT or typeof(expected) == TYPE_FLOAT):
		return "" if float(actual) == float(expected) else "%s: %s != %s" % [path, str(actual), str(expected)]
	if typeof(actual) != typeof(expected): return "%s type %d != %d" % [path, typeof(actual), typeof(expected)]
	if typeof(actual) == TYPE_DICTIONARY:
		for key: Variant in actual.keys():
			if not expected.has(key): return "%s missing expected key %s" % [path, str(key)]
			var nested := _difference(actual[key], expected[key], "%s.%s" % [path, key])
			if not nested.is_empty(): return nested
		for key: Variant in expected.keys():
			if not actual.has(key): return "%s missing actual key %s" % [path, str(key)]
		return ""
	if typeof(actual) == TYPE_ARRAY:
		if actual.size() != expected.size(): return "%s size %d != %d" % [path, actual.size(), expected.size()]
		for index: int in range(actual.size()):
			var nested := _difference(actual[index], expected[index], "%s[%d]" % [path, index])
			if not nested.is_empty(): return nested
		return ""
	return "" if actual == expected else "%s: %s != %s" % [path, str(actual), str(expected)]
