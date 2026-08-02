## Snapshot renderer for the strategic map. It owns presentation nodes, never domain state.
class_name StrategyMapWorld
extends Node2D

const CITY_MARKER_SCENE := preload("res://scenes/presentation/city_marker.tscn")
const TOUCH_RIPPLE_SCENE := preload("res://scenes/presentation/touch_ripple.tscn")
const CITY_HIT_RADIUS := 32.0
const MAP_GUTTER := Vector2(92.0, 82.0)

@onready var cities_layer: Node2D = %Cities
@onready var effects_layer: Node2D = %Effects

var _snapshot: Dictionary = {}
var _city_order: Array[String] = []
var _city_positions: Dictionary = {}
var _markers: Dictionary = {}
var _roads: Array[PackedStringArray] = []
var _map_bounds := Rect2(Vector2.ZERO, Vector2(1280.0, 720.0))
var _selected_city_id := ""
var _city_hit_radius := CITY_HIT_RADIUS
var _route_preview: Array[String] = []
var _active_order_routes: Array[Array] = []


func rebuild(snapshot: Dictionary) -> void:
	_snapshot = snapshot
	_city_order = _ordered_city_ids(snapshot)
	_city_positions.clear()
	_roads.clear()
	_active_order_routes.clear()

	for child in cities_layer.get_children():
		cities_layer.remove_child(child)
		child.queue_free()
	_markers.clear()

	var cities := _as_dictionary(snapshot.get("cities", {}))
	var factions := _as_dictionary(snapshot.get("factions", {}))
	var player_faction_id := str(snapshot.get("playerFactionId", ""))
	for city_id in _city_order:
		var city := _as_dictionary(cities.get(city_id, {}))
		if city.is_empty():
			continue
		var position := Vector2(float(city.get("x", 0.0)), float(city.get("y", 0.0)))
		_city_positions[city_id] = position
		var owner_id := str(city.get("ownerId", ""))
		var faction := _as_dictionary(factions.get(owner_id, {}))
		var marker := CITY_MARKER_SCENE.instantiate() as CityMarker
		marker.name = _safe_node_name(city_id)
		marker.position = position
		marker.configure(city, faction, player_faction_id)
		cities_layer.add_child(marker)
		marker.set_selected(city_id == _selected_city_id)
		_markers[city_id] = marker

	_roads = _build_reciprocal_roads(cities)
	var strategic_orders: Dictionary = _as_dictionary(snapshot.get("strategicOrders", {}))
	var order_ids: Array[String] = []
	for raw_order_id: Variant in strategic_orders.keys(): order_ids.append(str(raw_order_id))
	order_ids.sort()
	for order_id: String in order_ids:
		var order: Dictionary = _as_dictionary(strategic_orders[order_id])
		if order.get("factionId", "") == player_faction_id:
			_active_order_routes.append((order.get("routeCityIds", []) as Array).duplicate())
	_map_bounds = _calculate_bounds()
	queue_redraw()


func set_selected_city(city_id: String) -> void:
	_selected_city_id = city_id
	for marker_id in _city_order:
		var marker := _markers.get(marker_id) as CityMarker
		if is_instance_valid(marker):
			marker.set_selected(marker_id == city_id)


func set_route_preview(route_city_ids: Array) -> void:
	_route_preview.clear()
	for raw_city_id: Variant in route_city_ids:
		var city_id: String = str(raw_city_id)
		if _city_positions.has(city_id): _route_preview.append(city_id)
	queue_redraw()


func pick_city(screen_position: Vector2) -> String:
	var nearest_id := ""
	var nearest_distance := _city_hit_radius
	for city_id in _city_order:
		var marker := _markers.get(city_id) as CityMarker
		if not is_instance_valid(marker):
			continue
		var marker_screen := marker.get_global_transform_with_canvas().origin
		var distance := marker_screen.distance_to(screen_position)
		if distance <= nearest_distance:
			nearest_distance = distance
			nearest_id = city_id
	return nearest_id


func set_minimum_physical_hit_radius(radius_px: float, canvas_scale: float) -> void:
	# Input positions and marker canvas transforms use logical viewport units.
	# Compensate for canvas downscaling so compact-phone hit targets remain usable.
	_city_hit_radius = maxf(CITY_HIT_RADIUS, radius_px / maxf(canvas_scale, 0.01))


func get_city_world_position(city_id: String) -> Vector2:
	return Vector2(_city_positions.get(city_id, _map_bounds.get_center()))


func get_city_screen_position(city_id: String) -> Vector2:
	var marker := _markers.get(city_id) as CityMarker
	if is_instance_valid(marker):
		return marker.get_global_transform_with_canvas().origin
	return get_viewport_rect().get_center()


func get_ordered_city_ids() -> Array[String]:
	return _city_order.duplicate()


func get_map_bounds() -> Rect2:
	return _map_bounds


func get_road_count() -> int:
	return _roads.size()


func show_touch_ripple(screen_position: Vector2) -> void:
	var canvas_transform := get_global_transform_with_canvas()
	var ripple := TOUCH_RIPPLE_SCENE.instantiate() as TouchRipple
	ripple.position = canvas_transform.affine_inverse() * screen_position
	effects_layer.add_child(ripple)
	var canvas_scale := maxf(0.01, canvas_transform.x.length())
	ripple.play(46.0 / canvas_scale)


