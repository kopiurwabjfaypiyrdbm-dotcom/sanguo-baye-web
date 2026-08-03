class_name StrategicOrderCommands
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const CoreLcg = preload("res://src/domain/random/core_lcg.gd")
const Rulesets = preload("res://src/domain/rules/campaign_rulesets.gd")

const JS_MAX_SAFE_INTEGER: int = 9_007_199_254_740_991
const CARGO_FIELDS: Array[String] = ["money", "food", "reserveTroops"]
const COMMAND_KINDS: Array[String] = ["issue_move_order", "issue_transport_order"]
const TRANSPORT_LOSS_THRESHOLD_PERCENT: int = 20


static func execute(state: GameState, kind: String, parameters: Dictionary) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(before)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	if not COMMAND_KINDS.has(kind):
		return _failure("不支持的战略后勤命令：%s" % kind)
	var availability: Dictionary = _availability_for_data(before, kind, parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	return _issue(before, kind, parameters, availability)


static func advance(state: GameState, validate_result: bool = true) -> Dictionary:
	var before: Dictionary = state.snapshot()
	if (before["strategicOrders"] as Dictionary).is_empty():
		return {
			"ok": true, "error": "", "next_state": GameState.new(before),
			"receipt": _advance_receipt(before, before, []),
		}

	var next: Dictionary = before.duplicate(true)
	var messages: Array[String] = []
	var completed_ids: Array[String] = []
	var order_ids: Array[String] = _sorted_keys(before["strategicOrders"])
	for order_id: String in order_ids:
		var order: Dictionary = before["strategicOrders"][order_id]
		var officer: Dictionary = next["officers"].get(order["officerId"], {})
		if officer.is_empty() or officer.get("status", "") != "serving" \
				or officer.get("factionId", "") != order["factionId"]:
			(next["strategicOrders"] as Dictionary).erase(order_id)
			if order["kind"] == "transport":
				var settlement: Dictionary = _settle_invalid_cargo(next["cities"], order, messages, "执行武将状态变化")
				if not settlement["ok"]:
					return _failure(settlement["error"])
			messages.append("%s因执行武将状态变化而失效。" % order_id)
			completed_ids.append(order_id)
			continue
		if int(order["remainingMonths"]) > 1:
			var pending: Dictionary = order.duplicate(true)
			pending["remainingMonths"] = int(order["remainingMonths"]) - 1
			next["strategicOrders"][order_id] = pending
			continue

		(next["strategicOrders"] as Dictionary).erase(order_id)
		completed_ids.append(order_id)
		var target: Dictionary = next["cities"].get(order["targetCityId"], {})
		var source: Dictionary = next["cities"].get(order["sourceCityId"], {})
		var fallback: Dictionary = _first_owned_city(next["cities"], order["factionId"])
		if order["kind"] == "transport":
			var transport: Dictionary = _advance_transport(next, order, officer, source, target, fallback, messages)
			if not transport["ok"]:
				return _failure(transport["error"])
		else:
			_advance_move(next, order, officer, source, target, fallback, messages)

	next = _update_city_satraps(next)
	_append_logs(next, "turn", messages)
	if validate_result:
		var issues: Array[Dictionary] = Validator.validate_runtime(next)
		if not issues.is_empty():
			return _failure(Validator.first_error(issues))
	return {
		"ok": true, "error": "", "next_state": GameState.new(next),
		"receipt": _advance_receipt(before, next, completed_ids),
	}


static func get_availability(state: GameState, kind: String, parameters: Dictionary) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty():
		return _unavailable(Validator.first_error(issues))
	return _availability_for_data(data, kind, parameters)


static func query_city_catalog(state: GameState, source_city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty():
		return _empty_catalog(Validator.first_error(issues))
	var source: Dictionary = data["cities"].get(source_city_id, {})
	if source.is_empty():
		return _empty_catalog("未知城池：%s" % source_city_id)
	var destinations: Array[Dictionary] = []
	for city_id: String in _sorted_keys(data["cities"]):
		var city: Dictionary = data["cities"][city_id]
		if city_id == source_city_id or city["ownerId"] != data["activeFactionId"]:
			continue
		var route: Array[String] = find_owned_city_route(
			data, data["activeFactionId"], source_city_id, city_id
		)
		if route.is_empty():
			continue
		var headroom: Dictionary = {
			"money": JS_MAX_SAFE_INTEGER - int(city["money"]),
			"food": JS_MAX_SAFE_INTEGER - int(city["food"]),
			"reserveTroops": JS_MAX_SAFE_INTEGER - int(city["reserveTroops"]),
		}
		var destination_limits: Dictionary = {
			"money": mini(int(source["money"]), int(headroom["money"])),
			"food": mini(int(source["food"]), int(headroom["food"])),
			"reserveTroops": mini(int(source["reserveTroops"]), int(headroom["reserveTroops"])),
		}
		var destination_accepts_cargo: bool = int(destination_limits["money"]) > 0 \
				or int(destination_limits["food"]) > 0 or int(destination_limits["reserveTroops"]) > 0
		destinations.append({
			"id": city_id, "name": city["name"], "routeCityIds": route,
			"durationMonths": route.size() - 1,
			"money": int(city["money"]), "food": int(city["food"]),
			"reserveTroops": int(city["reserveTroops"]),
			"cargoHeadroom": headroom,
			"cargoLimits": destination_limits,
			"transportAllowed": destination_accepts_cargo,
			"transportReason": "" if destination_accepts_cargo else "目标城无接收空间或源城无可输送物资",
		})
	destinations.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		if int(left["durationMonths"]) != int(right["durationMonths"]):
			return int(left["durationMonths"]) < int(right["durationMonths"])
		return str(left["id"]) < str(right["id"])
	)
	var officers: Array[Dictionary] = []
	var probe_cargo: Dictionary = {"money": 0, "food": 0, "reserveTroops": 0}
	var probe_target_id: String = source_city_id
	for destination: Dictionary in destinations:
		for field: String in CARGO_FIELDS:
			if int(destination["cargoLimits"][field]) > 0:
				probe_cargo[field] = 1
				probe_target_id = destination["id"]
				break
		if probe_target_id != source_city_id: break
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id: String = str(raw_officer_id)
		var officer: Dictionary = data["officers"][officer_id]
		if officer.get("status", "") != "serving" \
				or officer.get("factionId", "") != data["activeFactionId"] \
				or officer.get("cityId", "") != source_city_id:
			continue
		var move: Dictionary = _unavailable("没有可达己方城市")
		var transport: Dictionary = _unavailable("没有可达己方城市")
		if not destinations.is_empty():
			move = _availability_for_data(data, "issue_move_order", {
				"sourceCityId": source_city_id,
				"targetCityId": destinations[0]["id"],
				"officerId": officer_id,
			})
			if probe_target_id != source_city_id:
				transport = _availability_for_data(data, "issue_transport_order", {
					"sourceCityId": source_city_id,
					"targetCityId": probe_target_id,
					"officerId": officer_id,
					"cargo": probe_cargo,
				})
			else:
				transport = _unavailable("没有可安全接收物资的己方城市")
		officers.append({
			"id": officer_id, "name": officer["name"], "stamina": int(officer["stamina"]),
			"moveAllowed": bool(move["allowed"]), "moveReason": str(move["reason"]),
			"transportAllowed": bool(transport["allowed"]),
			"transportReason": str(transport["reason"]),
		})
	var active_orders: Array[Dictionary] = []
	for order_id: String in _sorted_keys(data["strategicOrders"]):
		var order: Dictionary = data["strategicOrders"][order_id]
		if order["factionId"] == data["activeFactionId"]:
			active_orders.append(order.duplicate(true))
	var move_cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], "move")
	var transport_cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], "transport")
	return {
		"allowed": source["ownerId"] == data["activeFactionId"] and not destinations.is_empty(),
		"reason": "" if source["ownerId"] == data["activeFactionId"] and not destinations.is_empty()
			else ("两座城市之间没有连通的己方道路" if source["ownerId"] == data["activeFactionId"] else "只能从己方城池签发后勤命令"),
		"sourceCityId": source_city_id,
		"destinations": destinations, "officers": officers, "activeOrders": active_orders,
		"moveStaminaCost": int(move_cost.get("stamina", 0)),
		"transportStaminaCost": int(transport_cost.get("stamina", 0)),
		"cargoLimits": {
			"money": int(source["money"]), "food": int(source["food"]),
			"reserveTroops": int(source["reserveTroops"]),
		},
		"lossThresholdPercent": TRANSPORT_LOSS_THRESHOLD_PERCENT,
	}


