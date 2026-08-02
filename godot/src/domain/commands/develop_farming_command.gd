extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const CoreLcg = preload("res://src/domain/random/core_lcg.gd")
const Rulesets = preload("res://src/domain/rules/campaign_rulesets.gd")

const JS_MAX_SAFE_INTEGER: int = 9_007_199_254_740_991
const UINT32_MASK: int = 0xffff_ffff


static func execute(state: GameState, city_id: String, officer_id: String) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var input_issues: Array[Dictionary] = Validator.validate(before)
	if not input_issues.is_empty():
		return _failure(Validator.first_error(input_issues))

	var availability: Dictionary = _availability_for_data(before, city_id, officer_id)
	if not availability["allowed"]:
		return _failure(availability["reason"])

	# This is deliberately the first RNG operation. Every structural and command
	# precondition above is deterministic and leaves the seed untouched on failure.
	var random_step: Dictionary = CoreLcg.next_random(int(before["rngSeed"]))
	var city: Dictionary = availability["city"]
	var officer: Dictionary = availability["officer"]
	var cost: Dictionary = availability["cost"]
	var effective_intelligence: int = _effective_intelligence(before, officer)
	var unsigned_intelligence: int = effective_intelligence & UINT32_MASK
	var random_factor: int = int(floor(float(random_step["value"]) * 4.0)) + 2
	var calculated_gain: int = int(floor(float(effective_intelligence) / 10.0)) * random_factor \
		+ (unsigned_intelligence >> 1)
	var farming: int = int(city["farming"])
	var available_growth: int = JS_MAX_SAFE_INTEGER - farming
	if city.has("farmingLimit"):
		available_growth = maxi(0, int(city["farmingLimit"]) - farming)
	var gain: int = mini(available_growth, calculated_gain)

	var next_data: Dictionary = before.duplicate(true)
	var next_city: Dictionary = city.duplicate(true)
	next_city["farming"] = farming + gain
	next_city["money"] = int(city["money"]) - int(cost["money"])
	var next_cities: Dictionary = next_data["cities"]
	next_cities[city_id] = next_city
	next_data["cities"] = next_cities

	var next_officer: Dictionary = officer.duplicate(true)
	next_officer["stamina"] = int(officer["stamina"]) - int(cost["stamina"])
	var next_officers: Dictionary = next_data["officers"]
	next_officers[officer_id] = next_officer
	next_data["officers"] = next_officers

	next_data["rngSeed"] = int(random_step["seed"])
	next_data["campaignStarted"] = true
	var acted_officer_ids: Array = (next_data["actedOfficerIds"] as Array).duplicate(true)
	acted_officer_ids.append(officer_id)
	next_data["actedOfficerIds"] = acted_officer_ids

	var message: String = "%s在%s主持开垦，农业提高 %d，消耗金钱 %d、体力 %d。" % [
		officer["name"],
		city["name"],
		gain,
		int(cost["money"]),
		int(cost["stamina"]),
	]
	var appended_log: Dictionary = _build_log(next_data, "map", message)
	var next_logs: Array = (next_data["logs"] as Array).duplicate(true)
	next_logs.append(appended_log)
	next_data["logs"] = next_logs

	var output_issues: Array[Dictionary] = Validator.validate(next_data)
	if not output_issues.is_empty():
		return _failure(Validator.first_error(output_issues))

	var next_state: GameState = GameState.new(next_data)
	var receipt: Dictionary = {
		"gain": gain,
		"costs": {
			"money": int(cost["money"]),
			"stamina": int(cost["stamina"]),
		},
		"state": {
			"turn": int(next_data["turn"]),
			"rngSeed": int(next_data["rngSeed"]),
			"campaignStarted": next_data["campaignStarted"],
			"actedOfficerIds": acted_officer_ids.duplicate(true),
			"logCount": next_logs.size(),
		},
		"city": {
			"id": city_id,
			"resources": {
				"farming": int(next_city["farming"]),
				"money": int(next_city["money"]),
			},
		},
		"officer": {
			"id": officer_id,
			"stamina": int(next_officer["stamina"]),
		},
		"appendedLog": appended_log.duplicate(true),
	}
	return {
		"ok": true,
		"error": "",
		"next_state": next_state,
		"receipt": receipt,
	}


