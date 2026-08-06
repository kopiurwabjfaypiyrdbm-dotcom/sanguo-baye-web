class_name ManpowerCommands
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const Rulesets = preload("res://src/domain/rules/campaign_rulesets.gd")

const ARMS_PER_DEVOTION: int = 20
const ARMS_PER_MONEY: int = 10
const DEFAULT_RECRUIT_AMOUNT: int = 500
const MAX_DISTRIBUTION_INCREASE: int = 400
const COMMAND_KINDS: Array[String] = ["recruit_troops", "distribute_troops"]


static func execute(state: GameState, kind: String, parameters: Dictionary) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(before)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	if not COMMAND_KINDS.has(kind):
		return _failure("不支持的兵力命令：%s" % kind)
	match kind:
		"recruit_troops":
			return _execute_recruit(before, parameters)
		"distribute_troops":
			return _execute_distribute(before, parameters)
	return _failure("不支持的兵力命令：%s" % kind)


static func get_availability(state: GameState, kind: String, parameters: Dictionary) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty():
		return _unavailable(Validator.first_error(issues))
	return _availability_for_data(data, kind, parameters)


static func list_available_executors(state: GameState, city_id: String, kind: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty():
		return {"executorIds": [], "reason": Validator.first_error(issues)}
	return _list_available_executors_for_data(data, city_id, kind)


static func query_city_catalog(state: GameState, city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(data)
	if not issues.is_empty():
		var reason := Validator.first_error(issues)
		return {
			"commands": {
				"recruit_troops": {"executorIds": [], "reason": reason},
				"distribute_troops": {"executorIds": [], "reason": reason},
			},
		}
	return {
		"commands": {
			"recruit_troops": _list_available_executors_for_data(data, city_id, "recruit_troops"),
			"distribute_troops": _list_available_executors_for_data(data, city_id, "distribute_troops"),
		},
	}


static func calculate_recruit_capacity(city: Dictionary) -> int:
	var loyalty := int(city.get("publicLoyalty", 70))
	return maxi(0, mini(loyalty * ARMS_PER_DEVOTION, mini(int(city.get("money", 0)) * ARMS_PER_MONEY, 0xfffe)))


static func calculate_officer_troop_capacity(officer: Dictionary) -> int:
	var original := int(officer.get("level", 10)) * 100 \
			+ int(officer.get("force", 0)) * 10 \
			+ int(officer.get("intelligence", 0)) * 10
	return mini(0xfffe, maxi(int(officer.get("troops", 0)), original))


static func _execute_recruit(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability := _availability_for_data(data, "recruit_troops", parameters)
	if not bool(availability.get("allowed", false)):
		return _failure(str(availability.get("reason", "征兵不可用")))
	var city_id := str(parameters["cityId"])
	var officer_id := str(parameters["officerId"])
	var city: Dictionary = data["cities"][city_id]
	var officer: Dictionary = data["officers"][officer_id]
	var cost := Rulesets.get_command_cost(str(data.get("rulesetId", "")), "recruit-troops")
	var stamina_cost := int(cost.get("stamina", 12))
	var capacity := mini(calculate_recruit_capacity(city), 0xffff - int(city.get("reserveTroops", 0)))
	var requested := DEFAULT_RECRUIT_AMOUNT
	if parameters.has("amount"):
		if not _is_positive_int(parameters["amount"]):
			return _failure("征兵数量必须是正整数")
		requested = int(parameters["amount"])
	var gain := mini(requested, capacity)
	if gain <= 0:
		return _failure("该城没有足够的金钱、民忠或后备兵容量")
	var money_cost := floori(float(gain) / float(ARMS_PER_MONEY))
	var next := data.duplicate(true)
	next["cities"][city_id]["money"] = int(city.get("money", 0)) - money_cost
	next["cities"][city_id]["reserveTroops"] = int(city.get("reserveTroops", 0)) + gain
	next["officers"][officer_id]["stamina"] = int(officer.get("stamina", 0)) - stamina_cost
	(next["actedOfficerIds"] as Array).append(officer_id)
	_append_logs(next, "map", [
		"%s在%s征募 %d 名后备兵，消耗金钱 %d、体力 %d。" % [
			officer["name"], city["name"], gain, money_cost, stamina_cost,
		],
	])
	var issues := Validator.validate_runtime(next)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	return {
		"ok": true,
		"error": "",
		"next_state": GameState.new(next),
		"receipt": {
			"kind": "recruit_troops",
			"cityId": city_id,
			"officerId": officer_id,
			"gain": gain,
			"moneyCost": money_cost,
			"staminaCost": stamina_cost,
		},
	}


static func _execute_distribute(data: Dictionary, parameters: Dictionary) -> Dictionary:
	var availability := _availability_for_data(data, "distribute_troops", parameters)
	if not bool(availability.get("allowed", false)):
		return _failure(str(availability.get("reason", "兵力分配不可用")))
	var city_id := str(parameters["cityId"])
	var officer_id := str(parameters["officerId"])
	if not _is_non_negative_int(parameters.get("targetTroops", null)):
		return _failure("目标兵力必须是非负整数")
	var target_troops := int(parameters["targetTroops"])
	var city: Dictionary = data["cities"][city_id]
	var officer: Dictionary = data["officers"][officer_id]
	var maximum := calculate_officer_troop_capacity(officer)
	if target_troops > maximum:
		return _failure("该武将最多统率 %d 兵力" % maximum)
	var delta := target_troops - int(officer.get("troops", 0))
	if delta > int(city.get("reserveTroops", 0)):
		return _failure("城中后备兵不足")
	if delta > MAX_DISTRIBUTION_INCREASE:
		return _failure("单次最多可为武将增补 %d 兵力" % MAX_DISTRIBUTION_INCREASE)
	var next := data.duplicate(true)
	next["cities"][city_id]["reserveTroops"] = int(city.get("reserveTroops", 0)) - delta
	next["officers"][officer_id]["troops"] = target_troops
	(next["actedOfficerIds"] as Array).append(officer_id)
	_append_logs(next, "map", [
		"%s完成兵力分配：%s现统率 %d 人，城中后备兵 %d。" % [
			city["name"], officer["name"], target_troops, int(next["cities"][city_id]["reserveTroops"]),
		],
	])
	var issues := Validator.validate_runtime(next)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	return {
		"ok": true,
		"error": "",
		"next_state": GameState.new(next),
		"receipt": {
			"kind": "distribute_troops",
			"cityId": city_id,
			"officerId": officer_id,
			"targetTroops": target_troops,
			"delta": delta,
		},
	}


static func _list_available_executors_for_data(data: Dictionary, city_id: String, kind: String) -> Dictionary:
	var executor_ids: Array[String] = []
	var first_reason := "没有可执行%s的武将" % _command_label(kind)
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id := str(raw_officer_id)
		var parameters := {"cityId": city_id, "officerId": officer_id}
		if kind == "distribute_troops":
			var officer: Dictionary = data["officers"].get(officer_id, {})
			if officer.is_empty():
				continue
			var city: Dictionary = data["cities"].get(city_id, {})
			var capacity := calculate_officer_troop_capacity(officer)
			var suggested := mini(
				capacity,
				mini(
					int(officer.get("troops", 0)) + int(city.get("reserveTroops", 0)),
					int(officer.get("troops", 0)) + MAX_DISTRIBUTION_INCREASE,
				),
			)
			parameters["targetTroops"] = suggested
		var result := _availability_for_data(data, kind, parameters)
		if bool(result.get("allowed", false)):
			executor_ids.append(officer_id)
		elif executor_ids.is_empty() and str(result.get("reason", "")) != "":
			first_reason = str(result["reason"])
	return {
		"executorIds": executor_ids,
		"reason": "" if not executor_ids.is_empty() else first_reason,
	}


static func _availability_for_data(data: Dictionary, kind: String, parameters: Dictionary) -> Dictionary:
	if str(data.get("phase", "")) == "ended":
		return _unavailable("战役已经结束")
	if data.get("pendingSuccession") != null:
		return _unavailable("必须先拥立新君")
	var city_id := str(parameters.get("cityId", ""))
	var officer_id := str(parameters.get("officerId", ""))
	if city_id.is_empty() or officer_id.is_empty():
		return _unavailable("城池与执行武将均为必填")
	var city: Dictionary = data["cities"].get(city_id, {})
	if city.is_empty() or str(city.get("ownerId", "")) != str(data.get("activeFactionId", "")):
		return _unavailable("只能在己方城池执行命令")
	var officer: Dictionary = data["officers"].get(officer_id, {})
	if officer.is_empty() or officer.get("status", "") != "serving" \
			or str(officer.get("factionId", "")) != str(data.get("activeFactionId", "")) \
			or str(officer.get("cityId", "")) != city_id:
		return _unavailable("执行武将不在该城")
	if (data.get("actedOfficerIds", []) as Array).has(officer_id):
		return _unavailable("该武将本月已经执行过命令")
	if kind == "recruit_troops":
		var cost := Rulesets.get_command_cost(str(data.get("rulesetId", "")), "recruit-troops")
		var stamina_cost := int(cost.get("stamina", 12))
		if int(officer.get("stamina", 0)) < stamina_cost:
			return _unavailable("武将体力不足，需要 %d" % stamina_cost)
		var capacity := mini(calculate_recruit_capacity(city), 0xffff - int(city.get("reserveTroops", 0)))
		if capacity <= 0:
			return _unavailable("该城没有足够的金钱、民忠或后备兵容量")
		return {"allowed": true, "reason": ""}
	if kind == "distribute_troops":
		if not parameters.has("targetTroops"):
			return _unavailable("目标兵力必须是非负整数")
		if not _is_non_negative_int(parameters["targetTroops"]):
			return _unavailable("目标兵力必须是非负整数")
		var target_troops := int(parameters["targetTroops"])
		var maximum := calculate_officer_troop_capacity(officer)
		if target_troops > maximum:
			return _unavailable("该武将最多统率 %d 兵力" % maximum)
		var delta := target_troops - int(officer.get("troops", 0))
		if delta == 0:
			return _unavailable("目标兵力与当前兵力相同")
		if delta < 0:
			return _unavailable("当前仅支持从后备兵增补兵力")
		if delta > int(city.get("reserveTroops", 0)):
			return _unavailable("城中后备兵不足")
		if delta > MAX_DISTRIBUTION_INCREASE:
			return _unavailable("单次最多可为武将增补 %d 兵力" % MAX_DISTRIBUTION_INCREASE)
		return {"allowed": true, "reason": ""}
	return _unavailable("不支持的兵力命令：%s" % kind)


static func _command_label(kind: String) -> String:
	match kind:
		"recruit_troops":
			return "征兵"
		"distribute_troops":
			return "兵力分配"
	return kind


static func _append_logs(data: Dictionary, kind: String, messages: Array) -> void:
	var logs: Array = data.get("logs", [])
	var turn := int(data.get("turn", 0))
	var used := {}
	for entry: Variant in logs:
		if entry is Dictionary:
			used[str((entry as Dictionary).get("id", ""))] = true
	var serial := logs.size() + 1
	for message: Variant in messages:
		var log_id: String = "log-%d-%03d" % [turn, serial]
		while used.has(log_id):
			serial += 1
			log_id = "log-%d-%03d" % [turn, serial]
		used[log_id] = true
		serial += 1
		logs.append({
			"id": log_id,
			"kind": kind,
			"turn": turn,
			"message": str(message),
		})
	data["logs"] = logs


static func _is_positive_int(raw: Variant) -> bool:
	return _is_int_like(raw) and int(raw) > 0


static func _is_non_negative_int(raw: Variant) -> bool:
	return _is_int_like(raw) and int(raw) >= 0


static func _is_int_like(raw: Variant) -> bool:
	return (typeof(raw) == TYPE_INT or typeof(raw) == TYPE_FLOAT) \
			and is_finite(float(raw)) \
			and floor(float(raw)) == float(raw)


static func _unavailable(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason}


static func _failure(error: String) -> Dictionary:
	return {"ok": false, "error": error, "receipt": {}}
