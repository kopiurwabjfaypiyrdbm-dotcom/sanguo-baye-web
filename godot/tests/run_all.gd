extends SceneTree

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const CoreLcg = preload("res://src/domain/random/core_lcg.gd")
const DevelopFarming = preload("res://src/domain/commands/develop_farming_command.gd")
const GameSession = preload("res://src/application/game_session/game_session.gd")
const SaveRepository = preload("res://src/application/persistence/json_save_repository.gd")

const PERIOD_PATH: String = "res://data/period-1.json"
const FIXTURE_PATH: String = "res://data/fixtures/develop-farming-v1.json"
const TEST_SAVE_PATH: String = "res://.godot/domain-slice-test-save.json"

var _failures: int = 0
var _assertions: int = 0


func _initialize() -> void:
	print("[Godot domain tests] starting")
	_test_period_structure_and_roads()
	_test_reciprocal_road_validation()
	_test_exact_lcg()
	_test_develop_farming_fixture_and_immutability()
	_test_equipment_intelligence_bonus()
	_test_uint32_shift_boundaries()
	_test_invalid_command_does_not_advance_state()
	_test_spike_contract_rejects_unmigrated_web_states()
	_test_save_load_equivalence()

	if _failures > 0:
		push_error(
			"[Godot domain tests] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions]
		)
		quit(1)
		return
	print("[Godot domain tests] PASSED: %d assertion(s)" % _assertions)
	quit(0)


func _test_period_structure_and_roads() -> void:
	var period: Dictionary = _read_dictionary(PERIOD_PATH)
	if period.is_empty():
		return
	var issues: Array[Dictionary] = Validator.validate(period)
	_assert_equal(issues, [], "period-1 must pass structural and relational validation")
	var cities: Dictionary = period["cities"]
	_assert_equal(cities.size(), 38, "period-1 must contain 38 cities")

	var directed_count: int = 0
	var roads: Dictionary = {}
	var city_order: Array = period["cityOrder"]
	for raw_city_id: Variant in city_order:
		var city_id: String = raw_city_id
		var city: Dictionary = cities[city_id]
		var neighbors: Array = city["neighbors"]
		directed_count += neighbors.size()
		for raw_neighbor_id: Variant in neighbors:
			var neighbor_id: String = raw_neighbor_id
			var neighbor: Dictionary = cities[neighbor_id]
			_assert_true(
				(neighbor["neighbors"] as Array).has(city_id),
				"road %s -> %s must be reciprocal" % [city_id, neighbor_id]
			)
			roads[_road_key(city_id, neighbor_id)] = true
	_assert_equal(directed_count, 108, "period-1 must contain 108 directed neighbor references")
	_assert_equal(roads.size(), 54, "period-1 must contain 54 reciprocal roads")


func _test_reciprocal_road_validation() -> void:
	var period: Dictionary = _read_dictionary(PERIOD_PATH)
	if period.is_empty():
		return
	var broken: Dictionary = period.duplicate(true)
	var cities: Dictionary = broken["cities"]
	var city_three: Dictionary = cities["city-3"]
	var neighbors: Array = city_three["neighbors"]
	neighbors.erase("city-0")
	city_three["neighbors"] = neighbors
	cities["city-3"] = city_three
	broken["cities"] = cities
	var issues: Array[Dictionary] = Validator.validate(broken)
	_assert_issue_contains(issues, "road is not reciprocal", "validator must reject one-way roads")


func _test_exact_lcg() -> void:
	var step: Dictionary = CoreLcg.next_random(48_641)
	_assert_equal(step["seed"], 373_686_124, "LCG successor seed must match the TypeScript oracle")
	_assert_close(
		step["value"],
		373_686_124.0 / 4_294_967_296.0,
		0.000000000000001,
		"LCG normalized value must use the unsigned 32-bit range"
	)


func _test_develop_farming_fixture_and_immutability() -> void:
	var period: Dictionary = _read_dictionary(PERIOD_PATH)
	var fixture: Dictionary = _read_dictionary(FIXTURE_PATH)
	if period.is_empty() or fixture.is_empty():
		return
	var command: Dictionary = fixture["input"]["command"]
	var expected: Dictionary = fixture["expected"]
	var state: GameState = GameState.new(period)
	var unchanged_json: String = JSON.stringify(state.snapshot(), "", true)

	var result: Dictionary = DevelopFarming.execute(
		state,
		command["cityId"],
		command["officerId"]
	)
	_assert_true(result["ok"], "develop-farming fixture command must succeed: %s" % result.get("error", ""))
	if not result["ok"]:
		return
	_assert_json_equal(result["receipt"], expected, "develop-farming receipt must match the full oracle output")
	_assert_equal(
		JSON.stringify(state.snapshot(), "", true),
		unchanged_json,
		"develop-farming must not mutate its input GameState"
	)
	var next_state: GameState = result["next_state"]
	_assert_equal(
		Validator.validate(next_state.snapshot()),
		[],
		"develop-farming output must pass final validation"
	)


