class_name ReconnaissanceCommands
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const Rulesets = preload("res://src/domain/rules/campaign_rulesets.gd")

const COMMAND_KIND: String = "reconnoitre_city"
const JS_MAX_SAFE_INTEGER: int = 9_007_199_254_740_991
const TOTAL_TROOPS_OVERFLOW: String = "侦察目标总兵力超出安全整数范围"


static func execute(state: GameState, kind: String, parameters: Dictionary) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty(): return _failure(Validator.first_error(issues))
	if kind != COMMAND_KIND: return _failure("不支持的侦察命令：%s" % kind)
	var availability: Dictionary = _availability_for_data(data, parameters)
	if not availability["allowed"]: return _failure(availability["reason"])
	var source: Dictionary = availability["source"]
	var target: Dictionary = availability["target"]
	var officer: Dictionary = availability["officer"]
	var cost: Dictionary = availability["cost"]
	var report_result: Dictionary = _create_report(data, target)
	if not report_result["ok"]: return _failure(report_result["error"])
	var report: Dictionary = report_result["report"]
	var next: Dictionary = data.duplicate(true)
	var next_source: Dictionary = source.duplicate(true)
	next_source["money"] = int(source["money"]) - int(cost["money"])
	var next_officer: Dictionary = officer.duplicate(true)
	next_officer["stamina"] = int(officer["stamina"]) - int(cost["stamina"])
	next["cities"][source["id"]] = next_source
	next["officers"][officer["id"]] = next_officer
	next["campaignStarted"] = true
	var acted: Array = (next["actedOfficerIds"] as Array).duplicate(true)
	acted.append(officer["id"])
	next["actedOfficerIds"] = acted
	next["intelReports"][target["id"]] = report
	var message: String = "%s从%s侦察%s：守军 %d 将、%d 兵，后备兵 %d。" % [
		officer["name"], source["name"], target["name"], report["officerCount"],
		report["totalTroops"], report["reserveTroops"],
	]
	var log_entry: Dictionary = _build_log(next, message)
	(next["logs"] as Array).append(log_entry)
	var next_issues: Array[Dictionary] = Validator.validate_runtime(next)
	if not next_issues.is_empty(): return _failure(Validator.first_error(next_issues))
	return {
		"ok": true, "error": "", "next_state": GameState.new(next),
		"receipt": _receipt(data, next, source["id"], target["id"], officer["id"], report, log_entry),
	}


static func get_availability(state: GameState, parameters: Dictionary) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty(): return _unavailable(Validator.first_error(issues))
	return _availability_for_data(data, parameters)


