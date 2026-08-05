## Native Godot presentation/application boundary for the migration spike.
## GameSession owns all state transitions; this Node only submits intent and renders snapshots.
extends Node2D

const GAME_SESSION_SCRIPT := preload("res://src/application/game_session/game_session.gd")
const LAUNCH_CONTEXT := preload("res://src/application/campaign_launch_context.gd")
const SESSION_CONTEXT := preload("res://src/application/campaign_session_context.gd")
const TACTICAL_CONTEXT := preload("res://src/application/tactical_launch_context.gd")
const PauseRepository = preload("res://src/application/persistence/tactical_pause_repository.gd")
const TouchMetrics = preload("res://src/presentation/touch_metrics.gd")
const MonthAdvanceReview = preload("res://src/domain/progression/month_advance_review.gd")
const CityCommandCatalog = preload("res://src/presentation/city_command_catalog.gd")
const EntryChrome = preload("res://src/presentation/entry_chrome.gd")

@export var allow_demo_samples := false

const EXPECTED_CITY_COUNT := 38
const EXPECTED_ROAD_COUNT := 54
const MOUSE_DRAG_THRESHOLD := 9.0
const TAP_MAX_DURATION_SECONDS := 0.48
const MIN_ZOOM := 0.68
const MAX_ZOOM := 2.35
const ZOOM_STEP := 1.14

@onready var map_world: StrategyMapWorld = %MapWorld
@onready var map_camera: Camera2D = %MapCamera
@onready var safe_area: SafeAreaMargin = %SafeArea
@onready var top_panel: PanelContainer = %TopPanel
@onready var bottom_panel: PanelContainer = %BottomPanel
@onready var map_input_space: Control = %MapInputSpace
@onready var title_label: Label = %TitleLabel
@onready var year_label: Label = %YearLabel
@onready var seed_label: Label = %SeedLabel
@onready var resource_label: Label = %ResourceLabel
@onready var status_badge_panel: PanelContainer = %StatusBadgePanel
@onready var status_badge: Label = %StatusBadge
@onready var status_line: Label = %StatusLine
@onready var world_button: Button = %WorldButton
@onready var player_button: Button = %PlayerButton
@onready var tactical_demo_button: Button = %TacticalDemoButton
@onready var save_button: Button = %SaveButton
@onready var load_button: Button = %LoadButton
@onready var chronicle_button: Button = %ChronicleButton
@onready var end_turn_button: Button = %EndTurnButton
@onready var menu_button: Button = %MenuButton
@onready var dock_intel_button: Button = %DockIntelButton
@onready var dock_cities_button: Button = %DockCitiesButton
@onready var dock_officers_button: Button = %DockOfficersButton
@onready var dock_treasures_button: Button = %DockTreasuresButton
@onready var dock_delegation_button: Button = %DockDelegationButton
@onready var dock_end_month_button: Button = %DockEndMonthButton
@onready var more_button: Button = %MoreButton
var _faction_seal: PanelContainer
var _seal_glyph: Label
var _faction_name_label: Label
var _ruler_name_label: Label
var _resource_row: HBoxContainer
var _resource_value_labels: Dictionary = {}
@onready var mobile_sheet: MobileSheet = %MobileSheet
@onready var campaign_browser: CampaignBrowserPanel = %CampaignBrowserPanel
@onready var city_context_menu: CityContextMenu = %CityContextMenu
@onready var city_card: CityCard = %CityCard
@onready var officer_panel = %OfficerManagementPanel
@onready var personnel_panel = %PersonnelLifecyclePanel
@onready var logistics_panel = %StrategicLogisticsPanel
@onready var reconnaissance_panel: ReconnaissancePanel = %ReconnaissancePanel
@onready var diplomacy_panel = %DiplomaticOrderPanel
@onready var chronicle_panel = %CampaignChroniclePanel
@onready var month_end_review_dialog: MonthEndReviewDialog = %MonthEndReviewDialog

var _session: GameSession
var _snapshot: Dictionary = {}
var _selected_city_id := ""
var _camera_tween: Tween
var _compact_layout := false
var _command_serial := 0
var _persistence_enabled := false
var _pause_save_failed := false
var _return_confirmation: ConfirmationDialog
var _more_menu: PopupMenu
var _sheet_kind := ""
var _city_l3_section := ""
var _city_card_filter_kind := ""
var _city_card_read_only := false

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
	_return_confirmation = ConfirmationDialog.new()
	_return_confirmation.title = tr("返回主菜单")
	_return_confirmation.dialog_text = tr("尚未保存的战役进度将被放弃。确定返回主菜单吗？")
	_return_confirmation.get_ok_button().text = tr("返回")
	_return_confirmation.get_cancel_button().text = tr("继续战役")
	_return_confirmation.confirmed.connect(_leave_to_menu)
	add_child(_return_confirmation)
	_more_menu = PopupMenu.new()
	_more_menu.add_item(tr("临战"), 0)
	_more_menu.add_item(tr("保存"), 1)
	_more_menu.add_item(tr("读取"), 2)
	_more_menu.add_item(tr("主菜单"), 3)
	_more_menu.id_pressed.connect(_on_more_menu_id_pressed)
	add_child(_more_menu)
	_apply_responsive_labels()
	get_viewport().size_changed.connect(_on_viewport_size_changed)
	var result: Dictionary
	var carried_session: GameSession = SESSION_CONTEXT.take()
	if is_instance_valid(carried_session):
		LAUNCH_CONTEXT.clear()
		_session = carried_session
		result = {
			"ok": true,
			"error": "",
			"campaign": _session.campaign_descriptor(),
			"state": _session.snapshot(),
		}
	else:
		_session = GAME_SESSION_SCRIPT.new()
		var launch := LAUNCH_CONTEXT.take()
		match str(launch.get("mode", "")):
			"campaign":
				result = _call_session("start_campaign", [
					int(launch.get("periodId", -1)),
					int(launch.get("rulerSourceIndex", -1)),
					{
						"rulesetId": str(launch.get("rulesetId", "baye-classic-v1")),
						"lifecyclePolicy": (launch.get("lifecyclePolicy", {}) as Dictionary).duplicate(true),
					},
				])
			"load":
				result = _call_session("load_game")
			_:
				_set_status(tr("请从主菜单选择时期和君主后进入战役"), "error")
				return
	if not bool(result.get("ok", false)):
		_set_status(tr("战役载入失败：%s") % _result_error(result), "error")
		return
	_refresh_snapshot(false)
	# MB20 production persistence is now the normal path. Keep this flag for the
	# legacy direct-scene spike harness, but enable save/load for every valid session.
	_persistence_enabled = true
	save_button.disabled = false
	load_button.disabled = false
	_set_status(tr("已载入战役 · 拖动地图，点击城池下令"), "ready")
	call_deferred("_focus_player_city", false)


func _process(_delta: float) -> void:
	if city_context_menu.visible and not _selected_city_id.is_empty() and not mobile_sheet.is_open():
		city_context_menu.place_near(
			map_world.get_city_screen_position(_selected_city_id),
			_get_card_usable_rect()
		)
	if mobile_sheet.is_open():
		var body_rect := mobile_sheet.get_body_rect()
		if campaign_browser.visible:
			campaign_browser.place_in(body_rect)
		elif chronicle_panel.visible:
			chronicle_panel.place_in(body_rect)
		elif city_card.visible:
			_place_city_card_in(body_rect)
		elif officer_panel.visible:
			officer_panel.place_in(body_rect)
		elif personnel_panel.visible:
			personnel_panel.place_in(body_rect)
		elif logistics_panel.visible:
			logistics_panel.place_in(body_rect)
		elif reconnaissance_panel.visible:
			reconnaissance_panel.place_in(body_rect)
		elif diplomacy_panel.visible:
			diplomacy_panel.place_in(body_rect)
		elif month_end_review_dialog.visible:
			month_end_review_dialog.place_in(body_rect)
		return
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
	if month_end_review_dialog.visible:
		month_end_review_dialog.place_in(_get_card_usable_rect())


