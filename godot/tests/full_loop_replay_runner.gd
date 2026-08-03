extends SceneTree

const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const GameSession = preload("res://src/application/game_session/game_session.gd")
const TacticalBattleSession = preload("res://src/application/tactical_battle/tactical_battle_session.gd")
const FIXTURE_PATH := "res://data/fixtures/godot-full-loop-v1.json"

var _failures := 0
var _assertions := 0


func _initialize() -> void:
	var fixture := _read_dictionary(FIXTURE_PATH)
	if fixture.is_empty():
		quit(1)
		return
	var session := GameSession.new()
	session.clear_battle_recovery()
	var started := session.start_campaign(1, 1)
	_assert_true(bool(started.get("ok", false)), "full loop campaign must start")
	if not bool(started.get("ok", false)):
		_finish()
		return
	var strategic: Dictionary = fixture.get("strategic", {})
	_assert_equal(session.state_sha256(), strategic.get("initialStateSha256", ""), "full loop initial strategic digest")
	var command: Dictionary = strategic.get("command", {})
	var command_result := session.execute_command(command)
	_assert_true(bool(command_result.get("ok", false)), "full loop strategic command must succeed: %s" % command_result.get("error", ""))
	_assert_equal(command_result.get("beforeStateSha256", ""), strategic.get("initialStateSha256", ""), "full loop command before digest")
	_assert_equal(command_result.get("afterStateSha256", ""), strategic.get("afterDevelopSha256", ""), "full loop command after digest")

	# Save/reload at the strategic-to-tactical boundary. This is intentionally
	# a fresh facade, proving the next phase does not depend on scene memory.
	var save_result := session.save_game()
	_assert_true(bool(save_result.get("ok", false)), "full loop strategic checkpoint save")
	var resumed := GameSession.new()
	var resume_result := resumed.load_game()
	_assert_true(bool(resume_result.get("ok", false)), "full loop strategic checkpoint reload")
	_assert_equal(resumed.state_sha256(), strategic.get("afterDevelopSha256", ""), "full loop checkpoint digest")

	var tactical: Dictionary = fixture.get("tactical", {})
	var tactical_session := TacticalBattleSession.from_snapshot(tactical.get("initialBattle", {}))
	_assert_true(tactical_session != null, "full loop tactical entry must validate")
	if tactical_session != null:
		_assert_equal(tactical_session.state_sha256(), tactical.get("initialBattleSha256", ""), "full loop tactical entry digest")
		var retreat := tactical_session.execute({
			"commandEnvelopeVersion": 1,
			"commandId": "mb24-full-loop-retreat-0001",
			"expectedBattleStateSha256": tactical_session.state_sha256(),
			"kind": "retreat_side",
			"parameters": {"side": "attacker"},
		})
		_assert_true(bool(retreat.get("ok", false)), "full loop tactical retreat must succeed: %s" % retreat.get("error", ""))
		_assert_equal(tactical_session.state_sha256(), tactical.get("terminalBattleSha256", ""), "full loop tactical terminal digest")
		var settlement := tactical_session.execute({
			"commandEnvelopeVersion": 1,
			"commandId": "mb24-full-loop-settle-0001",
			"expectedBattleStateSha256": tactical_session.state_sha256(),
			"kind": "settle_battle",
			"parameters": {},
		})
		_assert_true(bool(settlement.get("ok", false)), "full loop tactical settlement projection")
		_assert_equal(settlement.get("settlement", {}), tactical.get("result", {}), "full loop tactical result")

	# Apply the language-neutral battle result through the strategic command
	# boundary, then verify the final persistence contract.
	var settlement_command := {
		"commandEnvelopeVersion": 1,
		"commandId": "mb24-full-loop-settlement-0001",
		"expectedStateSha256": resumed.state_sha256(),
		"kind": "settle_tactical_battle",
		"parameters": {"battleResult": tactical.get("result", {})},
	}
	var settled := resumed.execute_command(settlement_command)
	var expected_state: Dictionary = fixture.get("settlement", {}).get("expectedState", {})
	_assert_true(bool(settled.get("ok", false)), "full loop strategic settlement must succeed: %s" % settled.get("error", ""))
	_assert_equal(resumed.state_sha256(), fixture.get("settlement", {}).get("expectedStateSha256", ""), "full loop final strategic digest")
	_assert_equal(settled.get("state", {}), expected_state, "full loop final strategic state")
	var final_save := resumed.save_game()
	_assert_true(bool(final_save.get("ok", false)), "full loop final save")
	var final_reload := GameSession.new()
	var final_reload_result := final_reload.load_game()
	_assert_true(bool(final_reload_result.get("ok", false)), "full loop final reload")
	_assert_equal(final_reload.state_sha256(), fixture.get("persistence", {}).get("finalStateSha256", ""), "full loop final reload digest")
	_finish()


func _finish() -> void:
	if _failures > 0:
		push_error("[Godot full loop] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions])
		quit(1)
		return
	print("[Godot full loop] PASSED: %d assertions" % _assertions)
	quit(0)


func _read_dictionary(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		_fail("fixture missing: %s" % path)
		return {}
	var parser := JSON.new()
	var error := parser.parse(FileAccess.get_file_as_string(path))
	if error != OK or not parser.data is Dictionary:
		_fail("fixture invalid: %s" % path)
		return {}
	return parser.data


func _digest(value: Variant) -> String:
	var result := Canonical.try_sha256(value)
	return String(result.get("value", ""))


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if not _equivalent(actual, expected):
		_fail("%s (actual digest=%s expected digest=%s)" % [message, _digest(actual), _digest(expected)])


func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value:
		_fail(message)


func _equivalent(actual: Variant, expected: Variant) -> bool:
	if typeof(actual) != typeof(expected):
		if typeof(actual) in [TYPE_INT, TYPE_FLOAT] and typeof(expected) in [TYPE_INT, TYPE_FLOAT]:
			return float(actual) == float(expected)
		return false
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
	if typeof(actual) in [TYPE_INT, TYPE_FLOAT] and typeof(expected) in [TYPE_INT, TYPE_FLOAT]:
		return float(actual) == float(expected)
	return actual == expected


func _fail(message: String) -> void:
	_failures += 1
	push_error("[Godot full loop] " + message)
