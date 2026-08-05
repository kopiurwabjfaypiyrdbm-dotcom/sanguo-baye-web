class_name GameSessionQueries
extends RefCounted

const DevelopFarming = preload("res://src/domain/commands/develop_farming_command.gd")
const InternalAffairs = preload("res://src/domain/commands/internal_affairs_commands.gd")
const Manpower = preload("res://src/domain/commands/manpower_commands.gd")
const OfficerManagement = preload("res://src/domain/commands/officer_management_commands.gd")
const PersonnelLifecycle = preload("res://src/domain/commands/personnel_lifecycle_commands.gd")
const StrategicOrders = preload("res://src/domain/commands/strategic_order_commands.gd")
const Reconnaissance = preload("res://src/domain/commands/reconnaissance_commands.gd")
const DiplomaticOrders = preload("res://src/domain/commands/diplomatic_order_commands.gd")

const INTERNAL_COMMANDS: Array[Dictionary] = [
	{"kind": "develop_farming", "label": "开垦", "mode": "executor", "dangerous": false},
	{"kind": "develop_commerce", "label": "招商", "mode": "executor", "dangerous": false},
	{"kind": "govern_city", "label": "治理", "mode": "executor", "dangerous": false},
	{"kind": "inspect_city", "label": "出巡", "mode": "executor", "dangerous": false},
	{"kind": "trade_food", "label": "交易", "mode": "trade", "dangerous": false},
	{"kind": "banquet_officer", "label": "宴请", "mode": "target", "dangerous": false},
	{"kind": "plunder_city", "label": "掠夺", "mode": "executor", "dangerous": true},
]

# recruit_troops / distribute_troops are intentionally NOT part of the city
# internal-affairs query: the TypeScript oracle exposes exactly these seven
# commands there (Web product has a separate military entry point), and the
# cross-client contract (application-session fixture, MB12) pins this list.


