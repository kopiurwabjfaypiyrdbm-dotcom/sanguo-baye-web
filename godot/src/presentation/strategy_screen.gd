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
@onready var chronicle_button: Button = %ChronicleButton
@onready var end_turn_button: Button = %EndTurnButton
@onready var city_card: CityCard = %CityCard
@onready var officer_panel = %OfficerManagementPanel
@onready var personnel_panel = %PersonnelLifecyclePanel
@onready var logistics_panel = %StrategicLogisticsPanel
@onready var reconnaissance_panel: ReconnaissancePanel = %ReconnaissancePanel
@onready var diplomacy_panel = %DiplomaticOrderPanel
@onready var chronicle_panel = %CampaignChroniclePanel

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
	if officer_panel.visible:
		officer_panel.place_in(_get_card_usable_rect())
	if personnel_panel.visible:
		personnel_panel.place_in(_get_card_usable_rect())
	if logistics_panel.visible:
		logistics_panel.place_in(_get_card_usable_rect())
	if reconnaissance_panel.visible:
		reconnaissance_panel.place_in(_get_card_usable_rect())
	if diplomacy_panel.visible:
		diplomacy_panel.place_in(_get_card_usable_rect())
	if chronicle_panel.visible:
		chronicle_panel.place_in(_get_card_usable_rect())


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
	chronicle_button.tooltip_text = tr("查看年月、事件、继承与战役结局")
	end_turn_button.tooltip_text = tr("结束玩家阶段，执行确定性 AI 与月度结算")
	_apply_responsive_labels()


func _connect_ui() -> void:
	world_button.pressed.connect(_focus_world)
	player_button.pressed.connect(_focus_player_city)
	save_button.pressed.connect(_save_game)
	load_button.pressed.connect(_load_game)
	chronicle_button.pressed.connect(_open_chronicle)
	end_turn_button.pressed.connect(_advance_turn_month)
	city_card.command_requested.connect(_execute_internal_command)
	city_card.officer_management_requested.connect(_open_officer_management)
	city_card.personnel_lifecycle_requested.connect(_open_personnel_lifecycle)
	city_card.strategic_logistics_requested.connect(_open_strategic_logistics)
	city_card.reconnaissance_requested.connect(_open_reconnaissance)
	city_card.diplomacy_requested.connect(_open_diplomacy)
	city_card.close_requested.connect(_close_city_card)
	officer_panel.command_requested.connect(_execute_internal_command)
	officer_panel.close_requested.connect(_close_officer_management)
	personnel_panel.command_requested.connect(_execute_internal_command)
	personnel_panel.close_requested.connect(_close_personnel_lifecycle)
	logistics_panel.command_requested.connect(_execute_internal_command)
	logistics_panel.advance_requested.connect(_advance_strategic_logistics)
	logistics_panel.demo_campaign_requested.connect(_start_logistics_demo)
	logistics_panel.route_preview_requested.connect(_preview_logistics_route)
	logistics_panel.close_requested.connect(_close_strategic_logistics)
	reconnaissance_panel.command_requested.connect(_execute_internal_command)
	reconnaissance_panel.target_preview_requested.connect(_preview_reconnaissance)
	reconnaissance_panel.close_requested.connect(_close_reconnaissance)
	diplomacy_panel.command_requested.connect(_execute_internal_command)
	diplomacy_panel.advance_requested.connect(_advance_diplomatic_orders)
	diplomacy_panel.target_preview_requested.connect(_preview_diplomacy)
	diplomacy_panel.close_requested.connect(_close_diplomacy)
	chronicle_panel.close_requested.connect(_close_chronicle)
	chronicle_panel.succession_requested.connect(_resolve_succession)
	chronicle_panel.demo_requested.connect(_run_mb11_demo)


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
	end_turn_button.disabled = str(_snapshot.get("phase", "")) != "player"
	if str(_snapshot.get("phase", "")) in ["succession", "ended"]:
		chronicle_panel.show_state(_snapshot)

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
	_close_officer_management()
	_close_personnel_lifecycle(false)
	_close_strategic_logistics(false)
	_close_reconnaissance(false)
	_close_diplomacy(false)
	_close_chronicle()
	map_world.set_selected_city(city_id)
	_show_selected_city_card()
	var city := _as_dictionary(_as_dictionary(_snapshot.get("cities", {})).get(city_id, {}))
	_set_status(tr("已选择 %s") % str(city.get("name", city_id)), "ready")
	var target_zoom := maxf(map_camera.zoom.x, 0.92)
	_animate_camera_to(map_world.get_city_world_position(city_id), target_zoom, 0.32)


