## Native Godot presentation/application boundary for the migration spike.
## GameSession owns all state transitions; this Node only submits intent and renders snapshots.
extends Node2D

const GAME_SESSION_SCRIPT := preload("res://src/application/game_session/game_session.gd")

const EXPECTED_CITY_COUNT := 38
const EXPECTED_ROAD_COUNT := 54
const MOUSE_DRAG_THRESHOLD := 9.0
const TOUCH_DRAG_THRESHOLD := 14.0
const TAP_MAX_DURATION_SECONDS := 0.48
const MIN_ZOOM := 0.68
const MAX_ZOOM := 2.35
const ZOOM_STEP := 1.14

@onready var map_world: StrategyMapWorld = %MapWorld
@onready var map_camera: Camera2D = %MapCamera
@onready var safe_area: SafeAreaMargin = %SafeArea
@onready var top_panel: PanelContainer = %TopPanel
@onready var bottom_panel: PanelContainer = %BottomPanel
@onready var title_label: Label = %TitleLabel
@onready var year_label: Label = %YearLabel
@onready var seed_label: Label = %SeedLabel
@onready var status_badge_panel: PanelContainer = %StatusBadgePanel
@onready var status_badge: Label = %StatusBadge
@onready var status_line: Label = %StatusLine
@onready var world_button: Button = %WorldButton
@onready var player_button: Button = %PlayerButton
@onready var save_button: Button = %SaveButton
@onready var load_button: Button = %LoadButton
@onready var city_card: CityCard = %CityCard

var _session: Object
var _snapshot: Dictionary = {}
var _selected_city_id := ""
var _camera_tween: Tween
var _compact_layout := false
var _command_serial := 0
var _spike_persistence_enabled := false

var _mouse_pressed := false
var _mouse_dragging := false
var _mouse_press_position := Vector2.ZERO
var _mouse_last_position := Vector2.ZERO
var _mouse_press_time := 0.0

var _touches: Dictionary = {}
var _touch_origins: Dictionary = {}
var _touch_press_times: Dictionary = {}
var _touch_dragged: Dictionary = {}
var _touch_had_multitouch: Dictionary = {}
var _pinch_last_distance := 0.0
var _pinch_last_center := Vector2.ZERO


func _ready() -> void:
	_configure_localized_ui()
	_connect_ui()
	get_viewport().size_changed.connect(_on_viewport_size_changed)
	_session = GAME_SESSION_SCRIPT.new()
	var result := _call_session("start_period_1")
	if not bool(result.get("ok", false)):
		_set_status(tr("时期 1 载入失败：%s") % _result_error(result), "error")
		return
	_refresh_snapshot(false)
	_spike_persistence_enabled = bool(_as_dictionary(result.get("campaign", {})).get("legacySpike", false))
	save_button.disabled = not _spike_persistence_enabled
	load_button.disabled = not _spike_persistence_enabled
	if not _spike_persistence_enabled:
		save_button.tooltip_text = tr("生产存档将在 MB20 实现")
		load_button.tooltip_text = tr("生产存档将在 MB20 实现")
	_set_status(tr("已载入时期 1 · 拖动地图，点击城池下令"), "ready")
	call_deferred("_focus_world")


func _process(_delta: float) -> void:
	if city_card.visible and not _selected_city_id.is_empty():
		city_card.place_near(
			map_world.get_city_screen_position(_selected_city_id),
			_get_card_usable_rect()
		)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		_handle_mouse_button(event)
	elif event is InputEventMouseMotion:
		_handle_mouse_motion(event)
	elif event is InputEventScreenTouch:
		_handle_screen_touch(event)
	elif event is InputEventScreenDrag:
		_handle_screen_drag(event)
	elif event is InputEventMagnifyGesture:
		_zoom_around_screen_point(map_camera.zoom.x * event.factor, event.position, true)
		get_viewport().set_input_as_handled()


func _configure_localized_ui() -> void:
	title_label.text = tr("三国霸业 · 原生样片")
	world_button.tooltip_text = tr("平滑缩放至完整战略地图")
	player_button.tooltip_text = tr("定位并选择玩家城池")
	save_button.tooltip_text = tr("保存当前最小 GameState")
	load_button.tooltip_text = tr("重建 GameSession 并载入存档")
	_apply_responsive_labels()