func _unhandled_input(event: InputEvent) -> void:
	# Sheet chrome owns the interaction surface; never let map zoom/pan steal scroll.
	if mobile_sheet.is_open():
		if (
			event is InputEventMagnifyGesture
			or event is InputEventScreenTouch
			or event is InputEventScreenDrag
			or event is InputEventMouseMotion
			or (
				event is InputEventMouseButton
				and (
					(event as InputEventMouseButton).button_index == MOUSE_BUTTON_WHEEL_UP
					or (event as InputEventMouseButton).button_index == MOUSE_BUTTON_WHEEL_DOWN
					or (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT
					or (event as InputEventMouseButton).button_index == MOUSE_BUTTON_MIDDLE
					or (event as InputEventMouseButton).button_index == MOUSE_BUTTON_RIGHT
				)
			)
		):
			get_viewport().set_input_as_handled()
		return
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
	_ensure_campaign_top_chrome()
	_style_chrome_bars()
	_style_map_action_buttons()
	_style_end_month_cta()
	title_label.text = tr("三国霸业 · 战略地图")
	world_button.tooltip_text = tr("平滑缩放至完整战略地图")
	player_button.tooltip_text = tr("定位并选择玩家城池")
	tactical_demo_button.tooltip_text = tr("打开相邻敌城临时交战入口（正式出征编辑器待补）")
	save_button.tooltip_text = tr("保存当前最小 GameState")
	load_button.tooltip_text = tr("重建 GameSession 并载入存档")
	chronicle_button.tooltip_text = tr("查看年月、事件、继承与战役结局")
	end_turn_button.tooltip_text = tr("结束玩家阶段，执行确定性 AI 与月度结算")
	dock_intel_button.tooltip_text = tr("查看本月情报与战役纪事")
	dock_cities_button.tooltip_text = tr("浏览并选择城池")
	dock_officers_button.tooltip_text = tr("浏览本势力人物")
	dock_treasures_button.tooltip_text = tr("浏览本势力宝物")
	dock_delegation_button.tooltip_text = tr("多城委任规划")
	dock_end_month_button.tooltip_text = tr("预审后结束玩家阶段，执行确定性 AI 与月度结算")
	more_button.tooltip_text = tr("临战、保存、读取与主菜单")
	menu_button.tooltip_text = tr("返回主菜单；离开前会确认未保存进度")
	_apply_responsive_labels()


func _connect_ui() -> void:
	world_button.pressed.connect(_focus_world)
	player_button.pressed.connect(_focus_player_city)
	tactical_demo_button.pressed.connect(_open_tactical_demo)
	save_button.pressed.connect(_save_game)
	load_button.pressed.connect(_load_game)
	chronicle_button.pressed.connect(_open_chronicle)
	end_turn_button.pressed.connect(_advance_turn_month)
	more_button.pressed.connect(_show_more_menu)
	dock_intel_button.pressed.connect(_open_intel_sheet)
	dock_cities_button.pressed.connect(_open_cities_sheet)
	dock_officers_button.pressed.connect(_open_officers_sheet)
	dock_treasures_button.pressed.connect(_open_treasures_sheet)
	dock_delegation_button.pressed.connect(_open_delegation_sheet)
	dock_end_month_button.pressed.connect(_request_advance_turn_month)
	mobile_sheet.close_requested.connect(_on_mobile_sheet_close_requested)
	mobile_sheet.footer_pressed.connect(_on_sheet_footer_pressed)
	campaign_browser.city_selected.connect(_on_browser_city_selected)
	campaign_browser.officer_selected.connect(_on_browser_officer_selected)
	campaign_browser.action_selected.connect(_on_browser_action_selected)
	city_context_menu.detail_requested.connect(_open_city_detail_from_context)
	city_context_menu.section_requested.connect(_open_city_section_from_context)
	city_context_menu.close_requested.connect(_close_city_card)
	month_end_review_dialog.confirmed.connect(_confirm_advance_turn_month)
	month_end_review_dialog.cancelled.connect(_close_month_end_review)
	month_end_review_dialog.city_selected.connect(_on_month_end_review_city_selected)
	city_card.command_requested.connect(_execute_internal_command)
	city_card.officer_management_requested.connect(_open_officer_management)
	city_card.personnel_lifecycle_requested.connect(_open_personnel_lifecycle)
	city_card.strategic_logistics_requested.connect(_open_strategic_logistics)
	city_card.reconnaissance_requested.connect(_open_reconnaissance)
	city_card.diplomacy_requested.connect(_open_diplomacy)
	city_card.close_requested.connect(_close_city_card_to_context)
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
	menu_button.pressed.connect(_return_to_menu)


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
	dock_end_month_button.disabled = end_turn_button.disabled
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
		city_context_menu.hide()
		city_card.hide()
	map_world.set_selected_city(_selected_city_id)
	if keep_card_open and not _selected_city_id.is_empty():
		if city_card.visible:
			var card_kind := "detail"
			if _city_card_read_only:
				card_kind = "detail"
			elif _sheet_kind in ["internal", "military"]:
				card_kind = _sheet_kind
			_show_selected_city_card(card_kind)
		elif mobile_sheet.is_open() and _sheet_kind == "city_context":
			_show_city_context_menu()
		elif city_context_menu.visible:
			_show_city_context_menu()
	return true


func _update_hud_from_snapshot() -> void:
	var campaign := _call_session("campaign_descriptor")
	var factions := _as_dictionary(_snapshot.get("factions", {}))
	var player_faction_id := str(_snapshot.get("playerFactionId", ""))
	var player_faction := _as_dictionary(factions.get(player_faction_id, {}))
	var faction_name := str(player_faction.get("name", campaign.get("title", "三国霸业")))
	var ruler_name := str(campaign.get("rulerName", ""))
	if _faction_name_label != null:
		_faction_name_label.text = faction_name
	if _ruler_name_label != null:
		_ruler_name_label.text = ruler_name if not ruler_name.is_empty() else tr("未指定君主")
	if _seal_glyph != null:
		_seal_glyph.text = faction_name.substr(0, 1) if not faction_name.is_empty() else "汉"
	if _faction_seal != null:
		_style_faction_seal(Color(str(player_faction.get("color", "#69766e"))))
	# Keep legacy title for any smoke that still reads it; hide in layout.
	title_label.text = tr("%s · %s") % [faction_name, ruler_name]
	var calendar := _as_dictionary(_snapshot.get("calendar", {}))
	seed_label.visible = false
	if _compact_layout:
		year_label.text = tr("%d年 %d月") % [
			int(calendar.get("year", 0)),
			int(calendar.get("month", 0)),
		]
		seed_label.text = tr("种 %d") % int(_snapshot.get("rngSeed", 0))
	else:
		year_label.text = tr("%d年 %d月") % [
			int(calendar.get("year", 0)),
			int(calendar.get("month", 0)),
		]
		seed_label.text = tr("种子 %d") % int(_snapshot.get("rngSeed", 0))
	_update_resource_cells()
	resource_label.text = _format_player_resources()


func _player_resource_totals() -> Dictionary:
	var player_faction_id := str(_snapshot.get("playerFactionId", ""))
	var cities := _as_dictionary(_snapshot.get("cities", {}))
	var officers := _as_dictionary(_snapshot.get("officers", {}))
	var city_count := 0
	var money := 0
	var food := 0
	var troops := 0
	for city_id: Variant in cities.keys():
		var city := _as_dictionary(cities[city_id])
		if str(city.get("ownerId", "")) != player_faction_id:
			continue
		city_count += 1
		money += int(city.get("money", 0))
		food += int(city.get("food", 0))
		troops += int(city.get("reserveTroops", 0))
	for officer_id: Variant in officers.keys():
		var officer := _as_dictionary(officers[officer_id])
		if str(officer.get("factionId", "")) != player_faction_id:
			continue
		if str(officer.get("status", "")) == "dead":
			continue
		troops += int(officer.get("troops", 0))
	return {
		"cities": city_count,
		"money": money,
		"food": food,
		"troops": troops,
	}


func _update_resource_cells() -> void:
	var totals := _player_resource_totals()
	_set_resource_cell_value("cities", _format_int(int(totals.get("cities", 0))))
	_set_resource_cell_value("money", _format_int(int(totals.get("money", 0))))
	_set_resource_cell_value("food", _format_int(int(totals.get("food", 0))))
	_set_resource_cell_value("troops", _format_int(int(totals.get("troops", 0))))


func _set_resource_cell_value(key: String, value: String) -> void:
	var label: Label = _resource_value_labels.get(key, null) as Label
	if label != null:
		label.text = value


func _format_int(value: int) -> String:
	var raw := str(absi(value))
	var parts: PackedStringArray = []
	while raw.length() > 3:
		parts.insert(0, raw.substr(raw.length() - 3, 3))
		raw = raw.substr(0, raw.length() - 3)
	if not raw.is_empty():
		parts.insert(0, raw)
	var grouped := ",".join(parts)
	return ("-%s" % grouped) if value < 0 else grouped


func _format_player_resources() -> String:
	var totals := _player_resource_totals()
	if _compact_layout:
		return tr("城%d 金%d 粮%d 兵%d") % [
			int(totals.get("cities", 0)),
			int(totals.get("money", 0)),
			int(totals.get("food", 0)),
			int(totals.get("troops", 0)),
		]
	return tr("城池 %d · 金钱 %d · 粮草 %d · 兵力 %d") % [
		int(totals.get("cities", 0)),
		int(totals.get("money", 0)),
		int(totals.get("food", 0)),
		int(totals.get("troops", 0)),
	]


func _ensure_campaign_top_chrome() -> void:
	## Web `.campaign-identity` + `.campaign-resources` — seal, names, dated cells.
	var top_bar := title_label.get_parent() as HBoxContainer
	if top_bar == null:
		return
	title_label.visible = false
	resource_label.visible = false
	if top_bar.get_node_or_null("CampaignIdentity") != null:
		_faction_seal = top_bar.get_node("CampaignIdentity/FactionSeal") as PanelContainer
		_seal_glyph = top_bar.get_node("CampaignIdentity/FactionSeal/SealGlyph") as Label
		_faction_name_label = top_bar.get_node("CampaignIdentity/IdentityText/FactionName") as Label
		_ruler_name_label = top_bar.get_node("CampaignIdentity/IdentityText/RulerName") as Label
		_resource_row = top_bar.get_node_or_null("CampaignResources") as HBoxContainer
		_cache_resource_value_labels()
		return

	var identity := HBoxContainer.new()
	identity.name = "CampaignIdentity"
	identity.add_theme_constant_override("separation", 8)
	identity.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_faction_seal = PanelContainer.new()
	_faction_seal.name = "FactionSeal"
	_faction_seal.custom_minimum_size = Vector2(42, 42)
	_seal_glyph = Label.new()
	_seal_glyph.name = "SealGlyph"
	_seal_glyph.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_seal_glyph.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_seal_glyph.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_seal_glyph.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_faction_seal.add_child(_seal_glyph)
	identity.add_child(_faction_seal)
	var identity_text := VBoxContainer.new()
	identity_text.name = "IdentityText"
	identity_text.add_theme_constant_override("separation", 1)
	identity_text.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_faction_name_label = Label.new()
	_faction_name_label.name = "FactionName"
	_faction_name_label.add_theme_color_override("font_color", Color(0.961, 0.91, 0.78, 1.0))
	_faction_name_label.add_theme_font_size_override("font_size", 15)
	var serif := EntryChrome.serif_extrabold()
	if serif != null:
		_faction_name_label.add_theme_font_override("font", serif)
		_seal_glyph.add_theme_font_override("font", serif)
	_ruler_name_label = Label.new()
	_ruler_name_label.name = "RulerName"
	_ruler_name_label.add_theme_color_override("font_color", Color(0.62, 0.69, 0.643, 1.0))
	_ruler_name_label.add_theme_font_size_override("font_size", 11)
	identity_text.add_child(_faction_name_label)
	identity_text.add_child(_ruler_name_label)
	identity.add_child(identity_text)
	top_bar.add_child(identity)
	top_bar.move_child(identity, 0)
	top_bar.move_child(year_label, 1)
	year_label.add_theme_color_override("font_color", Color(0.937, 0.816, 0.494, 1.0))
	year_label.add_theme_font_size_override("font_size", 16)

	_resource_row = HBoxContainer.new()
	_resource_row.name = "CampaignResources"
	_resource_row.add_theme_constant_override("separation", 0)
	_resource_row.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var specs := [
		{"key": "cities", "label": tr("城池")},
		{"key": "money", "label": tr("金钱")},
		{"key": "food", "label": tr("粮草")},
		{"key": "troops", "label": tr("兵力")},
	]
	for index: int in range(specs.size()):
		var spec: Dictionary = specs[index]
		_resource_row.add_child(_make_resource_cell(str(spec["key"]), str(spec["label"]), index == specs.size() - 1))
	top_bar.add_child(_resource_row)
	top_bar.move_child(_resource_row, 2)
	_style_faction_seal(Color("#69766e"))
	_cache_resource_value_labels()


func _cache_resource_value_labels() -> void:
	_resource_value_labels.clear()
	if _resource_row == null:
		return
	for key: String in ["cities", "money", "food", "troops"]:
		var cell := _resource_row.get_node_or_null(key.capitalize()) as Control
		if cell == null:
			continue
		var value := cell.get_node_or_null("Stack/Value") as Label
		if value != null:
			_resource_value_labels[key] = value


func _make_resource_cell(key: String, caption: String, last: bool) -> PanelContainer:
	var cell := PanelContainer.new()
	cell.name = key.capitalize()
	cell.custom_minimum_size = Vector2(72, 0)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(1, 1, 1, 0.035)
	style.border_color = Color(0.55, 0.62, 0.58, 0.22)
	style.border_width_right = 0 if last else 1
	style.content_margin_left = 8
	style.content_margin_right = 8
	style.content_margin_top = 4
	style.content_margin_bottom = 4
	cell.add_theme_stylebox_override("panel", style)
	var stack := VBoxContainer.new()
	stack.name = "Stack"
	stack.add_theme_constant_override("separation", 1)
	var small := Label.new()
	small.name = "Caption"
	small.text = caption
	small.add_theme_color_override("font_color", Color(0.561, 0.631, 0.588, 1.0))
	small.add_theme_font_size_override("font_size", 11)
	var value := Label.new()
	value.name = "Value"
	value.text = "0"
	value.add_theme_color_override("font_color", Color(0.906, 0.867, 0.761, 1.0))
	value.add_theme_font_size_override("font_size", 14)
	stack.add_child(small)
	stack.add_child(value)
	cell.add_child(stack)
	return cell


func _style_faction_seal(fill: Color) -> void:
	if _faction_seal == null:
		return
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = Color(0.957, 0.886, 0.686, 0.78)
	style.set_border_width_all(2)
	style.set_corner_radius_all(21)
	style.shadow_color = Color(0, 0, 0, 0.28)
	style.shadow_size = 6
	_faction_seal.add_theme_stylebox_override("panel", style)
	if _seal_glyph != null:
		_seal_glyph.add_theme_color_override("font_color", Color(1.0, 0.957, 0.835, 1.0))
		_seal_glyph.add_theme_font_size_override("font_size", 18)
		_seal_glyph.add_theme_constant_override("outline_size", 2)
		_seal_glyph.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.55))


