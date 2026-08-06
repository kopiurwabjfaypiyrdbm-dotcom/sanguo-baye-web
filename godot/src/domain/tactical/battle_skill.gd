class_name TacticalBattleSkill
extends RefCounted

## MB16 representative skill contract. Rally is the smallest Web-observable
## effect with a complete resource, status, target, receipt and RNG path.
const SKILL_ID := "rally"
const COST := 20
const MIN_INTELLIGENCE := 65
const RANGE := 2
const BASE_POWER := 30
const STATUS_LABEL := "正常"

static func definition() -> Dictionary:
	return {"id": SKILL_ID, "name": "激励", "target": "ally", "range": RANGE, "rangeShape": "diamond", "cost": COST, "minimumIntelligence": MIN_INTELLIGENCE, "description": "恢复友军兵力并解除异常状态。", "effect": "troop-recovery", "basePower": BASE_POWER, "clearsStatus": true, "weatherPower": {"fine": 1.0, "cloudy": 1.0, "wind": 1.0, "rain": 1.0, "hail": 1.0}, "terrainPower": [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], "armsPower": [1.0, 1.0, 1.0, 1.0, 1.0, 1.0]}

static func available(snapshot: Dictionary, unit_id: String, skill_id: String) -> bool:
	var unit: Dictionary = snapshot.get("units", {}).get(unit_id, {})
	return skill_id == SKILL_ID and snapshot.get("phase") == "battle" and snapshot.get("status") == "ongoing" and unit.get("side") == snapshot.get("activeSide") and bool(unit.get("deployed", false)) and int(unit.get("troops", 0)) > 0 and not bool(unit.get("acted", false)) and not String(unit.get("officerId", "")).is_empty() and not ["silenced", "confused", "stone-array"].has(String(unit.get("status", "normal"))) and int(unit.get("intelligence", 0)) >= MIN_INTELLIGENCE and int(unit.get("skillPoints", 0)) >= COST

static func target_ids(snapshot: Dictionary, unit_id: String, skill_id: String) -> Array:
	if not available(snapshot, unit_id, skill_id): return []
	var unit: Dictionary = snapshot["units"][unit_id]
	var candidates: Array = []
	for raw_id in _sorted_keys(snapshot.get("units", {})):
		var target: Dictionary = snapshot["units"][raw_id]
		if not bool(target.get("deployed", false)) or int(target.get("troops", 0)) <= 0 or target.get("side") != unit.get("side"): continue
		if _distance(unit, target) > RANGE: continue
		if int(target.get("troops", 0)) >= int(target.get("originalTroops", 0)) and String(target.get("status", "normal")) == "normal": continue
		candidates.append({"id": String(raw_id), "troops": int(target.get("troops", 0))})
	candidates.sort_custom(_target_before)
	var result: Array = []
	for candidate: Dictionary in candidates: result.append(candidate["id"])
	return result

static func preview(snapshot: Dictionary, unit_id: String, skill_id: String, target_unit_id: String) -> Dictionary:
	var target: Dictionary = snapshot.get("units", {}).get(target_unit_id, {})
	if not available(snapshot, unit_id, skill_id) or not target_ids(snapshot, unit_id, skill_id).has(target_unit_id): return {"error": "目标不在计谋范围内"}
	var actor: Dictionary = snapshot["units"][unit_id]
	var raw_power := maxi(1, roundi((float(BASE_POWER) + float(actor.get("intelligence", 0)) * 0.8 + float(actor.get("level", 0)) * 5.0)))
	var change := mini(maxi(0, int(target.get("originalTroops", 0)) - int(target.get("troops", 0))), raw_power)
	return {"skill": definition(), "successChance": 100, "expectedTroopChange": change, "expectedFoodChange": 0, "weatherMultiplier": 1.0, "terrainMultiplier": 1.0, "armsMultiplier": 1.0}

static func next_seed(seed: int) -> Dictionary:
	var value := posmod(seed, 4294967296)
	var next := posmod(value * 1664525 + 1013904223, 4294967296)
	return {"seed": next, "value": float(next) / 4294967296.0}

static func _distance(left: Dictionary, right: Dictionary) -> int:
	return absi(int(left.get("slotX", 0)) - int(right.get("slotX", 0))) + absi(int(left.get("slotY", 0)) - int(right.get("slotY", 0)))

static func _target_before(left: Dictionary, right: Dictionary) -> bool:
	if int(left["troops"]) != int(right["troops"]): return int(left["troops"]) < int(right["troops"])
	return String(left["id"]) < String(right["id"])

static func _sorted_keys(value: Dictionary) -> Array:
	var result: Array = []
	for raw_key in value.keys(): result.append(str(raw_key))
	result.sort()
	return result
