extends SceneTree

const ProductionDataRepository = preload("res://src/application/game_session/production_data_repository.gd")
const ProductionDataValidator = preload("res://src/domain/validation/production_data_validator.gd")

const PERIOD_ONE_PATH: String = "res://data/campaigns/period-1.json"
const CATALOG_PATH: String = "res://data/campaigns/catalog-v1.json"

var _failures: Array[String] = []
var _assertions: int = 0


func _initialize() -> void:
	var result: Dictionary = ProductionDataRepository.load_all()
	_assert_true(result["ok"], "all four production periods must load: %s" % result.get("error", ""))
	if result["ok"]:
		_assert_equal((result["states"] as Dictionary).size(), 4, "repository must construct four GameState objects")
		for period_id: int in [1, 2, 3, 4]:
			var envelope: Dictionary = result["envelopes"][period_id]
			var state: Dictionary = result["states"][period_id].snapshot()
			_assert_equal((state["cities"] as Dictionary).size(), 38, "period-%d city count" % period_id)
			_assert_equal(state["rngSeed"], envelope["state"]["rngSeed"], "period-%d explicit seed" % period_id)
			_assert_true(not (envelope["scenario"]["playerCandidates"] as Array).is_empty(), "period-%d player candidates" % period_id)
	_test_negative_contracts()
	_test_catalog_contract()

	if not _failures.is_empty():
		for failure: String in _failures:
			push_error("[Godot production data] " + failure)
		push_error("[Godot production data] FAILED failures=%d assertions=%d" % [_failures.size(), _assertions])
		quit(1)
		return
	print("[Godot production data] PASSED periods=4 assertions=%d" % _assertions)
	quit(0)


func _test_negative_contracts() -> void:
	var original: Dictionary = _read_dictionary(PERIOD_ONE_PATH)
	if original.is_empty():
		return
	var cases: Array[Dictionary] = [
		{"id": "version", "expected": "productionDataContractVersion", "mutate": func(value: Dictionary) -> void: value["productionDataContractVersion"] = 99},
		{"id": "ruleset", "expected": "scenario.rulesetId", "mutate": func(value: Dictionary) -> void: value["scenario"]["rulesetId"] = "unknown"},
		{"id": "road", "expected": "road is not reciprocal", "mutate": func(value: Dictionary) -> void: value["state"]["cities"]["city-3"]["neighbors"].erase("city-0")},
		{"id": "officer", "expected": "must reference a known city", "mutate": func(value: Dictionary) -> void: value["state"]["officers"]["officer-1"]["cityId"] = "missing-city"},
		{"id": "item", "expected": "unknown id", "mutate": func(value: Dictionary) -> void: value["state"]["items"]["item-0"]["armsTypeOverride"] = "missing-arms"},
		{"id": "arms", "expected": "unknown id", "mutate": func(value: Dictionary) -> void: value["state"]["officers"]["officer-1"]["armsTypeId"] = "missing-arms"},
		{"id": "order", "expected": "contains duplicate id", "mutate": func(value: Dictionary) -> void: value["state"]["cityOrder"][1] = value["state"]["cityOrder"][0]},
		{"id": "semantic-order", "expected": "production semantic order", "mutate": func(value: Dictionary) -> void: value["state"]["cityOrder"].reverse()},
		{"id": "digest", "expected": "stateSha256", "mutate": func(value: Dictionary) -> void: value["stateSha256"] = "0".repeat(64)},
		{"id": "number", "expected": "at most 6 decimal places", "mutate": func(value: Dictionary) -> void: value["state"]["armsTypes"]["archer"]["attackModifier"] = 1.2345678},
		{"id": "missing-title", "expected": "scenario.title: missing field", "mutate": func(value: Dictionary) -> void: value["scenario"].erase("title")},
		{"id": "unknown-scenario-field", "expected": "scenario.unexpected: unknown field", "mutate": func(value: Dictionary) -> void: value["scenario"]["unexpected"] = true},
		{"id": "missing-graph", "expected": "state.graph: expected object", "mutate": func(value: Dictionary) -> void: value["state"]["graph"] = null},
		{"id": "graph-roads", "expected": "graph.roads", "mutate": func(value: Dictionary) -> void: value["state"]["graph"]["roads"].pop_back()},
		{"id": "turn", "expected": "state.turn", "mutate": func(value: Dictionary) -> void: value["state"]["turn"] = 2},
		{"id": "rng-domain", "expected": "state.rngSeed", "mutate": func(value: Dictionary) -> void: value["state"]["rngSeed"] = 4_294_967_296},
		{"id": "faction-name-type", "expected": "state.factions.ruler-0.name", "mutate": func(value: Dictionary) -> void: value["state"]["factions"]["ruler-0"]["name"] = 123},
		{"id": "scenario-source-type", "expected": "state.scenario.source", "mutate": func(value: Dictionary) -> void: value["state"]["scenario"]["source"] = 123},
		{"id": "city-type-type", "expected": "state.cities.city-0.type", "mutate": func(value: Dictionary) -> void: value["state"]["cities"]["city-0"]["type"] = 123},
		{"id": "arms-modifier-type", "expected": "state.armsTypes.archer.attackModifier", "mutate": func(value: Dictionary) -> void: value["state"]["armsTypes"]["archer"]["attackModifier"] = "1"},
		{"id": "log-message-type", "expected": "state.logs[0].message", "mutate": func(value: Dictionary) -> void: value["state"]["logs"][0]["message"] = 123},
		{"id": "unsafe-scenario-period-type", "expected": "state.scenario.period", "mutate": func(value: Dictionary) -> void: value["state"]["scenario"]["period"] = {}},
		{"id": "unsafe-city-source-type", "expected": "state.cities.city-0.sourceIndex", "mutate": func(value: Dictionary) -> void: value["state"]["cities"]["city-0"]["sourceIndex"] = {}},
		{"id": "empty-faction-name", "expected": "state.factions.ruler-0.name", "mutate": func(value: Dictionary) -> void: value["state"]["factions"]["ruler-0"]["name"] = ""},
		{"id": "unknown-log-kind", "expected": "state.logs[0].kind", "mutate": func(value: Dictionary) -> void: value["state"]["logs"][0]["kind"] = "unknown"},
		{"id": "empty-satrap-reference", "expected": "state.cities.city-0.satrapOfficerId", "mutate": func(value: Dictionary) -> void: value["state"]["cities"]["city-0"]["satrapOfficerId"] = ""},
		{"id": "empty-arms-override", "expected": "state.items.item-0.armsTypeOverride", "mutate": func(value: Dictionary) -> void: value["state"]["items"]["item-0"]["armsTypeOverride"] = ""},
	]
	for test_case: Dictionary in cases:
		var value: Dictionary = original.duplicate(true)
		test_case["mutate"].call(value)
		var first: Array[String] = ProductionDataValidator.validate_envelope(value)
		var second: Array[String] = ProductionDataValidator.validate_envelope(value)
		_assert_true(not first.is_empty(), "%s mutation must fail" % test_case["id"])
		_assert_true(_contains(first, test_case["expected"]), "%s mutation must identify %s" % [test_case["id"], test_case["expected"]])
		_assert_equal(first, second, "%s validation order must be deterministic" % test_case["id"])


