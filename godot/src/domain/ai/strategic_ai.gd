class_name StrategicAi
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const InternalAffairs = preload("res://src/domain/commands/internal_affairs_commands.gd")
const PersonnelLifecycle = preload("res://src/domain/commands/personnel_lifecycle_commands.gd")
const OfficerManagement = preload("res://src/domain/commands/officer_management_commands.gd")
const StrategicOrders = preload("res://src/domain/commands/strategic_order_commands.gd")
const DiplomaticOrders = preload("res://src/domain/commands/diplomatic_order_commands.gd")
const DevelopFarmingCommand = preload("res://src/domain/commands/develop_farming_command.gd")
const Rulesets = preload("res://src/domain/rules/campaign_rulesets.gd")

const AI_MAX_ACTIONS: int = 5
const BUY_FOOD_PRICE: int = 5
const TRADE_MONEY_SOFT_CAP: int = 30_000
const MAX_DISTRIBUTION_INCREASE: int = 400
const DEFAULT_RECRUIT_AMOUNT: int = 500


static func run_faction_turn(state: GameState) -> Dictionary:
	var before: Dictionary = state.snapshot()
	if before.get("phase", "") != "ai": return _failure("AI 只能在诸侯阶段行动")
	var faction_id: String = str(before.get("activeFactionId", ""))
	var faction: Dictionary = before["factions"].get(faction_id, {})
	if faction.is_empty(): return _failure("未知 AI 势力：%s" % faction_id)
	if bool(faction.get("isPlayer", false)): return _failure("玩家势力不能执行 AI 回合")
	var next: GameState = state
	var action_count: int = 0
	# Keep the Web oracle's fixed ten-step order. Troop balancing/recruitment are
	# domain operations here even though they are not player-facing adapters yet;
	# tactical attack planning remains explicitly outside MB12.
	for operation: String in [
		"stabilize_food", "recruit_captive", "diplomacy", "city_item",
		"balance_troops", "recruit_reserves", "improve_city", "search_talent",
		"supply_frontier", "reinforce_frontier",
	]:
		if action_count >= AI_MAX_ACTIONS - 1 or next.snapshot().get("phase", "") in ["ended", "succession"]:
			break
		var operated: Dictionary = _try_operation(next, faction_id, operation)
		if not operated.get("ok", false):
			continue
		next = operated["next_state"]
		action_count += 1
	if next.snapshot().get("phase", "") in ["ended", "succession"] or action_count >= AI_MAX_ACTIONS:
		return _success(before, next, action_count)
	var after: Dictionary = next.snapshot()
	var faction_name: String = str(after["factions"][faction_id].get("name", faction_id))
	_append_logs(after, "ai", ["%s完成 %d 项经营行动，未出征：没有具备出征条件的边境部队。" % [faction_name, action_count]])
	return _success(before, GameState.new(after), action_count)


static func _try_operation(state: GameState, faction_id: String, operation: String) -> Dictionary:
	match operation:
		"stabilize_food": return _stabilize_food(state, faction_id)
		"recruit_captive": return _recruit_local_captive(state, faction_id)
		"diplomacy": return _use_diplomatic_opportunity(state, faction_id)
		"city_item": return _use_city_item(state, faction_id)
		"balance_troops": return _balance_troops(state, faction_id)
		"recruit_reserves": return _recruit_reserves(state, faction_id)
		"improve_city": return _improve_city(state, faction_id)
		"search_talent": return _search_local_talent(state, faction_id)
		"supply_frontier": return _supply_frontier(state, faction_id)
		"reinforce_frontier": return _reinforce_frontier(state, faction_id)
	return {"ok": false, "error": ""}


