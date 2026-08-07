class_name DiplomaticOrderCommands
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const Rulesets = preload("res://src/domain/rules/campaign_rulesets.gd")
const BayeDiplomacy = preload("res://src/domain/compat/baye/baye_diplomacy.gd")

const JS_MAX_SAFE_INTEGER: int = 9_007_199_254_740_991
const DURATION_MONTHS: int = 1
const COMMAND_KINDS: Dictionary = {
	"issue_alienate_order": "alienate",
	"issue_canvass_order": "canvass",
	"issue_counterespionage_order": "counterespionage",
	"issue_induce_order": "induce",
}
const KIND_LABELS: Dictionary = {
	"alienate": "离间",
	"canvass": "招揽",
	"counterespionage": "策反",
	"induce": "劝降",
}


static func execute(state: GameState, command_kind: String, parameters: Dictionary) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(before)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	if not COMMAND_KINDS.has(command_kind):
		return _failure("不支持的外交谋略命令：%s" % command_kind)
	var order_kind: String = COMMAND_KINDS[command_kind]
	var availability: Dictionary = _availability_for_data(before, order_kind, parameters)
	if not availability["allowed"]:
		return _failure(availability["reason"])
	return _issue(before, command_kind, order_kind, parameters, availability)


static func advance(state: GameState, validate_result: bool = true) -> Dictionary:
	var before: Dictionary = state.snapshot()
	if (before["diplomaticOrders"] as Dictionary).is_empty():
		return {
			"ok": true, "error": "", "next_state": GameState.new(before),
			"receipt": _advance_receipt(before, before, []),
		}

	var next: Dictionary = before.duplicate(true)
	var messages: Array[Dictionary] = []
	var completed_ids: Array[String] = []
	for order_id: String in _sorted_diplomatic_order_ids(before["diplomaticOrders"]):
		var order: Dictionary = before["diplomaticOrders"][order_id]
		if int(order["remainingMonths"]) > 1:
			var pending: Dictionary = order.duplicate(true)
			pending["remainingMonths"] = int(order["remainingMonths"]) - 1
			next["diplomaticOrders"][order_id] = pending
			continue
		(next["diplomaticOrders"] as Dictionary).erase(order_id)
		completed_ids.append(order_id)
		var executor: Dictionary = next["officers"].get(order["officerId"], {})
		if executor.is_empty() or executor.get("status", "") != "serving" \
				or executor.get("factionId", "") != order["factionId"]:
			messages.append({"order": order, "message": "%s因执行武将状态变化而失效。" % order_id})
			continue

		var return_city: Dictionary = _preferred_return_city(next, order)
		if return_city.is_empty():
			var released: Dictionary = _release_executor(next, executor, order)
			if not released["ok"]: return _failure(released["error"])
			next = released["next"]
			messages.append({
				"order": order,
				"message": "%s因所属势力失去全部城池，%s中止并转为在野。" % [
					executor["name"], KIND_LABELS[order["kind"]],
				],
			})
			continue
		var returned: Dictionary = executor.duplicate(true)
		returned["cityId"] = return_city["id"]
		next["officers"][executor["id"]] = returned

		var target: Dictionary = next["officers"].get(order["targetOfficerId"], {})
		if target.is_empty() or not _is_legal_target(next, order["kind"], order["factionId"], target, false) \
				or target.get("factionId", "") != order["targetFactionId"] \
				or target.get("cityId", "") != order["targetCityId"]:
			messages.append({
				"order": order,
				"message": "%s返回%s：%s目标已经失效。" % [
					executor["name"], return_city["name"], KIND_LABELS[order["kind"]],
				],
			})
			continue
		if order["kind"] == "induce" and not _has_induce_dominance(
				next, order["factionId"], order["targetFactionId"]
		):
			messages.append({
				"order": order,
				"message": "%s返回%s：势力差距不足，劝降未能展开。" % [executor["name"], return_city["name"]],
			})
			continue

		var roll: Dictionary = BayeDiplomacy.roll(
			order["kind"], _effective_intelligence(next, executor),
			_effective_intelligence(next, target), int(target["loyalty"]),
			int(target.get("character", 0)), int(next["rngSeed"]),
			order["factionId"] == next["playerFactionId"]
		)
		if not roll["ok"]: return _failure(roll["error"])
		next["rngSeed"] = int(roll["seed"])
		if not roll["success"]:
			messages.append({
				"order": order,
				"message": "%s返回%s：对%s的%s失败。" % [
					executor["name"], return_city["name"], target["name"], KIND_LABELS[order["kind"]],
				],
			})
			continue

		if order["kind"] == "alienate":
			var alienated: Dictionary = target.duplicate(true)
			alienated["loyalty"] = maxi(0, int(target["loyalty"]) - 4)
			next["officers"][target["id"]] = alienated
			messages.append({
				"order": order,
				"message": "%s成功离间%s，其忠诚由 %d 降至 %d。" % [
					executor["name"], target["name"], int(target["loyalty"]), int(alienated["loyalty"]),
				],
			})
		elif order["kind"] == "canvass":
			var recruited: Dictionary = target.duplicate(true)
			recruited["factionId"] = order["factionId"]
			recruited["cityId"] = return_city["id"]
			recruited["loyalty"] = int(roll.get("recruitedLoyalty", 40))
			next["officers"][target["id"]] = recruited
			next = _update_city_satraps(next)
			messages.append({
				"order": order,
				"message": "%s接受%s招揽，转投%s。" % [
					target["name"], executor["name"], next["factions"][order["factionId"]]["name"],
				],
			})
		elif order["kind"] == "counterespionage":
			var rebel: Dictionary = _establish_rebel_faction(next, target, order["targetFactionId"])
			if not rebel["ok"]: return _failure(rebel["error"])
			next = rebel["next"]
			messages.append({
				"order": order,
				"message": "策反成功：%s在%s起兵自立，脱离%s。" % [
					target["name"], next["cities"][target["cityId"]]["name"],
					before["factions"][order["targetFactionId"]]["name"],
				],
			})
		else:
			var absorbed: Dictionary = _absorb_faction(
				next, order["factionId"], order["targetFactionId"], target["id"]
			)
			if not absorbed["ok"]: return _failure(absorbed["error"])
			next = absorbed["next"]
			messages.append({
				"order": order,
				"message": "%s接受劝降，%s所属城池并入%s。" % [
					target["name"], before["factions"][order["targetFactionId"]]["name"],
					next["factions"][order["factionId"]]["name"],
				],
			})

	var normalized: Dictionary = _release_landless_faction_officers(next)
	if not normalized["ok"]: return _failure(normalized["error"])
	next = _update_city_satraps(normalized["next"])
	for entry: Dictionary in messages:
		_append_logs(next, _visible_log_kind(next, entry["order"]), [
			_visible_order_message(next, entry["order"], entry["message"]),
		])
	if validate_result:
		var issues: Array[Dictionary] = Validator.validate_runtime(next)
		if not issues.is_empty():
			return _failure(Validator.first_error(issues))
	return {
		"ok": true, "error": "", "next_state": GameState.new(next),
		"receipt": _advance_receipt(before, next, completed_ids),
	}


