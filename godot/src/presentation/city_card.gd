## Lightweight city inspector and application-command launcher.
## It only reads snapshots and emits intent; GameSession remains owned by the screen presenter.
class_name CityCard
extends PanelContainer

const TouchMetrics = preload("res://src/presentation/touch_metrics.gd")

signal command_requested(kind: String, parameters: Dictionary)
signal officer_management_requested(city_id: String)
signal personnel_lifecycle_requested(city_id: String)
signal strategic_logistics_requested(city_id: String)
signal reconnaissance_requested(city_id: String)
signal diplomacy_requested(city_id: String)
signal close_requested

@onready var title_label: Label = %TitleLabel
@onready var ownership_label: Label = %OwnershipLabel
@onready var stats_scroll: ScrollContainer = %StatsScroll
@onready var stats_label: Label = %StatsLabel
@onready var outer_margin: MarginContainer = $OuterMargin
@onready var content: VBoxContainer = $OuterMargin/Content
@onready var header_row: HBoxContainer = $OuterMargin/Content/Header
@onready var command_label: Label = %CommandLabel
@onready var command_row: HBoxContainer = %CommandRow
@onready var previous_command: Button = %PreviousCommand
@onready var command_option: OptionButton = %CommandOption
@onready var next_command: Button = %NextCommand
@onready var executor_label: Label = %ExecutorLabel
@onready var executor_row: HBoxContainer = %ExecutorRow
@onready var executor_option: OptionButton = %ExecutorOption
@onready var trade_row: HBoxContainer = %TradeRow
@onready var trade_direction: OptionButton = %TradeDirection
@onready var trade_amount: SpinBox = %TradeAmount
@onready var develop_button: Button = %DevelopButton
@onready var officer_button: Button = %OfficerButton
@onready var personnel_button: Button = %PersonnelButton
@onready var logistics_button: Button = %LogisticsButton
@onready var reconnaissance_button: Button = %ReconnaissanceButton
@onready var diplomacy_button: Button = %DiplomacyButton
@onready var close_button: Button = %CloseButton
@onready var action_row: HBoxContainer = $OuterMargin/Content/ActionRow

var _city_id := ""
var _base_action_enabled := false
var _busy := false
var _read_only := false
var _command_queries: Array[Dictionary] = []
var _selected_query: Dictionary = {}
var _confirm_dialog: ConfirmationDialog
var _compact_mode := false
var _last_canvas_scale := 1.0
var _full_stats_text := ""
var _detail_stats_text := ""
var _compact_hostile_stats_text := ""
var _compact_stats_by_kind: Dictionary = {}
var _is_owned := false
var _default_z_index := 20
var _embedded_in_sheet := false
var _flat_panel_style: StyleBoxFlat

const DEFAULT_CARD_MINIMUM := Vector2(334.0, 254.0)
const DEFAULT_CLOSE_MINIMUM := Vector2(52.0, 48.0)
const DEFAULT_EXECUTOR_MINIMUM := Vector2(0.0, 52.0)
const DEFAULT_DEVELOP_MINIMUM := Vector2(132.0, 54.0)
const SHEET_Z_INDEX := 61

const CONDITION_LABELS := {
	"normal": "正常",
	"famine": "饥荒",
	"drought": "旱灾",
	"flood": "水灾",
	"rebellion": "叛乱",
}

const CONDITION_GUIDANCE := {
	"famine": "饥荒：农业、商业和民忠每月约 -5%，人口 -25%，后备兵减半；补足粮草可在月末自然恢复，治理可立即解除。",
	"drought": "旱灾：农业与粮草每月约 -5%，人口和后备兵 -25%，驻军兵力 -25%；防灾可促使月末恢复，治理可立即解除。",
	"flood": "水灾：农业/粮草约 -5%，商业/金钱 -10%，人口/后备兵/驻军 -25%；防灾可促使月末恢复，治理可立即解除。",
	"rebellion": "暴动：农业/粮草/商业/金钱约 -5%，民忠 -10%，后备兵与驻军减半；民忠可促使月末恢复，治理可立即解除。",
}


