class_name OfficerManagementCommands
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")

const REWARD_MONEY_COST: int = 100
const REWARD_LOYALTY_GAIN: int = 8
const OFFICER_EQUIPMENT_LIMIT: int = 2
const COMMAND_KINDS: Array[String] = [
	"reward_officer", "appoint_satrap", "give_item", "unequip_item",
]


static func execute(state: GameState, kind: String, parameters: Dictionary) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(before)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	if not COMMAND_KINDS.has(kind):
		return _failure("不支持的武将管理命令：%s" % kind)
	var availability: Dictionary = _availability_for_data(before, kind, parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	match kind:
		"reward_officer":
			return _execute_reward(before, availability)
		"appoint_satrap":
			return _execute_appoint(before, availability)
		"give_item":
			return _execute_give(before, availability)
		"unequip_item":
			return _execute_unequip(before, availability)
	return _failure("不支持的武将管理命令：%s" % kind)


static func get_availability(
		state: GameState, kind: String, parameters: Dictionary
) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty():
		return _unavailable(Validator.first_error(issues))
	return _availability_for_data(data, kind, parameters)


## Produces one stable, validated catalog for the application query layer.
## Officer order follows officerOrder; inventory/equipment preserve their ordered arrays.
static func query_city_catalog(state: GameState, city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty():
		return {"allowed": false, "reason": Validator.first_error(issues), "officers": [], "inventoryItemIds": []}
	var city: Dictionary = data["cities"].get(city_id, {})
	if city.is_empty():
		return {"allowed": false, "reason": "未知城池：%s" % city_id, "officers": [], "inventoryItemIds": []}
	var inventory_ids: Array = (city.get("itemIds", []) as Array).duplicate(true)
	var rows: Array[Dictionary] = []
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id: String = str(raw_officer_id)
		var officer: Dictionary = data["officers"][officer_id]
		if officer.get("status", "") != "serving" \
				or officer.get("factionId", "") != data["activeFactionId"] \
				or officer.get("cityId", "") != city_id:
			continue
		var give_items: Array[Dictionary] = []
		for raw_item_id: Variant in inventory_ids:
			var item_id: String = str(raw_item_id)
			give_items.append(_public_availability(_availability_for_data(data, "give_item", {
				"cityId": city_id, "officerId": officer_id, "itemId": item_id,
			}), item_id))
		var unequip_items: Array[Dictionary] = []
		for raw_item_id: Variant in officer.get("equipmentItemIds", []):
			var item_id: String = str(raw_item_id)
			unequip_items.append(_public_availability(_availability_for_data(data, "unequip_item", {
				"cityId": city_id, "officerId": officer_id, "itemId": item_id,
			}), item_id))
		var reward: Dictionary = _public_availability(_availability_for_data(data, "reward_officer", {
			"cityId": city_id, "officerId": officer_id,
		}))
		reward["moneyCost"] = REWARD_MONEY_COST
		rows.append({
			"officerId": officer_id,
			"effective": _effective_attributes(data, officer),
			"reward": reward,
			"appoint": _public_availability(_availability_for_data(data, "appoint_satrap", {
				"cityId": city_id, "officerId": officer_id,
			})),
			"giveItems": give_items,
			"unequipItems": unequip_items,
		})
	return {
		"allowed": city.get("ownerId", "") == data["activeFactionId"],
		"reason": "" if city.get("ownerId", "") == data["activeFactionId"] else "只能管理己方城池中的武将",
		"officers": rows,
		"inventoryItemIds": inventory_ids,
		"equipmentLimit": OFFICER_EQUIPMENT_LIMIT,
		"appointmentMode": "automatic" if data["rulesetId"] == "baye-classic-v1" else "manual",
	}


static func _availability_for_data(data: Dictionary, kind: String, parameters: Dictionary) -> Dictionary:
	if not COMMAND_KINDS.has(kind):
		return _unavailable("不支持的武将管理命令：%s" % kind)
	if kind == "appoint_satrap" and data["rulesetId"] == "baye-classic-v1":
		return _unavailable("经典校准规则由君主或城内智力最高者自动担任太守")
	if kind == "reward_officer" or kind == "appoint_satrap":
		if data["phase"] != "player" or data["activeFactionId"] != data["playerFactionId"]:
			return _unavailable("只能在玩家阶段%s" % ("奖赏武将" if kind == "reward_officer" else "任命太守"))
	else:
		if data["phase"] == "ended":
			return _unavailable("战役已经结束")
		if data.has("pendingSuccession") and data["pendingSuccession"] != null:
			return _unavailable("必须先拥立新君")
	var city_id: String = str(parameters.get("cityId", ""))
	if not data["cities"].has(city_id):
		if kind == "appoint_satrap":
			return _unavailable("未知城池：%s" % city_id)
		return _unavailable(_city_ownership_error(kind))
	var city: Dictionary = data["cities"][city_id]
	var expected_owner: String = data["playerFactionId"] if kind in ["reward_officer", "appoint_satrap"] else data["activeFactionId"]
	if city["ownerId"] != expected_owner:
		return _unavailable(_city_ownership_error(kind))
	var officer_id: String = str(parameters.get("officerId", ""))
	var officer: Dictionary = data["officers"].get(officer_id, {})
	if kind == "reward_officer":
		if int(city["money"]) < REWARD_MONEY_COST:
			return _unavailable("城中金钱不足，需要 %d" % REWARD_MONEY_COST)
		if not _is_officer_at(officer, expected_owner, city_id):
			return _unavailable(_officer_location_error(kind))
		if officer_id == data["factions"][data["playerFactionId"]]["rulerOfficerId"]:
			return _unavailable("君主不需要奖赏忠诚")
		if int(officer["loyalty"]) >= 100:
			return _unavailable("该武将忠诚已经达到上限")
	elif kind == "appoint_satrap":
		if not _is_officer_at(officer, expected_owner, city_id):
			return _unavailable(_officer_location_error(kind))
		if city.get("satrapOfficerId", null) == officer_id:
			return _unavailable("该武将已经是本城太守")
	elif kind == "give_item":
		var item_id: String = str(parameters.get("itemId", ""))
		if not (city.get("itemIds", []) as Array).has(item_id):
			return _unavailable("该道具不在城中或尚未发现")
		if not data["items"].has(item_id):
			return _unavailable("未知道具：%s" % item_id)
		if not _is_officer_at(officer, expected_owner, city_id):
			return _unavailable(_officer_location_error(kind))
		if (officer.get("equipmentItemIds", []) as Array).size() >= OFFICER_EQUIPMENT_LIMIT:
			return _unavailable("该武将的 %d 个装备位置已经占满" % OFFICER_EQUIPMENT_LIMIT)
		var item: Dictionary = data["items"][item_id]
		var effective: Dictionary = _effective_attributes(data, officer)
		if item.get("armsTypeOverride", null) == "elite" and int(effective["force"]) <= 105:
			return _unavailable("武力超过 105 才能使用铁骑兵符")
		if item.get("armsTypeOverride", null) == "mystic" and int(effective["intelligence"]) <= 105:
			return _unavailable("智力超过 105 才能使用太玄兵符")
		return {"allowed": true, "reason": "", "city": city, "officer": officer, "item": item}
	elif kind == "unequip_item":
		if not _is_officer_at(officer, expected_owner, city_id):
			return _unavailable(_officer_location_error(kind))
		var item_id: String = str(parameters.get("itemId", ""))
		if not (officer.get("equipmentItemIds", []) as Array).has(item_id):
			return _unavailable("该武将没有装备指定道具")
		return {"allowed": true, "reason": "", "city": city, "officer": officer, "item": data["items"][item_id]}
	return {"allowed": true, "reason": "", "city": city, "officer": officer}


static func _is_officer_at(officer: Dictionary, faction_id: String, city_id: String) -> bool:
	return not officer.is_empty() \
			and officer.get("status", "") == "serving" \
			and officer.get("factionId", "") == faction_id \
			and officer.get("cityId", "") == city_id


static func _execute_reward(data: Dictionary, availability: Dictionary) -> Dictionary:
	var city: Dictionary = availability["city"]
	var officer: Dictionary = availability["officer"]
	var next_city: Dictionary = city.duplicate(true)
	next_city["money"] = int(city["money"]) - REWARD_MONEY_COST
	var next_officer: Dictionary = officer.duplicate(true)
	next_officer["loyalty"] = mini(100, int(officer["loyalty"]) + REWARD_LOYALTY_GAIN)
	return _commit(data, "reward_officer", city, next_city, officer, next_officer,
		"奖赏%s金钱 %d，忠诚由 %d 提高至 %d。" % [
			officer["name"], REWARD_MONEY_COST, int(officer["loyalty"]), int(next_officer["loyalty"]),
		])


static func _execute_appoint(data: Dictionary, availability: Dictionary) -> Dictionary:
	var city: Dictionary = availability["city"]
	var officer: Dictionary = availability["officer"]
	var next_city: Dictionary = city.duplicate(true)
	next_city["satrapOfficerId"] = officer["id"]
	return _commit(data, "appoint_satrap", city, next_city, officer, officer,
		"任命%s为%s太守。" % [officer["name"], city["name"]])


static func _execute_give(data: Dictionary, availability: Dictionary) -> Dictionary:
	var city: Dictionary = availability["city"]
	var officer: Dictionary = availability["officer"]
	var item: Dictionary = availability["item"]
	var next_city: Dictionary = city.duplicate(true)
	var item_ids: Array = (city.get("itemIds", []) as Array).duplicate(true)
	item_ids.remove_at(item_ids.find(item["id"]))
	next_city["itemIds"] = item_ids
	var next_officer: Dictionary = officer.duplicate(true)
	var usage: String
	var arms_override: Variant = item.get("armsTypeOverride", null)
	if arms_override != null:
		next_officer["armsTypeId"] = arms_override
		usage = "使用%s，兵种变为%s" % [item["name"], data["armsTypes"][arms_override]["name"]]
	else:
		var equipment: Array = (officer.get("equipmentItemIds", []) as Array).duplicate(true)
		equipment.append(item["id"])
		next_officer["equipmentItemIds"] = equipment
		usage = "装备%s" % item["name"]
	var ruler_id: String = data["factions"][data["activeFactionId"]]["rulerOfficerId"]
	if officer["id"] != ruler_id:
		next_officer["loyalty"] = mini(100, int(officer["loyalty"]) + REWARD_LOYALTY_GAIN)
	var loyalty_text: String = "" if officer["id"] == ruler_id else "，忠诚提高至 %d" % int(next_officer["loyalty"])
	return _commit(data, "give_item", city, next_city, officer, next_officer,
		"赏赐%s%s：%s%s。" % [officer["name"], item["name"], usage, loyalty_text])


static func _execute_unequip(data: Dictionary, availability: Dictionary) -> Dictionary:
	var city: Dictionary = availability["city"]
	var officer: Dictionary = availability["officer"]
	var item: Dictionary = availability["item"]
	var next_city: Dictionary = city.duplicate(true)
	var item_ids: Array = (city.get("itemIds", []) as Array).duplicate(true)
	item_ids.append(item["id"])
	next_city["itemIds"] = item_ids
	var next_officer: Dictionary = officer.duplicate(true)
	var equipment: Array = (officer.get("equipmentItemIds", []) as Array).duplicate(true)
	equipment.remove_at(equipment.find(item["id"]))
	next_officer["equipmentItemIds"] = equipment
	return _commit(data, "unequip_item", city, next_city, officer, next_officer,
		"%s卸下%s，道具返回%s库存。" % [officer["name"], item["name"], city["name"]])


static func _commit(
		data: Dictionary, kind: String, city: Dictionary, next_city: Dictionary,
		officer: Dictionary, next_officer: Dictionary, message: String
) -> Dictionary:
	var next: Dictionary = data.duplicate(true)
	next["cities"][city["id"]] = next_city.duplicate(true)
	next["officers"][officer["id"]] = next_officer.duplicate(true)
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
		"receipt": _receipt(data, next, kind, city["id"], officer["id"], log_entry),
	}


static func _receipt(
		before: Dictionary, after: Dictionary, kind: String,
		city_id: String, officer_id: String, log_entry: Dictionary
) -> Dictionary:
	return {
		"kind": kind,
		"state": {
			"turn": after["turn"], "rngSeed": after["rngSeed"],
			"campaignStarted": after["campaignStarted"],
			"actedOfficerIds": (after["actedOfficerIds"] as Array).duplicate(true),
			"logCount": (after["logs"] as Array).size(),
		},
		"city": {
			"id": city_id,
			"before": _city_values(before["cities"][city_id]),
			"after": _city_values(after["cities"][city_id]),
		},
		"officer": {
			"id": officer_id,
			"before": _officer_values(before["officers"][officer_id]),
			"after": _officer_values(after["officers"][officer_id]),
		},
		"appendedLog": log_entry.duplicate(true),
	}


static func _city_values(city: Dictionary) -> Dictionary:
	return {
		"money": city["money"],
		"satrapOfficerId": city.get("satrapOfficerId", null),
		"itemIds": (city.get("itemIds", []) as Array).duplicate(true),
	}


static func _officer_values(officer: Dictionary) -> Dictionary:
	return {
		"loyalty": officer["loyalty"],
		"armsTypeId": officer["armsTypeId"],
		"equipmentItemIds": (officer.get("equipmentItemIds", []) as Array).duplicate(true),
	}


static func _effective_attributes(data: Dictionary, officer: Dictionary) -> Dictionary:
	var force: int = int(officer["force"])
	var intelligence: int = int(officer["intelligence"])
	var move_bonus: int = 0
	for raw_item_id: Variant in officer.get("equipmentItemIds", []):
		var item: Dictionary = data["items"][raw_item_id]
		force += int(item["forceBonus"])
		intelligence += int(item["intelligenceBonus"])
		move_bonus += int(item["moveBonus"])
	return {"force": force, "intelligence": intelligence, "moveBonus": move_bonus}


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


static func _public_availability(value: Dictionary, item_id: String = "") -> Dictionary:
	var result: Dictionary = {"allowed": bool(value["allowed"]), "reason": str(value["reason"])}
	if not item_id.is_empty():
		result["itemId"] = item_id
	return result


static func _city_ownership_error(kind: String) -> String:
	return {
		"reward_officer": "只能在己方城池奖赏武将",
		"appoint_satrap": "只能任命己方城池的太守",
		"give_item": "只能使用己方城池中的道具",
		"unequip_item": "只能管理己方城池中的装备",
	}.get(kind, "只能管理己方城池中的武将")


static func _officer_location_error(kind: String) -> String:
	return {
		"reward_officer": "受赏武将不在该城",
		"appoint_satrap": "太守人选不在该城",
		"give_item": "受赏武将不在该城",
		"unequip_item": "待卸下装备的武将不在该城",
	}.get(kind, "武将不在该城")


static func _unavailable(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason}


static func _failure(reason: String) -> Dictionary:
	return {"ok": false, "error": reason, "receipt": {}}