static func terminate_all(state: GameState) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(before)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	if (before["diplomaticOrders"] as Dictionary).is_empty():
		return {"ok": true, "error": "", "next_state": GameState.new(before), "receipt": {
			"kind": "terminate_diplomatic_orders", "terminatedOrderIds": [], "appendedLogs": [],
		}}
	var next: Dictionary = before.duplicate(true)
	var order_ids: Array[String] = _sorted_diplomatic_order_ids(before["diplomaticOrders"])
	next["diplomaticOrders"] = {}
	for order_id: String in order_ids:
		var order: Dictionary = before["diplomaticOrders"][order_id]
		var officer: Dictionary = next["officers"].get(order["officerId"], {})
		if not officer.is_empty() and officer.get("status", "") == "serving" and not officer.has("cityId"):
			var destination: Dictionary = _preferred_return_city(next, order)
			if not destination.is_empty():
				var returned: Dictionary = officer.duplicate(true)
				returned["cityId"] = destination["id"]
				next["officers"][officer["id"]] = returned
			else:
				var released: Dictionary = _release_executor(next, officer, order)
				if not released["ok"]: return _failure(released["error"])
				next = released["next"]
		next = _update_city_satraps(next)
		var executor_name: String = str(before["officers"].get(order["officerId"], {}).get("name", order["officerId"]))
		var target_name: String = str(before["officers"].get(order["targetOfficerId"], {}).get("name", order["targetOfficerId"]))
		var detailed: String = "%s对%s的%s因战役结束而中止。" % [executor_name, target_name, KIND_LABELS[order["kind"]]]
		var message: String = detailed if order["factionId"] == before["playerFactionId"] \
				or order["targetFactionId"] == before["playerFactionId"] else "%s的一项谋略因战役结束而中止。" % \
				before["factions"].get(order["factionId"], {"name": "某势力"})["name"]
		_append_logs(next, _visible_log_kind(before, order), [message])
	issues = Validator.validate_runtime(next)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	return {"ok": true, "error": "", "next_state": GameState.new(next), "receipt": {
		"kind": "terminate_diplomatic_orders", "terminatedOrderIds": order_ids,
		"appendedLogs": (next["logs"] as Array).slice((before["logs"] as Array).size()).duplicate(true),
	}}


## Shared ownership-normalization boundary for lifecycle and outcome closure.
static func release_landless_faction_officers(data: Dictionary) -> Dictionary:
	return _release_landless_faction_officers(data)