static func _recruit_local_captive(state: GameState, faction_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var captives: Array[Dictionary] = []
	for raw_id: Variant in data["officerOrder"]:
		var officer: Dictionary = data["officers"][str(raw_id)]
		if officer.get("status", "") == "captive" and officer.get("captorFactionId", "") == faction_id and officer.get("cityId", "") != "":
			captives.append(officer)
	captives.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		if int(left.get("loyalty", 0)) != int(right.get("loyalty", 0)):
			return int(left.get("loyalty", 0)) < int(right.get("loyalty", 0))
		if int(left.get("intelligence", 0)) != int(right.get("intelligence", 0)):
			return int(left.get("intelligence", 0)) > int(right.get("intelligence", 0))
		return str(left["id"]) < str(right["id"])
	)
	for captive: Dictionary in captives:
		var city_id := str(captive["cityId"])
		var executors := _available_officers(data, faction_id, city_id, int(Rulesets.get_command_cost(data["rulesetId"], "surrender").get("stamina", 0)))
		executors.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
			if int(left.get("intelligence", 0)) != int(right.get("intelligence", 0)):
				return int(left.get("intelligence", 0)) > int(right.get("intelligence", 0))
			return str(left["id"]) < str(right["id"])
		)
		for executor: Dictionary in executors:
			var result := PersonnelLifecycle.execute(state, "recruit_captive", {
				"cityId": city_id, "executorOfficerId": executor["id"], "captiveOfficerId": captive["id"],
			})
			if result.get("ok", false): return result
		var faction: Dictionary = data["factions"].get(faction_id, {})
		if str(faction.get("aiProfile", "")) == "aggressive" \
				and int(captive.get("loyalty", 0)) >= 80 \
				and str(faction.get("rulerOfficerId", "")) != str(captive.get("id", "")):
			var execution := PersonnelLifecycle.execute(state, "execute_captive", {
				"cityId": city_id, "captiveOfficerId": captive["id"],
			})
			if execution.get("ok", false): return execution
	return {"ok": false, "error": ""}


static func _use_diplomatic_opportunity(state: GameState, faction_id: String) -> Dictionary:
	var data := state.snapshot()
	var candidates: Array[Dictionary] = [
		{"name": "issue_induce_order", "loyalty": 100},
		{"name": "issue_counterespionage_order", "loyalty": 30},
		{"name": "issue_canvass_order", "loyalty": 25},
		{"name": "issue_alienate_order", "loyalty": 65},
	]
	var owned_city_ids: Array[String] = []
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id := str(raw_city_id)
		if data["cities"][city_id].get("ownerId", "") == faction_id: owned_city_ids.append(city_id)
	for candidate: Dictionary in candidates:
		var command_name: String = candidate["name"]
		var targets: Array[Dictionary] = []
		for raw_target_id: Variant in data["officerOrder"]:
			var target: Dictionary = data["officers"][str(raw_target_id)]
			if target.get("status", "") != "serving" or target.get("factionId", "") == faction_id \
					or int(target.get("loyalty", 0)) > int(candidate["loyalty"]): continue
			targets.append(target)
		targets.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
			if int(left.get("loyalty", 0)) != int(right.get("loyalty", 0)):
				return int(left.get("loyalty", 0)) < int(right.get("loyalty", 0))
			if int(left.get("intelligence", 0)) != int(right.get("intelligence", 0)):
				return int(left.get("intelligence", 0)) > int(right.get("intelligence", 0))
			return str(left["id"]) < str(right["id"])
		)
		var order_kind: String = DiplomaticOrders.COMMAND_KINDS[command_name]
		var cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], order_kind)
		for target: Dictionary in targets:
			for city_id: String in owned_city_ids:
				var city: Dictionary = data["cities"][city_id]
				if int(city.get("money", 0)) < int(cost.get("money", 0)): continue
				var executors := _available_officers(data, faction_id, city_id, int(cost.get("stamina", 0)))
				executors = executors.filter(func(officer: Dictionary) -> bool:
					return officer["id"] != data["factions"][faction_id].get("rulerOfficerId", "") \
						and (not _is_exposed_sole_garrison(data, city_id, faction_id) \
						or officer["id"] != city.get("satrapOfficerId", ""))
				)
				executors = _sort_by_intelligence(executors)
				for executor: Dictionary in executors:
					var params := {"sourceCityId": city_id, "officerId": executor["id"], "targetOfficerId": target["id"]}
					if DiplomaticOrders.get_availability(state, command_name, params).get("allowed", false):
						return DiplomaticOrders.execute(state, command_name, params)
	return {"ok": false, "error": ""}


