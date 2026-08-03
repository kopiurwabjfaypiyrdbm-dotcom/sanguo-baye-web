class_name TacticalBattleCommands
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const BattleState = preload("res://src/domain/tactical/battle_state.gd")
const BattleValidator = preload("res://src/domain/tactical/battle_validator.gd")
const Battlefield = preload("res://src/domain/tactical/battlefield.gd")
const BattleAttack = preload("res://src/domain/tactical/battle_attack.gd")
const BattleSkill = preload("res://src/domain/tactical/battle_skill.gd")

const SIDE_LIMIT = 10
const WIDTH = 12
const HEIGHT = 8
const MAX_DAYS = 30
const TEMPLATES = ["river-crossing", "highland-pass", "forest-road", "twin-villages", "open-plain", "marsh-fords", "fortified-basin"]
const ARMS_IDS = ["cavalry", "infantry", "archer", "navy", "elite", "mystic"]
const ARMS_MOBILITY = [5, 4, 4, 5, 6, 3]


static func create(state: GameState, order: Dictionary) -> Dictionary:
	var before = state.snapshot()
	var before_digest_result: Dictionary = Canonical.try_sha256(before)
	var before_digest := String(before_digest_result.get("value", ""))
	if not before_digest_result.get("ok", false): return _failure("", "战略状态无法生成摘要：%s" % String(before_digest_result.get("error", "canonical digest failed")))
	if before.get("phase") == "ended": return _failure(before_digest, "The game has ended")
	if before.get("pendingSuccession") != null: return _failure(before_digest, "必须先拥立新君")
	var state_issues = Validator.validate_runtime(before)
	if not state_issues.is_empty():
		return _failure(before_digest, Validator.first_error(state_issues))
	var checked = _validate_attack_order(before, order)
	if not checked["ok"]:
		return _failure(before_digest, checked["error"])
	var source: Dictionary = checked["source"]
	var target: Dictionary = checked["target"]
	var attackers: Array = checked["attackers"]
	var defenders: Array = checked["defenders"]
	var approach = _resolve_approach(int(source["x"]), int(source["y"]), int(target["x"]), int(target["y"]))
	var battle: Dictionary = {
		"contractVersion": 1,
		"id": _battle_id(before, order),
		"strategicTurn": int(before["turn"]), "seedBefore": int(before["rngSeed"]), "rngSeed": int(before["rngSeed"]),
		"sourceCityId": source["id"], "targetCityId": target["id"],
		"attackerFactionId": source["ownerId"], "defenderFactionId": target["ownerId"],
		"attackerOfficerIds": _officer_ids(attackers), "defenderOfficerIds": _officer_ids(defenders),
		"provisionsCommitted": int(order["provisions"]), "attackerFood": int(order["provisions"]), "defenderFood": int(target["food"]),
		"width": WIDTH, "height": HEIGHT, "day": 1, "maxDays": MAX_DAYS, "weather": "wind", "phase": "deployment",
		"activeSide": "attacker", "status": "ongoing", "outcome": "", "approach": approach, "battlefieldVersion": 1,
		"battlefieldKey": "%d:%d:%s" % [int(before["scenario"].get("period", 0)), int(target.get("sourceIndex", 0)), approach],
		"battlefieldTemplate": TEMPLATES[posmod(int(target.get("sourceIndex", 0)), TEMPLATES.size())],
		"deployment": {"attacker": [], "defender": []}, "units": {}, "actedUnitIds": [],
		"commanderUnitIds": {"attacker": "officer:%s" % attackers[0]["id"] if not attackers.is_empty() else "", "defender": "officer:%s" % defenders[0]["id"] if not defenders.is_empty() else ""},
		"experienceGains": {},
		"logs": [String(source["name"]) + "军进入" + String(target["name"]) + "战场。"],
		"guard": _create_guard(before, source, target),
	}
	battle["terrainContractVersion"] = 1
	battle["tiles"] = Battlefield.create_tiles(WIDTH, HEIGHT, approach, String(battle["battlefieldTemplate"]))
	var attacker_slots = _deployment_positions(attackers.size(), approach, "attacker")
	var defender_slots = _deployment_positions(defenders.size(), approach, "defender")
	for index in range(attackers.size()):
		var attacker_unit = _unit_from_officer(before, attackers[index], "attacker", attacker_slots[index])
		battle["units"][attacker_unit["id"]] = attacker_unit
		_append_deployment(battle, "attacker", attacker_unit)
	for index in range(defenders.size()):
		var defender_unit = _unit_from_officer(before, defenders[index], "defender", defender_slots[index])
		battle["units"][defender_unit["id"]] = defender_unit
		_append_deployment(battle, "defender", defender_unit)
	if int(target.get("reserveTroops", 0)) > 0:
		var reserve_slot := _objective_slot(approach)
		var reserve_unit := {
			"id": "reserve:%s" % target["id"], "name": "%s守备军" % target["name"], "officerId": "",
			"factionId": target["ownerId"], "side": "defender", "force": clampi(int(round(35.0 + float(target.get("defense", 0)) / 20.0)), 1, 255),
			"intelligence": clampi(int(round(35.0 + float(target.get("defense", 0)) / 25.0)), 1, 255), "leadership": 0,
			"level": 1, "armsType": 1, "mobility": 2, "skillPoints": 0, "maxSkillPoints": 0, "originalTroops": int(target["reserveTroops"]),
			"troops": int(target["reserveTroops"]), "status": "normal", "statusTurns": 0, "moved": false,
			"acted": false, "deployed": true, "slotX": reserve_slot.x, "slotY": reserve_slot.y,
		}
		battle["units"][reserve_unit["id"]] = reserve_unit
		_append_deployment(battle, "defender", reserve_unit)
	if defenders.is_empty() and int(target.get("reserveTroops", 0)) <= 0:
		battle["phase"] = "ended"
		battle["status"] = "attacker-won"
		battle["outcome"] = "annihilation"
		battle["logs"].append("守军全部溃退，攻方获胜。")
	_sort_deployment(battle["deployment"]["attacker"])
	_sort_deployment(battle["deployment"]["defender"])
	var issues = BattleValidator.validate(battle)
	if not issues.is_empty():
		return _failure(before_digest, BattleValidator.first_error(issues))
	var battle_digest_result: Dictionary = Canonical.try_sha256(battle)
	if not battle_digest_result.get("ok", false): return _failure(before_digest, "战斗状态无法生成摘要：%s" % String(battle_digest_result.get("error", "canonical digest failed")))
	var battle_digest := String(battle_digest_result["value"])
	return {"ok": true, "error": "", "stateChanged": false, "beforeStateSha256": before_digest, "afterStateSha256": before_digest, "receipt": {"kind": "create_battle", "battleId": battle["id"], "battleStateSha256": battle_digest, "rngSeed": battle["rngSeed"]}, "battle": BattleState.new(battle)}