static func get_availability(state: GameState, command_kind: String, parameters: Dictionary) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty(): return _unavailable(Validator.first_error(issues))
	if not COMMAND_KINDS.has(command_kind): return _unavailable("不支持的外交谋略命令：%s" % command_kind)
	return _availability_for_data(data, COMMAND_KINDS[command_kind], parameters)


static func query_city_catalog(state: GameState, source_city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty(): return _empty_catalog(source_city_id, Validator.first_error(issues))
	var source: Dictionary = data["cities"].get(source_city_id, {})
	if source.is_empty() or source.get("ownerId", "") != data.get("playerFactionId", ""):
		return _empty_catalog(source_city_id, "只能从己方城池执行外交谋略")

	# Targets come exclusively from current-turn report snapshots. The DTO keeps
	# reported evidence and never projects live hidden loyalty, IQ, or position.
	var targets: Array[Dictionary] = []
	var seen_targets: Dictionary = {}
	for report_city_id: String in _sorted_city_ids_by_source(data["cities"]):
		var report: Dictionary = data["intelReports"].get(report_city_id, {})
		if report.is_empty() or int(report.get("observedTurn", -1)) != int(data["turn"]) \
				or not report.has("officerIds"):
			continue
		for raw_target_id: Variant in report["officerIds"]:
			var target_id: String = str(raw_target_id)
			if seen_targets.has(target_id) or not data["officers"].has(target_id): continue
			seen_targets[target_id] = true
			targets.append({
				"id": target_id, "reportedCityId": report_city_id,
				"reportedFactionId": data["cities"][report_city_id]["ownerId"],
				"observedTurn": report["observedTurn"], "observedYear": report["observedYear"],
				"observedMonth": report["observedMonth"],
			})

	var executor_ids: Array[String] = []
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id: String = str(raw_officer_id)
		var officer: Dictionary = data["officers"][officer_id]
		if officer.get("status", "") == "serving" \
				and officer.get("factionId", "") == data["playerFactionId"] \
				and officer.get("cityId", "") == source_city_id:
			executor_ids.append(officer_id)

	var commands: Array[Dictionary] = []
	for command_kind: String in [
		"issue_alienate_order", "issue_canvass_order",
		"issue_counterespionage_order", "issue_induce_order",
	]:
		var order_kind: String = COMMAND_KINDS[command_kind]
		var pair_availability: Dictionary = {}
		var default_officer_id := ""
		var default_target_id := ""
		var first_reason := "当前没有当月有效情报目标" if targets.is_empty() else "当前没有可执行谋略的武将"
		for officer_id: String in executor_ids:
			for target: Dictionary in targets:
				var availability: Dictionary = _availability_for_data(data, order_kind, {
					"sourceCityId": source_city_id, "officerId": officer_id,
					"targetOfficerId": target["id"],
				})
				var pair_key := "%s|%s" % [officer_id, target["id"]]
				pair_availability[pair_key] = {
					"allowed": bool(availability["allowed"]),
					"reason": str(availability.get("reason", "")),
				}
				if default_officer_id.is_empty() and availability["allowed"]:
					default_officer_id = officer_id
					default_target_id = target["id"]
				elif not str(availability.get("reason", "")).is_empty() \
						and first_reason == "当前没有可执行谋略的武将":
					first_reason = availability["reason"]
		var query_cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], order_kind)
		query_cost["usesAction"] = true
		commands.append({
			"kind": command_kind, "orderKind": order_kind, "label": KIND_LABELS[order_kind],
			"allowed": not default_officer_id.is_empty(),
			"reason": "" if not default_officer_id.is_empty() else first_reason,
			"cost": query_cost,
			"durationMonths": DURATION_MONTHS,
			"defaultOfficerId": default_officer_id, "defaultTargetId": default_target_id,
			"pairAvailability": pair_availability,
		})

	var active_orders: Array[Dictionary] = []
	for order_id: String in _sorted_diplomatic_order_ids(data["diplomaticOrders"]):
		var order: Dictionary = data["diplomaticOrders"][order_id]
		if order["factionId"] != data["playerFactionId"]: continue
		active_orders.append({
			"id": order_id, "kind": order["kind"], "label": KIND_LABELS[order["kind"]],
			"officerId": order["officerId"], "sourceCityId": order["sourceCityId"],
			"targetOfficerId": order["targetOfficerId"], "targetCityId": order["targetCityId"],
			"remainingMonths": order["remainingMonths"], "durationMonths": order["durationMonths"],
		})
	return {
		"allowed": commands.any(func(command: Dictionary) -> bool: return command["allowed"]),
		"reason": "" if not targets.is_empty() else "请先侦察敌方城池取得当月人物情报",
		"sourceCityId": source_city_id, "targets": targets, "executorIds": executor_ids,
		"commands": commands, "activeOrders": active_orders,
	}