func _test_catalog_contract() -> void:
	var original: Dictionary = _read_dictionary(CATALOG_PATH)
	if original.is_empty(): return
	var cases: Array[Dictionary] = [
		{"id": "catalog-usage-unknown", "expected": "usage.unexpected: unknown field", "mutate": func(value: Dictionary) -> void: value["usage"]["unexpected"] = true},
		{"id": "catalog-usage-type", "expected": "usage.scope: must be a non-empty string", "mutate": func(value: Dictionary) -> void: value["usage"]["scope"] = 42},
	]
	for test_case: Dictionary in cases:
		var value: Dictionary = original.duplicate(true)
		test_case["mutate"].call(value)
		var first: Array[String] = ProductionDataRepository._validate_catalog_shape(value)
		var second: Array[String] = ProductionDataRepository._validate_catalog_shape(value)
		_assert_true(_contains(first, test_case["expected"]), "%s must identify %s" % [test_case["id"], test_case["expected"]])
		_assert_equal(first, second, "%s validation order must be deterministic" % test_case["id"])


func _read_dictionary(path: String) -> Dictionary:
	var parser: JSON = JSON.new()
	if parser.parse(FileAccess.get_file_as_string(path)) != OK or typeof(parser.data) != TYPE_DICTIONARY:
		_failures.append("unable to parse " + path)
		return {}
	return parser.data


func _contains(issues: Array[String], fragment: String) -> bool:
	for issue: String in issues:
		if fragment in issue:
			return true
	return false


func _assert_true(value: bool, label: String) -> void:
	_assertions += 1
	if not value:
		_failures.append(label)


func _assert_equal(actual: Variant, expected: Variant, label: String) -> void:
	_assertions += 1
	if actual != expected:
		_failures.append("%s: expected %s, received %s" % [label, str(expected), str(actual)])