static func confirm_deployment(battle: BattleState) -> Dictionary:
	var data = battle.snapshot()
	var before_digest = _digest(data)
	var preflight = _preflight(data, before_digest)
	if not preflight.is_empty(): return preflight
	if data.get("status") != "ongoing": return _battle_failure(before_digest, "战斗已经结束")
	if data.get("phase") != "deployment": return _battle_failure(before_digest, "部署已经确认")
	if data["deployment"]["attacker"].is_empty() or data["deployment"]["defender"].is_empty(): return _battle_failure(before_digest, "不能空部署")
	data["phase"] = "battle"
	data["logs"].append("双方部署确认，战斗回合开始。")
	return _finish(data, before_digest, "confirm_deployment", {"phase": "battle"})


static func deploy_unit(battle: BattleState, unit_id: String, slot_x: int, slot_y: int) -> Dictionary:
	return _set_deployment(battle, unit_id, slot_x, slot_y, false)


static func move_deployment(battle: BattleState, unit_id: String, slot_x: int, slot_y: int) -> Dictionary:
	return _set_deployment(battle, unit_id, slot_x, slot_y, true)


static func move_unit(battle: BattleState, unit_id: String, slot_x: int, slot_y: int) -> Dictionary:
	var data = battle.snapshot()
	var before_digest = _digest(data)
	var preflight = _preflight(data, before_digest)
	if not preflight.is_empty(): return preflight
	if not data.has("terrainContractVersion") or typeof(data.get("tiles")) != TYPE_ARRAY: return _battle_failure(before_digest, "战场地形网格缺失")
	if data.get("phase") != "battle": return _battle_failure(before_digest, "战斗回合尚未开始")
	if data.get("status") != "ongoing": return _battle_failure(before_digest, "战斗已经结束")
	var unit: Dictionary = data["units"].get(unit_id, {})
	if unit.is_empty() or not bool(unit.get("deployed", false)): return _battle_failure(before_digest, "部队不存在或尚未部署：%s" % unit_id)
	if unit.get("side") != data.get("activeSide"): return _battle_failure(before_digest, "当前不是该部队所属阵营的行动阶段")
	if bool(unit.get("acted", false)): return _battle_failure(before_digest, "该部队本回合已经行动")
	if bool(unit.get("moved", false)): return _battle_failure(before_digest, "该部队本回合已经移动")
	if int(unit.get("troops", 0)) <= 0: return _battle_failure(before_digest, "部队没有可行动兵力")
	if int(unit.get("slotX", -1)) == slot_x and int(unit.get("slotY", -1)) == slot_y: return _battle_failure(before_digest, "目标格不在该单位的可移动范围内")
	var path: Array = Battlefield.find_path(data, unit_id, Vector2i(slot_x, slot_y))
	if path.is_empty(): return _battle_failure(before_digest, "目标格不在该单位的可移动范围内")
	var cost := Battlefield.path_cost(data, unit_id, path)
	if cost < 0: return _battle_failure(before_digest, "目标格不在该单位的可移动范围内")
	var mobility := int(unit.get("mobility", 0)); if String(unit.get("status", "")) == "rooted": mobility = mini(mobility, 1)
	if cost > mobility: return _battle_failure(before_digest, "目标格不在该单位的可移动范围内")
	unit["slotX"] = slot_x; unit["slotY"] = slot_y; unit["moved"] = true; data["units"][unit_id] = unit
	var side := String(unit["side"])
	for index in range(data["deployment"][side].size()):
		if String(data["deployment"][side][index].get("unitId", "")) == unit_id:
			data["deployment"][side][index]["slotX"] = slot_x; data["deployment"][side][index]["slotY"] = slot_y
			break
	_sort_deployment(data["deployment"][side])
	data["logs"].append("%s移动至 %d,%d。" % [unit.get("name", unit_id), slot_x, slot_y])
	return _finish(data, before_digest, "move_unit", {"unitId": unit_id, "path": path, "cost": cost, "remainingMobility": mobility - cost, "seedBefore": data["rngSeed"], "seedAfter": data["rngSeed"]})