func _show_selected_city_card() -> void:
	var command_queries: Array = []
	if is_instance_valid(_session) and _session.has_method("internal_affairs_query"):
		var query: Variant = _session.call("internal_affairs_query", _selected_city_id)
		if query is Dictionary:
			var raw_commands: Variant = query.get("internalAffairs", [])
			if raw_commands is Array:
				command_queries = raw_commands
	var visibility: Dictionary = {}
	if is_instance_valid(_session) and _session.has_method("city_visibility_query"):
		var visibility_value: Variant = _session.call("city_visibility_query", _selected_city_id)
		if visibility_value is Dictionary: visibility = visibility_value
	city_card.show_city(_snapshot, _selected_city_id, command_queries, visibility)
	city_card.place_near(map_world.get_city_screen_position(_selected_city_id), _get_card_usable_rect())


func _close_city_card() -> void:
	city_card.hide()
	officer_panel.hide()
	personnel_panel.hide()
	logistics_panel.hide()
	reconnaissance_panel.hide()
	diplomacy_panel.hide()
	_preview_logistics_route([])
	map_world.clear_recon_preview()
	map_world.clear_diplomacy_preview()
	_selected_city_id = ""
	map_world.set_selected_city("")


func _open_officer_management(city_id: String) -> void:
	if city_id.is_empty() or not is_instance_valid(_session):
		return
	var query: Variant = _session.call("officer_management_query", city_id)
	if not query is Dictionary or not bool(query.get("found", false)):
		_set_status(tr("人物查询失败"), "error")
		return
	var city: Dictionary = query["city"]
	city_card.hide()
	personnel_panel.hide()
	logistics_panel.hide()
	reconnaissance_panel.hide()
	diplomacy_panel.hide()
	officer_panel.show_city(
		city_id, str(city.get("name", city_id)),
		_as_dictionary(query.get("officerManagement", {}))
	)
	officer_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	officer_panel.place_in(_get_card_usable_rect())
	_set_status(tr("正在管理 %s 的人物与装备") % city.get("name", city_id), "ready")


func _close_officer_management() -> void:
	officer_panel.hide()
	if not _selected_city_id.is_empty():
		_show_selected_city_card()


func _open_personnel_lifecycle(city_id: String) -> void:
	if city_id.is_empty() or not is_instance_valid(_session):
		return
	var query: Variant = _session.call("personnel_lifecycle_query", city_id)
	if not query is Dictionary or not bool(query.get("found", false)):
		_set_status(tr("人才与俘虏查询失败"), "error")
		return
	var city: Dictionary = query["city"]
	city_card.hide()
	officer_panel.hide()
	logistics_panel.hide()
	reconnaissance_panel.hide()
	diplomacy_panel.hide()
	personnel_panel.show_city(
		city_id, str(city.get("name", city_id)),
		_as_dictionary(query.get("personnelLifecycle", {}))
	)
	personnel_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	personnel_panel.place_in(_get_card_usable_rect())
	_set_status(tr("正在管理 %s 的人才与俘虏") % city.get("name", city_id), "ready")


func _close_personnel_lifecycle(show_card: bool = true) -> void:
	personnel_panel.hide()
	reconnaissance_panel.hide()
	diplomacy_panel.hide()
	if show_card and not _selected_city_id.is_empty():
		_show_selected_city_card()


func _open_strategic_logistics(city_id: String) -> void:
	if city_id.is_empty() or not is_instance_valid(_session):
		return
	var query: Variant = _session.call("strategic_logistics_query", city_id)
	if not query is Dictionary or not bool(query.get("found", false)):
		_set_status(tr("战略后勤查询失败"), "error")
		return
	var city: Dictionary = query["city"]
	city_card.hide()
	officer_panel.hide()
	personnel_panel.hide()
	reconnaissance_panel.hide()
	diplomacy_panel.hide()
	logistics_panel.show_city(city_id, str(city.get("name", city_id)), _as_dictionary(query.get("strategicLogistics", {})))
	logistics_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	logistics_panel.place_in(_get_card_usable_rect())
	_set_status(tr("正在规划 %s 的跨城调动与输送") % city.get("name", city_id), "ready")


func _close_strategic_logistics(show_card: bool = true) -> void:
	logistics_panel.hide()
	_preview_logistics_route([])
	if show_card and not _selected_city_id.is_empty():
		_show_selected_city_card()


