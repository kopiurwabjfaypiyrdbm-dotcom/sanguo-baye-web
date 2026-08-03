class_name OfficerLifecycle
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const CoreLcg = preload("res://src/domain/random/core_lcg.gd")
const StrategicOrders = preload("res://src/domain/commands/strategic_order_commands.gd")
const CampaignOutcome = preload("res://src/domain/progression/campaign_outcome.gd")


static func settle_captive_escapes(state: GameState) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(before)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	if before["lifecyclePolicy"]["captiveEscape"] == "disabled":
		return _lifecycle_success("settle_captive_escapes", before, before, [], [])
	var next: Dictionary = before.duplicate(true)
	var seed: int = int(before["rngSeed"])
	var escaped_ids: Array[String] = []
	var messages: Array[String] = []
	for officer_id: String in _sorted_officer_ids(before):
		var captive: Dictionary = before["officers"][officer_id]
		if captive.get("status", "") != "captive": continue
		var chance: int = mini(25, 5 + int(floor(float(captive["intelligence"]) / 10.0)))
		var escape_roll: Dictionary = CoreLcg.next_random(seed)
		seed = int(escape_roll["seed"])
		if int(floor(float(escape_roll["value"]) * 100.0)) >= chance: continue
		var former_cities: Array[String] = []
		for city_id: String in _sorted_city_ids(before):
			if before["cities"][city_id]["ownerId"] == captive.get("formerFactionId", ""):
				former_cities.append(city_id)
		var changed: Dictionary = captive.duplicate(true)
		if not former_cities.is_empty() and not str(captive.get("formerFactionId", "")).is_empty():
			var destination_roll: Dictionary = CoreLcg.next_random(seed)
			seed = int(destination_roll["seed"])
			var destination_index: int = int(floor(float(destination_roll["value"]) * float(former_cities.size())))
			var destination_id: String = former_cities[destination_index]
			changed["status"] = "serving"
			changed["factionId"] = captive["formerFactionId"]
			changed.erase("captorFactionId")
			changed.erase("formerFactionId")
			changed["cityId"] = destination_id
			changed["troops"] = 0
			changed["stamina"] = 0
			messages.append("%s逃离囚禁，返回%s。" % [captive["name"], before["cities"][destination_id]["name"]])
		else:
			changed["status"] = "free"
			changed["factionId"] = _neutral_faction_id(before)
			changed.erase("captorFactionId")
			changed.erase("formerFactionId")
			changed["troops"] = 0
			changed["stamina"] = 0
			messages.append("%s逃离囚禁，暂在%s隐居。" % [captive["name"], before["cities"][captive["cityId"]]["name"]])
		next["officers"][officer_id] = changed
		escaped_ids.append(officer_id)
	next["rngSeed"] = seed
	_append_logs(next, "turn", messages)
	issues = Validator.validate_runtime(next)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	return _lifecycle_success("settle_captive_escapes", before, next, escaped_ids, messages)


static func settle_natural_deaths(state: GameState) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(before)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	if before["lifecyclePolicy"]["naturalDeath"] == "disabled" or int(before["calendar"]["month"]) != 1:
		return _lifecycle_success("settle_natural_deaths", before, before, [], [])
	var seed: int = int(before["rngSeed"])
	var selected: Array[String] = []
	for officer_id: String in _sorted_officer_ids(before):
		var officer: Dictionary = before["officers"][officer_id]
		if not ["serving", "free", "captive"].has(officer.get("status", "")) \
				or int(officer.get("age", 0)) < 90:
			continue
		var random: Dictionary = CoreLcg.next_random(seed)
		seed = int(random["seed"])
		if int(floor(float(random["value"]) * 100.0)) < 50: selected.append(officer_id)
	var ruler_ids: Dictionary = {}
	for faction_id: String in _sorted_keys(before["factions"]):
		ruler_ids[str(before["factions"][faction_id]["rulerOfficerId"])] = true
	selected.sort_custom(func(left: String, right: String) -> bool:
		var left_ruler: int = 1 if ruler_ids.has(left) else 0
		var right_ruler: int = 1 if ruler_ids.has(right) else 0
		if left_ruler != right_ruler: return left_ruler < right_ruler
		return _officer_less(before["officers"][left], before["officers"][right])
	)
	var next: Dictionary = before.duplicate(true)
	next["rngSeed"] = seed
	var died_ids: Array[String] = []
	var messages: Array[String] = []
	for officer_id: String in selected:
		var officer: Dictionary = next["officers"].get(officer_id, {})
		if officer.is_empty() or officer.get("status", "") == "dead": continue
		var killed: Dictionary = _kill_officer_data(next, {
			"officerId": officer_id, "cause": "natural-death", "cityId": officer.get("cityId"),
		})
		if not killed["ok"]: return _failure(killed["error"])
		next = killed["next"]
		died_ids.append(officer_id)
		messages.append("%s年迈病逝。" % officer["name"])
	_append_logs(next, "turn", messages)
	issues = Validator.validate_runtime(next)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	return _lifecycle_success("settle_natural_deaths", before, next, died_ids, messages)