func _draw() -> void:
	# A procedural parchment-like field avoids raster and licensing dependencies.
	draw_rect(_map_bounds, Color("#132226"), true)
	for x in range(floori(_map_bounds.position.x / 80.0) * 80, ceili(_map_bounds.end.x), 80):
		draw_line(Vector2(x, _map_bounds.position.y), Vector2(x, _map_bounds.end.y), Color(0.37, 0.51, 0.47, 0.075), 1.0)
	for y in range(floori(_map_bounds.position.y / 80.0) * 80, ceili(_map_bounds.end.y), 80):
		draw_line(Vector2(_map_bounds.position.x, y), Vector2(_map_bounds.end.x, y), Color(0.37, 0.51, 0.47, 0.075), 1.0)

	# Roads are unique only when both endpoint records declare one another as neighbors.
	for road in _roads:
		var from := Vector2(_city_positions.get(road[0], Vector2.ZERO))
		var to := Vector2(_city_positions.get(road[1], Vector2.ZERO))
		draw_line(from, to, Color(0.01, 0.02, 0.02, 0.62), 8.0, true)
		draw_line(from, to, Color(0.49, 0.57, 0.43, 0.82), 3.0, true)

	for route: Array in _active_order_routes:
		_draw_route(route, Color(0.24, 0.78, 0.82, 0.72), 5.0)
	_draw_route(_route_preview, Color(1.0, 0.72, 0.18, 0.96), 7.0)
	for city_id: String in _route_preview:
		draw_circle(Vector2(_city_positions[city_id]), 12.0, Color(1.0, 0.72, 0.18, 0.25))
		draw_arc(Vector2(_city_positions[city_id]), 15.0, 0.0, TAU, 28, Color(1.0, 0.82, 0.38, 0.95), 2.0, true)

	draw_rect(_map_bounds, Color(0.55, 0.68, 0.56, 0.55), false, 2.0)


func _draw_route(route: Array, color: Color, width: float) -> void:
	for index: int in range(route.size() - 1):
		var from_id: String = str(route[index])
		var to_id: String = str(route[index + 1])
		if not _city_positions.has(from_id) or not _city_positions.has(to_id): continue
		var from: Vector2 = _city_positions[from_id]
		var to: Vector2 = _city_positions[to_id]
		draw_line(from, to, Color(0.03, 0.04, 0.03, 0.82), width + 5.0, true)
		draw_line(from, to, color, width, true)
		var direction: Vector2 = (to - from).normalized()
		var tip: Vector2 = from.lerp(to, 0.72)
		var normal: Vector2 = Vector2(-direction.y, direction.x)
		draw_colored_polygon(PackedVector2Array([tip + direction * 10.0, tip - direction * 7.0 + normal * 6.0, tip - direction * 7.0 - normal * 6.0]), color)


func _ordered_city_ids(snapshot: Dictionary) -> Array[String]:
	var cities := _as_dictionary(snapshot.get("cities", {}))
	var result: Array[String] = []
	var seen := {}
	var declared_order: Variant = snapshot.get("cityOrder", [])
	if declared_order is Array:
		for raw_id in declared_order:
			var city_id := str(raw_id)
			if cities.has(city_id) and not seen.has(city_id):
				result.append(city_id)
				seen[city_id] = true
	var fallback: Array[String] = []
	for raw_id in cities.keys():
		var city_id := str(raw_id)
		if not seen.has(city_id):
			fallback.append(city_id)
	fallback.sort()
	result.append_array(fallback)
	return result


func _build_reciprocal_roads(cities: Dictionary) -> Array[PackedStringArray]:
	var pairs := {}
	for city_id in _city_order:
		var city := _as_dictionary(cities.get(city_id, {}))
		var neighbors := _sorted_string_array(city.get("neighbors", []))
		for neighbor_id in neighbors:
			if not cities.has(neighbor_id):
				continue
			var neighbor := _as_dictionary(cities.get(neighbor_id, {}))
			var reverse_neighbors := _sorted_string_array(neighbor.get("neighbors", []))
			if not reverse_neighbors.has(city_id):
				continue
			var first := city_id if city_id < neighbor_id else neighbor_id
			var second := neighbor_id if city_id < neighbor_id else city_id
			pairs["%s\u001f%s" % [first, second]] = PackedStringArray([first, second])
	var keys: Array[String] = []
	for raw_key in pairs.keys():
		keys.append(str(raw_key))
	keys.sort()
	var result: Array[PackedStringArray] = []
	for key in keys:
		result.append(pairs[key] as PackedStringArray)
	return result


func _calculate_bounds() -> Rect2:
	if _city_positions.is_empty():
		return Rect2(Vector2.ZERO, Vector2(1280.0, 720.0))
	var first := true
	var minimum := Vector2.ZERO
	var maximum := Vector2.ZERO
	for raw_position in _city_positions.values():
		var point := Vector2(raw_position)
		if first:
			minimum = point
			maximum = point
			first = false
		else:
			minimum.x = minf(minimum.x, point.x)
			minimum.y = minf(minimum.y, point.y)
			maximum.x = maxf(maximum.x, point.x)
			maximum.y = maxf(maximum.y, point.y)
	return Rect2(minimum - MAP_GUTTER, maximum - minimum + MAP_GUTTER * 2.0)


func _sorted_string_array(value: Variant) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for entry in value:
			result.append(str(entry))
	result.sort()
	return result


func _as_dictionary(value: Variant) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}


func _safe_node_name(value: String) -> String:
	return value.replace("/", "_").replace("@", "_").replace(":", "_")