static func _use_city_item(state: GameState, faction_id: String) -> Dictionary:
	var data := state.snapshot()
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id := str(raw_city_id)
		var city: Dictionary = data["cities"][city_id]
		if city.get("ownerId", "") != faction_id: continue
		for raw_item_id: Variant in city.get("itemIds", []):
			var item_id := str(raw_item_id)
			var item: Dictionary = data["items"].get(item_id, {})
			var officers := _available_officers(data, faction_id, city_id, 0).filter(func(officer: Dictionary) -> bool:
				return officer.get("armsTypeId", "") != item.get("armsTypeOverride", "")
			)
			officers.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
				if int(item.get("intelligenceBonus", 0)) > int(item.get("forceBonus", 0)):
					if int(left.get("intelligence", 0)) != int(right.get("intelligence", 0)):
						return int(left.get("intelligence", 0)) > int(right.get("intelligence", 0))
				else:
					if int(left.get("force", 0)) != int(right.get("force", 0)):
						return int(left.get("force", 0)) > int(right.get("force", 0))
				return str(left["id"]) < str(right["id"])
			)
			for officer: Dictionary in officers:
				var params := {"cityId": city_id, "officerId": officer["id"], "itemId": item_id}
				if OfficerManagement.get_availability(state, "give_item", params).get("allowed", false):
					return OfficerManagement.execute(state, "give_item", params)
	return {"ok": false, "error": ""}


static func _search_local_talent(state: GameState, faction_id: String) -> Dictionary:
	var data := state.snapshot()
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id := str(raw_city_id)
		var city: Dictionary = data["cities"][city_id]
		if city.get("ownerId", "") != faction_id: continue
		if city.get("hiddenItemIds", []).is_empty() and not _has_free_officer(data, city_id): continue
		for officer: Dictionary in _sort_by_intelligence(_available_officers(data, faction_id, city_id, PersonnelLifecycle.SEARCH_STAMINA_COST)):
			var result := PersonnelLifecycle.execute(state, "search_city", {"cityId": city_id, "officerId": officer["id"]})
			if result.get("ok", false): return result
	return {"ok": false, "error": ""}


static func _has_free_officer(data: Dictionary, city_id: String) -> bool:
	for raw_id: Variant in data["officerOrder"]:
		var officer: Dictionary = data["officers"][str(raw_id)]
		if officer.get("status", "") == "free" and officer.get("cityId", "") == city_id: return true
	return false


static func _supply_frontier(state: GameState, faction_id: String) -> Dictionary:
	var data := state.snapshot()
	var projected: Dictionary = {}
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id := str(raw_city_id)
		var city: Dictionary = data["cities"][city_id]
		if city.get("ownerId", "") != faction_id: continue
		projected[city_id] = {"money": int(city.get("money", 0)), "food": int(city.get("food", 0)), "reserveTroops": int(city.get("reserveTroops", 0))}
	for raw_order_id: Variant in (data.get("strategicOrders", {}) as Dictionary).keys():
		var order: Dictionary = data["strategicOrders"][str(raw_order_id)]
		if order.get("kind", "") != "transport" or order.get("factionId", "") != faction_id or not projected.has(str(order.get("targetCityId", ""))): continue
		for field: String in ["money", "food", "reserveTroops"]: projected[str(order["targetCityId"])][field] += int(order.get("cargo", {}).get(field, 0))
	var targets: Array[Dictionary] = []
	for raw_city_id: Variant in data["cityOrder"]:
		var target_id := str(raw_city_id)
		if not data["cities"][target_id].get("ownerId", "") == faction_id or not _is_border_city(data, target_id, faction_id): continue
		var supply: Dictionary = projected[target_id]
		if int(supply["food"]) >= 400 and int(supply["reserveTroops"]) >= 300 and int(supply["money"]) >= 100: continue
		targets.append({"id": target_id, "supply": supply})
	targets.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		var ls: Dictionary = left["supply"]
		var rs: Dictionary = right["supply"]
		for field: String in ["food", "reserveTroops", "money"]:
			if int(ls[field]) != int(rs[field]): return int(ls[field]) < int(rs[field])
		return str(left["id"]) < str(right["id"])
	)
	for target_entry: Dictionary in targets:
		var target_id: String = target_entry["id"]
		var target_supply: Dictionary = target_entry["supply"]
		var sources: Array[Dictionary] = []
		for raw_source_id: Variant in data["cityOrder"]:
			var source_id := str(raw_source_id)
			var source: Dictionary = data["cities"][source_id]
			if source.get("ownerId", "") != faction_id or source_id == target_id: continue
			var route := StrategicOrders.find_owned_city_route(data, faction_id, source_id, target_id)
			if route.is_empty() or not (int(source.get("food", 0)) > 900 or int(source.get("reserveTroops", 0)) > 700 or int(source.get("money", 0)) > 300): continue
			sources.append({"city": source, "route": route})
		sources.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
			var lr: Array = left["route"]
			var rr: Array = right["route"]
			if lr.size() != rr.size(): return lr.size() < rr.size()
			if int(left["city"].get("food", 0)) != int(right["city"].get("food", 0)): return int(left["city"].get("food", 0)) > int(right["city"].get("food", 0))
			return str(left["city"]["id"]) < str(right["city"]["id"])
		)
		for source_entry: Dictionary in sources:
			var source: Dictionary = source_entry["city"]
			var executors := _sort_by_intelligence(_available_officers(data, faction_id, str(source["id"]), int(Rulesets.get_command_cost(data["rulesetId"], "transport").get("stamina", 0))))
			executors = executors.filter(func(officer: Dictionary) -> bool:
				return officer["id"] != data["factions"][faction_id]["rulerOfficerId"] and officer["id"] != source.get("satrapOfficerId", "")
			)
			if executors.is_empty(): continue
			var cargo := {"money": mini(100, maxi(0, int(source["money"]) - 200)) if int(target_supply["money"]) < 100 else 0, "food": mini(400, maxi(0, int(source["food"]) - 600)) if int(target_supply["food"]) < 400 else 0, "reserveTroops": mini(300, maxi(0, int(source["reserveTroops"]) - 500)) if int(target_supply["reserveTroops"]) < 300 else 0}
			if int(cargo["money"]) + int(cargo["food"]) + int(cargo["reserveTroops"]) <= 0: continue
			var params := {"sourceCityId": source["id"], "targetCityId": target_id, "officerId": executors[0]["id"], "cargo": cargo}
			if StrategicOrders.get_availability(state, "issue_transport_order", params).get("allowed", false): return StrategicOrders.execute(state, "issue_transport_order", params)
	return {"ok": false, "error": ""}