static func _availability_for_data(data: Dictionary, kind: String, parameters: Dictionary) -> Dictionary:
	var cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], kind)
	if data.get("phase", "") == "ended": return _unavailable("战役已经结束")
	if data.get("pendingSuccession") != null: return _unavailable("必须先拥立新君")
	if int(data.get("nextDiplomaticOrderSerial", 0)) >= JS_MAX_SAFE_INTEGER:
		return _unavailable("谋略命令序号已经耗尽")
	var label: String = KIND_LABELS[kind]
	var source_id: String = str(parameters.get("sourceCityId", ""))
	var source: Dictionary = data["cities"].get(source_id, {})
	if source.is_empty() or source.get("ownerId", "") != data["activeFactionId"]:
		return _unavailable("只能从己方城池执行%s" % label)
	var officer_id: String = str(parameters.get("officerId", ""))
	var executor: Dictionary = data["officers"].get(officer_id, {})
	if executor.is_empty() or executor.get("status", "") != "serving" \
			or executor.get("factionId", "") != data["activeFactionId"] \
			or executor.get("cityId", "") != source_id:
		return _unavailable("执行%s的武将不在出发城" % label)
	if _officer_has_order(data, officer_id): return _unavailable("该武将已有执行中的命令")
	if (data["actedOfficerIds"] as Array).has(officer_id): return _unavailable("该武将本月已经执行过命令")
	if int(executor["stamina"]) < int(cost.get("stamina", 0)):
		return _unavailable("%s需要至少 %d 点体力" % [label, int(cost.get("stamina", 0))])
	if int(source["money"]) < int(cost.get("money", 0)):
		return _unavailable("%s需要 %d 金" % [label, int(cost.get("money", 0))])
	var target_id: String = str(parameters.get("targetOfficerId", ""))
	var target: Dictionary = data["officers"].get(target_id, {})
	if target.is_empty() or not _is_legal_target(data, kind, data["activeFactionId"], target, true):
		return _unavailable("%s目标无效或情报已经过期" % label)
	if kind == "induce" and not _has_induce_dominance(data, data["activeFactionId"], target["factionId"]):
		return _unavailable("我方城池数尚未达到目标势力的两倍")
	return {
		"allowed": true, "reason": "", "targetCityId": target["cityId"],
		"targetFactionId": target["factionId"],
	}


static func _issue(
		before: Dictionary, command_kind: String, order_kind: String,
		parameters: Dictionary, availability: Dictionary
) -> Dictionary:
	var next: Dictionary = before.duplicate(true)
	var source_id: String = parameters["sourceCityId"]
	var officer_id: String = parameters["officerId"]
	var target_id: String = parameters["targetOfficerId"]
	var cost: Dictionary = Rulesets.get_command_cost(before["rulesetId"], order_kind)
	var serial: int = int(before["nextDiplomaticOrderSerial"])
	while (before["diplomaticOrders"] as Dictionary).has("diplomatic-order-%d" % serial):
		serial += 1
	var order_id: String = "diplomatic-order-%d" % serial
	var order: Dictionary = {
		"id": order_id, "kind": order_kind, "factionId": before["activeFactionId"],
		"officerId": officer_id, "sourceCityId": source_id, "targetOfficerId": target_id,
		"targetFactionId": availability["targetFactionId"], "targetCityId": availability["targetCityId"],
		"createdTurn": int(before["turn"]), "createdYear": int(before["calendar"]["year"]),
		"createdMonth": int(before["calendar"]["month"]), "durationMonths": DURATION_MONTHS,
		"remainingMonths": DURATION_MONTHS, "moneyCost": int(cost["money"]),
	}
	next["diplomaticOrders"][order_id] = order
	next["nextDiplomaticOrderSerial"] = serial + 1
	var source: Dictionary = before["cities"][source_id].duplicate(true)
	source["money"] = int(source["money"]) - int(cost["money"])
	next["cities"][source_id] = source
	var executor: Dictionary = before["officers"][officer_id].duplicate(true)
	executor.erase("cityId")
	executor["stamina"] = int(executor["stamina"]) - int(cost["stamina"])
	next["officers"][officer_id] = executor
	(next["actedOfficerIds"] as Array).append(officer_id)
	next["campaignStarted"] = true
	next = _update_city_satraps(next)
	var detailed: String = "%s奉命对%s执行%s，预计下月回报。" % [
		before["officers"][officer_id]["name"], before["officers"][target_id]["name"], KIND_LABELS[order_kind],
	]
	_append_logs(next, _visible_log_kind(next, order), [_visible_order_message(next, order, detailed)])
	var issues: Array[Dictionary] = Validator.validate_runtime(next)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	return {
		"ok": true, "error": "", "next_state": GameState.new(next),
		"receipt": _issue_receipt(before, next, command_kind, order_id, source_id, officer_id, target_id),
	}


