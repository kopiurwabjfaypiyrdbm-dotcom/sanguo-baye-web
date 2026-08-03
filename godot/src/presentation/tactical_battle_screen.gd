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
const SafeArea = preload("res://src/presentation/safe_area_margin.gd")
const TACTICAL_PAUSE_PATH := "user://godot-tactical-pause.json"

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
var _round_label: Label
var _phase_label: Label
var _unit_count_label: Label
var _hint_label: Label
var _selection_panel: PanelContainer
var _selection_label: Label
var _move_button: Button
var _attack_button: Button
var _skill_button: Button
var _wait_button: Button
var _back_button: Button
var _settings_button: Button
var _turn_button: Button
var _settle_button: Button
var _settings_panel: PanelContainer
var _text_scale_option: OptionButton
var _high_contrast_toggle: CheckButton
var _reduced_motion_toggle: CheckButton
var _hints_toggle: CheckButton
var _settings_close_button: Button
var _top_bar: PanelContainer
var _turn_bar: PanelContainer
var _text_scale := 1.0
var _high_contrast := false
var _reduced_motion := false
var _show_hints := true
var _compact_layout := false


func _ready() -> void:
	_build_interface()
	var recovered_snapshot := _load_pause_snapshot()
	_session = Session.from_snapshot(recovered_snapshot if not recovered_snapshot.is_empty() else DemoFactory.create_snapshot())
	if _session == null:
		_set_status("战场样片状态校验失败", Color(0.95, 0.4, 0.35))
		return
	_snapshot = _session.snapshot()
	battle_camera.position = BOARD_SIZE * 0.5
	battle_camera.zoom = Vector2.ONE
	_refresh_view()
	get_viewport().size_changed.connect(_on_viewport_size_changed)
	_apply_responsive_layout()
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
			draw_rect(rect, Color(0.95, 0.98, 1.0, 0.5) if _high_contrast else Color(0.68, 0.78, 0.78, 0.26), false, 1.0)
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
		var side_color := Color("2b8fd1") if unit.get("side") == "attacker" else Color("d63e57") if _high_contrast else (Color("4f9fc1") if unit.get("side") == "attacker" else Color("ba5d67"))
		draw_circle(center, 25.0, side_color)
		draw_circle(center, 25.0, Color("f6edcf"), false, 2.0)
		if String(raw_id) == _selected_unit_id:
			draw_arc(center, 33.0, 0.0, TAU, 32, Color("f7d36b"), 5.0)
		var label := String(unit.get("name", raw_id))
		draw_string(font, center + Vector2(-30, 5), label, HORIZONTAL_ALIGNMENT_CENTER, 60, 15, Color("fff8e6"))
		draw_string(font, rect.position + Vector2(8, 80), "%d" % int(unit.get("troops", 0)), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("ecf6f0"))


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		if is_instance_valid(_settings_panel) and _settings_panel.visible:
			_close_settings()
		else:
			_return_to_strategy()
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton:
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
	_top_bar = PanelContainer.new(); _top_bar.name = "TopBar"; _top_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top_bar.set_anchors_preset(Control.PRESET_TOP_WIDE); _top_bar.offset_bottom = 78.0
	var top_margin := MarginContainer.new(); top_margin.add_theme_constant_override("margin_left", 18); top_margin.add_theme_constant_override("margin_right", 18); top_margin.add_theme_constant_override("margin_top", 10); top_margin.add_theme_constant_override("margin_bottom", 10); _top_bar.add_child(top_margin)
	var top_row := HBoxContainer.new(); top_row.add_theme_constant_override("separation", 14); top_margin.add_child(top_row)
	var title := Label.new(); title.name = "TitleLabel"; title.text = "战术战场 · 原生战术 HUD"; title.add_theme_color_override("font_color", Color("f7d36b")); title.add_theme_font_size_override("font_size", 21); top_row.add_child(title)
	_round_label = Label.new(); _round_label.name = "RoundLabel"; top_row.add_child(_round_label)
	_phase_label = Label.new(); _phase_label.name = "PhaseLabel"; top_row.add_child(_phase_label)
	_unit_count_label = Label.new(); _unit_count_label.name = "UnitCountLabel"; top_row.add_child(_unit_count_label)
	_hint_label = Label.new(); _hint_label.name = "HintLabel"; _hint_label.text = "拖动平移 · 滚轮/双指缩放 · 点击选中"; _hint_label.add_theme_color_override("font_color", Color("b7c9c6")); _hint_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL; _hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT; top_row.add_child(_hint_label)
	_settings_button = Button.new(); _settings_button.text = "设置"; _settings_button.custom_minimum_size = Vector2(78, 48); _settings_button.pressed.connect(_open_settings); top_row.add_child(_settings_button)
	_back_button = Button.new(); _back_button.text = "返回战略地图"; _back_button.custom_minimum_size = Vector2(150, 48); _back_button.pressed.connect(_return_to_strategy); top_row.add_child(_back_button)
	overlay.add_child(_top_bar)
	_status_label = Label.new(); _status_label.position = Vector2(20, 84); _status_label.add_theme_font_size_override("font_size", 18); _status_label.add_theme_color_override("font_color", Color("eaf4ef")); _status_label.mouse_filter = Control.MOUSE_FILTER_IGNORE; overlay.add_child(_status_label)
	_selection_panel = PanelContainer.new(); _selection_panel.custom_minimum_size = Vector2(260, 190); _selection_panel.mouse_filter = Control.MOUSE_FILTER_STOP; overlay.add_child(_selection_panel)
	var margin := MarginContainer.new(); margin.add_theme_constant_override("margin_left", 14); margin.add_theme_constant_override("margin_top", 12); margin.add_theme_constant_override("margin_right", 14); margin.add_theme_constant_override("margin_bottom", 12); _selection_panel.add_child(margin)
	var column := VBoxContainer.new(); column.add_theme_constant_override("separation", 7); margin.add_child(column)
	_selection_label = Label.new(); _selection_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; column.add_child(_selection_label)
	var actions := HBoxContainer.new(); actions.add_theme_constant_override("separation", 5); column.add_child(actions)
	_move_button = _action_button("移动", _on_move_pressed, actions)
	_attack_button = _action_button("攻击", _on_attack_pressed, actions)
	_skill_button = _action_button("计谋", _on_skill_pressed, actions)
	_wait_button = _action_button("休整", _on_wait_pressed, actions)
	_turn_bar = PanelContainer.new(); _turn_bar.name = "TurnBar"; _turn_bar.set_anchors_preset(Control.PRESET_BOTTOM_WIDE); _turn_bar.offset_top = -68.0; _turn_bar.mouse_filter = Control.MOUSE_FILTER_STOP
	var turn_margin := MarginContainer.new(); turn_margin.add_theme_constant_override("margin_left", 18); turn_margin.add_theme_constant_override("margin_right", 18); turn_margin.add_theme_constant_override("margin_top", 8); turn_margin.add_theme_constant_override("margin_bottom", 8); _turn_bar.add_child(turn_margin)
	var turn_row := HBoxContainer.new(); turn_row.add_theme_constant_override("separation", 8); turn_margin.add_child(turn_row)
	var turn_hint := Label.new(); turn_hint.text = "行动完成后结束本方回合"; turn_hint.add_theme_color_override("font_color", Color("b7c9c6")); turn_hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL; turn_row.add_child(turn_hint)
	_turn_button = Button.new(); _turn_button.text = "结束本方回合"; _turn_button.custom_minimum_size = Vector2(148, 48); _turn_button.pressed.connect(_on_end_side_turn); turn_row.add_child(_turn_button)
	_settle_button = Button.new(); _settle_button.text = "查看战果"; _settle_button.custom_minimum_size = Vector2(112, 48); _settle_button.pressed.connect(_on_settle_pressed); turn_row.add_child(_settle_button)
	overlay.add_child(_turn_bar)
	_build_settings_panel()
	_update_touch_targets()