static func kill_officer(state: GameState, input: Dictionary) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(before)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	var killed: Dictionary = _kill_officer_data(before, input)
	if not killed["ok"]: return killed
	var next: Dictionary = killed["next"]
	issues = Validator.validate_runtime(next)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	return {"ok": true, "error": "", "next_state": GameState.new(next), "receipt": {
		"kind": "kill_officer", "officerId": str(input.get("officerId", "")),
		"beforeSeed": before["rngSeed"], "afterSeed": next["rngSeed"],
		"phase": next["phase"], "outcome": next.get("outcome", null),
		"pendingSuccession": next.get("pendingSuccession", null),
		"appendedLogs": (next["logs"] as Array).slice((before["logs"] as Array).size()).duplicate(true),
	}}


static func resolve_succession(state: GameState, successor_officer_id: String) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(before)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	var pending: Dictionary = before.get("pendingSuccession", {})
	if pending.is_empty() or before["phase"] != "succession": return _failure("当前没有待处理的君主继承")
	if not (pending["candidateOfficerIds"] as Array).has(successor_officer_id):
		return _failure("所选人物不是合法继承候选")
	var successor: Dictionary = before["officers"].get(successor_officer_id, {})
	if successor.is_empty() or successor.get("status", "") != "serving" \
			or successor.get("factionId", "") != pending["factionId"]:
		return _failure("继承候选的状态已经失效")
	var next: Dictionary = before.duplicate(true)
	next["phase"] = pending["resumePhase"]
	next["activeFactionId"] = pending["resumeActiveFactionId"]
	next.erase("pendingSuccession")
	var faction: Dictionary = next["factions"][pending["factionId"]].duplicate(true)
	faction["rulerOfficerId"] = successor_officer_id
	next["factions"][pending["factionId"]] = faction
	var installed: Dictionary = successor.duplicate(true)
	installed["loyalty"] = 100
	next["officers"][successor_officer_id] = installed
	next = _update_city_satraps(next)
	_append_logs(next, "system", ["%s被拥立为%s新君。" % [successor["name"], faction["name"]]])
	var outcome: Dictionary = CampaignOutcome.evaluate(GameState.new(next))
	if not outcome["ok"]: return _failure(outcome["error"])
	next = outcome["next_state"].snapshot()
	issues = Validator.validate_runtime(next)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	return {"ok": true, "error": "", "next_state": GameState.new(next), "receipt": {
		"kind": "resolve_succession", "successorOfficerId": successor_officer_id,
		"beforeSeed": before["rngSeed"], "afterSeed": next["rngSeed"],
		"phase": next["phase"], "outcome": next.get("outcome", null),
		"appendedLogs": (next["logs"] as Array).slice((before["logs"] as Array).size()).duplicate(true),
	}}