static func _is_legal_target(
		data: Dictionary, kind: String, faction_id: String,
		target: Dictionary, enforce_player_intel: bool
) -> bool:
	if target.get("status", "") != "serving" or not target.has("cityId") \
			or target.get("factionId", "") == faction_id:
		return false
	var target_faction: Dictionary = data["factions"].get(target["factionId"], {})
	if target_faction.is_empty() or bool(target_faction.get("isNeutral", false)):
		return false
	var faction_has_city: bool = false
	for city_id: String in _sorted_keys(data["cities"]):
		if data["cities"][city_id].get("ownerId", "") == target_faction["id"]:
			faction_has_city = true
			break
	if not faction_has_city: return false
	if enforce_player_intel and faction_id == data["playerFactionId"]:
		var report: Dictionary = data["intelReports"].get(target["cityId"], {})
		if report.is_empty() or int(report.get("observedTurn", -1)) != int(data["turn"]) \
				or not report.has("officerIds") or not (report["officerIds"] as Array).has(target["id"]):
			return false
	var is_ruler: bool = target_faction["rulerOfficerId"] == target["id"]
	if kind == "induce": return is_ruler and target["factionId"] != data["playerFactionId"]
	if is_ruler: return false
	if kind == "counterespionage":
		var ruler: Dictionary = data["officers"].get(target_faction["rulerOfficerId"], {})
		return data["cities"][target["cityId"]].get("satrapOfficerId", "") == target["id"] \
				and ruler.get("cityId", "") != target["cityId"]
	return true


static func _has_induce_dominance(data: Dictionary, source_faction_id: String, target_faction_id: String) -> bool:
	var source_count: int = 0
	var target_count: int = 0
	for city_id: String in _sorted_keys(data["cities"]):
		var owner_id: String = data["cities"][city_id]["ownerId"]
		if owner_id == source_faction_id: source_count += 1
		if owner_id == target_faction_id: target_count += 1
	return target_count > 0 and source_count >= target_count * 2


static func _preferred_return_city(data: Dictionary, order: Dictionary) -> Dictionary:
	var source: Dictionary = data["cities"].get(order["sourceCityId"], {})
	if not source.is_empty() and source["ownerId"] == order["factionId"]: return source
	return _first_owned_city(data["cities"], order["factionId"])


static func _release_executor(data: Dictionary, officer: Dictionary, order: Dictionary) -> Dictionary:
	var neutral_id: String = _neutral_faction_id(data["factions"])
	var settlement: Dictionary = data["cities"].get(order["targetCityId"], {})
	if settlement.is_empty(): settlement = data["cities"].get(order["sourceCityId"], {})
	if settlement.is_empty(): settlement = _first_city(data["cities"])
	if neutral_id.is_empty() or settlement.is_empty():
		return {"ok": false, "error": "外交命令无法安置失地执行武将"}
	var next: Dictionary = data.duplicate(true)
	var released: Dictionary = officer.duplicate(true)
	released["status"] = "free"
	released["factionId"] = neutral_id
	released["cityId"] = settlement["id"]
	released["troops"] = 0
	released["stamina"] = 0
	next["officers"][officer["id"]] = released
	return {"ok": true, "error": "", "next": next}


static func _establish_rebel_faction(data: Dictionary, target: Dictionary, former_faction_id: String) -> Dictionary:
	var next: Dictionary = data.duplicate(true)
	var city: Dictionary = data["cities"][target["cityId"]]
	var faction_id: String = "rebel-%s" % target["id"]
	if not next["factions"].has(faction_id):
		next["factions"][faction_id] = {
			"id": faction_id, "name": "%s军" % target["name"], "rulerOfficerId": target["id"],
			"color": _color_for_officer(target["id"]), "isPlayer": false,
			"aiProfile": "aggressive" if int(target.get("character", 0)) == 0 \
				else ("defensive" if int(target.get("character", 0)) == 4 else "balanced"),
		}
	if not (next["factionOrder"] as Array).has(faction_id):
		(next["factionOrder"] as Array).append(faction_id)
	var next_city: Dictionary = city.duplicate(true)
	next_city["ownerId"] = faction_id
	next_city["satrapOfficerId"] = target["id"]
	next["cities"][city["id"]] = next_city
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id: String = str(raw_officer_id)
		var officer: Dictionary = data["officers"][officer_id]
		var changed: Dictionary = officer.duplicate(true)
		if officer.get("status", "") == "serving" and officer.get("factionId", "") == former_faction_id \
				and officer.get("cityId", "") == city["id"]:
			changed["factionId"] = faction_id
			next["officers"][officer_id] = changed
		elif officer.get("status", "") == "captive" and officer.get("cityId", "") == city["id"] \
				and officer.get("captorFactionId", "") == former_faction_id:
			if officer.get("formerFactionId", "") == faction_id:
				changed["status"] = "serving"
				changed["factionId"] = faction_id
				changed.erase("captorFactionId")
				changed.erase("formerFactionId")
			else:
				changed["captorFactionId"] = faction_id
			next["officers"][officer_id] = changed
	var released: Dictionary = _release_landless_faction_officers(next)
	if not released["ok"]: return released
	return {"ok": true, "error": "", "next": _update_city_satraps(released["next"])}