static func _reinforce_frontier(state: GameState, faction_id: String) -> Dictionary:
	var data := state.snapshot()
	var border_cities: Array[Dictionary] = []
	for raw_target_id: Variant in data["cityOrder"]:
		var target_id := str(raw_target_id)
		if data["cities"][target_id].get("ownerId", "") != faction_id or not _is_border_city(data, target_id, faction_id): continue
		border_cities.append({"city": data["cities"][target_id], "count": _stationed_count(data, target_id, faction_id)})
	border_cities.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		if int(left["count"]) != int(right["count"]): return int(left["count"]) < int(right["count"])
		return str(left["city"]["id"]) < str(right["city"]["id"])
	)
	for target_entry: Dictionary in border_cities:
		var target: Dictionary = target_entry["city"]
		var sources: Array[Dictionary] = []
		for raw_neighbor_id: Variant in target.get("neighbors", []):
			var source_id := str(raw_neighbor_id)
			var source: Dictionary = data["cities"].get(source_id, {})
			if source.is_empty() or source.get("ownerId", "") != faction_id: continue
			var count := _stationed_count(data, source_id, faction_id)
			if count > 1: sources.append({"city": source, "count": count})
		sources.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
			if int(left["count"]) != int(right["count"]): return int(left["count"]) > int(right["count"])
			return str(left["city"]["id"]) < str(right["city"]["id"])
		)
		for source_entry: Dictionary in sources:
			var source: Dictionary = source_entry["city"]
			var executors := _available_officers(data, faction_id, str(source["id"]), int(Rulesets.get_command_cost(data["rulesetId"], "move").get("stamina", 0)))
			executors = executors.filter(func(officer: Dictionary) -> bool:
				return officer["id"] != data["factions"][faction_id]["rulerOfficerId"] and officer["id"] != source.get("satrapOfficerId", "")
			)
			for officer: Dictionary in executors:
				var params := {"sourceCityId": source["id"], "targetCityId": target["id"], "officerId": officer["id"]}
				if StrategicOrders.get_availability(state, "issue_move_order", params).get("allowed", false): return StrategicOrders.execute(state, "issue_move_order", params)
	return {"ok": false, "error": ""}


static func _stationed_count(data: Dictionary, city_id: String, faction_id: String) -> int:
	var count := 0
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer: Dictionary = data["officers"][str(raw_officer_id)]
		if officer.get("status", "") == "serving" and officer.get("factionId", "") == faction_id and officer.get("cityId", "") == city_id:
			count += 1
	return count