func _connect_ui() -> void:
	world_button.pressed.connect(_focus_world)
	player_button.pressed.connect(_focus_player_city)
	save_button.pressed.connect(_save_game)
	load_button.pressed.connect(_load_game)
	city_card.command_requested.connect(_execute_internal_command)
	city_card.close_requested.connect(_close_city_card)


func _refresh_snapshot(keep_card_open: bool = true) -> bool:
	if not is_instance_valid(_session) or not _session.has_method("snapshot"):
		_set_status(tr("GameSession 未提供 snapshot()"), "error")
		return false
	var value: Variant = _session.call("snapshot")
	if not value is Dictionary:
		_set_status(tr("GameSession snapshot() 返回格式无效"), "error")
		return false
	_snapshot = value as Dictionary
	map_world.rebuild(_snapshot)
	_update_hud_from_snapshot()

	var city_ids := map_world.get_ordered_city_ids()
	if city_ids.size() != EXPECTED_CITY_COUNT or map_world.get_road_count() != EXPECTED_ROAD_COUNT:
		_set_status(
			tr("地图契约异常：%d 城 / %d 条互惠道路") % [city_ids.size(), map_world.get_road_count()],
			"warning"
		)

	if not _selected_city_id.is_empty() and not city_ids.has(_selected_city_id):
		_selected_city_id = ""
	map_world.set_selected_city(_selected_city_id)
	if keep_card_open and city_card.visible and not _selected_city_id.is_empty():
		_show_selected_city_card()
	return true


func _update_hud_from_snapshot() -> void:
	var calendar := _as_dictionary(_snapshot.get("calendar", {}))
	if _compact_layout:
		year_label.text = tr("%d 年 %d 月") % [
			int(calendar.get("year", 0)),
			int(calendar.get("month", 0)),
		]
		seed_label.text = tr("种 %d") % int(_snapshot.get("rngSeed", 0))
	else:
		year_label.text = tr("公元 %d 年 · %d 月") % [
			int(calendar.get("year", 0)),
			int(calendar.get("month", 0)),
		]
		seed_label.text = tr("种子 %d") % int(_snapshot.get("rngSeed", 0))


func _select_city(city_id: String) -> void:
	if city_id.is_empty():
		return
	_selected_city_id = city_id
	map_world.set_selected_city(city_id)
	_show_selected_city_card()
	var city := _as_dictionary(_as_dictionary(_snapshot.get("cities", {})).get(city_id, {}))
	_set_status(tr("已选择 %s") % str(city.get("name", city_id)), "ready")
	var target_zoom := maxf(map_camera.zoom.x, 0.92)
	_animate_camera_to(map_world.get_city_world_position(city_id), target_zoom, 0.32)


func _show_selected_city_card() -> void:
	var command_queries: Array = []
	if is_instance_valid(_session) and _session.has_method("city_query"):
		var query: Variant = _session.call("city_query", _selected_city_id)
		if query is Dictionary:
			var raw_commands: Variant = query.get("internalAffairs", [])
			if raw_commands is Array:
				command_queries = raw_commands
	city_card.show_city(_snapshot, _selected_city_id, command_queries)
	city_card.place_near(map_world.get_city_screen_position(_selected_city_id), _get_card_usable_rect())


func _close_city_card() -> void:
	city_card.hide()
	_selected_city_id = ""
	map_world.set_selected_city("")


func _execute_internal_command(kind: String, parameters: Dictionary) -> void:
	var label: String = _internal_command_label(kind)
	_set_interaction_busy(true)
	_set_status(tr("正在执行%s……") % label, "busy")
	_command_serial += 1
	var before_digest: String = str(_session.call("state_sha256"))
	var result := _call_session("execute_command", [{
		"commandEnvelopeVersion": 1,
		"commandId": "strategy-screen-%06d" % _command_serial,
		"expectedStateSha256": before_digest,
		"kind": kind,
		"parameters": parameters.duplicate(true),
	}])
	_set_interaction_busy(false)
	if not bool(result.get("ok", false)):
		_set_status(tr("%s失败：%s") % [label, _result_error(result)], "error")
		return
	_refresh_snapshot(true)
	var city_id: String = str(parameters.get("cityId", ""))
	var city := _as_dictionary(_as_dictionary(_snapshot.get("cities", {})).get(city_id, {}))
	_set_status(
		tr("%s %s完成 · 金 %d · 粮 %d · 种子 %d") % [
			str(city.get("name", city_id)),
			label,
			int(city.get("money", 0)),
			int(city.get("food", 0)),
			int(_snapshot.get("rngSeed", 0)),
		],
		"success"
	)