func _style_end_month_cta() -> void:
	## Web `.campaign-dock .advance-month-action`
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(0.894, 0.769, 0.431, 1.0) # #e4c46e
	normal.border_color = Color(0.949, 0.863, 0.588, 1.0) # #f2dc96
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(6)
	normal.content_margin_left = 14
	normal.content_margin_right = 14
	normal.content_margin_top = 8
	normal.content_margin_bottom = 8
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color(0.95, 0.84, 0.52, 1.0)
	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = Color(0.82, 0.7, 0.36, 1.0)
	var disabled := normal.duplicate() as StyleBoxFlat
	disabled.bg_color = Color(0.282, 0.282, 0.247, 1.0) # #48483f
	disabled.border_color = Color(0.369, 0.365, 0.322, 1.0)
	dock_end_month_button.add_theme_stylebox_override("normal", normal)
	dock_end_month_button.add_theme_stylebox_override("hover", hover)
	dock_end_month_button.add_theme_stylebox_override("pressed", pressed)
	dock_end_month_button.add_theme_stylebox_override("disabled", disabled)
	dock_end_month_button.add_theme_stylebox_override("focus", hover)
	dock_end_month_button.add_theme_color_override("font_color", Color(0.094, 0.141, 0.114, 1.0))
	dock_end_month_button.add_theme_color_override("font_hover_color", Color(0.094, 0.141, 0.114, 1.0))
	dock_end_month_button.add_theme_color_override("font_pressed_color", Color(0.094, 0.141, 0.114, 1.0))
	dock_end_month_button.add_theme_color_override("font_disabled_color", Color(0.498, 0.482, 0.427, 1.0))
	dock_end_month_button.add_theme_color_override("font_focus_color", Color(0.094, 0.141, 0.114, 1.0))
	dock_end_month_button.flat = false
	dock_end_month_button.size_flags_horizontal = Control.SIZE_SHRINK_END
	dock_end_month_button.text = tr("结束本月")


func _style_chrome_bars() -> void:
	## Web `.top-bar` / `.campaign-dock`: opaque shelves, not floating translucent cards.
	var top := StyleBoxFlat.new()
	top.bg_color = Color(0.141, 0.227, 0.204, 1.0) # #243a34
	top.border_color = Color(0.933, 0.859, 0.651, 0.18)
	top.border_width_bottom = 1
	top.shadow_color = Color(0, 0, 0, 0.24)
	top.shadow_size = 10
	top_panel.add_theme_stylebox_override("panel", top)
	var bottom := StyleBoxFlat.new()
	bottom.bg_color = Color(0.106, 0.176, 0.161, 1.0)
	bottom.border_color = Color(0.933, 0.859, 0.651, 0.16)
	bottom.border_width_top = 1
	bottom.shadow_color = Color(0, 0, 0, 0.28)
	bottom.shadow_size = 10
	bottom_panel.add_theme_stylebox_override("panel", bottom)