static func _is_border_city(data: Dictionary, city_id: String, faction_id: String) -> bool:
	for raw_neighbor_id: Variant in data["cities"][city_id].get("neighborIds", data["cities"][city_id].get("neighbors", [])):
		if data["cities"].get(str(raw_neighbor_id), {}).get("ownerId", "") != faction_id: return true
	return false


static func _balance_troops(state: GameState, faction_id: String) -> Dictionary:
	var data := state.snapshot()
	var candidates: Array[Dictionary] = []
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id := str(raw_city_id)
		var city: Dictionary = data["cities"][city_id]
		if city.get("ownerId", "") != faction_id or int(city.get("reserveTroops", 0)) <= 0: continue
		for raw_officer_id: Variant in data["officerOrder"]:
			var officer: Dictionary = data["officers"][str(raw_officer_id)]
			if officer.get("status", "") != "serving" or officer.get("factionId", "") != faction_id \
					or officer.get("cityId", "") != city_id or (data["actedOfficerIds"] as Array).has(officer["id"]): continue
			var capacity := mini(0xffff - 1, maxi(int(officer.get("troops", 0)), int(officer.get("level", 10)) * 100 + int(officer.get("force", 0)) * 10 + int(officer.get("intelligence", 0)) * 10))
			if int(officer.get("troops", 0)) >= capacity: continue
			candidates.append({"city": city, "officer": officer, "capacity": capacity})
	candidates.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		var lo: Dictionary = left["officer"]
		var ro: Dictionary = right["officer"]
		var lr := float(lo.get("troops", 0)) / float(left["capacity"])
		var rr := float(ro.get("troops", 0)) / float(right["capacity"])
		if lr != rr: return lr < rr
		if int(lo.get("leadership", 0)) != int(ro.get("leadership", 0)): return int(lo.get("leadership", 0)) > int(ro.get("leadership", 0))
		return str(lo["id"]) < str(ro["id"])
	)
	if candidates.is_empty(): return {"ok": false, "error": ""}
	var candidate: Dictionary = candidates[0]
	var city: Dictionary = candidate["city"]
	var officer: Dictionary = candidate["officer"]
	var target_troops := mini(int(candidate["capacity"]), mini(int(officer.get("troops", 0)) + int(city.get("reserveTroops", 0)), int(officer.get("troops", 0)) + MAX_DISTRIBUTION_INCREASE))
	var delta := target_troops - int(officer.get("troops", 0))
	if delta <= 0: return {"ok": false, "error": ""}
	var next := data.duplicate(true)
	next["cities"][city["id"]]["reserveTroops"] = int(city.get("reserveTroops", 0)) - delta
	next["officers"][officer["id"]]["troops"] = target_troops
	(next["actedOfficerIds"] as Array).append(officer["id"])
	_append_logs(next, "map", ["%s完成兵力分配：%s现统率 %d 人，城中后备兵 %d。" % [city["name"], officer["name"], target_troops, int(next["cities"][city["id"]]["reserveTroops"])]] )
	var issues := Validator.validate_runtime(next)
	if not issues.is_empty(): return {"ok": false, "error": Validator.first_error(issues)}
	return {"ok": true, "error": "", "next_state": GameState.new(next), "receipt": {"kind": "distribute_troops", "cityId": city["id"], "officerId": officer["id"], "targetTroops": target_troops}}


