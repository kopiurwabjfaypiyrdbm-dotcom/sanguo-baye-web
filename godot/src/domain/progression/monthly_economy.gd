class_name CampaignMonthlyEconomy
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const CoreLcg = preload("res://src/domain/random/core_lcg.gd")

const MONTHLY_STAMINA_RECOVERY: int = 4
const MAX_CITY_RESOURCE: int = 30_000


static func settle(state: GameState, validate_result: bool = true) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var next: Dictionary = before.duplicate(true)
	var officers: Dictionary = next["officers"]
	var seed: int = int(before["rngSeed"])
	var supported: Dictionary = _supported_officers(before)
	var shortage_cities: Array[String] = []
	for raw_city_id: Variant in before["cityOrder"]:
		var city_id: String = str(raw_city_id)
		var city: Dictionary = before["cities"][city_id]
		var faction: Dictionary = before["factions"].get(city["ownerId"], {})
		if faction.is_empty() or bool(faction.get("isNeutral", false)):
			continue
		var disaster_prevention: int = int(city.get("disasterPrevention", 0))
		if int(before["calendar"]["month"]) % 3 == 0:
			var decay: Dictionary = CoreLcg.next_random(seed)
			seed = int(decay["seed"])
			var amount: int = floori(float(decay["value"]) * 4.0) + 1
			if disaster_prevention > amount: disaster_prevention -= amount
		var working: Dictionary = city.duplicate(true)
		working["disasterPrevention"] = disaster_prevention
		var supported_ids: Array = supported.get(city_id, [])
		for raw_officer_id: Variant in supported_ids:
			var officer_id: String = str(raw_officer_id)
			var officer: Dictionary = officers.get(officer_id, {})
			if officer.is_empty() or officer.get("factionId", "") != city["ownerId"] or officer.get("cityId", "") != city_id:
				continue
			var condition: String = str(city.get("condition", "normal"))
			if condition == "drought" or condition == "flood":
				officer["troops"] = int(officer["troops"]) - floori(float(int(officer["troops"])) / 4.0)
			elif condition == "rebellion":
				officer["troops"] = floori(float(int(officer["troops"])) / 2.0)
			officers[officer_id] = officer
		var adjusted_troops: int = 0
		for raw_officer_id: Variant in supported_ids:
			var officer_id: String = str(raw_officer_id)
			var officer: Dictionary = officers.get(officer_id, {})
			if officer.is_empty() or officer.get("factionId", "") != city["ownerId"]: continue
			adjusted_troops += int(officer.get("troops", 0))
		var farming: int = int(working["farming"])
		var commerce: int = int(working["commerce"])
		var money_growth: int = floori(float(commerce) / 2.0) if int(before["calendar"]["month"]) % 3 == 0 else 0
		var food_growth: int = floori(float(farming) / 4.0) if int(before["calendar"]["month"]) == 6 or int(before["calendar"]["month"]) == 10 else 0
		var upkeep: int = floori(float(int(city["reserveTroops"]) + adjusted_troops) / 50.0)
		var population_limit: int = int(city.get("populationLimit", 2_147_483_647))
		var population_growth: int = mini(50, maxi(0, population_limit - int(city["population"])))
		var available_food: int = int(city["food"]) + (0 if int(city["food"]) >= MAX_CITY_RESOURCE else food_growth)
		var shortage: bool = available_food <= upkeep
		if shortage:
			shortage_cities.append(str(city["name"]))
			for raw_officer_id: Variant in supported_ids:
				var officer_id: String = str(raw_officer_id)
				var officer: Dictionary = officers.get(officer_id, {})
				if officer.is_empty() or officer.get("factionId", "") != city["ownerId"]: continue
				officer["troops"] = floori(float(int(officer.get("troops", 0))) / 2.0)
				officers[officer_id] = officer
		var result_city: Dictionary = working.duplicate(true)
		result_city["money"] = int(city["money"]) if int(city["money"]) >= MAX_CITY_RESOURCE else mini(MAX_CITY_RESOURCE, int(city["money"]) + money_growth)
		result_city["food"] = 0 if shortage else (available_food - upkeep if int(city["food"]) >= MAX_CITY_RESOURCE else mini(MAX_CITY_RESOURCE, available_food - upkeep))
		result_city["population"] = int(city["population"]) + population_growth
		if shortage: result_city["condition"] = "famine"
		next["cities"][city_id] = result_city
	for raw_officer_id: Variant in before["officerOrder"]:
		var officer_id: String = str(raw_officer_id)
		var officer: Dictionary = officers[officer_id]
		officer["stamina"] = 0 if officer.get("status", "") == "captive" or officer.get("status", "") == "dead" else mini(100, int(officer.get("stamina", 0)) + MONTHLY_STAMINA_RECOVERY)
		officers[officer_id] = officer
	next["rngSeed"] = seed
	var seasonal: String = "本月包含季节性税收或粮食收获。" if int(before["calendar"]["month"]) % 3 == 0 or int(before["calendar"]["month"]) == 6 or int(before["calendar"]["month"]) == 10 else "本月没有季节性税收或粮食收获。"
	_append_logs(next, "turn", ["各城完成军粮、人口和体力结算。%s" % seasonal])
	if not shortage_cities.is_empty(): _append_logs(next, "turn", ["%s粮草不足，所属驻军与在途部队兵力减半。" % "、".join(shortage_cities)])
	if validate_result:
		var issues: Array[Dictionary] = Validator.validate_runtime(next)
		if not issues.is_empty(): return {"ok": false, "error": Validator.first_error(issues), "next_state": null, "receipt": {}}
	return {"ok": true, "error": "", "next_state": GameState.new(next), "receipt": {
		"kind": "apply_monthly_growth", "beforeSeed": before["rngSeed"], "afterSeed": seed,
		"shortageCities": shortage_cities, "appendedLogs": (next["logs"] as Array).slice((before["logs"] as Array).size()).duplicate(true),
	}}