static func cancel_officer_orders(data: Dictionary, officer_id: String, reason: String) -> Dictionary:
	var next: Dictionary = data.duplicate(true)
	var messages: Array[String] = []
	for order_id: String in _sorted_keys(data.get("strategicOrders", {})):
		var order: Dictionary = data["strategicOrders"][order_id]
		if order.get("officerId", "") != officer_id:
			continue
		(next["strategicOrders"] as Dictionary).erase(order_id)
		if order.get("kind", "") == "transport":
			var settlement: Dictionary = _settle_lifecycle_cargo(next["cities"], order)
			if not settlement["ok"]:
				return settlement
			messages.append("%s因%s而终止，%s由%s接收。" % [
				order_id, reason, _format_cargo(order["cargo"]), "、".join(settlement["destinationNames"]),
			])
		else:
			messages.append("%s因%s而终止。" % [order_id, reason])
		var executor: Dictionary = next["officers"].get(officer_id, {})
		if not executor.is_empty() and executor.get("status", "") == "serving" \
				and not executor.has("cityId"):
			var source: Dictionary = next["cities"].get(order["sourceCityId"], {})
			var target: Dictionary = next["cities"].get(order["targetCityId"], {})
			var destination: Dictionary = source if not source.is_empty() and source["ownerId"] == order["factionId"] \
					else (target if not target.is_empty() and target["ownerId"] == order["factionId"] else _first_owned_city(next["cities"], order["factionId"]))
			if not destination.is_empty():
				var returned: Dictionary = executor.duplicate(true)
				returned["cityId"] = destination["id"]
				next["officers"][officer_id] = returned
	_append_logs(next, "turn", messages)
	# Keep this helper byte-for-byte aligned with Web cancelOfficerOrders. The
	# surrounding lifecycle command owns any later satrap recomputation.
	return {"ok": true, "error": "", "next": next}