static func query_city_catalog(state: GameState, source_city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty(): return _empty_catalog(Validator.first_error(issues))
	return _query_city_catalog_for_data(data, source_city_id)


static func query_city_context(state: GameState, source_city_id: String) -> Dictionary:
	# The application DTO is composed from one validated deep snapshot. This avoids
	# copying the complete GameState once per target on mobile while preserving the
	# same fail-closed visibility boundary used by individual city queries.
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty():
		return {"found": false, "sourceCity": {}, "reconnaissance": {}, "visibility": {"found": false}}
	if not data["cities"].has(source_city_id):
		return {"found": false, "sourceCity": {}, "reconnaissance": {}, "visibility": {"found": false}}
	var catalog: Dictionary = _query_city_catalog_for_data(data, source_city_id)
	var source_visibility: Dictionary = _visibility_for_data(data, source_city_id)
	var source_city: Dictionary = (data["cities"][source_city_id] as Dictionary).duplicate(true) \
			if source_visibility.get("knowledge", "public") == "current" else {
				"id": source_visibility.get("id", source_city_id),
				"name": source_visibility.get("name", source_city_id),
				"ownerId": source_visibility.get("ownerId", ""),
			}
	var targets: Array[Dictionary] = []
	for raw_target: Variant in catalog.get("targets", []):
		var target: Dictionary = raw_target
		var row: Dictionary = target.duplicate(true)
		var faction: Dictionary = data["factions"].get(target["ownerId"], {})
		row["ownerName"] = faction.get("name", target["ownerId"])
		row["visibility"] = _visibility_for_data(data, target["id"])
		targets.append(row)
	var result_catalog: Dictionary = catalog.duplicate(true)
	result_catalog["targets"] = targets
	return {
		"found": true, "sourceCity": source_city, "reconnaissance": result_catalog,
		"visibility": source_visibility,
	}


static func _query_city_catalog_for_data(data: Dictionary, source_city_id: String) -> Dictionary:
	var source: Dictionary = data["cities"].get(source_city_id, {})
	if source.is_empty() or source.get("ownerId", "") != data["playerFactionId"]:
		return _empty_catalog("只能从己方城池派出侦察")
	var targets: Array[Dictionary] = []
	for target_id: String in _sorted_city_ids_by_source(data["cities"]):
		var target: Dictionary = data["cities"][target_id]
		if target_id == source_city_id or target["ownerId"] == source["ownerId"]: continue
		targets.append({
			"id": target_id, "name": target["name"], "ownerId": target["ownerId"],
			"knowledge": "report" if data["intelReports"].has(target_id) else "public",
			"observedTurn": int(data["intelReports"][target_id]["observedTurn"])
					if data["intelReports"].has(target_id) else 0,
		})
	var executors: Array[Dictionary] = []
	var first_reason: String = "当前没有可执行侦察的武将"
	var probe_target_id: String = "" if targets.is_empty() else str(targets[0]["id"])
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id: String = str(raw_officer_id)
		var availability: Dictionary = _availability_for_data(data, {
			"sourceCityId": source_city_id, "targetCityId": probe_target_id, "officerId": officer_id,
		})
		if availability["allowed"]:
			var officer: Dictionary = data["officers"][officer_id]
			executors.append({"id": officer_id, "name": officer["name"], "stamina": officer["stamina"]})
		elif first_reason == "当前没有可执行侦察的武将" and data["officers"].has(officer_id):
			var candidate: Dictionary = data["officers"][officer_id]
			if candidate.get("cityId", "") == source_city_id and candidate.get("status", "") == "serving":
				first_reason = availability["reason"]
	var cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], "reconnoitre")
	var reason: String = "当前没有可侦察的非己方城池" if targets.is_empty() else first_reason
	return {
		"allowed": not targets.is_empty() and not executors.is_empty(),
		"reason": "" if not targets.is_empty() and not executors.is_empty() else reason,
		"sourceCityId": source_city_id, "targets": targets, "executors": executors,
		"defaultTargetCityId": "" if targets.is_empty() else targets[0]["id"],
		"defaultOfficerId": "" if executors.is_empty() else executors[0]["id"],
		"cost": cost,
	}