static func attack_unit(battle: BattleState, unit_id: String, target_unit_id: String) -> Dictionary:
	var data = battle.snapshot()
	var before_digest := _digest(data)
	var preflight := _preflight(data, before_digest)
	if not preflight.is_empty(): return preflight
	if data.get("phase") != "battle": return _battle_failure(before_digest, "战斗尚未开始")
	if data.get("status") != "ongoing": return _battle_failure(before_digest, "战斗已经结束")
	var attacker: Dictionary = data["units"].get(unit_id, {})
	if attacker.is_empty() or int(attacker.get("troops", 0)) <= 0: return _battle_failure(before_digest, "单位不存在或已经退出战斗")
	if not bool(attacker.get("deployed", false)): return _battle_failure(before_digest, "攻击单位尚未部署")
	if attacker.get("side") != data.get("activeSide"): return _battle_failure(before_digest, "当前不是该单位所属阵营的行动阶段")
	var target: Dictionary = data["units"].get(target_unit_id, {})
	if target.is_empty() or int(target.get("troops", 0)) <= 0 or target.get("side") == attacker.get("side"): return _battle_failure(before_digest, "攻击目标无效")
	if not bool(target.get("deployed", false)): return _battle_failure(before_digest, "攻击目标尚未部署")
	if not BattleAttack.attackable_ids(data, unit_id).has(target_unit_id): return _battle_failure(before_digest, "目标不在攻击范围内")
	var preview := BattleAttack.preview(data, unit_id, target_unit_id)
	if not preview.has("damage"): return _battle_failure(before_digest, String(preview.get("error", "攻击预览失败")))
	var damage := int(preview["damage"])
	var target_troops_after := int(preview["targetTroopsAfter"])
	attacker["moved"] = true; attacker["acted"] = true; data["units"][unit_id] = attacker
	if typeof(data.get("actedUnitIds")) != TYPE_ARRAY: data["actedUnitIds"] = []
	if not data["actedUnitIds"].has(unit_id): data["actedUnitIds"].append(unit_id)
	data["actedUnitIds"].sort()
	target["troops"] = target_troops_after; data["units"][target_unit_id] = target
	var experience_gained := _battle_experience(damage, int(attacker.get("level", 0)), int(target.get("level", 0))) if damage > 0 and not String(attacker.get("officerId", "")).is_empty() else 0
	if experience_gained > 0 and not String(attacker.get("officerId", "")).is_empty():
		if typeof(data.get("experienceGains")) != TYPE_DICTIONARY: data["experienceGains"] = {}
		data["experienceGains"][String(attacker.get("officerId", ""))] = int(data["experienceGains"].get(String(attacker.get("officerId", "")), 0)) + experience_gained
	var message := "%s攻击%s，造成 %d 兵力损失%s。" % [attacker.get("name", unit_id), target.get("name", target_unit_id), damage, "，目标溃退" if target_troops_after == 0 else ""]
	data["logs"].append(message)
	return _finish(data, before_digest, "attack_unit", {"unitId": unit_id, "targetUnitId": target_unit_id, "preview": preview, "damage": damage, "targetTroopsAfter": target_troops_after, "experienceGained": experience_gained, "seedBefore": data["rngSeed"], "seedAfter": data["rngSeed"]})