func _action_button(text: String, callback: Callable, parent: Node) -> Button:
	var button := Button.new(); button.text = text; button.custom_minimum_size = Vector2(52, 46); button.pressed.connect(callback); parent.add_child(button); return button


func _build_settings_panel() -> void:
	_settings_panel = PanelContainer.new()
	_settings_panel.name = "SettingsPanel"
	_settings_panel.custom_minimum_size = Vector2(360, 280)
	_settings_panel.visible = false
	_settings_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	overlay.add_child(_settings_panel)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 18)
	margin.add_theme_constant_override("margin_right", 18)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 16)
	_settings_panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)
	var title := Label.new()
	title.text = "战术显示与辅助功能"
	title.add_theme_color_override("font_color", Color("f7d36b"))
	column.add_child(title)
	var scale_label := Label.new()
	scale_label.text = "文字大小"
	column.add_child(scale_label)
	_text_scale_option = OptionButton.new()
	_text_scale_option.add_item("标准")
	_text_scale_option.set_item_metadata(0, 1.0)
	_text_scale_option.add_item("大字")
	_text_scale_option.set_item_metadata(1, 1.2)
	_text_scale_option.select(0)
	_text_scale_option.item_selected.connect(_on_text_scale_selected)
	column.add_child(_text_scale_option)
	_high_contrast_toggle = CheckButton.new()
	_high_contrast_toggle.text = "高对比度地图与反馈"
	_high_contrast_toggle.toggled.connect(_on_high_contrast_toggled)
	column.add_child(_high_contrast_toggle)
	_reduced_motion_toggle = CheckButton.new()
	_reduced_motion_toggle.text = "减少镜头动画"
	_reduced_motion_toggle.toggled.connect(_on_reduced_motion_toggled)
	column.add_child(_reduced_motion_toggle)
	_hints_toggle = CheckButton.new()
	_hints_toggle.text = "显示操作提示"
	_hints_toggle.button_pressed = true
	_hints_toggle.toggled.connect(_on_hints_toggled)
	column.add_child(_hints_toggle)
	_settings_close_button = Button.new()
	_settings_close_button.text = "完成"
	_settings_close_button.pressed.connect(_close_settings)
	column.add_child(_settings_close_button)


