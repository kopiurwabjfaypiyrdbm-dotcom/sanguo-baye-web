class_name TacticalBattleAttack
extends RefCounted

## Deterministic ordinary attack formulas shared by preview and command code.
## The terrain shifts and combat matrix are the named modern substitute already
## used by the Web oracle; restricted original resource bytes are not embedded.

const ARMS_COUNT: int = 6
const TERRAIN_COUNT: int = 8
const TERRAIN_SHIFTS: Array = [
	[1, 2, -1, -2, 0, -1, 0, -3],
	[0, 1, 1, 2, 1, 2, 1, -2],
	[0, 1, 2, 1, 1, 2, 1, -2],
	[-1, -1, -2, -2, 0, 0, 0, 3],
	[1, 1, 1, 1, 1, 1, 1, 0],
	[0, 0, 0, 0, 1, 1, 1, 1],
]
const ATTACK_MODULUS: Array = [1.0, 0.8, 0.9, 0.8, 1.3, 0.4]
const DEFENCE_MODULUS: Array = [0.7, 1.2, 1.0, 1.1, 1.2, 0.6]
const TERRAIN_DEFENCE_MODULUS: Array = [1.0, 1.0, 1.3, 1.15, 1.1, 1.5, 1.2, 0.8]
const SUBDUE_MATRIX: Array = [
	[1.0, 1.2, 0.8, 1.0, 0.7, 1.3],
	[0.8, 1.0, 1.2, 1.0, 0.6, 1.2],
	[1.2, 0.8, 1.0, 1.0, 1.1, 1.2],
	[1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
	[1.1, 1.3, 0.9, 1.0, 1.0, 1.5],
	[0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
]
const ATTACK_SHAPES: Array[String] = ["orthogonal-adjacent", "adjacent-eight", "manhattan-ring-two", "orthogonal-adjacent", "adjacent-eight", "orthogonal-adjacent"]


static func attackable_ids(snapshot: Dictionary, unit_id: String) -> Array:
	var unit: Dictionary = snapshot.get("units", {}).get(unit_id, {})
	if snapshot.get("status") != "ongoing" or unit.is_empty() or int(unit.get("troops", 0)) <= 0 or unit.get("side") != snapshot.get("activeSide") or not bool(unit.get("deployed", false)) or bool(unit.get("acted", false)): return []
	var targets: Array = []
	for raw_id in _sorted_keys(snapshot.get("units", {})):
		var target: Dictionary = snapshot["units"][raw_id]
		if int(target.get("troops", 0)) <= 0 or target.get("side") == unit.get("side") or not bool(target.get("deployed", false)): continue
		if not _normal_attack_target(unit, target): continue
		if String(target.get("status", "")) == "hidden" and _distance(unit, target) > 1: continue
		targets.append({"id": String(raw_id), "troops": int(target.get("troops", 0))})
	targets.sort_custom(_target_before)
	var result: Array = []
	for target: Dictionary in targets: result.append(target["id"])
	return result


static func preview(snapshot: Dictionary, unit_id: String, target_id: String) -> Dictionary:
	var attacker: Dictionary = snapshot.get("units", {}).get(unit_id, {})
	var target: Dictionary = snapshot.get("units", {}).get(target_id, {})
	if attacker.is_empty() or int(attacker.get("troops", 0)) <= 0: return {"ok": false, "error": "攻击单位无效"}
	if target.is_empty() or int(target.get("troops", 0)) <= 0 or target.get("side") == attacker.get("side"): return {"ok": false, "error": "攻击目标无效"}
	if not _normal_attack_target(attacker, target): return {"ok": false, "error": "目标不在攻击范围内"}
	if String(target.get("status", "")) == "hidden" and _distance(attacker, target) > 1: return {"ok": false, "error": "潜踪目标必须相邻才能锁定"}
	var attacker_terrain := _terrain_at(snapshot, Vector2i(int(attacker.get("slotX", -1)), int(attacker.get("slotY", -1))))
	var defender_terrain := _terrain_at(snapshot, Vector2i(int(target.get("slotX", -1)), int(target.get("slotY", -1))))
	var attacker_shift := terrain_shift(int(attacker.get("armsType", -1)), attacker_terrain)
	var defender_shift := terrain_shift(int(target.get("armsType", -1)), defender_terrain)
	var attack_attributes := build_attributes(int(attacker.get("force", 0)), int(attacker.get("intelligence", 0)), int(attacker.get("level", 0)), int(attacker.get("armsType", -1)), attacker_terrain, attacker_shift)
	var target_attributes := build_attributes(int(target.get("force", 0)), int(target.get("intelligence", 0)), int(target.get("level", 0)), int(target.get("armsType", -1)), defender_terrain, defender_shift)
	if not attack_attributes.get("ok", false): return attack_attributes
	if not target_attributes.get("ok", false): return target_attributes
	var base_damage := damage(int(attack_attributes["attack"]), maxi(1, int(target_attributes["defence"])), mini(int(attacker.get("troops", 0)), 65535), int(attacker.get("armsType", -1)), int(target.get("armsType", -1)))
	var final_damage := mini(int(target.get("troops", 0)), maxi(1, floori(float(base_damage) * 0.65)) if String(target.get("status", "")) == "dunjia" else base_damage)
	return {"damage": final_damage, "targetTroopsAfter": maxi(0, int(target.get("troops", 0)) - final_damage), "attackerTerrain": attacker_terrain, "defenderTerrain": defender_terrain, "attackerTerrainShift": attacker_shift, "defenderTerrainShift": defender_shift}


static func build_attributes(force: int, intelligence: int, level: int, arms_type: int, terrain: int, shift: int) -> Dictionary:
	if force < 0 or force > 255 or intelligence < 0 or intelligence > 255 or level < 0 or level > 255: return {"ok": false, "error": "攻击属性越界"}
	if arms_type < 0 or arms_type >= ARMS_COUNT or terrain < 0 or terrain >= TERRAIN_COUNT: return {"ok": false, "error": "攻击属性索引无效"}
	var level_factor := level + 10
	var base_attack := _u16(floori(_f32(float(force * level_factor) * ATTACK_MODULUS[arms_type])))
	var base_defence := _u16(floori(_f32(float(intelligence * level_factor) * DEFENCE_MODULUS[arms_type])))
	var attack_value := adjust_terrain(base_attack, shift)
	var defence_value := adjust_terrain(base_defence, shift)
	return {"ok": true, "attack": attack_value, "defence": _u16(floori(_f32(float(defence_value) * TERRAIN_DEFENCE_MODULUS[terrain])))}


static func damage(attack: int, defence: int, troops: int, attacker_arms: int, defender_arms: int) -> int:
	if attack < 0 or attack > 65535 or defence <= 0 or defence > 65535 or troops < 0 or troops > 65535: return 0
	if attacker_arms < 0 or attacker_arms >= ARMS_COUNT or defender_arms < 0 or defender_arms >= ARMS_COUNT: return 0
	var ratio := _f32(_f32(float(attack)) / _f32(float(defence)))
	var base := _u16(floori(_f32(ratio * float(troops >> 3))))
	var subdued := _u16(floori(_f32(float(base) * SUBDUE_MATRIX[attacker_arms][defender_arms])))
	return _u16(subdued + 10)


static func terrain_shift(arms_type: int, terrain: int) -> int:
	if arms_type < 0 or arms_type >= ARMS_COUNT or terrain < 0 or terrain >= TERRAIN_COUNT: return 0
	return int(TERRAIN_SHIFTS[arms_type][terrain])


static func adjust_terrain(value: int, shift: int) -> int:
	if shift >= 0 and shift <= 3: return _u16(value >> shift)
	var unsigned_product := posmod(value * (4294967296 + clampi(shift, -99, 99)), 4294967296)
	return _u16(value - floori(float(unsigned_product) / 100.0))


static func _normal_attack_target(origin: Dictionary, target: Dictionary) -> bool:
	var dx := int(target.get("slotX", 0)) - int(origin.get("slotX", 0)); var dy := int(target.get("slotY", 0)) - int(origin.get("slotY", 0))
	if dx == 0 and dy == 0: return false
	var shape := String(origin.get("normalAttackPatternOverride", ATTACK_SHAPES[clampi(int(origin.get("armsType", 0)), 0, ARMS_COUNT - 1)]))
	var absolute_x := absi(dx); var absolute_y := absi(dy)
	if shape == "orthogonal-adjacent": return absolute_x + absolute_y == 1
	if shape == "adjacent-eight": return maxi(absolute_x, absolute_y) == 1
	return absolute_x + absolute_y == 2


static func _distance(left: Dictionary, right: Dictionary) -> int:
	return absi(int(left.get("slotX", 0)) - int(right.get("slotX", 0))) + absi(int(left.get("slotY", 0)) - int(right.get("slotY", 0)))


static func _terrain_at(snapshot: Dictionary, position: Vector2i) -> int:
	for tile: Variant in snapshot.get("tiles", []):
		if typeof(tile) == TYPE_DICTIONARY and int(tile.get("x", -1)) == position.x and int(tile.get("y", -1)) == position.y: return int(tile.get("terrainId", 0))
	return 0


static func _target_before(left: Dictionary, right: Dictionary) -> bool:
	if int(left["troops"]) != int(right["troops"]): return int(left["troops"]) < int(right["troops"])
	return String(left["id"]) < String(right["id"])


static func _sorted_keys(value: Dictionary) -> Array:
	var result: Array = []
	for raw_key in value.keys(): result.append(String(raw_key))
	result.sort()
	return result


static func _f32(value: float) -> float:
	var packed := PackedFloat32Array([value])
	return float(packed[0])


static func _u16(value: int) -> int:
	return posmod(value, 65536)