## Ends every strategic order without advancing turn or RNG. Transport escrow is
## returned before executors are stationed or released, matching the Web oracle's
## campaign-outcome closure.
static func terminate_all(state: GameState, validate_result: bool = true) -> Dictionary:
	var before: Dictionary = state.snapshot()
	if (before.get("strategicOrders", {}) as Dictionary).is_empty():
		return {"ok": true, "error": "", "next_state": GameState.new(before), "receipt": {
			"kind": "terminate_strategic_orders", "terminatedOrderIds": [],
		}}
	var next: Dictionary = before.duplicate(true)
	var order_ids: Array[String] = _sorted_keys(before["strategicOrders"])
	var neutral_id: String = ""
	for faction_id: String in _sorted_keys(before["factions"]):
		if bool(before["factions"][faction_id].get("isNeutral", false)):
			neutral_id = faction_id
			break
	for order_id: String in order_ids:
		var order: Dictionary = before["strategicOrders"][order_id]
		var preferred_ids: Array[String] = [str(order["sourceCityId"]), str(order["targetCityId"])] \
				if order["kind"] == "transport" else [str(order["targetCityId"]), str(order["sourceCityId"])]
		var destination: Dictionary = {}
		for city_id: String in preferred_ids:
			if before["cities"].has(city_id) and before["cities"][city_id]["ownerId"] == order["factionId"]:
				destination = before["cities"][city_id]
				break
		if destination.is_empty():
			for city_id: String in _sorted_keys(before["cities"]):
				if before["cities"][city_id]["ownerId"] == order["factionId"]:
					destination = before["cities"][city_id]
					break
		if order["kind"] == "transport":
			var can_credit_destination: bool = not destination.is_empty()
			if can_credit_destination:
				for field: String in CARGO_FIELDS:
					can_credit_destination = can_credit_destination and int(next["cities"][destination["id"]][field]) \
							<= JS_MAX_SAFE_INTEGER - int(order["cargo"][field])
			if can_credit_destination:
				_credit(next["cities"], destination["id"], order["cargo"])
			else:
				var candidates: Array[String] = []
				for city_id: String in [str(order["sourceCityId"]), str(order["targetCityId"])]:
					if before["cities"].has(city_id) and not candidates.has(city_id): candidates.append(city_id)
				for city_id: String in _sorted_keys(before["cities"]):
					if before["cities"][city_id]["ownerId"] == order["factionId"] and not candidates.has(city_id):
						candidates.append(city_id)
				for city_id: String in _sorted_keys(before["cities"]):
					if not candidates.has(city_id): candidates.append(city_id)
				var settlement: Dictionary = _credit_across(next["cities"], candidates, order["cargo"])
				if not settlement["ok"]: return _failure(settlement["error"])
		var officer: Dictionary = next["officers"].get(order["officerId"], {})
		if officer.is_empty() or officer.get("status", "") != "serving" or officer.has("cityId"):
			continue
		var changed: Dictionary = officer.duplicate(true)
		if not destination.is_empty():
			changed["cityId"] = destination["id"]
		else:
			var settlement_city: Dictionary = before["cities"].get(order["targetCityId"], {})
			if settlement_city.is_empty(): settlement_city = before["cities"].get(order["sourceCityId"], {})
			if settlement_city.is_empty() and not _sorted_keys(before["cities"]).is_empty():
				settlement_city = before["cities"][_sorted_keys(before["cities"])[0]]
			if neutral_id.is_empty() or settlement_city.is_empty():
				return _failure("Cannot terminate strategic orders without a settlement")
			changed["status"] = "free"
			changed["factionId"] = neutral_id
			changed["cityId"] = settlement_city["id"]
			changed["troops"] = 0
			changed["stamina"] = 0
		next["officers"][changed["id"]] = changed
	next["strategicOrders"] = {}
	next = _update_city_satraps(next)
	if validate_result:
		var issues: Array[Dictionary] = Validator.validate_runtime(next)
		if not issues.is_empty(): return _failure(Validator.first_error(issues))
	return {"ok": true, "error": "", "next_state": GameState.new(next), "receipt": {
		"kind": "terminate_strategic_orders", "terminatedOrderIds": order_ids,
	}}