static func visibility_for_city(state: GameState, city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	return _visibility_for_data(data, city_id)


static func _visibility_for_data(data: Dictionary, city_id: String) -> Dictionary:
	if not data["cities"].has(city_id): return {"found": false, "knowledge": "unknown"}
	var city: Dictionary = data["cities"][city_id]
	var base: Dictionary = {
		"found": true, "id": city_id, "name": city["name"], "ownerId": city["ownerId"],
	}
	if city["ownerId"] == data["playerFactionId"]:
		base["knowledge"] = "current"
		base["city"] = city.duplicate(true)
		return base
	if data["intelReports"].has(city_id):
		base["knowledge"] = "report"
		base["report"] = (data["intelReports"][city_id] as Dictionary).duplicate(true)
		return base
	base["knowledge"] = "public"
	return base


static func _availability_for_data(data: Dictionary, parameters: Dictionary) -> Dictionary:
	if data.get("phase", "") != "player" or data.get("activeFactionId", "") != data.get("playerFactionId", ""):
		return _unavailable("只能在玩家阶段执行侦察")
	var source_id: String = str(parameters.get("sourceCityId", ""))
	var source: Dictionary = data["cities"].get(source_id, {})
	if source.is_empty() or source.get("ownerId", "") != data["playerFactionId"]:
		return _unavailable("只能从己方城池派出侦察")
	var target_id: String = str(parameters.get("targetCityId", ""))
	var target: Dictionary = data["cities"].get(target_id, {})
	if target.is_empty() or target_id == source_id or target.get("ownerId", "") == source["ownerId"]:
		return _unavailable("请选择非己方目标城池")
	var officer_id: String = str(parameters.get("officerId", ""))
	var officer: Dictionary = data["officers"].get(officer_id, {})
	if officer.is_empty() or officer.get("status", "") != "serving" \
			or officer.get("factionId", "") != data["playerFactionId"] \
			or officer.get("cityId", "") != source_id:
		return _unavailable("执行武将不在出发城")
	if (data["actedOfficerIds"] as Array).has(officer_id):
		return _unavailable("%s本月已经行动" % officer["name"])
	var cost: Dictionary = Rulesets.get_command_cost(data["rulesetId"], "reconnoitre")
	if cost.is_empty(): return _unavailable("不支持的规则集：%s" % data["rulesetId"])
	if int(officer["stamina"]) < int(cost["stamina"]):
		return _unavailable("%s体力不足，需要 %d 点" % [officer["name"], int(cost["stamina"])])
	if int(source["money"]) < int(cost["money"]):
		return _unavailable("%s金钱不足，需要 %d" % [source["name"], int(cost["money"])])
	return {"allowed": true, "reason": "", "source": source, "target": target, "officer": officer, "cost": cost}


static func _create_report(data: Dictionary, city: Dictionary) -> Dictionary:
	var officer_ids: Array[String] = []
	var total_troops: int = 0
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id: String = str(raw_officer_id)
		var officer: Dictionary = data["officers"][officer_id]
		if officer.get("status", "") == "serving" and officer.get("cityId", "") == city["id"]:
			var troops: int = int(officer["troops"])
			if total_troops > JS_MAX_SAFE_INTEGER - troops:
				return {"ok": false, "error": TOTAL_TROOPS_OVERFLOW, "report": {}}
			officer_ids.append(officer_id)
			total_troops += troops
	officer_ids.sort()
	var report: Dictionary = {
		"cityId": city["id"], "observedTurn": data["turn"],
		"observedYear": data["calendar"]["year"], "observedMonth": data["calendar"]["month"],
		"population": city["population"], "money": city["money"], "food": city["food"],
		"reserveTroops": city["reserveTroops"], "farming": city["farming"],
		"commerce": city["commerce"], "defense": city["defense"],
		"officerIds": officer_ids, "officerCount": officer_ids.size(), "totalTroops": total_troops,
	}
	if city.has("publicLoyalty"): report["publicLoyalty"] = city["publicLoyalty"]
	var satrap_id: String = str(city.get("satrapOfficerId", ""))
	if not satrap_id.is_empty() and data["officers"].has(satrap_id):
		report["satrapName"] = data["officers"][satrap_id]["name"]
	return {"ok": true, "error": "", "report": report}


static func _receipt(
		before: Dictionary, after: Dictionary, source_id: String, target_id: String,
		officer_id: String, report: Dictionary, log_entry: Dictionary
) -> Dictionary:
	return {
		"kind": COMMAND_KIND,
		"state": {
			"turn": after["turn"], "rngSeed": after["rngSeed"],
			"campaignStarted": after["campaignStarted"],
			"actedOfficerIds": (after["actedOfficerIds"] as Array).duplicate(true),
			"logCount": (after["logs"] as Array).size(),
		},
		"sourceCity": {
			"id": source_id, "before": {"money": before["cities"][source_id]["money"]},
			"after": {"money": after["cities"][source_id]["money"]},
		},
		"targetCity": {"id": target_id},
		"officer": {
			"id": officer_id, "before": {"stamina": before["officers"][officer_id]["stamina"]},
			"after": {"stamina": after["officers"][officer_id]["stamina"]},
		},
		"report": report.duplicate(true), "appendedLog": log_entry.duplicate(true),
	}


static func _build_log(data: Dictionary, message: String) -> Dictionary:
	var used: Dictionary = {}
	for raw_log: Variant in data["logs"]: used[(raw_log as Dictionary)["id"]] = true
	var serial: int = (data["logs"] as Array).size() + 1
	var log_id: String = "log-%d-%03d" % [int(data["turn"]), serial]
	while used.has(log_id):
		serial += 1
		log_id = "log-%d-%03d" % [int(data["turn"]), serial]
	return {"id": log_id, "kind": "map", "message": message, "turn": int(data["turn"])}


static func _sorted_city_ids_by_source(cities: Dictionary) -> Array[String]:
	var ids: Array[String] = []
	for raw_id: Variant in cities.keys(): ids.append(str(raw_id))
	ids.sort_custom(func(left: String, right: String) -> bool:
		var left_index: int = int(cities[left].get("sourceIndex", 9_007_199_254_740_991))
		var right_index: int = int(cities[right].get("sourceIndex", 9_007_199_254_740_991))
		return left_index < right_index if left_index != right_index else left < right
	)
	return ids


static func _empty_catalog(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason, "sourceCityId": "", "targets": [], "executors": [],
		"defaultTargetCityId": "", "defaultOfficerId": "", "cost": {"stamina": 0, "money": 0}}


static func _unavailable(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason}


static func _failure(reason: String) -> Dictionary:
	return {"ok": false, "error": reason, "receipt": {}}