static func use_skill(battle: BattleState, unit_id: String, skill_id: String, target_unit_id: String) -> Dictionary:
	var data = battle.snapshot()
	var before_digest := _digest(data)
	var preflight := _preflight(data, before_digest)
	if not preflight.is_empty(): return preflight
	if data.get("phase") != "battle": return _battle_failure(before_digest, "战斗尚未开始")
	if data.get("status") != "ongoing": return _battle_failure(before_digest, "战斗已经结束")
	var actor: Dictionary = data["units"].get(unit_id, {})
	var target: Dictionary = data["units"].get(target_unit_id, {})
	var seed_before := int(data["rngSeed"])
	if actor.is_empty() or int(actor.get("troops", 0)) <= 0: return _battle_failure(before_digest, "单位不存在或已经退出战斗")
	if not bool(actor.get("deployed", false)): return _battle_failure(before_digest, "计谋单位尚未部署")
	if actor.get("side") != data.get("activeSide"): return _battle_failure(before_digest, "当前不是该单位所属阵营的行动阶段")
	if not target.is_empty() and not bool(target.get("deployed", false)): return _battle_failure(before_digest, "计谋目标尚未部署")
	if not BattleSkill.available(data, unit_id, skill_id): return _battle_failure(before_digest, "计谋不可用")
	if not BattleSkill.target_ids(data, unit_id, skill_id).has(target_unit_id): return _battle_failure(before_digest, "目标不在计谋范围内")
	var preview := BattleSkill.preview(data, unit_id, skill_id, target_unit_id)
	if not preview.has("skill"): return _battle_failure(before_digest, String(preview.get("error", "计谋预览失败")))
	var random := BattleSkill.next_seed(int(data["rngSeed"]))
	var succeeded := int(preview.get("successChance", 0)) >= 100 or floori(float(random["value"]) * 100.0) < int(preview.get("successChance", 0))
	data["rngSeed"] = int(random["seed"])
	actor["moved"] = true; actor["acted"] = true; actor["skillPoints"] = int(actor.get("skillPoints", 0)) - BattleSkill.COST; data["units"][unit_id] = actor
	if not data["actedUnitIds"].has(unit_id): data["actedUnitIds"].append(unit_id)
	data["actedUnitIds"].sort()
	var detail := "未能奏效"; var experience_gained := 0; var recovery := 0
	if succeeded:
		recovery = int(preview.get("expectedTroopChange", 0))
		if target_unit_id == unit_id: target = data["units"][unit_id]
		target["troops"] = mini(int(target.get("originalTroops", 0)), int(target.get("troops", 0)) + recovery)
		var restores_skipped: bool = target_unit_id != unit_id and target.get("side") == data.get("activeSide") and ["confused", "stone-array"].has(String(target.get("status", "normal"))) and bool(target.get("acted", false))
		target["status"] = "normal"; target["statusTurns"] = 0
		if restores_skipped:
			target["moved"] = false; target["acted"] = false; data["actedUnitIds"] = _without_id(data["actedUnitIds"], target_unit_id)
		detail = "恢复 %d 兵力并解除异常状态%s" % [recovery, "，目标可以重新行动" if restores_skipped else ""]
		experience_gained = 6
	data["units"][target_unit_id] = target
	if experience_gained > 0 and not String(actor.get("officerId", "")).is_empty():
		if typeof(data.get("experienceGains")) != TYPE_DICTIONARY: data["experienceGains"] = {}
		data["experienceGains"][String(actor["officerId"])] = int(data["experienceGains"].get(String(actor["officerId"]), 0)) + experience_gained
	data["logs"].append("%s对%s施展%s，%s。" % [actor.get("name", unit_id), target.get("name", target_unit_id), preview["skill"]["name"], detail])
	return _finish(data, before_digest, "use_skill", {"unitId": unit_id, "skillId": skill_id, "targetUnitId": target_unit_id, "preview": preview, "succeeded": succeeded, "recovery": recovery, "experienceGained": experience_gained, "seedBefore": seed_before, "seedAfter": data["rngSeed"]})


static func remove_deployment(battle: BattleState, unit_id: String) -> Dictionary:
	var data = battle.snapshot()
	var before_digest = _digest(data)
	var preflight = _preflight(data, before_digest)
	if not preflight.is_empty(): return preflight
	if data.get("phase") != "deployment": return _battle_failure(before_digest, "只能在部署阶段撤下部队")
	var unit: Dictionary = data["units"].get(unit_id, {})
	if unit.is_empty() or String(unit.get("officerId", "")).is_empty(): return _battle_failure(before_digest, "未知或不可撤下的部队：%s" % unit_id)
	if unit.get("side") != data.get("activeSide"): return _battle_failure(before_digest, "只能调整当前阵营的部署")
	if not bool(unit.get("deployed", false)): return _battle_failure(before_digest, "部队尚未部署：%s" % unit_id)
	unit["deployed"] = false; unit["slotX"] = -1; unit["slotY"] = -1; data["units"][unit_id] = unit
	var side = String(unit["side"])
	data["deployment"][side] = _without_unit(data["deployment"][side], unit_id)
	return _finish(data, before_digest, "remove_deployment", {"unitId": unit_id, "side": side})


static func end_unit_turn(battle: BattleState, unit_id: String) -> Dictionary:
	var data = battle.snapshot()
	var before_digest = _digest(data)
	var preflight = _preflight(data, before_digest)
	if not preflight.is_empty(): return preflight
	if data.get("phase") != "battle": return _battle_failure(before_digest, "战斗回合尚未开始")
	if data.get("status") != "ongoing": return _battle_failure(before_digest, "战斗已经结束")
	var unit: Dictionary = data["units"].get(unit_id, {})
	if unit.is_empty() or not bool(unit.get("deployed", false)): return _battle_failure(before_digest, "部队不存在或尚未部署：%s" % unit_id)
	if unit.get("side") != data["activeSide"]: return _battle_failure(before_digest, "当前不是该部队所属阵营的行动阶段")
	if bool(unit.get("acted", false)): return _battle_failure(before_digest, "该部队本回合已经行动")
	unit["acted"] = true; data["units"][unit_id] = unit
	data["actedUnitIds"].append(unit_id); data["actedUnitIds"].sort(); data["logs"].append("%s结束本回合行动。" % unit.get("name", unit_id))
	return _finish(data, before_digest, "end_unit_turn", {"unitId": unit_id, "activeSide": data["activeSide"]})