static func _kill_officer_data(data: Dictionary, input: Dictionary) -> Dictionary:
	var officer_id: String = str(input.get("officerId", ""))
	var officer: Dictionary = data["officers"].get(officer_id, {})
	if officer.is_empty() or officer.get("status", "") == "dead":
		return _failure("目标人物不存在或已经死亡")
	var cause: String = str(input.get("cause", ""))
	if not ["battle-death", "natural-death", "execution"].has(cause):
		return _failure("不支持的人物死亡原因：%s" % cause)
	var neutral_id: String = _neutral_faction_id(data)
	if neutral_id.is_empty(): return _failure("人物生命周期需要无所属势力")
	var former_faction_id: String = str(officer.get("formerFactionId", "")) \
			if officer.get("status", "") == "captive" else str(officer.get("factionId", ""))
	var recovery_city: Dictionary = _select_recovery_city(data, officer, str(input.get("cityId", "")))
	var canceled: Dictionary = _cancel_officer_orders(data, officer_id)
	if not canceled["ok"]: return canceled
	var next: Dictionary = canceled["next"]
	next["campaignStarted"] = true
	var equipment: Array = (next["officers"][officer_id].get("equipmentItemIds", []) as Array).duplicate(true)
	if not equipment.is_empty():
		if recovery_city.is_empty(): return _failure("无法安置%s遗留的装备" % officer["name"])
		var city: Dictionary = next["cities"][recovery_city["id"]].duplicate(true)
		var item_ids: Array = (city.get("itemIds", []) as Array).duplicate(true)
		item_ids.append_array(equipment)
		city["itemIds"] = item_ids
		next["cities"][city["id"]] = city
	(next["actedOfficerIds"] as Array).erase(officer_id)
	(next["discoveredOfficerIds"] as Array).erase(officer_id)
	var dead: Dictionary = next["officers"][officer_id].duplicate(true)
	dead["status"] = "dead"
	dead["factionId"] = neutral_id
	dead.erase("captorFactionId")
	dead.erase("formerFactionId")
	dead.erase("cityId")
	dead["troops"] = 0
	dead["stamina"] = 0
	dead["equipmentItemIds"] = []
	var death: Dictionary = {
		"cause": cause, "turn": data["turn"],
		"year": data["calendar"]["year"], "month": data["calendar"]["month"],
	}
	if not recovery_city.is_empty(): death["cityId"] = recovery_city["id"]
	if not str(input.get("responsibleFactionId", "")).is_empty():
		death["responsibleFactionId"] = str(input["responsibleFactionId"])
	dead["death"] = death
	next["officers"][officer_id] = dead
	if not former_faction_id.is_empty() and data["factions"].has(former_faction_id) \
			and data["factions"][former_faction_id]["rulerOfficerId"] == officer_id:
		var ruler_loss: Dictionary = _handle_ruler_loss(next, former_faction_id, officer_id, cause)
		if not ruler_loss["ok"]: return ruler_loss
		next = ruler_loss["next"]
	return {"ok": true, "error": "", "next": _update_city_satraps(next)}


