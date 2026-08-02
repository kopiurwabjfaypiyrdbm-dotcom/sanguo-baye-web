class_name GameSessionQueries
extends RefCounted

const DevelopFarming = preload("res://src/domain/commands/develop_farming_command.gd")
const InternalAffairs = preload("res://src/domain/commands/internal_affairs_commands.gd")
const OfficerManagement = preload("res://src/domain/commands/officer_management_commands.gd")

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
		return {
			"found": false, "city": {}, "developFarming": _unavailable("未知城池"),
			"internalAffairs": [], "officerManagement": _unavailable_management("未知城池"),
		}
	var develop_farming: Dictionary = _develop_farming(state, data, city_id)
	return {
		"found": true,
		"city": (cities[city_id] as Dictionary).duplicate(true),
		"developFarming": develop_farming,
		"internalAffairs": _internal_affairs(state, data, city_id, develop_farming),
		"officerManagement": _officer_management(state, data, city_id),
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
	var domain_catalog: Dictionary = InternalAffairs.query_city_catalog(state, city_id)
	var domain_commands: Dictionary = domain_catalog["commands"]
	for definition: Dictionary in INTERNAL_COMMANDS:
		var kind: String = definition["kind"]
		var query: Dictionary
		if kind == "develop_farming":
			query = farming.duplicate(true)
		elif kind == "banquet_officer":
			query = _banquet(data, domain_catalog["banquet"])
		else:
			query = _executor_command(data, domain_commands[kind])
		query["kind"] = kind
		query["label"] = definition["label"]
		query["mode"] = definition["mode"]
		query["dangerous"] = definition["dangerous"]
		if kind == "trade_food":
			_apply_trade_defaults(query, (domain_commands[kind] as Dictionary)["tradeOptions"])
		result.append(query)
	return result


static func _apply_trade_defaults(query: Dictionary, options: Dictionary) -> void:
	var executor_id: String = query.get("defaultOfficerId", "")
	if executor_id.is_empty():
		query["directions"] = []
		query["directionLimits"] = {}
		query["allowed"] = false
		query["reason"] = "当前资源无法交易"
		query["defaultDirection"] = "buy"
		query["defaultAmount"] = 1
		return
	query["directions"] = options["directions"]
	query["directionLimits"] = options["directionLimits"]
	query["defaultDirection"] = options["defaultDirection"]
	query["defaultAmount"] = options["defaultAmount"]
	if (options["directions"] as Array).is_empty():
		query["allowed"] = false
		query["reason"] = options["reason"]


static func _executor_command(data: Dictionary, domain_query: Dictionary) -> Dictionary:
	var officers: Dictionary = data["officers"]
	var executors: Array[Dictionary] = []
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


static func _banquet(data: Dictionary, domain_query: Dictionary) -> Dictionary:
	var officers: Dictionary = data["officers"]
	var targets: Array[Dictionary] = []
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


static func _officer_management(state: RefCounted, data: Dictionary, city_id: String) -> Dictionary:
	var catalog: Dictionary = OfficerManagement.query_city_catalog(state, city_id)
	var officers: Array[Dictionary] = []
	for raw_row: Variant in catalog.get("officers", []):
		var row: Dictionary = raw_row
		var officer_id: String = row["officerId"]
		var officer: Dictionary = data["officers"][officer_id]
		var arms_type: Dictionary = data["armsTypes"].get(officer["armsTypeId"], {})
		var equipment: Array[Dictionary] = []
		for raw_item_id: Variant in officer.get("equipmentItemIds", []):
			equipment.append(_item_view(data, str(raw_item_id)))
		var give_items: Array[Dictionary] = []
		for raw_availability: Variant in row["giveItems"]:
			var availability: Dictionary = raw_availability
			var item_view: Dictionary = _item_view(data, availability["itemId"])
			item_view["allowed"] = availability["allowed"]
			item_view["reason"] = availability["reason"]
			give_items.append(item_view)
		var unequip_items: Array[Dictionary] = []
		for raw_availability: Variant in row["unequipItems"]:
			var availability: Dictionary = raw_availability
			var item_view: Dictionary = _item_view(data, availability["itemId"])
			item_view["allowed"] = availability["allowed"]
			item_view["reason"] = availability["reason"]
			unequip_items.append(item_view)
		var effective: Dictionary = row["effective"]
		officers.append({
			"id": officer_id, "name": officer["name"],
			"loyalty": int(officer["loyalty"]), "stamina": int(officer["stamina"]),
			"force": int(officer["force"]), "intelligence": int(officer["intelligence"]),
			"effectiveForce": int(effective["force"]),
			"effectiveIntelligence": int(effective["intelligence"]),
			"effectiveMoveBonus": int(effective["moveBonus"]),
			"armsTypeId": officer["armsTypeId"],
			"armsTypeName": arms_type.get("name", officer["armsTypeId"]),
			"isSatrap": data["cities"][city_id].get("satrapOfficerId", null) == officer_id,
			"equipment": equipment,
			"reward": (row["reward"] as Dictionary).duplicate(true),
			"appoint": (row["appoint"] as Dictionary).duplicate(true),
			"giveItems": give_items,
			"unequipItems": unequip_items,
		})
	var inventory: Array[Dictionary] = []
	for raw_item_id: Variant in catalog.get("inventoryItemIds", []):
		inventory.append(_item_view(data, str(raw_item_id)))
	return {
		"allowed": bool(catalog.get("allowed", false)),
		"reason": str(catalog.get("reason", "")),
		"satrapOfficerId": data["cities"][city_id].get("satrapOfficerId", null),
		"equipmentLimit": int(catalog.get("equipmentLimit", 0)),
		"appointmentMode": str(catalog.get("appointmentMode", "automatic")),
		"officers": officers,
		"inventory": inventory,
	}


static func _item_view(data: Dictionary, item_id: String) -> Dictionary:
	var item: Dictionary = data["items"].get(item_id, {})
	return {
		"id": item_id, "name": item.get("name", item_id),
		"forceBonus": int(item.get("forceBonus", 0)),
		"intelligenceBonus": int(item.get("intelligenceBonus", 0)),
		"moveBonus": int(item.get("moveBonus", 0)),
		"armsTypeOverride": item.get("armsTypeOverride", null),
	}


static func _unavailable(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason, "defaultOfficerId": "", "executors": []}


static func _unavailable_management(reason: String) -> Dictionary:
	return {
		"allowed": false, "reason": reason, "satrapOfficerId": null,
		"equipmentLimit": 0, "appointmentMode": "automatic", "officers": [], "inventory": [],
	}
