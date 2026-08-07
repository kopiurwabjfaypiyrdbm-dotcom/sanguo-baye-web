class_name TacticalBattlefield
extends RefCounted

## Deterministic MB14 battlefield grid and pathfinding boundary.
##
## The grid is data owned by TacticalBattleState.  This class has no scene
## dependencies and never relies on Dictionary iteration order for a result.

const TERRAIN_COUNT: int = 8
const ARMS_COUNT: int = 6
const TERRAIN_COSTS: Array = [
	[1, 1, 3, 2, 1, 1, 1, null],
	[1, 1, 2, 1, 1, 1, 1, 3],
	[1, 1, 2, 1, 1, 1, 1, 3],
	[2, 2, 2, 2, 2, 2, 2, 1],
	[1, 1, 2, 1, 1, 1, 1, 2],
	[1, 1, 2, 1, 1, 1, 1, 3],
]
const TERRAIN_NAMES: Array[String] = ["plain", "road", "hill", "forest", "village", "city", "marsh", "river"]
const DIRECTIONS: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]


static func create_tiles(width: int, height: int, approach: String, template: String) -> Array:
	var tiles: Array = []
	var horizontal := approach == "east" or approach == "west"
	var objective := _objective_position(approach, width, height)
	for y in range(height):
		for x in range(width):
			var terrain := 0
			var across := x if horizontal else y
			var along := y if horizontal else x
			var across_middle := int(floor(float(width if horizontal else height) / 2.0))
			var along_middle := int(floor(float(height if horizontal else width) / 2.0))
			if template == "river-crossing" and across == across_middle and abs(along - along_middle) > 1: terrain = 7
			elif template == "highland-pass" and across >= across_middle - 1 and across <= across_middle + 1 and abs(along - along_middle) > 1: terrain = 2
			elif template == "forest-road" and along != along_middle and posmod(x + y, 3) != 0: terrain = 3
			elif template == "twin-villages" and ((across == across_middle - 2 or across == across_middle + 2) and abs(along - along_middle) <= 1): terrain = 4
			elif template == "marsh-fords" and across >= across_middle - 1 and across <= across_middle + 1 and posmod(along + across, 3) != 0: terrain = 7
			elif template == "fortified-basin" and ((across == across_middle - 2 or across == across_middle + 2) and abs(along - along_middle) > 1): terrain = 2
			elif template == "fortified-basin" and abs(across - across_middle) <= 1: terrain = 4
			elif template == "open-plain": terrain = 1 if posmod(x + y, 5) == 0 else 0
			elif posmod(x + y * 3, 17) == 7: terrain = 3
			elif posmod(x * 5 + y, 23) == 11: terrain = 4
			if template != "open-plain" and terrain == 0 and posmod(x * 7 + y * 11 + across_middle, 29) == 9: terrain = 6
			if x == objective.x and y == objective.y: terrain = 5
			tiles.append(_tile(x, y, terrain, x == objective.x and y == objective.y))
	return tiles


static func _tile(x: int, y: int, terrain_id: int, is_objective: bool) -> Dictionary:
	var movement_costs: Array = []
	var passable_arms: Array = []
	for arms_type in range(ARMS_COUNT):
		var cost: Variant = TERRAIN_COSTS[arms_type][terrain_id]
		movement_costs.append(cost)
		passable_arms.append(cost != null)
	var result := {"x": x, "y": y, "terrainId": terrain_id, "terrainName": TERRAIN_NAMES[terrain_id], "movementCosts": movement_costs, "passableArms": passable_arms}
	if is_objective: result["objective"] = "city"
	return result