func _execute_develop_farming(city_id: String, officer_id: String) -> void:
	_execute_internal_command(
		"develop_farming", {"cityId": city_id, "officerId": officer_id}
	)


func _internal_command_label(kind: String) -> String:
	return {
		"develop_farming": tr("开垦"),
		"develop_commerce": tr("招商"),
		"govern_city": tr("治理"),
		"inspect_city": tr("出巡"),
		"trade_food": tr("交易"),
		"banquet_officer": tr("宴请"),
		"plunder_city": tr("掠夺"),
	}.get(kind, kind)


func _save_game() -> void:
	if not _spike_persistence_enabled:
		_set_status(tr("生产存档将在 MB20 实现"), "warning")
		return
	_set_interaction_busy(true)
	var result := _call_session("save_game")
	_set_interaction_busy(false)
	if bool(result.get("ok", false)):
		_set_status(tr("存档已写入 user://godot-spike-save.json"), "success")
	else:
		_set_status(tr("保存失败：%s") % _result_error(result), "error")


func _load_game() -> void:
	if not _spike_persistence_enabled:
		_set_status(tr("生产存档将在 MB20 实现"), "warning")
		return
	_set_interaction_busy(true)
	# Recreating the facade verifies the save is not relying on scene-memory state.
	var replacement: Object = GAME_SESSION_SCRIPT.new()
	var result := _call_on(replacement, "load_game")
	if bool(result.get("ok", false)):
		_session = replacement
		_refresh_snapshot(true)
		_set_status(tr("已从存档重建 GameSession"), "success")
	else:
		_set_status(tr("载入失败：%s") % _result_error(result), "error")
	_set_interaction_busy(false)


func _focus_world() -> void:
	if _snapshot.is_empty():
		return
	var bounds := map_world.get_map_bounds()
	var viewport_size := get_viewport_rect().size
	var available := Vector2(maxf(320.0, viewport_size.x - 72.0), maxf(220.0, viewport_size.y - 154.0))
	var fit_zoom := clampf(minf(available.x / bounds.size.x, available.y / bounds.size.y), MIN_ZOOM, 1.28)
	_animate_camera_to(bounds.get_center(), fit_zoom, 0.48)
	_set_status(tr("已定位完整战略地图"), "ready")


func _focus_player_city() -> void:
	var player_faction_id := str(_snapshot.get("playerFactionId", ""))
	var cities := _as_dictionary(_snapshot.get("cities", {}))
	for city_id in map_world.get_ordered_city_ids():
		var city := _as_dictionary(cities.get(city_id, {}))
		if str(city.get("ownerId", "")) == player_faction_id:
			_select_city(city_id)
			return
	_set_status(tr("当前快照没有玩家城池"), "warning")


func _handle_mouse_button(event: InputEventMouseButton) -> void:
	if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
		_zoom_around_screen_point(map_camera.zoom.x * ZOOM_STEP, event.position, true)
		get_viewport().set_input_as_handled()
		return
	if event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
		_zoom_around_screen_point(map_camera.zoom.x / ZOOM_STEP, event.position, true)
		get_viewport().set_input_as_handled()
		return
	if event.button_index != MOUSE_BUTTON_LEFT:
		return
	if event.pressed:
		_mouse_pressed = true
		_mouse_dragging = false
		_mouse_press_position = event.position
		_mouse_last_position = event.position
		_mouse_press_time = Time.get_ticks_msec() / 1000.0
		_kill_camera_tween()
	else:
		if not _mouse_pressed:
			return
		var duration := Time.get_ticks_msec() / 1000.0 - _mouse_press_time
		if not _mouse_dragging and duration <= TAP_MAX_DURATION_SECONDS:
			_handle_tap(event.position, false)
		_mouse_pressed = false
		_mouse_dragging = false
	get_viewport().set_input_as_handled()


