class_name StrategicAi
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const InternalAffairs = preload("res://src/domain/commands/internal_affairs_commands.gd")
const PersonnelLifecycle = preload("res://src/domain/commands/personnel_lifecycle_commands.gd")
const OfficerManagement = preload("res://src/domain/commands/officer_management_commands.gd")
const StrategicOrders = preload("res://src/domain/commands/strategic_order_commands.gd")
const DiplomaticOrders = preload("res://src/domain/commands/diplomatic_order_commands.gd")
const Rulesets = preload("res://src/domain/rules/campaign_rulesets.gd")

const AI_MAX_ACTIONS: int = 5
const BUY_FOOD_PRICE: int = 5
const TRADE_MONEY_SOFT_CAP: int = 30_000


static func run_faction_turn(state: GameState) -> Dictionary:
	var before: Dictionary = state.snapshot()
	if before.get("phase", "") != "ai": return _failure("AI 只能在诸侯阶段行动")
	var faction_id: String = str(before.get("activeFactionId", ""))
	var faction: Dictionary = before["factions"].get(faction_id, {})
	if faction.is_empty(): return _failure("未知 AI 势力：%s" % faction_id)
	if bool(faction.get("isPlayer", false)): return _failure("玩家势力不能执行 AI 回合")
	var next: GameState = state
	var action_count: int = 0
	# This is the same fixed operation order as the Web AI. Each operation is
	# attempted at most once; command availability remains the source of truth.
	for operation: String in [
		"stabilize_food", "recruit_captive", "diplomacy", "city_item",
		"improve_city", "search_talent", "supply_frontier", "reinforce_frontier",
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
		return int(left.get("loyalty", 0)) < int(right.get("loyalty", 0)) if int(left.get("loyalty", 0)) != int(right.get("loyalty", 0)) else str(left["id"]) < str(right["id"])
	)
	for captive: Dictionary in captives:
		var city_id := str(captive["cityId"])
		for executor: Dictionary in _available_officers(data, faction_id, city_id, int(Rulesets.get_command_cost(data["rulesetId"], "surrender").get("stamina", 0))):
			var result := PersonnelLifecycle.execute(state, "recruit_captive", {
				"cityId": city_id, "executorOfficerId": executor["id"], "captiveOfficerId": captive["id"],
			})
			if result.get("ok", false): return result
	return {"ok": false, "error": ""}


static func _use_diplomatic_opportunity(state: GameState, faction_id: String) -> Dictionary:
	var data := state.snapshot()
	# The migrated diplomacy boundary requires a current-turn intelligence
	# report. Avoid a quadratic target probe when no report can be legal.
	if (data.get("intelReports", {}) as Dictionary).is_empty(): return {"ok": false, "error": ""}
	var command_names: Array[String] = ["issue_induce_order", "issue_counterespionage_order", "issue_canvass_order", "issue_alienate_order"]
	for command_name: String in command_names:
		for raw_city_id: Variant in data["cityOrder"]:
			var city_id := str(raw_city_id)
			if data["cities"][city_id].get("ownerId", "") != faction_id: continue
			for executor: Dictionary in _available_officers(data, faction_id, city_id, int(Rulesets.get_command_cost(data["rulesetId"], DiplomaticOrders.COMMAND_KINDS[command_name]).get("stamina", 0))):
				for raw_target_id: Variant in data["officerOrder"]:
					var target: Dictionary = data["officers"][str(raw_target_id)]
					if target.get("status", "") != "serving" or target.get("factionId", "") == faction_id: continue
					var params := {"sourceCityId": city_id, "officerId": executor["id"], "targetOfficerId": target["id"]}
					var availability := DiplomaticOrders.get_availability(state, command_name, params)
					if availability.get("allowed", false): return DiplomaticOrders.execute(state, command_name, params)
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
			for officer: Dictionary in _available_officers(data, faction_id, city_id, 0):
				if officer.get("equipmentItemIds", []).size() >= 2: continue
				var params := {"cityId": city_id, "officerId": officer["id"], "itemId": item_id}
				var availability := OfficerManagement.get_availability(state, "give_item", params)
				if availability.get("allowed", false): return OfficerManagement.execute(state, "give_item", params)
	return {"ok": false, "error": ""}