func _ready() -> void:
	_default_z_index = z_index
	_flat_panel_style = StyleBoxFlat.new()
	_flat_panel_style.bg_color = Color(0, 0, 0, 0)
	_flat_panel_style.draw_center = false
	_flat_panel_style.set_border_width_all(0)
	_flat_panel_style.set_corner_radius_all(0)
	_flat_panel_style.shadow_size = 0
	close_button.pressed.connect(func() -> void: close_requested.emit())
	officer_button.pressed.connect(func() -> void: officer_management_requested.emit(_city_id))
	personnel_button.pressed.connect(func() -> void: personnel_lifecycle_requested.emit(_city_id))
	logistics_button.pressed.connect(func() -> void: strategic_logistics_requested.emit(_city_id))
	reconnaissance_button.pressed.connect(func() -> void: reconnaissance_requested.emit(_city_id))
	diplomacy_button.pressed.connect(func() -> void: diplomacy_requested.emit(_city_id))
	develop_button.pressed.connect(_on_action_pressed)
	command_option.item_selected.connect(_on_command_selected)
	trade_direction.item_selected.connect(_on_trade_direction_selected)
	previous_command.pressed.connect(func() -> void: _step_command(-1))
	next_command.pressed.connect(func() -> void: _step_command(1))
	_confirm_dialog = ConfirmationDialog.new()
	_confirm_dialog.title = tr("确认危险命令")
	_confirm_dialog.get_ok_button().text = tr("确认掠夺")
	_confirm_dialog.get_cancel_button().text = tr("取消")
	_confirm_dialog.get_label().autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_confirm_dialog.confirmed.connect(_emit_selected_command)
	add_child(_confirm_dialog)
	close_button.text = tr("关闭")
	officer_button.text = tr("人物")
	personnel_button.text = tr("人才")
	logistics_button.text = tr("后勤")
	reconnaissance_button.text = tr("侦察")
	diplomacy_button.text = tr("谋略")
	command_label.text = tr("内政命令")
	executor_label.text = tr("执行武将")
	hide()


func set_embedded_in_sheet(embedded: bool) -> void:
	_embedded_in_sheet = embedded
	# MobileSheet already owns the frame chrome and close control.
	header_row.visible = not embedded
	close_button.visible = not embedded
	title_label.visible = not embedded
	if embedded:
		add_theme_stylebox_override("panel", _flat_panel_style)
		z_index = SHEET_Z_INDEX
		move_to_front()
	else:
		remove_theme_stylebox_override("panel")
		z_index = _default_z_index