static func find_owned_city_route(
		data: Dictionary, faction_id: String, source_city_id: String, target_city_id: String
) -> Array[String]:
	var source: Dictionary = data["cities"].get(source_city_id, {})
	var target: Dictionary = data["cities"].get(target_city_id, {})
	if source.is_empty() or target.is_empty() \
			or source.get("ownerId", "") != faction_id or target.get("ownerId", "") != faction_id:
		return []
	if source_city_id == target_city_id:
		return [source_city_id]
	var queue: Array[String] = [source_city_id]
	var previous: Dictionary = {source_city_id: null}
	var index: int = 0
	while index < queue.size():
		var city_id: String = queue[index]
		index += 1
		var neighbors: Array[String] = []
		for raw_neighbor: Variant in data["cities"][city_id]["neighbors"]:
			neighbors.append(str(raw_neighbor))
		neighbors.sort()
		for neighbor_id: String in neighbors:
			if previous.has(neighbor_id):
				continue
			var neighbor: Dictionary = data["cities"].get(neighbor_id, {})
			if neighbor.is_empty() or neighbor["ownerId"] != faction_id:
				continue
			previous[neighbor_id] = city_id
			if neighbor_id == target_city_id:
				return _reconstruct_route(previous, target_city_id)
			queue.append(neighbor_id)
	return []


static func _availability_for_data(data: Dictionary, kind: String, parameters: Dictionary) -> Dictionary:
	if not COMMAND_KINDS.has(kind):
		return _unavailable("不支持的战略后勤命令：%s" % kind)
	var action_name: String = "调动" if kind == "issue_move_order" else "输送"
	if data["phase"] == "ended":
		return _unavailable("战役已经结束")
	if data.has("pendingSuccession") and data["pendingSuccession"] != null:
		return _unavailable("必须先拥立新君")
	var source_id: String = str(parameters.get("sourceCityId", ""))
	var target_id: String = str(parameters.get("targetCityId", ""))
	var officer_id: String = str(parameters.get("officerId", ""))
	var source: Dictionary = data["cities"].get(source_id, {})
	var target: Dictionary = data["cities"].get(target_id, {})
	if source.is_empty() or target.is_empty():
		return _unavailable("%s的出发城或目标城不存在" % action_name)
	if source_id == target_id:
		return _unavailable("目标城市不能与出发城市相同")
	if source["ownerId"] != data["activeFactionId"] or target["ownerId"] != data["activeFactionId"]:
		return _unavailable("只能在己方城池之间调动武将")
	var officer: Dictionary = data["officers"].get(officer_id, {})
	if officer.is_empty() or officer.get("status", "") != "serving" \
			or officer.get("factionId", "") != data["activeFactionId"] \
			or officer.get("cityId", "") != source_id:
		return _unavailable("执行%s的武将不在出发城" % action_name)
	if _officer_has_order(data, officer_id):
		return _unavailable("该武将已有执行中的命令")
	if (data["actedOfficerIds"] as Array).has(officer_id):
		return _unavailable("该武将本月已经执行过命令")
	var cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], "move" if kind == "issue_move_order" else "transport")
	var stamina_cost: int = int(cost.get("stamina", 0))
	if int(officer["stamina"]) < stamina_cost:
		return _unavailable("武将体力不足，需要 %d" % stamina_cost)
	var route: Array[String] = find_owned_city_route(data, data["activeFactionId"], source_id, target_id)
	if route.is_empty():
		return _unavailable("两座城市之间没有连通的己方道路")
	if kind == "issue_transport_order":
		var raw_cargo: Variant = parameters.get("cargo")
		if typeof(raw_cargo) != TYPE_DICTIONARY:
			return _unavailable("输送物资必须是对象")
		var cargo: Dictionary = raw_cargo
		if cargo.size() != CARGO_FIELDS.size() or not cargo.has("money") \
				or not cargo.has("food") or not cargo.has("reserveTroops"):
			return _unavailable("输送物资必须且只能包含 money、food、reserveTroops")
		var has_cargo: bool = false
		for field: String in CARGO_FIELDS:
			var amount: Variant = cargo.get(field)
			if not _is_non_negative_safe_integer(amount):
				return _unavailable("输送数量必须是非负整数")
			has_cargo = has_cargo or int(amount) > 0
		if not has_cargo:
			return _unavailable("请至少输送一种资源")
		if int(cargo["money"]) > int(source["money"]):
			return _unavailable("出发城金钱不足")
		if int(cargo["food"]) > int(source["food"]):
			return _unavailable("出发城粮草不足")
		if int(cargo["reserveTroops"]) > int(source["reserveTroops"]):
			return _unavailable("出发城后备兵不足")
		if not _can_credit(target, cargo):
			return _unavailable("目标城资源过多，无法安全接收本批物资")
	return {
		"allowed": true, "reason": "", "source": source, "target": target,
		"officer": officer, "routeCityIds": route,
		"durationMonths": maxi(1, route.size() - 1), "staminaCost": stamina_cost,
	}