func _test_equipment_intelligence_bonus() -> void:
	var period: Dictionary = _read_dictionary(PERIOD_PATH)
	if period.is_empty():
		return
	var equipped: Dictionary = period.duplicate(true)
	var cities: Dictionary = equipped["cities"]
	var city: Dictionary = cities["city-12"]
	var hidden_items: Array = city["hiddenItemIds"]
	hidden_items.erase("item-16")
	city["hiddenItemIds"] = hidden_items
	cities["city-12"] = city
	equipped["cities"] = cities
	var officers: Dictionary = equipped["officers"]
	var officer: Dictionary = officers["officer-1"]
	officer["equipmentItemIds"] = ["item-16"]
	officers["officer-1"] = officer
	equipped["officers"] = officers

	var state: GameState = GameState.new(equipped)
	var result: Dictionary = DevelopFarming.execute(state, "city-12", "officer-1")
	_assert_true(result["ok"], "equipped develop-farming command must succeed: %s" % result.get("error", ""))
	if result["ok"]:
		_assert_equal(
			result["receipt"]["gain"],
			64,
			"item-16 intelligence bonus must contribute to the farming gain"
		)


func _test_uint32_shift_boundaries() -> void:
	var cases: Array[Dictionary] = [
		{"intelligence": 0xffff_ffff, "expected_gain": 3_006_477_105},
		{"intelligence": 0x1_0000_0000, "expected_gain": 858_993_458},
	]
	for test_case: Dictionary in cases:
		var period: Dictionary = _read_dictionary(PERIOD_PATH).duplicate(true)
		var cities: Dictionary = period["cities"]
		var city: Dictionary = cities["city-12"]
		city["farming"] = 0
		city["farmingLimit"] = 9_007_199_254_740_991
		cities["city-12"] = city
		period["cities"] = cities
		var officers: Dictionary = period["officers"]
		var officer: Dictionary = officers["officer-1"]
		officer["intelligence"] = test_case["intelligence"]
		officers["officer-1"] = officer
		period["officers"] = officers
		var result: Dictionary = DevelopFarming.execute(
			GameState.new(period), "city-12", "officer-1"
		)
		_assert_true(
			result["ok"],
			"uint32 intelligence boundary command must succeed: %s" % result.get("error", "")
		)
		if result["ok"]:
			_assert_equal(
				result["receipt"]["gain"],
				test_case["expected_gain"],
				"Godot right shift must match JavaScript ToUint32 semantics"
			)


func _test_invalid_command_does_not_advance_state() -> void:
	var period: Dictionary = _read_dictionary(PERIOD_PATH)
	if period.is_empty():
		return
	var state: GameState = GameState.new(period)
	var before_json: String = JSON.stringify(state.snapshot(), "", true)
	var result: Dictionary = DevelopFarming.execute(state, "unknown-city", "officer-1")
	_assert_true(not result["ok"], "invalid command must fail")
	_assert_equal(
		JSON.stringify(state.snapshot(), "", true),
		before_json,
		"failed validation must leave the input and RNG seed unchanged"
	)


func _test_spike_contract_rejects_unmigrated_web_states() -> void:
	var period: Dictionary = _read_dictionary(PERIOD_PATH)
	if period.is_empty():
		return
	var captive_state: Dictionary = period.duplicate(true)
	var captive_officers: Dictionary = captive_state["officers"]
	var captive: Dictionary = captive_officers["officer-1"]
	captive["status"] = "captive"
	captive_officers["officer-1"] = captive
	captive_state["officers"] = captive_officers
	_assert_issue_contains(
		Validator.validate(captive_state),
		"known officer status",
		"unmigrated captive semantics must be rejected by the spike contract"
	)

	var ordered_state: Dictionary = period.duplicate(true)
	ordered_state["strategicOrders"] = {
		"order-1": {
			"id": "order-1",
			"factionId": "ruler-1",
			"officerId": "officer-1",
			"sourceCityId": "city-12",
			"targetCityId": "city-11",
		},
	}
	_assert_issue_contains(
		Validator.validate(ordered_state),
		"empty in the spike contract",
		"unmigrated strategic orders must be rejected rather than shallowly accepted"
	)


