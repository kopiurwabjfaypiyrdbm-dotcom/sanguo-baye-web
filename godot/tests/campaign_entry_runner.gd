extends SceneTree

const GameSession = preload("res://src/application/game_session/game_session.gd")
const CanonicalJson = preload("res://src/domain/validation/canonical_json.gd")
const FIXTURE_PATH := "res://data/fixtures/godot-campaign-entry-v1.json"

var _assertions := 0
var _failures := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var fixture := _read_fixture()
	if fixture.is_empty():
		quit(1)
		return
	var session := GameSession.new("user://mb21-campaign-entry-save.json")
	var selection: Dictionary = fixture["selection"]
	var started: Dictionary = session.start_campaign(int(selection["periodId"]), int(selection["rulerSourceIndex"]))
	_assert_true(started.get("ok", false), "production campaign selection must start")
	if started.get("ok", false):
		var before: Dictionary = fixture["before"]
		var snapshot: Dictionary = session.snapshot()
		var campaign: Dictionary = session.campaign_descriptor()
		_assert_canonical_equal(campaign, fixture["campaign"], "complete campaign descriptor must preserve fixture identity")
		_assert_equal(session.state_sha256(), before["stateSha256"], "initial state digest must match TypeScript oracle")
		_assert_equal(int(snapshot.get("rngSeed", -1)), int(before["rngSeed"]), "selection must not consume RNG")
		_assert_equal((snapshot.get("cities", {}) as Dictionary).size(), int(before["cityCount"]), "entry must expose all cities")
		_assert_equal(_road_count(snapshot), int(before["roadCount"]), "entry must expose reciprocal road graph")
		var result: Dictionary = session.execute_command(fixture["command"])
		var expected: Dictionary = fixture["expectedResult"]
		var result_core := result.duplicate(true)
		result_core.erase("state")
		_assert_canonical_equal(result_core, expected, "complete command result envelope must match TypeScript oracle")
		var after: Dictionary = fixture["after"]
		var after_snapshot: Dictionary = session.snapshot()
		_assert_equal(session.state_sha256(), after["stateSha256"], "command after digest must match TypeScript oracle")
		_assert_equal(int(after_snapshot.get("rngSeed", -1)), int(after["rngSeed"]), "command RNG result must match TypeScript oracle")
		var city: Dictionary = (after_snapshot.get("cities", {}) as Dictionary).get(after["cityId"], {})
		var officer: Dictionary = (after_snapshot.get("officers", {}) as Dictionary).get("officer-1", {})
		_assert_equal(int(city.get("farming", -1)), int(after["farming"]), "farming result must match TypeScript oracle")
		_assert_equal(int(city.get("money", -1)), int(after["money"]), "money result must match TypeScript oracle")
		_assert_equal(int(officer.get("stamina", -1)), int(after["officerStamina"]), "officer stamina must match TypeScript oracle")

	if _failures > 0:
		push_error("[Godot campaign entry] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions])
		quit(1)
		return
	print("[Godot campaign entry] PASSED: %d assertion(s)" % _assertions)
	quit(0)


func _read_fixture() -> Dictionary:
	if not FileAccess.file_exists(FIXTURE_PATH):
		push_error("missing campaign-entry fixture: %s" % FIXTURE_PATH)
		return {}
	var parser := JSON.new()
	if parser.parse(FileAccess.get_file_as_string(FIXTURE_PATH)) != OK or not parser.data is Dictionary:
		push_error("invalid campaign-entry fixture")
		return {}
	return parser.data as Dictionary


func _road_count(snapshot: Dictionary) -> int:
	var cities: Dictionary = snapshot.get("cities", {})
	var pairs := {}
	for raw_city_id: Variant in cities.keys():
		var city_id := str(raw_city_id)
		var city: Dictionary = cities[city_id]
		for raw_neighbor: Variant in city.get("neighbors", []):
			var neighbor_id := str(raw_neighbor)
			if not cities.has(neighbor_id): continue
			var reverse: Array = cities[neighbor_id].get("neighbors", [])
			if not reverse.has(city_id): continue
			var left := city_id if city_id < neighbor_id else neighbor_id
			var right := neighbor_id if city_id < neighbor_id else city_id
			pairs["%s\u001f%s" % [left, right]] = true
	return pairs.size()


func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value:
		_failures += 1
		push_error("[Godot campaign entry] %s" % message)


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assert_true(actual == expected, "%s (expected %s, got %s)" % [message, expected, actual])


func _assert_canonical_equal(actual: Variant, expected: Variant, message: String) -> void:
	var actual_digest := CanonicalJson.try_sha256(actual)
	var expected_digest := CanonicalJson.try_sha256(expected)
	_assert_true(actual_digest.get("ok", false) and expected_digest.get("ok", false)
		and actual_digest.get("value", "") == expected_digest.get("value", ""), message)