func _open_settings() -> void:
	_settings_panel.visible = true
	_apply_responsive_layout()
	_settings_close_button.grab_focus()


func _close_settings() -> void:
	_settings_panel.visible = false
	_settings_button.grab_focus()


func _on_text_scale_selected(index: int) -> void:
	_text_scale = float(_text_scale_option.get_item_metadata(index))
	_apply_responsive_layout()


func _on_high_contrast_toggled(enabled: bool) -> void:
	_high_contrast = enabled
	queue_redraw()
	_apply_feedback_style()


func _on_reduced_motion_toggled(enabled: bool) -> void:
	_reduced_motion = enabled


func _on_hints_toggled(enabled: bool) -> void:
	_show_hints = enabled
	_hint_label.visible = enabled


func _on_end_side_turn() -> void:
	_execute_command("end_side_turn", {})


func _on_settle_pressed() -> void:
	if str(_snapshot.get("status", "ongoing")) == "ongoing":
		_set_status("战斗尚未结束，暂不能查看战果", Color("f0c674"))
		return
	_execute_command("settle_battle", {})


func _refresh_view() -> void:
	_refresh_selection()
	_refresh_hud()
	_set_status("%s行动 · 选择单位或地图格开始" % ("攻方" if _snapshot.get("activeSide") == "attacker" else "守方"), Color("d8e9df"))
	queue_redraw()


func _refresh_hud() -> void:
	if not is_instance_valid(_round_label):
		return
	var day := int(_snapshot.get("day", 0))
	var max_days := int(_snapshot.get("maxDays", 0))
	_round_label.text = "第 %d/%d 天" % [day, max_days]
	_phase_label.text = "%s" % _phase_label_text()
	var alive := 0
	var total: int = (_snapshot.get("units", {}) as Dictionary).size()
	for raw_id: Variant in _sorted_unit_ids():
		if int(_snapshot.get("units", {}).get(String(raw_id), {}).get("troops", 0)) > 0:
			alive += 1
	_unit_count_label.text = "存活 %d/%d" % [alive, total]
	_turn_button.disabled = str(_snapshot.get("status", "ongoing")) != "ongoing"
	_settle_button.visible = str(_snapshot.get("status", "ongoing")) != "ongoing"
	_settle_button.disabled = false
	_hint_label.visible = _show_hints


func _phase_label_text() -> String:
	var status := str(_snapshot.get("status", "ongoing"))
	if status != "ongoing":
		return "战斗%s" % str(_snapshot.get("outcome", status))
	return "%s回合" % ("攻方" if str(_snapshot.get("activeSide", "attacker")) == "attacker" else "守方")


