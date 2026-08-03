class_name CampaignOutcome
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const StrategicOrders = preload("res://src/domain/commands/strategic_order_commands.gd")
const DiplomaticOrders = preload("res://src/domain/commands/diplomatic_order_commands.gd")


static func evaluate(state: GameState) -> Dictionary:
	var before: Dictionary = state.snapshot()
	if before.get("phase", "") == "ended":
		return _success(before, before, [])
	var normalized: Dictionary = DiplomaticOrders.release_landless_faction_officers(before)
	if not normalized["ok"]: return _failure(normalized["error"])
	var next: Dictionary = normalized["next"]
	if next.get("pendingSuccession") != null:
		var pending_issues: Array[Dictionary] = Validator.validate_runtime(next)
		if not pending_issues.is_empty(): return _failure(Validator.first_error(pending_issues))
		return _success(before, next, [])

	var player_has_city := false
	var enemy_has_city := false
	for raw_city_id: Variant in next["cityOrder"]:
		var city: Dictionary = next["cities"][str(raw_city_id)]
		if city["ownerId"] == next["playerFactionId"]:
			player_has_city = true
		else:
			var faction: Dictionary = next["factions"].get(city["ownerId"], {})
			if not faction.is_empty() and not bool(faction.get("isNeutral", false)):
				enemy_has_city = true
	var decided_outcome := ""
	var message := ""
	if not player_has_city:
		decided_outcome = "defeat"
		message = "我方已失去全部城池，战役失败。"
	elif not enemy_has_city:
		decided_outcome = "victory"
		message = "天下再无敌对诸侯，战役胜利。"
	else:
		var normal_issues: Array[Dictionary] = Validator.validate_runtime(next)
		if not normal_issues.is_empty(): return _failure(Validator.first_error(normal_issues))
		return _success(before, next, [])

	var strategic: Dictionary = StrategicOrders.terminate_all(GameState.new(next), false)
	if not strategic["ok"]: return _failure(strategic["error"])
	next = strategic["next_state"].snapshot()
	var diplomatic: Dictionary = DiplomaticOrders.terminate_all(GameState.new(next))
	if not diplomatic["ok"]: return _failure(diplomatic["error"])
	next = diplomatic["next_state"].snapshot()
	next["campaignStarted"] = true
	next["phase"] = "ended"
	next["activeFactionId"] = next["playerFactionId"]
	next["outcome"] = decided_outcome
	next.erase("pendingSuccession")
	_append_logs(next, "system", [message])
	var issues: Array[Dictionary] = Validator.validate_runtime(next)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	return _success(before, next, [message])


static func _success(before: Dictionary, next: Dictionary, outcome_messages: Array[String]) -> Dictionary:
	return {"ok": true, "error": "", "next_state": GameState.new(next), "receipt": {
		"kind": "evaluate_outcome",
		"phase": next.get("phase"),
		"outcome": next.get("outcome", null),
		"appendedLogs": (next["logs"] as Array).slice((before["logs"] as Array).size()).duplicate(true),
		"outcomeMessages": outcome_messages.duplicate(),
	}}


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
	return {"ok": false, "error": error}
