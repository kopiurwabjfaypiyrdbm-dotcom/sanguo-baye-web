class_name TacticalBattleSettlement
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const CoreLcg = preload("res://src/domain/random/core_lcg.gd")
const TacticalCommands = preload("res://src/domain/tactical/battle_commands.gd")
const DiplomaticOrders = preload("res://src/domain/commands/diplomatic_order_commands.gd")
const OfficerLifecycle = preload("res://src/domain/progression/officer_lifecycle.gd")
const CampaignOutcome = preload("res://src/domain/progression/campaign_outcome.gd")

const RESULT_KEYS: Array[String] = [
	"battleId", "turn", "seedBefore", "nextRngSeed", "sourceCityId", "targetCityId",
	"attackerFactionId", "defenderFactionId", "attackerOfficerIds", "defenderOfficerIds",
	"provisions", "winner", "attackerScore", "defenderScore", "casualties", "experienceGains", "experienceGainOrder",
	"defenderReserveLosses", "cityCaptured", "guard", "targetFoodAfter", "logs",
]

## Strategic application boundary for a terminal tactical result.
## The tactical snapshot is data; this function is the only place that mutates
## the campaign projection and it returns a fresh GameState.

static func apply(state: GameState, result: Dictionary) -> Dictionary:
	var before := state.snapshot()
	var before_digest := _digest(before)
	var issues := Validator.validate_runtime(before)
	if not issues.is_empty(): return _failure(before_digest, Validator.first_error(issues))
	var checked := _validate_result(before, result)
	if not checked.get("ok", false): return _failure(before_digest, String(checked.get("error", "战后结果无效")))
	var source: Dictionary = before["cities"][result["sourceCityId"]]
	var target: Dictionary = before["cities"][result["targetCityId"]]
	var next := before.duplicate(true)
	var officers: Dictionary = next["officers"]
	for officer_id: String in _sorted_keys(result.get("casualties", {})):
		var officer: Dictionary = officers[officer_id].duplicate(true)
		officer["troops"] = maxi(0, int(officer.get("troops", 0)) - int(result["casualties"][officer_id]))
		officer["stamina"] = 0
		officers[officer_id] = officer
	var growth_messages: Array[String] = []
	var experience_ids: Array[String] = _ordered_experience_ids(result)
	for officer_id: String in experience_ids:
		var gained := int(result["experienceGains"][officer_id])
		if gained <= 0 or not officers.has(officer_id): continue
		var officer: Dictionary = officers[officer_id].duplicate(true)
		var growth := _apply_experience(int(officer.get("level", 1)), int(officer.get("experience", 0)), gained)
		officer["level"] = growth["level"]; officer["experience"] = growth["experience"]; officers[officer_id] = officer
		growth_messages.append("%s获得 %d 点经验%s。" % [officer.get("name", officer_id), gained, "，升至 %d 级" % int(growth["level"]) if int(growth["levelsGained"]) > 0 else ""])
	next["officers"] = officers
	var cities: Dictionary = next["cities"]
	var next_source: Dictionary = source.duplicate(true); next_source["food"] = int(source["food"]) - int(result["provisions"]); cities[source["id"]] = next_source
	var next_target: Dictionary = target.duplicate(true)
	next_target["farming"] = int(target["farming"]) - floori(float(target["farming"]) / 20.0)
	next_target["commerce"] = int(target["commerce"]) - floori(float(target["commerce"]) / 20.0)
	next_target["money"] = int(target["money"]) - floori(float(target["money"]) / 20.0)
	if target.has("publicLoyalty"): next_target["publicLoyalty"] = int(target["publicLoyalty"]) - floori(float(target["publicLoyalty"]) / 10.0)
	next_target["reserveTroops"] = maxi(0, int(target["reserveTroops"]) - int(result["defenderReserveLosses"]))
	if result.has("targetFoodAfter"): next_target["food"] = int(result["targetFoodAfter"])
	if bool(result.get("cityCaptured", false)):
		next_target["ownerId"] = result["attackerFactionId"]
		for officer_id: Variant in result.get("attackerOfficerIds", []):
			if officers.has(String(officer_id)): officers[String(officer_id)]["cityId"] = target["id"]
	cities[target["id"]] = next_target; next["cities"] = cities
	next = OfficerLifecycle.update_city_satraps(next)
	officers = next["officers"]
	cities = next["cities"]
	next["campaignStarted"] = true
	var capture_seed := int(result["nextRngSeed"])
	var acted: Array = next.get("actedOfficerIds", []).duplicate(true)
	for raw_id: Variant in result.get("attackerOfficerIds", []): acted.append(String(raw_id))
	next["actedOfficerIds"] = acted
	var messages: Array[String] = []
	for raw_message: Variant in result.get("logs", []): messages.append(String(raw_message))
	messages.append_array(growth_messages)
	messages.append("%s经此战农业、商业与金钱各损耗二十分之一，民忠损耗十分之一。" % target["name"])
	if not bool(result.get("cityCaptured", false)) and not bool(before["factions"].get(result["defenderFactionId"], {}).get("isNeutral", false)):
		var cities_for_escape: Array[Dictionary] = []
		for raw_city_id: Variant in cities.keys():
			var candidate: Dictionary = cities[raw_city_id]
			if candidate.get("ownerId") == result["attackerFactionId"]: cities_for_escape.append(candidate)
		cities_for_escape.sort_custom(_compare_cities)
		for raw_officer_id: Variant in result.get("attackerOfficerIds", []):
			var officer_id := String(raw_officer_id)
			if not officers.has(officer_id): continue
			var officer: Dictionary = officers[officer_id]
			var first := CoreLcg.next_random(capture_seed); capture_seed = int(first["seed"])
			var roll := floori(float(first["value"]) * 100.0)
			if roll <= _effective_intelligence(next, officer) and not cities_for_escape.is_empty():
				var destination_roll := CoreLcg.next_random(capture_seed); capture_seed = int(destination_roll["seed"])
				var destination_index := mini(cities_for_escape.size() - 1, floori(float(destination_roll["value"]) * cities_for_escape.size()))
				officer["cityId"] = cities_for_escape[destination_index]["id"]; officers[officer_id] = officer
				messages.append("%s突围退往%s。" % [officer.get("name", officer_id), cities_for_escape[destination_index]["name"]])
			else:
				var captured := OfficerLifecycle.capture_officer_data(next, {"officerId": officer_id, "captorFactionId": result["defenderFactionId"], "cityId": target["id"]})
				if not captured["ok"]: return _failure(before_digest, String(captured["error"]))
				next = captured["next"]; officers = next["officers"]; cities = next["cities"]
				messages.append("%s兵败被俘，暂押于%s。" % [officer.get("name", officer_id), target["name"]])
	if bool(result.get("cityCaptured", false)):
		for raw_id: Variant in next["officerOrder"]:
			var held_id := String(raw_id)
			var held: Dictionary = officers.get(held_id, {})
			if held.get("status") != "captive" or held.get("cityId") != target["id"]: continue
			var restored := held.duplicate(true)
			if String(held.get("formerFactionId", "")) == String(result["attackerFactionId"]):
				restored["status"] = "serving"; restored["factionId"] = result["attackerFactionId"]
				restored.erase("captorFactionId"); restored.erase("formerFactionId")
				restored["cityId"] = target["id"]; restored["troops"] = 0; restored["stamina"] = 0
				officers[held_id] = restored
				messages.append("%s随%s被收复，重归%s。" % [held.get("name", held_id), target["name"], before["factions"][result["attackerFactionId"]]["name"]])
			else:
				restored["captorFactionId"] = result["attackerFactionId"]; officers[held_id] = restored
				messages.append("%s随%s易手，改由%s羁押。" % [held.get("name", held_id), target["name"], before["factions"][result["attackerFactionId"]]["name"]])
		next["officers"] = officers
		next = OfficerLifecycle.update_city_satraps(next); officers = next["officers"]; cities = next["cities"]
		var escape_cities: Array[Dictionary] = []
		for raw_city_id: Variant in cities.keys():
			var candidate: Dictionary = cities[raw_city_id]
			if candidate.get("ownerId") == result["defenderFactionId"]: escape_cities.append(candidate)
		escape_cities.sort_custom(_compare_cities)
		var participant_ids: Dictionary = {}
		for raw_id: Variant in result["defenderOfficerIds"]: participant_ids[String(raw_id)] = true
		var lifecycle_results: Array[Dictionary] = []
		for raw_id: Variant in result["defenderOfficerIds"]:
			var officer_id := String(raw_id)
			var officer: Dictionary = officers.get(officer_id, {})
			if officer.is_empty() or officer.get("status") != "serving" or officer.get("cityId") != target["id"]: continue
			var first := CoreLcg.next_random(capture_seed); capture_seed = int(first["seed"])
			var roll := floori(float(first["value"]) * 100.0)
			var effective_intelligence := _effective_intelligence(next, officer)
			if roll <= effective_intelligence and not escape_cities.is_empty():
				var destination_roll := CoreLcg.next_random(capture_seed); capture_seed = int(destination_roll["seed"])
				var destination_index := mini(escape_cities.size() - 1, floori(float(destination_roll["value"]) * escape_cities.size()))
				officer["cityId"] = escape_cities[destination_index]["id"]; officers[officer_id] = officer
				messages.append("%s突围退往%s。" % [officer.get("name", officer_id), escape_cities[destination_index]["name"]])
			elif roll == 0 and String(before.get("lifecyclePolicy", {}).get("battleDeath", "disabled")) == "baye-rare":
				lifecycle_results.append({"kind": "dead", "officerId": officer_id})
			else:
				lifecycle_results.append({"kind": "captured", "officerId": officer_id})
		for raw_id: Variant in next["officerOrder"]:
			var officer_id := String(raw_id)
			if participant_ids.has(officer_id): continue
			var officer: Dictionary = officers[officer_id]
			if officer.get("status") != "serving" or officer.get("factionId") != result["defenderFactionId"] or officer.get("cityId") != target["id"]: continue
			if String(before["factions"].get(result["defenderFactionId"], {}).get("rulerOfficerId", "")) == officer_id:
				lifecycle_results.append({"kind": "captured", "officerId": officer_id})
				continue
			var released := officer.duplicate(true); released["status"] = "free"; released["factionId"] = _neutral_faction_id(next["factions"]); released["troops"] = 0; released["stamina"] = 0; officers[officer_id] = released
			messages.append("%s在%s陷落后成为在野人物。" % [officer.get("name", officer_id), target["name"]])
		lifecycle_results.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
			var left_id := String(left["officerId"]); var right_id := String(right["officerId"])
			var left_ruler := String(before["factions"].get(result["defenderFactionId"], {}).get("rulerOfficerId", "")) == left_id
			var right_ruler := String(before["factions"].get(result["defenderFactionId"], {}).get("rulerOfficerId", "")) == right_id
			if left_ruler != right_ruler: return not left_ruler
			return left_id < right_id
		)
		for lifecycle: Dictionary in lifecycle_results:
			var officer_id := String(lifecycle["officerId"]); var officer: Dictionary = officers[officer_id]
			if lifecycle["kind"] == "dead":
				var killed := OfficerLifecycle.kill_officer_data(next, {"officerId": officer_id, "cause": "battle-death", "cityId": target["id"], "responsibleFactionId": result["attackerFactionId"]})
				if not killed["ok"]: return _failure(before_digest, String(killed["error"]))
				next = killed["next"]; officers = next["officers"]; cities = next["cities"]
				messages.append("%s兵败战死，遗留装备由%s收存。" % [officer.get("name", officer_id), target["name"]])
			else:
				var captured := OfficerLifecycle.capture_officer_data(next, {"officerId": officer_id, "captorFactionId": result["attackerFactionId"], "cityId": target["id"]})
				if not captured["ok"]: return _failure(before_digest, String(captured["error"]))
				next = captured["next"]; officers = next["officers"]; cities = next["cities"]
				messages.append("%s兵败被俘，暂押于%s。" % [officer.get("name", officer_id), target["name"]])
		var defender_has_city := false
		for raw_city_id: Variant in cities.keys():
			if cities[raw_city_id].get("ownerId") == result["defenderFactionId"]: defender_has_city = true; break
		if not defender_has_city: messages.append("%s失去最后一座城池，所属武将转为在野。" % before["factions"][result["defenderFactionId"]]["name"])
	next["rngSeed"] = capture_seed
	next["officers"] = officers
	var released := DiplomaticOrders.release_landless_faction_officers(next)
	if not released["ok"]: return _failure(before_digest, String(released["error"]))
	next = released["next"]
	next = OfficerLifecycle.update_city_satraps(next)
	_append_logs(next, messages)
	var outcome := CampaignOutcome.evaluate(GameState.new(next))
	if not outcome["ok"]: return _failure(before_digest, String(outcome["error"]))
	next = outcome["next_state"].snapshot()
	var output_issues := Validator.validate_runtime(next)
	if not output_issues.is_empty(): return _failure(before_digest, Validator.first_error(output_issues))
	var after_digest := _digest(next)
	return {"ok": true, "error": "", "next_state": GameState.new(next), "receipt": {"kind": "settle_tactical_battle", "battleId": result["battleId"], "winner": result["winner"], "cityCaptured": result["cityCaptured"], "beforeStateSha256": before_digest, "afterStateSha256": after_digest, "appendedLogs": messages}}