func _style_map_action_buttons() -> void:
	## Web `.campaign-map-actions button` — quiet secondary, not dock-scale.
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(1, 1, 1, 0.035)
	normal.border_color = Color(0.871, 0.827, 0.682, 0.22)
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(4)
	normal.content_margin_left = 10
	normal.content_margin_right = 10
	normal.content_margin_top = 6
	normal.content_margin_bottom = 6
	var hover := normal.duplicate() as StyleBoxFlat
	hover.border_color = Color(0.894, 0.769, 0.431, 0.62)
	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = Color(1, 1, 1, 0.06)
	# Web order: 本势力 · 全天下 · 菜单
	var top_bar := player_button.get_parent() as Node
	if top_bar != null:
		var anchor := world_button.get_index()
		top_bar.move_child(player_button, anchor)
		top_bar.move_child(world_button, anchor + 1)
		top_bar.move_child(more_button, anchor + 2)
	for button: Button in [player_button, world_button, more_button]:
		button.flat = false
		button.add_theme_stylebox_override("normal", normal)
		button.add_theme_stylebox_override("hover", hover)
		button.add_theme_stylebox_override("pressed", pressed)
		button.add_theme_stylebox_override("focus", hover)
		button.add_theme_color_override("font_color", Color(0.847, 0.827, 0.761, 1.0))
		button.add_theme_color_override("font_hover_color", Color(0.945, 0.835, 0.541, 1.0))
		button.add_theme_color_override("font_pressed_color", Color(0.945, 0.835, 0.541, 1.0))
		button.add_theme_color_override("font_focus_color", Color(0.945, 0.835, 0.541, 1.0))
		button.add_theme_font_size_override("font_size", 12)
		button.size_flags_vertical = Control.SIZE_SHRINK_CENTER


func _select_city(city_id: String, open_menu: bool = true) -> void:
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
	city_card.hide()
	if open_menu:
		_show_city_context_menu()
	else:
		_hide_city_context_menu()
	var city := _as_dictionary(_as_dictionary(_snapshot.get("cities", {})).get(city_id, {}))
	_set_status(tr("已选择 %s") % str(city.get("name", city_id)), "ready")
	var target_zoom := maxf(map_camera.zoom.x, 0.92)
	_animate_camera_to(map_world.get_city_world_position(city_id), target_zoom, 0.32)


func _show_city_context_menu() -> void:
	if _selected_city_id.is_empty() or _snapshot.is_empty():
		return
	_city_l3_section = ""
	_city_card_filter_kind = ""
	_city_card_read_only = false
	# L2 is the CoC radial clover around the city — never a full side sheet.
	if mobile_sheet.is_open():
		_close_mobile_sheet()
	city_card.hide()
	campaign_browser.hide()
	city_context_menu.show_city(_snapshot, _selected_city_id)
	city_context_menu.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	city_context_menu.place_near(
		map_world.get_city_screen_position(_selected_city_id),
		_get_card_usable_rect()
	)


func _hide_city_context_menu() -> void:
	city_context_menu.hide()


func _open_city_detail_from_context(city_id: String) -> void:
	if city_id.is_empty():
		return
	_selected_city_id = city_id
	map_world.set_selected_city(city_id)
	_hide_city_context_menu()
	_city_l3_section = ""
	_city_card_filter_kind = ""
	_show_selected_city_card("detail")


func _open_city_section_from_context(city_id: String, section: String) -> void:
	if city_id.is_empty():
		return
	_selected_city_id = city_id
	map_world.set_selected_city(city_id)
	_hide_city_context_menu()
	match section:
		"internal", "personnel", "military", "intrigue":
			_show_city_command_section(city_id, section)
		_:
			_show_city_context_menu()


func _show_city_command_section(city_id: String, section: String) -> void:
	_city_l3_section = section
	_city_card_filter_kind = ""
	_city_card_read_only = false
	city_card.hide()
	officer_panel.hide()
	personnel_panel.hide()
	logistics_panel.hide()
	reconnaissance_panel.hide()
	diplomacy_panel.hide()
	_preview_logistics_route([])
	map_world.clear_recon_preview()
	map_world.clear_diplomacy_preview()
	var city := _as_dictionary(_as_dictionary(_snapshot.get("cities", {})).get(city_id, {}))
	var city_name := str(city.get("name", city_id))
	var title := "%s · %s" % [city_name, CityCommandCatalog.section_title(section)]
	campaign_browser.show_section(_snapshot, city_id, section)
	campaign_browser.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	_present_sheet(title, section, true)
	campaign_browser.show()


func _show_selected_city_card(kind: String = "detail") -> void:
	var read_only := kind == "detail"
	_city_card_read_only = read_only
	var command_queries: Array = []
	if not read_only and is_instance_valid(_session) and _session.has_method("internal_affairs_query"):
		var query: Variant = _session.call("internal_affairs_query", _selected_city_id)
		if query is Dictionary:
			var raw_commands: Variant = query.get("internalAffairs", [])
			if raw_commands is Array:
				command_queries = _filter_command_queries(raw_commands, _city_card_filter_kind)
	var visibility: Dictionary = {}
	if is_instance_valid(_session) and _session.has_method("city_visibility_query"):
		var visibility_value: Variant = _session.call("city_visibility_query", _selected_city_id)
		if visibility_value is Dictionary: visibility = visibility_value
	_hide_city_context_menu()
	campaign_browser.hide()
	city_card.show_city(_snapshot, _selected_city_id, command_queries, visibility, read_only)
	city_card.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	var city := _as_dictionary(_as_dictionary(_snapshot.get("cities", {})).get(_selected_city_id, {}))
	var city_name := str(city.get("name", _selected_city_id))
	_present_sheet(city_name, kind, true)
	mobile_sheet.set_footer("", false)


func _filter_command_queries(raw_commands: Array, filter_kind: String) -> Array:
	if filter_kind.is_empty():
		var internal_only: Array = []
		for entry: Variant in raw_commands:
			if not entry is Dictionary:
				continue
			var kind := str((entry as Dictionary).get("kind", ""))
			if kind in [
				"develop_farming", "develop_commerce", "govern_city", "inspect_city",
				"trade_food", "banquet_officer", "plunder_city",
			]:
				internal_only.append(entry)
		return internal_only
	var filtered: Array = []
	for entry: Variant in raw_commands:
		if entry is Dictionary and str((entry as Dictionary).get("kind", "")) == filter_kind:
			filtered.append(entry)
	return filtered


func _open_catalog_command_editor(command_id: String) -> void:
	var domain_kind := CityCommandCatalog.domain_kind(command_id)
	if domain_kind.is_empty() or _selected_city_id.is_empty():
		return
	_city_card_filter_kind = domain_kind
	var sheet_kind := "military" if command_id in ["recruit-troops", "distribute"] else "internal"
	_show_selected_city_card(sheet_kind)


func _close_city_card_to_context() -> void:
	city_card.hide()
	officer_panel.hide()
	personnel_panel.hide()
	logistics_panel.hide()
	reconnaissance_panel.hide()
	diplomacy_panel.hide()
	_preview_logistics_route([])
	map_world.clear_recon_preview()
	map_world.clear_diplomacy_preview()
	_city_card_filter_kind = ""
	_city_card_read_only = false
	if not _city_l3_section.is_empty() and not _selected_city_id.is_empty():
		_show_city_command_section(_selected_city_id, _city_l3_section)
		return
	if not _selected_city_id.is_empty():
		_show_city_context_menu()


func _close_city_card() -> void:
	city_card.hide()
	city_context_menu.hide()
	officer_panel.hide()
	personnel_panel.hide()
	logistics_panel.hide()
	reconnaissance_panel.hide()
	diplomacy_panel.hide()
	_preview_logistics_route([])
	map_world.clear_recon_preview()
	map_world.clear_diplomacy_preview()
	_city_l3_section = ""
	_city_card_filter_kind = ""
	_city_card_read_only = false
	_selected_city_id = ""
	map_world.set_selected_city("")

func _dock_resolve_city_id() -> String:
	if not _selected_city_id.is_empty():
		return _selected_city_id
	var player_faction_id := str(_snapshot.get("playerFactionId", ""))
	var cities := _as_dictionary(_snapshot.get("cities", {}))
	for city_id in map_world.get_ordered_city_ids():
		var city := _as_dictionary(cities.get(city_id, {}))
		if str(city.get("ownerId", "")) == player_faction_id:
			return str(city_id)
	return ""


func _close_mobile_sheet() -> void:
	mobile_sheet.close()
	_sheet_kind = ""
	campaign_browser.hide()
	chronicle_panel.hide()
	city_card.hide()
	officer_panel.hide()
	personnel_panel.hide()
	logistics_panel.hide()
	reconnaissance_panel.hide()
	diplomacy_panel.hide()
	month_end_review_dialog.hide()


func _on_mobile_sheet_close_requested() -> void:
	# CoC stack: leave L3 back to the radial clover when the sheet was a city section.
	if _sheet_returns_to_city_context() and not _selected_city_id.is_empty():
		_show_city_context_menu()
		return
	_close_mobile_sheet()


func _present_sheet(title: String, kind: String, prefer_bottom: bool = false) -> void:
	_hide_floating_panels_for_sheet()
	_sheet_kind = kind
	mobile_sheet.open(title, prefer_bottom)
	mobile_sheet.set_footer("", false)
	mobile_sheet.apply_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())


func _hide_floating_panels_for_sheet() -> void:
	city_context_menu.hide()


