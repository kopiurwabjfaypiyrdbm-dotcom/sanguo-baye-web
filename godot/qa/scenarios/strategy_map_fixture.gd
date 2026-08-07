extends Node
## MB-GD5 fixture adapter: switch to the strategy screen and answer
## assert_camera commands with semantic camera_observed events.
##
## Runs only through an isolated gdeck profile (capability-gated). It does
## not modify game code; it drives an existing legacy direct-scene path
## (strategy_screen starts a campaign itself when no session is carried).

var _probe: Node
var _base_position := Vector2.ZERO
var _base_zoom := Vector2.ONE
var _have_base := false


func gdeck_setup(probe: Node) -> void:
	_probe = probe
	probe.command_requested.connect(_on_command)
	get_tree().process_frame.connect(_switch_to_strategy_screen)

func _switch_to_strategy_screen() -> void:
	get_tree().process_frame.disconnect(_switch_to_strategy_screen)
	get_tree().change_scene_to_file("res://scenes/presentation/strategy_screen.tscn")


func _on_command(command_name: String, payload: Dictionary) -> void:
	if command_name == "set_baseline":
		_set_baseline()
	elif command_name == "assert_camera":
		_assert_camera(str(payload.get("expect", "")))
	elif command_name == "debug_map":
		_debug_map()


func _set_baseline() -> void:
	var camera := _camera()
	if camera == null:
		_probe.event("camera_observed", {"kind": "missing"})
		return
	_base_position = camera.position
	_base_zoom = camera.zoom
	_have_base = true
	_probe.event("camera_observed", {"kind": "baseline"})


func _debug_map() -> void:
	var scene := get_tree().current_scene
	var camera := _camera()
	var map_input := scene.get_node_or_null("%MapInputSpace") if scene != null else null
	_probe.event("map_debug", {
		"camera_position": [camera.position.x, camera.position.y] if camera != null else null,
		"camera_zoom": [camera.zoom.x, camera.zoom.y] if camera != null else null,
		"viewport_size": [get_tree().root.size.x, get_tree().root.size.y],
		"map_input_rect": [map_input.get_global_rect().position.x, map_input.get_global_rect().position.y,
			map_input.get_global_rect().size.x, map_input.get_global_rect().size.y] if map_input != null else null,
	})


func _camera() -> Camera2D:
	var scene := get_tree().current_scene
	if scene == null:
		return null
	return scene.get_node_or_null("%MapCamera") as Camera2D


func _assert_camera(expect: String) -> void:
	var camera := _camera()
	if camera == null:
		_probe.event("camera_observed", {"kind": "missing", "expect": expect})
		return
	if not _have_base:
		_probe.event("camera_observed", {"kind": "no_baseline", "expect": expect})
		return
	var panned := camera.position.distance_to(_base_position) > 5.0
	var zoomed := not camera.zoom.is_equal_approx(_base_zoom)
	var expected_panned := expect == "panned"
	var expected_zoomed := expect == "zoomed"
	var matches := (expected_panned and panned) or (expected_zoomed and zoomed)
	if matches:
		_probe.event("camera_observed", {
			"kind": "panned" if expected_panned else "zoomed",
			"position": [camera.position.x, camera.position.y],
			"zoom": [camera.zoom.x, camera.zoom.y],
		})
	else:
		_probe.event("camera_observed", {
			"kind": "unexpected",
			"expect": expect,
			"position": [camera.position.x, camera.position.y],
			"zoom": [camera.zoom.x, camera.zoom.y],
		})