func _handle_mouse_motion(event: InputEventMouseMotion) -> void:
	if not _mouse_pressed:
		return
	if not _mouse_dragging and event.position.distance_to(_mouse_press_position) >= MOUSE_DRAG_THRESHOLD:
		_mouse_dragging = true
	if _mouse_dragging:
		_pan_camera(event.position - _mouse_last_position)
	_mouse_last_position = event.position
	get_viewport().set_input_as_handled()


func _handle_screen_touch(event: InputEventScreenTouch) -> void:
	var touch_id := event.index
	if event.pressed:
		_touches[touch_id] = event.position
		_touch_origins[touch_id] = event.position
		_touch_press_times[touch_id] = Time.get_ticks_msec() / 1000.0
		_touch_dragged[touch_id] = false
		_touch_had_multitouch[touch_id] = false
		_kill_camera_tween()
		if _touches.size() >= 2:
			_mark_all_touches_multitouch()
			_reset_pinch_reference()
	else:
		if not _touches.has(touch_id):
			return
		var origin := Vector2(_touch_origins.get(touch_id, event.position))
		var duration := Time.get_ticks_msec() / 1000.0 - float(_touch_press_times.get(touch_id, 0.0))
		var was_dragged := bool(_touch_dragged.get(touch_id, false))
		var was_multitouch := bool(_touch_had_multitouch.get(touch_id, false))
		_touches.erase(touch_id)
		_touch_origins.erase(touch_id)
		_touch_press_times.erase(touch_id)
		_touch_dragged.erase(touch_id)
		_touch_had_multitouch.erase(touch_id)
		if _touches.size() < 2:
			_pinch_last_distance = 0.0
			if _touches.size() == 1:
				var remaining_id: Variant = _touches.keys()[0]
				_touch_origins[remaining_id] = _touches[remaining_id]
		if not was_dragged and not was_multitouch and duration <= TAP_MAX_DURATION_SECONDS and origin.distance_to(event.position) <= TOUCH_DRAG_THRESHOLD:
			if not event.canceled:
				_handle_tap(event.position, true)
	get_viewport().set_input_as_handled()


func _handle_screen_drag(event: InputEventScreenDrag) -> void:
	var touch_id := event.index
	if not _touches.has(touch_id):
		return
	var previous := Vector2(_touches[touch_id])
	_touches[touch_id] = event.position
	if _touches.size() == 1:
		var origin := Vector2(_touch_origins.get(touch_id, event.position))
		if origin.distance_to(event.position) >= TOUCH_DRAG_THRESHOLD:
			_touch_dragged[touch_id] = true
		if bool(_touch_dragged.get(touch_id, false)):
			_pan_camera(event.position - previous)
	else:
		_mark_all_touches_multitouch()
		_handle_pinch_update()
	get_viewport().set_input_as_handled()


func _handle_pinch_update() -> void:
	if _touches.size() < 2:
		return
	var ids := _touches.keys()
	ids.sort()
	var first := Vector2(_touches[ids[0]])
	var second := Vector2(_touches[ids[1]])
	var distance := maxf(1.0, first.distance_to(second))
	var center := (first + second) * 0.5
	if _pinch_last_distance > 0.0:
		var anchor_world := _screen_to_world(_pinch_last_center)
		var new_zoom := clampf(map_camera.zoom.x * distance / _pinch_last_distance, MIN_ZOOM, MAX_ZOOM)
		var viewport_center := get_viewport_rect().get_center()
		var target_position := anchor_world - (center - viewport_center) / new_zoom
		map_camera.zoom = Vector2(new_zoom, new_zoom)
		map_camera.position = _clamp_camera_position(target_position, new_zoom)
	_pinch_last_distance = distance
	_pinch_last_center = center


func _reset_pinch_reference() -> void:
	if _touches.size() < 2:
		_pinch_last_distance = 0.0
		return
	var ids := _touches.keys()
	ids.sort()
	var first := Vector2(_touches[ids[0]])
	var second := Vector2(_touches[ids[1]])
	_pinch_last_distance = maxf(1.0, first.distance_to(second))
	_pinch_last_center = (first + second) * 0.5


