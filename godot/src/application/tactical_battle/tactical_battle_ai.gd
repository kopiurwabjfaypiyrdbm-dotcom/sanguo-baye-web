class_name TacticalBattleAi
extends RefCounted

## MB17 bounded tactical-AI orchestration.
## The policy is deliberately small but follows the Web action ordering: rally,
## attack, move, then wait. Commands still pass through the
## application session envelope; the final side handoff is an explicit,
## deterministic orchestration step.
const BattleState = preload("res://src/domain/tactical/battle_state.gd")
const BattleAttack = preload("res://src/domain/tactical/battle_attack.gd")
const BattleSkill = preload("res://src/domain/tactical/battle_skill.gd")
const Battlefield = preload("res://src/domain/tactical/battlefield.gd")
const BattleValidator = preload("res://src/domain/tactical/battle_validator.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const Session = preload("res://src/application/tactical_battle/tactical_battle_session.gd")


static func run_active_side(snapshot: Dictionary) -> Dictionary:
	var session := Session.from_snapshot(snapshot)
	if session == null: return {"ok": false, "error": "战术 AI 无法恢复战斗状态", "trace": [], "battle": snapshot.duplicate(true)}
	var trace: Array = []
	var unit_ids := _ordered_unit_ids(snapshot)
	while session.snapshot().get("status") == "ongoing":
		var current: Dictionary = session.snapshot()
		var unit_id := _next_unacted_unit(current, unit_ids)
		if unit_id.is_empty(): break
		var command := _choose_command(current, unit_id, trace.size())
		var result: Dictionary = session.execute(command)
		trace.append({"command": command, "result": result.duplicate(true)})
		if not bool(result.get("ok", false)):
			return {"ok": false, "error": String(result.get("error", "战术 AI 命令失败")), "trace": trace, "battle": session.snapshot()}
		if session.snapshot().get("status") != "ongoing": break
	var final_snapshot := _finish_active_side(session)
	var issues := BattleValidator.validate(final_snapshot)
	if not issues.is_empty(): return {"ok": false, "error": BattleValidator.first_error(issues), "trace": trace, "battle": final_snapshot}
	return {"ok": true, "error": "", "trace": trace, "battle": final_snapshot}


static func _next_unacted_unit(snapshot: Dictionary, unit_ids: Array) -> String:
	for raw_id: Variant in unit_ids:
		var unit_id := String(raw_id)
		var unit: Dictionary = snapshot.get("units", {}).get(unit_id, {})
		if not unit.is_empty() and int(unit.get("troops", 0)) > 0 and not bool(unit.get("acted", false)): return unit_id
	return ""


static func _choose_command(snapshot: Dictionary, unit_id: String, ordinal: int) -> Dictionary:
	var digest_result: Dictionary = Canonical.try_sha256(snapshot)
	var digest := String(digest_result.get("value", ""))
	var skill := _choose_skill(snapshot, unit_id)
	if not skill.is_empty():
		return {"commandEnvelopeVersion": 1, "commandId": "ai-skill-%04d" % (ordinal + 1), "expectedBattleStateSha256": digest, "kind": "use_skill", "parameters": {"unitId": unit_id, "skillId": String(skill["skillId"]), "targetUnitId": String(skill["targetUnitId"])} }
	var targets := BattleAttack.attackable_ids(snapshot, unit_id)
	var target_id := _choose_target(snapshot, unit_id, targets)
	if not target_id.is_empty():
		return {"commandEnvelopeVersion": 1, "commandId": "ai-attack-%04d" % (ordinal + 1), "expectedBattleStateSha256": digest, "kind": "attack_unit", "parameters": {"unitId": unit_id, "targetUnitId": target_id}}
	var destination := _choose_destination(snapshot, unit_id)
	if not destination.is_empty():
		return {"commandEnvelopeVersion": 1, "commandId": "ai-move-%04d" % (ordinal + 1), "expectedBattleStateSha256": digest, "kind": "move_unit", "parameters": {"unitId": unit_id, "slotX": int(destination["x"]), "slotY": int(destination["y"])} }
	return {"commandEnvelopeVersion": 1, "commandId": "ai-wait-%04d" % (ordinal + 1), "expectedBattleStateSha256": digest, "kind": "wait_unit", "parameters": {"unitId": unit_id}}


static func _choose_skill(snapshot: Dictionary, unit_id: String) -> Dictionary:
	if not BattleSkill.available(snapshot, unit_id, BattleSkill.SKILL_ID): return {}
	var unit: Dictionary = snapshot["units"][unit_id]
	var commander_id := String(snapshot.get("commanderUnitIds", {}).get(String(unit.get("side", "")), ""))
	var candidates: Array = []
	for raw_target_id: Variant in BattleSkill.target_ids(snapshot, unit_id, BattleSkill.SKILL_ID):
		var target_id := String(raw_target_id)
		var target: Dictionary = snapshot["units"][target_id]
		var preview: Dictionary = BattleSkill.preview(snapshot, unit_id, BattleSkill.SKILL_ID, target_id)
		var score := int(preview.get("expectedTroopChange", 0))
		if String(target.get("status", "normal")) != "normal": score += 12000
		if target_id == commander_id: score += 300
		if score < 6: continue
		candidates.append({"skillId": BattleSkill.SKILL_ID, "targetUnitId": target_id, "score": score})
	candidates.sort_custom(_skill_before)
	return candidates[0] if not candidates.is_empty() else {}


static func _skill_before(left: Dictionary, right: Dictionary) -> bool:
	if int(left["score"]) != int(right["score"]): return int(left["score"]) > int(right["score"])
	if String(left["skillId"]) != String(right["skillId"]): return String(left["skillId"]) < String(right["skillId"])
	return String(left["targetUnitId"]) < String(right["targetUnitId"])


static func _choose_destination(snapshot: Dictionary, unit_id: String) -> Dictionary:
	var unit: Dictionary = snapshot.get("units", {}).get(unit_id, {})
	if unit.is_empty() or bool(unit.get("moved", false)) or bool(unit.get("acted", false)): return {}
	var destinations := Battlefield.reachable(snapshot, unit_id)
	var rows: Array = []
	for raw_destination: Variant in destinations:
		var destination: Dictionary = raw_destination
		var simulated := snapshot.duplicate(true)
		var simulated_unit: Dictionary = simulated["units"][unit_id]
		simulated_unit["slotX"] = int(destination.get("x", -1)); simulated_unit["slotY"] = int(destination.get("y", -1)); simulated_unit["moved"] = true
		simulated["units"][unit_id] = simulated_unit
		rows.append({"x": int(destination.get("x", -1)), "y": int(destination.get("y", -1)), "score": _destination_score(simulated, unit_id)})
	rows.sort_custom(_destination_before)
	return rows[0] if not rows.is_empty() else {}


static func _destination_score(snapshot: Dictionary, unit_id: String) -> int:
	var unit: Dictionary = snapshot["units"][unit_id]
	var targets := BattleAttack.attackable_ids(snapshot, unit_id)
	var best_damage := 0
	for raw_target_id: Variant in targets:
		var preview := BattleAttack.preview(snapshot, unit_id, String(raw_target_id))
		best_damage = maxi(best_damage, int(preview.get("damage", 0)))
	if not targets.is_empty(): return -10000 - best_damage
	var enemies: Array = []
	for raw_id: Variant in _sorted_keys(snapshot.get("units", {})):
		var enemy: Dictionary = snapshot["units"][raw_id]
		if enemy.get("side") != unit.get("side") and int(enemy.get("troops", 0)) > 0: enemies.append(enemy)
	var enemy_distance := 0
	if not enemies.is_empty():
		enemy_distance = 999999
		for enemy: Dictionary in enemies: enemy_distance = mini(enemy_distance, _distance(unit, enemy))
	var objective: Dictionary = {}
	for raw_tile: Variant in snapshot.get("tiles", []):
		if typeof(raw_tile) == TYPE_DICTIONARY and raw_tile.get("objective") == "city": objective = raw_tile; break
	if objective.is_empty(): return enemy_distance
	var objective_distance := _distance(unit, objective)
	if unit.get("side") == "attacker":
		var use := maxi(1, ceili(float(_side_troops(snapshot, "attacker")) / 1000.0))
		return objective_distance * (5 if int(snapshot.get("attackerFood", 0)) <= use * 3 else 2) + enemy_distance
	var preferred_range := 2 if int(unit.get("armsType", 0)) == 2 else 1
	return objective_distance * 3 + absi(enemy_distance - preferred_range)


static func _destination_before(left: Dictionary, right: Dictionary) -> bool:
	if int(left["score"]) != int(right["score"]): return int(left["score"]) < int(right["score"])
	if int(left["y"]) != int(right["y"]): return int(left["y"]) < int(right["y"])
	return int(left["x"]) < int(right["x"])


static func _side_troops(snapshot: Dictionary, side: String) -> int:
	var total := 0
	for raw_id: Variant in _sorted_keys(snapshot.get("units", {})):
		var unit: Dictionary = snapshot["units"][raw_id]
		if unit.get("side") == side: total += maxi(0, int(unit.get("troops", 0)))
	return total


static func _choose_target(snapshot: Dictionary, unit_id: String, targets: Array) -> String:
	var unit: Dictionary = snapshot["units"][unit_id]
	var commander_id := String(snapshot.get("commanderUnitIds", {}).get("defender" if unit.get("side") == "attacker" else "attacker", ""))
	var candidates: Array = []
	for raw_target_id: Variant in targets:
		var target_id := String(raw_target_id)
		var target: Dictionary = snapshot["units"][target_id]
		var preview: Dictionary = BattleAttack.preview(snapshot, unit_id, target_id)
		candidates.append({"id": target_id, "commander": target_id == commander_id, "defeats": int(preview.get("damage", 0)) >= int(target.get("troops", 0)), "damage": int(preview.get("damage", 0))})
	candidates.sort_custom(_target_before)
	return String(candidates[0].get("id", "")) if not candidates.is_empty() else ""


static func _target_before(left: Dictionary, right: Dictionary) -> bool:
	if bool(left["commander"]) != bool(right["commander"]): return bool(left["commander"])
	if bool(left["defeats"]) != bool(right["defeats"]): return bool(left["defeats"])
	if int(left["damage"]) != int(right["damage"]): return int(left["damage"]) > int(right["damage"])
	return String(left["id"]) < String(right["id"])


static func _ordered_unit_ids(snapshot: Dictionary) -> Array[String]:
	var side := String(snapshot.get("activeSide", ""))
	var objective: Dictionary = {}
	for raw_tile: Variant in snapshot.get("tiles", []):
		if typeof(raw_tile) == TYPE_DICTIONARY and raw_tile.get("objective") == "city": objective = raw_tile; break
	var enemy_commander_id := String(snapshot.get("commanderUnitIds", {}).get("defender" if side == "attacker" else "attacker", ""))
	var enemy_commander: Dictionary = snapshot.get("units", {}).get(enemy_commander_id, {})
	var rows: Array = []
	for raw_id: Variant in _sorted_keys(snapshot.get("units", {})):
		var unit_id := String(raw_id); var unit: Dictionary = snapshot["units"][unit_id]
		if unit.get("side") != side or int(unit.get("troops", 0)) <= 0: continue
		var target := objective if side == "attacker" else enemy_commander
		rows.append({"id": unit_id, "distance": _distance(unit, target) if not target.is_empty() else 0})
	rows.sort_custom(_unit_before)
	var result: Array[String] = []
	for row: Dictionary in rows: result.append(String(row["id"]))
	return result


static func _unit_before(left: Dictionary, right: Dictionary) -> bool:
	if int(left["distance"]) != int(right["distance"]): return int(left["distance"]) < int(right["distance"])
	return String(left["id"]) < String(right["id"])


static func _finish_active_side(session: RefCounted) -> Dictionary:
	var before: Dictionary = session.snapshot()
	if before.get("status") != "ongoing": return before
	var digest_result: Dictionary = Canonical.try_sha256(before)
	var command := {"commandEnvelopeVersion": 1, "commandId": "ai-end-side-%s" % String(before.get("activeSide", "")), "expectedBattleStateSha256": String(digest_result.get("value", "")), "kind": "end_side_turn", "parameters": {}}
	var handoff: Dictionary = session.execute(command)
	if not bool(handoff.get("ok", false)): return session.snapshot()
	var data: Dictionary = handoff.get("battle", before).duplicate(true)
	var side := String(before.get("activeSide", ""))
	if side == "attacker":
		data = _mark_side_completed(data, "attacker")
		data = _evaluate_outcome(data, true, false)
		if data.get("status") != "ongoing":
			var logs: Array = data.get("logs", [])
			if logs.size() >= 2 and logs[logs.size() - 2] == "守方行动开始。": logs.remove_at(logs.size() - 2)
			data["logs"] = logs
			data["activeSide"] = "attacker"
			return data
		if not data.get("logs", []).is_empty(): data["logs"][data["logs"].size() - 1] = "守方开始行动。"
		return _begin_side(data, "defender")
	data = _mark_side_completed(data, "defender")
	return _finish_defender_side(data, before)


static func _mark_side_completed(data: Dictionary, side: String) -> Dictionary:
	for raw_id: Variant in _sorted_keys(data.get("units", {})):
		var unit: Dictionary = data["units"][raw_id]
		if unit.get("side") == side and int(unit.get("troops", 0)) > 0:
			unit["moved"] = true; unit["acted"] = true; data["units"][raw_id] = unit
	data["actedUnitIds"] = _acted_ids(data)
	return data


static func _begin_side(data: Dictionary, side: String) -> Dictionary:
	var skipped: Array[String] = []
	for raw_id: Variant in _sorted_keys(data.get("units", {})):
		var unit: Dictionary = data["units"][raw_id]
		if unit.get("side") != side or int(unit.get("troops", 0)) <= 0: continue
		unit["moved"] = false; unit["acted"] = false
		if ["confused", "stone-array"].has(String(unit.get("status", "normal"))):
			unit["moved"] = true; unit["acted"] = true; unit["statusTurns"] = maxi(0, int(unit.get("statusTurns", 0)) - 1); skipped.append(String(unit.get("name", raw_id)))
		data["units"][raw_id] = unit
	data["actedUnitIds"] = _acted_ids(data)
	if not skipped.is_empty(): data["logs"].append("、".join(skipped) + "受异常状态影响，跳过本阶段行动。")
	return data


static func _finish_defender_side(data: Dictionary, before: Dictionary) -> Dictionary:
	var attacker_use := maxi(1, ceili(float(_side_troops(before, "attacker")) / 1000.0))
	var defender_use := maxi(1, ceili(float(_side_troops(before, "defender")) / 1000.0))
	if not data.get("logs", []).is_empty(): data["logs"][data["logs"].size() - 1] = "第 %d 日开始，攻方耗粮 %d，守方耗粮 %d。" % [int(data.get("day", 1)) + 1, attacker_use, defender_use]
	data = _evaluate_outcome(data, false, true)
	if data.get("status") != "ongoing": data["activeSide"] = "defender"; return data
	var weather_random := BattleSkill.next_seed(int(data.get("rngSeed", 0)))
	data["rngSeed"] = int(weather_random["seed"])
	var weathers := ["fine", "cloudy", "wind", "rain", "hail"]
	var labels := {"fine": "晴", "cloudy": "阴", "wind": "风", "rain": "雨", "hail": "冰雹"}
	data["weather"] = weathers[mini(weathers.size() - 1, floori(float(weather_random["value"]) * weathers.size()))]
	data["logs"].append("天气转为%s。" % labels[data["weather"]])
	data = _drive_statuses(data)
	data["activeSide"] = "attacker"
	return _begin_side(data, "attacker")


static func _drive_statuses(data: Dictionary) -> Dictionary:
	var status_logs: Array[String] = []
	var labels := {"normal": "正常", "confused": "混乱", "silenced": "禁咒", "rooted": "定身", "qimen": "奇门", "dunjia": "遁甲", "stone-array": "石阵", "hidden": "潜踪"}
	for raw_id: Variant in _sorted_keys(data.get("units", {})):
		var unit: Dictionary = data["units"][raw_id]
		if int(unit.get("troops", 0)) <= 0: continue
		var random := BattleSkill.next_seed(int(data.get("rngSeed", 0))); data["rngSeed"] = int(random["seed"])
		var troops := int(unit.get("troops", 0))
		if String(unit.get("status", "normal")) == "stone-array":
			var loss := mini(troops, floori(float(troops) / 8.0)); troops -= loss
			if loss > 0: status_logs.append("%s受石阵侵蚀，损失 %d 兵力。" % [unit.get("name", raw_id), loss])
		var status := String(unit.get("status", "normal")); var roll := floori(float(random["value"]) * 60.0)
		var recovered := false
		if not ["normal", "dunjia"].has(status):
			var by_intelligence := roll < (int(unit.get("intelligence", 0)) >> 1)
			recovered = (status == "qimen" or status == "hidden") and not by_intelligence or status != "qimen" and status != "hidden" and by_intelligence
		unit["troops"] = troops
		if recovered:
			unit["status"] = "normal"; unit["statusTurns"] = 0; status_logs.append("%s从%s状态恢复。" % [unit.get("name", raw_id), labels.get(status, status)])
		data["units"][raw_id] = unit
	if not status_logs.is_empty(): data["logs"].append_array(status_logs)
	return data


static func _evaluate_outcome(data: Dictionary, allow_objective: bool, allow_food: bool) -> Dictionary:
	if data.get("status") != "ongoing": return data
	var attacker_alive := _side_troops(data, "attacker") > 0; var defender_alive := _side_troops(data, "defender") > 0
	var attacker_commander: Dictionary = data.get("units", {}).get(String(data.get("commanderUnitIds", {}).get("attacker", "")), {})
	var defender_commander: Dictionary = data.get("units", {}).get(String(data.get("commanderUnitIds", {}).get("defender", "")), {})
	var status := ""; var reason := ""
	if not attacker_commander.is_empty() and int(attacker_commander.get("troops", 0)) <= 0: status = "defender-won"; reason = "attacker-commander-defeated"
	elif not defender_commander.is_empty() and int(defender_commander.get("troops", 0)) <= 0: status = "attacker-won"; reason = "defender-commander-defeated"
	elif not attacker_alive: status = "defender-won"; reason = "annihilation"
	elif allow_food and int(data.get("attackerFood", 0)) <= 0: status = "defender-won"; reason = "attacker-food-exhausted"
	elif int(data.get("day", 1)) > int(data.get("maxDays", 30)): status = "defender-won"; reason = "day-limit"
	elif not defender_alive: status = "attacker-won"; reason = "annihilation"
	elif allow_food and int(data.get("defenderFood", 0)) <= 0: status = "attacker-won"; reason = "defender-food-exhausted"
	if allow_objective and status.is_empty():
		for raw_id: Variant in _sorted_keys(data.get("units", {})):
			var unit: Dictionary = data["units"][raw_id]
			if unit.get("side") == "attacker" and int(unit.get("troops", 0)) > 0 and _is_objective(data, unit): status = "attacker-won"; reason = "objective-held"; break
	if status.is_empty(): return data
	data["status"] = status; data["outcome"] = reason
	var messages := {"attacker-commander-defeated": "攻方主将败退，守方获胜。", "defender-commander-defeated": "守方主将败退，攻方获胜。", "annihilation": "守军全部溃退，攻方获胜。", "day-limit": "攻方未能在期限内破城，守方获胜。", "attacker-food-exhausted": "攻方粮草耗尽，被迫撤军。", "defender-food-exhausted": "守方粮草耗尽，城池失守。", "objective-held": "攻方占领城池并坚持到本方阶段结束。"}
	data["logs"].append(messages.get(reason, reason))
	return data


static func _is_objective(data: Dictionary, unit: Dictionary) -> bool:
	for raw_tile: Variant in data.get("tiles", []):
		if typeof(raw_tile) == TYPE_DICTIONARY and raw_tile.get("objective") == "city" and int(raw_tile.get("x", -1)) == int(unit.get("slotX", -2)) and int(raw_tile.get("y", -1)) == int(unit.get("slotY", -2)): return true
	return false


static func _acted_ids(snapshot: Dictionary) -> Array:
	var result: Array[String] = []
	for raw_id: Variant in _sorted_keys(snapshot.get("units", {})):
		if bool(snapshot["units"][raw_id].get("acted", false)): result.append(String(raw_id))
	return result


static func _distance(left: Dictionary, right: Dictionary) -> int:
	return absi(int(left.get("slotX", 0)) - int(right.get("x", right.get("slotX", 0)))) + absi(int(left.get("slotY", 0)) - int(right.get("y", right.get("slotY", 0))))


static func _sorted_keys(value: Dictionary) -> Array:
	var result: Array = []
	for raw_key: Variant in value.keys(): result.append(str(raw_key))
	result.sort()
	return result
