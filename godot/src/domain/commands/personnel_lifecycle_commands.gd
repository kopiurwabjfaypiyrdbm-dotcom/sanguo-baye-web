class_name PersonnelLifecycleCommands
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const CoreLcg = preload("res://src/domain/random/core_lcg.gd")
const Rulesets = preload("res://src/domain/rules/campaign_rulesets.gd")
const StrategicOrders = preload("res://src/domain/commands/strategic_order_commands.gd")

const SEARCH_STAMINA_COST: int = 8
const RECRUIT_OFFICER_STAMINA_COST: int = 8
const CONFISCATE_LOYALTY_PENALTY: int = 20
const MAX_CITY_RESOURCE: int = 30_000
const CHARACTER_RESISTANCE_DIVISOR: Array[int] = [2, 5, 4, 3, 1]
const COMMAND_KINDS: Array[String] = [
	"search_city", "recruit_free_officer", "recruit_captive", "release_captive",
	"execute_captive", "banish_officer", "confiscate_equipment",
]


static func execute(state: GameState, kind: String, parameters: Dictionary) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(before)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	if not COMMAND_KINDS.has(kind):
		return _failure("不支持的人才与俘虏命令：%s" % kind)
	match kind:
		"search_city":
			return _execute_search(before, parameters)
		"recruit_free_officer":
			return _execute_recruit_free(before, parameters)
		"recruit_captive":
			return _execute_recruit_captive(before, parameters)
		"release_captive":
			return _execute_release(before, parameters)
		"execute_captive":
			return _execute_execution(before, parameters)
		"banish_officer":
			return _execute_banish(before, parameters)
		"confiscate_equipment":
			return _execute_confiscation(before, parameters)
	return _failure("不支持的人才与俘虏命令：%s" % kind)


static func get_availability(
		state: GameState, kind: String, parameters: Dictionary
) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty():
		return _unavailable(Validator.first_error(issues))
	return _availability_for_data(data, kind, parameters)