static func get_availability(state: GameState, city_id: String, officer_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate(data)
	if not issues.is_empty():
		return {"allowed": false, "reason": Validator.first_error(issues)}
	var result: Dictionary = _availability_for_data(data, city_id, officer_id)
	return {
		"allowed": result["allowed"],
		"reason": result.get("reason", ""),
	}


static func _availability_for_data(data: Dictionary, city_id: String, officer_id: String) -> Dictionary:
	if data["phase"] == "ended":
		return _unavailable("战役已经结束")
	if data.has("pendingSuccession") and data["pendingSuccession"] != null:
		return _unavailable("必须先拥立新君")
	var cities: Dictionary = data["cities"]
	if not cities.has(city_id):
		return _unavailable("未知城池：%s" % city_id)
	var city: Dictionary = cities[city_id]
	if city["ownerId"] != data["activeFactionId"]:
		return _unavailable("只能在己方城池执行命令")

	var officers: Dictionary = data["officers"]
	if not officers.has(officer_id):
		return _unavailable("未知武将：%s" % officer_id)
	var officer: Dictionary = officers[officer_id]
	if officer["status"] != "serving" \
			or officer["factionId"] != data["activeFactionId"] \
			or officer.get("cityId", "") != city_id:
		return _unavailable("执行武将不在该城")
	var acted_ids: Array = data["actedOfficerIds"]
	if acted_ids.has(officer_id):
		return _unavailable("该武将本月已经执行过命令")

	var cost: Dictionary = Rulesets.get_develop_cost(data["rulesetId"])
	if cost.is_empty():
		return _unavailable("不支持的规则集：%s" % data["rulesetId"])
	if int(officer["stamina"]) < int(cost["stamina"]):
		return _unavailable("武将体力不足，需要 %d" % int(cost["stamina"]))
	if int(city["money"]) < int(cost["money"]):
		return _unavailable("城中金钱不足，需要 %d" % int(cost["money"]))
	if city.has("farmingLimit") and int(city["farming"]) >= int(city["farmingLimit"]):
		return _unavailable("该城农业已经达到上限")
	if not city.has("farmingLimit") and int(city["farming"]) >= JS_MAX_SAFE_INTEGER:
		return _unavailable("该城农业已经达到安全上限")
	return {
		"allowed": true,
		"reason": "",
		"city": city,
		"officer": officer,
		"cost": cost,
	}


static func _effective_intelligence(data: Dictionary, officer: Dictionary) -> int:
	var intelligence: int = int(officer["intelligence"])
	var item_record: Dictionary = data["items"]
	var equipment: Array = officer["equipmentItemIds"]
	for raw_item_id: Variant in equipment:
		var item_id: String = raw_item_id
		var item: Dictionary = item_record[item_id]
		intelligence += int(item["intelligenceBonus"])
	return intelligence


static func _build_log(data: Dictionary, kind: String, message: String) -> Dictionary:
	var logs: Array = data["logs"]
	var used_ids: Dictionary = {}
	for raw_log: Variant in logs:
		var log_entry: Dictionary = raw_log
		used_ids[log_entry["id"]] = true
	var serial: int = logs.size() + 1
	var log_id: String = "log-%d-%03d" % [int(data["turn"]), serial]
	while used_ids.has(log_id):
		serial += 1
		log_id = "log-%d-%03d" % [int(data["turn"]), serial]
	return {
		"id": log_id,
		"kind": kind,
		"message": message,
		"turn": int(data["turn"]),
	}


static func _unavailable(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason}


static func _failure(reason: String) -> Dictionary:
	return {
		"ok": false,
		"error": reason,
		"receipt": {},
	}