static func _recruit_reserves(state: GameState, faction_id: String) -> Dictionary:
	var data := state.snapshot()
	var candidates: Array[Dictionary] = []
	for raw_city_id: Variant in data["cityOrder"]:
		var city: Dictionary = data["cities"][str(raw_city_id)]
		if city.get("ownerId", "") != faction_id or int(city.get("reserveTroops", 0)) >= 1000 or int(city.get("food", 0)) < 200: continue
		var loyalty := int(city.get("publicLoyalty", 70))
		var capacity := maxi(0, mini(loyalty * 20, mini(int(city.get("money", 0)) * 10, 0xfffe)))
		if capacity > 0: candidates.append({"city": city, "capacity": capacity})
	candidates.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		var lc: Dictionary = left["city"]
		var rc: Dictionary = right["city"]
		if int(lc.get("reserveTroops", 0)) != int(rc.get("reserveTroops", 0)): return int(lc.get("reserveTroops", 0)) < int(rc.get("reserveTroops", 0))
		return str(lc["id"]) < str(rc["id"])
	)
	for candidate: Dictionary in candidates:
		var city: Dictionary = candidate["city"]
		var cost := Rulesets.get_command_cost(data["rulesetId"], "recruit-troops")
		var executors := _available_officers(data, faction_id, str(city["id"]), int(cost.get("stamina", 12)))
		if executors.is_empty(): continue
		var gain := mini(DEFAULT_RECRUIT_AMOUNT, int(candidate["capacity"]))
		var money_cost := floori(float(gain) / 10.0)
		var next := data.duplicate(true)
		next["cities"][city["id"]]["money"] = int(city.get("money", 0)) - money_cost
		next["cities"][city["id"]]["reserveTroops"] = int(city.get("reserveTroops", 0)) + gain
		var officer: Dictionary = executors[0]
		next["officers"][officer["id"]]["stamina"] = int(officer.get("stamina", 0)) - int(cost.get("stamina", 12))
		(next["actedOfficerIds"] as Array).append(officer["id"])
		_append_logs(next, "map", ["%s在%s征募 %d 名后备兵，消耗金钱 %d、体力 %d。" % [officer["name"], city["name"], gain, money_cost, int(cost.get("stamina", 12))]])
		var issues := Validator.validate_runtime(next)
		if issues.is_empty(): return {"ok": true, "error": "", "next_state": GameState.new(next), "receipt": {"kind": "recruit_troops", "cityId": city["id"], "officerId": officer["id"], "gain": gain}}
	return {"ok": false, "error": ""}


static func _stabilize_food(state: GameState, faction_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], "trade")
	var candidates: Array[Dictionary] = []
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id: String = str(raw_city_id)
		var city: Dictionary = data["cities"][city_id]
		if city.get("ownerId", "") != faction_id: continue
		var stationed_troops: int = 0
		for raw_officer_id: Variant in data["officerOrder"]:
			var officer: Dictionary = data["officers"][str(raw_officer_id)]
			if officer.get("status", "") == "serving" and officer.get("factionId", "") == faction_id and officer.get("cityId", "") == city_id:
				stationed_troops += int(officer.get("troops", 0))
		# Web economy also supports serving officers whose strategic order has
		# removed their city assignment. Resolve every order through sorted IDs,
		# preferring its owned endpoint and then the first owned city.
		for raw_order_id: Variant in _sorted_dictionary_keys(data.get("strategicOrders", {})):
			var order: Dictionary = data["strategicOrders"][str(raw_order_id)]
			var order_officer: Dictionary = data["officers"].get(str(order.get("officerId", "")), {})
			if order.get("factionId", "") != faction_id or order_officer.is_empty() \
					or order_officer.get("status", "") != "serving" or not str(order_officer.get("cityId", "")).is_empty(): continue
			var support_city_id := ""
			for endpoint: String in [str(order.get("sourceCityId", "")), str(order.get("targetCityId", ""))]:
				if data["cities"].has(endpoint) and data["cities"][endpoint].get("ownerId", "") == faction_id:
					support_city_id = endpoint
					break
			if support_city_id.is_empty():
				for owned_id: String in data["cityOrder"]:
					if data["cities"][str(owned_id)].get("ownerId", "") == faction_id:
						support_city_id = str(owned_id)
						break
			if support_city_id == city_id: stationed_troops += int(order_officer.get("troops", 0))
		var upkeep: int = floori(float(int(city.get("reserveTroops", 0)) + stationed_troops) / 50.0)
		var target_food: int = upkeep * 2 + 1
		if upkeep > 0 and int(city.get("food", 0)) < target_food and int(city.get("money", 0)) >= BUY_FOOD_PRICE:
			candidates.append({"city": city, "upkeep": upkeep, "targetFood": target_food})
	candidates.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		var left_city: Dictionary = left["city"]
		var right_city: Dictionary = right["city"]
		var left_ratio: float = float(left_city["food"]) / float(left["targetFood"])
		var right_ratio: float = float(right_city["food"]) / float(right["targetFood"])
		return left_ratio < right_ratio if left_ratio != right_ratio else str(left_city["id"]) < str(right_city["id"])
	)
	for candidate: Dictionary in candidates:
		var city: Dictionary = candidate["city"]
		var executors: Array[Dictionary] = _available_officers(data, faction_id, str(city["id"]), int(cost.get("stamina", 0)))
		if executors.is_empty(): continue
		var amount: int = mini(
			int(candidate["targetFood"]) - int(city["food"]),
			mini(floori(float(int(city["money"])) / float(BUY_FOOD_PRICE)), maxi(0, TRADE_MONEY_SOFT_CAP - int(city["food"])))
		)
		if amount <= 0: continue
		var result: Dictionary = InternalAffairs.execute(state, "trade_food", {
			"cityId": city["id"], "officerId": executors[0]["id"], "direction": "buy", "amount": amount,
		})
		if result.get("ok", false): return result
	return {"ok": false, "error": ""}


