class_name TacticalBattleScreen
extends Node2D

## MB18 native tactical presentation.  The scene owns only input, drawing and
## command scheduling; TacticalBattleSession remains the state authority.

const Battlefield = preload("res://src/domain/tactical/battlefield.gd")
const BattleAttack = preload("res://src/domain/tactical/battle_attack.gd")
const BattleSkill = preload("res://src/domain/tactical/battle_skill.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const Session = preload("res://src/application/tactical_battle/tactical_battle_session.gd")
const DemoFactory = preload("res://src/application/tactical_battle/tactical_battle_demo_factory.gd")

const CELL_SIZE := 88.0
const BOARD_SIZE := Vector2(12.0 * CELL_SIZE, 8.0 * CELL_SIZE)
const MIN_ZOOM := 0.72
const MAX_ZOOM := 2.15
const ZOOM_STEP := 1.16
const DRAG_THRESHOLD := 10.0

@onready var battle_camera: Camera2D = %BattleCamera
@onready var overlay: Control = %Overlay

var _session: RefCounted
var _snapshot: Dictionary = {}
var _last_command_result: Dictionary = {}
var _selected_unit_id := ""
var _selected_tile := Vector2i(-1, -1)
var _command_serial := 0
var _camera_tween: Tween
var _dragging := false
var _pressed := false
var _press_position := Vector2.ZERO
var _last_position := Vector2.ZERO
var _touches: Dictionary = {}
var _pinch_distance := 0.0
var _multi_touch_gesture := false

var _status_label: Label
var _selection_panel: PanelContainer
var _selection_label: Label
var _move_button: Button
var _attack_button: Button
var _skill_button: Button
var _wait_button: Button
var _back_button: Button


func _ready() -> void:
	_build_interface()
	_session = Session.from_snapshot(DemoFactory.create_snapshot())
	if _session == null:
		_set_status("战场样片状态校验失败", Color(0.95, 0.4, 0.35))
		return
	_snapshot = _session.snapshot()
	battle_camera.position = BOARD_SIZE * 0.5
	battle_camera.zoom = Vector2.ONE
	_refresh_view()
	get_viewport().size_changed.connect(_on_viewport_size_changed)
	call_deferred("_focus_battlefield")


func _process(_delta: float) -> void:
	if is_instance_valid(_selection_panel) and not _selected_unit_id.is_empty():
		_place_selection_panel()


func _draw() -> void:
	var font := ThemeDB.fallback_font
	draw_rect(Rect2(Vector2.ZERO, BOARD_SIZE), Color("101b24"))
	for y in range(8):
		for x in range(12):
			var tile := Battlefield.tile_at(_snapshot, Vector2i(x, y))
			var terrain := String(tile.get("terrainName", "plain"))
			var rect := Rect2(Vector2(x, y) * CELL_SIZE, Vector2.ONE * CELL_SIZE)
			draw_rect(rect, _terrain_color(terrain))
			draw_rect(rect, Color(0.68, 0.78, 0.78, 0.26), false, 1.0)
			if tile.get("objective", "") == "city":
				draw_circle(rect.get_center(), CELL_SIZE * 0.26, Color("d8a84e"))
				draw_circle(rect.get_center(), CELL_SIZE * 0.19, Color("5d3f29"))
				draw_string(font, rect.position + Vector2(8, 18), "城", HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("f8e1a0"))
	if _selected_tile.x >= 0:
		var selected_rect := Rect2(Vector2(_selected_tile) * CELL_SIZE, Vector2.ONE * CELL_SIZE)
		draw_rect(selected_rect.grow(-3.0), Color("f7d36b"), false, 4.0)
	for raw_id: Variant in _sorted_unit_ids():
		var unit: Dictionary = _snapshot.get("units", {}).get(String(raw_id), {})
		if int(unit.get("troops", 0)) <= 0: continue
		var rect := Rect2(Vector2(int(unit.get("slotX", 0)), int(unit.get("slotY", 0))) * CELL_SIZE, Vector2.ONE * CELL_SIZE)
		var center := rect.get_center()
		var side_color := Color("4f9fc1") if unit.get("side") == "attacker" else Color("ba5d67")
		draw_circle(center, 25.0, side_color)
		draw_circle(center, 25.0, Color("f6edcf"), false, 2.0)
		if String(raw_id) == _selected_unit_id:
			draw_arc(center, 33.0, 0.0, TAU, 32, Color("f7d36b"), 5.0)
		var label := String(unit.get("name", raw_id))
		draw_string(font, center + Vector2(-30, 5), label, HORIZONTAL_ALIGNMENT_CENTER, 60, 15, Color("fff8e6"))
		draw_string(font, rect.position + Vector2(8, 80), "%d" % int(unit.get("troops", 0)), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("ecf6f0"))


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		_handle_mouse_button(event)
	elif event is InputEventMouseMotion and _pressed:
		_handle_drag(event.position)
	elif event is InputEventScreenTouch:
		_handle_touch(event)
	elif event is InputEventScreenDrag:
		_touches[event.index] = event.position
		_handle_drag(event.position)
	elif event is InputEventMagnifyGesture:
		_set_zoom(battle_camera.zoom.x * event.factor, event.position)
		get_viewport().set_input_as_handled()


func _handle_mouse_button(event: InputEventMouseButton) -> void:
	if event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_pressed = true; _dragging = false; _press_position = event.position; _last_position = event.position
		else:
			if _pressed and not _dragging: _select_at_screen(event.position)
			_pressed = false; _dragging = false
		get_viewport().set_input_as_handled()
	elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
		_set_zoom(battle_camera.zoom.x * ZOOM_STEP, event.position); get_viewport().set_input_as_handled()
	elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
		_set_zoom(battle_camera.zoom.x / ZOOM_STEP, event.position); get_viewport().set_input_as_handled()


func _handle_touch(event: InputEventScreenTouch) -> void:
	if event.canceled:
		_touches.erase(event.index)
		_pressed = false; _dragging = false; _multi_touch_gesture = false; _pinch_distance = 0.0
		get_viewport().set_input_as_handled()
		return
	if event.pressed:
		_touches[event.index] = event.position
		if _touches.size() == 1:
			_pressed = true; _dragging = false; _multi_touch_gesture = false; _press_position = event.position; _last_position = event.position
		else:
			_multi_touch_gesture = true; _dragging = true; _pinch_distance = _touch_distance()
	else:
		var was_single := _touches.size() == 1
		_touches.erase(event.index)
		if was_single and _pressed and not _dragging and not _multi_touch_gesture: _select_at_screen(event.position)
		if _touches.size() == 1 and _multi_touch_gesture:
			var remaining: Vector2 = _touches.values()[0]
			_last_position = remaining; _press_position = remaining; _dragging = true
		if _touches.size() < 2: _pinch_distance = 0.0
		if _touches.is_empty(): _pressed = false; _dragging = false; _multi_touch_gesture = false
	get_viewport().set_input_as_handled()


func _handle_drag(position: Vector2) -> void:
	if _touches.size() >= 2:
		_multi_touch_gesture = true; _dragging = true
		var distance := _touch_distance()
		if _pinch_distance > 0.0: _set_zoom(battle_camera.zoom.x * distance / _pinch_distance, _touch_center())
		_pinch_distance = distance
		return
	if not _pressed: return
	if _press_position.distance_to(position) >= DRAG_THRESHOLD and not _dragging:
		_dragging = true; _cancel_camera_tween()
	if _dragging:
		var delta := position - _last_position
		battle_camera.position -= delta / battle_camera.zoom.x
		battle_camera.position = _clamp_camera_position(battle_camera.position)
		_last_position = position


func _select_at_screen(screen_position: Vector2) -> void:
	var world := _screen_to_world(screen_position)
	var slot := Vector2i(floori(world.x / CELL_SIZE), floori(world.y / CELL_SIZE))
	if slot.x < 0 or slot.x >= 12 or slot.y < 0 or slot.y >= 8: return
	_selected_tile = slot
	_selected_unit_id = ""
	for raw_id: Variant in _sorted_unit_ids():
		var unit: Dictionary = _snapshot.get("units", {}).get(String(raw_id), {})
		if int(unit.get("troops", 0)) > 0 and int(unit.get("slotX", -1)) == slot.x and int(unit.get("slotY", -1)) == slot.y:
			_selected_unit_id = String(raw_id); break
	_refresh_selection()
	queue_redraw()
	get_viewport().set_input_as_handled()


func _build_interface() -> void:
	var top := PanelContainer.new(); top.name = "TopBar"; top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.set_anchors_preset(Control.PRESET_TOP_WIDE); top.offset_bottom = 70.0
	var top_margin := MarginContainer.new(); top_margin.add_theme_constant_override("margin_left", 18); top_margin.add_theme_constant_override("margin_right", 18); top_margin.add_theme_constant_override("margin_top", 10); top_margin.add_theme_constant_override("margin_bottom", 10); top.add_child(top_margin)
	var top_row := HBoxContainer.new(); top_row.add_theme_constant_override("separation", 14); top_margin.add_child(top_row)
	var title := Label.new(); title.text = "战术战场 · 原生样片"; title.add_theme_color_override("font_color", Color("f7d36b")); title.add_theme_font_size_override("font_size", 21); top_row.add_child(title)
	var hint := Label.new(); hint.text = "拖动平移 · 滚轮/双指缩放 · 点击选中"; hint.add_theme_color_override("font_color", Color("b7c9c6")); hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT; top_row.add_child(hint)
	_back_button = Button.new(); _back_button.text = "返回战略地图"; _back_button.custom_minimum_size = Vector2(150, 48); _back_button.pressed.connect(_return_to_strategy); top_row.add_child(_back_button)
	overlay.add_child(top)
	_status_label = Label.new(); _status_label.position = Vector2(20, 78); _status_label.add_theme_font_size_override("font_size", 18); _status_label.add_theme_color_override("font_color", Color("eaf4ef")); _status_label.mouse_filter = Control.MOUSE_FILTER_IGNORE; overlay.add_child(_status_label)
	_selection_panel = PanelContainer.new(); _selection_panel.custom_minimum_size = Vector2(260, 190); _selection_panel.mouse_filter = Control.MOUSE_FILTER_STOP; overlay.add_child(_selection_panel)
	var margin := MarginContainer.new(); margin.add_theme_constant_override("margin_left", 14); margin.add_theme_constant_override("margin_top", 12); margin.add_theme_constant_override("margin_right", 14); margin.add_theme_constant_override("margin_bottom", 12); _selection_panel.add_child(margin)
	var column := VBoxContainer.new(); column.add_theme_constant_override("separation", 7); margin.add_child(column)
	_selection_label = Label.new(); _selection_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; column.add_child(_selection_label)
	var actions := HBoxContainer.new(); actions.add_theme_constant_override("separation", 5); column.add_child(actions)
	_move_button = _action_button("移动", _on_move_pressed, actions)
	_attack_button = _action_button("攻击", _on_attack_pressed, actions)
	_skill_button = _action_button("计谋", _on_skill_pressed, actions)
	_wait_button = _action_button("休整", _on_wait_pressed, actions)
	_update_touch_targets()


func _action_button(text: String, callback: Callable, parent: Node) -> Button:
	var button := Button.new(); button.text = text; button.custom_minimum_size = Vector2(52, 46); button.pressed.connect(callback); parent.add_child(button); return button


func _refresh_view() -> void:
	_refresh_selection()
	_set_status("%s行动 · 选择单位或地图格开始" % ("攻方" if _snapshot.get("activeSide") == "attacker" else "守方"), Color("d8e9df"))
	queue_redraw()


func _refresh_selection() -> void:
	if _selected_unit_id.is_empty():
		_selection_panel.visible = false; return
	var unit: Dictionary = _snapshot.get("units", {}).get(_selected_unit_id, {})
	_selection_panel.visible = true
	_selection_label.text = "%s\n%s · %d 兵 · %s" % [unit.get("name", _selected_unit_id), "攻方" if unit.get("side") == "attacker" else "守方", int(unit.get("troops", 0)), "可行动" if not unit.get("acted", false) else "已行动"]
	var active: bool = unit.get("side") == _snapshot.get("activeSide") and int(unit.get("troops", 0)) > 0 and not bool(unit.get("acted", false)) and _snapshot.get("status") == "ongoing"
	_move_button.disabled = not active or Battlefield.reachable(_snapshot, _selected_unit_id).is_empty()
	_attack_button.disabled = not active or BattleAttack.attackable_ids(_snapshot, _selected_unit_id).is_empty()
	_skill_button.disabled = not active or not BattleSkill.available(_snapshot, _selected_unit_id, BattleSkill.SKILL_ID)
	_wait_button.disabled = not active
	_place_selection_panel()


func _place_selection_panel() -> void:
	if not is_instance_valid(_selection_panel): return
	var world := Vector2.ZERO
	var unit: Dictionary = _snapshot.get("units", {}).get(_selected_unit_id, {})
	world = (Vector2(int(unit.get("slotX", 0)), int(unit.get("slotY", 0))) + Vector2.ONE * 0.5) * CELL_SIZE
	var screen := get_viewport().get_canvas_transform() * world
	var size := _selection_panel.size
	var safe := _safe_viewport_rect()
	_selection_panel.position = Vector2(clampf(screen.x + 20.0, safe.position.x, maxf(safe.position.x, safe.end.x - size.x)), clampf(screen.y - size.y * 0.5, safe.position.y, maxf(safe.position.y, safe.end.y - size.y)))


func _on_move_pressed() -> void:
	var reachable := Battlefield.reachable(_snapshot, _selected_unit_id)
	if reachable.is_empty(): return
	var destination: Dictionary = reachable[0]
	_execute_command("move_unit", {"unitId": _selected_unit_id, "slotX": int(destination["x"]), "slotY": int(destination["y"])})


func _on_attack_pressed() -> void:
	var targets := BattleAttack.attackable_ids(_snapshot, _selected_unit_id)
	if not targets.is_empty(): _execute_command("attack_unit", {"unitId": _selected_unit_id, "targetUnitId": String(targets[0])})


func _on_skill_pressed() -> void:
	var targets := BattleSkill.target_ids(_snapshot, _selected_unit_id, BattleSkill.SKILL_ID)
	if not targets.is_empty(): _execute_command("use_skill", {"unitId": _selected_unit_id, "skillId": BattleSkill.SKILL_ID, "targetUnitId": String(targets[0])})


func _on_wait_pressed() -> void:
	_execute_command("wait_unit", {"unitId": _selected_unit_id})


func _execute_command(kind: String, parameters: Dictionary) -> void:
	var digest := Canonical.try_sha256(_snapshot)
	if not digest.get("ok", false): _set_status("状态摘要失败", Color("f38c78")); return
	_command_serial += 1
	var command := {"commandEnvelopeVersion": 1, "commandId": "presentation-%04d" % _command_serial, "expectedBattleStateSha256": String(digest["value"]), "kind": kind, "parameters": parameters}
	var result: Dictionary = _session.execute(command)
	_last_command_result = result.duplicate(true)
	if not result.get("ok", false): _set_status("命令未执行：%s" % String(result.get("error", "未知错误")), Color("f38c78")); return
	_snapshot = _session.snapshot()
	_set_status("%s 已执行 · 状态摘要 %s" % [_command_label(kind), String(result.get("afterBattleStateSha256", "")).left(10)], Color("9de0bd"))
	_refresh_selection(); queue_redraw()


func _command_label(kind: String) -> String:
	return {"move_unit": "移动", "attack_unit": "攻击", "use_skill": "计谋", "wait_unit": "休整"}.get(kind, kind)


func _set_status(text: String, color: Color) -> void:
	if is_instance_valid(_status_label): _status_label.text = text; _status_label.add_theme_color_override("font_color", color)


func _focus_battlefield() -> void:
	_animate_camera(BOARD_SIZE * 0.5, maxf(0.76, _fit_zoom()))


func _fit_zoom() -> float:
	var size := get_viewport_rect().size
	return minf((size.x - 42.0) / BOARD_SIZE.x, (size.y - 120.0) / BOARD_SIZE.y)


func _set_zoom(value: float, screen_position: Vector2) -> void:
	_cancel_camera_tween()
	var target := clampf(value, MIN_ZOOM, MAX_ZOOM)
	var before := _screen_to_world(screen_position)
	battle_camera.zoom = Vector2.ONE * target
	var after := _screen_to_world(screen_position)
	battle_camera.position += before - after
	battle_camera.position = _clamp_camera_position(battle_camera.position)


func _animate_camera(target: Vector2, zoom_value: float) -> void:
	if is_instance_valid(_camera_tween): _camera_tween.kill()
	var target_zoom := clampf(zoom_value, MIN_ZOOM, MAX_ZOOM)
	var target_position := _clamp_camera_position_for_zoom(target, target_zoom)
	_camera_tween = create_tween().set_parallel(true)
	_camera_tween.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_camera_tween.tween_property(battle_camera, "position", target_position, 0.32)
	_camera_tween.tween_property(battle_camera, "zoom", Vector2.ONE * target_zoom, 0.32)


func _clamp_camera_position(value: Vector2) -> Vector2:
	return _clamp_camera_position_for_zoom(value, battle_camera.zoom.x)


func _clamp_camera_position_for_zoom(value: Vector2, zoom: float) -> Vector2:
	var viewport_size := get_viewport_rect().size
	var safe := _safe_viewport_rect()
	var safe_half := safe.size * 0.5 / maxf(0.01, zoom)
	var safe_offset := (viewport_size * 0.5 - safe.get_center()) / maxf(0.01, zoom)
	var minimum := safe_half + safe_offset
	var maximum := BOARD_SIZE - safe_half + safe_offset
	var centered := BOARD_SIZE * 0.5 + safe_offset
	return Vector2(centered.x if minimum.x > maximum.x else clampf(value.x, minimum.x, maximum.x), centered.y if minimum.y > maximum.y else clampf(value.y, minimum.y, maximum.y))


func _screen_to_world(screen: Vector2) -> Vector2:
	return battle_camera.get_screen_center_position() + (screen - get_viewport_rect().size * 0.5) / battle_camera.zoom.x


func _touch_distance() -> float:
	var ids: Array[int] = []
	for raw_id: Variant in _touches.keys(): ids.append(int(raw_id))
	ids.sort()
	return _touches[ids[0]].distance_to(_touches[ids[1]]) if ids.size() >= 2 else 0.0


func _touch_center() -> Vector2:
	var ids: Array[int] = []
	for raw_id: Variant in _touches.keys(): ids.append(int(raw_id))
	ids.sort()
	return (_touches[ids[0]] + _touches[ids[1]]) * 0.5 if ids.size() >= 2 else get_viewport_rect().size * 0.5


func _on_viewport_size_changed() -> void:
	_cancel_camera_tween()
	_update_touch_targets()
	battle_camera.position = _clamp_camera_position(battle_camera.position)
	_place_selection_panel()


func _return_to_strategy() -> void:
	get_tree().change_scene_to_file("res://scenes/presentation/strategy_screen.tscn")


func _sorted_unit_ids() -> Array[String]:
	var ids: Array[String] = []
	for raw_id: Variant in _snapshot.get("units", {}).keys(): ids.append(String(raw_id))
	ids.sort(); return ids


func _terrain_color(name: String) -> Color:
	return {"plain": Color("55735f"), "road": Color("78846b"), "hill": Color("736754"), "forest": Color("3e604f"), "village": Color("8b6f50"), "city": Color("6f5a6e"), "marsh": Color("526b6a"), "river": Color("3d6580")}.get(name, Color("55735f"))


func _cancel_camera_tween() -> void:
	if is_instance_valid(_camera_tween): _camera_tween.kill(); _camera_tween = null


func _safe_viewport_rect() -> Rect2:
	var viewport_size := get_viewport_rect().size
	var margin := 12.0
	var top := 84.0
	var bottom := 12.0
	var physical_size := Vector2(get_tree().root.size)
	# Keep a conservative logical inset for status bars/notches.  The Android
	# platform adapter can provide larger insets later without changing camera
	# ownership or the battlefield contract.
	if physical_size.x > 0 and physical_size.y > 0:
		var canvas_scale := Vector2(viewport_size.x / physical_size.x, viewport_size.y / physical_size.y)
		margin = maxf(margin, 12.0 * canvas_scale.x)
		top = maxf(top, 84.0 * canvas_scale.y)
		bottom = maxf(bottom, 12.0 * canvas_scale.y)
	return Rect2(Vector2(margin, top), Vector2(maxf(1.0, viewport_size.x - margin * 2.0), maxf(1.0, viewport_size.y - top - bottom)))


func _update_touch_targets() -> void:
	if not is_instance_valid(_move_button) or not is_instance_valid(_back_button): return
	var viewport_size := get_viewport_rect().size
	var physical_size := Vector2(get_tree().root.size)
	var canvas_to_physical := minf(physical_size.x / maxf(1.0, viewport_size.x), physical_size.y / maxf(1.0, viewport_size.y))
	var scale := clampf(48.0 / (46.0 * maxf(0.01, canvas_to_physical)), 1.0, 2.2)
	for button: Button in [_move_button, _attack_button, _skill_button, _wait_button]: button.custom_minimum_size = Vector2(52, 46) * scale
	_back_button.custom_minimum_size = Vector2(150, 48) * scale