func show_city(
		snapshot: Dictionary,
		city_id: String,
		command_queries: Array = [],
		visibility: Dictionary = {},
		read_only: bool = false
) -> void:
	var cities := _as_dictionary(snapshot.get("cities", {}))
	var city := _as_dictionary(cities.get(city_id, {}))
	if city.is_empty():
		hide()
		return

	_city_id = city_id
	_read_only = read_only
	title_label.text = str(city.get("name", city_id))
	var owner_id := str(city.get("ownerId", ""))
	var factions := _as_dictionary(snapshot.get("factions", {}))
	var owner := _as_dictionary(factions.get(owner_id, {}))
	var player_faction_id: String = str(snapshot.get("playerFactionId", ""))
	_is_owned = not player_faction_id.is_empty() and owner_id == player_faction_id
	var knowledge: String = "current" if _is_owned else "public"
	if not _is_owned and bool(visibility.get("found", false)) \
			and visibility.get("knowledge", "public") == "report" \
			and visibility.get("report") is Dictionary:
		knowledge = "report"
	var owner_name: String = str(owner.get("name", tr("无主")))
	var condition_key := str(city.get("condition", "normal"))
	var condition_name: String = tr(str(CONDITION_LABELS.get(condition_key, "未知")))
	if knowledge == "current":
		ownership_label.text = tr("势力：%s · 己方实时") % owner_name
		_full_stats_text = "%s  %s\n%s  %s\n%s  %s\n%s" % [
			tr("人口：%s") % _format_number(int(city.get("population", 0))),
			tr("民忠：%d") % int(city.get("publicLoyalty", 0)),
			tr("农业：%d / %d") % [int(city.get("farming", 0)), int(city.get("farmingLimit", 0))],
			tr("商业：%d / %d") % [int(city.get("commerce", 0)), int(city.get("commerceLimit", 0))],
			tr("金：%d") % int(city.get("money", 0)),
			tr("粮：%d") % int(city.get("food", 0)),
			tr("城况：%s · 防灾 %d") % [condition_name, int(city.get("disasterPrevention", 0))],
		]
		_detail_stats_text = _build_owned_detail_text(snapshot, city, condition_key, condition_name)
		_compact_hostile_stats_text = ""
	elif knowledge == "report":
		var report: Dictionary = _as_dictionary(visibility.get("report", {}))
		ownership_label.text = tr("势力：%s · %d 年 %d 月旧情报") % [
			owner_name, int(report.get("observedYear", 0)), int(report.get("observedMonth", 0)),
		]
		_full_stats_text = "%s  %s\n%s  %s\n%s  %s" % [
			tr("人口：%s") % _format_number(int(report.get("population", 0))),
			tr("驻将：%d · 兵 %d") % [int(report.get("officerCount", 0)), int(report.get("totalTroops", 0))],
			tr("农业：%d") % int(report.get("farming", 0)),
			tr("商业：%d") % int(report.get("commerce", 0)),
			tr("金：%d") % int(report.get("money", 0)),
			tr("粮：%d · 后备 %d") % [int(report.get("food", 0)), int(report.get("reserveTroops", 0))],
		]
		_detail_stats_text = _build_report_detail_text(snapshot, report)
		_compact_hostile_stats_text = "%s · %s · %s · %s\n%s · %s · %s" % [
			tr("人 %s") % _format_number(int(report.get("population", 0))),
			tr("%d 将 / %d 兵") % [int(report.get("officerCount", 0)), int(report.get("totalTroops", 0))],
			tr("金 %d") % int(report.get("money", 0)), tr("粮 %d") % int(report.get("food", 0)),
			tr("农 %d") % int(report.get("farming", 0)), tr("商 %d") % int(report.get("commerce", 0)),
			tr("后备 %d") % int(report.get("reserveTroops", 0)),
		]
	else:
		ownership_label.text = tr("势力：%s · 未侦察") % owner_name
		_full_stats_text = tr("情报未知\n仅公开城名与当前势力归属\n请从己方城池派武将侦察")
		_detail_stats_text = tr(
			"情报未知\n人口：未知\n金钱：未知\n粮草：未知\n后备兵：未知\n农业：未知\n商业：未知\n民忠：未知\n城防：未知\n防灾：未知\n状态：未知\n太守：未知\n\n尚无该城情报；请从己方城池派武将侦察。\n驻城武将与兵力未知。\n敌对或中立城池只显示已掌握的情报。侦察和出征需从相邻的己方城池发起。"
		)
		_compact_hostile_stats_text = tr("情报未知 · 仅公开城名与势力\n请从己方城池派武将侦察")
	_compact_stats_by_kind = {}
	if knowledge == "current":
		var owner_short := owner_name
		var money_short := tr("金 %d") % int(city.get("money", 0))
		_compact_stats_by_kind = {
			"develop_farming": "%s · %s · %s" % [owner_short, tr("农 %d/%d") % [int(city.get("farming", 0)), int(city.get("farmingLimit", 0))], money_short],
			"develop_commerce": "%s · %s · %s" % [owner_short, tr("商 %d/%d") % [int(city.get("commerce", 0)), int(city.get("commerceLimit", 0))], money_short],
			"govern_city": "%s · %s · %s" % [owner_short, tr("防灾 %d") % int(city.get("disasterPrevention", 0)), money_short],
			"inspect_city": "%s · %s · %s · %s" % [owner_short, tr("人 %s") % _format_number(int(city.get("population", 0))), tr("忠 %d") % int(city.get("publicLoyalty", 0)), money_short],
			"trade_food": "%s · %s · %s" % [owner_short, money_short, tr("粮 %d") % int(city.get("food", 0))],
			"banquet_officer": "%s · %s" % [owner_short, money_short],
			"plunder_city": "%s · %s · %s · %s" % [owner_short, tr("忠 %d") % int(city.get("publicLoyalty", 0)), tr("农 %d") % int(city.get("farming", 0)), tr("商 %d") % int(city.get("commerce", 0))],
			"recruit_troops": "%s · %s · %s" % [owner_short, money_short, tr("后备 %d") % int(city.get("reserveTroops", 0))],
			"distribute_troops": "%s · %s · %s" % [owner_short, money_short, tr("后备 %d") % int(city.get("reserveTroops", 0))],
		}
	stats_label.text = _detail_stats_text if _read_only else _full_stats_text
	if _read_only:
		_command_queries.clear()
		command_option.clear()
		_selected_query = {}
		command_label.visible = false
		command_row.visible = false
		executor_label.visible = false
		executor_row.visible = false
		trade_row.visible = false
		action_row.visible = false
		develop_button.visible = false
		officer_button.visible = false
		personnel_button.visible = false
		logistics_button.visible = false
		reconnaissance_button.visible = false
		diplomacy_button.visible = false
		set_embedded_in_sheet(true)
	else:
		_populate_commands(command_queries)
		command_label.visible = true
		executor_label.visible = true
		command_row.visible = _is_owned
		executor_row.visible = _is_owned
		trade_row.visible = _is_owned and trade_row.visible
		action_row.visible = _is_owned
		# Keep the execute CTA; secondary panel shortcuts stay on L3 catalog routes.
		develop_button.visible = _is_owned
		officer_button.visible = false
		personnel_button.visible = false
		logistics_button.visible = false
		reconnaissance_button.visible = false
		diplomacy_button.visible = false
		set_embedded_in_sheet(true)
	# This Control is not container-owned. Recompute its actual rect whenever a
	# visibility mode hides rows or changes compact hostile text density.
	_apply_information_density()
	reset_size()
	show()