static func _validate_result(state: Dictionary, result: Dictionary) -> Dictionary:
	if typeof(result) != TYPE_DICTIONARY:
		return {"ok": false, "error": "战后结果必须是对象"}
	for raw_key: Variant in result.keys():
		if not RESULT_KEYS.has(String(raw_key)): return {"ok": false, "error": "战后结果包含未知字段：%s" % String(raw_key)}
	for key: String in ["battleId", "turn", "sourceCityId", "targetCityId", "attackerFactionId", "defenderFactionId", "winner", "provisions", "seedBefore", "nextRngSeed", "attackerOfficerIds", "defenderOfficerIds", "attackerScore", "defenderScore", "casualties", "experienceGains", "defenderReserveLosses", "cityCaptured", "guard", "logs"]:
		if not result.has(key): return {"ok": false, "error": "战后结果缺少 %s" % key}
	for key: String in ["attackerOfficerIds", "defenderOfficerIds", "logs"]:
		if typeof(result[key]) != TYPE_ARRAY: return {"ok": false, "error": "战后结果 %s 必须是数组" % key}
	for key: String in ["casualties", "experienceGains", "guard"]:
		if typeof(result[key]) != TYPE_DICTIONARY: return {"ok": false, "error": "战后结果 %s 必须是对象" % key}
	if typeof(result["cityCaptured"]) != TYPE_BOOL: return {"ok": false, "error": "战后结果 cityCaptured 无效"}
	for key: String in ["turn", "provisions", "seedBefore", "nextRngSeed", "defenderReserveLosses", "attackerScore", "defenderScore"]:
		if not _is_safe_integer(result[key]): return {"ok": false, "error": "战后结果 %s 必须是安全整数" % key}
	if result.has("targetFoodAfter") and not _is_safe_integer(result["targetFoodAfter"]): return {"ok": false, "error": "战后结果 targetFoodAfter 必须是安全整数"}
	for raw_id: Variant in result["attackerOfficerIds"] + result["defenderOfficerIds"]:
		if typeof(raw_id) != TYPE_STRING or String(raw_id).is_empty(): return {"ok": false, "error": "战后参战武将 ID 无效"}
	for raw_log: Variant in result["logs"]:
		if typeof(raw_log) != TYPE_STRING: return {"ok": false, "error": "战后 logs 必须是字符串数组"}
	for raw_officer_id: Variant in result["experienceGains"].keys():
		if typeof(raw_officer_id) != TYPE_STRING or not _is_safe_integer(result["experienceGains"][raw_officer_id]) or int(result["experienceGains"][raw_officer_id]) < 0:
			return {"ok": false, "error": "战后经验变化无效"}
	if result.has("experienceGainOrder"):
		if typeof(result["experienceGainOrder"]) != TYPE_ARRAY: return {"ok": false, "error": "战后 experienceGainOrder 必须是数组"}
		var seen_experience_ids: Dictionary = {}
		for raw_id: Variant in result["experienceGainOrder"]:
			if typeof(raw_id) != TYPE_STRING or seen_experience_ids.has(String(raw_id)) or not result["experienceGains"].has(String(raw_id)):
				return {"ok": false, "error": "战后 experienceGainOrder 无效"}
			seen_experience_ids[String(raw_id)] = true
		for raw_id: Variant in result["experienceGains"].keys():
			if not seen_experience_ids.has(String(raw_id)): return {"ok": false, "error": "战后 experienceGainOrder 缺少经验武将"}
	if not ["attacker", "defender"].has(String(result.get("winner", ""))): return {"ok": false, "error": "战后胜方无效"}
	if int(state.get("turn", -1)) != int(result["turn"]) or int(state.get("rngSeed", -1)) != int(result["seedBefore"]): return {"ok": false, "error": "战后结果与当前状态不匹配"}
	var source: Dictionary = state["cities"].get(result["sourceCityId"], {}); var target: Dictionary = state["cities"].get(result["targetCityId"], {})
	if source.is_empty() or target.is_empty(): return {"ok": false, "error": "战后结果引用未知城池"}
	var officer_ids: Array[String] = []
	for raw_id: Variant in result["attackerOfficerIds"]: officer_ids.append(String(raw_id))
	var expected_battle_id := "%d:%d:%s:%s:%s:%d" % [int(state["turn"]), int(state["rngSeed"]), String(result["sourceCityId"]), String(result["targetCityId"]), ",".join(officer_ids), int(result["provisions"])]
	if String(result["battleId"]) != expected_battle_id: return {"ok": false, "error": "战后结果 battleId 与当前战役不一致"}
	if source.get("ownerId") != result["attackerFactionId"] or target.get("ownerId") != result["defenderFactionId"]: return {"ok": false, "error": "战后结果引用过期城池归属"}
	var guard: Dictionary = result["guard"]
	var guard_shape := _validate_guard_shape(guard)
	if not guard_shape.is_empty(): return {"ok": false, "error": guard_shape}
	if int(guard.get("version", -1)) != 2 or guard.get("sourceCityId") != source["id"] or guard.get("targetCityId") != target["id"]: return {"ok": false, "error": "战后结果 guard 无效"}
	var expected_fingerprint := TacticalCommands.strategic_fingerprint(state)
	if String(guard.get("strategicFingerprint", "")) != expected_fingerprint: return {"ok": false, "error": "战后结果 strategicFingerprint 已过期"}
	if int(guard.get("sourceFood", -1)) != int(source["food"]) or int(guard.get("targetFood", -1)) != int(target["food"]) or int(guard.get("targetDefense", -1)) != int(target["defense"]) or int(guard.get("targetReserveTroops", -1)) != int(target["reserveTroops"]): return {"ok": false, "error": "战后结果引用过期资源"}
	if int(result["provisions"]) <= 0 or int(result["defenderReserveLosses"]) < 0 or int(result["defenderReserveLosses"]) > int(target["reserveTroops"]): return {"ok": false, "error": "战后资源变化无效"}
	if bool(result.get("cityCaptured", false)) != (String(result["winner"]) == "attacker"): return {"ok": false, "error": "战后胜方与占城结果不一致"}
	var current_participants: Array[String] = []
	for raw_id: Variant in state.get("officerOrder", []):
		var current_id := String(raw_id)
		var current: Dictionary = state["officers"].get(current_id, {})
		if current.get("status") == "serving" and (current.get("cityId") == source["id"] or current.get("cityId") == target["id"]): current_participants.append(current_id)
	var guarded_participants: Dictionary = {}
	for raw_participant: Variant in guard.get("participants", []):
		if typeof(raw_participant) != TYPE_DICTIONARY: return {"ok": false, "error": "战后结果 guard participant 无效"}
		var participant: Dictionary = raw_participant
		var participant_id := String(participant.get("officerId", ""))
		if participant_id.is_empty() or guarded_participants.has(participant_id): return {"ok": false, "error": "战后结果 guard participant 重复或缺少 ID"}
		guarded_participants[participant_id] = participant
	current_participants.sort()
	var guarded_ids: Array[String] = []
	for raw_id: Variant in guarded_participants.keys(): guarded_ids.append(String(raw_id))
	guarded_ids.sort()
	if current_participants != guarded_ids: return {"ok": false, "error": "战后结果 guard participant 集合已过期"}
	for participant_id: String in current_participants:
		var expected_participant: Dictionary = TacticalCommands.participant_snapshot(state, state["officers"][participant_id])
		if not _participant_matches(guarded_participants[participant_id], expected_participant): return {"ok": false, "error": "战后结果 guard participant 已变化：%s" % participant_id}
	var combatant_ids: Dictionary = {}
	for raw_id: Variant in result["attackerOfficerIds"] + result["defenderOfficerIds"]:
		var combatant_id := String(raw_id)
		if combatant_id.is_empty() or combatant_ids.has(combatant_id): return {"ok": false, "error": "战后结果参战武将重复或无效"}
		combatant_ids[combatant_id] = true
		if not guarded_participants.has(combatant_id): return {"ok": false, "error": "战后结果参战武将不在 guard 中：%s" % combatant_id}
	for raw_id: Variant in result["casualties"].keys():
		var casualty_id := String(raw_id)
		if not combatant_ids.has(casualty_id): return {"ok": false, "error": "战后结果包含非参战伤亡：%s" % casualty_id}
		if not _is_safe_integer(result["casualties"][raw_id]): return {"ok": false, "error": "战后伤亡必须是安全整数：%s" % casualty_id}
	for officer_id: String in _sorted_keys(result.get("casualties", {})):
		if not state["officers"].has(officer_id): return {"ok": false, "error": "战后结果引用未知武将：%s" % officer_id}
		if int(result["casualties"][officer_id]) < 0: return {"ok": false, "error": "战后伤亡无效"}
		if int(result["casualties"][officer_id]) > int(guarded_participants[officer_id].get("troops", 0)): return {"ok": false, "error": "战后伤亡超过参战兵力：%s" % officer_id}
	for combatant_id: String in combatant_ids.keys():
		if not result["casualties"].has(combatant_id): return {"ok": false, "error": "战后结果缺少参战伤亡：%s" % combatant_id}
	return {"ok": true}