static func _improve_city(state: GameState, faction_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var govern_cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], "govern")
	var inspect_cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], "inspect")
	var develop_cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], "develop")
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id := str(raw_city_id)
		var city: Dictionary = data["cities"][city_id]
		if city.get("ownerId", "") != faction_id or str(city.get("condition", "normal")) == "normal" \
				or _is_exposed_sole_garrison(data, city_id, faction_id) or int(city.get("money", 0)) < int(govern_cost.get("money", 0)): continue
		var executors := _sort_by_intelligence(_available_officers(data, faction_id, city_id, int(govern_cost.get("stamina", 0))))
		if not executors.is_empty():
			var result := InternalAffairs.execute(state, "govern_city", {"cityId": city_id, "officerId": executors[0]["id"]})
			if result.get("ok", false): return result
	var inspection_candidates: Array[Dictionary] = []
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id := str(raw_city_id)
		var city: Dictionary = data["cities"][city_id]
		if city.get("ownerId", "") != faction_id or _is_exposed_sole_garrison(data, city_id, faction_id) \
				or int(city.get("publicLoyalty", 70)) >= 60 or int(city.get("money", 0)) < int(inspect_cost.get("money", 0)): continue
		inspection_candidates.append(city)
	inspection_candidates.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		if int(left.get("publicLoyalty", 70)) != int(right.get("publicLoyalty", 70)):
			return int(left.get("publicLoyalty", 70)) < int(right.get("publicLoyalty", 70))
		return str(left["id"]) < str(right["id"])
	)
	for city: Dictionary in inspection_candidates:
		var city_id := str(city["id"])
		var executors := _sort_by_intelligence(_available_officers(data, faction_id, city_id, int(inspect_cost.get("stamina", 0))))
		if not executors.is_empty():
			var result := InternalAffairs.execute(state, "inspect_city", {"cityId": city_id, "officerId": executors[0]["id"]})
			if result.get("ok", false): return result
	var candidates: Array[Dictionary] = []
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id := str(raw_city_id)
		var city: Dictionary = data["cities"][city_id]
		if city.get("ownerId", "") != faction_id or _is_exposed_sole_garrison(data, city_id, faction_id) or int(city.get("money", 0)) < int(develop_cost.get("money", 0)): continue
		var executors := _available_officers(data, faction_id, city_id, int(develop_cost.get("stamina", 0)))
		if executors.is_empty(): continue
		var farming_limit := float(city.get("farmingLimit", 1000))
		var commerce_limit := float(city.get("commerceLimit", 1000))
		candidates.append({"city": city, "farmingRatio": float(city.get("farming", 0)) / farming_limit, "commerceRatio": float(city.get("commerce", 0)) / commerce_limit})
	candidates.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		var lr := minf(float(left["farmingRatio"]), float(left["commerceRatio"]))
		var rr := minf(float(right["farmingRatio"]), float(right["commerceRatio"]))
		if lr != rr: return lr < rr
		return str(left["city"]["id"]) < str(right["city"]["id"])
	)
	for candidate: Dictionary in candidates:
		var city: Dictionary = candidate["city"]
		var executors := _sort_by_intelligence(_available_officers(data, faction_id, str(city["id"]), int(develop_cost.get("stamina", 0))))
		if executors.is_empty(): continue
		var officer_id: String = executors[0]["id"]
		var order := {"cityId": city["id"], "officerId": officer_id}
		var farming: bool = bool(DevelopFarmingCommand.get_availability(state, str(city["id"]), officer_id).get("allowed", false))
		var commerce: bool = bool(InternalAffairs.get_availability(state, "develop_commerce", order).get("allowed", false))
		if commerce and (not farming or float(candidate["commerceRatio"]) < float(candidate["farmingRatio"] )):
			var commerce_result: Dictionary = InternalAffairs.execute(state, "develop_commerce", order)
			if commerce_result.get("ok", false): return commerce_result
		if farming:
			var farming_result: Dictionary = DevelopFarmingCommand.execute(state, str(city["id"]), officer_id)
			if farming_result.get("ok", false): return farming_result
	var governance_candidates: Array[Dictionary] = []
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id := str(raw_city_id)
		var city: Dictionary = data["cities"][city_id]
		if city.get("ownerId", "") != faction_id or _is_exposed_sole_garrison(data, city_id, faction_id) \
				or int(city.get("disasterPrevention", 0)) >= 40 or int(city.get("money", 0)) < int(govern_cost.get("money", 0)): continue
		governance_candidates.append(city)
	governance_candidates.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		if int(left.get("disasterPrevention", 0)) != int(right.get("disasterPrevention", 0)):
			return int(left.get("disasterPrevention", 0)) < int(right.get("disasterPrevention", 0))
		return str(left["id"]) < str(right["id"])
	)
	for city: Dictionary in governance_candidates:
		var city_id := str(city["id"])
		var executors := _sort_by_intelligence(_available_officers(data, faction_id, city_id, int(govern_cost.get("stamina", 0))))
		if not executors.is_empty():
			var result := InternalAffairs.execute(state, "govern_city", {"cityId": city_id, "officerId": executors[0]["id"]})
			if result.get("ok", false): return result
	return {"ok": false, "error": ""}