static func end_side_turn(battle: BattleState) -> Dictionary:
	var data = battle.snapshot()
	var before_digest = _digest(data)
	var preflight = _preflight(data, before_digest)
	if not preflight.is_empty(): return preflight
	if data.get("phase") != "battle": return _battle_failure(before_digest, "战斗回合尚未开始")
	if data.get("status") != "ongoing": return _battle_failure(before_digest, "战斗已经结束")
	var side = String(data["activeSide"])
	var active_units: Array = []
	for raw_id in _sorted_keys(data["units"]):
		var unit: Dictionary = data["units"][raw_id]
		if unit.get("side") == side and bool(unit.get("deployed", false)) and int(unit.get("troops", 0)) > 0: active_units.append(String(raw_id))
	active_units.sort()
	if active_units.is_empty():
		var enemy_side := "defender" if side == "attacker" else "attacker"
		var enemy_alive := false
		for raw_enemy_id in _sorted_keys(data["units"]):
			var enemy_unit: Dictionary = data["units"][raw_enemy_id]
			if enemy_unit.get("side") == enemy_side and int(enemy_unit.get("troops", 0)) > 0:
				enemy_alive = true
				break
		var winner_side := enemy_side if enemy_alive else "defender"
		data["status"] = "attacker-won" if winner_side == "attacker" else "defender-won"
		data["outcome"] = "%s-eliminated" % side if enemy_alive else "annihilation"
		data["phase"] = "ended"
		data["logs"].append("%s方已无可行动部队，%s方获胜。" % [side, winner_side])
		return _finish(data, before_digest, "end_side_turn", {"fromSide": side, "toSide": side, "day": data["day"], "turn": data["strategicTurn"]})
	for unit_id in active_units:
		if not bool(data["units"][unit_id].get("acted", false)): return _battle_failure(before_digest, "%s方仍有部队未结束行动" % side)
	for raw_id in _sorted_keys(data["units"]):
		var reset_unit: Dictionary = data["units"][raw_id]
		if reset_unit.get("side") == side:
			reset_unit["acted"] = false; reset_unit["moved"] = false; data["units"][raw_id] = reset_unit
	data["actedUnitIds"] = []
	var next_side = "defender" if side == "attacker" else "attacker"
	data["activeSide"] = next_side
	if side == "defender":
		data["day"] = int(data["day"]) + 1
		if int(data["day"]) > int(data["maxDays"]):
			data["status"] = "defender-won"; data["outcome"] = "day-limit"; data["phase"] = "ended"; data["logs"].append("达到战斗日数上限，守方获胜。")
		else: data["logs"].append("第%d日战斗开始。" % int(data["day"]))
	else: data["logs"].append("守方行动开始。")
	return _finish(data, before_digest, "end_side_turn", {"fromSide": side, "toSide": next_side, "day": data["day"], "turn": data["strategicTurn"]})


static func _set_deployment(battle: BattleState, unit_id: String, slot_x: int, slot_y: int, moving: bool) -> Dictionary:
	var data = battle.snapshot()
	var before_digest = _digest(data)
	var preflight = _preflight(data, before_digest)
	if not preflight.is_empty(): return preflight
	if data.get("phase") != "deployment": return _battle_failure(before_digest, "只能在部署阶段调整部队")
	var unit: Dictionary = data["units"].get(unit_id, {})
	if unit.is_empty() or String(unit.get("officerId", "")).is_empty(): return _battle_failure(before_digest, "未知或不可部署的部队：%s" % unit_id)
	if unit.get("side") != data.get("activeSide"): return _battle_failure(before_digest, "只能调整当前阵营的部署")
	if moving and not bool(unit.get("deployed", false)): return _battle_failure(before_digest, "部队尚未部署：%s" % unit_id)
	if not moving and bool(unit.get("deployed", false)): return _battle_failure(before_digest, "部队已经部署：%s" % unit_id)
	if slot_x < 0 or slot_x >= WIDTH or slot_y < 0 or slot_y >= HEIGHT: return _battle_failure(before_digest, "部署位置越界")
	if not _slot_allowed(String(data["approach"]), String(unit["side"]), slot_x, slot_y): return _battle_failure(before_digest, "部署位置不属于本方阵地")
	if _slot_occupied(data, slot_x, slot_y, unit_id): return _battle_failure(before_digest, "部署位置已经被占用")
	var side = String(unit["side"])
	if moving: data["deployment"][side] = _without_unit(data["deployment"][side], unit_id)
	unit["deployed"] = true; unit["slotX"] = slot_x; unit["slotY"] = slot_y; data["units"][unit_id] = unit
	data["deployment"][side].append({"unitId": unit_id, "slotX": slot_x, "slotY": slot_y}); _sort_deployment(data["deployment"][side])
	var kind = "move_deployment" if moving else "deploy_unit"
	return _finish(data, before_digest, kind, {"unitId": unit_id, "slotX": slot_x, "slotY": slot_y})


static func _finish(data: Dictionary, before_digest: String, kind: String, details: Dictionary) -> Dictionary:
	var issues = BattleValidator.validate(data)
	if not issues.is_empty(): return _battle_failure(before_digest, BattleValidator.first_error(issues))
	var after_digest_result: Dictionary = Canonical.try_sha256(data)
	if not after_digest_result.get("ok", false): return _battle_failure(before_digest, "战斗状态无法生成摘要：%s" % String(after_digest_result.get("error", "canonical digest failed")))
	var after_digest := String(after_digest_result["value"])
	return {"ok": true, "error": "", "stateChanged": after_digest != before_digest, "beforeBattleStateSha256": before_digest, "afterBattleStateSha256": after_digest, "receipt": {"kind": kind, "details": details, "battleStateSha256": after_digest}, "battle": BattleState.new(data)}