func set_busy(value: bool) -> void:
	_busy = value
	command_option.disabled = value or _command_queries.is_empty()
	previous_command.disabled = value or _command_queries.size() <= 1
	next_command.disabled = value or _command_queries.size() <= 1
	executor_option.disabled = value or not _base_action_enabled
	trade_direction.disabled = value or not _base_action_enabled or str(_selected_query.get("mode", "")) != "trade"
	trade_amount.editable = not value and _base_action_enabled
	develop_button.disabled = value or not _base_action_enabled
	officer_button.disabled = value or _city_id.is_empty()
	personnel_button.disabled = value or _city_id.is_empty()
	logistics_button.disabled = value or _city_id.is_empty()
	reconnaissance_button.disabled = value or _city_id.is_empty() or not _is_owned
	diplomacy_button.disabled = value or _city_id.is_empty() or not _is_owned


func apply_responsive_layout(compact: bool, canvas_scale: float, physical_size: Vector2i) -> void:
	var scale := maxf(canvas_scale, 0.01)
	_compact_mode = compact
	_last_canvas_scale = scale
	var touch_mode := compact or TouchMetrics.uses_density_scaled_targets()
	var touch_size: float = TouchMetrics.target_size(scale) if touch_mode else 52.0
	if compact:
		outer_margin.add_theme_constant_override("margin_top", 8)
		outer_margin.add_theme_constant_override("margin_bottom", 8)
		content.add_theme_constant_override("separation", 2)
		var target_width_px := minf(360.0, maxf(320.0, float(physical_size.x) - 48.0))
		custom_minimum_size = Vector2(ceilf(target_width_px / scale), 0.0)
		close_button.custom_minimum_size = Vector2(touch_size, touch_size)
		previous_command.custom_minimum_size = Vector2(touch_size, touch_size)
		command_option.custom_minimum_size = Vector2(0.0, touch_size)
		next_command.custom_minimum_size = Vector2(touch_size, touch_size)
		executor_option.custom_minimum_size = Vector2(0.0, touch_size)
		trade_direction.custom_minimum_size = Vector2(ceilf(92.0 / scale), touch_size)
		trade_amount.custom_minimum_size = Vector2(0.0, touch_size)
		for button: Button in [officer_button, personnel_button, logistics_button, reconnaissance_button, diplomacy_button, develop_button]:
			button.custom_minimum_size = Vector2(ceilf(50.0 / scale), touch_size)
		var body_font_size := ceili(16.0 / scale)
		var action_font_size := ceili(17.0 / scale)
		title_label.add_theme_font_size_override("font_size", ceili(20.0 / scale))
		for label: Label in [ownership_label, stats_label, command_label, executor_label]:
			label.add_theme_font_size_override("font_size", body_font_size)
		stats_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART if _read_only else TextServer.AUTOWRAP_OFF
		if _read_only:
			custom_minimum_size = Vector2(ceilf(target_width_px / scale), ceilf(160.0 / scale))
		for control: Control in [close_button, previous_command, command_option, next_command, executor_option, trade_direction, trade_amount, logistics_button, reconnaissance_button, diplomacy_button, personnel_button, officer_button, develop_button]:
			control.add_theme_font_size_override("font_size", action_font_size)
		for popup: PopupMenu in [command_option.get_popup(), executor_option.get_popup(), trade_direction.get_popup()]:
			popup.add_theme_font_size_override("font_size", action_font_size)
			popup.add_theme_constant_override("v_separation", TouchMetrics.popup_separation(scale, action_font_size))
		_confirm_dialog.min_size = Vector2i(ceilf(340.0 / scale), ceilf(176.0 / scale))
		_confirm_dialog.get_ok_button().custom_minimum_size = Vector2(ceilf(112.0 / scale), touch_size)
		_confirm_dialog.get_cancel_button().custom_minimum_size = Vector2(ceilf(88.0 / scale), touch_size)
		_confirm_dialog.get_label().add_theme_font_size_override("font_size", body_font_size)
		for button: Button in [_confirm_dialog.get_ok_button(), _confirm_dialog.get_cancel_button()]:
			button.add_theme_font_size_override("font_size", action_font_size)
		command_label.visible = false
	else:
		outer_margin.add_theme_constant_override("margin_top", 12)
		outer_margin.add_theme_constant_override("margin_bottom", 14)
		content.add_theme_constant_override("separation", 8)
		custom_minimum_size = DEFAULT_CARD_MINIMUM
		close_button.custom_minimum_size = Vector2(DEFAULT_CLOSE_MINIMUM.x, touch_size)
		previous_command.custom_minimum_size = Vector2(DEFAULT_CLOSE_MINIMUM.x, touch_size)
		command_option.custom_minimum_size = Vector2(0.0, touch_size)
		next_command.custom_minimum_size = Vector2(DEFAULT_CLOSE_MINIMUM.x, touch_size)
		executor_option.custom_minimum_size = Vector2(DEFAULT_EXECUTOR_MINIMUM.x, touch_size)
		trade_direction.custom_minimum_size = Vector2(92.0, touch_size)
		trade_amount.custom_minimum_size = Vector2(0.0, touch_size)
		officer_button.custom_minimum_size = Vector2(112.0, maxf(54.0, touch_size))
		personnel_button.custom_minimum_size = Vector2(112.0, maxf(54.0, touch_size))
		logistics_button.custom_minimum_size = Vector2(96.0, maxf(54.0, touch_size))
		reconnaissance_button.custom_minimum_size = Vector2(82.0, maxf(54.0, touch_size))
		diplomacy_button.custom_minimum_size = Vector2(82.0, maxf(54.0, touch_size))
		develop_button.custom_minimum_size = Vector2(112.0, maxf(54.0, touch_size))
		var desktop_action_size := ceili(18.0 / scale) if touch_mode else 18
		title_label.add_theme_font_size_override("font_size", ceili(24.0 / scale) if touch_mode else 24)
		for label: Label in [ownership_label, stats_label, command_label, executor_label]:
			label.add_theme_font_size_override("font_size", desktop_action_size)
		stats_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART if _read_only else TextServer.AUTOWRAP_OFF
		for control: Control in [close_button, previous_command, command_option, next_command, executor_option, trade_direction, trade_amount, logistics_button, reconnaissance_button, diplomacy_button, personnel_button, officer_button, develop_button]:
			control.add_theme_font_size_override("font_size", desktop_action_size)
		for popup: PopupMenu in [command_option.get_popup(), executor_option.get_popup(), trade_direction.get_popup()]:
			popup.add_theme_font_size_override("font_size", desktop_action_size)
			popup.add_theme_constant_override("v_separation", TouchMetrics.popup_separation(scale, desktop_action_size))
		_confirm_dialog.min_size = Vector2i(420, 190)
		_confirm_dialog.get_ok_button().custom_minimum_size = Vector2(132.0, touch_size)
		_confirm_dialog.get_cancel_button().custom_minimum_size = Vector2(96.0, touch_size)
		_confirm_dialog.get_label().add_theme_font_size_override("font_size", desktop_action_size)
		for button: Button in [_confirm_dialog.get_ok_button(), _confirm_dialog.get_cancel_button()]:
			button.add_theme_font_size_override("font_size", desktop_action_size)
		command_label.visible = not _read_only
	_apply_information_density()
	reset_size()