func _refresh_selection() -> void:
	if _selected_unit_id.is_empty():
		_selection_panel.visible = false; return
	var unit: Dictionary = _snapshot.get("units", {}).get(_selected_unit_id, {})
	_selection_panel.visible = true
	_selection_label.text = "%s\n%s · %d/%d 兵 · %s · 力%d 智%d" % [unit.get("name", _selected_unit_id), "攻方" if unit.get("side") == "attacker" else "守方", int(unit.get("troops", 0)), int(unit.get("originalTroops", unit.get("troops", 0))), "可行动" if not unit.get("acted", false) else "已行动", int(unit.get("force", 0)), int(unit.get("intelligence", 0))]
	var active: bool = unit.get("side") == _snapshot.get("activeSide") and int(unit.get("troops", 0)) > 0 and not bool(unit.get("acted", false)) and _snapshot.get("status") == "ongoing"
	_move_button.disabled = not active or Battlefield.reachable(_snapshot, _selected_unit_id).is_empty()
	_attack_button.disabled = not active or BattleAttack.attackable_ids(_snapshot, _selected_unit_id).is_empty()
	_skill_button.disabled = not active or not BattleSkill.available(_snapshot, _selected_unit_id, BattleSkill.SKILL_ID)
	_wait_button.disabled = not active
	if is_instance_valid(_settings_panel) and _settings_panel.visible:
		_settings_panel.move_to_front()
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
	_refresh_selection(); _refresh_hud(); queue_redraw()


func _command_label(kind: String) -> String:
	return {"move_unit": "移动", "attack_unit": "攻击", "use_skill": "计谋", "wait_unit": "休整", "end_side_turn": "结束回合", "settle_battle": "结算"}.get(kind, kind)


func _set_status(text: String, color: Color) -> void:
	if is_instance_valid(_status_label):
		_status_label.text = text
		_status_label.add_theme_color_override("font_color", color)
		_status_label.tooltip_text = text


func _apply_feedback_style() -> void:
	if not is_instance_valid(_status_label):
		return
	_status_label.add_theme_color_override("font_color", Color("ffffff") if _high_contrast else Color("eaf4ef"))
	if is_instance_valid(_selection_panel):
		_selection_panel.modulate = Color("ffffff") if _high_contrast else Color("e7f1ec")


func _apply_responsive_layout() -> void:
	var physical_size := DisplayServer.window_get_size()
	if physical_size.x <= 1 or physical_size.y <= 1:
		physical_size = Vector2i(get_viewport_rect().size.round())
	_apply_responsive_layout_for_size(physical_size)


func _apply_responsive_layout_for_size(physical_size: Vector2i) -> void:
	var canvas_scale := minf(float(physical_size.x) / 1280.0, float(physical_size.y) / 720.0)
	var safe_rect := SafeArea.compute_safe_rect(get_viewport_rect().size)
	var safe_left := safe_rect.position.x
	var safe_right := get_viewport_rect().size.x - safe_rect.end.x
	var compact := physical_size.x <= 900 or physical_size.y <= 440
	_compact_layout = compact
	var scale := maxf(canvas_scale, 0.01)
	var touch_size := ceilf(48.0 / scale)
	var body_size := ceili((15.0 if compact else 18.0) * _text_scale / scale)
	var action_size := ceili(17.0 * _text_scale / scale)
	for button: Button in [_move_button, _attack_button, _skill_button, _wait_button, _settings_button, _back_button, _turn_button, _settle_button, _settings_close_button]:
		if is_instance_valid(button):
			button.custom_minimum_size.y = touch_size
			button.add_theme_font_size_override("font_size", action_size)
	for label: Label in [_status_label, _round_label, _phase_label, _unit_count_label, _hint_label, _selection_label]:
		if is_instance_valid(label):
			label.add_theme_font_size_override("font_size", body_size)
	if is_instance_valid(_top_bar):
		_top_bar.offset_left = safe_left
		_top_bar.offset_right = -safe_right
		_top_bar.offset_bottom = touch_size + 22.0
	if is_instance_valid(_turn_bar):
		_turn_bar.offset_left = safe_left
		_turn_bar.offset_right = -safe_right
		_turn_bar.offset_top = -(touch_size + 18.0)
	if is_instance_valid(_settings_panel):
		_settings_panel.custom_minimum_size = Vector2(ceilf(360.0 / scale), ceilf(290.0 / scale))
		_settings_panel.position = safe_rect.position + (safe_rect.size - _settings_panel.custom_minimum_size) * 0.5
	if is_instance_valid(_selection_panel):
		_selection_panel.custom_minimum_size = Vector2(ceilf((300.0 if compact else 330.0) / scale), ceilf((188.0 if compact else 190.0) / scale))
	_apply_feedback_style()
	_update_touch_targets()
	_place_selection_panel()


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
	if _reduced_motion:
		_cancel_camera_tween()
		battle_camera.position = _clamp_camera_position_for_zoom(target, clampf(zoom_value, MIN_ZOOM, MAX_ZOOM))
		battle_camera.zoom = Vector2.ONE * clampf(zoom_value, MIN_ZOOM, MAX_ZOOM)
		return
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
	_apply_responsive_layout()
	_update_touch_targets()
	battle_camera.position = _clamp_camera_position(battle_camera.position)
	_place_selection_panel()