func _place_city_card_in(usable: Rect2) -> void:
	if not city_card.visible:
		return
	if city_card.has_method("place_in"):
		city_card.place_in(usable)
		return
	var panel_size := city_card.get_combined_minimum_size()
	panel_size.x = minf(panel_size.x, usable.size.x)
	panel_size.y = minf(panel_size.y, usable.size.y)
	city_card.size = panel_size
	city_card.position = (usable.position + (usable.size - panel_size) * 0.5).round()


func _show_more_menu() -> void:
	var popup_pos := more_button.get_global_rect().end
	_more_menu.position = Vector2i(int(popup_pos.x), int(popup_pos.y))
	_more_menu.popup()


func _on_more_menu_id_pressed(id: int) -> void:
	match id:
		0:
			_open_tactical_demo()
		1:
			_save_game()
		2:
			_load_game()
		3:
			_return_to_menu()


func _open_intel_sheet() -> void:
	city_card.hide()
	city_context_menu.hide()
	officer_panel.hide()
	personnel_panel.hide()
	_close_strategic_logistics(false)
	_close_reconnaissance(false)
	_close_diplomacy(false)
	campaign_browser.hide()
	chronicle_panel.show_state(_snapshot)
	chronicle_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	_present_sheet(tr("情报"), "intel")


func _open_cities_sheet() -> void:
	campaign_browser.show_cities(_snapshot)
	campaign_browser.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	_present_sheet(tr("城池"), "cities")
	campaign_browser.show()


func _open_officers_sheet() -> void:
	campaign_browser.show_officers(_snapshot)
	campaign_browser.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	_present_sheet(tr("人物"), "officers")
	campaign_browser.show()


func _open_treasures_sheet() -> void:
	campaign_browser.show_treasures(_snapshot)
	campaign_browser.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	_present_sheet(tr("宝物"), "treasures")
	campaign_browser.show()


func _open_delegation_sheet() -> void:
	campaign_browser.show_delegation(_snapshot)
	campaign_browser.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	_present_sheet(tr("委任"), "delegation")
	campaign_browser.show()


func _on_browser_city_selected(city_id: String) -> void:
	_close_mobile_sheet()
	_select_city(city_id, true)


func _on_browser_officer_selected(officer_id: String, city_id: String) -> void:
	if city_id.is_empty():
		_set_status(tr("该人物尚未定位到具体城池"), "warning")
		return
	_close_mobile_sheet()
	_select_city(city_id, false)
	_open_officer_management(city_id)


func _on_browser_action_selected(action_id: String) -> void:
	if _selected_city_id.is_empty():
		return
	match action_id:
		"detail":
			_open_city_detail_from_context(_selected_city_id)
		"internal":
			_open_city_section_from_context(_selected_city_id, "internal")
		"personnel":
			_open_city_section_from_context(_selected_city_id, "personnel")
		"military":
			_open_city_section_from_context(_selected_city_id, "military")
		"intrigue":
			_open_city_section_from_context(_selected_city_id, "intrigue")
		"develop", "commerce", "govern", "inspect", "trade", "banquet", "plunder":
			_open_catalog_command_editor(action_id)
		"recruit-troops", "distribute":
			_open_catalog_command_editor(action_id)
		"recon":
			_open_reconnaissance(_selected_city_id)
		"attack":
			_set_status(tr("正式出征编辑器待补齐；可用顶栏临战样片"), "warning")
		"diplomacy":
			_open_diplomacy(_selected_city_id)
		"reward", "appoint", "item":
			_open_officer_management(_selected_city_id)
		"search", "recruit-officer", "captive", "banish":
			_open_personnel_lifecycle(_selected_city_id)
		"move", "transport":
			_open_strategic_logistics(_selected_city_id)
		_:
			pass


func _on_sheet_footer_pressed() -> void:
	if _sheet_kind == "month_end":
		_confirm_advance_turn_month()


func _sheet_returns_to_city_context() -> bool:
	return _sheet_kind in [
		"detail", "internal", "personnel", "military", "intrigue",
		"personnel_officers", "personnel_talent",
	]


func _dock_open_officers() -> void:
	_open_officers_sheet()


func _dock_open_treasures() -> void:
	_open_treasures_sheet()


func _dock_open_delegation() -> void:
	_open_delegation_sheet()

func _open_officer_management(city_id: String) -> void:
	if city_id.is_empty() or not is_instance_valid(_session):
		return
	var query: Variant = _session.call("officer_management_query", city_id)
	if not query is Dictionary or not bool(query.get("found", false)):
		_set_status(tr("人物查询失败"), "error")
		return
	var city: Dictionary = query["city"]
	city_card.hide()
	city_context_menu.hide()
	personnel_panel.hide()
	logistics_panel.hide()
	reconnaissance_panel.hide()
	diplomacy_panel.hide()
	officer_panel.show_city(
		city_id, str(city.get("name", city_id)),
		_as_dictionary(query.get("officerManagement", {}))
	)
	officer_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	campaign_browser.hide()
	_present_sheet(tr("人事"), "personnel_officers", true)
	_set_status(tr("正在管理 %s 的人物与装备") % city.get("name", city_id), "ready")


func _close_officer_management() -> void:
	var was_open: bool = officer_panel.visible
	officer_panel.hide()
	if was_open and not _selected_city_id.is_empty():
		if not _city_l3_section.is_empty():
			_show_city_command_section(_selected_city_id, _city_l3_section)
		elif mobile_sheet.is_open() and _sheet_kind == "personnel_officers":
			_show_city_context_menu()
		elif not mobile_sheet.is_open():
			_show_city_context_menu()


func _open_personnel_lifecycle(city_id: String) -> void:
	if city_id.is_empty() or not is_instance_valid(_session):
		return
	var query: Variant = _session.call("personnel_lifecycle_query", city_id)
	if not query is Dictionary or not bool(query.get("found", false)):
		_set_status(tr("人才与俘虏查询失败"), "error")
		return
	var city: Dictionary = query["city"]
	city_card.hide()
	city_context_menu.hide()
	officer_panel.hide()
	logistics_panel.hide()
	reconnaissance_panel.hide()
	diplomacy_panel.hide()
	personnel_panel.show_city(
		city_id, str(city.get("name", city_id)),
		_as_dictionary(query.get("personnelLifecycle", {}))
	)
	personnel_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	campaign_browser.hide()
	_present_sheet(tr("人才"), "personnel_talent", true)
	_set_status(tr("正在管理 %s 的人才与俘虏") % city.get("name", city_id), "ready")


func _close_personnel_lifecycle(show_card: bool = true) -> void:
	var was_open: bool = personnel_panel.visible
	personnel_panel.hide()
	reconnaissance_panel.hide()
	diplomacy_panel.hide()
	if show_card and was_open and not _selected_city_id.is_empty():
		if not _city_l3_section.is_empty():
			_show_city_command_section(_selected_city_id, _city_l3_section)
		elif mobile_sheet.is_open() and _sheet_kind == "personnel_talent":
			_show_city_context_menu()
		elif not mobile_sheet.is_open():
			_show_city_context_menu()


func _open_strategic_logistics(city_id: String) -> void:
	if city_id.is_empty() or not is_instance_valid(_session):
		return
	var query: Variant = _session.call("strategic_logistics_query", city_id)
	if not query is Dictionary or not bool(query.get("found", false)):
		_set_status(tr("战略后勤查询失败"), "error")
		return
	var city: Dictionary = query["city"]
	city_card.hide()
	city_context_menu.hide()
	officer_panel.hide()
	personnel_panel.hide()
	reconnaissance_panel.hide()
	diplomacy_panel.hide()
	logistics_panel.show_city(city_id, str(city.get("name", city_id)), _as_dictionary(query.get("strategicLogistics", {})))
	logistics_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	campaign_browser.hide()
	# Logistics is a personnel catalog route (move/transport), not a military petal.
	_present_sheet(str(city.get("name", city_id)), "personnel", true)
	_set_status(tr("正在规划 %s 的跨城调动与输送") % city.get("name", city_id), "ready")


func _close_strategic_logistics(show_card: bool = true) -> void:
	var was_open: bool = logistics_panel.visible
	logistics_panel.hide()
	_preview_logistics_route([])
	if show_card and was_open and not _selected_city_id.is_empty():
		if not _city_l3_section.is_empty():
			_show_city_command_section(_selected_city_id, _city_l3_section)
		elif mobile_sheet.is_open() and _sheet_returns_to_city_context():
			_show_city_context_menu()
		elif not mobile_sheet.is_open():
			_show_city_context_menu()