static func _absorb_faction(
		data: Dictionary, receiving_faction_id: String,
		target_faction_id: String, target_ruler_id: String
) -> Dictionary:
	var next: Dictionary = data.duplicate(true)
	var converted_ids: Array[String] = []
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id: String = str(raw_city_id)
		if data["cities"][city_id]["ownerId"] == target_faction_id:
			converted_ids.append(city_id)
	var destination_id: String = str(data["officers"][target_ruler_id].get("cityId", ""))
	if destination_id.is_empty():
		var sorted_converted: Array[String] = converted_ids.duplicate()
		sorted_converted.sort()
		if not sorted_converted.is_empty(): destination_id = sorted_converted[0]
	for city_id: String in converted_ids:
		var city: Dictionary = next["cities"][city_id].duplicate(true)
		city["ownerId"] = receiving_faction_id
		next["cities"][city_id] = city
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id: String = str(raw_officer_id)
		var officer: Dictionary = data["officers"][officer_id]
		var changed: Dictionary = officer.duplicate(true)
		if officer.get("status", "") == "serving" and officer.get("factionId", "") == target_faction_id \
				and converted_ids.has(str(officer.get("cityId", ""))):
			changed["factionId"] = receiving_faction_id
			next["officers"][officer_id] = changed
		elif officer_id == target_ruler_id:
			changed["factionId"] = receiving_faction_id
			changed["cityId"] = destination_id
			next["officers"][officer_id] = changed
		elif officer.get("status", "") == "captive" \
				and converted_ids.has(str(officer.get("cityId", ""))) \
				and officer.get("captorFactionId", "") == target_faction_id:
			if officer.get("formerFactionId", "") == receiving_faction_id:
				changed["status"] = "serving"
				changed["factionId"] = receiving_faction_id
				changed.erase("captorFactionId")
				changed.erase("formerFactionId")
			else:
				changed["captorFactionId"] = receiving_faction_id
			next["officers"][officer_id] = changed
	var released: Dictionary = _release_landless_faction_officers(next)
	if not released["ok"]: return released
	return {"ok": true, "error": "", "next": _update_city_satraps(released["next"])}


static func _release_landless_faction_officers(data: Dictionary) -> Dictionary:
	var landholding: Dictionary = {}
	for city_id: String in _sorted_keys(data["cities"]):
		landholding[data["cities"][city_id]["ownerId"]] = true
	var neutral_id: String = _neutral_faction_id(data["factions"])
	var order_by_officer: Dictionary = {}
	for order_id: String in _sorted_strategic_order_ids(data["strategicOrders"]):
		var strategic: Dictionary = data["strategicOrders"][order_id]
		order_by_officer[strategic["officerId"]] = strategic
	for order_id: String in _sorted_diplomatic_order_ids(data["diplomaticOrders"]):
		var diplomatic: Dictionary = data["diplomaticOrders"][order_id]
		order_by_officer[diplomatic["officerId"]] = diplomatic
	var landless_strategic: Array[String] = []
	for order_id: String in _sorted_strategic_order_ids(data["strategicOrders"]):
		if not landholding.has(data["strategicOrders"][order_id]["factionId"]): landless_strategic.append(order_id)
	var landless_diplomatic: Array[String] = []
	for order_id: String in _sorted_diplomatic_order_ids(data["diplomaticOrders"]):
		if not landholding.has(data["diplomaticOrders"][order_id]["factionId"]): landless_diplomatic.append(order_id)
	var has_landless_officer: bool = false
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer: Dictionary = data["officers"][raw_officer_id]
		if officer.get("status", "") == "serving" and not landholding.has(officer["factionId"]):
			has_landless_officer = true
			break
	if not has_landless_officer and landless_strategic.is_empty() and landless_diplomatic.is_empty():
		return {"ok": true, "error": "", "next": data}
	if neutral_id.is_empty(): return {"ok": false, "error": "Landless factions cannot release officers without a neutral faction"}
	var next: Dictionary = data.duplicate(true)
	var messages: Array[String] = []
	for order_id: String in landless_strategic:
		var order: Dictionary = data["strategicOrders"][order_id]
		if order["kind"] == "transport":
			var settlement: Dictionary = _settle_cargo_across_cities(next["cities"], order)
			if not settlement["ok"]: return settlement
			var names: Array[String] = []
			for city_id: String in settlement["destinationIds"]: names.append(next["cities"][city_id]["name"])
			messages.append("%s随所属势力灭亡而失效，%s由%s接收。" % [
				order_id, _format_cargo(order["cargo"]), "、".join(names),
			])
		(next["strategicOrders"] as Dictionary).erase(order_id)
	for order_id: String in landless_diplomatic:
		(next["diplomaticOrders"] as Dictionary).erase(order_id)
		messages.append("%s随所属势力灭亡而失效。" % order_id)
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id: String = str(raw_officer_id)
		var officer: Dictionary = data["officers"][officer_id]
		if officer.get("status", "") != "serving" or landholding.has(officer["factionId"]): continue
		var active_order: Dictionary = order_by_officer.get(officer_id, {})
		var settlement: Dictionary = {}
		if not active_order.is_empty():
			settlement = data["cities"].get(active_order["targetCityId"], {})
			if settlement.is_empty(): settlement = data["cities"].get(active_order["sourceCityId"], {})
		if settlement.is_empty() and officer.has("cityId"):
			settlement = data["cities"].get(officer["cityId"], {})
		if settlement.is_empty(): settlement = _first_city(data["cities"])
		if settlement.is_empty(): return {"ok": false, "error": "Cannot release landless officer without a settlement: %s" % officer_id}
		var released: Dictionary = officer.duplicate(true)
		released["status"] = "free"
		released["factionId"] = neutral_id
		released["cityId"] = settlement["id"]
		released["troops"] = 0
		released["stamina"] = 0
		next["officers"][officer_id] = released
	_append_logs(next, "turn", messages)
	return {"ok": true, "error": "", "next": next}