## Stable IDs and pairwise eligibility for the application query layer.
static func query_city_catalog(state: GameState, city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty():
		return _empty_catalog(Validator.first_error(issues))
	var city: Dictionary = data["cities"].get(city_id, {})
	if city.is_empty():
		return _empty_catalog("未知城池：%s" % city_id)

	var serving_ids: Array[String] = []
	var free_ids: Array[String] = []
	var captive_ids: Array[String] = []
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id: String = str(raw_officer_id)
		var officer: Dictionary = data["officers"][officer_id]
		if officer.get("cityId", "") != city_id:
			continue
		match str(officer.get("status", "")):
			"serving":
				if officer.get("factionId", "") == data["activeFactionId"]:
					serving_ids.append(officer_id)
			"free":
				if (data["discoveredOfficerIds"] as Array).has(officer_id):
					free_ids.append(officer_id)
			"captive":
				if officer.get("captorFactionId", "") == data["activeFactionId"]:
					captive_ids.append(officer_id)

	var search_executors: Array[Dictionary] = []
	for officer_id: String in serving_ids:
		search_executors.append(_public_availability(_availability_for_data(
			data, "search_city", {"cityId": city_id, "officerId": officer_id}
		), "officerId", officer_id))

	var free_targets: Array[Dictionary] = []
	for target_id: String in free_ids:
		var executors: Array[Dictionary] = []
		for executor_id: String in serving_ids:
			executors.append(_public_availability(_availability_for_data(
				data, "recruit_free_officer", {
					"cityId": city_id, "executorOfficerId": executor_id,
					"targetOfficerId": target_id,
				}
			), "officerId", executor_id))
		free_targets.append({"targetOfficerId": target_id, "executors": executors})

	var captive_targets: Array[Dictionary] = []
	for captive_id: String in captive_ids:
		var surrender_executors: Array[Dictionary] = []
		for executor_id: String in serving_ids:
			surrender_executors.append(_public_availability(_availability_for_data(
				data, "recruit_captive", {
					"cityId": city_id, "executorOfficerId": executor_id,
					"captiveOfficerId": captive_id,
				}
			), "officerId", executor_id))
		captive_targets.append({
			"captiveOfficerId": captive_id,
			"surrenderExecutors": surrender_executors,
			"release": _public_availability(_availability_for_data(
				data, "release_captive", {"cityId": city_id, "captiveOfficerId": captive_id}
			)),
			"execute": _public_availability(_availability_for_data(
				data, "execute_captive", {"cityId": city_id, "captiveOfficerId": captive_id}
			)),
			"banish": _public_availability(_availability_for_data(
				data, "banish_officer", {"cityId": city_id, "officerId": captive_id}
			)),
		})

	var banish_targets: Array[Dictionary] = []
	var confiscate_targets: Array[Dictionary] = []
	for officer_id: String in serving_ids:
		banish_targets.append(_public_availability(_availability_for_data(
			data, "banish_officer", {"cityId": city_id, "officerId": officer_id}
		), "officerId", officer_id))
		var officer: Dictionary = data["officers"][officer_id]
		var items: Array[Dictionary] = []
		for raw_item_id: Variant in officer.get("equipmentItemIds", []):
			var item_id: String = str(raw_item_id)
			items.append(_public_availability(_availability_for_data(
				data, "confiscate_equipment", {
					"cityId": city_id, "officerId": officer_id, "itemId": item_id,
				}
			), "itemId", item_id))
		if not items.is_empty():
			confiscate_targets.append({"officerId": officer_id, "items": items})
	for captive_id: String in captive_ids:
		banish_targets.append(_public_availability(_availability_for_data(
			data, "banish_officer", {"cityId": city_id, "officerId": captive_id}
		), "officerId", captive_id))
	var officer_rule_values: Dictionary = {}
	for officer_id: String in serving_ids + free_ids + captive_ids:
		officer_rule_values[officer_id] = {
			"effectiveIntelligence": int(_effective_attributes(data, data["officers"][officer_id])["intelligence"]),
		}

	return {
		"allowed": city.get("ownerId", "") == data["activeFactionId"],
		"reason": "" if city.get("ownerId", "") == data["activeFactionId"] else "只能管理己方城池的人才与俘虏",
		"searchExecutors": search_executors,
		"freeTargets": free_targets,
		"captiveTargets": captive_targets,
		"banishTargets": banish_targets,
		"confiscateTargets": confiscate_targets,
		"officerRuleValues": officer_rule_values,
		"commandPolicies": _command_policies(data["rulesetId"]),
	}


static func _command_policies(ruleset_id: String) -> Dictionary:
	var surrender_cost: Dictionary = Rulesets.get_command_cost(ruleset_id, "surrender")
	return {
		"search_city": {
			"dangerous": false,
			"cost": {"stamina": SEARCH_STAMINA_COST, "money": 0, "usesAction": true},
			"summary": "尝试发现或直接登用人才，也可能获得道具、金钱或粮草。",
			"confirmationTemplate": "",
		},
		"recruit_free_officer": {
			"dangerous": false,
			"cost": {"stamina": RECRUIT_OFFICER_STAMINA_COST, "money": 0, "usesAction": true},
			"summary": "尝试让本城已发现的在野人才出仕；失败后仍保持已发现。",
			"confirmationTemplate": "",
		},
		"recruit_captive": {
			"dangerous": false,
			"cost": {
				"stamina": int(surrender_cost.get("stamina", 0)),
				"money": int(surrender_cost.get("money", 0)), "usesAction": true,
			},
			"summary": "以有效智力、忠诚和性格进行确定性判定；失败可能降低忠诚。",
			"confirmationTemplate": "",
		},
		"release_captive": {
			"dangerous": false,
			"cost": {"stamina": 0, "money": 0, "usesAction": false},
			"summary": "俘虏成为羁押城的已发现在野人物。",
			"confirmationTemplate": "",
		},
		"execute_captive": {
			"dangerous": true,
			"cost": {"stamina": 0, "money": 0, "usesAction": false},
			"summary": "人物死亡，全部装备回收到羁押城；执行后不可撤销。",
			"confirmationTemplate": "处斩 {target} 后人物死亡，装备回收到本城。此操作不可撤销。",
		},
		"banish_officer": {
			"dangerous": true,
			"cost": {"stamina": 0, "money": 0, "usesAction": false},
			"summary": "人物成为随机目标城的在野人物，兵力与体力清零；执行后不可撤销。",
			"confirmationTemplate": "流放 {target} 后其将离开当前势力并随机流落某城。确认继续？",
		},
		"confiscate_equipment": {
			"dangerous": true,
			"cost": {"stamina": 0, "money": 0, "usesAction": false},
			"summary": "装备回到城池；除玩家君主外忠诚降低 %d 并推进一次随机种子。" % CONFISCATE_LOYALTY_PENALTY,
			"confirmationTemplate": "没收 {target} 的 {item}；除玩家君主外忠诚将降低 %d。确认继续？" % CONFISCATE_LOYALTY_PENALTY,
		},
	}


static func _availability_for_data(data: Dictionary, kind: String, parameters: Dictionary) -> Dictionary:
	if not COMMAND_KINDS.has(kind):
		return _unavailable("不支持的人才与俘虏命令：%s" % kind)
	match kind:
		"search_city":
			return _search_availability(data, parameters)
		"recruit_free_officer":
			return _recruit_free_availability(data, parameters)
		"recruit_captive":
			return _recruit_captive_availability(data, parameters)
		"release_captive", "execute_captive":
			return _captive_disposition_availability(data, kind, parameters)
		"banish_officer":
			return _banish_availability(data, parameters)
		"confiscate_equipment":
			return _confiscate_availability(data, parameters)
	return _unavailable("不支持的人才与俘虏命令：%s" % kind)


static func _search_availability(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var gate: Dictionary = _campaign_gate(data)
	if not gate["allowed"]:
		return gate
	var city_id: String = str(parameters.get("cityId", ""))
	var city: Dictionary = data["cities"].get(city_id, {})
	if city.is_empty():
		return _unavailable("未知城池：%s" % city_id)
	if city.get("ownerId", "") != data["activeFactionId"]:
		return _unavailable("只能在己方城池执行搜寻")
	var officer_id: String = str(parameters.get("officerId", ""))
	var officer: Dictionary = data["officers"].get(officer_id, {})
	if officer.is_empty():
		return _unavailable("未知武将：%s" % officer_id)
	if not _is_serving_at(officer, data["activeFactionId"], city_id):
		return _unavailable("执行武将不在该城")
	if (data["actedOfficerIds"] as Array).has(officer_id):
		return _unavailable("该武将本月已经执行过命令")
	if int(officer["stamina"]) < SEARCH_STAMINA_COST:
		return _unavailable("武将体力不足，需要 %d" % SEARCH_STAMINA_COST)
	return {"allowed": true, "reason": "", "city": city, "officer": officer}


static func _recruit_free_availability(data: Dictionary, parameters: Dictionary) -> Dictionary:
	if data["phase"] != "player" or data["activeFactionId"] != data["playerFactionId"]:
		return _unavailable("只能在玩家阶段登用人才")
	var city_id: String = str(parameters.get("cityId", ""))
	var city: Dictionary = data["cities"].get(city_id, {})
	if city.is_empty() or city.get("ownerId", "") != data["playerFactionId"]:
		return _unavailable("只能在己方城池登用人才")
	var executor_id: String = str(parameters.get("executorOfficerId", ""))
	var executor: Dictionary = data["officers"].get(executor_id, {})
	if not _is_serving_at(executor, data["playerFactionId"], city_id):
		return _unavailable("登用执行者不在该城")
	if (data["actedOfficerIds"] as Array).has(executor_id):
		return _unavailable("该武将本月已经执行过命令")
	if int(executor["stamina"]) < RECRUIT_OFFICER_STAMINA_COST:
		return _unavailable("武将体力不足，需要 %d" % RECRUIT_OFFICER_STAMINA_COST)
	var target_id: String = str(parameters.get("targetOfficerId", ""))
	var target: Dictionary = data["officers"].get(target_id, {})
	if target.is_empty() or target.get("status", "") != "free" \
			or target.get("cityId", "") != city_id \
			or not (data["discoveredOfficerIds"] as Array).has(target_id):
		return _unavailable("该人才尚未在本城被发现")
	return {
		"allowed": true, "reason": "", "city": city,
		"executor": executor, "target": target,
	}


static func _recruit_captive_availability(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var gate: Dictionary = _campaign_gate(data)
	if not gate["allowed"]:
		return gate
	var city_id: String = str(parameters.get("cityId", ""))
	var city: Dictionary = data["cities"].get(city_id, {})
	if city.is_empty() or city.get("ownerId", "") != data["activeFactionId"]:
		return _unavailable("只能招降己方城池中的俘虏")
	var executor_id: String = str(parameters.get("executorOfficerId", ""))
	var executor: Dictionary = data["officers"].get(executor_id, {})
	if not _is_serving_at(executor, data["activeFactionId"], city_id):
		return _unavailable("招降执行武将不在该城")
	var captive_id: String = str(parameters.get("captiveOfficerId", ""))
	var captive: Dictionary = data["officers"].get(captive_id, {})
	if not _is_captive_at(captive, data["activeFactionId"], city_id):
		return _unavailable("目标不是该城俘虏")
	if (data["actedOfficerIds"] as Array).has(executor_id):
		return _unavailable("该武将本月已经执行过命令")
	var cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], "surrender")
	if int(executor["stamina"]) < int(cost["stamina"]):
		return _unavailable("招降需要至少 %d 点体力" % int(cost["stamina"]))
	if int(city["money"]) < int(cost["money"]):
		return _unavailable("招降需要 %d 金" % int(cost["money"]))
	return {
		"allowed": true, "reason": "", "city": city,
		"executor": executor, "target": captive, "cost": cost,
	}


static func _captive_disposition_availability(
		data: Dictionary, kind: String, parameters: Dictionary
) -> Dictionary:
	var gate: Dictionary = _campaign_gate(data)
	if not gate["allowed"]:
		return gate
	var city_id: String = str(parameters.get("cityId", ""))
	var city: Dictionary = data["cities"].get(city_id, {})
	var ownership_error: String = "只能释放己方城池中的俘虏" \
			if kind == "release_captive" else "只能处置己方城池中的俘虏"
	if city.is_empty() or city.get("ownerId", "") != data["activeFactionId"]:
		return _unavailable(ownership_error)
	var captive_id: String = str(parameters.get("captiveOfficerId", ""))
	var captive: Dictionary = data["officers"].get(captive_id, {})
	if not _is_captive_at(captive, data["activeFactionId"], city_id):
		return _unavailable("目标不是该城俘虏")
	if kind == "release_captive" and _neutral_faction_id(data).is_empty():
		return _unavailable("释放俘虏需要无所属势力")
	return {"allowed": true, "reason": "", "city": city, "target": captive}


static func _banish_availability(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var gate: Dictionary = _campaign_gate(data)
	if not gate["allowed"]:
		return gate
	var city_id: String = str(parameters.get("cityId", ""))
	var city: Dictionary = data["cities"].get(city_id, {})
	if city.is_empty() or city.get("ownerId", "") != data["activeFactionId"]:
		return _unavailable("只能从己方城池流放人物")
	var officer_id: String = str(parameters.get("officerId", ""))
	var officer: Dictionary = data["officers"].get(officer_id, {})
	var local_serving: bool = _is_serving_at(officer, data["activeFactionId"], city_id)
	var local_captive: bool = _is_captive_at(officer, data["activeFactionId"], city_id)
	if not local_serving and not local_captive:
		return _unavailable("目标不在该城或身份不允许流放")
	if local_serving and officer_id == data["factions"][data["activeFactionId"]]["rulerOfficerId"]:
		return _unavailable("不能流放当前君主")
	if data["cityOrder"].is_empty():
		return _unavailable("没有可供流放的城市")
	return {"allowed": true, "reason": "", "city": city, "target": officer}


static func _confiscate_availability(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var gate: Dictionary = _campaign_gate(data)
	if not gate["allowed"]:
		return gate
	var city_id: String = str(parameters.get("cityId", ""))
	var city: Dictionary = data["cities"].get(city_id, {})
	if city.is_empty() or city.get("ownerId", "") != data["activeFactionId"]:
		return _unavailable("只能在己方城池没收装备")
	var officer_id: String = str(parameters.get("officerId", ""))
	var officer: Dictionary = data["officers"].get(officer_id, {})
	if not _is_serving_at(officer, data["activeFactionId"], city_id):
		return _unavailable("待没收装备的武将不在该城")
	var item_id: String = str(parameters.get("itemId", ""))
	if not (officer.get("equipmentItemIds", []) as Array).has(item_id):
		return _unavailable("该武将没有指定装备")
	if not data["items"].has(item_id):
		return _unavailable("指定装备不存在")
	return {
		"allowed": true, "reason": "", "city": city,
		"target": officer, "item": data["items"][item_id],
	}


static func _execute_search(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability: Dictionary = _search_availability(data, parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	var city: Dictionary = availability["city"]
	var officer: Dictionary = availability["officer"]
	var next: Dictionary = data.duplicate(true)
	var next_seed: int = int(data["rngSeed"])
	var first: Dictionary = _draw(next_seed, 4)
	next_seed = first["seed"]
	var result_type: int = first["result"]
	var next_city: Dictionary = city.duplicate(true)
	var message: String = "%s在%s四处查访，没有得到有用的消息。" % [officer["name"], city["name"]]
	if result_type == 1:
		var intelligence_roll: Dictionary = _draw(next_seed, 150)
		next_seed = intelligence_roll["seed"]
		if int(intelligence_roll["result"]) < int(officer["intelligence"]):
			if int(intelligence_roll["result"]) % 2 == 0:
				var candidates: Array[Dictionary] = _ordered_free_candidates(data, city["id"])
				if not candidates.is_empty():
					var candidate_roll: Dictionary = _draw(next_seed, candidates.size())
					next_seed = candidate_roll["seed"]
					var candidate: Dictionary = candidates[int(candidate_roll["result"])]
					var recruit_roll: Dictionary = _draw(next_seed, 110)
					next_seed = recruit_roll["seed"]
					if int(recruit_roll["result"]) < int(officer["intelligence"]):
						var loyalty_roll: Dictionary = _draw(next_seed, 30)
						next_seed = loyalty_roll["seed"]
						var recruited: Dictionary = candidate.duplicate(true)
						recruited["status"] = "serving"
						recruited["factionId"] = data["activeFactionId"]
						recruited["loyalty"] = 70 + int(loyalty_roll["result"])
						next["officers"][candidate["id"]] = recruited
						(next["discoveredOfficerIds"] as Array).erase(candidate["id"])
						message = "%s在%s访得%s，成功请其出仕，忠诚为 %d。" % [
							officer["name"], city["name"], candidate["name"], recruited["loyalty"],
						]
					else:
						if data["activeFactionId"] == data["playerFactionId"] \
								and not (next["discoveredOfficerIds"] as Array).has(candidate["id"]):
							(next["discoveredOfficerIds"] as Array).append(candidate["id"])
						message = "%s在%s听闻%s之名，但未能请其出仕。" % [
							officer["name"], city["name"], candidate["name"],
						]
			else:
				var hidden_items: Array = (city.get("hiddenItemIds", []) as Array).duplicate(true)
				if not hidden_items.is_empty():
					var item_roll: Dictionary = _draw(next_seed, hidden_items.size())
					next_seed = item_roll["seed"]
					var item_index: int = int(item_roll["result"])
					var item_id: String = str(hidden_items[item_index])
					var item_ids: Array = (city.get("itemIds", []) as Array).duplicate(true)
					item_ids.append(item_id)
					hidden_items.remove_at(item_index)
					next_city["itemIds"] = item_ids
					next_city["hiddenItemIds"] = hidden_items
					message = "%s在%s搜得%s。" % [officer["name"], city["name"], data["items"][item_id]["name"]]
	elif result_type == 2 or result_type == 3:
		var amount_roll: Dictionary = _draw(next_seed, maxi(1, int(officer["intelligence"]) * 2))
		next_seed = amount_roll["seed"]
		var amount: int = 10 + int(amount_roll["result"])
		var field: String = "money" if result_type == 2 else "food"
		if int(city[field]) < MAX_CITY_RESOURCE:
			next_city[field] = mini(MAX_CITY_RESOURCE, int(city[field]) + amount)
		message = "%s在%s搜得%s %d。" % [
			officer["name"], city["name"], "金钱" if result_type == 2 else "粮草", amount,
		]
	next["cities"][city["id"]] = next_city
	var next_officer: Dictionary = officer.duplicate(true)
	next_officer["stamina"] = int(officer["stamina"]) - SEARCH_STAMINA_COST
	next["officers"][officer["id"]] = next_officer
	next["rngSeed"] = next_seed
	(next["actedOfficerIds"] as Array).append(officer["id"])
	return _finalize(data, next, "search_city", city["id"], [officer["id"]], message)


static func _execute_recruit_free(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability: Dictionary = _recruit_free_availability(data, parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	var city: Dictionary = availability["city"]
	var executor: Dictionary = availability["executor"]
	var target: Dictionary = availability["target"]
	var next: Dictionary = data.duplicate(true)
	var success_roll: Dictionary = _draw(int(data["rngSeed"]), 110)
	var next_seed: int = success_roll["seed"]
	var message: String
	if int(success_roll["result"]) < int(executor["intelligence"]):
		var loyalty_roll: Dictionary = _draw(next_seed, 30)
		next_seed = loyalty_roll["seed"]
		var recruited: Dictionary = target.duplicate(true)
		recruited["status"] = "serving"
		recruited["factionId"] = data["playerFactionId"]
		recruited["loyalty"] = 70 + int(loyalty_roll["result"])
		next["officers"][target["id"]] = recruited
		(next["discoveredOfficerIds"] as Array).erase(target["id"])
		message = "%s成功说服%s在%s出仕，忠诚为 %d。" % [
			executor["name"], target["name"], city["name"], recruited["loyalty"],
		]
	else:
		message = "%s劝说%s出仕，但对方暂未应允。" % [executor["name"], target["name"]]
	var next_executor: Dictionary = executor.duplicate(true)
	next_executor["stamina"] = int(executor["stamina"]) - RECRUIT_OFFICER_STAMINA_COST
	next["officers"][executor["id"]] = next_executor
	next["rngSeed"] = next_seed
	(next["actedOfficerIds"] as Array).append(executor["id"])
	return _finalize(
		data, next, "recruit_free_officer", city["id"],
		[executor["id"], target["id"]], message
	)


static func _execute_recruit_captive(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability: Dictionary = _recruit_captive_availability(data, parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	var city: Dictionary = availability["city"]
	var executor: Dictionary = availability["executor"]
	var captive: Dictionary = availability["target"]
	var cost: Dictionary = availability["cost"]
	var next_seed: int = int(data["rngSeed"])
	var intelligence_roll: Dictionary = _draw(next_seed, 100)
	next_seed = intelligence_roll["seed"]
	var executor_intelligence: int = int(_effective_attributes(data, executor)["intelligence"])
	var captive_intelligence: int = int(_effective_attributes(data, captive)["intelligence"])
	var intelligence_chance: int = clampi(executor_intelligence - captive_intelligence + 50, 0, 99)
	var passed_intelligence: bool = int(intelligence_roll["result"]) <= intelligence_chance
	var reduced_loyalty: int = int(captive["loyalty"]) - int(floor(float(captive["loyalty"]) / 10.0)) \
			if passed_intelligence else int(captive["loyalty"])
	var succeeded: bool = false
	var recruited_loyalty: int = reduced_loyalty
	if passed_intelligence and int(captive["loyalty"]) <= 60:
		var character_index: int = int(captive.get("character", 0))
		var divisor: int = CHARACTER_RESISTANCE_DIVISOR[character_index] \
				if character_index >= 0 and character_index < CHARACTER_RESISTANCE_DIVISOR.size() else 1
		var resistance_roll: Dictionary = _draw(next_seed, 100)
		next_seed = resistance_roll["seed"]
		succeeded = int(resistance_roll["result"]) >= int(floor(float(captive["loyalty"]) / float(divisor)))
		if succeeded:
			var loyalty_roll: Dictionary = _draw(next_seed, 40)
			next_seed = loyalty_roll["seed"]
			recruited_loyalty = 40 + int(loyalty_roll["result"])

	var next: Dictionary = data.duplicate(true)
	var next_executor: Dictionary = executor.duplicate(true)
	next_executor["stamina"] = int(executor["stamina"]) - int(cost["stamina"])
	next["officers"][executor["id"]] = next_executor
	var next_captive: Dictionary = captive.duplicate(true)
	var message: String
	if succeeded:
		next_captive["status"] = "serving"
		next_captive["factionId"] = data["activeFactionId"]
		next_captive.erase("captorFactionId")
		next_captive.erase("formerFactionId")
		next_captive["loyalty"] = recruited_loyalty
		next_captive["troops"] = 0
		next_captive["stamina"] = 0
		message = "%s说服%s归顺，忠诚为 %d。" % [executor["name"], captive["name"], recruited_loyalty]
	else:
		next_captive["loyalty"] = reduced_loyalty
		message = "%s招降%s未果，其旧部忠诚降至 %d。" % [executor["name"], captive["name"], reduced_loyalty] \
				if passed_intelligence else "%s招降%s未果，未能动摇其忠诚。" % [executor["name"], captive["name"]]
	next["officers"][captive["id"]] = next_captive
	var next_city: Dictionary = city.duplicate(true)
	next_city["money"] = int(city["money"]) - int(cost["money"])
	next["cities"][city["id"]] = next_city
	next["rngSeed"] = next_seed
	(next["actedOfficerIds"] as Array).append(executor["id"])
	return _finalize(
		data, next, "recruit_captive", city["id"],
		[executor["id"], captive["id"]], message
	)


static func _execute_release(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability: Dictionary = _captive_disposition_availability(data, "release_captive", parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	var city: Dictionary = availability["city"]
	var captive: Dictionary = availability["target"]
	var next: Dictionary = data.duplicate(true)
	var released: Dictionary = captive.duplicate(true)
	released["status"] = "free"
	released["factionId"] = _neutral_faction_id(data)
	released.erase("captorFactionId")
	released.erase("formerFactionId")
	released.erase("death")
	released["troops"] = 0
	released["stamina"] = 0
	next["officers"][captive["id"]] = released
	if not (next["discoveredOfficerIds"] as Array).has(captive["id"]):
		(next["discoveredOfficerIds"] as Array).append(captive["id"])
	return _finalize(
		data, next, "release_captive", city["id"], [captive["id"]],
		"释放%s，其成为%s在野人物。" % [captive["name"], city["name"]]
	)


static func _execute_execution(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability: Dictionary = _captive_disposition_availability(data, "execute_captive", parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	var city: Dictionary = availability["city"]
	var captive: Dictionary = availability["target"]
	var random: Dictionary = CoreLcg.next_random(int(data["rngSeed"]))
	var cancellation: Dictionary = StrategicOrders.cancel_officer_orders(data, captive["id"], "执行者失效")
	if not cancellation["ok"]:
		return _failure(cancellation["error"])
	var next: Dictionary = cancellation["next"]
	var next_city: Dictionary = city.duplicate(true)
	var recovered_items: Array = (city.get("itemIds", []) as Array).duplicate(true)
	for raw_item_id: Variant in captive.get("equipmentItemIds", []):
		recovered_items.append(str(raw_item_id))
	next_city["itemIds"] = recovered_items
	next["cities"][city["id"]] = next_city
	var dead: Dictionary = captive.duplicate(true)
	dead["status"] = "dead"
	dead["factionId"] = _neutral_faction_id(data)
	dead.erase("captorFactionId")
	dead.erase("formerFactionId")
	dead.erase("cityId")
	dead["troops"] = 0
	dead["stamina"] = 0
	dead["equipmentItemIds"] = []
	dead["death"] = {
		"cause": "execution", "turn": data["turn"],
		"year": data["calendar"]["year"], "month": data["calendar"]["month"],
		"cityId": city["id"], "responsibleFactionId": data["activeFactionId"],
	}
	next["officers"][captive["id"]] = dead
	(next["actedOfficerIds"] as Array).erase(captive["id"])
	(next["discoveredOfficerIds"] as Array).erase(captive["id"])
	next["rngSeed"] = random["seed"]
	next = _update_city_satraps(next)
	return _finalize(
		data, next, "execute_captive", city["id"], [captive["id"]],
		"处斩%s；其装备由%s收存。" % [captive["name"], city["name"]]
	)


static func _execute_banish(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability: Dictionary = _banish_availability(data, parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	var city: Dictionary = availability["city"]
	var target: Dictionary = availability["target"]
	var ordered_cities: Array[Dictionary] = _ordered_cities(data)
	var random: Dictionary = _draw(int(data["rngSeed"]), ordered_cities.size())
	var destination: Dictionary = ordered_cities[int(random["result"])]
	var cancellation: Dictionary = StrategicOrders.cancel_officer_orders(data, target["id"], "执行者失效")
	if not cancellation["ok"]:
		return _failure(cancellation["error"])
	var next: Dictionary = cancellation["next"]
	var released: Dictionary = target.duplicate(true)
	released["status"] = "free"
	released["factionId"] = _neutral_faction_id(data)
	released.erase("captorFactionId")
	released.erase("formerFactionId")
	released.erase("death")
	released["cityId"] = destination["id"]
	released["troops"] = 0
	released["stamina"] = 0
	next["officers"][target["id"]] = released
	(next["actedOfficerIds"] as Array).erase(target["id"])
	if not (next["discoveredOfficerIds"] as Array).has(target["id"]):
		(next["discoveredOfficerIds"] as Array).append(target["id"])
	next["rngSeed"] = random["seed"]
	next = _update_city_satraps(next)
	return _finalize(
		data, next, "banish_officer", city["id"], [target["id"]],
		"流放%s，其流落至%s。" % [target["name"], destination["name"]]
	)


static func _execute_confiscation(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability: Dictionary = _confiscate_availability(data, parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	var city: Dictionary = availability["city"]
	var target: Dictionary = availability["target"]
	var item: Dictionary = availability["item"]
	var player_ruler_id: String = data["factions"][data["playerFactionId"]]["rulerOfficerId"]
	var is_player_ruler: bool = target["id"] == player_ruler_id
	var next_seed: int = int(data["rngSeed"])
	if not is_player_ruler:
		next_seed = int(CoreLcg.next_random(next_seed)["seed"])
	var next: Dictionary = data.duplicate(true)
	var next_city: Dictionary = city.duplicate(true)
	var item_ids: Array = (city.get("itemIds", []) as Array).duplicate(true)
	item_ids.append(item["id"])
	next_city["itemIds"] = item_ids
	next["cities"][city["id"]] = next_city
	var next_target: Dictionary = target.duplicate(true)
	var equipment: Array = (target.get("equipmentItemIds", []) as Array).duplicate(true)
	equipment.erase(item["id"])
	next_target["equipmentItemIds"] = equipment
	if not is_player_ruler:
		next_target["loyalty"] = maxi(0, int(target["loyalty"]) - CONFISCATE_LOYALTY_PENALTY)
	next["officers"][target["id"]] = next_target
	next["rngSeed"] = next_seed
	next = _update_city_satraps(next)
	var ending: String = "。" if is_player_ruler else "；忠诚降至 %d。" % int(next_target["loyalty"])
	return _finalize(
		data, next, "confiscate_equipment", city["id"], [target["id"]],
		"没收%s的%s，装备收入%s%s" % [target["name"], item["name"], city["name"], ending]
	)


static func _finalize(
		before: Dictionary, next: Dictionary, kind: String, city_id: String,
		participant_ids: Array[String], message: String
) -> Dictionary:
	next["campaignStarted"] = true
	var log_entry: Dictionary = _build_log(next, message)
	(next["logs"] as Array).append(log_entry)
	var issues: Array[Dictionary] = Validator.validate_runtime(next)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	return {
		"ok": true,
		"error": "",
		"next_state": GameState.new(next),
		"receipt": _receipt(before, next, kind, city_id, participant_ids, log_entry),
	}


static func _receipt(
		before: Dictionary, after: Dictionary, kind: String, city_id: String,
		participant_ids: Array[String], log_entry: Dictionary
) -> Dictionary:
	var officers: Array[Dictionary] = []
	for officer_id: String in participant_ids:
		officers.append({
			"id": officer_id,
			"before": _officer_values(before["officers"][officer_id]),
			"after": _officer_values(after["officers"][officer_id]),
		})
	return {
		"kind": kind,
		"state": {
			"turn": after["turn"], "rngSeed": after["rngSeed"],
			"campaignStarted": after["campaignStarted"],
			"actedOfficerIds": (after["actedOfficerIds"] as Array).duplicate(true),
			"discoveredOfficerIds": (after["discoveredOfficerIds"] as Array).duplicate(true),
			"logCount": (after["logs"] as Array).size(),
		},
		"city": {
			"id": city_id,
			"before": _city_values(before["cities"][city_id]),
			"after": _city_values(after["cities"][city_id]),
		},
		"officers": officers,
		"appendedLog": log_entry.duplicate(true),
	}


static func _city_values(city: Dictionary) -> Dictionary:
	return {
		"farming": city["farming"], "commerce": city["commerce"],
		"money": city["money"], "food": city["food"],
		"satrapOfficerId": city.get("satrapOfficerId", null),
		"itemIds": (city.get("itemIds", []) as Array).duplicate(true),
		"hiddenItemIds": (city.get("hiddenItemIds", []) as Array).duplicate(true),
	}


static func _officer_values(officer: Dictionary) -> Dictionary:
	return {
		"status": officer["status"], "factionId": officer["factionId"],
		"cityId": officer.get("cityId", null),
		"captorFactionId": officer.get("captorFactionId", null),
		"formerFactionId": officer.get("formerFactionId", null),
		"loyalty": officer["loyalty"], "stamina": officer["stamina"],
		"troops": officer["troops"],
		"equipmentItemIds": (officer.get("equipmentItemIds", []) as Array).duplicate(true),
		"death": (officer["death"] as Dictionary).duplicate(true) if officer.get("death") is Dictionary else null,
	}


static func _update_city_satraps(data: Dictionary) -> Dictionary:
	var next: Dictionary = data.duplicate(true)
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id: String = str(raw_city_id)
		var city: Dictionary = data["cities"][city_id]
		var next_city: Dictionary = city.duplicate(true)
		var faction: Dictionary = data["factions"].get(city["ownerId"], {})
		if faction.is_empty() or bool(faction.get("isNeutral", false)):
			next_city.erase("satrapOfficerId")
			next["cities"][city_id] = next_city
			continue
		var stationed: Array[Dictionary] = []
		for raw_officer_id: Variant in data["officerOrder"]:
			var officer: Dictionary = data["officers"][raw_officer_id]
			if _is_serving_at(officer, city["ownerId"], city_id):
				stationed.append(officer)
		stationed.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
			var left_effective: Dictionary = _effective_attributes(data, left)
			var right_effective: Dictionary = _effective_attributes(data, right)
			if int(left_effective["intelligence"]) != int(right_effective["intelligence"]):
				return int(left_effective["intelligence"]) > int(right_effective["intelligence"])
			if int(left_effective["force"]) != int(right_effective["force"]):
				return int(left_effective["force"]) > int(right_effective["force"])
			return str(left["id"]) < str(right["id"])
		)
		var selected_id: String = ""
		var current_id: String = str(city.get("satrapOfficerId", ""))
		if data["rulesetId"] != "baye-classic-v1":
			for officer: Dictionary in stationed:
				if officer["id"] == current_id:
					selected_id = current_id
					break
		if selected_id.is_empty():
			for officer: Dictionary in stationed:
				if officer["id"] == faction["rulerOfficerId"]:
					selected_id = officer["id"]
					break
		if selected_id.is_empty() and not stationed.is_empty():
			selected_id = stationed[0]["id"]
		if selected_id.is_empty():
			next_city.erase("satrapOfficerId")
		else:
			next_city["satrapOfficerId"] = selected_id
		next["cities"][city_id] = next_city
	return next


static func _ordered_free_candidates(data: Dictionary, city_id: String) -> Array[Dictionary]:
	var candidates: Array[Dictionary] = []
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer: Dictionary = data["officers"][raw_officer_id]
		if officer.get("status", "") == "free" and officer.get("cityId", "") == city_id:
			candidates.append(officer)
	candidates.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		if int(left["intelligence"]) != int(right["intelligence"]):
			return int(left["intelligence"]) > int(right["intelligence"])
		if int(left["force"]) != int(right["force"]):
			return int(left["force"]) > int(right["force"])
		if str(left["name"]) != str(right["name"]):
			return str(left["name"]) < str(right["name"])
		return str(left["id"]) < str(right["id"])
	)
	return candidates


static func _ordered_cities(data: Dictionary) -> Array[Dictionary]:
	var cities: Array[Dictionary] = []
	for raw_city_id: Variant in data["cityOrder"]:
		cities.append(data["cities"][raw_city_id])
	cities.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		var left_source: int = int(left.get("sourceIndex", 9_007_199_254_740_991))
		var right_source: int = int(right.get("sourceIndex", 9_007_199_254_740_991))
		return left_source < right_source if left_source != right_source else str(left["id"]) < str(right["id"])
	)
	return cities


static func _effective_attributes(data: Dictionary, officer: Dictionary) -> Dictionary:
	var force: int = int(officer["force"])
	var intelligence: int = int(officer["intelligence"])
	for raw_item_id: Variant in officer.get("equipmentItemIds", []):
		var item: Dictionary = data["items"][raw_item_id]
		force += int(item["forceBonus"])
		intelligence += int(item["intelligenceBonus"])
	return {"force": force, "intelligence": intelligence}


static func _campaign_gate(data: Dictionary) -> Dictionary:
	if data["phase"] == "ended":
		return _unavailable("战役已经结束")
	if data.has("pendingSuccession") and data["pendingSuccession"] != null:
		return _unavailable("必须先拥立新君")
	return {"allowed": true, "reason": ""}


static func _is_serving_at(officer: Dictionary, faction_id: String, city_id: String) -> bool:
	return not officer.is_empty() and officer.get("status", "") == "serving" \
			and officer.get("factionId", "") == faction_id and officer.get("cityId", "") == city_id


static func _is_captive_at(officer: Dictionary, captor_id: String, city_id: String) -> bool:
	return not officer.is_empty() and officer.get("status", "") == "captive" \
			and officer.get("captorFactionId", "") == captor_id and officer.get("cityId", "") == city_id


static func _neutral_faction_id(data: Dictionary) -> String:
	var faction_ids: Array[String] = []
	for raw_faction_id: Variant in (data["factions"] as Dictionary).keys():
		faction_ids.append(str(raw_faction_id))
	faction_ids.sort()
	for faction_id: String in faction_ids:
		if bool(data["factions"][faction_id].get("isNeutral", false)):
			return faction_id
	return ""


static func _draw(seed: int, maximum: int) -> Dictionary:
	var random: Dictionary = CoreLcg.next_random(seed)
	return {
		"seed": int(random["seed"]),
		"result": int(floor(float(random["value"]) * float(maximum))),
	}


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


static func _public_availability(
		value: Dictionary, id_key: String = "", id_value: String = ""
) -> Dictionary:
	var result: Dictionary = {"allowed": bool(value["allowed"]), "reason": str(value["reason"])}
	if not id_key.is_empty():
		result[id_key] = id_value
	return result


static func _empty_catalog(reason: String) -> Dictionary:
	return {
		"allowed": false, "reason": reason, "searchExecutors": [], "freeTargets": [],
		"captiveTargets": [], "banishTargets": [], "confiscateTargets": [],
		"searchStaminaCost": SEARCH_STAMINA_COST,
		"recruitOfficerStaminaCost": RECRUIT_OFFICER_STAMINA_COST,
		"surrenderCost": {},
	}


static func _unavailable(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason}


static func _failure(reason: String) -> Dictionary:
	return {"ok": false, "error": reason, "receipt": {}}
