class_name CampaignAnnualProgression
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const CoreLcg = preload("res://src/domain/random/core_lcg.gd")

const PERSON_APPEAR_AGE: int = 16
const JS_MAX_SAFE_INTEGER: int = 9_007_199_254_740_991


static func settle(
		state: GameState, previous_calendar: Dictionary, validate_result: bool = true
) -> Dictionary:
	var before: Dictionary = state.snapshot()
	if int(before["calendar"]["month"]) != 1 \
			or int(before["calendar"]["year"]) != int(previous_calendar.get("year", 0)) + 1:
		return {"ok": true, "error": "", "next_state": GameState.new(before), "receipt": {
			"kind": "settle_annual_progression", "applied": false, "beforeSeed": before["rngSeed"],
			"afterSeed": before["rngSeed"], "appearedOfficerIds": [], "appearedItemIds": [], "appendedLogs": [],
		}}
	var next: Dictionary = before.duplicate(true)
	var seed: int = int(before["rngSeed"])
	var appeared_officer_ids: Array[String] = []
	var appeared_item_ids: Array[String] = []
	var placed_items: Dictionary = {}
	for raw_city_id: Variant in before["cityOrder"]:
		var city_id: String = str(raw_city_id)
		for field: String in ["itemIds", "hiddenItemIds"]:
			for raw_item_id: Variant in before["cities"][city_id].get(field, []): placed_items[str(raw_item_id)] = true
	for raw_officer_id: Variant in before["officerOrder"]:
		for raw_item_id: Variant in before["officers"][raw_officer_id].get("equipmentItemIds", []): placed_items[str(raw_item_id)] = true
	var item_ids: Array[String] = _sorted_entity_ids(before["items"])
	for item_id: String in item_ids:
		var item: Dictionary = before["items"][item_id]
		if int(item.get("appearanceYear", -1)) != int(before["calendar"]["year"]) \
				or placed_items.has(item_id): continue
		var target_city_id: String = str(item.get("appearanceCityId", ""))
		if target_city_id.is_empty() or not next["cities"].has(target_city_id): continue
		var city: Dictionary = next["cities"][target_city_id].duplicate(true)
		var hidden: Array = (city.get("hiddenItemIds", []) as Array).duplicate(true)
		hidden.append(item_id)
		city["hiddenItemIds"] = hidden
		next["cities"][target_city_id] = city
		placed_items[item_id] = true
		appeared_item_ids.append(item_id)
	var age_growth: bool = before["lifecyclePolicy"].get("ageGrowth", "disabled") == "enabled"
	for raw_officer_id: Variant in before["officerOrder"]:
		var officer_id: String = str(raw_officer_id)
		var officer: Dictionary = before["officers"][officer_id].duplicate(true)
		if age_growth and officer.get("status", "") != "dead": officer["age"] = int(officer["age"]) + 1
		next["officers"][officer_id] = officer
	var ordered_city_ids: Array[String] = _sorted_city_ids(before)
	var officer_ids: Array[String] = _sorted_entity_ids(next["officers"])
	var neutral_id: String = _neutral_faction_id(before)
	for officer_id: String in officer_ids:
		var officer: Dictionary = next["officers"][officer_id]
		if officer.get("status", "") != "hidden" \
				or int(officer.get("appearanceYear", -1)) != int(before["calendar"]["year"]): continue
		var target_city_id: String = str(officer.get("appearanceCityId", ""))
		if target_city_id.is_empty():
			var draw: Dictionary = CoreLcg.next_random(seed)
			seed = int(draw["seed"])
			var index: int = int(floor(float(draw["value"]) * float(ordered_city_ids.size())))
			target_city_id = ordered_city_ids[index] if index >= 0 and index < ordered_city_ids.size() else ""
		if target_city_id.is_empty() or not next["cities"].has(target_city_id): continue
		var appeared: Dictionary = officer.duplicate(true)
		appeared["status"] = "free"
		appeared["factionId"] = neutral_id
		appeared["cityId"] = target_city_id
		appeared["age"] = PERSON_APPEAR_AGE if age_growth else int(officer["age"])
		appeared["troops"] = 0
		next["officers"][officer_id] = appeared
		appeared_officer_ids.append(officer_id)
	next["rngSeed"] = seed
	var message: String = "年度更新：%s" % ("人物年龄增长 1 岁" if age_growth else "人物年龄按战役规则保持不变")
	if not appeared_officer_ids.is_empty(): message += "；各地传来新人才出仕前的活动消息"
	if not appeared_item_ids.is_empty(): message += "；有新道具进入各地隐藏库存"
	message += "。"
	_append_logs(next, "turn", [message])
	if validate_result:
		var issues: Array[Dictionary] = Validator.validate_runtime(next)
		if not issues.is_empty(): return _failure(Validator.first_error(issues))
	return {"ok": true, "error": "", "next_state": GameState.new(next), "receipt": {
		"kind": "settle_annual_progression", "applied": true, "beforeSeed": before["rngSeed"],
		"afterSeed": seed, "appearedOfficerIds": appeared_officer_ids, "appearedItemIds": appeared_item_ids,
		"appendedLogs": (next["logs"] as Array).slice((before["logs"] as Array).size()).duplicate(true),
	}}


static func _sorted_entity_ids(entities: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for raw_id: Variant in entities.keys(): result.append(str(raw_id))
	result.sort_custom(func(left: String, right: String) -> bool:
		var left_source: int = int(entities[left].get("sourceId", JS_MAX_SAFE_INTEGER))
		var right_source: int = int(entities[right].get("sourceId", JS_MAX_SAFE_INTEGER))
		return left < right if left_source == right_source else left_source < right_source
	)
	return result


static func _sorted_city_ids(data: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for raw_city_id: Variant in data["cityOrder"]: result.append(str(raw_city_id))
	result.sort_custom(func(left: String, right: String) -> bool:
		var left_source: int = int(data["cities"][left].get("sourceIndex", JS_MAX_SAFE_INTEGER))
		var right_source: int = int(data["cities"][right].get("sourceIndex", JS_MAX_SAFE_INTEGER))
		return left < right if left_source == right_source else left_source < right_source
	)
	return result


static func _neutral_faction_id(data: Dictionary) -> String:
	var ids: Array[String] = []
	for raw_id: Variant in data["factions"].keys(): ids.append(str(raw_id))
	ids.sort()
	for faction_id: String in ids:
		if bool(data["factions"][faction_id].get("isNeutral", false)): return faction_id
	return "neutral"


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


static func _failure(error: String) -> Dictionary:
	return {"ok": false, "error": error, "next_state": null, "receipt": {}}