static func _issue(
		data: Dictionary, kind: String, parameters: Dictionary, availability: Dictionary
) -> Dictionary:
	var next: Dictionary = data.duplicate(true)
	var source: Dictionary = availability["source"]
	var target: Dictionary = availability["target"]
	var officer: Dictionary = availability["officer"]
	var cargo: Dictionary = parameters["cargo"].duplicate(true) if kind == "issue_transport_order" \
			else {"money": 0, "food": 0, "reserveTroops": 0}
	var serial: int = int(data["nextStrategicOrderSerial"])
	while (data["strategicOrders"] as Dictionary).has("strategic-order-%d" % serial):
		serial += 1
	var order_id: String = "strategic-order-%d" % serial
	var order: Dictionary = {
		"id": order_id, "kind": "move" if kind == "issue_move_order" else "transport",
		"factionId": data["activeFactionId"], "officerId": officer["id"],
		"sourceCityId": source["id"], "targetCityId": target["id"],
		"routeCityIds": (availability["routeCityIds"] as Array).duplicate(true),
		"createdTurn": int(data["turn"]), "createdYear": int(data["calendar"]["year"]),
		"createdMonth": int(data["calendar"]["month"]),
		"durationMonths": int(availability["durationMonths"]),
		"remainingMonths": int(availability["durationMonths"]),
		"cargo": cargo.duplicate(true),
	}
	next["strategicOrders"][order_id] = order
	next["nextStrategicOrderSerial"] = serial + 1
	next["campaignStarted"] = true
	var next_officer: Dictionary = officer.duplicate(true)
	next_officer.erase("cityId")
	next_officer["stamina"] = int(officer["stamina"]) - int(availability["staminaCost"])
	next["officers"][officer["id"]] = next_officer
	(next["actedOfficerIds"] as Array).append(officer["id"])
	if kind == "issue_transport_order":
		var next_source: Dictionary = source.duplicate(true)
		for field: String in CARGO_FIELDS:
			next_source[field] = int(source[field]) - int(cargo[field])
		next["cities"][source["id"]] = next_source
	next = _update_city_satraps(next)
	var message: String = "%s从%s启程前往%s，预计 %d 个月抵达。" % [
		officer["name"], source["name"], target["name"], int(order["durationMonths"]),
	] if kind == "issue_move_order" else "%s从%s向%s输送%s，预计 %d 个月完成。" % [
		officer["name"], source["name"], target["name"], _format_cargo(cargo),
		int(order["durationMonths"]),
	]
	_append_logs(next, "map", [message])
	var issues: Array[Dictionary] = Validator.validate_runtime(next)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	return {
		"ok": true, "error": "", "next_state": GameState.new(next),
		"receipt": _issue_receipt(data, next, kind, order_id, source["id"], target["id"], officer["id"]),
	}