func place_in(usable_rect: Rect2) -> void:
	if not visible:
		return
	set_embedded_in_sheet(true)
	# One surface only: fill the MobileSheet body; never float a second framed card.
	var parent_control := get_parent() as Control
	var local_pos := usable_rect.position
	if parent_control != null:
		local_pos = usable_rect.position - parent_control.global_position
	position = local_pos.round()
	size = usable_rect.size
	stats_label.custom_minimum_size = Vector2(maxf(80.0, usable_rect.size.x - 56.0), 0.0)
	if _read_only:
		stats_scroll.custom_minimum_size = Vector2(0.0, maxf(120.0, usable_rect.size.y - 72.0))
	else:
		stats_scroll.custom_minimum_size = Vector2(0.0, maxf(48.0, usable_rect.size.y * 0.28))


func place_near(anchor_position: Vector2, usable_rect: Rect2) -> void:
	if not visible:
		return
	set_embedded_in_sheet(false)
	var card_size := size
	if card_size.x <= 1.0 or card_size.y <= 1.0:
		card_size = get_combined_minimum_size()
	var horizontal_gap := 34.0
	var desired := anchor_position + Vector2(horizontal_gap, -card_size.y * 0.42)
	if desired.x + card_size.x > usable_rect.end.x:
		desired.x = anchor_position.x - card_size.x - horizontal_gap
	desired.x = clampf(desired.x, usable_rect.position.x, maxf(usable_rect.position.x, usable_rect.end.x - card_size.x))
	desired.y = clampf(desired.y, usable_rect.position.y, maxf(usable_rect.position.y, usable_rect.end.y - card_size.y))
	position = desired.round()


