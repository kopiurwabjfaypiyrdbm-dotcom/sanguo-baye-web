extends SceneTree

const Attack = preload("res://src/domain/tactical/battle_attack.gd")
const Session = preload("res://src/application/tactical_battle/tactical_battle_session.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")

const FIXTURE_PATH := "res://data/fixtures/tactical-battle-attack-v1.json"
var _failures := 0
var _assertions := 0

func _init() -> void:
	call_deferred("_run")

func _run() -> void:
	print("[Godot tactical attack] starting")
	var fixture := _read_dictionary(FIXTURE_PATH)
	if fixture.is_empty(): quit(1); return
	var initial: Dictionary = fixture["initialBattle"]
	var session := Session.from_snapshot(initial)
	_assert_true(session != null, "attack battle snapshot must restore")
	if session != null:
		_test_web_oracle(fixture)
		_test_success(fixture, session)
		_test_defeat_and_dunjia(fixture)
		_test_restored(fixture)
		_test_boundaries(fixture)
		_test_malformed_restore(initial)
	if _failures > 0:
		push_error("[Godot tactical attack] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions]); quit(1); return
	print("[Godot tactical attack] PASSED: %d assertion(s)" % _assertions)
	quit(0)

func _test_web_oracle(fixture: Dictionary) -> void:
	var initial: Dictionary = fixture["initialBattle"]
	var unit_id := String(fixture["success"]["command"]["parameters"]["unitId"])
	var target_id := String(fixture["expected"]["targetId"])
	_assert_equal(Attack.attackable_ids(initial, unit_id), fixture["webOracle"]["attackableUnitIds"], "attackable targets must match Web oracle")
	_assert_equal(fixture["webOracle"]["failure"]["error"], fixture["boundaryCases"][1]["expected"]["error"], "unknown-target failure must come from the Web oracle")
	var preview := Attack.preview(initial, unit_id, target_id)
	_assert_true(preview.has("damage"), "attack preview must succeed")
	if preview.has("damage"):
		_assert_equal(preview, fixture["webOracle"]["preview"], "attack preview must match Web oracle")

func _test_success(fixture: Dictionary, session: RefCounted) -> void:
	var actual: Dictionary = session.execute(fixture["success"]["command"])
	if not actual.get("ok", false): print("[Godot tactical attack] success error=", actual.get("error", ""))
	_assert_equal(actual, fixture["success"]["expected"], "ordinary attack result must match TypeScript oracle")
	_assert_equal(actual["receipt"]["details"]["seedBefore"], actual["receipt"]["details"]["seedAfter"], "ordinary attack must not consume RNG")

func _test_defeat_and_dunjia(fixture: Dictionary) -> void:
	for key: String in ["defeatCase", "dunjiaCase"]:
		var case_data: Dictionary = fixture[key]
		var session := Session.from_snapshot(case_data["initialBattle"])
		_assert_true(session != null, "%s snapshot must restore" % key)
		if session != null: _assert_equal(session.execute(case_data["command"]), case_data["expected"], "%s must match TypeScript oracle" % key)
	var defeat_battle: Dictionary = fixture["defeatCase"]["expected"]["battle"]
	var defeat_target := String(fixture["success"]["command"]["parameters"]["targetUnitId"])
	_assert_equal(defeat_battle["units"][defeat_target]["troops"], fixture["expected"]["zeroTroopsAfter"], "defeat case must clamp target troops to zero")
	_assert_equal(fixture["dunjiaCase"]["expected"]["receipt"]["details"]["damage"], fixture["expected"]["dunjiaDamage"], "dunjia reduction must be deterministic")

func _test_restored(fixture: Dictionary) -> void:
	var continuation: Dictionary = fixture["restoredContinuation"]
	var session := Session.from_snapshot(fixture["initialBattle"])
	_assert_true(session != null, "restored continuation snapshot must restore")
	if session != null: _assert_equal(session.execute(continuation["command"]), continuation["expected"], "restored attack continuation must match oracle")

func _test_boundaries(fixture: Dictionary) -> void:
	for boundary: Dictionary in fixture["boundaryCases"]:
		var snapshot: Dictionary = boundary.get("snapshot", fixture["initialBattle"]).duplicate(true)
		var session := Session.from_snapshot(snapshot)
		_assert_true(session != null, "boundary %s snapshot must restore" % boundary["id"])
		if session == null: continue
		for prelude: Dictionary in boundary.get("prelude", []): session.execute(prelude)
		_assert_equal(session.execute(boundary["command"]), boundary["expected"], "boundary %s must match oracle" % boundary["id"])
		if boundary.has("duplicateExpected"): _assert_equal(session.execute(boundary["command"]), boundary["duplicateExpected"], "duplicate %s must be idempotent" % boundary["id"])

func _test_malformed_restore(initial: Dictionary) -> void:
	for case_data: Dictionary in [
		{"key": "armsType", "value": 6, "message": "arms type upper bound"},
		{"key": "mobility", "value": 9, "message": "mobility upper bound"},
		{"key": "force", "value": 256, "message": "force upper bound"},
		{"key": "intelligence", "value": -1, "message": "intelligence lower bound"},
		{"key": "level", "value": 256, "message": "level upper bound"},
		{"key": "status", "value": "unknown", "message": "status allowlist"},
		{"key": "status", "value": {"bad": true}, "message": "status type"},
		{"key": "normalAttackPatternOverride", "value": "wide-open", "message": "attack pattern allowlist"},
	]:
		var malformed := initial.duplicate(true)
		malformed["units"]["officer:officer-1"][case_data["key"]] = case_data["value"]
		_assert_true(Session.from_snapshot(malformed) == null, "malformed %s must be rejected" % case_data["message"])
	var bad_commander := initial.duplicate(true); bad_commander["commanderUnitIds"]["defender"] = "officer:officer-1"
	_assert_true(Session.from_snapshot(bad_commander) == null, "cross-side commander reference must be rejected")
	var bad_commander_type := initial.duplicate(true); bad_commander_type["commanderUnitIds"]["defender"] = []
	_assert_true(Session.from_snapshot(bad_commander_type) == null, "non-string commander reference must be rejected without a validator crash")
	var bad_experience := initial.duplicate(true); bad_experience["experienceGains"]["officer-1"] = -1
	_assert_true(Session.from_snapshot(bad_experience) == null, "negative experience gain must be rejected")
	var anonymous_attacker := initial.duplicate(true)
	anonymous_attacker["units"]["officer:officer-1"]["officerId"] = ""
	var anonymous_session := Session.from_snapshot(anonymous_attacker)
	_assert_true(anonymous_session != null, "anonymous attacker snapshot must restore for experience guard")
	if anonymous_session != null:
		var anonymous_command := {"commandEnvelopeVersion": 1, "commandId": "attack-anonymous-0020", "expectedBattleStateSha256": _digest(anonymous_attacker), "kind": "attack_unit", "parameters": {"unitId": "officer:officer-1", "targetUnitId": "officer:officer-81"}}
		var anonymous_result: Dictionary = anonymous_session.execute(anonymous_command)
		_assert_true(anonymous_result.get("ok", false), "anonymous attacker attack must execute")
		_assert_true(not anonymous_result.get("battle", {}).get("experienceGains", {}).has(""), "anonymous attacker must not write an empty experience key")
	var missing_tiles := initial.duplicate(true); missing_tiles.erase("tiles")
	_assert_true(Session.from_snapshot(missing_tiles) == null, "attack snapshot without terrain must be rejected")
	var bad_units := initial.duplicate(true); bad_units["units"] = []
	_assert_true(Session.from_snapshot(bad_units) == null, "non-object units container must be rejected without a validator crash")

func _read_dictionary(path: String) -> Dictionary:
	if not FileAccess.file_exists(path): _fail("fixture is missing: %s" % path); return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null: _fail("cannot open fixture: %s" % path); return {}
	var parser := JSON.new(); var error := parser.parse(file.get_as_text()); file.close()
	if error != OK or typeof(parser.data) != TYPE_DICTIONARY: _fail("cannot parse fixture: %s" % path); return {}
	return parser.data

func _digest(value: Variant) -> String:
	var result: Dictionary = Canonical.try_sha256(value)
	return String(result.get("value", "")) if result.get("ok", false) else ""

func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if not _equivalent(actual, expected): _fail("%s\n  first difference: %s\n  expected: %s\n  actual: %s" % [message, _first_difference(actual, expected, "$", 0), str(expected), str(actual)])

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
	if typeof(actual) != typeof(expected): return "%s type %s != %s" % [path, typeof(actual), typeof(expected)]
	if typeof(actual) == TYPE_DICTIONARY:
		for key: Variant in expected.keys():
			if not actual.has(key): return "%s missing %s" % [path, key]
			var diff := _first_difference(actual[key], expected[key], "%s.%s" % [path, key], depth + 1)
			if diff != "": return diff
		for key: Variant in actual.keys():
			if not expected.has(key): return "%s unexpected %s" % [path, key]
		return ""
	if typeof(actual) == TYPE_ARRAY:
		if actual.size() != expected.size(): return "%s length %d != %d" % [path, actual.size(), expected.size()]
		for i in range(actual.size()):
			var diff := _first_difference(actual[i], expected[i], "%s[%d]" % [path, i], depth + 1)
			if diff != "": return diff
		return ""
	if (typeof(actual) == TYPE_INT or typeof(actual) == TYPE_FLOAT) and (typeof(expected) == TYPE_INT or typeof(expected) == TYPE_FLOAT): return "" if float(actual) == float(expected) else "%s %s != %s" % [path, actual, expected]
	return "" if actual == expected else "%s %s != %s" % [path, actual, expected]

func _fail(message: String) -> void:
	_failures += 1
	push_error("[Godot tactical attack] %s" % message)
