extends SceneTree

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const CoreLcg = preload("res://src/domain/random/core_lcg.gd")
const DevelopFarming = preload("res://src/domain/commands/develop_farming_command.gd")
const StrategicOrders = preload("res://src/domain/commands/strategic_order_commands.gd")
const DiplomaticOrders = preload("res://src/domain/commands/diplomatic_order_commands.gd")
const CalendarEvents = preload("res://src/domain/progression/calendar_events.gd")
const BayeDiplomacy = preload("res://src/domain/compat/baye/baye_diplomacy.gd")
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
	_test_baye_diplomacy_rng_contract()
	_test_develop_farming_fixture_and_immutability()
	_test_equipment_intelligence_bonus()
	_test_uint32_shift_boundaries()
	_test_invalid_command_does_not_advance_state()
	_test_runtime_rejects_unsafe_integer_state()
	_test_strategic_order_lifecycle_cancellation()
	_test_diplomatic_order_application_bridge()
	_test_diplomatic_order_termination_and_invalid_executor()
	_test_calendar_and_city_event_contract()
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


func _test_baye_diplomacy_rng_contract() -> void:
	_assert_equal(
		BayeDiplomacy.roll("alienate", 100, 50, 0, 0, 1),
		{"ok": true, "error": "", "success": true, "seed": 2_165_703_038},
		"alienate must preserve the fixed comparison and draw order",
	)
	_assert_equal(
		BayeDiplomacy.roll("counterespionage", 100, 50, 0, 3, 1),
		{"ok": true, "error": "", "success": true, "seed": 217_083_232},
		"counterespionage must preserve success report draws",
	)
	_assert_equal(
		BayeDiplomacy.roll("canvass", 100, 0, 0, 1, 2),
		{"ok": true, "error": "", "success": true, "seed": 3_079_534_013, "recruitedLoyalty": 69},
		"canvass must use the fourth draw for recruited loyalty",
	)
	_assert_true(
		BayeDiplomacy.roll("canvass", 10, 100, 0, 1, 2)["success"],
		"canvass must preserve unsigned IQ subtraction",
	)
	_assert_equal(
		BayeDiplomacy.roll("induce", 100, 50, 100, 4, 8),
		{"ok": true, "error": "", "success": true, "seed": 18_026_106},
		"AI induce must skip the player report draw",
	)
	_assert_equal(
		BayeDiplomacy.roll("induce", 100, 50, 100, 4, 8, true),
		{"ok": true, "error": "", "success": true, "seed": 1_276_464_017},
		"player induce must preserve its report draw",
	)


func _test_strategic_order_lifecycle_cancellation() -> void:
	var session: GameSession = GameSession.new()
	var started: Dictionary = session.start_campaign(1, 5)
	_assert_true(started["ok"], "strategic lifecycle campaign must start")
	if not started["ok"]: return
	var before: Dictionary = session.snapshot()
	var issued: Dictionary = StrategicOrders.execute(GameState.new(before), "issue_transport_order", {
		"sourceCityId": "city-0", "targetCityId": "city-3", "officerId": "officer-56",
		"cargo": {"money": 10, "food": 20, "reserveTroops": 0},
	})
	_assert_true(issued["ok"], "lifecycle cancellation transport must issue")
	if not issued["ok"]: return
	var in_transit: Dictionary = issued["next_state"].snapshot()
	var canceled: Dictionary = StrategicOrders.cancel_officer_orders(in_transit, "officer-56", "生命周期测试")
	_assert_true(canceled["ok"], "lifecycle cancellation must return a recoverable result")
	if canceled["ok"]:
		var next: Dictionary = canceled["next"]
		_assert_equal(next["strategicOrders"], {}, "lifecycle cancellation must remove the active order")
		_assert_equal(next["cities"]["city-0"]["money"], before["cities"]["city-0"]["money"], "lifecycle cancellation must restore money")
		_assert_equal(next["cities"]["city-0"]["food"], before["cities"]["city-0"]["food"], "lifecycle cancellation must restore food")
		_assert_equal(next["officers"]["officer-56"]["cityId"], "city-0", "lifecycle cancellation must return the executor")
		_assert_equal(next["logs"][-1]["message"], "strategic-order-1因生命周期测试而终止，10 金、20 粮由西凉接收。", "lifecycle cancellation log must match Web wording")
		_assert_equal(Validator.validate_runtime(next), [], "lifecycle cancellation output must validate")
	_assert_true(in_transit["strategicOrders"].has("strategic-order-1"), "lifecycle cancellation must not mutate its input")
	var impossible: Dictionary = in_transit.duplicate(true)
	for city_id: Variant in impossible["cityOrder"]: impossible["cities"][city_id]["money"] = 9_007_199_254_740_991
	var rejected: Dictionary = StrategicOrders.cancel_officer_orders(impossible, "officer-56", "生命周期测试")
	_assert_true(not rejected["ok"], "unsettleable lifecycle cancellation must fail explicitly")
	_assert_true(impossible["strategicOrders"].has("strategic-order-1"), "failed lifecycle cancellation must retain the input order")