func _mark_all_touches_multitouch() -> void:
	for touch_id in _touches.keys():
		_touch_had_multitouch[touch_id] = true
		_touch_dragged[touch_id] = true


func _handle_tap(screen_position: Vector2, is_touch: bool) -> void:
	if is_touch:
		map_world.show_touch_ripple(screen_position)
	var city_id := map_world.pick_city(screen_position)
	if city_id.is_empty():
		_close_city_card()
	else:
		_select_city(city_id)


func _pan_camera(screen_delta: Vector2) -> void:
	_kill_camera_tween()
	var target := map_camera.position - screen_delta / map_camera.zoom.x
	map_camera.position = _clamp_camera_position(target, map_camera.zoom.x)


func _zoom_around_screen_point(requested_zoom: float, screen_anchor: Vector2, smooth: bool) -> void:
	var new_zoom := clampf(requested_zoom, MIN_ZOOM, MAX_ZOOM)
	var anchor_world := _screen_to_world(screen_anchor)
	var viewport_center := get_viewport_rect().get_center()
	var target_position := anchor_world - (screen_anchor - viewport_center) / new_zoom
	if smooth:
		_animate_camera_to(target_position, new_zoom, 0.18)
	else:
		_kill_camera_tween()
		map_camera.zoom = Vector2(new_zoom, new_zoom)
		map_camera.position = _clamp_camera_position(target_position, new_zoom)


func _screen_to_world(screen_position: Vector2) -> Vector2:
	return map_camera.position + (screen_position - get_viewport_rect().get_center()) / map_camera.zoom.x


func _animate_camera_to(target_position: Vector2, target_zoom: float, duration: float) -> void:
	_kill_camera_tween()
	var zoom := clampf(target_zoom, MIN_ZOOM, MAX_ZOOM)
	var clamped_position := _clamp_camera_position(target_position, zoom)
	_camera_tween = create_tween().set_parallel(true)
	_camera_tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_camera_tween.tween_property(map_camera, "position", clamped_position, duration)
	_camera_tween.tween_property(map_camera, "zoom", Vector2(zoom, zoom), duration)


func _kill_camera_tween() -> void:
	if _camera_tween and _camera_tween.is_valid():
		_camera_tween.kill()
	_camera_tween = null


func _clamp_camera_position(target: Vector2, zoom: float) -> Vector2:
	var bounds := map_world.get_map_bounds()
	var half_visible := get_viewport_rect().size / (2.0 * maxf(zoom, 0.01))
	var result := target
	if half_visible.x >= bounds.size.x * 0.5:
		result.x = bounds.get_center().x
	else:
		result.x = clampf(result.x, bounds.position.x + half_visible.x, bounds.end.x - half_visible.x)
	if half_visible.y >= bounds.size.y * 0.5:
		result.y = bounds.get_center().y
	else:
		result.y = clampf(result.y, bounds.position.y + half_visible.y, bounds.end.y - half_visible.y)
	return result


func _get_card_usable_rect() -> Rect2:
	var rect := safe_area.get_safe_rect()
	var top_inset := top_panel.size.y + 10.0
	var bottom_inset := bottom_panel.size.y + 10.0
	return Rect2(
		rect.position + Vector2(0.0, top_inset),
		Vector2(rect.size.x, maxf(0.0, rect.size.y - top_inset - bottom_inset))
	)


func _on_viewport_size_changed() -> void:
	_kill_camera_tween()
	_apply_responsive_labels()
	map_camera.position = _clamp_camera_position(map_camera.position, map_camera.zoom.x)


