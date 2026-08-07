extends SceneTree

const Ai = preload("res://src/application/tactical_battle/tactical_battle_ai.gd")
const Session = preload("res://src/application/tactical_battle/tactical_battle_session.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const FIXTURE_PATH := "res://data/fixtures/tactical-battle-ai-v1.json"
var _failures := 0
var _assertions := 0

func _init() -> void: call_deferred("_run")

func _run() -> void:
	print("[Godot tactical AI] starting")
	var fixture := _read_dictionary(FIXTURE_PATH)
	if fixture.is_empty(): quit(1); return
	var initial: Dictionary = fixture["initialBattle"]
	_assert_true(Session.from_snapshot(initial) != null, "AI snapshot must restore")
	var result: Dictionary = Ai.run_active_side(initial)
	_assert_true(bool(result.get("ok", false)), "AI active-side run must succeed")
	if bool(result.get("ok", false)):
		var trace: Array = result.get("trace", [])
		_assert_equal(trace.size(), 1, "bounded AI fixture must contain one action")
		if trace.size() == 1:
			_assert_equal(trace[0]["command"], fixture["action"]["command"], "AI command envelope must match Web policy")
			_assert_equal(trace[0]["result"], fixture["action"]["expected"], "AI command result must match Web oracle")
		_assert_equal(result["battle"], fixture["finalBattle"], "AI final battle must match Web oracle")
		_assert_equal(result["battle"]["activeSide"], fixture["expected"]["finalActiveSide"], "AI must hand off to the next side deterministically")
		_assert_equal(_digest(result["battle"]), _digest(fixture["finalBattle"]), "AI final digest must match")
	var repeat := Ai.run_active_side(initial)
	_assert_equal(repeat, result, "AI repeated run must be deterministic")
	_test_boundaries(fixture)
	_test_malformed_restore(initial)
	_test_policy_cases(fixture)
	if _failures > 0: push_error("[Godot tactical AI] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions]); quit(1); return
	print("[Godot tactical AI] PASSED: %d assertion(s)" % _assertions); quit(0)

func _test_boundaries(fixture: Dictionary) -> void:
	for boundary: Dictionary in fixture.get("boundaryCases", []):
		if boundary.has("expectedRestore"):
			_assert_true(Session.from_snapshot(boundary["snapshot"]) == null, "boundary %s malformed restore must reject" % boundary["id"])
			continue
		var session := Session.from_snapshot(boundary.get("snapshot", fixture["initialBattle"]).duplicate(true))
		_assert_true(session != null, "boundary %s snapshot must restore" % boundary["id"])
		if session == null: continue
		for prelude: Dictionary in boundary.get("prelude", []): session.execute(prelude)
		var boundary_result := session.execute(boundary["command"])
		_assert_equal(boundary_result, boundary["expected"], "boundary %s must match transaction oracle" % boundary["id"])
		if boundary.has("duplicateExpected"): _assert_equal(session.execute(boundary["command"]), boundary["duplicateExpected"], "boundary %s duplicate must be idempotent" % boundary["id"])

func _test_malformed_restore(initial: Dictionary) -> void:
	var missing_units := initial.duplicate(true); missing_units.erase("units")
	_assert_true(Session.from_snapshot(missing_units) == null, "AI restore must reject missing units")
	var bad_status := initial.duplicate(true); bad_status["units"]["officer:officer-1"]["statusTurns"] = []
	_assert_true(Session.from_snapshot(bad_status) == null, "AI restore must reject malformed status turns")

func _test_policy_cases(fixture: Dictionary) -> void:
	for policy_case: Dictionary in fixture.get("policyCases", []):
		var initial_case: Dictionary = policy_case["initialBattle"]
		var session := Session.from_snapshot(initial_case)
		_assert_true(session != null, "policy %s snapshot must restore" % policy_case["id"])
		if bool(policy_case.get("restoredContinuation", false)):
			_assert_true(session != null, "policy %s must execute from a restored continuation snapshot" % policy_case["id"])
		if session == null: continue
		var result: Dictionary = Ai.run_active_side(initial_case)
		_assert_true(bool(result.get("ok", false)), "policy %s AI run must succeed" % policy_case["id"])
		var expected_actions: Array = policy_case.get("webOracle", {}).get("actions", [])
		var trace: Array = result.get("trace", [])
		_assert_equal(trace.size(), expected_actions.size(), "policy %s action count must match Web" % policy_case["id"])
		for index in range(mini(trace.size(), expected_actions.size())):
			var actual_action := _action_shape(trace[index]["command"]); var expected_action := _action_shape(expected_actions[index])
			_assert_equal(actual_action, expected_action, "policy %s action %d must match Web" % [policy_case["id"], index])
			var actual_result: Dictionary = trace[index].get("result", {}); var expected_step: Dictionary = expected_actions[index]
			_assert_equal(actual_result.get("beforeBattleStateSha256", ""), expected_step.get("beforeBattleStateSha256", ""), "policy %s action %d before SHA must match Web" % [policy_case["id"], index])
			_assert_equal(actual_result.get("afterBattleStateSha256", ""), expected_step.get("afterBattleStateSha256", ""), "policy %s action %d after SHA must match Web" % [policy_case["id"], index])
			var actual_receipt: Dictionary = actual_result.get("receipt", {})
			var actual_details: Dictionary = actual_receipt.get("details", {})
			_assert_equal(actual_receipt.get("battleStateSha256", ""), actual_result.get("afterBattleStateSha256", ""), "policy %s action %d receipt SHA must match after SHA" % [policy_case["id"], index])
			_assert_equal(actual_details.get("seedBefore", null), expected_step.get("seedBefore", null), "policy %s action %d receipt seedBefore must match Web" % [policy_case["id"], index])
			_assert_equal(actual_details.get("seedAfter", null), expected_step.get("seedAfter", null), "policy %s action %d receipt seedAfter must match Web" % [policy_case["id"], index])
			if expected_step.has("path"): _assert_equal(actual_result.get("receipt", {}).get("details", {}).get("path", []), expected_step["path"], "policy %s action %d movement path must match Web" % [policy_case["id"], index])
		_assert_equal(result.get("battle", {}), policy_case["webOracle"].get("finalBattle", {}), "policy %s final battle must match Web" % policy_case["id"])
		var repeat: Dictionary = Ai.run_active_side(initial_case)
		_assert_equal(repeat, result, "policy %s repeated run must be deterministic" % policy_case["id"])

func _action_shape(command: Dictionary) -> Dictionary:
	var parameters: Dictionary = command.get("parameters", command)
	var result := {"kind": String(command.get("kind", "")), "unitId": String(parameters.get("unitId", ""))}
	for key: String in ["skillId", "targetUnitId", "slotX", "slotY"]:
		if parameters.has(key): result[key] = parameters[key]
	return result

func _read_dictionary(path: String) -> Dictionary:
	if not FileAccess.file_exists(path): _fail("fixture is missing: %s" % path); return {}
	var file := FileAccess.open(path, FileAccess.READ); if file == null: _fail("cannot open fixture: %s" % path); return {}
	var parser := JSON.new(); var error := parser.parse(file.get_as_text()); file.close()
	if error != OK or typeof(parser.data) != TYPE_DICTIONARY: _fail("cannot parse fixture: %s" % path); return {}
	return parser.data

func _digest(value: Variant) -> String:
	var result: Dictionary = Canonical.try_sha256(value); return String(result.get("value", "")) if result.get("ok", false) else ""

func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if not _equivalent(actual, expected): _fail("%s\n  first difference: %s" % [message, _first_difference(actual, expected, "$", 0)])

func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value: _fail(message)

func _equivalent(actual: Variant, expected: Variant) -> bool:
	var at := typeof(actual); var et := typeof(expected)
	if (at == TYPE_INT or at == TYPE_FLOAT) and (et == TYPE_INT or et == TYPE_FLOAT): return float(actual) == float(expected)
	if at != et: return false
	if at == TYPE_ARRAY:
		if actual.size() != expected.size(): return false
		for i in range(actual.size()):
			if not _equivalent(actual[i], expected[i]): return false
		return true
	if at == TYPE_DICTIONARY:
		if actual.size() != expected.size(): return false
		for key in actual.keys():
			if not expected.has(key) or not _equivalent(actual[key], expected[key]): return false
		return true
	return actual == expected

func _first_difference(actual: Variant, expected: Variant, path: String, depth: int) -> String:
	if depth > 5: return path
	if (typeof(actual) == TYPE_INT or typeof(actual) == TYPE_FLOAT) and (typeof(expected) == TYPE_INT or typeof(expected) == TYPE_FLOAT): return "" if float(actual) == float(expected) else path
	if typeof(actual) != typeof(expected): return "%s type" % path
	if typeof(actual) == TYPE_DICTIONARY:
		for key in expected.keys():
			if not actual.has(key): return "%s missing %s" % [path, key]
			var diff := _first_difference(actual[key], expected[key], "%s.%s" % [path, key], depth + 1)
			if diff != "": return diff
		for key in actual.keys():
			if not expected.has(key): return "%s unexpected %s" % [path, key]
		return ""
	if typeof(actual) == TYPE_ARRAY:
		if actual.size() != expected.size(): return "%s length" % path
		for i in range(actual.size()):
			var diff := _first_difference(actual[i], expected[i], "%s[%d]" % [path, i], depth + 1)
			if diff != "": return diff
		return ""
	return "" if actual == expected else path

func _fail(message: String) -> void: _failures += 1; push_error("[Godot tactical AI] %s" % message)