func _test_diplomatic_order_application_bridge() -> void:
	var session: GameSession = GameSession.new()
	var started: Dictionary = session.start_campaign(1, 1)
	_assert_true(started["ok"], "diplomatic bridge campaign must start")
	if not started["ok"]: return
	var initial_seed: int = int(session.snapshot()["rngSeed"])
	var recon: Dictionary = session.execute_command({
		"commandEnvelopeVersion": 1, "commandId": "domain-diplomacy-recon",
		"expectedStateSha256": session.state_sha256(), "kind": "reconnoitre_city",
		"parameters": {"sourceCityId": "city-12", "targetCityId": "city-0", "officerId": "officer-32"},
	})
	_assert_true(recon["ok"], "diplomatic bridge reconnaissance must succeed")
	if not recon["ok"]: return
	var before_issue: Dictionary = session.snapshot()
	var issued: Dictionary = session.execute_command({
		"commandEnvelopeVersion": 1, "commandId": "domain-diplomacy-issue",
		"expectedStateSha256": session.state_sha256(), "kind": "issue_alienate_order",
		"parameters": {"sourceCityId": "city-12", "officerId": "officer-1", "targetOfficerId": "officer-56"},
	})
	_assert_true(issued["ok"], "diplomatic bridge alienate order must issue")
	if not issued["ok"]: return
	var issued_state: Dictionary = session.snapshot()
	_assert_true(issued_state["diplomaticOrders"].has("diplomatic-order-1"), "issued diplomacy must persist as an active order")
	_assert_equal(issued_state["cities"]["city-12"]["money"], int(before_issue["cities"]["city-12"]["money"]) - 50, "classic alienate must debit 50 money")
	_assert_equal(issued_state["officers"]["officer-1"]["stamina"], int(before_issue["officers"]["officer-1"]["stamina"]) - 20, "classic alienate must debit 20 stamina")
	_assert_true(not issued_state["officers"]["officer-1"].has("cityId"), "diplomatic executor must be in transit")
	_assert_equal(issued_state["rngSeed"], initial_seed, "issuing diplomacy must not consume RNG")
	var settled: Dictionary = session.advance_diplomatic_orders()
	_assert_true(settled["ok"], "diplomatic bridge advance must settle: %s" % settled.get("error", ""))
	if not settled["ok"]: return
	var settled_state: Dictionary = session.snapshot()
	_assert_equal(settled_state["diplomaticOrders"], {}, "settled diplomatic order must be removed")
	_assert_equal(settled_state["officers"]["officer-1"]["cityId"], "city-12", "diplomatic executor must return to the source city")
	_assert_true(int(settled_state["rngSeed"]) != initial_seed, "valid diplomatic settlement must consume the fixed RNG sequence")
	_assert_equal(Validator.validate_runtime(settled_state), [], "settled diplomatic state must validate")