func _apply_responsive_labels() -> void:
	var physical_size := DisplayServer.window_get_size()
	var compact := physical_size.x <= 900 or physical_size.y <= 440
	var viewport_size := get_viewport_rect().size
	var canvas_scale := minf(
		float(physical_size.x) / maxf(viewport_size.x, 1.0),
		float(physical_size.y) / maxf(viewport_size.y, 1.0)
	)
	_compact_layout = compact
	title_label.visible = not compact
	world_button.text = tr("全图" if compact else "世界全图")
	player_button.text = tr("我方" if compact else "我方城池")
	save_button.text = tr("存" if compact else "保存")
	load_button.text = tr("读" if compact else "读取")

	if compact:
		var touch_size := ceilf(48.0 / maxf(canvas_scale, 0.01))
		var label_font_size := ceili(15.0 / maxf(canvas_scale, 0.01))
		var action_font_size := ceili(17.0 / maxf(canvas_scale, 0.01))
		top_panel.custom_minimum_size = Vector2(0.0, touch_size + 14.0)
		for button: Button in [world_button, player_button, save_button, load_button]:
			button.custom_minimum_size = Vector2(touch_size, touch_size)
			button.add_theme_font_size_override("font_size", action_font_size)
		status_badge_panel.custom_minimum_size = Vector2(touch_size, touch_size)
		year_label.add_theme_font_size_override("font_size", label_font_size)
		seed_label.add_theme_font_size_override("font_size", label_font_size)
		status_badge.add_theme_font_size_override("font_size", label_font_size)
		status_line.add_theme_font_size_override("font_size", ceili(15.0 / maxf(canvas_scale, 0.01)))
	else:
		top_panel.custom_minimum_size = Vector2(0.0, 68.0)
		world_button.custom_minimum_size = Vector2(76.0, 52.0)
		player_button.custom_minimum_size = Vector2(76.0, 52.0)
		save_button.custom_minimum_size = Vector2(68.0, 52.0)
		load_button.custom_minimum_size = Vector2(68.0, 52.0)
		for button: Button in [world_button, player_button, save_button, load_button]:
			button.add_theme_font_size_override("font_size", 18)
		status_badge_panel.custom_minimum_size = Vector2(82.0, 48.0)
		year_label.add_theme_font_size_override("font_size", 18)
		seed_label.add_theme_font_size_override("font_size", 18)
		status_badge.add_theme_font_size_override("font_size", 18)
		status_line.add_theme_font_size_override("font_size", 18)
	map_world.set_minimum_physical_hit_radius(24.0, canvas_scale)
	city_card.apply_responsive_layout(compact, canvas_scale, physical_size)
	if not _snapshot.is_empty():
		_update_hud_from_snapshot()


func _set_interaction_busy(busy: bool) -> void:
	save_button.disabled = busy or not _spike_persistence_enabled
	load_button.disabled = busy or not _spike_persistence_enabled
	world_button.disabled = busy
	player_button.disabled = busy
	city_card.set_busy(busy)


func _set_status(message: String, tone: String) -> void:
	status_line.text = message
	match tone:
		"error":
			status_badge.text = tr("错误")
			status_badge.add_theme_color_override("font_color", Color("#ff9a8a"))
		"warning":
			status_badge.text = tr("检查")
			status_badge.add_theme_color_override("font_color", Color("#ffd074"))
		"busy":
			status_badge.text = tr("处理中")
			status_badge.add_theme_color_override("font_color", Color("#8fc9ff"))
		"success":
			status_badge.text = tr("完成")
			status_badge.add_theme_color_override("font_color", Color("#9be59f"))
		_:
			status_badge.text = tr("就绪")
			status_badge.add_theme_color_override("font_color", Color("#b8dac2"))


func _call_session(method: StringName, arguments: Array = []) -> Dictionary:
	return _call_on(_session, method, arguments)


func _call_on(target: Object, method: StringName, arguments: Array = []) -> Dictionary:
	if not is_instance_valid(target):
		return {"ok": false, "error": tr("GameSession 尚未创建")}
	if not target.has_method(method):
		return {"ok": false, "error": tr("GameSession 缺少 %s()") % str(method)}
	var result: Variant = target.callv(method, arguments)
	if result is Dictionary:
		return result as Dictionary
	return {"ok": false, "error": tr("%s() 返回格式无效") % str(method)}


func _result_error(result: Dictionary) -> String:
	var error: Variant = result.get("error", tr("未知错误"))
	if error is Dictionary:
		return str((error as Dictionary).get("message", error))
	return str(error)


func _as_dictionary(value: Variant) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