static func _validate_guard_shape(guard: Dictionary) -> String:
	var expected := ["version", "strategicFingerprint", "sourceCityId", "targetCityId", "sourceFood", "targetFood", "targetDefense", "targetReserveTroops", "participants"]
	for raw_key: Variant in guard.keys():
		if not expected.has(String(raw_key)): return "战后结果 guard 包含未知字段：%s" % String(raw_key)
	for key: String in expected:
		if not guard.has(key): return "战后结果 guard 缺少 %s" % key
	for key: String in ["version", "sourceFood", "targetFood", "targetDefense", "targetReserveTroops"]:
		if not _is_safe_integer(guard[key]): return "战后结果 guard %s 必须是安全整数" % key
	for key: String in ["strategicFingerprint", "sourceCityId", "targetCityId"]:
		if typeof(guard[key]) != TYPE_STRING or String(guard[key]).is_empty(): return "战后结果 guard %s 无效" % key
	if typeof(guard["participants"]) != TYPE_ARRAY: return "战后结果 guard participants 必须是数组"
	var participant_keys := ["officerId", "cityId", "factionId", "status", "troops", "stamina", "force", "intelligence", "leadership", "level", "experience", "armsTypeId", "equipmentKey", "equipmentKeyEncoding", "armsAttackModifier", "armsDefenseModifier", "armsMobility", "itemForceBonus", "itemIntelligenceBonus", "itemMoveBonus"]
	for raw_participant: Variant in guard["participants"]:
		if typeof(raw_participant) != TYPE_DICTIONARY: return "战后结果 guard participant 必须是对象"
		var participant: Dictionary = raw_participant
		for raw_key: Variant in participant.keys():
			if not participant_keys.has(String(raw_key)): return "战后结果 guard participant 包含未知字段：%s" % String(raw_key)
		for key: String in participant_keys:
			if not participant.has(key): return "战后结果 guard participant 缺少 %s" % key
		for key: String in ["officerId", "cityId", "factionId", "status", "armsTypeId", "equipmentKey", "equipmentKeyEncoding"]:
			if typeof(participant[key]) != TYPE_STRING: return "战后结果 guard participant %s 类型无效" % key
		for key: String in ["troops", "stamina", "force", "intelligence", "leadership", "level", "experience", "itemForceBonus", "itemIntelligenceBonus", "itemMoveBonus"]:
			if not _is_safe_integer(participant[key]): return "战后结果 guard participant %s 必须是安全整数" % key
		for key: String in ["armsAttackModifier", "armsDefenseModifier"]:
			if not _is_finite_number(participant[key]): return "战后结果 guard participant %s 必须是数字" % key
	return ""