func _populate_commands(raw_queries: Array) -> void:
	_command_queries.clear()
	command_option.clear()
	for raw_query: Variant in raw_queries:
		if not raw_query is Dictionary:
			continue
		var query: Dictionary = raw_query
		var kind: String = str(query.get("kind", ""))
		if kind.is_empty():
			continue
		_command_queries.append(query.duplicate(true))
		command_option.add_item(str(query.get("label", kind)))
		command_option.set_item_metadata(command_option.item_count - 1, kind)
	if _command_queries.is_empty():
		_selected_query = {}
		command_option.add_item(tr("无可用内政命令"))
		_render_selected_command()
		return
	command_option.select(0)
	_on_command_selected(0)


func _on_command_selected(index: int) -> void:
	if index < 0 or index >= _command_queries.size():
		_selected_query = {}
	else:
		_selected_query = _command_queries[index].duplicate(true)
	_render_selected_command()


func _step_command(delta: int) -> void:
	if _command_queries.is_empty():
		return
	var next_index: int = posmod(command_option.selected + delta, _command_queries.size())
	command_option.select(next_index)
	_on_command_selected(next_index)


func _render_selected_command() -> void:
	executor_option.clear()
	var mode: String = str(_selected_query.get("mode", "executor"))
	executor_label.text = tr("宴请目标") if mode == "target" else tr("执行武将")
	var candidates: Variant = _selected_query.get("targets", []) if mode == "target" \
			else _selected_query.get("executors", [])
	if candidates is Array:
		for raw_executor: Variant in candidates:
			if not raw_executor is Dictionary:
				continue
			var executor: Dictionary = raw_executor
			var officer_id: String = str(executor.get("id", ""))
			if officer_id.is_empty():
				continue
			var suffix: String = "%s %d" % [tr("体"), int(executor.get("stamina", 0))]
			if mode == "target":
				suffix += " · %s %d" % [tr("忠"), int(executor.get("loyalty", 0))]
			executor_option.add_item("%s · %s" % [
				str(executor.get("name", officer_id)),
				suffix,
			])
			var index := executor_option.item_count - 1
			executor_option.set_item_metadata(index, officer_id)

	_base_action_enabled = bool(_selected_query.get("allowed", false)) and executor_option.item_count > 0
	if executor_option.item_count == 0:
		executor_option.add_item(str(_selected_query.get("reason", tr("无可用在职武将"))))
	else:
		executor_option.select(0)
	trade_row.visible = mode == "trade" or mode == "distribute"
	if mode == "trade":
		trade_direction.visible = true
		trade_direction.clear()
		for raw_direction: Variant in _selected_query.get("directions", []):
			var allowed_direction: String = str(raw_direction)
			trade_direction.add_item(tr("买入") if allowed_direction == "buy" else tr("卖出"))
			trade_direction.set_item_metadata(trade_direction.item_count - 1, allowed_direction)
		var direction: String = str(_selected_query.get("defaultDirection", "sell"))
		for index: int in range(trade_direction.item_count):
			if str(trade_direction.get_item_metadata(index)) == direction:
				trade_direction.select(index)
				break
		_apply_trade_amount_limit()
		trade_amount.value = float(_selected_query.get("defaultAmount", 100))
	elif mode == "distribute":
		trade_direction.visible = false
		trade_amount.min_value = 0.0
		trade_amount.max_value = maxf(1.0, float(_selected_query.get("maxTargetTroops", 1)))
		trade_amount.value = float(_selected_query.get(
			"defaultTargetTroops",
			_selected_query.get("currentTroops", 0),
		))
	develop_button.text = str(_selected_query.get("label", tr("执行")))
	_apply_information_density()
	set_busy(_busy)