static func validate_grid(snapshot: Dictionary, issues: Array[Dictionary]) -> void:
	if not snapshot.has("terrainContractVersion") and not snapshot.has("tiles"): return
	if not _is_exact_integer(snapshot.get("terrainContractVersion")) or int(snapshot.get("terrainContractVersion")) != 1:
		_terrain_issue(issues, "terrainContractVersion", "must be integer 1")
	if typeof(snapshot.get("tiles")) != TYPE_ARRAY:
		_terrain_issue(issues, "tiles", "must be an array")
		return
	var width := int(snapshot.get("width", 0)) if _is_exact_integer(snapshot.get("width")) else 0
	var height := int(snapshot.get("height", 0)) if _is_exact_integer(snapshot.get("height")) else 0
	var tiles: Array = snapshot["tiles"]
	if width <= 0 or height <= 0 or tiles.size() != width * height:
		_terrain_issue(issues, "tiles", "must contain exactly width*height cells")
	var seen: Dictionary = {}
	var previous_y := -1
	var previous_x := -1
	for index in range(tiles.size()):
		if typeof(tiles[index]) != TYPE_DICTIONARY:
			_terrain_issue(issues, "tiles[%d]" % index, "must be an object")
			continue
		var tile: Dictionary = tiles[index]
		if not _is_exact_integer(tile.get("x")) or not _is_exact_integer(tile.get("y")):
			_terrain_issue(issues, "tiles[%d].coordinate" % index, "must be integer coordinates")
			continue
		var x := int(tile["x"]); var y := int(tile["y"])
		if y < 0 or y >= height or x < 0 or x >= width: _terrain_issue(issues, "tiles[%d].coordinate" % index, "is outside the grid")
		var key := "%d,%d" % [x, y]
		if seen.has(key): _terrain_issue(issues, "tiles", "must not contain duplicate coordinates")
		seen[key] = true
		if y < previous_y or (y == previous_y and x < previous_x): _terrain_issue(issues, "tiles", "must be sorted by y then x")
		previous_y = y; previous_x = x
		if not _is_exact_integer(tile.get("terrainId")) or int(tile.get("terrainId")) < 0 or int(tile.get("terrainId")) >= TERRAIN_COUNT:
			_terrain_issue(issues, "tiles[%d].terrainId" % index, "must be an integer terrain id")
		_validate_cost_arrays(tile, index, issues)


static func _validate_cost_arrays(tile: Dictionary, index: int, issues: Array[Dictionary]) -> void:
	for key in ["movementCosts", "passableArms"]:
		if typeof(tile.get(key)) != TYPE_ARRAY or tile[key].size() != ARMS_COUNT:
			_terrain_issue(issues, "tiles[%d].%s" % [index, key], "must contain six arms entries")
	if typeof(tile.get("movementCosts")) == TYPE_ARRAY and tile["movementCosts"].size() == ARMS_COUNT and typeof(tile.get("passableArms")) == TYPE_ARRAY and tile["passableArms"].size() == ARMS_COUNT:
		for arms_type in range(ARMS_COUNT):
			var cost: Variant = tile["movementCosts"][arms_type]
			if cost != null and (not _is_exact_integer(cost) or int(cost) <= 0): _terrain_issue(issues, "tiles[%d].movementCosts[%d]" % [index, arms_type], "must be a positive integer or null")
			if typeof(tile["passableArms"][arms_type]) != TYPE_BOOL: _terrain_issue(issues, "tiles[%d].passableArms[%d]" % [index, arms_type], "must be boolean")
			if (cost != null) != bool(tile["passableArms"][arms_type]): _terrain_issue(issues, "tiles[%d].passableArms[%d]" % [index, arms_type], "must agree with movement cost")


