class_name StrategicTurnOrchestrator
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const StrategicAi = preload("res://src/domain/ai/strategic_ai.gd")
const CalendarEvents = preload("res://src/domain/progression/calendar_events.gd")
const AnnualProgression = preload("res://src/domain/progression/annual_progression.gd")
const MonthlyEconomy = preload("res://src/domain/progression/monthly_economy.gd")
const OfficerLifecycle = preload("res://src/domain/progression/officer_lifecycle.gd")
const CampaignOutcome = preload("res://src/domain/progression/campaign_outcome.gd")
const StrategicOrders = preload("res://src/domain/commands/strategic_order_commands.gd")
const DiplomaticOrders = preload("res://src/domain/commands/diplomatic_order_commands.gd")


static func advance(state: GameState) -> Dictionary:
	var before: Dictionary = state.snapshot()
	if before.get("phase", "") != "player": return _failure("只能从玩家阶段结束本月")
	var ai_data: Dictionary = before.duplicate(true)
	ai_data["campaignStarted"] = true
	var first_ai_id: String = ""
	for raw_faction_id: Variant in ai_data["factionOrder"]:
		var faction_id: String = str(raw_faction_id)
		if faction_id != ai_data["playerFactionId"]:
			first_ai_id = faction_id
			break
	if first_ai_id.is_empty():
		return _settle_month(GameState.new(ai_data), before)
	ai_data["phase"] = "ai"
	ai_data["activeFactionId"] = first_ai_id
	_append_logs(ai_data, "turn", ["玩家阶段结束，进入 AI 阶段。"])
	var ai_state: GameState = GameState.new(ai_data)
	var ai_factions: Array[String] = []
	for raw_faction_id: Variant in ai_data["factionOrder"]:
		var faction_id: String = str(raw_faction_id)
		if faction_id == ai_data["playerFactionId"]: continue
		if ai_state.snapshot().get("phase", "") in ["ended", "succession"]: break
		var faction_snapshot: Dictionary = ai_state.snapshot()
		faction_snapshot["activeFactionId"] = faction_id
		var result: Dictionary = StrategicAi.run_faction_turn(GameState.new(faction_snapshot))
		if not result.get("ok", false): return _failure(result.get("error", "AI 回合失败"))
		ai_state = result["next_state"]
		ai_factions.append(faction_id)
	if ai_state.snapshot().get("phase", "") in ["ended", "succession"]:
		return _success(before, ai_state, ai_factions)
	return _settle_month(ai_state, before, ai_factions)


static func _settle_month(ai_state: GameState, before: Dictionary, ai_factions: Array[String] = []) -> Dictionary:
	var current: Dictionary = ai_state.snapshot()
	var previous_calendar: Dictionary = current["calendar"].duplicate(true)
	current["turn"] = int(current["turn"]) + 1
	current["calendar"] = CalendarEvents.advance_calendar(current["calendar"])
	current["phase"] = "player"
	current["activeFactionId"] = current["playerFactionId"]
	current["actedOfficerIds"] = []
	var strategic: Dictionary = StrategicOrders.advance(GameState.new(current), false)
	if not strategic.get("ok", false): return _failure(strategic.get("error", "战略订单结算失败"))
	var diplomatic: Dictionary = DiplomaticOrders.advance(strategic["next_state"], false)
	if not diplomatic.get("ok", false): return _failure(diplomatic.get("error", "外交订单结算失败"))
	var escapes: Dictionary = OfficerLifecycle.settle_captive_escapes(diplomatic["next_state"])
	if not escapes.get("ok", false): return _failure(escapes.get("error", "俘虏逃脱结算失败"))
	var annual: Dictionary = AnnualProgression.settle(escapes["next_state"], previous_calendar)
	if not annual.get("ok", false): return _failure(annual.get("error", "年度阶段结算失败"))
	var economy: Dictionary = MonthlyEconomy.settle(annual["next_state"])
	if not economy.get("ok", false): return _failure(economy.get("error", "月度经济结算失败"))
	var events: Dictionary = CalendarEvents.settle_city_events(economy["next_state"])
	if not events.get("ok", false): return _failure(events.get("error", "城池事件结算失败"))
	var deaths: Dictionary = OfficerLifecycle.settle_natural_deaths(events["next_state"])
	if not deaths.get("ok", false): return _failure(deaths.get("error", "人物生命周期结算失败"))
	var outcome: Dictionary = CampaignOutcome.evaluate(deaths["next_state"])
	if not outcome.get("ok", false): return _failure(outcome.get("error", "战役结局结算失败"))
	var next_data: Dictionary = outcome["next_state"].snapshot()
	_append_logs(next_data, "turn", ["进入 %d 年 %d 月。" % [int(next_data["calendar"]["year"]), int(next_data["calendar"]["month"])]] )
	var next_state: GameState = GameState.new(next_data)
	var issues: Array[Dictionary] = Validator.validate_runtime(next_data)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	return _success(before, next_state, ai_factions)


static func _success(before: Dictionary, after: GameState, ai_factions: Array[String]) -> Dictionary:
	var next: Dictionary = after.snapshot()
	return {"ok": true, "error": "", "next_state": after, "receipt": {
		"kind": "advance_turn", "aiFactionIds": ai_factions.duplicate(),
		"phase": next.get("phase", ""), "turn": next.get("turn", 0),
		"calendar": next.get("calendar", {}).duplicate(true),
		"rngSeed": next.get("rngSeed", 0),
		"appendedLogs": (next["logs"] as Array).slice((before["logs"] as Array).size()).duplicate(true),
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
