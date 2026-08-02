class_name InternalAffairsCommands
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const CoreLcg = preload("res://src/domain/random/core_lcg.gd")
const Rulesets = preload("res://src/domain/rules/campaign_rulesets.gd")

const JS_MAX_SAFE_INTEGER: int = 9_007_199_254_740_991
const TRADE_RESOURCE_CAP: int = 30_000
const BUY_FOOD_PRICE: int = 5
const SELL_FOOD_PRICE: int = 2
const BANQUET_STAMINA_RECOVERY: int = 50
const COMMAND_KINDS: Array[String] = [
	"develop_commerce", "govern_city", "inspect_city", "trade_food",
	"banquet_officer", "plunder_city",
]


static func execute(state: GameState, kind: String, parameters: Dictionary) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(before)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	if not COMMAND_KINDS.has(kind):
		return _failure("不支持的内政命令：%s" % kind)
	match kind:
		"develop_commerce":
			return _execute_commerce(before, parameters)
		"govern_city":
			return _execute_govern(before, parameters)
		"inspect_city":
			return _execute_inspect(before, parameters)
		"trade_food":
			return _execute_trade(before, parameters)
		"banquet_officer":
			return _execute_banquet(before, parameters)
		"plunder_city":
			return _execute_plunder(before, parameters)
	return _failure("不支持的内政命令：%s" % kind)


static func get_availability(
		state: GameState, kind: String, parameters: Dictionary
) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty():
		return _unavailable(Validator.first_error(issues))
	return _availability_for_data(data, kind, parameters)