static func _settle_cargo_across_cities(cities: Dictionary, order: Dictionary) -> Dictionary:
	var candidates: Array[String] = []
	for raw_id: Variant in [order["sourceCityId"], order["targetCityId"]]:
		var city_id: String = str(raw_id)
		if cities.has(city_id) and not candidates.has(city_id): candidates.append(city_id)
	for city_id: String in _sorted_keys(cities):
		if cities[city_id]["ownerId"] == order["factionId"] and not candidates.has(city_id): candidates.append(city_id)
	for city_id: String in _sorted_keys(cities):
		if not candidates.has(city_id): candidates.append(city_id)
	var destinations: Array[String] = []
	for field: String in ["money", "food", "reserveTroops"]:
		var amount: int = int(order["cargo"][field])
		if amount == 0: continue
		var destination_id: String = ""
		for city_id: String in candidates:
			if int(cities[city_id][field]) <= JS_MAX_SAFE_INTEGER - amount:
				destination_id = city_id
				break
		if destination_id.is_empty(): return {"ok": false, "error": "没有城市可以安全接收运输资源：%s" % field}
		var city: Dictionary = cities[destination_id].duplicate(true)
		city[field] = int(city[field]) + amount
		cities[destination_id] = city
		if not destinations.has(destination_id): destinations.append(destination_id)
	return {"ok": true, "error": "", "destinationIds": destinations}


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
			if officer.get("status", "") == "serving" and officer.get("factionId", "") == city["ownerId"] \
					and officer.get("cityId", "") == city_id:
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
	for raw_item_id: Variant in officer.get("equipmentItemIds", []):
		value += int(data["items"][raw_item_id]["intelligenceBonus"])
	return value


static func _effective_force(data: Dictionary, officer: Dictionary) -> int:
	var value: int = int(officer["force"])
	for raw_item_id: Variant in officer.get("equipmentItemIds", []):
		value += int(data["items"][raw_item_id]["forceBonus"])
	return value


static func _visible_log_kind(data: Dictionary, order: Dictionary) -> String:
	return "map" if order["factionId"] == data["playerFactionId"] \
			or order["targetFactionId"] == data["playerFactionId"] else "ai"


static func _visible_order_message(data: Dictionary, order: Dictionary, detailed: String) -> String:
	if order["factionId"] == data["playerFactionId"] or order["targetFactionId"] == data["playerFactionId"]:
		return detailed
	return "%s完成了一项谋略行动。" % data["factions"].get(order["factionId"], {"name": "某势力"})["name"]


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


static func _issue_receipt(
		before: Dictionary, after: Dictionary, command_kind: String, order_id: String,
		source_id: String, officer_id: String, target_id: String
) -> Dictionary:
	return {
		"kind": command_kind, "state": _receipt_state(after),
		"order": (after["diplomaticOrders"][order_id] as Dictionary).duplicate(true),
		"sourceCity": {
			"id": source_id, "before": {"money": before["cities"][source_id]["money"]},
			"after": {"money": after["cities"][source_id]["money"]},
		},
		"officer": {
			"id": officer_id, "before": _transit_officer(before["officers"][officer_id]),
			"after": _transit_officer(after["officers"][officer_id]),
		},
		"targetOfficer": {"id": target_id},
		"appendedLog": (after["logs"] as Array)[-1].duplicate(true),
	}