static func _battle_experience(damage: int, attacker_level: int, defender_level: int) -> int:
	var base := floori(sqrt(float(maxi(0, damage))) / 4.0)
	var level_difference := attacker_level - defender_level
	var adjusted := base + absi(level_difference) if level_difference < 0 else maxi(0, base - level_difference)
	return adjusted + 2


static func _validate_attack_order(state: Dictionary, order: Dictionary) -> Dictionary:
	if state.get("phase") == "ended": return {"ok": false, "error": "The game has ended"}
	if state.get("pendingSuccession") != null: return {"ok": false, "error": "必须先拥立新君"}
	for key in ["sourceCityId", "targetCityId", "officerIds", "provisions"]:
		if not order.has(key): return {"ok": false, "error": "缺少战斗参数：%s" % key}
	if typeof(order["officerIds"]) != TYPE_ARRAY: return {"ok": false, "error": "参战武将必须是数组"}
	var source: Dictionary = state["cities"].get(order["sourceCityId"], {})
	var target: Dictionary = state["cities"].get(order["targetCityId"], {})
	if source.is_empty(): return {"ok": false, "error": "未知出发城池：%s" % order["sourceCityId"]}
	if target.is_empty(): return {"ok": false, "error": "未知目标城池：%s" % order["targetCityId"]}
	if source["ownerId"] != state["activeFactionId"]: return {"ok": false, "error": "出发城池不属于当前势力"}
	if source["ownerId"] == target["ownerId"]: return {"ok": false, "error": "目标城池不是敌对城池"}
	if not source["neighbors"].has(target["id"]) or not target["neighbors"].has(source["id"]): return {"ok": false, "error": "两座城池不相邻"}
	var officer_ids: Array = order["officerIds"]
	if officer_ids.is_empty(): return {"ok": false, "error": "至少需要一名进攻武将"}
	if officer_ids.size() > SIDE_LIMIT: return {"ok": false, "error": "进攻武将最多十名"}
	var seen: Dictionary = {}; var attackers: Array = []
	for raw_id in officer_ids:
		var officer_id = String(raw_id)
		if seen.has(officer_id): return {"ok": false, "error": "进攻武将不能重复"}
		seen[officer_id] = true
		var officer: Dictionary = state["officers"].get(officer_id, {})
		if officer.is_empty(): return {"ok": false, "error": "未知进攻武将：%s" % officer_id}
		if officer.get("status") != "serving" or officer.get("factionId") != source["ownerId"] or officer.get("cityId") != source["id"]: return {"ok": false, "error": "武将不在出发城池：%s" % officer_id}
		if int(officer.get("troops", 0)) <= 0: return {"ok": false, "error": "武将没有兵力：%s" % officer_id}
		if int(officer.get("stamina", 0)) <= 0: return {"ok": false, "error": "武将没有体力：%s" % officer_id}
		if state.get("actedOfficerIds", []).has(officer_id): return {"ok": false, "error": "武将本月已经行动：%s" % officer_id}
		attackers.append(officer)
	if not _is_integer(order["provisions"]) or int(order["provisions"]) <= 0: return {"ok": false, "error": "军粮必须是正整数"}
	if int(source["food"]) < int(order["provisions"]): return {"ok": false, "error": "出发城池粮草不足"}
	var defenders: Array = []
	for raw_id in state["officerOrder"]:
		var officer: Dictionary = state["officers"][raw_id]
		if officer.get("status") == "serving" and officer.get("factionId") == target["ownerId"] and officer.get("cityId") == target["id"] and int(officer.get("troops", 0)) > 0: defenders.append(officer)
	_sort_officers(defenders)
	if defenders.size() > SIDE_LIMIT: defenders = defenders.slice(0, SIDE_LIMIT)
	return {"ok": true, "source": source, "target": target, "attackers": attackers, "defenders": defenders}


static func _preflight(data: Dictionary, before_digest: String) -> Dictionary:
	var issues := BattleValidator.validate(data)
	return _battle_failure(before_digest, BattleValidator.first_error(issues)) if not issues.is_empty() else {}


static func _create_guard(state: Dictionary, source: Dictionary, target: Dictionary) -> Dictionary:
	var participants: Array = []
	for raw_id in state["officerOrder"]:
		var officer: Dictionary = state["officers"][raw_id]
		if officer.get("status") == "serving" and (officer.get("cityId") == source["id"] or officer.get("cityId") == target["id"]): participants.append(_participant_snapshot(state, officer))
	_sort_participants(participants)
	var no_logs: Dictionary = state.duplicate(true); no_logs.erase("logs")
	return {"version": 2, "strategicFingerprint": _digest(no_logs), "sourceCityId": source["id"], "targetCityId": target["id"], "sourceFood": source["food"], "targetFood": target["food"], "targetDefense": target["defense"], "targetReserveTroops": target["reserveTroops"], "participants": participants}