static func list_available_executors(state: GameState, city_id: String, kind: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty():
		return {"executorIds": [], "reason": Validator.first_error(issues)}
	var executor_ids: Array[String] = []
	var first_reason: String = "没有可执行%s的武将" % _command_label(kind)
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id: String = raw_officer_id
		var parameters: Dictionary = {"cityId": city_id, "officerId": officer_id}
		if kind == "trade_food":
			parameters.merge({"direction": "buy", "amount": 1})
		var result: Dictionary = _availability_for_data(data, kind, parameters)
		if kind == "trade_food" and not result["allowed"]:
			parameters["direction"] = "sell"
			result = _availability_for_data(data, kind, parameters)
		if result["allowed"]:
			executor_ids.append(officer_id)
		elif first_reason.begins_with("没有可执行"):
			var officer: Dictionary = data["officers"][officer_id]
			if officer.get("cityId", "") == city_id \
					and officer.get("factionId", "") == data["activeFactionId"] \
					and officer.get("status", "") == "serving":
				first_reason = result["reason"]
	return {
		"executorIds": executor_ids,
		"reason": "" if not executor_ids.is_empty() else first_reason,
	}


static func list_banquet_targets(state: GameState, city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty():
		return {"targetIds": [], "reason": Validator.first_error(issues)}
	var target_ids: Array[String] = []
	var first_reason: String = "没有可宴请的武将"
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id: String = raw_officer_id
		var result: Dictionary = _availability_for_data(
			data, "banquet_officer", {"cityId": city_id, "targetOfficerId": officer_id}
		)
		if result["allowed"]:
			target_ids.append(officer_id)
		elif first_reason == "没有可宴请的武将":
			var officer: Dictionary = data["officers"][officer_id]
			if officer.get("cityId", "") == city_id \
					and officer.get("factionId", "") == data["activeFactionId"] \
					and officer.get("status", "") == "serving":
				first_reason = result["reason"]
	return {"targetIds": target_ids, "reason": "" if not target_ids.is_empty() else first_reason}


static func _execute_commerce(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability: Dictionary = _availability_for_data(data, "develop_commerce", parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	var random: Dictionary = CoreLcg.next_random(int(data["rngSeed"]))
	var city: Dictionary = availability["city"]
	var officer: Dictionary = availability["officer"]
	var effective: Dictionary = _effective_attributes(data, officer)
	var random_factor: int = int(floor(float(random["value"]) * 4.0)) + 2
	var gain: int = int(floor(float(effective["intelligence"]) / 10.0)) * random_factor \
			+ ((int(effective["intelligence"]) & 0xffff_ffff) >> 1)
	var available: int = JS_MAX_SAFE_INTEGER - int(city["commerce"])
	if city.has("commerceLimit"):
		available = maxi(0, int(city["commerceLimit"]) - int(city["commerce"]))
	gain = mini(gain, available)
	var next_city: Dictionary = city.duplicate(true)
	next_city["commerce"] = int(city["commerce"]) + gain
	next_city["money"] = int(city["money"]) - int(availability["cost"]["money"])
	var next_officer: Dictionary = officer.duplicate(true)
	next_officer["stamina"] = int(officer["stamina"]) - int(availability["cost"]["stamina"])
	var message: String = "%s在%s主持招商，商业提高 %d，消耗金钱 %d、体力 %d。" % [
		officer["name"], city["name"], gain,
		int(availability["cost"]["money"]), int(availability["cost"]["stamina"]),
	]
	return _commit(data, "develop_commerce", city, next_city, officer, next_officer, message, int(random["seed"]))


static func _execute_govern(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability: Dictionary = _availability_for_data(data, "govern_city", parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	var random: Dictionary = CoreLcg.next_random(int(data["rngSeed"]))
	var city: Dictionary = availability["city"]
	var officer: Dictionary = availability["officer"]
	var original_condition: String = city.get("condition", "normal")
	var gain: int = mini(100 - int(city.get("disasterPrevention", 0)), int(floor(float(random["value"]) * 4.0)) + 1)
	var next_city: Dictionary = city.duplicate(true)
	next_city["condition"] = "normal"
	next_city["disasterPrevention"] = int(city.get("disasterPrevention", 0)) + gain
	next_city["money"] = int(city["money"]) - int(availability["cost"]["money"])
	var next_officer: Dictionary = officer.duplicate(true)
	next_officer["stamina"] = int(officer["stamina"]) - int(availability["cost"]["stamina"])
	var message: String = "%s治理%s，防灾提高 %d，%s消耗金钱 %d、体力 %d。" % [
		officer["name"], city["name"], gain,
		"" if original_condition == "normal" else "城池恢复正常，",
		int(availability["cost"]["money"]), int(availability["cost"]["stamina"]),
	]
	return _commit(data, "govern_city", city, next_city, officer, next_officer, message, int(random["seed"]))


static func _execute_inspect(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability: Dictionary = _availability_for_data(data, "inspect_city", parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	var random: Dictionary = CoreLcg.next_random(int(data["rngSeed"]))
	var city: Dictionary = availability["city"]
	var officer: Dictionary = availability["officer"]
	var loyalty_gain: int = maxi(0, mini(
		100 - int(city.get("publicLoyalty", 70)), int(floor(float(random["value"]) * 4.0)) + 1
	))
	var population_gain: int = mini(100, maxi(0, int(city.get("populationLimit", JS_MAX_SAFE_INTEGER)) - int(city["population"])))
	var next_city: Dictionary = city.duplicate(true)
	next_city["publicLoyalty"] = int(city.get("publicLoyalty", 70)) + loyalty_gain
	next_city["population"] = int(city["population"]) + population_gain
	next_city["money"] = int(city["money"]) - int(availability["cost"]["money"])
	var next_officer: Dictionary = officer.duplicate(true)
	next_officer["stamina"] = int(officer["stamina"]) - int(availability["cost"]["stamina"])
	var message: String = "%s出巡%s，民忠提高 %d、人口增加 %d，消耗金钱 %d、体力 %d。" % [
		officer["name"], city["name"], loyalty_gain, population_gain,
		int(availability["cost"]["money"]), int(availability["cost"]["stamina"]),
	]
	return _commit(data, "inspect_city", city, next_city, officer, next_officer, message, int(random["seed"]))


static func _execute_trade(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability: Dictionary = _availability_for_data(data, "trade_food", parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	var city: Dictionary = availability["city"]
	var officer: Dictionary = availability["officer"]
	var amount: int = int(parameters["amount"])
	var buying: bool = parameters["direction"] == "buy"
	var quoted_money: int = amount * (BUY_FOOD_PRICE if buying else SELL_FOOD_PRICE)
	var next_city: Dictionary = city.duplicate(true)
	next_city["money"] = int(city["money"]) + (-quoted_money if buying else quoted_money)
	next_city["food"] = int(city["food"]) + (amount if buying else -amount)
	var next_officer: Dictionary = officer.duplicate(true)
	next_officer["stamina"] = int(officer["stamina"]) - int(availability["cost"]["stamina"])
	var message: String = "%s在%s%s %d 粮，%s %d 金，消耗体力 %d。" % [
		officer["name"], city["name"], "买入" if buying else "卖出", amount,
		"花费" if buying else "获得", quoted_money, int(availability["cost"]["stamina"]),
	]
	return _commit(data, "trade_food", city, next_city, officer, next_officer, message, int(data["rngSeed"]))


static func _execute_banquet(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability: Dictionary = _availability_for_data(data, "banquet_officer", parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	var city: Dictionary = availability["city"]
	var target: Dictionary = availability["target"]
	var next_city: Dictionary = city.duplicate(true)
	next_city["money"] = int(city["money"]) - int(availability["cost"]["money"])
	var next_target: Dictionary = target.duplicate(true)
	next_target["stamina"] = mini(100, int(target["stamina"]) + BANQUET_STAMINA_RECOVERY)
	if not availability["isRuler"]:
		next_target["loyalty"] = mini(100, int(target["loyalty"]) + 1)
	var message: String = "%s宴请%s，体力恢复 %d%s，花费 %d 金。" % [
		city["name"], target["name"], int(next_target["stamina"]) - int(target["stamina"]),
		"" if availability["isRuler"] else "、忠诚提高 %d" % (int(next_target["loyalty"]) - int(target["loyalty"])),
		int(availability["cost"]["money"]),
	]
	return _commit_banquet(data, city, next_city, target, next_target, message)


static func _execute_plunder(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability: Dictionary = _availability_for_data(data, "plunder_city", parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	var city: Dictionary = availability["city"]
	var officer: Dictionary = availability["officer"]
	var strength: int = availability["strength"]
	var food_gain: int = mini(0 if int(city["food"]) >= TRADE_RESOURCE_CAP else TRADE_RESOURCE_CAP - int(city["food"]), strength * 5)
	var money_gain: int = mini(0 if int(city["money"]) >= TRADE_RESOURCE_CAP else TRADE_RESOURCE_CAP - int(city["money"]), strength * 2)
	var next_city: Dictionary = city.duplicate(true)
	next_city["publicLoyalty"] = int(floor(float(city.get("publicLoyalty", 70)) / 2.0))
	next_city["farming"] = int(floor(float(city["farming"]) / 2.0))
	next_city["commerce"] = int(floor(float(city["commerce"]) / 2.0))
	next_city["food"] = int(city["food"]) + food_gain
	next_city["money"] = int(city["money"]) + money_gain
	var next_officer: Dictionary = officer.duplicate(true)
	next_officer["stamina"] = int(officer["stamina"]) - int(availability["cost"]["stamina"])
	var message: String = "%s掠夺%s，获得 %d 金、%d 粮；民忠、农业与商业折半。" % [
		officer["name"], city["name"], money_gain, food_gain,
	]
	return _commit(data, "plunder_city", city, next_city, officer, next_officer, message, int(data["rngSeed"]))


static func _availability_for_data(data: Dictionary, kind: String, parameters: Dictionary) -> Dictionary:
	if data["phase"] == "ended":
		return _unavailable("战役已经结束")
	if data.has("pendingSuccession") and data["pendingSuccession"] != null:
		return _unavailable("必须先拥立新君")
	var city_id: String = parameters.get("cityId", "")
	if not data["cities"].has(city_id):
		return _unavailable("只能在己方城池执行命令")
	var city: Dictionary = data["cities"][city_id]
	if city["ownerId"] != data["activeFactionId"]:
		return _unavailable("只能在己方城池执行命令")
	if kind == "banquet_officer":
		return _banquet_availability(data, city, parameters)
	var officer_id: String = parameters.get("officerId", "")
	if not data["officers"].has(officer_id):
		return _unavailable("未知武将：%s" % officer_id)
	var officer: Dictionary = data["officers"][officer_id]
	if officer["status"] != "serving" \
			or officer["factionId"] != data["activeFactionId"] \
			or officer.get("cityId", "") != city_id:
		return _unavailable("执行武将不在该城")
	if (data["actedOfficerIds"] as Array).has(officer_id):
		return _unavailable("该武将本月已经执行过命令")
	var cost_kind: String = "develop" if kind == "develop_commerce" else kind.trim_suffix("_city").trim_suffix("_food")
	var cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], cost_kind)
	if cost.is_empty():
		return _unavailable("不支持的规则集：%s" % data["rulesetId"])
	if int(officer["stamina"]) < int(cost["stamina"]):
		return _unavailable("武将体力不足，需要 %d" % int(cost["stamina"]))
	if int(city["money"]) < int(cost["money"]):
		return _unavailable("城中金钱不足，需要 %d" % int(cost["money"]))
	match kind:
		"develop_commerce":
			if city.has("commerceLimit") and int(city["commerce"]) >= int(city["commerceLimit"]):
				return _unavailable("该城商业已经达到上限")
			if not city.has("commerceLimit") and int(city["commerce"]) >= JS_MAX_SAFE_INTEGER:
				return _unavailable("该城商业已经达到安全上限")
		"govern_city":
			if city.get("condition", "normal") == "normal" and int(city.get("disasterPrevention", 0)) >= 100:
				return _unavailable("该城防灾已经达到上限")
		"inspect_city":
			if int(city.get("publicLoyalty", 70)) >= 100 \
					and int(city["population"]) >= int(city.get("populationLimit", JS_MAX_SAFE_INTEGER)):
				return _unavailable("该城民忠和人口已经达到上限")
		"trade_food":
			var trade_issue: String = _trade_error(city, parameters)
			if not trade_issue.is_empty():
				return _unavailable(trade_issue)
		"plunder_city":
			var effective: Dictionary = _effective_attributes(data, officer)
			var strength: int = int(effective["intelligence"]) + int(effective["force"])
			if strength < 0 or strength > int(floor(float(JS_MAX_SAFE_INTEGER) / 5.0)):
				return _unavailable("武将属性过大，无法安全计算掠夺收益")
			return {"allowed": true, "reason": "", "city": city, "officer": officer, "cost": cost, "strength": strength}
	return {"allowed": true, "reason": "", "city": city, "officer": officer, "cost": cost}


static func _banquet_availability(data: Dictionary, city: Dictionary, parameters: Dictionary) -> Dictionary:
	var target_id: String = parameters.get("targetOfficerId", "")
	if not data["officers"].has(target_id):
		return _unavailable("宴请目标不在该城")
	var target: Dictionary = data["officers"][target_id]
	if target["status"] != "serving" \
			or target["factionId"] != data["activeFactionId"] \
			or target.get("cityId", "") != city["id"]:
		return _unavailable("宴请目标不在该城")
	var cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], "banquet")
	if cost.is_empty():
		return _unavailable("不支持的规则集：%s" % data["rulesetId"])
	if int(city["money"]) < int(cost["money"]):
		return _unavailable("城中金钱不足，需要 %d" % int(cost["money"]))
	var faction: Dictionary = data["factions"][target["factionId"]]
	var is_ruler: bool = faction["rulerOfficerId"] == target_id
	if int(target["stamina"]) >= 100 and (is_ruler or int(target["loyalty"]) >= 100):
		return _unavailable("该武将体力和可提升忠诚均已达到上限")
	return {"allowed": true, "reason": "", "city": city, "target": target, "cost": cost, "isRuler": is_ruler}


static func _trade_error(city: Dictionary, parameters: Dictionary) -> String:
	var amount: int = int(parameters.get("amount", 0))
	var direction: String = parameters.get("direction", "")
	if amount <= 0:
		return "交易数量必须是正安全整数"
	if direction == "buy":
		if amount > int(floor(float(JS_MAX_SAFE_INTEGER) / float(BUY_FOOD_PRICE))):
			return "买入数量过大"
		var money_cost: int = amount * BUY_FOOD_PRICE
		if int(city["money"]) < money_cost:
			return "城中金钱不足，需要 %d" % money_cost
		if int(city["food"]) >= TRADE_RESOURCE_CAP:
			return "城中粮草已达到交易上限 %d" % TRADE_RESOURCE_CAP
		if amount > TRADE_RESOURCE_CAP - int(city["food"]):
			return "最多可买入 %d 粮" % (TRADE_RESOURCE_CAP - int(city["food"]))
		return ""
	if int(city["food"]) < amount:
		return "城中粮草不足"
	if int(city["money"]) >= TRADE_RESOURCE_CAP:
		return "城中金钱已达到交易上限 %d" % TRADE_RESOURCE_CAP
	var maximum: int = int(floor(float(TRADE_RESOURCE_CAP - int(city["money"])) / float(SELL_FOOD_PRICE)))
	if amount > maximum:
		return "最多可卖出 %d 粮，避免超过交易金钱上限" % maximum
	return ""


static func _commit(
		data: Dictionary, kind: String, city: Dictionary, next_city: Dictionary,
		officer: Dictionary, next_officer: Dictionary, message: String, next_seed: int
) -> Dictionary:
	var next: Dictionary = data.duplicate(true)
	next["cities"][city["id"]] = next_city
	next["officers"][officer["id"]] = next_officer
	next["rngSeed"] = next_seed
	next["campaignStarted"] = true
	var acted: Array = (next["actedOfficerIds"] as Array).duplicate(true)
	acted.append(officer["id"])
	next["actedOfficerIds"] = acted
	var log_entry: Dictionary = _build_log(next, message)
	(next["logs"] as Array).append(log_entry)
	return _finish(data, next, kind, city["id"], officer["id"], "", log_entry)


static func _commit_banquet(
		data: Dictionary, city: Dictionary, next_city: Dictionary,
		target: Dictionary, next_target: Dictionary, message: String
) -> Dictionary:
	var next: Dictionary = data.duplicate(true)
	next["cities"][city["id"]] = next_city
	next["officers"][target["id"]] = next_target
	next["campaignStarted"] = true
	var log_entry: Dictionary = _build_log(next, message)
	(next["logs"] as Array).append(log_entry)
	return _finish(data, next, "banquet_officer", city["id"], "", target["id"], log_entry)


static func _finish(
		before: Dictionary, after: Dictionary, kind: String, city_id: String,
		officer_id: String, target_id: String, log_entry: Dictionary
) -> Dictionary:
	var issues: Array[Dictionary] = Validator.validate_runtime(after)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	var receipt: Dictionary = {
		"kind": kind,
		"state": {
			"turn": after["turn"], "rngSeed": after["rngSeed"],
			"campaignStarted": after["campaignStarted"],
			"actedOfficerIds": (after["actedOfficerIds"] as Array).duplicate(true),
			"logCount": (after["logs"] as Array).size(),
		},
		"city": {"id": city_id, "before": _city_resources(before["cities"][city_id]), "after": _city_resources(after["cities"][city_id])},
		"appendedLog": log_entry.duplicate(true),
	}
	if not officer_id.is_empty():
		receipt["officer"] = {"id": officer_id, "before": _officer_values(before["officers"][officer_id]), "after": _officer_values(after["officers"][officer_id])}
	if not target_id.is_empty():
		receipt["targetOfficer"] = {"id": target_id, "before": _officer_values(before["officers"][target_id]), "after": _officer_values(after["officers"][target_id])}
	return {"ok": true, "error": "", "next_state": GameState.new(after), "receipt": receipt}


static func _city_resources(city: Dictionary) -> Dictionary:
	return {
		"farming": city["farming"], "commerce": city["commerce"],
		"population": city["population"], "publicLoyalty": city["publicLoyalty"],
		"disasterPrevention": city.get("disasterPrevention", 0), "condition": city.get("condition", "normal"),
		"money": city["money"], "food": city["food"],
	}


static func _officer_values(officer: Dictionary) -> Dictionary:
	return {"stamina": officer["stamina"], "loyalty": officer["loyalty"]}


static func _effective_attributes(data: Dictionary, officer: Dictionary) -> Dictionary:
	var force: int = int(officer["force"])
	var intelligence: int = int(officer["intelligence"])
	for raw_item_id: Variant in officer["equipmentItemIds"]:
		var item: Dictionary = data["items"][raw_item_id]
		force += int(item["forceBonus"])
		intelligence += int(item["intelligenceBonus"])
	return {"force": force, "intelligence": intelligence}


static func _build_log(data: Dictionary, message: String) -> Dictionary:
	var used: Dictionary = {}
	for raw_log: Variant in data["logs"]:
		used[(raw_log as Dictionary)["id"]] = true
	var serial: int = (data["logs"] as Array).size() + 1
	var log_id: String = "log-%d-%03d" % [int(data["turn"]), serial]
	while used.has(log_id):
		serial += 1
		log_id = "log-%d-%03d" % [int(data["turn"]), serial]
	return {"id": log_id, "kind": "map", "message": message, "turn": int(data["turn"])}


static func _command_label(kind: String) -> String:
	return {
		"develop_commerce": "招商", "govern_city": "治理", "inspect_city": "出巡",
		"trade_food": "交易", "plunder_city": "掠夺",
	}.get(kind, kind)


static func _unavailable(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason}


static func _failure(reason: String) -> Dictionary:
	return {"ok": false, "error": reason, "receipt": {}}