static func city(state: RefCounted, city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var cities: Dictionary = data["cities"]
	if not cities.has(city_id):
		return {
			"found": false, "city": {}, "developFarming": _unavailable("未知城池"),
			"internalAffairs": [], "officerManagement": _unavailable_management("未知城池"),
			"personnelLifecycle": _unavailable_personnel("未知城池"),
		}
	var develop_farming: Dictionary = _develop_farming(state, data, city_id)
	return {
		"found": true,
		"city": (cities[city_id] as Dictionary).duplicate(true),
		"developFarming": develop_farming,
		"internalAffairs": _internal_affairs(state, data, city_id, develop_farming),
		"officerManagement": _officer_management(state, data, city_id),
		"personnelLifecycle": _personnel_lifecycle(state, data, city_id),
	}


static func internal_affairs_city(state: RefCounted, city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	if not data["cities"].has(city_id):
		return {"found": false, "city": {}, "internalAffairs": []}
	var farming: Dictionary = _develop_farming(state, data, city_id)
	return {
		"found": true,
		"city": (data["cities"][city_id] as Dictionary).duplicate(true),
		"internalAffairs": _internal_affairs(state, data, city_id, farming),
	}


static func officer_management_city(state: RefCounted, city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	if not data["cities"].has(city_id):
		return {
			"found": false, "city": {},
			"officerManagement": _unavailable_management("未知城池"),
		}
	return {
		"found": true,
		"city": (data["cities"][city_id] as Dictionary).duplicate(true),
		"officerManagement": _officer_management(state, data, city_id),
	}


static func personnel_lifecycle_city(state: RefCounted, city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	if not data["cities"].has(city_id):
		return {
			"found": false, "city": {},
			"personnelLifecycle": _unavailable_personnel("未知城池"),
		}
	return {
		"found": true,
		"city": (data["cities"][city_id] as Dictionary).duplicate(true),
		"personnelLifecycle": _personnel_lifecycle(state, data, city_id),
	}


static func strategic_logistics_city(state: RefCounted, city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	if not data["cities"].has(city_id):
		return {"found": false, "city": {}, "strategicLogistics": {}}
	var catalog: Dictionary = StrategicOrders.query_city_catalog(state, city_id)
	var destinations: Array[Dictionary] = []
	for raw_destination: Variant in catalog.get("destinations", []):
		var destination: Dictionary = raw_destination
		var route_names: Array[String] = []
		for raw_route_id: Variant in destination["routeCityIds"]:
			route_names.append(str(data["cities"][raw_route_id]["name"]))
		var row: Dictionary = destination.duplicate(true)
		row["routeCityNames"] = route_names
		destinations.append(row)
	var active_orders: Array[Dictionary] = []
	for raw_order: Variant in catalog.get("activeOrders", []):
		var order: Dictionary = raw_order
		var row: Dictionary = order.duplicate(true)
		row["officerName"] = data["officers"][order["officerId"]]["name"]
		row["sourceCityName"] = data["cities"][order["sourceCityId"]]["name"]
		row["targetCityName"] = data["cities"][order["targetCityId"]]["name"]
		active_orders.append(row)
	var logistics: Dictionary = catalog.duplicate(true)
	logistics["destinations"] = destinations
	logistics["activeOrders"] = active_orders
	return {"found": true, "city": (data["cities"][city_id] as Dictionary).duplicate(true),
		"strategicLogistics": logistics}


static func reconnaissance_city(state: RefCounted, source_city_id: String) -> Dictionary:
	return Reconnaissance.query_city_context(state, source_city_id)


static func diplomacy_city(state: RefCounted, source_city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	if not data["cities"].has(source_city_id) \
			or data["cities"][source_city_id].get("ownerId", "") != data.get("playerFactionId", ""):
		return {"found": false, "sourceCity": {}, "diplomacy": {}}
	var catalog: Dictionary = DiplomaticOrders.query_city_catalog(state, source_city_id)
	var targets: Array[Dictionary] = []
	for raw_target: Variant in catalog.get("targets", []):
		var target: Dictionary = (raw_target as Dictionary).duplicate(true)
		var officer: Dictionary = data["officers"].get(target["id"], {})
		var reported_city: Dictionary = data["cities"].get(target["reportedCityId"], {})
		var reported_faction: Dictionary = data["factions"].get(target["reportedFactionId"], {})
		target["name"] = officer.get("name", target["id"])
		target["reportedCityName"] = reported_city.get("name", target["reportedCityId"])
		target["reportedFactionName"] = reported_faction.get("name", target["reportedFactionId"])
		targets.append(target)
	var executors: Array[Dictionary] = []
	for raw_officer_id: Variant in catalog.get("executorIds", []):
		var officer_id: String = str(raw_officer_id)
		var officer: Dictionary = data["officers"][officer_id]
		executors.append({"id": officer_id, "name": officer["name"], "stamina": officer["stamina"]})
	var active_orders: Array[Dictionary] = []
	for raw_order: Variant in catalog.get("activeOrders", []):
		var order: Dictionary = (raw_order as Dictionary).duplicate(true)
		order["officerName"] = data["officers"].get(order["officerId"], {}).get("name", order["officerId"])
		order["targetOfficerName"] = data["officers"].get(order["targetOfficerId"], {}).get("name", order["targetOfficerId"])
		order["sourceCityName"] = data["cities"].get(order["sourceCityId"], {}).get("name", order["sourceCityId"])
		order["targetCityName"] = data["cities"].get(order["targetCityId"], {}).get("name", order["targetCityId"])
		active_orders.append(order)
	var diplomacy: Dictionary = catalog.duplicate(true)
	diplomacy.erase("executorIds")
	diplomacy["targets"] = targets
	diplomacy["executors"] = executors
	diplomacy["activeOrders"] = active_orders
	return {
		"found": true,
		"sourceCity": (data["cities"][source_city_id] as Dictionary).duplicate(true),
		"diplomacy": diplomacy,
	}


static func city_visibility(state: RefCounted, city_id: String) -> Dictionary:
	return Reconnaissance.visibility_for_city(state, city_id)


static func find_default_executor(state: RefCounted, city_id: String) -> String:
	var data: Dictionary = state.snapshot()
	if not data["cities"].has(city_id):
		return ""
	return String(_develop_farming(state, data, city_id)["defaultOfficerId"])


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
	var manpower_catalog: Dictionary = Manpower.query_city_catalog(state, city_id)
	var manpower_commands: Dictionary = manpower_catalog["commands"]
	for definition: Dictionary in INTERNAL_COMMANDS:
		var kind: String = definition["kind"]
		var query: Dictionary
		if kind == "develop_farming":
			query = farming.duplicate(true)
		elif kind == "banquet_officer":
			query = _banquet(data, domain_catalog["banquet"])
		elif kind == "recruit_troops" or kind == "distribute_troops":
			query = _executor_command(data, manpower_commands[kind])
		else:
			query = _executor_command(data, domain_commands[kind])
		query["kind"] = kind
		query["label"] = definition["label"]
		query["mode"] = definition["mode"]
		query["dangerous"] = definition["dangerous"]
		if kind == "trade_food":
			_apply_trade_defaults(query, (domain_commands[kind] as Dictionary)["tradeOptions"])
		if kind == "distribute_troops":
			_apply_distribute_defaults(data, city_id, query)
		if kind == "recruit_troops":
			query["defaultAmount"] = Manpower.DEFAULT_RECRUIT_AMOUNT
		result.append(query)
	return result


static func _apply_distribute_defaults(data: Dictionary, city_id: String, query: Dictionary) -> void:
	var executor_id := str(query.get("defaultOfficerId", ""))
	var city: Dictionary = data["cities"].get(city_id, {})
	var officer: Dictionary = data["officers"].get(executor_id, {})
	if executor_id.is_empty() or officer.is_empty():
		query["defaultTargetTroops"] = 0
		query["maxTargetTroops"] = 0
		return
	var capacity := Manpower.calculate_officer_troop_capacity(officer)
	var suggested := mini(
		capacity,
		mini(
			int(officer.get("troops", 0)) + int(city.get("reserveTroops", 0)),
			int(officer.get("troops", 0)) + Manpower.MAX_DISTRIBUTION_INCREASE,
		),
	)
	query["defaultTargetTroops"] = suggested
	query["maxTargetTroops"] = capacity
	query["currentTroops"] = int(officer.get("troops", 0))
	query["reserveTroops"] = int(city.get("reserveTroops", 0))


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


static func _personnel_lifecycle(state: RefCounted, data: Dictionary, city_id: String) -> Dictionary:
	var catalog: Dictionary = PersonnelLifecycle.query_city_catalog(state, city_id)
	var search_executors: Array[Dictionary] = []
	for raw_availability: Variant in catalog.get("searchExecutors", []):
		search_executors.append(_executor_view(data, raw_availability as Dictionary, catalog))
	var free_targets: Array[Dictionary] = []
	for raw_target: Variant in catalog.get("freeTargets", []):
		var target: Dictionary = raw_target
		var row: Dictionary = _personnel_officer_view(data, target["targetOfficerId"], catalog)
		var executors: Array[Dictionary] = []
		for raw_availability: Variant in target["executors"]:
			executors.append(_executor_view(data, raw_availability as Dictionary, catalog))
		row["executors"] = executors
		free_targets.append(row)
	var captive_targets: Array[Dictionary] = []
	for raw_target: Variant in catalog.get("captiveTargets", []):
		var target: Dictionary = raw_target
		var row: Dictionary = _personnel_officer_view(data, target["captiveOfficerId"], catalog)
		var executors: Array[Dictionary] = []
		for raw_availability: Variant in target["surrenderExecutors"]:
			executors.append(_executor_view(data, raw_availability as Dictionary, catalog))
		row["surrenderExecutors"] = executors
		row["release"] = (target["release"] as Dictionary).duplicate(true)
		row["execute"] = (target["execute"] as Dictionary).duplicate(true)
		row["banish"] = (target["banish"] as Dictionary).duplicate(true)
		captive_targets.append(row)
	var banish_targets: Array[Dictionary] = []
	for raw_availability: Variant in catalog.get("banishTargets", []):
		var availability: Dictionary = raw_availability
		var row: Dictionary = _personnel_officer_view(data, availability["officerId"], catalog)
		row["allowed"] = availability["allowed"]
		row["reason"] = availability["reason"]
		banish_targets.append(row)
	var confiscate_targets: Array[Dictionary] = []
	for raw_target: Variant in catalog.get("confiscateTargets", []):
		var target: Dictionary = raw_target
		var row: Dictionary = _personnel_officer_view(data, target["officerId"], catalog)
		var items: Array[Dictionary] = []
		for raw_availability: Variant in target["items"]:
			var availability: Dictionary = raw_availability
			var item: Dictionary = _item_view(data, availability["itemId"])
			item["allowed"] = availability["allowed"]
			item["reason"] = availability["reason"]
			items.append(item)
		row["items"] = items
		confiscate_targets.append(row)

	var commands: Array[Dictionary] = [
		_command_query(
			"search_city", "搜寻", "executor", search_executors, [],
			_policy(catalog, "search_city")
		),
		_command_query(
			"recruit_free_officer", "登用", "executor_target", [], free_targets,
			_policy(catalog, "recruit_free_officer")
		),
		_command_query(
			"recruit_captive", "招降", "executor_target", [], captive_targets,
			_policy(catalog, "recruit_captive")
		),
		_command_query(
			"release_captive", "释放", "target", [], _captive_disposition_targets(captive_targets, "release"),
			_policy(catalog, "release_captive")
		),
		_command_query(
			"execute_captive", "处斩", "target", [], _captive_disposition_targets(captive_targets, "execute"),
			_policy(catalog, "execute_captive")
		),
		_command_query(
			"banish_officer", "流放", "target", [], banish_targets,
			_policy(catalog, "banish_officer")
		),
		_command_query(
			"confiscate_equipment", "没收", "target_item", [], confiscate_targets,
			_policy(catalog, "confiscate_equipment")
		),
	]
	return {
		"allowed": bool(catalog.get("allowed", false)),
		"reason": str(catalog.get("reason", "")),
		"commands": commands,
	}


static func _command_query(
		kind: String, label: String, mode: String,
		executors: Array[Dictionary], targets: Array[Dictionary], policy: Dictionary
) -> Dictionary:
	var default_executor_id: String = _first_allowed_id(executors)
	var default_target: Dictionary = _first_usable_target(targets, mode)
	var default_target_id: String = str(default_target.get("id", ""))
	if mode == "executor_target" and not default_target.is_empty():
		var target_executors: Array = default_target.get(
			"surrenderExecutors", default_target.get("executors", [])
		)
		default_executor_id = _first_allowed_id(target_executors)
	var default_item_id: String = ""
	if mode == "target_item" and not default_target.is_empty():
		default_item_id = _first_allowed_id(default_target.get("items", []), "id")
	var allowed: bool = not default_executor_id.is_empty() if mode == "executor" else not default_target_id.is_empty()
	if mode == "executor_target":
		allowed = not default_target_id.is_empty() and not default_executor_id.is_empty()
	elif mode == "target_item":
		allowed = not default_target_id.is_empty() and not default_item_id.is_empty()
	return {
		"kind": kind, "label": label, "mode": mode,
		"dangerous": bool(policy.get("dangerous", false)),
		"allowed": allowed,
		"reason": "" if allowed else _command_empty_reason(kind),
		"summary": str(policy.get("summary", "")),
		"confirmationTemplate": str(policy.get("confirmationTemplate", "")),
		"cost": (policy.get("cost", {}) as Dictionary).duplicate(true),
		"executors": executors, "targets": targets,
		"defaultExecutorId": default_executor_id,
		"defaultTargetId": default_target_id,
		"defaultItemId": default_item_id,
	}


static func _policy(catalog: Dictionary, kind: String) -> Dictionary:
	return (catalog.get("commandPolicies", {}) as Dictionary).get(kind, {}).duplicate(true)


static func _captive_disposition_targets(
		captive_targets: Array[Dictionary], availability_key: String
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for source: Dictionary in captive_targets:
		var row: Dictionary = source.duplicate(true)
		var availability: Dictionary = source[availability_key]
		row["allowed"] = availability["allowed"]
		row["reason"] = availability["reason"]
		result.append(row)
	return result


static func _executor_view(
		data: Dictionary, availability: Dictionary, catalog: Dictionary
) -> Dictionary:
	var officer: Dictionary = data["officers"][availability["officerId"]]
	var rule_values: Dictionary = (catalog.get("officerRuleValues", {}) as Dictionary).get(officer["id"], {})
	return {
		"id": officer["id"], "name": officer["name"],
		"stamina": int(officer["stamina"]), "intelligence": int(officer["intelligence"]),
		"effectiveIntelligence": int(rule_values.get("effectiveIntelligence", officer["intelligence"])),
		"allowed": bool(availability["allowed"]), "reason": str(availability["reason"]),
	}


static func _personnel_officer_view(
		data: Dictionary, officer_id: String, catalog: Dictionary
) -> Dictionary:
	var officer: Dictionary = data["officers"][officer_id]
	var rule_values: Dictionary = (catalog.get("officerRuleValues", {}) as Dictionary).get(officer_id, {})
	var equipment: Array[Dictionary] = []
	for raw_item_id: Variant in officer.get("equipmentItemIds", []):
		equipment.append(_item_view(data, str(raw_item_id)))
	var former_faction: Dictionary = data["factions"].get(officer.get("formerFactionId", ""), {})
	return {
		"id": officer_id, "name": officer["name"], "status": officer["status"],
		"loyalty": int(officer["loyalty"]), "stamina": int(officer["stamina"]),
		"force": int(officer["force"]), "intelligence": int(officer["intelligence"]),
		"effectiveIntelligence": int(rule_values.get("effectiveIntelligence", officer["intelligence"])),
		"character": int(officer.get("character", 0)),
		"formerFactionName": str(former_faction.get("name", "")),
		"equipment": equipment,
	}


static func _first_allowed_id(rows: Array, id_key: String = "id") -> String:
	for raw_row: Variant in rows:
		var row: Dictionary = raw_row
		if bool(row.get("allowed", false)):
			return str(row.get(id_key, ""))
	return ""


static func _first_usable_target(targets: Array[Dictionary], mode: String) -> Dictionary:
	for target: Dictionary in targets:
		if mode == "executor_target":
			var executors: Array = target.get("surrenderExecutors", target.get("executors", []))
			if not _first_allowed_id(executors).is_empty():
				return target
		elif mode == "target_item":
			if not _first_allowed_id(target.get("items", []), "id").is_empty():
				return target
		elif bool(target.get("allowed", false)):
			return target
	return {}


static func _command_empty_reason(kind: String) -> String:
	return {
		"search_city": "没有可执行搜寻的武将",
		"recruit_free_officer": "本城没有可登用的已发现人才",
		"recruit_captive": "本城没有可招降的俘虏或执行武将",
		"release_captive": "本城没有可释放的俘虏",
		"execute_captive": "本城没有可处置的俘虏",
		"banish_officer": "本城没有可流放的人物",
		"confiscate_equipment": "本城没有可没收的装备",
	}.get(kind, "当前没有可用目标")


static func _unavailable(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason, "defaultOfficerId": "", "executors": []}


static func _unavailable_management(reason: String) -> Dictionary:
	return {
		"allowed": false, "reason": reason, "satrapOfficerId": null,
		"equipmentLimit": 0, "appointmentMode": "automatic", "officers": [], "inventory": [],
	}


static func _unavailable_personnel(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason, "commands": []}