func _on_trade_direction_selected(_index: int) -> void:
	_apply_trade_amount_limit()


func _apply_trade_amount_limit() -> void:
	if trade_direction.selected < 0:
		trade_amount.max_value = 1.0
		return
	var direction: String = str(trade_direction.get_item_metadata(trade_direction.selected))
	var limits: Dictionary = _selected_query.get("directionLimits", {})
	trade_amount.max_value = maxf(1.0, float(limits.get(direction, 1)))
	trade_amount.value = minf(trade_amount.value, trade_amount.max_value)


func _apply_information_density() -> void:
	# Detail petal must keep Web-aligned full summary even on compact phones.
	if _read_only:
		ownership_label.visible = true
		stats_label.text = _detail_stats_text if not _detail_stats_text.is_empty() else _full_stats_text
		stats_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		return
	# Enemy ownership is public knowledge and must remain text-visible on compact
	# phones; faction color alone is not an accessible information channel.
	ownership_label.visible = not _compact_mode or not _is_owned
	if not _is_owned:
		stats_label.text = _compact_hostile_stats_text if _compact_mode else _full_stats_text
		return
	if _compact_mode:
		stats_label.text = str(_compact_stats_by_kind.get(str(_selected_query.get("kind", "")), ""))
	else:
		stats_label.text = _full_stats_text


func _on_action_pressed() -> void:
	if executor_option.disabled or executor_option.selected < 0:
		return
	if bool(_selected_query.get("dangerous", false)):
		_confirm_dialog.dialog_text = tr("掠夺会降低民忠、农业和商业。确定继续？")
		_confirm_dialog.popup_centered()
		_apply_confirmation_layout()
		return
	_emit_selected_command()


func _emit_selected_command() -> void:
	var officer_id := str(executor_option.get_item_metadata(executor_option.selected))
	if officer_id.is_empty():
		return
	var kind: String = str(_selected_query.get("kind", ""))
	var mode: String = str(_selected_query.get("mode", "executor"))
	var parameters: Dictionary = {"cityId": _city_id}
	if mode == "target":
		parameters["targetOfficerId"] = officer_id
	else:
		parameters["officerId"] = officer_id
	if mode == "trade":
		parameters["direction"] = str(trade_direction.get_item_metadata(trade_direction.selected))
		parameters["amount"] = int(trade_amount.value)
	elif mode == "distribute":
		parameters["targetTroops"] = int(trade_amount.value)
	command_requested.emit(kind, parameters)


func _apply_confirmation_layout() -> void:
	var scale: float = maxf(_last_canvas_scale, 0.01)
	var touch_size: float = TouchMetrics.target_size(scale) if (_compact_mode or TouchMetrics.uses_density_scaled_targets()) else 52.0
	_confirm_dialog.get_ok_button().custom_minimum_size = Vector2(
		ceilf(112.0 / scale) if _compact_mode else 132.0, touch_size
	)
	_confirm_dialog.get_cancel_button().custom_minimum_size = Vector2(
		ceilf(88.0 / scale) if _compact_mode else 96.0, touch_size
	)


func _format_number(value: int) -> String:
	var raw := str(absi(value))
	var parts: Array[String] = []
	while raw.length() > 3:
		parts.push_front(raw.right(3))
		raw = raw.left(raw.length() - 3)
	parts.push_front(raw)
	var result := ",".join(parts)
	return "-%s" % result if value < 0 else result