static func _advance_receipt(before: Dictionary, after: Dictionary, completed_ids: Array[String]) -> Dictionary:
	var active_orders: Array[Dictionary] = []
	for order_id: String in _sorted_diplomatic_order_ids(after["diplomaticOrders"]):
		active_orders.append((after["diplomaticOrders"][order_id] as Dictionary).duplicate(true))
	return {
		"kind": "advance_diplomatic_orders", "state": _receipt_state(after),
		"completedOrderIds": completed_ids.duplicate(), "activeOrders": active_orders,
		"appendedLogs": (after["logs"] as Array).slice((before["logs"] as Array).size()).duplicate(true),
	}


static func _receipt_state(data: Dictionary) -> Dictionary:
	return {
		"turn": data["turn"], "rngSeed": data["rngSeed"], "campaignStarted": data["campaignStarted"],
		"actedOfficerIds": (data["actedOfficerIds"] as Array).duplicate(true), "logCount": (data["logs"] as Array).size(),
	}


static func _transit_officer(officer: Dictionary) -> Dictionary:
	return {
		"status": officer["status"], "factionId": officer["factionId"],
		"cityId": officer.get("cityId", null), "stamina": officer["stamina"],
	}


static func _color_for_officer(officer_id: String) -> String:
	var hash: int = 0
	for index: int in range(officer_id.length()):
		hash = ((hash ^ officer_id.unicode_at(index)) * 16_777_619) & 0xffff_ffff
	return "#%06x" % (hash & 0x00ff_ffff)


static func _format_cargo(cargo: Dictionary) -> String:
	var parts: Array[String] = []
	if int(cargo["money"]) > 0: parts.append("%d 金" % int(cargo["money"]))
	if int(cargo["food"]) > 0: parts.append("%d 粮" % int(cargo["food"]))
	if int(cargo["reserveTroops"]) > 0: parts.append("%d 后备兵" % int(cargo["reserveTroops"]))
	return "、".join(parts)


static func _neutral_faction_id(factions: Dictionary) -> String:
	for faction_id: String in _sorted_keys(factions):
		if bool(factions[faction_id].get("isNeutral", false)): return faction_id
	return ""


static func _officer_has_order(data: Dictionary, officer_id: String) -> bool:
	for record_name: String in ["strategicOrders", "diplomaticOrders"]:
		for order_id: String in _sorted_keys(data[record_name]):
			if data[record_name][order_id].get("officerId", "") == officer_id: return true
	return false


static func _first_owned_city(cities: Dictionary, faction_id: String) -> Dictionary:
	for city_id: String in _sorted_keys(cities):
		if cities[city_id]["ownerId"] == faction_id: return cities[city_id]
	return {}


static func _first_city(cities: Dictionary) -> Dictionary:
	var city_ids: Array[String] = _sorted_keys(cities)
	return {} if city_ids.is_empty() else cities[city_ids[0]]


static func _sorted_keys(record: Dictionary) -> Array[String]:
	var keys: Array[String] = []
	for raw_key: Variant in record.keys(): keys.append(str(raw_key))
	keys.sort()
	return keys


static func _sorted_strategic_order_ids(record: Dictionary) -> Array[String]:
	var keys: Array[String] = _sorted_keys(record)
	keys.sort_custom(func(left: String, right: String) -> bool:
		return int(left.trim_prefix("strategic-order-")) < int(right.trim_prefix("strategic-order-"))
	)
	return keys


static func _sorted_diplomatic_order_ids(record: Dictionary) -> Array[String]:
	var keys: Array[String] = _sorted_keys(record)
	keys.sort_custom(func(left: String, right: String) -> bool:
		return int(left.trim_prefix("diplomatic-order-")) < int(right.trim_prefix("diplomatic-order-"))
	)
	return keys


static func _sorted_city_ids_by_source(cities: Dictionary) -> Array[String]:
	var ids: Array[String] = _sorted_keys(cities)
	ids.sort_custom(func(left: String, right: String) -> bool:
		var left_index: int = int(cities[left].get("sourceIndex", JS_MAX_SAFE_INTEGER))
		var right_index: int = int(cities[right].get("sourceIndex", JS_MAX_SAFE_INTEGER))
		return left_index < right_index if left_index != right_index else left < right
	)
	return ids


static func _empty_catalog(source_city_id: String, reason: String) -> Dictionary:
	return {
		"allowed": false, "reason": reason, "sourceCityId": source_city_id,
		"targets": [], "executorIds": [], "commands": [], "activeOrders": [],
	}


static func _unavailable(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason}


static func _failure(reason: String) -> Dictionary:
	return {"ok": false, "error": reason, "receipt": {}}