static func _advance_transport(
		next: Dictionary, order: Dictionary, officer: Dictionary, source: Dictionary,
		target: Dictionary, fallback: Dictionary, messages: Array[String]
) -> Dictionary:
	var return_city: Dictionary = source if not source.is_empty() and source["ownerId"] == order["factionId"] \
			else (target if not target.is_empty() and target["ownerId"] == order["factionId"] else fallback)
	if return_city.is_empty():
		var settlement: Dictionary = _settle_invalid_cargo(next["cities"], order, messages, "所属势力已经失去全部城池")
		if not settlement["ok"]: return settlement
		_release_without_land(next, order, officer, target, source, messages)
		return _ok()
	var returned: Dictionary = officer.duplicate(true)
	returned["cityId"] = return_city["id"]
	next["officers"][officer["id"]] = returned
	if target.is_empty() or target["ownerId"] != order["factionId"]:
		if _can_credit(next["cities"][return_city["id"]], order["cargo"]):
			_credit(next["cities"], return_city["id"], order["cargo"])
			messages.append("%s因输送目标易主，携%s返回%s。" % [officer["name"], _format_cargo(order["cargo"]), return_city["name"]])
		else:
			var settlement: Dictionary = _settle_invalid_cargo(next["cities"], order, messages, "输送目标易主且返程城市库存已满")
			if not settlement["ok"]: return settlement
			messages.append("%s返回%s。" % [officer["name"], return_city["name"]])
		return _ok()
	if not _can_credit(next["cities"][target["id"]], order["cargo"]):
		var settlement: Dictionary = _settle_invalid_cargo(next["cities"], order, messages, "%s库存已满" % target["name"])
		if not settlement["ok"]: return settlement
		messages.append("%s返回%s。" % [officer["name"], return_city["name"]])
		return _ok()
	var roll: Dictionary = CoreLcg.next_random(int(next["rngSeed"]))
	next["rngSeed"] = int(roll["seed"])
	if int(floor(float(roll["value"]) * 100.0)) > TRANSPORT_LOSS_THRESHOLD_PERCENT:
		_credit(next["cities"], target["id"], order["cargo"])
		messages.append("%s完成对%s的输送，%s入库，并返回%s。" % [officer["name"], target["name"], _format_cargo(order["cargo"]), return_city["name"]])
	else:
		messages.append("%s的输送途中受损，%s全部损失，人员返回%s。" % [officer["name"], _format_cargo(order["cargo"]), return_city["name"]])
	return _ok()


static func _advance_move(
		next: Dictionary, order: Dictionary, officer: Dictionary, source: Dictionary,
		target: Dictionary, fallback: Dictionary, messages: Array[String]
) -> void:
	var destination: Dictionary = target if not target.is_empty() and target["ownerId"] == order["factionId"] \
			else (source if not source.is_empty() and source["ownerId"] == order["factionId"] else fallback)
	if not destination.is_empty():
		var arrived: Dictionary = officer.duplicate(true)
		arrived["cityId"] = destination["id"]
		next["officers"][officer["id"]] = arrived
		messages.append("%s抵达%s。" % [officer["name"], destination["name"]] \
				if destination.get("id") == target.get("id") else "%s因目标易主，返回%s。" % [officer["name"], destination["name"]])
		return
	_release_without_land(next, order, officer, target, source, messages)


static func _settle_invalid_cargo(
		cities: Dictionary, order: Dictionary, messages: Array[String], reason: String
) -> Dictionary:
	var candidates: Array[String] = []
	for city_id: String in [str(order["sourceCityId"]), str(order["targetCityId"])]:
		if cities.has(city_id) and cities[city_id]["ownerId"] == order["factionId"] and not candidates.has(city_id):
			candidates.append(city_id)
	for city_id: String in _sorted_keys(cities):
		if cities[city_id]["ownerId"] == order["factionId"] and not candidates.has(city_id):
			candidates.append(city_id)
	for city_id: String in [str(order["sourceCityId"]), str(order["targetCityId"])]:
		if cities.has(city_id) and not candidates.has(city_id):
			candidates.append(city_id)
	for city_id: String in _sorted_keys(cities):
		if not candidates.has(city_id):
			candidates.append(city_id)
	var credit_result: Dictionary = _credit_across(cities, candidates, order["cargo"])
	if not credit_result["ok"]:
		return credit_result
	var destination_ids: Array[String] = credit_result["destinationIds"]
	var names: Array[String] = []
	var refunded: bool = true
	for city_id: String in destination_ids:
		names.append(str(cities[city_id]["name"]))
		refunded = refunded and cities[city_id]["ownerId"] == order["factionId"]
	messages.append("%s因%s失效，%s%s%s。" % [
		order["id"], reason, _format_cargo(order["cargo"]),
		"退回" if refunded else "由", "、".join(names) + ("" if refunded else "接收"),
	])
	return _ok()


static func _settle_lifecycle_cargo(cities: Dictionary, order: Dictionary) -> Dictionary:
	var candidates: Array[String] = []
	for city_id: String in [str(order["sourceCityId"]), str(order["targetCityId"])]:
		if cities.has(city_id) and not candidates.has(city_id): candidates.append(city_id)
	for city_id: String in _sorted_city_ids_by_source(cities):
		if cities[city_id]["ownerId"] == order["factionId"] and not candidates.has(city_id):
			candidates.append(city_id)
	for city_id: String in _sorted_city_ids_by_source(cities):
		if not candidates.has(city_id): candidates.append(city_id)
	var credit_result: Dictionary = _credit_across(cities, candidates, order["cargo"])
	if not credit_result["ok"]: return credit_result
	var names: Array[String] = []
	for city_id: String in credit_result["destinationIds"]: names.append(str(cities[city_id]["name"]))
	return {"ok": true, "error": "", "destinationNames": names}