func _test_diplomatic_order_termination_and_invalid_executor() -> void:
	var session: GameSession = GameSession.new()
	_assert_true(session.start_campaign(1, 1)["ok"], "diplomatic closure campaign must start")
	var recon: Dictionary = session.execute_command({
		"commandEnvelopeVersion": 1, "commandId": "domain-diplomacy-closure-recon",
		"expectedStateSha256": session.state_sha256(), "kind": "reconnoitre_city",
		"parameters": {"sourceCityId": "city-12", "targetCityId": "city-0", "officerId": "officer-32"},
	})
	_assert_true(recon["ok"], "diplomatic closure reconnaissance must succeed")
	if not recon["ok"]: return
	var issued: Dictionary = session.execute_command({
		"commandEnvelopeVersion": 1, "commandId": "domain-diplomacy-closure-issue",
		"expectedStateSha256": session.state_sha256(), "kind": "issue_alienate_order",
		"parameters": {"sourceCityId": "city-12", "officerId": "officer-33", "targetOfficerId": "officer-56"},
	})
	_assert_true(issued["ok"], "diplomatic closure order must issue")
	if not issued["ok"]: return
	var in_transit: Dictionary = session.snapshot()
	var terminated: Dictionary = DiplomaticOrders.terminate_all(GameState.new(in_transit))
	_assert_true(terminated["ok"], "campaign closure must terminate diplomacy deterministically")
	if terminated["ok"]:
		var closed: Dictionary = terminated["next_state"].snapshot()
		_assert_equal(closed["diplomaticOrders"], {}, "campaign closure must remove every diplomatic order")
		_assert_equal(closed["officers"]["officer-33"]["cityId"], "city-12", "campaign closure must return the executor")
		_assert_true("因战役结束而中止" in closed["logs"][-1]["message"], "campaign closure must append an explicit termination log")
		_assert_equal(Validator.validate_runtime(closed), [], "campaign closure output must validate before outcome transition")
	var invalid_executor: Dictionary = in_transit.duplicate(true)
	invalid_executor["turn"] = int(invalid_executor["turn"]) + 1
	invalid_executor["calendar"]["month"] = int(invalid_executor["calendar"]["month"]) + 1
	invalid_executor["actedOfficerIds"] = []
	invalid_executor["officers"]["officer-33"]["status"] = "free"
	invalid_executor["officers"]["officer-33"]["factionId"] = "neutral"
	invalid_executor["officers"]["officer-33"]["cityId"] = "city-12"
	invalid_executor["officers"]["officer-33"]["troops"] = 0
	invalid_executor["officers"]["officer-33"]["stamina"] = 0
	var initial_seed: int = int(invalid_executor["rngSeed"])
	var invalidated: Dictionary = DiplomaticOrders.advance(GameState.new(invalid_executor))
	_assert_true(invalidated["ok"], "changed executor branch must close without a script error: %s" % invalidated.get("error", ""))
	if invalidated["ok"]:
		var invalidated_state: Dictionary = invalidated["next_state"].snapshot()
		_assert_equal(invalidated_state["rngSeed"], initial_seed, "changed executor branch must not consume RNG")
		_assert_equal(invalidated_state["diplomaticOrders"], {}, "changed executor branch must remove the stale order")