static func _participant_matches(actual: Dictionary, expected: Dictionary) -> bool:
	for key: String in expected.keys():
		if not actual.has(key) or actual[key] != expected[key]: return false
	return true


static func _effective_intelligence(state: Dictionary, officer: Dictionary) -> int:
	return int(TacticalCommands.effective_officer_attributes(state, officer).get("intelligence", officer.get("intelligence", 0)))


static func _neutral_faction_id(factions: Dictionary) -> String:
	for faction_id: String in _sorted_keys(factions):
		if bool(factions[faction_id].get("isNeutral", false)): return faction_id
	return "neutral"


static func _append_logs(data: Dictionary, messages: Array[String]) -> void:
	var logs: Array = data["logs"]
	var used: Dictionary = {}
	for raw_log: Variant in logs: used[String(raw_log.get("id", ""))] = true
	var serial := logs.size() + 1
	for message: String in messages:
		var log_id := "log-%d-%03d" % [int(data["turn"]), serial]
		while used.has(log_id): serial += 1; log_id = "log-%d-%03d" % [int(data["turn"]), serial]
		logs.append({"id": log_id, "kind": "battle", "message": message, "turn": int(data["turn"])})
		used[log_id] = true; serial += 1


static func _apply_experience(level: int, experience: int, gained: int) -> Dictionary:
	var next_level := maxi(0, level); var next_experience := maxi(0, experience) + maxi(0, gained); var levels := 0
	while next_experience >= 100 and next_level < 20: next_experience -= 100; next_level += 1; levels += 1
	if next_level >= 20: next_experience = posmod(next_experience, 100)
	return {"level": next_level, "experience": next_experience, "levelsGained": levels}


