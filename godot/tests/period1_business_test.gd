extends FlightDeckTest

const GameSession = preload("res://src/application/game_session/game_session.gd")
const CanonicalJson = preload("res://src/domain/validation/canonical_json.gd")
const ENTRY_FIXTURE_PATH := "res://data/fixtures/godot-campaign-entry-v1.json"


func test_period1_campaign_command_and_save_contract() -> void:
	var fixture := _read_dictionary(ENTRY_FIXTURE_PATH)
	assert_false(fixture.is_empty(), "period 1 campaign-entry fixture must load")
	if fixture.is_empty():
		return

	var selection: Dictionary = fixture["selection"]
	var before: Dictionary = fixture["before"]
	var after: Dictionary = fixture["after"]
	var session := GameSession.new("user://flightdeck-period1-business-save.json")
	var started: Dictionary = session.start_campaign(
		int(selection["periodId"]), int(selection["rulerSourceIndex"])
	)
	assert_true(bool(started.get("ok", false)), "period 1 production campaign must start")
	if not bool(started.get("ok", false)):
		return

	var initial_snapshot: Dictionary = session.snapshot()
	assert_equal(
		(initial_snapshot.get("cities", {}) as Dictionary).size(),
		int(before["cityCount"]),
		"period 1 must expose all 38 cities",
	)
	assert_equal(_road_count(initial_snapshot), int(before["roadCount"]), "period 1 road graph must match fixture")
	assert_equal(session.state_sha256(), String(before["stateSha256"]), "period 1 initial state digest must match oracle")
	assert_equal(int(initial_snapshot.get("rngSeed", -1)), int(before["rngSeed"]), "campaign selection must preserve seed")

	var result: Dictionary = session.execute_command(fixture["command"])
	var expected_result: Dictionary = fixture["expectedResult"]
	var result_core := result.duplicate(true)
	result_core.erase("state")
	assert_equal(_digest(result_core), _digest(expected_result), "develop_farming result must match TypeScript fixture")
	assert_equal(session.state_sha256(), String(after["stateSha256"]), "develop_farming after digest must match oracle")
	var after_snapshot: Dictionary = session.snapshot()
	var city: Dictionary = (after_snapshot.get("cities", {}) as Dictionary).get(String(after["cityId"]), {})
	var officer: Dictionary = (after_snapshot.get("officers", {}) as Dictionary).get("officer-1", {})
	assert_equal(int(after_snapshot.get("rngSeed", -1)), int(after["rngSeed"]), "command must preserve deterministic seed result")
	assert_equal(int(city.get("farming", -1)), int(after["farming"]), "farming result must match oracle")
	assert_equal(int(city.get("money", -1)), int(after["money"]), "money result must match oracle")
	assert_equal(int(officer.get("stamina", -1)), int(after["officerStamina"]), "officer stamina must match oracle")

	var saved: Dictionary = session.save_game()
	assert_true(bool(saved.get("ok", false)), "period 1 command result must save")
	if not bool(saved.get("ok", false)):
		return
	var reloaded := GameSession.new("user://flightdeck-period1-business-save.json")
	var loaded: Dictionary = reloaded.load_game()
	assert_true(bool(loaded.get("ok", false)), "period 1 saved result must reload")
	if bool(loaded.get("ok", false)):
		assert_equal(reloaded.state_sha256(), String(after["stateSha256"]), "save/load must preserve final digest")
		assert_equal(
			_digest(reloaded.snapshot()), _digest(session.snapshot()),
			"save/load must preserve canonical final state",
		)


func _read_dictionary(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed as Dictionary if parsed is Dictionary else {}


func _digest(value: Variant) -> String:
	var result: Dictionary = CanonicalJson.try_sha256(value)
	return String(result.get("value", "")) if bool(result.get("ok", false)) else ""


func _road_count(snapshot: Dictionary) -> int:
	var cities: Dictionary = snapshot.get("cities", {})
	var pairs := {}
	for raw_city_id: Variant in cities.keys():
		var city_id := str(raw_city_id)
		var city: Dictionary = cities[city_id]
		for raw_neighbor: Variant in city.get("neighbors", []):
			var neighbor_id := str(raw_neighbor)
			if not cities.has(neighbor_id):
				continue
			var reverse: Array = cities[neighbor_id].get("neighbors", [])
			if not reverse.has(city_id):
				continue
			var left := city_id if city_id < neighbor_id else neighbor_id
			var right := neighbor_id if city_id < neighbor_id else city_id
			pairs["%s\u001f%s" % [left, right]] = true
	return pairs.size()