func _test_calendar_and_city_event_contract() -> void:
	_assert_equal(CalendarEvents.advance_calendar({"year": 190, "month": 12}), {"year": 191, "month": 1}, "calendar must cross a year exactly once")
	_assert_equal(CalendarEvents.advance_calendar({"year": 191, "month": 1}), {"year": 191, "month": 2}, "calendar must advance an ordinary month")
	var session: GameSession = GameSession.new()
	var started: Dictionary = session.start_campaign(1, 1)
	_assert_true(started["ok"], "city-event contract campaign must start")
	if not started["ok"]: return
	var state: Dictionary = session.snapshot()
	var flood: Dictionary = (state["cities"]["city-12"] as Dictionary).duplicate(true)
	flood["condition"] = "flood"
	for field: String in ["farming", "commerce", "money", "food", "reserveTroops", "population"]: flood[field] = 101
	var affected: Dictionary = CalendarEvents.apply_city_condition_effect(flood)
	_assert_equal({
		"farming": affected["farming"], "commerce": affected["commerce"], "money": affected["money"],
		"food": affected["food"], "reserveTroops": affected["reserveTroops"], "population": affected["population"],
	}, {"farming": 96, "commerce": 91, "money": 91, "food": 96, "reserveTroops": 76, "population": 76}, "flood losses must preserve fixed integer truncation")
	var boundary: Dictionary = flood.duplicate(true)
	boundary["condition"] = "normal"
	boundary["disasterPrevention"] = 50
	boundary["publicLoyalty"] = 50
	_assert_equal(CalendarEvents.resolve_city_condition(boundary, 50, 0), "normal", "event prevention comparison must be inclusive")
	_assert_equal(CalendarEvents.resolve_city_condition(boundary, 51, 2, 51), "rebellion", "rebellion comparison must be strict")
	for raw_city_id: Variant in state["cityOrder"]:
		var city: Dictionary = state["cities"][raw_city_id]
		if not bool(state["factions"][city["ownerId"]].get("isNeutral", false)):
			city["condition"] = "normal"
			city["disasterPrevention"] = 100
	state["cities"]["city-12"]["condition"] = "famine"
	state["cities"]["city-12"]["food"] = 100
	var first: Dictionary = CalendarEvents.settle_city_events(GameState.new(state))
	var second: Dictionary = CalendarEvents.settle_city_events(GameState.new(state))
	_assert_true(first["ok"] and second["ok"], "city-event settlement must produce valid runtime state")
	if first["ok"] and second["ok"]:
		_assert_equal(first["next_state"].snapshot(), second["next_state"].snapshot(), "city-event settlement must be deterministic")
		_assert_equal(first["next_state"].snapshot()["cities"]["city-12"]["condition"], "normal", "famine must recover after food is restored")
		_assert_true("已从饥荒中恢复" in first["next_state"].snapshot()["logs"][-1]["message"], "player event recovery must append a visible log")


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


func _test_runtime_rejects_unsafe_integer_state() -> void:
	var period: Dictionary = _read_dictionary(PERIOD_PATH).duplicate(true)
	if period.is_empty():
		return
	period["cities"]["city-12"]["money"] = 9_007_199_254_740_992
	var issues: Array[Dictionary] = Validator.validate_runtime(period)
	_assert_issue_contains(
		issues,
		"non-negative safe integer",
		"runtime validator must reject city values outside the shared JS safe-integer domain"
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
		"must be an id",
		"incomplete captive metadata must be rejected by the production contract"
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
		"empty in the initial-state contract",
		"unmigrated strategic orders must be rejected rather than shallowly accepted"
	)


func _test_save_load_equivalence() -> void:
	var session: GameSession = GameSession.new(TEST_SAVE_PATH)
	var started: Dictionary = session.start_spike_period_1()
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

	var v2_envelope: Dictionary = saved["envelope"].duplicate(true)
	var production_period: Dictionary = _read_dictionary("res://data/campaigns/period-1.json")
	v2_envelope["state"] = production_period["state"]
	file = FileAccess.open(TEST_SAVE_PATH, FileAccess.WRITE)
	_assert_true(file != null, "test must be able to write a v2 state under the spike envelope")
	if file != null:
		file.store_string(JSON.stringify(v2_envelope, "\t", true))
		file.close()
		var rejected_v2: Dictionary = SaveRepository.new(TEST_SAVE_PATH).load()
		_assert_true(not rejected_v2["ok"], "MB01 spike repository must reject production v2 states")
		_assert_true(
			String(rejected_v2["error"]).contains("dataContractVersion 1"),
			"v2-under-spike rejection must identify the contract mismatch"
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