func _open_reconnaissance(city_id: String) -> void:
	if city_id.is_empty() or not is_instance_valid(_session): return
	var query: Variant = _session.call("reconnaissance_query", city_id)
	if not query is Dictionary or not bool(query.get("found", false)):
		_set_status(tr("侦察查询失败"), "error")
		return
	var source: Dictionary = query["sourceCity"]
	city_card.hide()
	officer_panel.hide()
	personnel_panel.hide()
	logistics_panel.hide()
	diplomacy_panel.hide()
	reconnaissance_panel.show_city(
		city_id, str(source.get("name", city_id)), _as_dictionary(query.get("reconnaissance", {}))
	)
	reconnaissance_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	reconnaissance_panel.place_in(_get_card_usable_rect())
	var catalog: Dictionary = _as_dictionary(query.get("reconnaissance", {}))
	_preview_reconnaissance(city_id, str(catalog.get("defaultTargetCityId", "")))
	_set_status(tr("正在从 %s 规划侦察；敌城数据仅来自已保存快照") % source.get("name", city_id), "ready")


func _close_reconnaissance(show_card: bool = true) -> void:
	reconnaissance_panel.hide()
	map_world.clear_recon_preview()
	if show_card and not _selected_city_id.is_empty(): _show_selected_city_card()


func _refresh_reconnaissance() -> void:
	if not reconnaissance_panel.visible or _selected_city_id.is_empty(): return
	var query: Variant = _session.call("reconnaissance_query", _selected_city_id)
	if query is Dictionary and bool(query.get("found", false)):
		reconnaissance_panel.refresh(_as_dictionary(query.get("reconnaissance", {})))


func _preview_reconnaissance(source_city_id: String, target_city_id: String) -> void:
	map_world.preview_recon_target(source_city_id, target_city_id)


func _open_diplomacy(city_id: String) -> void:
	if city_id.is_empty() or not is_instance_valid(_session): return
	var query: Variant = _session.call("diplomacy_query", city_id)
	if not query is Dictionary or not bool(query.get("found", false)):
		_set_status(tr("外交谋略查询失败"), "error")
		return
	var source: Dictionary = query["sourceCity"]
	city_card.hide()
	officer_panel.hide()
	personnel_panel.hide()
	logistics_panel.hide()
	reconnaissance_panel.hide()
	map_world.clear_recon_preview()
	diplomacy_panel.show_city(
		city_id, str(source.get("name", city_id)), _as_dictionary(query.get("diplomacy", {}))
	)
	diplomacy_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	diplomacy_panel.place_in(_get_card_usable_rect())
	var catalog: Dictionary = _as_dictionary(query.get("diplomacy", {}))
	var commands: Array = catalog.get("commands", [])
	var target_id := ""
	if not commands.is_empty(): target_id = str((commands[0] as Dictionary).get("defaultTargetId", ""))
	var target_city_id := ""
	for raw_target: Variant in catalog.get("targets", []):
		if raw_target is Dictionary and str(raw_target.get("id", "")) == target_id:
			target_city_id = str(raw_target.get("reportedCityId", ""))
			break
	_preview_diplomacy(city_id, target_city_id)
	_set_status(tr("正在从 %s 规划谋略；目标只来自当月侦察名单") % source.get("name", city_id), "ready")


func _close_diplomacy(show_card: bool = true) -> void:
	diplomacy_panel.hide()
	map_world.clear_diplomacy_preview()
	if show_card and not _selected_city_id.is_empty(): _show_selected_city_card()


func _open_chronicle() -> void:
	city_card.hide()
	officer_panel.hide()
	personnel_panel.hide()
	_close_strategic_logistics(false)
	_close_reconnaissance(false)
	_close_diplomacy(false)
	chronicle_panel.show_state(_snapshot)
	chronicle_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	chronicle_panel.place_in(_get_card_usable_rect())


func _advance_turn_month() -> void:
	if not is_instance_valid(_session) or str(_snapshot.get("phase", "")) != "player":
		_set_status(tr("当前阶段不能结束玩家回合"), "warning")
		return
	_set_interaction_busy(true)
	_set_status(tr("正在执行诸侯行动与月度结算……"), "busy")
	_command_serial += 1
	var result: Dictionary = _call_session("advance_turn_month", [{
		"commandEnvelopeVersion": 1,
		"commandId": "strategy-screen-turn-%06d" % _command_serial,
		"expectedStateSha256": str(_session.call("state_sha256")),
		"kind": "advance_turn_month",
		"parameters": {},
	}])
	_set_interaction_busy(false)
	if not bool(result.get("ok", false)):
		_set_status(tr("月度推进失败：%s") % _result_error(result), "error")
		return
	_refresh_snapshot(false)
	_open_chronicle()
	var calendar: Dictionary = _as_dictionary(_snapshot.get("calendar", {}))
	_set_status(tr("已进入 %d 年 %d 月 · AI 与月度结算完成") % [int(calendar.get("year", 0)), int(calendar.get("month", 0))], "success")