static func _search_local_talent(state: GameState, faction_id: String) -> Dictionary:
	var data := state.snapshot()
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id := str(raw_city_id)
		var city: Dictionary = data["cities"][city_id]
		if city.get("ownerId", "") != faction_id: continue
		if city.get("hiddenItemIds", []).is_empty() and not _has_free_officer(data, city_id): continue
		for officer: Dictionary in _available_officers(data, faction_id, city_id, PersonnelLifecycle.SEARCH_STAMINA_COST):
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
	for raw_target_id: Variant in data["cityOrder"]:
		var target_id := str(raw_target_id)
		var target: Dictionary = data["cities"][target_id]
		if target.get("ownerId", "") != faction_id: continue
		if not _is_border_city(data, target_id, faction_id): continue
		if int(target.get("food", 0)) >= 400 and int(target.get("reserveTroops", 0)) >= 300 and int(target.get("money", 0)) >= 100: continue
		for raw_source_id: Variant in data["cityOrder"]:
			var source_id := str(raw_source_id)
			var source: Dictionary = data["cities"][source_id]
			if source.get("ownerId", "") != faction_id or source_id == target_id: continue
			var cargo := {"money": mini(100, maxi(0, int(source["money"]) - 200)), "food": mini(400, maxi(0, int(source["food"]) - 600)), "reserveTroops": mini(300, maxi(0, int(source["reserveTroops"]) - 500))}
			if cargo["money"] + cargo["food"] + cargo["reserveTroops"] <= 0: continue
			for officer: Dictionary in _available_officers(data, faction_id, source_id, int(Rulesets.get_command_cost(data["rulesetId"], "transport").get("stamina", 0))):
				var params := {"sourceCityId": source_id, "targetCityId": target_id, "officerId": officer["id"], "cargo": cargo}
				if StrategicOrders.get_availability(state, "issue_transport_order", params).get("allowed", false): return StrategicOrders.execute(state, "issue_transport_order", params)
	return {"ok": false, "error": ""}


static func _reinforce_frontier(state: GameState, faction_id: String) -> Dictionary:
	var data := state.snapshot()
	for raw_target_id: Variant in data["cityOrder"]:
		var target_id := str(raw_target_id)
		if not data["cities"][target_id].get("ownerId", "") == faction_id or not _is_border_city(data, target_id, faction_id): continue
		for raw_source_id: Variant in data["cityOrder"]:
			var source_id := str(raw_source_id)
			if source_id == target_id or data["cities"][source_id].get("ownerId", "") != faction_id: continue
			for officer: Dictionary in _available_officers(data, faction_id, source_id, int(Rulesets.get_command_cost(data["rulesetId"], "move").get("stamina", 0))):
				if officer["id"] == data["factions"][faction_id]["rulerOfficerId"]: continue
				var params := {"sourceCityId": source_id, "targetCityId": target_id, "officerId": officer["id"]}
				if StrategicOrders.get_availability(state, "issue_move_order", params).get("allowed", false): return StrategicOrders.execute(state, "issue_move_order", params)
	return {"ok": false, "error": ""}


static func _is_border_city(data: Dictionary, city_id: String, faction_id: String) -> bool:
	for raw_neighbor_id: Variant in data["cities"][city_id].get("neighborIds", data["cities"][city_id].get("neighbors", [])):
		if data["cities"].get(str(raw_neighbor_id), {}).get("ownerId", "") != faction_id: return true
	return false


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
	var cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], "govern")
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id: String = str(raw_city_id)
		var city: Dictionary = data["cities"][city_id]
		if city.get("ownerId", "") != faction_id or str(city.get("condition", "normal")) == "normal": continue
		var executors: Array[Dictionary] = _available_officers(data, faction_id, city_id, int(cost.get("stamina", 0)))
		if executors.is_empty(): continue
		var result: Dictionary = InternalAffairs.execute(state, "govern_city", {"cityId": city_id, "officerId": executors[0]["id"]})
		if result.get("ok", false): return result
	return {"ok": false, "error": ""}


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