func _open_reconnaissance(city_id: String) -> void:
	if city_id.is_empty() or not is_instance_valid(_session): return
	var query: Variant = _session.call("reconnaissance_query", city_id)
	if not query is Dictionary or not bool(query.get("found", false)):
		_set_status(tr("侦察查询失败"), "error")
		return
	var source: Dictionary = query["sourceCity"]
	city_card.hide()
	city_context_menu.hide()
	officer_panel.hide()
	personnel_panel.hide()
	logistics_panel.hide()
	diplomacy_panel.hide()
	reconnaissance_panel.show_city(
		city_id, str(source.get("name", city_id)), _as_dictionary(query.get("reconnaissance", {}))
	)
	reconnaissance_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	campaign_browser.hide()
	_present_sheet(str(source.get("name", city_id)), "military", true)
	var catalog: Dictionary = _as_dictionary(query.get("reconnaissance", {}))
	_preview_reconnaissance(city_id, str(catalog.get("defaultTargetCityId", "")))
	_set_status(tr("正在从 %s 规划侦察；敌城数据仅来自已保存快照") % source.get("name", city_id), "ready")


func _close_reconnaissance(show_card: bool = true) -> void:
	var was_open: bool = reconnaissance_panel.visible
	reconnaissance_panel.hide()
	map_world.clear_recon_preview()
	if show_card and was_open and not _selected_city_id.is_empty():
		if not _city_l3_section.is_empty():
			_show_city_command_section(_selected_city_id, _city_l3_section)
		elif mobile_sheet.is_open() and _sheet_returns_to_city_context():
			_show_city_context_menu()
		elif not mobile_sheet.is_open():
			_show_city_context_menu()


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
	city_context_menu.hide()
	officer_panel.hide()
	personnel_panel.hide()
	logistics_panel.hide()
	reconnaissance_panel.hide()
	map_world.clear_recon_preview()
	diplomacy_panel.show_city(
		city_id, str(source.get("name", city_id)), _as_dictionary(query.get("diplomacy", {}))
	)
	diplomacy_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	campaign_browser.hide()
	_present_sheet(str(source.get("name", city_id)), "intrigue", true)
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
	var was_open: bool = diplomacy_panel.visible
	diplomacy_panel.hide()
	map_world.clear_diplomacy_preview()
	if show_card and was_open and not _selected_city_id.is_empty():
		if not _city_l3_section.is_empty():
			_show_city_command_section(_selected_city_id, _city_l3_section)
		elif mobile_sheet.is_open() and _sheet_kind == "intrigue":
			_show_city_context_menu()
		elif not mobile_sheet.is_open():
			_show_city_context_menu()


func _open_chronicle() -> void:
	_open_intel_sheet()


func _request_advance_turn_month() -> void:
	if not is_instance_valid(_session) or str(_snapshot.get("phase", "")) != "player":
		_set_status(tr("当前阶段不能结束玩家回合"), "warning")
		return
	if month_end_review_dialog.visible:
		return
	_close_city_card()
	_close_chronicle()
	var review: Dictionary = MonthAdvanceReview.build(_snapshot)
	month_end_review_dialog.show_review(review)
	month_end_review_dialog.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
	campaign_browser.hide()
	_present_sheet(tr("结束本月"), "month_end")
	mobile_sheet.set_footer(tr("确认结束本月"), true)


func _close_month_end_review() -> void:
	month_end_review_dialog.hide()
	if _sheet_kind == "month_end":
		_close_mobile_sheet()


func _on_month_end_review_city_selected(city_id: String) -> void:
	_close_month_end_review()
	if city_id.is_empty():
		return
	_select_city(city_id, true)


func _confirm_advance_turn_month() -> void:
	_close_month_end_review()
	_advance_turn_month()


func _advance_turn_month() -> void:
	if not is_instance_valid(_session) or str(_snapshot.get("phase", "")) != "player":
		_set_status(tr("当前阶段不能结束玩家回合"), "warning")
		return
	_close_city_card()
	_close_chronicle()
	_set_interaction_busy(true)
	_set_status(tr("正在执行诸侯行动与月度结算……"), "busy")
	_command_serial += 1
	var before_digest := str(_session.call("state_sha256"))
	var result: Dictionary = _call_session("advance_turn_month", [{
		"commandEnvelopeVersion": 1,
		"commandId": "strategy-screen-turn-%s-%06d" % [before_digest.left(12), _command_serial],
		"expectedStateSha256": before_digest,
		"kind": "advance_turn_month",
		"parameters": {},
	}])
	_set_interaction_busy(false)
	if not bool(result.get("ok", false)):
		_set_status(tr("月度推进失败：%s") % _result_error(result), "error")
		return
	_refresh_snapshot(false)
	var calendar: Dictionary = _as_dictionary(_snapshot.get("calendar", {}))
	_set_status(tr("已进入 %d 年 %d 月 · 可点底栏「情报」查看本月摘要") % [int(calendar.get("year", 0)), int(calendar.get("month", 0))], "success")


func _close_chronicle() -> void:
	chronicle_panel.hide()
	if _sheet_kind == "intel":
		_close_mobile_sheet()


func _run_mb11_demo(kind: String) -> void:
	if not allow_demo_samples:
		_set_status(tr("技术演示入口仅用于自动验收，不会覆盖当前战役"), "warning")
		return
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
	campaign_browser.hide()
	_present_sheet(tr("情报"), "intel")
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
	if not allow_demo_samples:
		_set_status(tr("技术演示入口仅用于自动验收，不会覆盖当前战役"), "warning")
		return
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
		"commandId": "strategy-screen-%s-%s-%06d" % [kind, before_digest.left(12), _command_serial],
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
		chronicle_panel.apply_responsive_layout(_compact_layout, _current_canvas_scale(), DisplayServer.window_get_size())
		campaign_browser.hide()
		_present_sheet(tr("情报"), "intel")
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
	if not _persistence_enabled:
		_set_status(tr("生产存档尚未启用"), "warning")
		return
	_set_interaction_busy(true)
	var result := _call_session("save_game")
	_set_interaction_busy(false)
	if bool(result.get("ok", false)):
		_set_status(tr("存档已写入 user://godot-spike-save.json"), "success")
	else:
		_set_status(tr("保存失败：%s") % _result_error(result), "error")


func _load_game() -> void:
	if not _persistence_enabled:
		_set_status(tr("生产存档尚未启用"), "warning")
		return
	_set_interaction_busy(true)
	# Recreating the facade verifies the save is not relying on scene-memory state.
	var replacement: GameSession = GAME_SESSION_SCRIPT.new()
	var result := _call_on(replacement, "load_game")
	if bool(result.get("ok", false)):
		_session = replacement
		_refresh_snapshot(true)
		_set_interaction_busy(false)
		_set_status(tr("已从存档重建 GameSession"), "success")
	else:
		_set_status(tr("载入失败：%s") % _result_error(result), "error")
	_set_interaction_busy(false)


func _open_tactical_demo() -> void:
	if _persistence_enabled and is_instance_valid(_session):
		var save_result := _call_session("save_game")
		if not bool(save_result.get("ok", false)):
			_set_status(tr("进入战术前保存失败：%s") % _result_error(save_result), "error")
			return
	# A checkpoint belongs to one explicit tactical hand-off. Remove any stale
	# checkpoint before creating a new hand-off; the new scene writes its own
	# atomic checkpoint after it starts.
	var clear_result := PauseRepository.clear_candidates()
	if not bool(clear_result.get("ok", false)):
		_set_status(tr("无法清理上一次战术恢复检查点：错误 %d") % int(clear_result.get("error", ERR_CANT_OPEN)), "error")
		return
	var order := _build_tactical_demo_order()
	if order.is_empty():
		_set_status(tr("当前战役没有可用的相邻进攻样片"), "warning")
		return
	var creation := _call_session("create_tactical_battle", [order])
	if not bool(creation.get("ok", false)):
		_set_status(tr("战术样片创建失败：%s") % _result_error(creation), "error")
		return
	var battle: Dictionary = _as_dictionary(creation.get("battle", {}))
	if battle.is_empty():
		_set_status(tr("战术样片没有有效战场快照"), "error")
		return
	TACTICAL_CONTEXT.store(battle, order, str(creation.get("stateSha256", "")), _session.campaign_descriptor())
	if is_instance_valid(_session):
		SESSION_CONTEXT.store(_session)
	var error := get_tree().change_scene_to_file("res://scenes/presentation/tactical_battle_screen.tscn")
	if error != OK:
		TACTICAL_CONTEXT.clear()
		SESSION_CONTEXT.clear()
		_set_status(tr("无法打开战术样片：错误 %d") % error, "error")