func _test_save_load_equivalence() -> void:
	var session: GameSession = GameSession.new(TEST_SAVE_PATH)
	var started: Dictionary = session.start_period_1()
	_assert_true(started["ok"], "test session must load period-1: %s" % started.get("error", ""))
	if not started["ok"]:
		return
	_assert_equal(
		session.find_default_executor("city-12"),
		"officer-1",
		"default executor selection must follow officerOrder deterministically"
	)
	var command_result: Dictionary = session.execute_develop_farming("city-12", "officer-1")
	_assert_true(command_result["ok"], "session develop-farming command must succeed")
	if not command_result["ok"]:
		return
	var expected_snapshot: Dictionary = session.snapshot()
	var saved: Dictionary = session.save_game()
	_assert_true(saved["ok"], "session save must succeed: %s" % saved.get("error", ""))
	if not saved["ok"]:
		return
	_assert_equal(
		saved["envelope"]["format"],
		"sanguo-baye-godot-spike",
		"Godot spike saves must not reuse the Web envelope identifier"
	)

	var restored_session: GameSession = GameSession.new(TEST_SAVE_PATH)
	var loaded: Dictionary = restored_session.load_game()
	_assert_true(loaded["ok"], "session load must validate and succeed: %s" % loaded.get("error", ""))
	if not loaded["ok"]:
		return
	_assert_equal(
		restored_session.snapshot(),
		expected_snapshot,
		"save/load must preserve the complete authoritative state"
	)
	_assert_equal(
		Validator.validate(restored_session.snapshot()),
		[],
		"loaded state must pass validation"
	)

	var web_envelope: Dictionary = saved["envelope"].duplicate(true)
	web_envelope["format"] = "sanguo-baye-web"
	var file: FileAccess = FileAccess.open(TEST_SAVE_PATH, FileAccess.WRITE)
	_assert_true(file != null, "test must be able to write a mismatched envelope")
	if file != null:
		file.store_string(JSON.stringify(web_envelope, "\t", true))
		file.close()
		var rejected: Dictionary = SaveRepository.new(TEST_SAVE_PATH).load()
		_assert_true(not rejected["ok"], "Godot repository must reject the Web save identifier")
		_assert_true(
			String(rejected["error"]).contains("无法识别"),
			"format rejection must explain that the save format is unknown"
		)


func _read_dictionary(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		_fail("fixture file is missing: %s" % path)
		return {}
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	if file == null:
		_fail("cannot open fixture file: %s" % path)
		return {}
	var parser: JSON = JSON.new()
	var error: Error = parser.parse(file.get_as_text())
	file.close()
	if error != OK:
		_fail("cannot parse %s: %s" % [path, parser.get_error_message()])
		return {}
	if typeof(parser.data) != TYPE_DICTIONARY:
		_fail("fixture root is not an object: %s" % path)
		return {}
	return parser.data


func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value:
		_fail(message)


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if not _values_equivalent(actual, expected):
		_fail("%s\n  expected: %s\n  actual:   %s" % [message, str(expected), str(actual)])


func _assert_json_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	var actual_json: String = JSON.stringify(actual, "", true)
	var expected_json: String = JSON.stringify(expected, "", true)
	if not _values_equivalent(actual, expected):
		_fail("%s\n  expected: %s\n  actual:   %s" % [message, expected_json, actual_json])


func _values_equivalent(actual: Variant, expected: Variant) -> bool:
	var actual_type: int = typeof(actual)
	var expected_type: int = typeof(expected)
	var actual_is_number: bool = actual_type == TYPE_INT or actual_type == TYPE_FLOAT
	var expected_is_number: bool = expected_type == TYPE_INT or expected_type == TYPE_FLOAT
	if actual_is_number and expected_is_number:
		return float(actual) == float(expected)
	if actual_type != expected_type:
		return false
	if actual_type == TYPE_ARRAY:
		var actual_array: Array = actual
		var expected_array: Array = expected
		if actual_array.size() != expected_array.size():
			return false
		for index: int in range(actual_array.size()):
			if not _values_equivalent(actual_array[index], expected_array[index]):
				return false
		return true
	if actual_type == TYPE_DICTIONARY:
		var actual_dictionary: Dictionary = actual
		var expected_dictionary: Dictionary = expected
		if actual_dictionary.size() != expected_dictionary.size():
			return false
		for key: Variant in actual_dictionary.keys():
			if not expected_dictionary.has(key) \
					or not _values_equivalent(actual_dictionary[key], expected_dictionary[key]):
				return false
		return true
	return actual == expected


func _assert_close(
		actual: float,
		expected: float,
		tolerance: float,
		message: String,
) -> void:
	_assertions += 1
	if absf(actual - expected) > tolerance:
		_fail("%s\n  expected: %.16f\n  actual:   %.16f" % [message, expected, actual])


func _assert_issue_contains(
		issues: Array[Dictionary],
		text: String,
		message: String,
) -> void:
	_assertions += 1
	for issue: Dictionary in issues:
		if String(issue.get("message", "")).contains(text):
			return
	_fail("%s\n  issues: %s" % [message, str(issues)])


func _fail(message: String) -> void:
	_failures += 1
	push_error("[Godot domain tests] %s" % message)


func _road_key(left: String, right: String) -> String:
	return "%s|%s" % [left, right] if left < right else "%s|%s" % [right, left]