func _close_chronicle() -> void:
	chronicle_panel.hide()


func _run_mb11_demo(kind: String) -> void:
	_set_interaction_busy(true)
	_set_status(tr("正在载入确定性验收场景……"), "busy")
	var result: Dictionary = _call_session("start_mb11_acceptance_demo", [kind])
	_set_interaction_busy(false)
	if not bool(result.get("ok", false)):
		_set_status(tr("验收场景失败：%s") % _result_error(result), "error")
		return
	_selected_city_id = "city-12" if kind == "city_event" else ""
	_refresh_snapshot(false)
	chronicle_panel.show_state(_snapshot)
	chronicle_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	chronicle_panel.place_in(_get_card_usable_rect())
	if kind == "city_event":
		map_world.set_selected_city("city-12")
		_animate_camera_to(map_world.get_city_world_position("city-12"), 1.15, 0.38)
		_set_status(tr("濮阳水灾已结算 · 地图节点显示“水”标记"), "success")
	elif kind == "succession":
		_set_status(tr("君主自然死亡已结算 · 月份推进被冻结，等待拥立"), "warning")
	else:
		_focus_world()
		_set_status(tr("天下再无敌对诸侯 · 战役胜利"), "success")


func _resolve_succession(successor_officer_id: String) -> void:
	_execute_internal_command("resolve_succession", {"successorOfficerId": successor_officer_id})


func _refresh_diplomacy() -> void:
	if not diplomacy_panel.visible or _selected_city_id.is_empty(): return
	var query: Variant = _session.call("diplomacy_query", _selected_city_id)
	if query is Dictionary and bool(query.get("found", false)):
		diplomacy_panel.refresh(_as_dictionary(query.get("diplomacy", {})))


func _preview_diplomacy(source_city_id: String, target_city_id: String) -> void:
	map_world.preview_diplomacy_target(source_city_id, target_city_id)


func _refresh_strategic_logistics() -> void:
	if not logistics_panel.visible or _selected_city_id.is_empty():
		return
	var query: Variant = _session.call("strategic_logistics_query", _selected_city_id)
	if query is Dictionary and bool(query.get("found", false)):
		logistics_panel.refresh(_as_dictionary(query.get("strategicLogistics", {})))


func _start_logistics_demo() -> void:
	_set_interaction_busy(true)
	var result := _call_session("start_campaign", [1, 5])
	_set_interaction_busy(false)
	if not bool(result.get("ok", false)):
		_set_status(tr("多城样例载入失败：%s") % _result_error(result), "error")
		return
	_selected_city_id = "city-0"
	_refresh_snapshot(false)
	map_world.set_selected_city(_selected_city_id)
	_open_strategic_logistics(_selected_city_id)
	_set_status(tr("已载入时期 1 · 马腾多城后勤样例"), "success")


func _advance_strategic_logistics() -> void:
	_set_interaction_busy(true)
	_set_status(tr("正在推进战略订单一月……"), "busy")
	var result := _call_session("advance_strategic_orders")
	_set_interaction_busy(false)
	if not bool(result.get("ok", false)):
		_set_status(tr("订单推进失败：%s") % _result_error(result), "error")
		return
	_refresh_snapshot(true)
	_refresh_strategic_logistics()
	var receipt: Dictionary = _as_dictionary(result.get("receipt", {}))
	var messages: Array[String] = []
	for raw_log: Variant in receipt.get("appendedLogs", []):
		if raw_log is Dictionary and not str(raw_log.get("message", "")).is_empty():
			messages.append(str(raw_log["message"]))
	var feedback: String = "；".join(messages)
	_set_status(
		(tr("战略订单已推进 · 种子 %d") % int(_snapshot.get("rngSeed", 0)))
			if feedback.is_empty() else "%s · %s" % [feedback, tr("种子 %d") % int(_snapshot.get("rngSeed", 0))],
		"success",
	)


