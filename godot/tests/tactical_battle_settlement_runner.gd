extends SceneTree

const GameSession = preload("res://src/application/game_session/game_session.gd")
const TacticalBattleSession = preload("res://src/application/tactical_battle/tactical_battle_session.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const FIXTURE_PATH := "res://data/fixtures/tactical-battle-settlement-v1.json"
var _failures := 0
var _assertions := 0


func _initialize() -> void:
	var fixture := _read_dictionary(FIXTURE_PATH)
	if fixture.is_empty(): quit(1); return
	var session := GameSession.new()
	var started := session.start_campaign(1, 1)
	_assert_true(bool(started.get("ok", false)), "production campaign must start for settlement")
	if not bool(started.get("ok", false)): quit(1); return
	_assert_equal(_digest(session.snapshot()), fixture["initialStateSha256"], "campaign state must match Web settlement fixture")
	var command := _command("battle-settlement-0001", _digest(session.snapshot()), fixture["result"])
	var settled := session.execute_command(command)
	_assert_true(bool(settled.get("ok", false)), "settlement command must succeed: %s" % settled.get("error", ""))
	_assert_equal(settled.get("beforeStateSha256", ""), fixture["initialStateSha256"], "settlement must report before digest")
	_assert_equal(settled.get("afterStateSha256", ""), fixture["expectedStateSha256"], "settlement must report after digest")
	_assert_equal(settled.get("state", {}), fixture["expectedState"], "campaign result must match Web applyBattleResult fixture")
	var duplicate := session.execute_command(command)
	_assert_equal(session.state_sha256(), fixture["expectedStateSha256"], "repeated settlement must not mutate campaign state")
	_assert_equal(duplicate.get("afterStateSha256", ""), fixture["expectedStateSha256"], "repeated settlement must preserve final digest")
	_assert_equal(duplicate.get("state", {}), fixture["expectedState"], "repeated settlement must preserve campaign state")
	var conflict_command := _command("battle-settlement-0001", _digest(session.snapshot()), fixture["result"])
	conflict_command["parameters"]["battleResult"] = {}
	var conflict := session.execute_command(conflict_command)
	_assert_equal(conflict.get("code", ""), "command_id_conflict", "conflicting settlement id must be rejected")
	var stale := session.execute_command(_command("battle-settlement-stale", fixture["initialStateSha256"], fixture["result"]))
	_assert_equal(stale.get("code", ""), "stale_state", "stale settlement digest must be rejected")
	var restored := GameSession.new()
	var restored_result := restored.restore_snapshot(fixture["expectedState"])
	_assert_true(bool(restored_result.get("ok", false)), "post-settlement snapshot must restore")
	var replay := restored.execute_command(_command("battle-settlement-replay", fixture["initialStateSha256"], fixture["result"]))
	_assert_equal(replay.get("code", ""), "stale_state", "restored post-settlement state must not settle twice")
	var malformed_result: Dictionary = fixture["result"].duplicate(true); malformed_result["winner"] = "invalid"
	var malformed := restored.execute_command(_command("battle-settlement-malformed", _digest(restored.snapshot()), malformed_result))
	_assert_true(not bool(malformed.get("ok", false)), "malformed battle result must be rejected")
	_assert_equal(restored.state_sha256(), _digest(fixture["expectedState"]), "malformed settlement must not mutate restored state")
	var guard_session := GameSession.new(); guard_session.start_campaign(1, 1)
	var bad_guard_result: Dictionary = fixture["result"].duplicate(true); bad_guard_result["guard"] = (fixture["result"]["guard"] as Dictionary).duplicate(true); bad_guard_result["guard"]["strategicFingerprint"] = "stale"
	var bad_guard := guard_session.execute_command(_command("battle-settlement-bad-guard", fixture["initialStateSha256"], bad_guard_result))
	_assert_true(not bool(bad_guard.get("ok", false)), "stale guard fingerprint must be rejected")
	_assert_equal(guard_session.state_sha256(), fixture["initialStateSha256"], "stale guard rejection must preserve state")
	var bad_casualty_result: Dictionary = fixture["result"].duplicate(true); bad_casualty_result["casualties"] = (fixture["result"]["casualties"] as Dictionary).duplicate(true); bad_casualty_result["casualties"]["officer-0"] = 1
	var bad_casualty := guard_session.execute_command(_command("battle-settlement-bad-casualty", fixture["initialStateSha256"], bad_casualty_result))
	_assert_true(not bool(bad_casualty.get("ok", false)), "non-participant casualty must be rejected")
	_assert_equal(guard_session.state_sha256(), fixture["initialStateSha256"], "casualty rejection must preserve state")
	var bad_logs_result: Dictionary = fixture["result"].duplicate(true); bad_logs_result["logs"] = "not-an-array"
	var bad_logs := guard_session.execute_command(_command("battle-settlement-bad-logs", fixture["initialStateSha256"], bad_logs_result))
	_assert_true(not bool(bad_logs.get("ok", false)), "non-array logs must be rejected")
	_assert_equal(guard_session.state_sha256(), fixture["initialStateSha256"], "logs rejection must preserve state")
	var bad_experience_result: Dictionary = fixture["result"].duplicate(true); bad_experience_result["experienceGains"] = (fixture["result"]["experienceGains"] as Dictionary).duplicate(true); bad_experience_result["experienceGains"]["officer-1"] = "not-an-integer"
	var bad_experience := guard_session.execute_command(_command("battle-settlement-bad-experience", fixture["initialStateSha256"], bad_experience_result))
	_assert_true(not bool(bad_experience.get("ok", false)), "non-integer experience must be rejected")
	_assert_equal(guard_session.state_sha256(), fixture["initialStateSha256"], "experience rejection must preserve state")
	var bad_parameters := _command("battle-settlement-bad-parameters", fixture["initialStateSha256"], fixture["result"])
	bad_parameters["parameters"]["unknown"] = true
	var bad_parameters_result := guard_session.execute_command(bad_parameters)
	_assert_true(not bool(bad_parameters_result.get("ok", false)), "unknown settlement parameter must be rejected")
	var pre_restored := GameSession.new()
	var pre_restore_result := pre_restored.restore_snapshot(fixture["initialState"])
	_assert_true(bool(pre_restore_result.get("ok", false)), "pre-settlement snapshot must restore")
	if bool(pre_restore_result.get("ok", false)):
		var pre_replay := pre_restored.execute_command(_command("battle-settlement-pre-replay", fixture["initialStateSha256"], fixture["result"]))
		_assert_true(bool(pre_replay.get("ok", false)), "restored pre-settlement snapshot must settle")
		_assert_equal(pre_replay.get("afterStateSha256", ""), fixture["expectedStateSha256"], "pre-settlement restore must reproduce final digest")
	var attacker_fixture: Dictionary = fixture.get("attackerWin", {})
	var tactical_fixture := _read_dictionary("res://data/fixtures/tactical-battle-v1.json")
	var terminal_battle: Dictionary = (tactical_fixture.get("create", {}).get("expectedBattle", {}) as Dictionary).duplicate(true)
	terminal_battle["phase"] = "ended"; terminal_battle["status"] = "attacker-won"; terminal_battle["outcome"] = "annihilation"
	terminal_battle["units"]["officer:officer-1"]["troops"] = 80
	terminal_battle["units"]["officer:officer-10"]["troops"] = 70
	terminal_battle["experienceGains"] = {"officer-10": 150, "officer-1": 50}; terminal_battle["experienceGainOrder"] = ["officer-10", "officer-1"]
	var tactical_session := TacticalBattleSession.from_snapshot(terminal_battle)
	_assert_true(tactical_session != null, "real tactical terminal snapshot must restore")
	if tactical_session != null and not attacker_fixture.is_empty():
		var settle_battle := tactical_session.execute({"commandEnvelopeVersion": 1, "commandId": "real-settle-battle", "expectedBattleStateSha256": tactical_session.state_sha256(), "kind": "settle_battle", "parameters": {}})
		_assert_true(bool(settle_battle.get("ok", false)), "real settle_battle command must succeed")
		_assert_equal(settle_battle.get("settlement", {}), attacker_fixture["result"], "real settle_battle result must carry experience order into strategic settlement")
	var attacker_session := GameSession.new()
	var attacker_started := attacker_session.start_campaign(1, 1)
	_assert_true(bool(attacker_started.get("ok", false)), "attacker-win settlement campaign must start")
	if bool(attacker_started.get("ok", false)) and not attacker_fixture.is_empty():
		var attacker_result := attacker_session.execute_command(_command("battle-settlement-attacker-win", fixture["initialStateSha256"], attacker_fixture["result"]))
		_assert_true(bool(attacker_result.get("ok", false)), "attacker-win settlement must succeed: %s" % attacker_result.get("error", ""))
		_assert_equal(attacker_result.get("afterStateSha256", ""), attacker_fixture["expectedStateSha256"], "attacker-win settlement digest must match Web")
		_assert_equal(attacker_result.get("state", {}), attacker_fixture["expectedState"], "attacker-win settlement state must match Web")
	if _failures > 0:
		push_error("[Godot tactical settlement] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions]); quit(1); return
	print("[Godot tactical settlement] PASSED: %d assertion(s)" % _assertions); quit(0)


func _command(id: String, expected: String, result: Dictionary) -> Dictionary:
	return {"commandEnvelopeVersion": 1, "commandId": id, "expectedStateSha256": expected, "kind": "settle_tactical_battle", "parameters": {"battleResult": result.duplicate(true)}}


func _digest(value: Variant) -> String:
	var result := Canonical.try_sha256(value); return String(result.get("value", ""))


func _read_dictionary(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null: _fail("fixture missing"); return {}
	var parser := JSON.new(); var error := parser.parse(file.get_as_text()); file.close()
	if error != OK or typeof(parser.data) != TYPE_DICTIONARY: _fail("fixture invalid"); return {}
	return parser.data


func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value: _fail(message)


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if not _equivalent(actual, expected): _fail("%s\n diff=%s" % [message, _first_diff(actual, expected)])


func _first_diff(actual: Variant, expected: Variant, path: String = "$") -> String:
	if (typeof(actual) in [TYPE_INT, TYPE_FLOAT]) and (typeof(expected) in [TYPE_INT, TYPE_FLOAT]): return "" if float(actual) == float(expected) else "%s numeric %s != %s" % [path, str(actual), str(expected)]
	if typeof(actual) != typeof(expected): return "%s type %s != %s" % [path, typeof(actual), typeof(expected)]
	if typeof(actual) == TYPE_DICTIONARY:
		for key: Variant in expected.keys():
			if not actual.has(key): return "%s missing actual key %s" % [path, str(key)]
			var nested := _first_diff(actual[key], expected[key], "%s.%s" % [path, str(key)])
			if not nested.is_empty(): return nested
		for key: Variant in actual.keys():
			if not expected.has(key): return "%s unexpected actual key %s" % [path, str(key)]
		return ""
	if typeof(actual) == TYPE_ARRAY:
		if actual.size() != expected.size(): return "%s array size %d != %d" % [path, actual.size(), expected.size()]
		for index in range(actual.size()):
			var nested := _first_diff(actual[index], expected[index], "%s[%d]" % [path, index])
			if not nested.is_empty(): return nested
		return ""
	return "" if actual == expected else "%s %s != %s" % [path, str(actual), str(expected)]


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
	_failures += 1; push_error("[Godot tactical settlement] %s" % message)