static func reachable(snapshot: Dictionary, unit_id: String) -> Array:
	var unit: Dictionary = snapshot.get("units", {}).get(unit_id, {})
	if unit.is_empty() or bool(unit.get("moved", false)) or bool(unit.get("acted", false)) or String(unit.get("status", "")) == "rooted": return []
	var start := Vector2i(int(unit.get("slotX", -1)), int(unit.get("slotY", -1)))
	var mobility := int(unit.get("mobility", 0)); if String(unit.get("status", "")) == "rooted": mobility = mini(mobility, 1)
	var occupied := _occupied(snapshot, unit_id)
	var enemy_occupied := _enemy_occupied(snapshot, String(unit.get("side", "")))
	var best: Dictionary = {"%d,%d" % [start.x, start.y]: 0}
	var frontier: Array = [{"x": start.x, "y": start.y, "cost": 0, "steps": 0, "parentY": -1, "parentX": -1}]
	while not frontier.is_empty():
		frontier.sort_custom(_queue_before)
		var current: Dictionary = frontier.pop_front()
		var current_key := "%d,%d" % [current.x, current.y]
		if int(current.cost) != int(best.get(current_key, -1)): continue
		if current_key != "%d,%d" % [start.x, start.y] and String(unit.get("status", "")) != "qimen" and _enemy_zone(snapshot, String(unit.get("side", "")), Vector2i(current.x, current.y)): continue
		for direction: Vector2i in DIRECTIONS:
			var next := Vector2i(current.x + direction.x, current.y + direction.y)
			var cost := _step_cost(snapshot, unit, next)
			if cost < 0 or enemy_occupied.has("%d,%d" % [next.x, next.y]): continue
			var total := int(current.cost) + cost
			if total > mobility: continue
			var key := "%d,%d" % [next.x, next.y]
			if best.has(key) and int(best[key]) <= total: continue
			best[key] = total
			frontier.append({"x": next.x, "y": next.y, "cost": total, "steps": int(current.steps) + 1, "parentY": current.y, "parentX": current.x})
	var result: Array = []
	for key in best.keys():
		if key == "%d,%d" % [start.x, start.y] or occupied.has(key): continue
		result.append(_parse_position(key))
	result.sort_custom(_position_before)
	return result


static func find_path(snapshot: Dictionary, unit_id: String, destination: Vector2i) -> Array:
	var unit: Dictionary = snapshot.get("units", {}).get(unit_id, {})
	if unit.is_empty() or String(unit.get("status", "")) == "rooted": return []
	var start := Vector2i(int(unit.get("slotX", -1)), int(unit.get("slotY", -1)))
	if start == destination: return [{"x": start.x, "y": start.y}]
	var destination_key := "%d,%d" % [destination.x, destination.y]
	var occupied := _occupied(snapshot, unit_id)
	if occupied.has(destination_key): return []
	var mobility := int(unit.get("mobility", 0)); if String(unit.get("status", "")) == "rooted": mobility = mini(mobility, 1)
	var start_key := "%d,%d" % [start.x, start.y]
	var best: Dictionary = {start_key: 0}
	var previous: Dictionary = {}
	var frontier: Array = [{"x": start.x, "y": start.y, "cost": 0, "steps": 0, "parentY": -1, "parentX": -1}]
	while not frontier.is_empty():
		frontier.sort_custom(_queue_before)
		var current: Dictionary = frontier.pop_front()
		var current_key := "%d,%d" % [current.x, current.y]
		if int(current.cost) != int(best.get(current_key, -1)): continue
		if current_key == destination_key: break
		if current_key != start_key and String(unit.get("status", "")) != "qimen" and _enemy_zone(snapshot, String(unit.get("side", "")), Vector2i(current.x, current.y)): continue
		for direction: Vector2i in DIRECTIONS:
			var next := Vector2i(current.x + direction.x, current.y + direction.y)
			var cost := _step_cost(snapshot, unit, next)
			if cost < 0 or _enemy_occupied(snapshot, String(unit.get("side", ""))).has("%d,%d" % [next.x, next.y]): continue
			var total := int(current.cost) + cost
			if total > mobility: continue
			var key := "%d,%d" % [next.x, next.y]
			if best.has(key) and int(best[key]) <= total: continue
			best[key] = total; previous[key] = current_key
			frontier.append({"x": next.x, "y": next.y, "cost": total, "steps": int(current.steps) + 1, "parentY": current.y, "parentX": current.x})
	if not best.has(destination_key): return []
	var path: Array = []; var cursor := destination_key
	while true:
		path.append(_parse_position(cursor))
		if cursor == start_key: break
		cursor = String(previous.get(cursor, "")); if cursor.is_empty(): return []
	path.reverse()
	return path


static func path_cost(snapshot: Dictionary, unit_id: String, path: Array) -> int:
	var unit: Dictionary = snapshot.get("units", {}).get(unit_id, {})
	var total := 0
	for index in range(1, path.size()):
		var position: Dictionary = path[index]
		var cost := _step_cost(snapshot, unit, Vector2i(int(position.get("x", -1)), int(position.get("y", -1))))
		if cost < 0: return -1
		total += cost
	return total


