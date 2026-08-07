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
	var handoff_result := _finish_active_side(session)
	if not bool(handoff_result.get("ok", false)):
		return {"ok": false, "error": String(handoff_result.get("error", "战术 AI 阶段交接失败")), "trace": trace, "battle": session.snapshot()}
	var final_snapshot: Dictionary = handoff_result.get("battle", session.snapshot())
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
	var unit: Dictionary = snapshot.get("units", {}).get(unit_id, {})
	# The Web policy gives a unit exactly one post-move follow-up: attack or
	# wait.  It must not re-enter skill/movement selection on the next loop.
	if bool(unit.get("moved", false)):
		var after_move_targets := BattleAttack.attackable_ids(snapshot, unit_id)
		var after_move_target := _choose_target(snapshot, unit_id, after_move_targets)
		if not after_move_target.is_empty():
			return {"commandEnvelopeVersion": 1, "commandId": "ai-attack-%04d" % (ordinal + 1), "expectedBattleStateSha256": digest, "kind": "attack_unit", "parameters": {"unitId": unit_id, "targetUnitId": after_move_target}}
		return {"commandEnvelopeVersion": 1, "commandId": "ai-wait-%04d" % (ordinal + 1), "expectedBattleStateSha256": digest, "kind": "wait_unit", "parameters": {"unitId": unit_id}}
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
	var best_damage := 0; var best_lethal := false
	for raw_target_id: Variant in targets:
		var target: Dictionary = snapshot["units"][String(raw_target_id)]
		var preview := BattleAttack.preview(snapshot, unit_id, String(raw_target_id)); var damage := int(preview.get("damage", 0)); var lethal := damage >= int(target.get("troops", 0))
		if lethal and not best_lethal: best_lethal = true; best_damage = damage
		elif lethal == best_lethal: best_damage = maxi(best_damage, damage)
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
	if before.get("status") != "ongoing": return {"ok": true, "battle": before}
	var digest_result: Dictionary = Canonical.try_sha256(before)
	var command := {"commandEnvelopeVersion": 1, "commandId": "ai-end-side-%s" % String(before.get("activeSide", "")), "expectedBattleStateSha256": String(digest_result.get("value", "")), "kind": "end_ai_side_turn", "parameters": {}}
	var handoff: Dictionary = session.execute(command)
	if not bool(handoff.get("ok", false)):
		return {"ok": false, "error": String(handoff.get("error", "阶段交接失败")), "battle": session.snapshot()}
	return {"ok": true, "battle": handoff.get("battle", session.snapshot())}




static func _distance(left: Dictionary, right: Dictionary) -> int:
	return absi(int(left.get("slotX", 0)) - int(right.get("x", right.get("slotX", 0)))) + absi(int(left.get("slotY", 0)) - int(right.get("y", right.get("slotY", 0))))


static func _sorted_keys(value: Dictionary) -> Array:
	var result: Array = []
	for raw_key: Variant in value.keys(): result.append(str(raw_key))
	result.sort()
	return result