func _build_tactical_demo_order() -> Dictionary:
	var player_faction_id := str(_snapshot.get("playerFactionId", ""))
	var cities := _as_dictionary(_snapshot.get("cities", {}))
	var officers := _as_dictionary(_snapshot.get("officers", {}))
	var city_ids: Array[String] = []
	for raw_id: Variant in cities.keys(): city_ids.append(str(raw_id))
	city_ids.sort()
	for source_id: String in city_ids:
		var source := _as_dictionary(cities.get(source_id, {}))
		if str(source.get("ownerId", "")) != player_faction_id: continue
		var neighbor_ids: Array[String] = []
		for raw_neighbor: Variant in source.get("neighbors", []): neighbor_ids.append(str(raw_neighbor))
		neighbor_ids.sort()
		for target_id: String in neighbor_ids:
			var target := _as_dictionary(cities.get(target_id, {}))
			if target.is_empty() or str(target.get("ownerId", "")) == player_faction_id: continue
			var officer_ids: Array[String] = []
			for raw_officer_id: Variant in officers.keys(): officer_ids.append(str(raw_officer_id))
			officer_ids.sort()
			for officer_id: String in officer_ids:
				var officer := _as_dictionary(officers.get(officer_id, {}))
				if str(officer.get("status", "")) != "serving" or str(officer.get("factionId", "")) != player_faction_id or str(officer.get("cityId", "")) != source_id: continue
				if int(officer.get("troops", 0)) <= 0 or int(officer.get("stamina", 0)) <= 0 or (_snapshot.get("actedOfficerIds", []) as Array).has(officer_id): continue
				var provisions := mini(20, int(source.get("food", 0)))
				if provisions <= 0: continue
				return {"sourceCityId": source_id, "targetCityId": target_id, "officerIds": [officer_id], "provisions": provisions}
	return {}


func _return_to_menu() -> void:
	if is_instance_valid(_return_confirmation):
		_return_confirmation.popup_centered()
		return
	_leave_to_menu()


func _handle_system_back() -> bool:
	# Back first dismisses the top-most in-scene surface. This keeps Android
	# Back and the desktop keyboard equivalent from discarding a pending command
	# or bypassing the explicit return confirmation.
	if is_instance_valid(_return_confirmation) and _return_confirmation.visible:
		_return_confirmation.hide()
		menu_button.grab_focus()
		return true
	if mobile_sheet.is_open():
		if _sheet_returns_to_city_context() and not _selected_city_id.is_empty():
			_show_city_context_menu()
		else:
			_close_mobile_sheet()
		return true
	if month_end_review_dialog.visible:
		_close_month_end_review()
		dock_end_month_button.grab_focus()
		return true
	if chronicle_panel.visible:
		_close_chronicle()
		return true
	if diplomacy_panel.visible:
		_close_diplomacy()
		return true
	if reconnaissance_panel.visible:
		_close_reconnaissance()
		return true
	if logistics_panel.visible:
		_close_strategic_logistics()
		return true
	if personnel_panel.visible:
		_close_personnel_lifecycle()
		return true
	if officer_panel.visible:
		_close_officer_management()
		return true
	if city_card.visible:
		_close_city_card_to_context()
		return true
	if city_context_menu.visible:
		_close_city_card()
		return true
	return false


func _on_application_paused() -> void:
	# Persist the authoritative GameSession before Android may reclaim the
	# activity. The method is idempotent and does not touch presentation state.
	_pause_save_failed = false
	if _persistence_enabled and is_instance_valid(_session):
		var result := _call_session("save_game")
		if bool(result.get("ok", false)):
			_set_status(tr("应用已暂停；战役状态已保存"), "warning")
		else:
			_pause_save_failed = true
			_set_status(tr("应用暂停保存失败：%s") % _result_error(result), "error")
	else:
		_set_status(tr("应用已暂停；战役状态保留在当前会话"), "warning")


func _on_application_resumed() -> void:
	if _pause_save_failed:
		_set_status(tr("应用已恢复；暂停时存档失败，请手动保存"), "error")
	else:
		_set_status(tr("应用已恢复；已保留确定性战役状态"), "ready")


func _leave_to_menu() -> void:
	LAUNCH_CONTEXT.clear()
	TACTICAL_CONTEXT.clear()
	SESSION_CONTEXT.clear()
	var error := get_tree().change_scene_to_file("res://scenes/presentation/main_menu.tscn")
	if error != OK:
		_set_status(tr("无法返回主菜单：错误 %d") % error, "error")


func _focus_world() -> void:
	if _snapshot.is_empty():
		return
	var bounds := map_world.get_map_bounds()
	var stage := _get_map_stage_rect().size
	var available := Vector2(maxf(280.0, stage.x - 24.0), maxf(200.0, stage.y - 24.0))
	var fit_zoom := clampf(minf(available.x / bounds.size.x, available.y / bounds.size.y), MIN_ZOOM, 1.28)
	_animate_camera_to(bounds.get_center(), fit_zoom, 0.48)
	_set_status(tr("已定位完整战略地图"), "ready")


func _focus_player_city(open_menu: bool = true) -> void:
	var player_faction_id := str(_snapshot.get("playerFactionId", ""))
	var cities := _as_dictionary(_snapshot.get("cities", {}))
	for city_id in map_world.get_ordered_city_ids():
		var city := _as_dictionary(cities.get(city_id, {}))
		if str(city.get("ownerId", "")) == player_faction_id:
			_select_city(city_id, open_menu)
			if not open_menu:
				_set_status(tr("已定位本势力首城 · 点击城池下令"), "ready")
			return
	_set_status(tr("当前快照没有玩家城池"), "warning")
	_focus_world()


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
		if not was_dragged and not was_multitouch and duration <= TAP_MAX_DURATION_SECONDS and origin.distance_to(event.position) <= _touch_drag_threshold():
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
		if origin.distance_to(event.position) >= _touch_drag_threshold():
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
	if month_end_review_dialog.visible:
		_close_month_end_review()
		return
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
	# Place the world focus point at the map stage center (not under chrome).
	var camera_target := _camera_position_for_stage_focus(target_position, zoom)
	var clamped_position := _clamp_camera_position(camera_target, zoom)
	_camera_tween = create_tween().set_parallel(true)
	_camera_tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_camera_tween.tween_property(map_camera, "position", clamped_position, duration)
	_camera_tween.tween_property(map_camera, "zoom", Vector2(zoom, zoom), duration)


func _kill_camera_tween() -> void:
	if _camera_tween and _camera_tween.is_valid():
		_camera_tween.kill()
	_camera_tween = null


func _get_map_stage_rect() -> Rect2:
	if is_instance_valid(map_input_space) and map_input_space.size.x > 1.0 and map_input_space.size.y > 1.0:
		return map_input_space.get_global_rect()
	return _get_card_usable_rect()


func _camera_position_for_stage_focus(world_point: Vector2, zoom: float) -> Vector2:
	## Camera2D centers on the full viewport; offset so `world_point` sits in MapInputSpace.
	var stage_center := _get_map_stage_rect().get_center()
	var viewport_center := get_viewport_rect().get_center()
	return world_point - (stage_center - viewport_center) / maxf(zoom, 0.01)


func _clamp_camera_position(target: Vector2, zoom: float) -> Vector2:
	var bounds := map_world.get_map_bounds()
	var stage := _get_map_stage_rect()
	var half_visible := stage.size / (2.0 * maxf(zoom, 0.01))
	var viewport_center := get_viewport_rect().get_center()
	var stage_offset := (stage.get_center() - viewport_center) / maxf(zoom, 0.01)
	var stage_world := target + stage_offset
	if half_visible.x >= bounds.size.x * 0.5:
		stage_world.x = bounds.get_center().x
	else:
		stage_world.x = clampf(stage_world.x, bounds.position.x + half_visible.x, bounds.end.x - half_visible.x)
	if half_visible.y >= bounds.size.y * 0.5:
		stage_world.y = bounds.get_center().y
	else:
		stage_world.y = clampf(stage_world.y, bounds.position.y + half_visible.y, bounds.end.y - half_visible.y)
	return stage_world - stage_offset