func _advance_diplomatic_orders() -> void:
	_set_interaction_busy(true)
	_set_status(tr("正在推进一月并结算谋略……"), "busy")
	var result := _call_session("advance_diplomatic_orders")
	_set_interaction_busy(false)
	if not bool(result.get("ok", false)):
		_set_status(tr("谋略结算失败：%s") % _result_error(result), "error")
		return
	var receipt: Dictionary = _as_dictionary(result.get("receipt", {}))
	var completed_ids: Array = receipt.get("completedOrderIds", [])
	var previous_source := _selected_city_id
	_refresh_snapshot(true)
	_refresh_diplomacy()
	map_world.play_diplomacy_result(previous_source)
	var messages: Array[String] = []
	for raw_log: Variant in receipt.get("appendedLogs", []):
		if raw_log is Dictionary and not str(raw_log.get("message", "")).is_empty():
			messages.append(str(raw_log["message"]))
	var feedback: String = "；".join(messages)
	if feedback.is_empty(): feedback = tr("已结算 %d 条谋略回报") % completed_ids.size()
	_set_status("%s · %s" % [feedback, tr("种子 %d") % int(_snapshot.get("rngSeed", 0))], "success")


func _preview_logistics_route(route_city_ids: Array) -> void:
	if map_world.has_method("set_route_preview"):
		map_world.call("set_route_preview", route_city_ids)


func _refresh_personnel_lifecycle() -> void:
	if not personnel_panel.visible or _selected_city_id.is_empty():
		return
	var query: Variant = _session.call("personnel_lifecycle_query", _selected_city_id)
	if query is Dictionary and bool(query.get("found", false)):
		personnel_panel.refresh(_as_dictionary(query.get("personnelLifecycle", {})))


func _refresh_officer_management() -> void:
	if not officer_panel.visible or _selected_city_id.is_empty():
		return
	var query: Variant = _session.call("officer_management_query", _selected_city_id)
	if query is Dictionary and bool(query.get("found", false)):
		officer_panel.refresh(_as_dictionary(query.get("officerManagement", {})))


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
	_refresh_officer_management()
	_refresh_personnel_lifecycle()
	_refresh_strategic_logistics()
	_refresh_reconnaissance()
	_refresh_diplomacy()
	if kind == "resolve_succession":
		if str(_snapshot.get("phase", "")) == "ai":
			_set_interaction_busy(true)
			_set_status(tr("继承完成，继续诸侯阶段……"), "busy")
			var continuation: Dictionary = _call_session("continue_ai_turn")
			_set_interaction_busy(false)
			if bool(continuation.get("ok", false)):
				_refresh_snapshot(false)
				_open_chronicle()
				_set_status(tr("继承完成，诸侯阶段与月份结算已继续"), "success")
			else:
				_set_status(tr("继承后续失败：%s") % _result_error(continuation), "error")
			return
		chronicle_panel.show_state(_snapshot)
		chronicle_panel.place_in(_get_card_usable_rect())
		_set_status(tr("新君已拥立，战役恢复"), "success")
		return
	if kind == "reconnoitre_city":
		map_world.play_recon_scan(str(parameters.get("sourceCityId", "")), str(parameters.get("targetCityId", "")))
		var recon_receipt: Dictionary = _as_dictionary(result.get("receipt", {}))
		var recon_log: Dictionary = _as_dictionary(recon_receipt.get("appendedLog", {}))
		_set_status("%s · %s" % [
			str(recon_log.get("message", tr("侦察完成"))),
			tr("种子 %d") % int(_snapshot.get("rngSeed", 0)),
		], "success")
		return
	if kind in [
		"issue_alienate_order", "issue_canvass_order",
		"issue_counterespionage_order", "issue_induce_order",
	]:
		var diplomacy_receipt: Dictionary = _as_dictionary(result.get("receipt", {}))
		var order: Dictionary = _as_dictionary(diplomacy_receipt.get("order", {}))
		map_world.play_diplomacy_dispatch(
			str(parameters.get("sourceCityId", "")), str(order.get("targetCityId", ""))
		)
		var diplomacy_log: Dictionary = _as_dictionary(diplomacy_receipt.get("appendedLog", {}))
		_set_status("%s · %s" % [
			str(diplomacy_log.get("message", tr("谋略已签发"))),
			tr("种子保持 %d") % int(_snapshot.get("rngSeed", 0)),
		], "success")
		return
	var city_id: String = str(parameters.get("cityId", parameters.get("sourceCityId", "")))
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
		"reward_officer": tr("奖赏"),
		"appoint_satrap": tr("任命太守"),
		"give_item": tr("赏赐道具"),
		"unequip_item": tr("卸下装备"),
		"search_city": tr("搜寻"),
		"recruit_free_officer": tr("登用"),
		"recruit_captive": tr("招降"),
		"release_captive": tr("释放"),
		"execute_captive": tr("处斩"),
		"banish_officer": tr("流放"),
		"confiscate_equipment": tr("没收装备"),
		"issue_move_order": tr("调动"),
		"issue_transport_order": tr("输送"),
		"reconnoitre_city": tr("侦察"),
		"issue_alienate_order": tr("离间"),
		"issue_canvass_order": tr("招揽"),
		"issue_counterespionage_order": tr("策反"),
		"issue_induce_order": tr("劝降"),
		"resolve_succession": tr("拥立新君"),
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
	if officer_panel.visible:
		_close_officer_management()
		return
	if personnel_panel.visible:
		_close_personnel_lifecycle()
		return
	if logistics_panel.visible:
		_close_strategic_logistics()
		return
	if reconnaissance_panel.visible:
		_close_reconnaissance()
		return
	if diplomacy_panel.visible:
		_close_diplomacy()
		return
	if chronicle_panel.visible:
		_close_chronicle()
		return
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
	if physical_size.x <= 1 or physical_size.y <= 1:
		physical_size = Vector2i(get_viewport_rect().size.round())
	_apply_responsive_layout_for_size(physical_size)