static func _handle_ruler_loss(
		data: Dictionary, faction_id: String, former_ruler_id: String, reason: String
) -> Dictionary:
	var owns_city := false
	for city_id: String in _sorted_city_ids(data):
		if data["cities"][city_id]["ownerId"] == faction_id: owns_city = true; break
	if not owns_city: return {"ok": true, "error": "", "next": data}
	var candidates: Array[String] = []
	for officer_id: String in _sorted_officer_ids(data):
		var officer: Dictionary = data["officers"][officer_id]
		if officer.get("status", "") == "serving" and officer.get("factionId", "") == faction_id:
			candidates.append(officer_id)
	candidates.sort_custom(func(left: String, right: String) -> bool:
		var left_officer: Dictionary = data["officers"][left]
		var right_officer: Dictionary = data["officers"][right]
		var left_intelligence: int = _effective_intelligence(data, left_officer)
		var right_intelligence: int = _effective_intelligence(data, right_officer)
		if left_intelligence != right_intelligence: return left_intelligence > right_intelligence
		if int(left_officer["loyalty"]) != int(right_officer["loyalty"]): return int(left_officer["loyalty"]) > int(right_officer["loyalty"])
		if int(left_officer["leadership"]) != int(right_officer["leadership"]): return int(left_officer["leadership"]) > int(right_officer["leadership"])
		return _officer_less(left_officer, right_officer)
	)
	if candidates.is_empty(): return _dissolve_faction(data, faction_id, former_ruler_id)
	var next: Dictionary = data.duplicate(true)
	if faction_id == data["playerFactionId"]:
		next["phase"] = "succession"
		next["activeFactionId"] = data["playerFactionId"]
		var pending: Dictionary = {
			"version": 1, "factionId": faction_id, "formerRulerOfficerId": former_ruler_id,
			"candidateOfficerIds": candidates, "reason": reason,
			"createdTurn": data["turn"], "createdYear": data["calendar"]["year"],
			"createdMonth": data["calendar"]["month"],
			"resumePhase": "ai" if data["phase"] == "ai" else "player",
			"resumeActiveFactionId": data["activeFactionId"],
		}
		if data["phase"] == "ai": pending["resumeAiFactionIndex"] = (data["factionOrder"] as Array).find(data["activeFactionId"]) + 1
		next["pendingSuccession"] = pending
		return {"ok": true, "error": "", "next": next}
	var successor_id: String = candidates[0]
	var faction: Dictionary = next["factions"][faction_id].duplicate(true)
	faction["rulerOfficerId"] = successor_id
	next["factions"][faction_id] = faction
	var successor: Dictionary = next["officers"][successor_id].duplicate(true)
	successor["loyalty"] = 100
	next["officers"][successor_id] = successor
	_append_logs(next, "turn", ["%s继任%s君主。" % [successor["name"], faction["name"]]])
	return {"ok": true, "error": "", "next": next}


static func _dissolve_faction(data: Dictionary, faction_id: String, former_ruler_id: String) -> Dictionary:
	var neutral_id: String = _neutral_faction_id(data)
	if neutral_id.is_empty(): return _failure("势力瓦解需要无所属势力")
	var canceled: Dictionary = _cancel_faction_orders(data, faction_id)
	if not canceled["ok"]: return canceled
	var next: Dictionary = canceled["next"]
	for city_id: String in _sorted_city_ids(next):
		if next["cities"][city_id]["ownerId"] != faction_id: continue
		var city: Dictionary = next["cities"][city_id].duplicate(true)
		city["ownerId"] = neutral_id
		city.erase("satrapOfficerId")
		next["cities"][city_id] = city
	for officer_id: String in _sorted_officer_ids(next):
		var officer: Dictionary = next["officers"][officer_id]
		if officer.get("status", "") == "serving" and officer.get("factionId", "") == faction_id:
			var released: Dictionary = officer.duplicate(true)
			released["status"] = "free"; released["factionId"] = neutral_id
			released["troops"] = 0; released["stamina"] = 0
			next["officers"][officer_id] = released
		elif officer.get("status", "") == "captive" and officer.get("captorFactionId", "") == faction_id:
			var freed: Dictionary = officer.duplicate(true)
			freed["status"] = "free"; freed["factionId"] = neutral_id
			freed.erase("captorFactionId"); freed.erase("formerFactionId")
			freed["troops"] = 0; freed["stamina"] = 0
			next["officers"][officer_id] = freed
	if next.get("pendingSuccession") is Dictionary \
			and (next["pendingSuccession"] as Dictionary).get("factionId") == faction_id:
		next.erase("pendingSuccession")
	if faction_id == next["playerFactionId"]:
		next["phase"] = "ended"; next["activeFactionId"] = next["playerFactionId"]; next["outcome"] = "defeat"
	_append_logs(next, "system", ["%s在%s失效后无人可继，势力瓦解。" % [data["factions"][faction_id]["name"], data["officers"][former_ruler_id]["name"]]])
	return {"ok": true, "error": "", "next": _update_city_satraps(next)}