static func _sort_by_intelligence(officers: Array[Dictionary]) -> Array[Dictionary]:
	var sorted := officers.duplicate(true)
	sorted.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		if int(left.get("intelligence", 0)) != int(right.get("intelligence", 0)):
			return int(left.get("intelligence", 0)) > int(right.get("intelligence", 0))
		return str(left["id"]) < str(right["id"])
	)
	return sorted


static func _sorted_dictionary_keys(record: Dictionary) -> Array[String]:
	var keys: Array[String] = []
	for raw_key: Variant in record.keys(): keys.append(str(raw_key))
	keys.sort()
	return keys


static func _is_exposed_sole_garrison(data: Dictionary, city_id: String, faction_id: String) -> bool:
	var city: Dictionary = data["cities"][city_id]
	var border := false
	for raw_neighbor_id: Variant in city.get("neighbors", []):
		if data["cities"].get(str(raw_neighbor_id), {}).get("ownerId", "") != faction_id:
			border = true
			break
	if not border: return false
	var stationed := 0
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer: Dictionary = data["officers"][str(raw_officer_id)]
		if officer.get("status", "") == "serving" and officer.get("factionId", "") == faction_id and officer.get("cityId", "") == city_id:
			stationed += 1
	return stationed <= 1


static func _available_officers(data: Dictionary, faction_id: String, city_id: String, stamina: int) -> Array[Dictionary]:
	var officers: Array[Dictionary] = []
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer: Dictionary = data["officers"][str(raw_officer_id)]
		if officer.get("status", "") == "serving" and officer.get("factionId", "") == faction_id \
				and officer.get("cityId", "") == city_id and int(officer.get("stamina", 0)) >= stamina \
				and not (data["actedOfficerIds"] as Array).has(officer["id"]):
			officers.append(officer)
	officers.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		return int(left.get("leadership", 0)) > int(right.get("leadership", 0)) \
				if int(left.get("leadership", 0)) != int(right.get("leadership", 0)) else str(left["id"]) < str(right["id"])
	)
	return officers


static func _success(before: Dictionary, after: GameState, action_count: int) -> Dictionary:
	var next: Dictionary = after.snapshot()
	return {"ok": true, "error": "", "next_state": after, "receipt": {
		"kind": "run_ai_faction_turn", "factionId": before["activeFactionId"],
		"actionCount": action_count, "appendedLogs": (next["logs"] as Array).slice((before["logs"] as Array).size()).duplicate(true),
	}}


static func _failure(error: String) -> Dictionary:
	return {"ok": false, "error": error, "next_state": null, "receipt": {}}


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