func _return_to_strategy() -> void:
	if FileAccess.file_exists(TACTICAL_PAUSE_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(TACTICAL_PAUSE_PATH))
	var error := get_tree().change_scene_to_file("res://scenes/presentation/strategy_screen.tscn")
	if error != OK:
		_set_status("无法返回战略地图：错误 %d" % error, Color("f38c78"))


func _handle_system_back() -> bool:
	if is_instance_valid(_settings_panel) and _settings_panel.visible:
		_close_settings()
		return true
	return false


func _on_application_paused() -> void:
	_save_pause_snapshot()
	_set_status("应用已暂停；战术状态已写入恢复检查点", Color("f3cf72"))


func _on_application_resumed() -> void:
	_set_status("应用已恢复；战术状态保持确定性", Color("9be59f"))


func _save_pause_snapshot() -> void:
	if not is_instance_valid(_session):
		return
	var payload := {"version": 1, "stateSha256": _session.state_sha256(), "battle": _session.snapshot()}
	var file := FileAccess.open(TACTICAL_PAUSE_PATH, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(payload))
		file.close()


func _load_pause_snapshot() -> Dictionary:
	if not FileAccess.file_exists(TACTICAL_PAUSE_PATH):
		return {}
	var file := FileAccess.open(TACTICAL_PAUSE_PATH, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	if not parsed is Dictionary or int(parsed.get("version", -1)) != 1 or not parsed.get("battle", {}) is Dictionary:
		return {}
	var battle: Dictionary = parsed["battle"]
	var digest := Canonical.try_sha256(battle)
	if not bool(digest.get("ok", false)) or str(digest.get("value", "")) != str(parsed.get("stateSha256", "")):
		return {}
	return battle


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
	var top := 104.0
	var bottom := 72.0
	var platform_safe := SafeArea.compute_safe_rect(viewport_size)
	var left_margin := maxf(margin, platform_safe.position.x)
	var right_margin := maxf(margin, viewport_size.x - platform_safe.end.x)
	top = maxf(top, platform_safe.position.y)
	bottom = maxf(bottom, viewport_size.y - platform_safe.end.y)
	var physical_size := Vector2(get_tree().root.size)
	# Keep a conservative logical inset for status bars/notches.  The Android
	# platform adapter can provide larger insets later without changing camera
	# ownership or the battlefield contract.
	if physical_size.x > 0 and physical_size.y > 0:
		var canvas_scale := Vector2(viewport_size.x / physical_size.x, viewport_size.y / physical_size.y)
		left_margin = maxf(left_margin, 12.0 * canvas_scale.x)
		right_margin = maxf(right_margin, 12.0 * canvas_scale.x)
		top = maxf(top, 104.0 * canvas_scale.y)
		bottom = maxf(bottom, 72.0 * canvas_scale.y)
	return Rect2(Vector2(left_margin, top), Vector2(maxf(1.0, viewport_size.x - left_margin - right_margin), maxf(1.0, viewport_size.y - top - bottom)))


func _update_touch_targets() -> void:
	if not is_instance_valid(_move_button) or not is_instance_valid(_back_button): return
	var viewport_size := get_viewport_rect().size
	var physical_size := Vector2(get_tree().root.size)
	var canvas_to_physical := minf(physical_size.x / maxf(1.0, viewport_size.x), physical_size.y / maxf(1.0, viewport_size.y))
	var scale := clampf(48.0 / (46.0 * maxf(0.01, canvas_to_physical)), 1.0, 2.2)
	for button: Button in [_move_button, _attack_button, _skill_button, _wait_button]: button.custom_minimum_size = Vector2(maxf(52.0, 72.0 * scale), 48.0 * scale)
	_back_button.custom_minimum_size = Vector2(maxf(150.0, 150.0 * scale), 48.0 * scale)
	if is_instance_valid(_settings_button): _settings_button.custom_minimum_size = Vector2(maxf(78.0, 88.0 * scale), 48.0 * scale)
	if is_instance_valid(_turn_button): _turn_button.custom_minimum_size = Vector2(maxf(148.0, 148.0 * scale), 48.0 * scale)
	if is_instance_valid(_settle_button): _settle_button.custom_minimum_size = Vector2(maxf(112.0, 112.0 * scale), 48.0 * scale)
