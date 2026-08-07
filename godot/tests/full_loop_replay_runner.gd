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
	var native_creation := resumed.create_tactical_battle(tactical.get("order", {}))
	_assert_true(bool(native_creation.get("ok", false)), "full loop native tactical creation must succeed: %s" % native_creation.get("error", ""))
	_assert_equal(_digest(native_creation.get("battle", {})), tactical.get("initialBattleSha256", ""), "full loop native tactical creation digest")
	var tactical_session := TacticalBattleSession.from_snapshot(native_creation.get("battle", {}))
	_assert_true(tactical_session != null, "full loop tactical entry must validate")
	if tactical_session != null:
		_assert_equal(tactical_session.state_sha256(), tactical.get("initialBattleSha256", ""), "full loop tactical entry digest")
		var confirm := tactical_session.execute({
			"commandEnvelopeVersion": 1,
			"commandId": "mb24-full-loop-confirm-0001",
			"expectedBattleStateSha256": tactical_session.state_sha256(),
			"kind": "confirm_deployment",
			"parameters": {},
		})
		_assert_true(bool(confirm.get("ok", false)), "full loop tactical deployment confirmation")
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
	_run_month_replay()
	_run_tactical_command_slices()
	_finish()


func _run_month_replay() -> void:
	# The production session owns the AI/month boundary. Run it twice from the
	# same explicit period seed and require identical digest/seed output.
	var first := GameSession.new()
	var second := GameSession.new()
	first.clear_battle_recovery(); second.clear_battle_recovery()
	_assert_true(bool(first.start_campaign(1, 1).get("ok", false)), "month replay first campaign")
	_assert_true(bool(second.start_campaign(1, 1).get("ok", false)), "month replay second campaign")
	var first_result := first.advance_turn_month()
	var second_result := second.advance_turn_month()
	_assert_true(bool(first_result.get("ok", false)), "month replay first AI/month transition")
	_assert_true(bool(second_result.get("ok", false)), "month replay second AI/month transition")
	_assert_equal(first.state_sha256(), second.state_sha256(), "same-seed AI/month final digest")
	_assert_equal(first.snapshot().get("rngSeed", -1), second.snapshot().get("rngSeed", -2), "same-seed AI/month final seed")


func _run_tactical_command_slices() -> void:
	# The continuous native-entry path above covers creation and settlement;
	# these fixture-backed sessions execute the representative movement, attack
	# and skill commands on their real Godot TacticalBattleSession boundary.
	var movement_fixture := _read_dictionary("res://data/fixtures/tactical-battle-movement-v1.json")
	var movement_session := TacticalBattleSession.from_snapshot(movement_fixture.get("initialBattle", {}))
	_assert_true(movement_session != null, "movement slice entry")
	if movement_session != null:
		var movement_steps: Array = movement_fixture.get("steps", [])
		for index in range(mini(2, movement_steps.size())):
			var step: Dictionary = movement_steps[index]
			var result := movement_session.execute(step.get("command", {}))
			_assert_true(bool(result.get("ok", false)), "movement slice %s" % step.get("id", index))

	var attack_fixture := _read_dictionary("res://data/fixtures/tactical-battle-attack-v1.json")
	var attack_session := TacticalBattleSession.from_snapshot(attack_fixture.get("initialBattle", {}))
	_assert_true(attack_session != null, "attack slice entry")
	if attack_session != null:
		var attack_result := attack_session.execute(attack_fixture.get("success", {}).get("command", {}))
		_assert_true(bool(attack_result.get("ok", false)), "attack slice command")

	var skill_fixture := _read_dictionary("res://data/fixtures/tactical-battle-skill-v1.json")
	var skill_session := TacticalBattleSession.from_snapshot(skill_fixture.get("initialBattle", {}))
	_assert_true(skill_session != null, "skill slice entry")
	if skill_session != null:
		var skill_result := skill_session.execute(skill_fixture.get("success", {}).get("command", {}))
		_assert_true(bool(skill_result.get("ok", false)), "skill slice command")


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