func _build_owned_detail_text(
		snapshot: Dictionary, city: Dictionary, condition_key: String, condition_name: String
) -> String:
	var satrap_id := str(city.get("satrapOfficerId", ""))
	var officers := _as_dictionary(snapshot.get("officers", {}))
	var satrap_name := tr("空缺")
	if not satrap_id.is_empty() and officers.has(satrap_id):
		satrap_name = str(_as_dictionary(officers[satrap_id]).get("name", satrap_id))
	var lines: PackedStringArray = PackedStringArray([
		tr("人口：%s") % _format_number(int(city.get("population", 0))),
		tr("金钱：%s") % _format_number(int(city.get("money", 0))),
		tr("粮草：%s") % _format_number(int(city.get("food", 0))),
		tr("后备兵：%s") % _format_number(int(city.get("reserveTroops", 0))),
		tr("农业：%d / %d") % [int(city.get("farming", 0)), int(city.get("farmingLimit", 0))],
		tr("商业：%d / %d") % [int(city.get("commerce", 0)), int(city.get("commerceLimit", 0))],
		tr("民忠：%d") % int(city.get("publicLoyalty", 0)),
		tr("城防：%d") % int(city.get("defense", 0)),
		tr("防灾：%d") % int(city.get("disasterPrevention", 0)),
		tr("状态：%s") % condition_name,
		tr("太守：%s") % satrap_name,
	])
	var stationed := _list_stationed_officers(snapshot, str(city.get("id", _city_id)))
	lines.append("")
	lines.append(tr("驻城人物 · %d 人") % stationed.size())
	var acted: Array = snapshot.get("actedOfficerIds", []) if snapshot.get("actedOfficerIds") is Array else []
	var shown := mini(8, stationed.size())
	for index: int in range(shown):
		var officer: Dictionary = stationed[index]
		var officer_id := str(officer.get("id", ""))
		var role := tr("太守") if officer_id == satrap_id else tr("在职")
		var duty := tr("已行动") if acted.has(officer_id) else tr("待命")
		lines.append(
			"%s · %s %d · %s %d · %s %s · %s %d · %s · %s" % [
				str(officer.get("name", officer_id)),
				tr("武"), int(officer.get("force", 0)),
				tr("智"), int(officer.get("intelligence", 0)),
				tr("兵"), _format_number(int(officer.get("troops", 0))),
				tr("忠"), int(officer.get("loyalty", 0)),
				role,
				duty,
			]
		)
	if stationed.size() > 8:
		lines.append(tr("另有 %d 人") % (stationed.size() - 8))
	if condition_key != "normal" and CONDITION_GUIDANCE.has(condition_key):
		lines.append("")
		lines.append(tr(str(CONDITION_GUIDANCE[condition_key])))
	return "\n".join(lines)


func _build_report_detail_text(snapshot: Dictionary, report: Dictionary) -> String:
	var turn_now := int(snapshot.get("turn", 0))
	var observed_turn := int(report.get("observedTurn", turn_now))
	var age_months := maxi(0, turn_now - observed_turn)
	var lines: PackedStringArray = PackedStringArray([
		tr("人口：%s") % _format_number(int(report.get("population", 0))),
		tr("金钱：%s") % _format_number(int(report.get("money", 0))),
		tr("粮草：%s") % _format_number(int(report.get("food", 0))),
		tr("后备兵：%s") % _format_number(int(report.get("reserveTroops", 0))),
		tr("农业：%d") % int(report.get("farming", 0)),
		tr("商业：%d") % int(report.get("commerce", 0)),
		tr("民忠：%s") % (
			str(int(report.get("publicLoyalty", 0))) if report.has("publicLoyalty") else tr("未知")
		),
		tr("城防：%d") % int(report.get("defense", 0)),
		tr("防灾：未知"),
		tr("状态：未知"),
		tr("太守：%s") % str(report.get("satrapName", tr("未知"))),
		"",
		tr("情报采集于 %d 年 %d 月（%d 月前）") % [
			int(report.get("observedYear", 0)),
			int(report.get("observedMonth", 0)),
			age_months,
		],
		"",
		tr("驻城人物 · %d 人（侦察时）") % int(report.get("officerCount", 0)),
		tr("驻军合计 %s 兵") % _format_number(int(report.get("totalTroops", 0))),
		tr("武将 %d 人 · 后备兵 %s") % [
			int(report.get("officerCount", 0)),
			_format_number(int(report.get("reserveTroops", 0))),
		],
		tr("这是侦察时的快照，后续变化不会自动更新。"),
		tr("敌对或中立城池只显示已掌握的情报。侦察和出征需从相邻的己方城池发起。"),
	])
	return "\n".join(lines)


func _list_stationed_officers(snapshot: Dictionary, city_id: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var officers := _as_dictionary(snapshot.get("officers", {}))
	var order: Array = snapshot.get("officerOrder", []) if snapshot.get("officerOrder") is Array else officers.keys()
	for raw_id: Variant in order:
		var officer_id := str(raw_id)
		if not officers.has(officer_id):
			continue
		var officer: Dictionary = _as_dictionary(officers[officer_id]).duplicate(true)
		if str(officer.get("status", "")) != "serving":
			continue
		if str(officer.get("cityId", "")) != city_id:
			continue
		officer["id"] = officer_id
		result.append(officer)
	return result


func _notification(what: int) -> void:
	if what == NOTIFICATION_VISIBILITY_CHANGED and not visible:
		set_embedded_in_sheet(false)


func _as_dictionary(value: Variant) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