static func _release_without_land(
		next: Dictionary, order: Dictionary, officer: Dictionary,
		target: Dictionary, source: Dictionary, messages: Array[String]
) -> void:
	var neutral_id: String = ""
	for faction_id: String in _sorted_keys(next["factions"]):
		if bool(next["factions"][faction_id].get("isNeutral", false)):
			neutral_id = faction_id
			break
	var settlement: Dictionary = target if not target.is_empty() else source
	if settlement.is_empty():
		var city_ids: Array[String] = _sorted_keys(next["cities"])
		if not city_ids.is_empty():
			settlement = next["cities"][city_ids[0]]
	if neutral_id.is_empty() or settlement.is_empty():
		return
	var released: Dictionary = officer.duplicate(true)
	released["status"] = "free"
	released["factionId"] = neutral_id
	released["cityId"] = settlement["id"]
	released["troops"] = 0
	released["stamina"] = 0
	next["officers"][officer["id"]] = released
	messages.append("%s所属势力已无城可归，流落至%s。" % [officer["name"], settlement["name"]])


static func _issue_receipt(
		before: Dictionary, after: Dictionary, kind: String, order_id: String,
		source_id: String, target_id: String, officer_id: String
) -> Dictionary:
	return {
		"kind": kind,
		"state": _receipt_state(after),
		"order": (after["strategicOrders"][order_id] as Dictionary).duplicate(true),
		"sourceCity": {"id": source_id, "before": _city_cargo(before["cities"][source_id]), "after": _city_cargo(after["cities"][source_id])},
		"targetCity": {"id": target_id, "before": _city_cargo(before["cities"][target_id]), "after": _city_cargo(after["cities"][target_id])},
		"officer": {"id": officer_id, "before": _officer_transit(before["officers"][officer_id]), "after": _officer_transit(after["officers"][officer_id])},
		"appendedLog": (after["logs"] as Array)[-1].duplicate(true),
	}


static func _advance_receipt(before: Dictionary, after: Dictionary, completed_ids: Array[String]) -> Dictionary:
	var appended_logs: Array = (after["logs"] as Array).slice((before["logs"] as Array).size()).duplicate(true)
	return {
		"kind": "advance_strategic_orders", "state": _receipt_state(after),
		"completedOrderIds": completed_ids.duplicate(),
		"activeOrders": _ordered_order_values(after["strategicOrders"]),
		"appendedLogs": appended_logs,
	}


static func _receipt_state(data: Dictionary) -> Dictionary:
	return {
		"turn": data["turn"], "rngSeed": data["rngSeed"],
		"campaignStarted": data["campaignStarted"],
		"actedOfficerIds": (data["actedOfficerIds"] as Array).duplicate(true),
		"logCount": (data["logs"] as Array).size(),
	}


static func _city_cargo(city: Dictionary) -> Dictionary:
	return {"money": city["money"], "food": city["food"], "reserveTroops": city["reserveTroops"], "satrapOfficerId": city.get("satrapOfficerId", null)}


static func _officer_transit(officer: Dictionary) -> Dictionary:
	return {"status": officer["status"], "factionId": officer["factionId"], "cityId": officer.get("cityId", null), "stamina": officer["stamina"]}


static func _ordered_order_values(orders: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for order_id: String in _sorted_keys(orders):
		result.append((orders[order_id] as Dictionary).duplicate(true))
	return result


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
			if officer.get("status", "") == "serving" and officer.get("factionId", "") == city["ownerId"] and officer.get("cityId", "") == city_id:
				stationed.append(officer)
		stationed.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
			var li: int = _effective_intelligence(data, left)
			var ri: int = _effective_intelligence(data, right)
			if li != ri: return li > ri
			var lf: int = _effective_force(data, left)
			var rf: int = _effective_force(data, right)
			return lf > rf if lf != rf else str(left["id"]) < str(right["id"])
		)
		var selected: String = ""
		var current: String = str(city.get("satrapOfficerId", ""))
		if data["rulesetId"] != "baye-classic-v1":
			for officer: Dictionary in stationed:
				if officer["id"] == current: selected = current; break
		if selected.is_empty():
			for officer: Dictionary in stationed:
				if officer["id"] == faction["rulerOfficerId"]: selected = officer["id"]; break
		if selected.is_empty() and not stationed.is_empty(): selected = stationed[0]["id"]
		if selected.is_empty(): next_city.erase("satrapOfficerId")
		else: next_city["satrapOfficerId"] = selected
		next["cities"][city_id] = next_city
	return next


static func _effective_intelligence(data: Dictionary, officer: Dictionary) -> int:
	var value: int = int(officer["intelligence"])
	for item_id: Variant in officer.get("equipmentItemIds", []): value += int(data["items"][item_id]["intelligenceBonus"])
	return value


