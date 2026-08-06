extends SceneTree

const Session = preload("res://src/application/tactical_battle/tactical_battle_session.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const BattleValidator = preload("res://src/domain/tactical/battle_validator.gd")
const FIXTURE_PATH := "res://data/fixtures/tactical-battle-outcome-v1.json"
var _failures := 0
var _assertions := 0


func _initialize() -> void:
	var fixture := _read_dictionary(FIXTURE_PATH)
	if fixture.is_empty():
		quit(1); return
	for case: Dictionary in fixture["cases"]: _test_case(case)
	_test_saved_continuation(fixture["savedContinuation"])
	if _failures > 0:
		push_error("[Godot tactical outcome] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions]); quit(1); return
	print("[Godot tactical outcome] PASSED: %d assertion(s)" % _assertions); quit(0)


func _test_case(case: Dictionary) -> void:
	var initial: Dictionary = case["initialBattle"]
	var session := Session.from_snapshot(initial)
	if session == null: push_error("[Godot tactical outcome] %s issues=%s" % [case["id"], BattleValidator.validate(initial)])
	_assert_true(session != null, "%s initial snapshot must restore" % case["id"])
	if session == null: return
	var before_digest := _digest(session.snapshot())
	if String(case["id"]).ends_with("retreat"):
		var retreat := session.execute(_command("%s-retreat" % case["id"], before_digest, "retreat_side", {"side": "attacker" if case["id"] == "attacker-retreat" else "defender"}))
		_assert_true(bool(retreat.get("ok", false)), "%s retreat must succeed: %s" % [case["id"], retreat.get("error", "")])
		_assert_equal(retreat.get("battle", {}), case["expectedBattle"], "%s retreat state must match Web oracle" % case["id"])
		before_digest = _digest(session.snapshot())
	var settlement_command := _command("%s-settle" % case["id"], before_digest, "settle_battle", {})
	var settled := session.execute(settlement_command)
	_assert_true(bool(settled.get("ok", false)), "%s settlement must succeed: %s" % [case["id"], settled.get("error", "")])
	_assert_equal(settled.get("settlement", {}), case["expectedResult"], "%s settlement result must match Web oracle" % case["id"])
	_assert_equal(settled.get("battle", {}), case["expectedBattle"], "%s settlement must preserve terminal battle" % case["id"])
	var duplicate := session.execute(settlement_command)
	_assert_true(bool(duplicate.get("duplicate", false)), "%s settlement must be idempotent" % case["id"])
	_assert_equal(duplicate.get("settlement", {}), case["expectedResult"], "%s duplicate settlement must keep result" % case["id"])
	var conflict := session.execute(_command("%s-settle" % case["id"], before_digest, "settle_battle", {"conflict": true}))
	_assert_true(not bool(conflict.get("ok", false)), "%s conflicting command id must fail" % case["id"])
	var stale := session.execute(_command("%s-stale" % case["id"], "0".repeat(64), "settle_battle", {}))
	_assert_true(not bool(stale.get("ok", false)), "%s stale settlement must fail" % case["id"])


func _test_saved_continuation(saved: Dictionary) -> void:
	var session := Session.from_snapshot(saved["snapshot"])
	_assert_true(session != null, "saved terminal continuation must restore")
	if session == null: return
	_assert_equal(_digest(session.snapshot()), saved["snapshotSha256"], "saved continuation digest must be stable")
	var command := _command("saved-continuation-settle", _digest(session.snapshot()), "settle_battle", {})
	var settled := session.execute(command)
	_assert_equal(settled.get("settlement", {}), saved["result"], "saved continuation settlement must match Web oracle")


func _command(id: String, expected: String, kind: String, parameters: Dictionary) -> Dictionary:
	return {"commandEnvelopeVersion": 1, "commandId": id, "expectedBattleStateSha256": expected, "kind": kind, "parameters": parameters}


func _digest(value: Variant) -> String:
	var result := Canonical.try_sha256(value)
	return String(result.get("value", ""))


func _read_dictionary(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null: _fail("fixture missing: %s" % path); return {}
	var parser := JSON.new(); var error := parser.parse(file.get_as_text()); file.close()
	if error != OK or typeof(parser.data) != TYPE_DICTIONARY: _fail("fixture invalid: %s" % path); return {}
	return parser.data


func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value: _fail(message)


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if not _equivalent(actual, expected): _fail("%s\n expected=%s\n actual=%s" % [message, str(expected), str(actual)])


func _equivalent(actual: Variant, expected: Variant) -> bool:
	if (typeof(actual) in [TYPE_INT, TYPE_FLOAT]) and (typeof(expected) in [TYPE_INT, TYPE_FLOAT]): return float(actual) == float(expected)
	if typeof(actual) != typeof(expected): return false
	if typeof(actual) == TYPE_DICTIONARY:
		if actual.size() != expected.size(): return false
		for key: Variant in actual.keys():
			if not expected.has(key) or not _equivalent(actual[key], expected[key]): return false
		return true
	if typeof(actual) == TYPE_ARRAY:
		if actual.size() != expected.size(): return false
		for index in range(actual.size()):
			if not _equivalent(actual[index], expected[index]): return false
		return true
	return actual == expected


func _fail(message: String) -> void:
	_failures += 1; push_error("[Godot tactical outcome] %s" % message)