static func _cancel_faction_orders(data: Dictionary, faction_id: String) -> Dictionary:
	var officer_ids: Array[String] = []
	for officer_id: String in _sorted_officer_ids(data):
		var officer: Dictionary = data["officers"][officer_id]
		if (officer.get("status", "") == "serving" and officer.get("factionId", "") == faction_id) \
				or (officer.get("status", "") == "captive" and officer.get("captorFactionId", "") == faction_id):
			officer_ids.append(officer_id)
	for order_id: String in _sorted_keys(data["strategicOrders"]):
		var order: Dictionary = data["strategicOrders"][order_id]
		if order["factionId"] == faction_id and not officer_ids.has(str(order["officerId"])): officer_ids.append(str(order["officerId"]))
	for order_id: String in _sorted_keys(data["diplomaticOrders"]):
		var order: Dictionary = data["diplomaticOrders"][order_id]
		if order["factionId"] == faction_id and not officer_ids.has(str(order["officerId"])): officer_ids.append(str(order["officerId"]))
	var next: Dictionary = data
	for officer_id: String in officer_ids:
		var canceled: Dictionary = _cancel_officer_orders(next, officer_id)
		if not canceled["ok"]: return canceled
		next = canceled["next"]
	return {"ok": true, "error": "", "next": next}


static func _cancel_officer_orders(data: Dictionary, officer_id: String) -> Dictionary:
	var strategic: Dictionary = StrategicOrders.cancel_officer_orders(data, officer_id, "执行者失效")
	if not strategic["ok"]: return strategic
	var next: Dictionary = strategic["next"]
	var messages: Array[String] = []
	for order_id: String in _sorted_keys(data["diplomaticOrders"]):
		var order: Dictionary = data["diplomaticOrders"][order_id]
		if order["officerId"] == officer_id:
			(next["diplomaticOrders"] as Dictionary).erase(order_id)
			messages.append("%s因执行者失效而终止。" % order_id)
			continue
		if order["targetOfficerId"] != officer_id: continue
		(next["diplomaticOrders"] as Dictionary).erase(order_id)
		var executor: Dictionary = next["officers"].get(order["officerId"], {})
		if not executor.is_empty() and executor.get("status", "") == "serving" and not executor.has("cityId"):
			var destination: Dictionary = data["cities"].get(order["sourceCityId"], {})
			if destination.is_empty() or destination["ownerId"] != order["factionId"]:
				destination = _first_owned_city_by_source(data, order["factionId"])
			if not destination.is_empty():
				var returned: Dictionary = executor.duplicate(true)
				returned["cityId"] = destination["id"]
				next["officers"][executor["id"]] = returned
		messages.append("%s因目标失效而终止。" % order_id)
	_append_logs(next, "turn", messages)
	return {"ok": true, "error": "", "next": next}


static func _select_recovery_city(data: Dictionary, officer: Dictionary, preferred_city_id: String) -> Dictionary:
	if not preferred_city_id.is_empty() and data["cities"].has(preferred_city_id): return data["cities"][preferred_city_id]
	if officer.has("cityId") and data["cities"].has(officer["cityId"]): return data["cities"][officer["cityId"]]
	for city_id: String in _sorted_city_ids(data):
		if data["cities"][city_id]["ownerId"] == officer.get("factionId", "") \
				or data["cities"][city_id]["ownerId"] == officer.get("captorFactionId", ""):
			return data["cities"][city_id]
	var city_ids: Array[String] = _sorted_city_ids(data)
	return data["cities"][city_ids[0]] if not city_ids.is_empty() else {}