static func supported_officers_by_city(data: Dictionary) -> Dictionary:
	return _supported_officers(data)


static func _supported_officers(data: Dictionary) -> Dictionary:
	var supported: Dictionary = {}
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id: String = str(raw_officer_id)
		var officer: Dictionary = data["officers"][officer_id]
		if officer.get("status", "") != "serving" or not officer.has("cityId"): continue
		var city_id: String = str(officer["cityId"])
		if not supported.has(city_id): supported[city_id] = []
		(supported[city_id] as Array).append(officer_id)
	var order_ids: Array[String] = []
	for raw_order_id: Variant in data["strategicOrders"].keys():
		order_ids.append(str(raw_order_id))
	order_ids.sort()
	for order_id: String in order_ids:
		var order: Dictionary = data["strategicOrders"][order_id]
		var officer: Dictionary = data["officers"].get(order["officerId"], {})
		if officer.is_empty() or officer.get("status", "") != "serving" or officer.has("cityId"): continue
		var support_city: String = ""
		for city_id: String in [str(order["sourceCityId"]), str(order["targetCityId"])] :
			if data["cities"].has(city_id) and data["cities"][city_id]["ownerId"] == order["factionId"]:
				support_city = city_id
				break
		if support_city.is_empty():
			var city_ids: Array[String] = []
			for raw_city_id: Variant in data["cities"].keys(): city_ids.append(str(raw_city_id))
			city_ids.sort()
			for city_id: String in city_ids:
				if data["cities"][city_id]["ownerId"] == order["factionId"]:
					support_city = city_id
					break
		if support_city.is_empty(): continue
		if not supported.has(support_city): supported[support_city] = []
		(supported[support_city] as Array).append(str(order["officerId"]))
	return supported


static func _append_logs(data: Dictionary, kind: String, messages: Array[String]) -> void:
	var used: Dictionary = {}
	for raw_log: Variant in data["logs"]: used[(raw_log as Dictionary)["id"]] = true
	var serial: int = (data["logs"] as Array).size() + 1
	for message: String in messages:
		var log_id: String = "log-%d-%03d" % [int(data["turn"]), serial]
		while used.has(log_id): serial += 1; log_id = "log-%d-%03d" % [int(data["turn"]), serial]
		used[log_id] = true
		(data["logs"] as Array).append({"id": log_id, "kind": kind, "message": message, "turn": int(data["turn"])})
		serial += 1