func _apply_responsive_layout_for_size(physical_size: Vector2i) -> void:
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
	chronicle_button.text = tr("纪" if compact else "纪事")
	end_turn_button.text = tr("结束" if compact else "结束本月")

	if compact:
		var touch_size := ceilf(48.0 / maxf(canvas_scale, 0.01))
		var label_font_size := ceili(15.0 / maxf(canvas_scale, 0.01))
		var action_font_size := ceili(17.0 / maxf(canvas_scale, 0.01))
		top_panel.custom_minimum_size = Vector2(0.0, touch_size + 14.0)
		for button: Button in [world_button, player_button, save_button, load_button, chronicle_button, end_turn_button]:
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
		chronicle_button.custom_minimum_size = Vector2(76.0, 52.0)
		end_turn_button.custom_minimum_size = Vector2(92.0, 52.0)
		for button: Button in [world_button, player_button, save_button, load_button, chronicle_button, end_turn_button]:
			button.add_theme_font_size_override("font_size", 18)
		status_badge_panel.custom_minimum_size = Vector2(82.0, 48.0)
		year_label.add_theme_font_size_override("font_size", 18)
		seed_label.add_theme_font_size_override("font_size", 18)
		status_badge.add_theme_font_size_override("font_size", 18)
		status_line.add_theme_font_size_override("font_size", 18)
	map_world.set_minimum_physical_hit_radius(24.0, canvas_scale)
	city_card.apply_responsive_layout(compact, canvas_scale, physical_size)
	officer_panel.apply_responsive_layout(compact, canvas_scale, physical_size)
	personnel_panel.apply_responsive_layout(compact, canvas_scale, physical_size)
	logistics_panel.apply_responsive_layout(compact, canvas_scale, physical_size)
	reconnaissance_panel.apply_responsive_layout(compact, canvas_scale, physical_size)
	diplomacy_panel.apply_responsive_layout(compact, canvas_scale, physical_size)
	chronicle_panel.apply_responsive_layout(compact, canvas_scale, physical_size)
	if not _snapshot.is_empty():
		_update_hud_from_snapshot()


func _set_interaction_busy(busy: bool) -> void:
	save_button.disabled = busy or not _spike_persistence_enabled
	load_button.disabled = busy or not _spike_persistence_enabled
	end_turn_button.disabled = busy or str(_snapshot.get("phase", "")) != "player"
	world_button.disabled = busy
	player_button.disabled = busy
	chronicle_button.disabled = busy
	city_card.set_busy(busy)
	officer_panel.set_busy(busy)
	personnel_panel.set_busy(busy)
	logistics_panel.set_busy(busy)
	reconnaissance_panel.set_busy(busy)
	diplomacy_panel.set_busy(busy)
	chronicle_panel.set_busy(busy)


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


func _current_canvas_scale() -> float:
	var physical_size := DisplayServer.window_get_size()
	var viewport_size := get_viewport_rect().size
	return minf(
		float(physical_size.x) / maxf(viewport_size.x, 1.0),
		float(physical_size.y) / maxf(viewport_size.y, 1.0)
	)