func _get_card_usable_rect() -> Rect2:
	if is_instance_valid(map_input_space) and map_input_space.size.x > 1.0 and map_input_space.size.y > 1.0:
		return map_input_space.get_global_rect()
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
	# The full desktop labels do not fit beside eight actions and the status
	# badge at the smallest supported landscape target (1280x720). Treat that
	# target as compact so the menu remains reachable; larger desktop windows
	# retain the expanded labels.
	var compact := physical_size.x <= 1280 or physical_size.y <= 720
	var touch_mode := compact or TouchMetrics.uses_density_scaled_targets()
	var viewport_size := get_viewport_rect().size
	var canvas_scale := minf(
		float(physical_size.x) / maxf(viewport_size.x, 1.0),
		float(physical_size.y) / maxf(viewport_size.y, 1.0)
	)
	_apply_return_confirmation_layout(compact, canvas_scale)
	_compact_layout = compact
	title_label.visible = false
	resource_label.visible = false
	chronicle_button.visible = false
	end_turn_button.visible = false
	tactical_demo_button.visible = false
	save_button.visible = false
	load_button.visible = false
	menu_button.visible = false
	status_badge_panel.visible = false
	more_button.visible = true
	world_button.text = tr("全天下")
	player_button.text = tr("本势力")
	tactical_demo_button.text = tr("临战" if compact else "临战")
	save_button.text = tr("存" if compact else "保存")
	load_button.text = tr("读" if compact else "读取")
	menu_button.text = tr("菜单" if compact else "主菜单")
	more_button.text = tr("菜单")
	dock_end_month_button.text = tr("结束本月")
	_style_chrome_bars()
	_style_map_action_buttons()
	_style_end_month_cta()

	if touch_mode:
		var touch_size := TouchMetrics.target_size(canvas_scale)
		var label_font_size := ceili(14.0 / maxf(canvas_scale, 0.01))
		var action_font_size := ceili(13.0 / maxf(canvas_scale, 0.01))
		top_panel.custom_minimum_size = Vector2(0.0, maxf(52.0, touch_size + 8.0))
		bottom_panel.custom_minimum_size = Vector2(0.0, touch_size + 36.0)
		for button: Button in [world_button, player_button, more_button]:
			button.custom_minimum_size = Vector2(maxi(64, int(touch_size * 0.85)), maxi(36, int(touch_size * 0.72)))
			button.add_theme_font_size_override("font_size", action_font_size)
		for button: Button in [tactical_demo_button, save_button, load_button, menu_button]:
			button.custom_minimum_size = Vector2(touch_size, touch_size)
			button.add_theme_font_size_override("font_size", action_font_size)
		for button: Button in [dock_intel_button, dock_cities_button, dock_officers_button, dock_treasures_button, dock_delegation_button]:
			button.custom_minimum_size = Vector2(touch_size, touch_size)
			button.add_theme_font_size_override("font_size", ceili(14.0 / maxf(canvas_scale, 0.01)))
		dock_end_month_button.custom_minimum_size = Vector2(maxi(touch_size + 24, 108), touch_size)
		dock_end_month_button.add_theme_font_size_override("font_size", ceili(15.0 / maxf(canvas_scale, 0.01)))
		status_badge_panel.custom_minimum_size = Vector2(touch_size, touch_size)
		year_label.add_theme_font_size_override("font_size", label_font_size)
		seed_label.add_theme_font_size_override("font_size", label_font_size)
		status_badge.add_theme_font_size_override("font_size", label_font_size)
		status_line.add_theme_font_size_override("font_size", ceili(14.0 / maxf(canvas_scale, 0.01)))
		_apply_top_chrome_fonts(14, 11, 13, 11)
		if _faction_seal != null:
			_faction_seal.custom_minimum_size = Vector2(36, 36)
	else:
		top_panel.custom_minimum_size = Vector2(0.0, 58.0)
		bottom_panel.custom_minimum_size = Vector2(0.0, 88.0)
		world_button.custom_minimum_size = Vector2(72.0, 36.0)
		player_button.custom_minimum_size = Vector2(72.0, 36.0)
		more_button.custom_minimum_size = Vector2(56.0, 36.0)
		tactical_demo_button.custom_minimum_size = Vector2(92.0, 52.0)
		save_button.custom_minimum_size = Vector2(68.0, 52.0)
		load_button.custom_minimum_size = Vector2(68.0, 52.0)
		menu_button.custom_minimum_size = Vector2(76.0, 52.0)
		for button: Button in [world_button, player_button, more_button]:
			button.add_theme_font_size_override("font_size", 12)
		for button: Button in [tactical_demo_button, save_button, load_button, menu_button]:
			button.add_theme_font_size_override("font_size", 16)
		for button: Button in [dock_intel_button, dock_cities_button, dock_officers_button, dock_treasures_button, dock_delegation_button]:
			button.custom_minimum_size = Vector2(64.0, 48.0)
			button.add_theme_font_size_override("font_size", 15)
		dock_end_month_button.custom_minimum_size = Vector2(120.0, 52.0)
		dock_end_month_button.add_theme_font_size_override("font_size", 16)
		status_badge_panel.custom_minimum_size = Vector2(82.0, 48.0)
		year_label.add_theme_font_size_override("font_size", 16)
		seed_label.add_theme_font_size_override("font_size", 14)
		status_badge.add_theme_font_size_override("font_size", 14)
		status_line.add_theme_font_size_override("font_size", 14)
		_apply_top_chrome_fonts(15, 11, 14, 11)
		if _faction_seal != null:
			_faction_seal.custom_minimum_size = Vector2(40, 40)
	map_world.set_minimum_physical_hit_radius(TouchMetrics.target_size(canvas_scale) * canvas_scale * 0.5, canvas_scale)
	mobile_sheet.apply_layout(compact, canvas_scale, physical_size)
	campaign_browser.apply_responsive_layout(compact, canvas_scale, physical_size)
	city_context_menu.apply_responsive_layout(compact, canvas_scale, physical_size)
	city_card.apply_responsive_layout(compact, canvas_scale, physical_size)
	officer_panel.apply_responsive_layout(compact, canvas_scale, physical_size)
	personnel_panel.apply_responsive_layout(compact, canvas_scale, physical_size)
	logistics_panel.apply_responsive_layout(compact, canvas_scale, physical_size)
	reconnaissance_panel.apply_responsive_layout(compact, canvas_scale, physical_size)
	diplomacy_panel.apply_responsive_layout(compact, canvas_scale, physical_size)
	chronicle_panel.apply_responsive_layout(compact, canvas_scale, physical_size)
	month_end_review_dialog.apply_responsive_layout(compact, canvas_scale, physical_size)
	if not _snapshot.is_empty():
		_update_hud_from_snapshot()


func _apply_top_chrome_fonts(faction_size: int, ruler_size: int, value_size: int, caption_size: int) -> void:
	if _faction_name_label != null:
		_faction_name_label.add_theme_font_size_override("font_size", faction_size)
	if _ruler_name_label != null:
		_ruler_name_label.add_theme_font_size_override("font_size", ruler_size)
	if _seal_glyph != null:
		_seal_glyph.add_theme_font_size_override("font_size", maxi(15, faction_size + 2))
	if year_label != null:
		year_label.add_theme_font_size_override("font_size", maxi(faction_size, value_size + 2))
	if _resource_row == null:
		return
	for child: Node in _resource_row.get_children():
		var caption := child.get_node_or_null("Stack/Caption") as Label
		var value := child.get_node_or_null("Stack/Value") as Label
		if caption != null:
			caption.add_theme_font_size_override("font_size", caption_size)
		if value != null:
			value.add_theme_font_size_override("font_size", value_size)


func _apply_return_confirmation_layout(compact: bool, canvas_scale: float) -> void:
	if not is_instance_valid(_return_confirmation):
		return
	var scale := maxf(canvas_scale, 0.01)
	var touch_mode := compact or TouchMetrics.uses_density_scaled_targets()
	if touch_mode:
		_return_confirmation.min_size = Vector2i(ceilf(360.0 / scale), ceilf(190.0 / scale))
		_return_confirmation.get_label().add_theme_font_size_override("font_size", ceili(15.0 / scale))
		var touch_size := TouchMetrics.target_size(scale)
		for button: Button in [_return_confirmation.get_ok_button(), _return_confirmation.get_cancel_button()]:
			button.custom_minimum_size = Vector2(ceilf(96.0 / scale), touch_size)
			button.add_theme_font_size_override("font_size", ceili(17.0 / scale))
	else:
		_return_confirmation.min_size = Vector2i(420, 190)
		_return_confirmation.get_label().add_theme_font_size_override("font_size", 18)
		_return_confirmation.get_ok_button().custom_minimum_size = Vector2(112, 52)
		_return_confirmation.get_cancel_button().custom_minimum_size = Vector2(96, 52)
		for button: Button in [_return_confirmation.get_ok_button(), _return_confirmation.get_cancel_button()]:
			button.add_theme_font_size_override("font_size", 18)


func _set_interaction_busy(busy: bool) -> void:
	save_button.disabled = busy or not _persistence_enabled
	load_button.disabled = busy or not _persistence_enabled
	var end_disabled := busy or str(_snapshot.get("phase", "")) != "player"
	end_turn_button.disabled = end_disabled
	dock_end_month_button.disabled = end_disabled
	world_button.disabled = busy
	player_button.disabled = busy
	more_button.disabled = busy
	chronicle_button.disabled = busy
	dock_intel_button.disabled = busy
	dock_cities_button.disabled = busy
	dock_officers_button.disabled = busy
	dock_treasures_button.disabled = busy
	dock_delegation_button.disabled = busy
	city_card.set_busy(busy)
	officer_panel.set_busy(busy)
	personnel_panel.set_busy(busy)
	logistics_panel.set_busy(busy)
	reconnaissance_panel.set_busy(busy)
	diplomacy_panel.set_busy(busy)
	chronicle_panel.set_busy(busy)
	month_end_review_dialog.set_busy(busy)


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
	if physical_size.x <= 1 or physical_size.y <= 1:
		physical_size = Vector2i(viewport_size.round())
	return minf(
		float(physical_size.x) / maxf(viewport_size.x, 1.0),
		float(physical_size.y) / maxf(viewport_size.y, 1.0)
	)


func _touch_drag_threshold() -> float:
	return TouchMetrics.drag_threshold(_current_canvas_scale())