static func _participant_snapshot(state: Dictionary, officer: Dictionary) -> Dictionary:
	var arms: Dictionary = state["armsTypes"].get(officer["armsTypeId"], {})
	var item_ids: Array = officer.get("equipmentItemIds", [])
	var force_bonus := 0; var intelligence_bonus := 0; var move_bonus := 0
	for raw_item_id in item_ids:
		var item: Dictionary = state.get("items", {}).get(String(raw_item_id), {})
		force_bonus += int(item.get("forceBonus", 0)); intelligence_bonus += int(item.get("intelligenceBonus", 0)); move_bonus += int(item.get("moveBonus", 0))
	return {"officerId": officer["id"], "cityId": officer.get("cityId", ""), "factionId": officer["factionId"], "status": officer["status"], "troops": officer["troops"], "stamina": officer["stamina"], "force": officer["force"], "intelligence": officer["intelligence"], "leadership": officer["leadership"], "level": officer.get("level", 1), "experience": officer.get("experience", 0), "armsTypeId": officer["armsTypeId"], "equipmentKey": "|".join(item_ids), "equipmentKeyEncoding": "pipe-v1", "armsAttackModifier": arms.get("attackModifier", 0), "armsDefenseModifier": arms.get("defenseModifier", 0), "armsMobility": arms.get("mobility", 0), "itemForceBonus": force_bonus, "itemIntelligenceBonus": intelligence_bonus, "itemMoveBonus": move_bonus}


static func _unit_from_officer(state: Dictionary, officer: Dictionary, side: String, slot: Vector2i) -> Dictionary:
	var arms_index = ARMS_IDS.find(String(officer.get("armsTypeId", "infantry")))
	if arms_index < 0: arms_index = 0
	var effective := _effective_officer_attributes(state, officer)
	var arms: Dictionary = state.get("armsTypes", {}).get(officer.get("armsTypeId", ""), {})
	var base_mobility := int(arms.get("mobility", ARMS_MOBILITY[arms_index]))
	var level := int(officer.get("level", 1)); var max_skill_points := _skill_points(int(effective["intelligence"]), int(effective["force"]), level, int(officer.get("stamina", 0)))
	return {"id": "officer:%s" % officer["id"], "name": officer["name"], "officerId": officer["id"], "factionId": officer["factionId"], "side": side, "force": effective["force"], "intelligence": effective["intelligence"], "leadership": officer["leadership"], "level": level, "armsType": arms_index, "mobility": clampi(base_mobility + int(effective["moveBonus"]), 1, 8), "skillPoints": max_skill_points, "maxSkillPoints": max_skill_points, "originalTroops": officer["troops"], "troops": officer["troops"], "status": "normal", "statusTurns": 0, "moved": false, "acted": false, "deployed": true, "slotX": slot.x, "slotY": slot.y}


static func _skill_points(intelligence: int, force: int, level: int, stamina: int) -> int:
	var intelligence_term := floori(float(maxi(0, intelligence)) * 80.0 / 100.0)
	var force_term := floori(sqrt(float(maxi(0, force)))) >> 1
	var base := intelligence_term + force_term + maxi(0, level)
	return clampi(floori(float(base) * float(maxi(0, stamina)) / 100.0), 0, 255)


static func _effective_officer_attributes(state: Dictionary, officer: Dictionary) -> Dictionary:
	var force := int(officer.get("force", 0)); var intelligence := int(officer.get("intelligence", 0)); var move_bonus := 0
	for raw_item_id in officer.get("equipmentItemIds", []):
		var item: Dictionary = state.get("items", {}).get(String(raw_item_id), {})
		force += int(item.get("forceBonus", 0)); intelligence += int(item.get("intelligenceBonus", 0)); move_bonus += int(item.get("moveBonus", 0))
	return {"force": force, "intelligence": intelligence, "moveBonus": move_bonus}


static func _deployment_positions(count: int, approach: String, side: String) -> Array:
	var length = HEIGHT if approach == "east" or approach == "west" else WIDTH
	var center = int(floor(float(length) / 2.0)); var rows: Array = []
	for index in range(length): rows.append(index)
	var ordered_rows: Array = []
	while not rows.is_empty():
		var best = rows[0]
		for candidate in rows:
			if abs(candidate - center) < abs(best - center) or (abs(candidate - center) == abs(best - center) and candidate < best): best = candidate
		ordered_rows.append(best); rows.erase(best)
	var result: Array = []
	for index in range(count):
		var depth = int(index / ordered_rows.size()); var along = ordered_rows[index % ordered_rows.size()]; var attacker = side == "attacker"
		if approach == "east": result.append(Vector2i(1 + depth if attacker else WIDTH - 3 - depth, along))
		elif approach == "west": result.append(Vector2i(WIDTH - 2 - depth if attacker else 2 + depth, along))
		elif approach == "south": result.append(Vector2i(along, 1 + depth if attacker else HEIGHT - 3 - depth))
		else: result.append(Vector2i(along, HEIGHT - 2 - depth if attacker else 2 + depth))
	return result


static func _append_deployment(battle: Dictionary, side: String, unit: Dictionary) -> void:
	battle["deployment"][side].append({"unitId": unit["id"], "slotX": unit["slotX"], "slotY": unit["slotY"]})


static func _slot_occupied(data: Dictionary, x: int, y: int, ignored_id: String) -> bool:
	for raw_id in _sorted_keys(data["units"]):
		if String(raw_id) == ignored_id: continue
		var unit: Dictionary = data["units"][raw_id]
		if bool(unit.get("deployed", false)) and int(unit.get("slotX", -1)) == x and int(unit.get("slotY", -1)) == y: return true
	return false