static func _update_city_satraps(data: Dictionary) -> Dictionary:
	var next: Dictionary = data.duplicate(true)
	for raw_city_id: Variant in data["cityOrder"]:
		var city_id: String = str(raw_city_id)
		var city: Dictionary = data["cities"][city_id]
		var changed: Dictionary = city.duplicate(true)
		var faction: Dictionary = data["factions"].get(city["ownerId"], {})
		if faction.is_empty() or bool(faction.get("isNeutral", false)):
			changed.erase("satrapOfficerId"); next["cities"][city_id] = changed; continue
		var stationed: Array[String] = []
		for officer_id: String in _sorted_officer_ids(data):
			var officer: Dictionary = data["officers"][officer_id]
			if officer.get("status", "") == "serving" and officer.get("factionId", "") == city["ownerId"] \
					and officer.get("cityId", "") == city_id:
				stationed.append(officer_id)
		stationed.sort_custom(func(left: String, right: String) -> bool:
			var lo: Dictionary = data["officers"][left]; var ro: Dictionary = data["officers"][right]
			var li: int = _effective_intelligence(data, lo); var ri: int = _effective_intelligence(data, ro)
			if li != ri: return li > ri
			var lf: int = _effective_force(data, lo); var rf: int = _effective_force(data, ro)
			return lf > rf if lf != rf else left < right
		)
		var selected := ""
		var current := str(city.get("satrapOfficerId", ""))
		if data["rulesetId"] != "baye-classic-v1" and stationed.has(current): selected = current
		if selected.is_empty() and stationed.has(str(faction["rulerOfficerId"])): selected = str(faction["rulerOfficerId"])
		if selected.is_empty() and not stationed.is_empty(): selected = stationed[0]
		if selected.is_empty(): changed.erase("satrapOfficerId")
		else: changed["satrapOfficerId"] = selected
		next["cities"][city_id] = changed
	return next


static func _lifecycle_success(kind: String, before: Dictionary, next: Dictionary, affected_ids: Array[String], _messages: Array[String]) -> Dictionary:
	return {"ok": true, "error": "", "next_state": GameState.new(next), "receipt": {
		"kind": kind, "beforeSeed": before["rngSeed"], "afterSeed": next["rngSeed"],
		"affectedOfficerIds": affected_ids.duplicate(), "phase": next["phase"],
		"outcome": next.get("outcome", null), "pendingSuccession": next.get("pendingSuccession", null),
		"appendedLogs": (next["logs"] as Array).slice((before["logs"] as Array).size()).duplicate(true),
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


static func _sorted_officer_ids(data: Dictionary) -> Array[String]:
	var ids: Array[String] = _sorted_keys(data["officers"])
	ids.sort_custom(func(left: String, right: String) -> bool:
		return _officer_less(data["officers"][left], data["officers"][right])
	)
	return ids


static func _sorted_city_ids(data: Dictionary) -> Array[String]:
	var ids: Array[String] = _sorted_keys(data["cities"])
	ids.sort_custom(func(left: String, right: String) -> bool:
		var li: int = int(data["cities"][left].get("sourceIndex", 9_007_199_254_740_991))
		var ri: int = int(data["cities"][right].get("sourceIndex", 9_007_199_254_740_991))
		return li < ri if li != ri else left < right
	)
	return ids


static func _officer_less(left: Dictionary, right: Dictionary) -> bool:
	var left_source: int = int(left.get("sourceId", 9_007_199_254_740_991))
	var right_source: int = int(right.get("sourceId", 9_007_199_254_740_991))
	return left_source < right_source if left_source != right_source else str(left["id"]) < str(right["id"])


static func _first_owned_city_by_source(data: Dictionary, faction_id: String) -> Dictionary:
	for city_id: String in _sorted_city_ids(data):
		if data["cities"][city_id]["ownerId"] == faction_id: return data["cities"][city_id]
	return {}


static func _effective_intelligence(data: Dictionary, officer: Dictionary) -> int:
	var value: int = int(officer["intelligence"])
	for item_id: Variant in officer.get("equipmentItemIds", []): value += int(data["items"][item_id]["intelligenceBonus"])
	return value


static func _effective_force(data: Dictionary, officer: Dictionary) -> int:
	var value: int = int(officer["force"])
	for item_id: Variant in officer.get("equipmentItemIds", []): value += int(data["items"][item_id]["forceBonus"])
	return value


static func _neutral_faction_id(data: Dictionary) -> String:
	for faction_id: String in _sorted_keys(data["factions"]):
		if bool(data["factions"][faction_id].get("isNeutral", false)): return faction_id
	return ""


static func _sorted_keys(record: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for raw_key: Variant in record.keys(): result.append(str(raw_key))
	result.sort()
	return result


static func _failure(error: String) -> Dictionary:
	return {"ok": false, "error": error}
