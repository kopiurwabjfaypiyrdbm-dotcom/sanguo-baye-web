extends SceneTree

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Commands = preload("res://src/domain/tactical/battle_commands.gd")
const Session = preload("res://src/application/tactical_battle/tactical_battle_session.gd")
const Battlefield = preload("res://src/domain/tactical/battlefield.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")

const FIXTURE_PATH: String = "res://data/fixtures/tactical-battle-movement-v1.json"
const TACTICAL_FIXTURE_PATH: String = "res://data/fixtures/tactical-battle-v1.json"
const CAMPAIGN_PATH: String = "res://data/campaigns/period-1.json"
var _failures := 0
var _assertions := 0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	print("[Godot tactical movement] starting")
	var fixture := _read_dictionary(FIXTURE_PATH)
	if fixture.is_empty():
		quit(1)
		return
	var initial: Dictionary = fixture["initialBattle"]
	_test_factory_integration(fixture)
	var session := Session.from_snapshot(initial)
	_assert_true(session != null, "terrain battle snapshot must restore")
	if session != null:
		_assert_equal(initial["tiles"].size(), fixture["expectedTerrainContract"]["tileCount"], "terrain tile count must match contract")
		_test_queries(fixture)
		_test_web_oracle(fixture)
		_test_steps(fixture, session)
		_test_boundaries(fixture, initial)
		_test_malformed_restore(initial)
	if _failures > 0:
		push_error("[Godot tactical movement] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions])
		quit(1)
		return
	print("[Godot tactical movement] PASSED: %d assertion(s)" % _assertions)
	quit(0)


func _test_factory_integration(fixture: Dictionary) -> void:
	var tactical_fixture := _read_dictionary(TACTICAL_FIXTURE_PATH)
	var campaign := _read_dictionary(CAMPAIGN_PATH)
	if tactical_fixture.is_empty() or campaign.is_empty(): return
	var selected_state: Dictionary = campaign["state"].duplicate(true)
	selected_state["phase"] = "player"
	selected_state["playerFactionId"] = "ruler-1"
	selected_state["activeFactionId"] = "ruler-1"
	for faction_id: Variant in selected_state["factions"].keys():
		selected_state["factions"][faction_id]["isPlayer"] = String(faction_id) == "ruler-1"
	var created: Dictionary = Commands.create(GameState.new(selected_state), tactical_fixture["order"])
	_assert_true(created.get("ok", false), "production create must succeed for movement integration")
	if created.get("ok", false):
		_assert_equal(created["battle"].snapshot(), fixture["initialBattle"], "production create must emit the movement terrain contract")
		_assert_equal(created["receipt"]["battleStateSha256"], _digest(fixture["initialBattle"]), "production create digest must match movement fixture")


func _test_queries(fixture: Dictionary) -> void:
	for query: Dictionary in fixture["queryCases"]:
		var snapshot: Dictionary = query["snapshot"]
		var unit_id := String(query["unitId"])
		var reachable: Array = Battlefield.reachable(snapshot, unit_id)
		if query.has("expectedReachable"):
			_assert_equal(reachable, query["expectedReachable"], "query %s reachable must match oracle" % query["id"])
		if query.has("expectedPath"):
			var destination := Vector2i(int(query["destination"]["x"]), int(query["destination"]["y"]))
			var path: Array = Battlefield.find_path(snapshot, unit_id, destination)
			_assert_equal(path, query["expectedPath"], "query %s path must match oracle" % query["id"])
			var cost := Battlefield.path_cost(snapshot, unit_id, path) if not path.is_empty() else -1
			_assert_equal(cost if cost >= 0 else null, query["expectedCost"], "query %s path cost must match oracle" % query["id"])


func _test_web_oracle(fixture: Dictionary) -> void:
	for query: Dictionary in fixture.get("webOracleCases", []):
		var snapshot: Dictionary = query["snapshot"]
		var unit_id := String(query["unitId"])
		_assert_equal(Battlefield.reachable(snapshot, unit_id), query["expectedReachable"], "direct Web oracle %s reachable must match" % query["id"])
		var destination := Vector2i(int(query["destination"]["x"]), int(query["destination"]["y"]))
		var path: Array = Battlefield.find_path(snapshot, unit_id, destination)
		_assert_equal(path, query["expectedPath"], "direct Web oracle %s path must match" % query["id"])
		_assert_equal(Battlefield.path_cost(snapshot, unit_id, path), query["expectedCost"], "direct Web oracle %s cost must match" % query["id"])


func _test_steps(fixture: Dictionary, session: RefCounted) -> void:
	for step: Dictionary in fixture["steps"]:
		var actual: Dictionary = session.execute(step["command"])
		_assert_equal(actual, step["expected"], "movement step %s must match TypeScript oracle" % step["id"])
	var restored := Session.from_snapshot(session.snapshot())
	_assert_true(restored != null, "movement session must restore after turn transition")
	if restored != null:
		var continuation: Dictionary = fixture["restoredContinuation"]
		_assert_equal(restored.execute(continuation["command"]), continuation["expected"], "restored movement continuation must match oracle")


func _test_boundaries(fixture: Dictionary, initial: Dictionary) -> void:
	for boundary: Dictionary in fixture["boundaryCases"]:
		var snapshot: Dictionary = boundary.get("snapshot", initial).duplicate(true)
		var session := Session.from_snapshot(snapshot)
		_assert_true(session != null, "boundary %s snapshot must restore" % boundary["id"])
		if session == null: continue
		for prelude: Dictionary in boundary.get("prelude", []): session.execute(prelude)
		var actual: Dictionary = session.execute(boundary["command"])
		_assert_equal(actual, boundary["expected"], "boundary %s must match oracle" % boundary["id"])
		if boundary.has("duplicateExpected"):
			_assert_equal(session.execute(boundary["command"]), boundary["duplicateExpected"], "duplicate %s must be idempotent" % boundary["id"])


func _test_malformed_restore(initial: Dictionary) -> void:
	var bad_coordinate := initial.duplicate(true)
	bad_coordinate["tiles"][0]["x"] = 0.5
	_assert_true(Session.from_snapshot(bad_coordinate) == null, "decimal terrain coordinate must be rejected")
	var bad_cost := initial.duplicate(true)
	bad_cost["tiles"][0]["movementCosts"][0] = 0
	_assert_true(Session.from_snapshot(bad_cost) == null, "non-positive movement cost must be rejected")
	var bad_passability := initial.duplicate(true)
	bad_passability["tiles"][0]["passableArms"][0] = false
	_assert_true(Session.from_snapshot(bad_passability) == null, "passability/cost mismatch must be rejected")
	var missing_contract := initial.duplicate(true)
	missing_contract.erase("terrainContractVersion")
	_assert_true(Session.from_snapshot(missing_contract) == null, "terrain tiles without version must be rejected")
	var bad_arms := initial.duplicate(true)
	bad_arms["units"]["officer:officer-1"]["armsType"] = 0.5
	_assert_true(Session.from_snapshot(bad_arms) == null, "fractional arms type must be rejected")
	var bad_mobility := initial.duplicate(true)
	bad_mobility["units"]["officer:officer-1"]["mobility"] = "5"
	_assert_true(Session.from_snapshot(bad_mobility) == null, "non-numeric mobility must be rejected")


func _read_dictionary(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		_fail("fixture is missing: %s" % path)
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


func _digest(value: Variant) -> String:
	var result: Dictionary = Canonical.try_sha256(value)
	return String(result.get("value", "")) if result.get("ok", false) else ""


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if not _equivalent(actual, expected):
		var detail := ""
		if typeof(actual) == TYPE_DICTIONARY and typeof(expected) == TYPE_DICTIONARY:
			var compared_actual: Variant = actual.get("battle", actual)
			var compared_expected: Variant = expected.get("battle", expected)
			detail = "\n  first difference: " + _first_difference(compared_actual, compared_expected, "$.battle", 0)
		_fail("%s%s\n  expected: %s\n  actual:   %s" % [message, detail, str(expected), str(actual)])


func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value: _fail(message)


func _equivalent(actual: Variant, expected: Variant) -> bool:
	var actual_type := typeof(actual); var expected_type := typeof(expected)
	if (actual_type == TYPE_INT or actual_type == TYPE_FLOAT) and (expected_type == TYPE_INT or expected_type == TYPE_FLOAT): return float(actual) == float(expected)
	if actual_type != expected_type: return false
	if actual_type == TYPE_ARRAY:
		if actual.size() != expected.size(): return false
		for index in range(actual.size()):
			if not _equivalent(actual[index], expected[index]): return false
		return true
	if actual_type == TYPE_DICTIONARY:
		if actual.size() != expected.size(): return false
		for key in actual.keys():
			if not expected.has(key) or not _equivalent(actual[key], expected[key]): return false
		return true
	return actual == expected


func _fail(message: String) -> void:
	_failures += 1
	push_error("[Godot tactical movement] %s" % message)


func _first_difference(actual: Variant, expected: Variant, path: String, depth: int) -> String:
	if depth > 5: return path
	if typeof(actual) != typeof(expected): return "%s type %s != %s" % [path, typeof(actual), typeof(expected)]
	if typeof(actual) == TYPE_DICTIONARY:
		for key: Variant in expected.keys():
			if not actual.has(key): return "%s missing key %s" % [path, key]
			var difference := _first_difference(actual[key], expected[key], "%s.%s" % [path, key], depth + 1)
			if difference != "": return difference
		for key: Variant in actual.keys():
			if not expected.has(key): return "%s unexpected key %s" % [path, key]
		return ""
	if typeof(actual) == TYPE_ARRAY:
		if actual.size() != expected.size(): return "%s length %d != %d" % [path, actual.size(), expected.size()]
		for index in range(actual.size()):
			var difference := _first_difference(actual[index], expected[index], "%s[%d]" % [path, index], depth + 1)
			if difference != "": return difference
		return ""
	if (typeof(actual) == TYPE_INT or typeof(actual) == TYPE_FLOAT) and (typeof(expected) == TYPE_INT or typeof(expected) == TYPE_FLOAT):
		return "" if float(actual) == float(expected) else "%s %s != %s" % [path, actual, expected]
	return "" if actual == expected else "%s %s != %s" % [path, actual, expected]