static func _step_cost(snapshot: Dictionary, unit: Dictionary, position: Vector2i) -> int:
	var tile := tile_at(snapshot, position)
	if tile.is_empty(): return -1
	var arms_type := int(unit.get("armsType", 0)); if arms_type < 0 or arms_type >= ARMS_COUNT: return -1
	var costs: Variant = tile.get("movementCosts", [])
	if typeof(costs) != TYPE_ARRAY or arms_type >= costs.size() or costs[arms_type] == null: return -1
	return int(costs[arms_type])


static func tile_at(snapshot: Dictionary, position: Vector2i) -> Dictionary:
	if position.x < 0 or position.y < 0 or position.x >= int(snapshot.get("width", 0)) or position.y >= int(snapshot.get("height", 0)): return {}
	for tile: Variant in snapshot.get("tiles", []):
		if typeof(tile) == TYPE_DICTIONARY and int(tile.get("x", -1)) == position.x and int(tile.get("y", -1)) == position.y: return tile
	return {}


static func _occupied(snapshot: Dictionary, ignored_id: String) -> Dictionary:
	var result: Dictionary = {}
	for raw_id in _sorted_keys(snapshot.get("units", {})):
		var unit: Dictionary = snapshot["units"][raw_id]
		if raw_id != ignored_id and int(unit.get("troops", 0)) > 0: result["%d,%d" % [int(unit.get("slotX", -1)), int(unit.get("slotY", -1))]] = true
	return result


static func _enemy_occupied(snapshot: Dictionary, side: String) -> Dictionary:
	var result: Dictionary = {}
	for raw_id in _sorted_keys(snapshot.get("units", {})):
		var unit: Dictionary = snapshot["units"][raw_id]
		if unit.get("side") != side and int(unit.get("troops", 0)) > 0: result["%d,%d" % [int(unit.get("slotX", -1)), int(unit.get("slotY", -1))]] = true
	return result


static func _enemy_zone(snapshot: Dictionary, side: String, position: Vector2i) -> bool:
	for raw_id in _sorted_keys(snapshot.get("units", {})):
		var unit: Dictionary = snapshot["units"][raw_id]
		if unit.get("side") != side and int(unit.get("troops", 0)) > 0 and absi(int(unit.get("slotX", -1)) - position.x) + absi(int(unit.get("slotY", -1)) - position.y) == 1: return true
	return false


static func _queue_before(left: Dictionary, right: Dictionary) -> bool:
	for key in ["cost", "steps", "y", "x", "parentY", "parentX"]:
		if int(left.get(key, 0)) != int(right.get(key, 0)): return int(left.get(key, 0)) < int(right.get(key, 0))
	return false


static func _position_before(left: Dictionary, right: Dictionary) -> bool:
	if int(left.get("y", 0)) != int(right.get("y", 0)): return int(left.get("y", 0)) < int(right.get("y", 0))
	return int(left.get("x", 0)) < int(right.get("x", 0))


static func _parse_position(key: String) -> Dictionary:
	var parts := key.split(",")
	return {"x": int(parts[0]), "y": int(parts[1])}


static func _sorted_keys(value: Dictionary) -> Array:
	var result: Array = []
	for key in value.keys(): result.append(String(key))
	result.sort()
	return result


static func _objective_position(approach: String, width: int, height: int) -> Vector2i:
	if approach == "east": return Vector2i(width - 2, int(floor(float(height) / 2.0)))
	if approach == "west": return Vector2i(1, int(floor(float(height) / 2.0)))
	if approach == "south": return Vector2i(int(floor(float(width) / 2.0)), height - 2)
	return Vector2i(int(floor(float(width) / 2.0)), 1)


static func _is_exact_integer(value: Variant) -> bool:
	return typeof(value) == TYPE_INT or (typeof(value) == TYPE_FLOAT and is_finite(float(value)) and float(value) == floor(float(value)))


static func _terrain_issue(issues: Array[Dictionary], path: String, message: String) -> void:
	issues.append({"path": path, "message": "%s: %s" % [path, message]})