static func _slot_allowed(approach: String, side: String, x: int, y: int) -> bool:
	if approach == "east": return x <= 3 if side == "attacker" else x >= WIDTH - 4
	if approach == "west": return x >= WIDTH - 4 if side == "attacker" else x <= 3
	if approach == "south": return y <= 3 if side == "attacker" else y >= HEIGHT - 4
	return y >= HEIGHT - 4 if side == "attacker" else y <= 3


static func _without_unit(entries: Array, unit_id: String) -> Array:
	var result: Array = []
	for entry in entries:
		if String(entry.get("unitId", "")) != unit_id: result.append(entry)
	return result


static func _without_id(entries: Array, unit_id: String) -> Array:
	var result: Array = []
	for entry in entries:
		if String(entry) != unit_id: result.append(entry)
	return result


static func _sort_deployment(entries: Array) -> void:
	for index in range(1, entries.size()):
		var current = entries[index]; var cursor = index - 1
		while cursor >= 0 and String(entries[cursor]["unitId"]) > String(current["unitId"]): entries[cursor + 1] = entries[cursor]; cursor -= 1
		entries[cursor + 1] = current


static func _sort_officers(entries: Array) -> void:
	for index in range(1, entries.size()):
		var current: Dictionary = entries[index]; var cursor = index - 1
		while cursor >= 0 and _officer_after(entries[cursor], current): entries[cursor + 1] = entries[cursor]; cursor -= 1
		entries[cursor + 1] = current


static func _officer_after(left: Dictionary, right: Dictionary) -> bool:
	if int(left["troops"]) != int(right["troops"]): return int(left["troops"]) < int(right["troops"])
	if int(left["leadership"]) != int(right["leadership"]): return int(left["leadership"]) < int(right["leadership"])
	return String(left["id"]) > String(right["id"])


static func _sort_participants(entries: Array) -> void:
	for index in range(1, entries.size()):
		var current = entries[index]; var cursor = index - 1
		while cursor >= 0 and String(entries[cursor]["officerId"]) > String(current["officerId"]): entries[cursor + 1] = entries[cursor]; cursor -= 1
		entries[cursor + 1] = current


static func _battle_id(state: Dictionary, order: Dictionary) -> String:
	return "%d:%d:%s:%s:%s:%d" % [int(state["turn"]), int(state["rngSeed"]), order["sourceCityId"], order["targetCityId"], ",".join(order["officerIds"]), int(order["provisions"])]


static func _resolve_approach(source_x: int, source_y: int, target_x: int, target_y: int) -> String:
	var dx = target_x - source_x; var dy = target_y - source_y
	if abs(dx) >= abs(dy): return "east" if dx >= 0 else "west"
	return "south" if dy >= 0 else "north"


static func _officer_ids(entries: Array) -> Array:
	var result: Array = []
	for entry in entries: result.append(String(entry["id"]))
	return result


static func _objective_slot(approach: String) -> Vector2i:
	if approach == "east": return Vector2i(WIDTH - 2, int(floor(float(HEIGHT) / 2.0)))
	if approach == "west": return Vector2i(1, int(floor(float(HEIGHT) / 2.0)))
	if approach == "south": return Vector2i(int(floor(float(WIDTH) / 2.0)), HEIGHT - 2)
	return Vector2i(int(floor(float(WIDTH) / 2.0)), 1)


static func _sorted_keys(value: Dictionary) -> Array:
	var result: Array = []
	for raw_key in value.keys(): result.append(String(raw_key))
	result.sort()
	return result


static func _digest(value: Variant) -> String:
	var result = Canonical.try_sha256(value)
	return String(result.get("value", ""))


static func _is_integer(value: Variant) -> bool:
	if typeof(value) == TYPE_INT: return true
	return typeof(value) == TYPE_FLOAT and float(value) == floor(float(value))


static func _failure(before_digest: String, error: String) -> Dictionary:
	return {"ok": false, "error": error, "stateChanged": false, "beforeStateSha256": before_digest, "afterStateSha256": before_digest, "receipt": {}}


static func _battle_failure(before_digest: String, error: String) -> Dictionary:
	return {"ok": false, "error": error, "stateChanged": false, "beforeBattleStateSha256": before_digest, "afterBattleStateSha256": before_digest, "receipt": {}}


static func _stable_serialize(value: Variant) -> String:
	if value == null: return "null"
	if typeof(value) == TYPE_ARRAY:
		var items: Array = []
		for item in value: items.append(_stable_serialize(item))
		return "[" + ",".join(items) + "]"
	if typeof(value) != TYPE_DICTIONARY: return JSON.stringify(value)
	var dictionary: Dictionary = value
	var keys: Array = dictionary.keys(); keys.sort()
	var entries: Array = []
	for key in keys: entries.append(JSON.stringify(String(key)) + ":" + _stable_serialize(dictionary[key]))
	return "{" + ",".join(entries) + "}"


static func _fnv1a(value: String) -> String:
	var hash = 0x811c9dc5
	for index in range(value.length()):
		hash = int(hash ^ value.unicode_at(index)); hash = int((hash * 0x01000193) & 0xffff_ffff)
	return "%08x" % hash