static func _effective_force(data: Dictionary, officer: Dictionary) -> int:
	var value: int = int(officer["force"])
	for item_id: Variant in officer.get("equipmentItemIds", []): value += int(data["items"][item_id]["forceBonus"])
	return value


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


static func _credit(cities: Dictionary, city_id: String, cargo: Dictionary) -> void:
	var city: Dictionary = cities[city_id].duplicate(true)
	for field: String in CARGO_FIELDS: city[field] = int(city[field]) + int(cargo[field])
	cities[city_id] = city


static func _credit_across(cities: Dictionary, candidates: Array[String], cargo: Dictionary) -> Dictionary:
	var placements: Dictionary = {}
	for field: String in CARGO_FIELDS:
		var amount: int = int(cargo[field])
		if amount == 0: continue
		for city_id: String in candidates:
			if int(cities[city_id][field]) <= JS_MAX_SAFE_INTEGER - amount:
				placements[field] = city_id
				break
		if not placements.has(field):
			return {"ok": false, "error": "没有城市可以安全接收运输资源：%s" % field}
	var destinations: Array[String] = []
	for field: String in CARGO_FIELDS:
		if not placements.has(field): continue
		var city_id: String = placements[field]
		var city: Dictionary = cities[city_id].duplicate(true)
		city[field] = int(city[field]) + int(cargo[field])
		cities[city_id] = city
		if not destinations.has(city_id): destinations.append(city_id)
	return {"ok": true, "error": "", "destinationIds": destinations}


static func _can_credit(city: Dictionary, cargo: Dictionary) -> bool:
	for field: String in CARGO_FIELDS:
		if int(city[field]) > JS_MAX_SAFE_INTEGER - int(cargo[field]): return false
	return true


static func _first_owned_city(cities: Dictionary, faction_id: String) -> Dictionary:
	for city_id: String in _sorted_keys(cities):
		if cities[city_id]["ownerId"] == faction_id: return cities[city_id]
	return {}


static func _officer_has_order(data: Dictionary, officer_id: String) -> bool:
	for record_name: String in ["strategicOrders", "diplomaticOrders"]:
		for order_id: String in _sorted_keys(data[record_name]):
			if data[record_name][order_id].get("officerId", "") == officer_id: return true
	return false


static func _reconstruct_route(previous: Dictionary, target_id: String) -> Array[String]:
	var route: Array[String] = []
	var cursor: Variant = target_id
	while cursor != null:
		route.append(str(cursor))
		cursor = previous.get(str(cursor))
	route.reverse()
	return route


static func _format_cargo(cargo: Dictionary) -> String:
	var parts: Array[String] = []
	if int(cargo["money"]) > 0: parts.append("%d 金" % int(cargo["money"]))
	if int(cargo["food"]) > 0: parts.append("%d 粮" % int(cargo["food"]))
	if int(cargo["reserveTroops"]) > 0: parts.append("%d 后备兵" % int(cargo["reserveTroops"]))
	return "、".join(parts)


static func _sorted_keys(record: Dictionary) -> Array[String]:
	var keys: Array[String] = []
	for raw_key: Variant in record.keys(): keys.append(str(raw_key))
	keys.sort()
	return keys


static func _sorted_city_ids_by_source(cities: Dictionary) -> Array[String]:
	var ids: Array[String] = _sorted_keys(cities)
	ids.sort_custom(func(left: String, right: String) -> bool:
		var left_index: int = int(cities[left].get("sourceIndex", JS_MAX_SAFE_INTEGER))
		var right_index: int = int(cities[right].get("sourceIndex", JS_MAX_SAFE_INTEGER))
		return left_index < right_index if left_index != right_index else left < right
	)
	return ids


static func _is_non_negative_safe_integer(raw: Variant) -> bool:
	return (typeof(raw) == TYPE_INT or typeof(raw) == TYPE_FLOAT) and is_finite(float(raw)) \
			and floor(float(raw)) == float(raw) and int(raw) >= 0 and int(raw) <= JS_MAX_SAFE_INTEGER


static func _empty_catalog(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason, "sourceCityId": "", "destinations": [], "officers": [], "activeOrders": [], "moveStaminaCost": 0, "transportStaminaCost": 0, "cargoLimits": {"money": 0, "food": 0, "reserveTroops": 0}, "lossThresholdPercent": TRANSPORT_LOSS_THRESHOLD_PERCENT}


static func _unavailable(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason}


static func _ok() -> Dictionary:
	return {"ok": true, "error": ""}


static func _failure(reason: String) -> Dictionary:
	return {"ok": false, "error": reason, "receipt": {}}
