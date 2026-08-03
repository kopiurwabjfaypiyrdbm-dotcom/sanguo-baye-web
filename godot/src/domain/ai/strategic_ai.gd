class_name StrategicAi
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const InternalAffairs = preload("res://src/domain/commands/internal_affairs_commands.gd")
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
	while action_count < AI_MAX_ACTIONS - 1:
		if next.snapshot().get("phase", "") in ["ended", "succession"]: break
		var operated: Dictionary = _stabilize_food(next, faction_id)
		if not operated.get("ok", false):
			operated = _improve_city(next, faction_id)
		if not operated.get("ok", false): break
		next = operated["next_state"]
		action_count += 1
	if next.snapshot().get("phase", "") in ["ended", "succession"] or action_count >= AI_MAX_ACTIONS:
		return _success(before, next, action_count)
	var after: Dictionary = next.snapshot()
	var faction_name: String = str(after["factions"][faction_id].get("name", faction_id))
	_append_logs(after, "ai", ["%s完成 %d 项经营行动，未出征：没有具备出征条件的边境部队。" % [faction_name, action_count]])
	return _success(before, GameState.new(after), action_count)


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