static func _sorted_keys(value: Dictionary) -> Array:
	var result: Array = []
	for raw_key: Variant in value.keys(): result.append(String(raw_key))
	result.sort(); return result


static func _ordered_experience_ids(result: Dictionary) -> Array[String]:
	var ordered: Array[String] = []
	if typeof(result.get("experienceGainOrder")) == TYPE_ARRAY:
		for raw_id: Variant in result["experienceGainOrder"]: ordered.append(String(raw_id))
	for raw_id: Variant in _sorted_keys(result.get("experienceGains", {})):
		if not ordered.has(String(raw_id)): ordered.append(String(raw_id))
	return ordered


static func _compare_cities(left: Dictionary, right: Dictionary) -> bool:
	var left_index := int(left.get("sourceIndex", 9_007_199_254_740_991)); var right_index := int(right.get("sourceIndex", 9_007_199_254_740_991))
	return left_index < right_index or (left_index == right_index and String(left.get("id", "")) < String(right.get("id", "")))


static func _digest(value: Variant) -> String:
	var result := Canonical.try_sha256(value)
	return String(result.get("value", ""))


static func _failure(before_digest: String, error: String) -> Dictionary:
	return {"ok": false, "error": error, "next_state": null, "receipt": {"kind": "settle_tactical_battle"}, "beforeStateSha256": before_digest, "afterStateSha256": before_digest}


static func _is_integer(value: Variant) -> bool:
	return (typeof(value) == TYPE_INT or typeof(value) == TYPE_FLOAT) and is_finite(float(value)) and floor(float(value)) == float(value)


static func _is_safe_integer(value: Variant) -> bool:
	return _is_integer(value) and abs(float(value)) <= 9_007_199_254_740_991.0


static func _is_finite_number(value: Variant) -> bool:
	return (typeof(value) == TYPE_INT or typeof(value) == TYPE_FLOAT) and is_finite(float(value))
