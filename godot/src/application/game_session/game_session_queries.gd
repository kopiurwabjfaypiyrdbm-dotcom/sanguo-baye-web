class_name GameSessionQueries
extends RefCounted

const DevelopFarming = preload("res://src/domain/commands/develop_farming_command.gd")
const InternalAffairs = preload("res://src/domain/commands/internal_affairs_commands.gd")

const INTERNAL_COMMANDS: Array[Dictionary] = [
	{"kind": "develop_farming", "label": "开垦", "mode": "executor", "dangerous": false},
	{"kind": "develop_commerce", "label": "招商", "mode": "executor", "dangerous": false},
	{"kind": "govern_city", "label": "治理", "mode": "executor", "dangerous": false},
	{"kind": "inspect_city", "label": "出巡", "mode": "executor", "dangerous": false},
	{"kind": "trade_food", "label": "交易", "mode": "trade", "dangerous": false},
	{"kind": "banquet_officer", "label": "宴请", "mode": "target", "dangerous": false},
	{"kind": "plunder_city", "label": "掠夺", "mode": "executor", "dangerous": true},
]


static func city(state: RefCounted, city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var cities: Dictionary = data["cities"]
	if not cities.has(city_id):
		return {"found": false, "city": {}, "developFarming": _unavailable("未知城池"), "internalAffairs": []}
	var develop_farming: Dictionary = _develop_farming(state, data, city_id)
	return {
		"found": true,
		"city": (cities[city_id] as Dictionary).duplicate(true),
		"developFarming": develop_farming,
		"internalAffairs": _internal_affairs(state, data, city_id, develop_farming),
	}


static func find_default_executor(state: RefCounted, city_id: String) -> String:
	var result: Dictionary = city(state, city_id)
	if not result["found"]:
		return ""
	return String((result["developFarming"] as Dictionary)["defaultOfficerId"])


static func _develop_farming(state: RefCounted, data: Dictionary, city_id: String) -> Dictionary:
	var officers: Dictionary = data["officers"]
	var executors: Array[Dictionary] = []
	var domain_query: Dictionary = DevelopFarming.list_available_executors(state, city_id)
	for raw_officer_id: Variant in domain_query["executorIds"]:
		var officer_id: String = raw_officer_id
		var officer: Dictionary = officers[officer_id]
		executors.append({
			"id": officer_id,
			"name": officer["name"],
			"stamina": int(officer["stamina"]),
		})
	return {
		"allowed": not executors.is_empty(),
		"reason": "" if not executors.is_empty() else domain_query["reason"],
		"defaultOfficerId": "" if executors.is_empty() else executors[0]["id"],
		"executors": executors,
	}


static func _internal_affairs(
		state: RefCounted, data: Dictionary, city_id: String, farming: Dictionary
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for definition: Dictionary in INTERNAL_COMMANDS:
		var kind: String = definition["kind"]
		var query: Dictionary
		if kind == "develop_farming":
			query = farming.duplicate(true)
		elif kind == "banquet_officer":
			query = _banquet(state, data, city_id)
		else:
			query = _executor_command(state, data, city_id, kind)
		query["kind"] = kind
		query["label"] = definition["label"]
		query["mode"] = definition["mode"]
		query["dangerous"] = definition["dangerous"]
		if kind == "trade_food":
			_apply_trade_defaults(state, data, city_id, query)
		result.append(query)
	return result


static func _apply_trade_defaults(
		state: RefCounted, data: Dictionary, city_id: String, query: Dictionary
) -> void:
	var directions: Array[String] = []
	var executor_id: String = query.get("defaultOfficerId", "")
	if not executor_id.is_empty():
		for direction: String in ["buy", "sell"]:
			var availability: Dictionary = InternalAffairs.get_availability(state, "trade_food", {
				"cityId": city_id, "officerId": executor_id, "direction": direction, "amount": 1,
			})
			if availability["allowed"]:
				directions.append(direction)
	query["directions"] = directions
	if directions.is_empty():
		query["allowed"] = false
		query["reason"] = "当前资源无法交易"
		query["defaultDirection"] = "buy"
		query["defaultAmount"] = 1
		return
	var city_data: Dictionary = data["cities"][city_id]
	var default_direction: String = "sell" if directions.has("sell") else directions[0]
	var maximum: int
	if default_direction == "sell":
		maximum = mini(int(city_data["food"]), int(floor(float(30_000 - int(city_data["money"])) / 2.0)))
	else:
		maximum = mini(30_000 - int(city_data["food"]), int(floor(float(city_data["money"]) / 5.0)))
	query["defaultDirection"] = default_direction
	query["defaultAmount"] = mini(100, maxi(1, maximum))


static func _executor_command(
		state: RefCounted, data: Dictionary, city_id: String, kind: String
) -> Dictionary:
	var officers: Dictionary = data["officers"]
	var executors: Array[Dictionary] = []
	var domain_query: Dictionary = InternalAffairs.list_available_executors(state, city_id, kind)
	for raw_officer_id: Variant in domain_query["executorIds"]:
		var officer_id: String = raw_officer_id
		var officer: Dictionary = officers[officer_id]
		executors.append({"id": officer_id, "name": officer["name"], "stamina": int(officer["stamina"])})
	return {
		"allowed": not executors.is_empty(),
		"reason": "" if not executors.is_empty() else domain_query["reason"],
		"defaultOfficerId": "" if executors.is_empty() else executors[0]["id"],
		"executors": executors,
	}


static func _banquet(state: RefCounted, data: Dictionary, city_id: String) -> Dictionary:
	var officers: Dictionary = data["officers"]
	var targets: Array[Dictionary] = []
	var domain_query: Dictionary = InternalAffairs.list_banquet_targets(state, city_id)
	for raw_target_id: Variant in domain_query["targetIds"]:
		var target_id: String = raw_target_id
		var officer: Dictionary = officers[target_id]
		targets.append({
			"id": target_id, "name": officer["name"], "stamina": int(officer["stamina"]),
			"loyalty": int(officer["loyalty"]),
		})
	return {
		"allowed": not targets.is_empty(),
		"reason": "" if not targets.is_empty() else domain_query["reason"],
		"defaultTargetOfficerId": "" if targets.is_empty() else targets[0]["id"],
		"targets": targets,
		"executors": [],
	}


static func _unavailable(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason, "defaultOfficerId": "", "executors": []}
