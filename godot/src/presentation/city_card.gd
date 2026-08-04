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
@onready var stats_label: Label = %StatsLabel
@onready var outer_margin: MarginContainer = $OuterMargin
@onready var content: VBoxContainer = $OuterMargin/Content
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

var _city_id := ""
var _base_action_enabled := false
var _busy := false
var _command_queries: Array[Dictionary] = []
var _selected_query: Dictionary = {}
var _confirm_dialog: ConfirmationDialog
var _compact_mode := false
var _last_canvas_scale := 1.0
var _full_stats_text := ""
var _compact_hostile_stats_text := ""
var _compact_stats_by_kind: Dictionary = {}
var _is_owned := false

const DEFAULT_CARD_MINIMUM := Vector2(334.0, 254.0)
const DEFAULT_CLOSE_MINIMUM := Vector2(52.0, 48.0)
const DEFAULT_EXECUTOR_MINIMUM := Vector2(0.0, 52.0)
const DEFAULT_DEVELOP_MINIMUM := Vector2(132.0, 54.0)


func _ready() -> void:
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


func show_city(
		snapshot: Dictionary, city_id: String, command_queries: Array = [], visibility: Dictionary = {}
) -> void:
	var cities := _as_dictionary(snapshot.get("cities", {}))
	var city := _as_dictionary(cities.get(city_id, {}))
	if city.is_empty():
		hide()
		return

	_city_id = city_id
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
	if knowledge == "current":
		ownership_label.text = tr("势力：%s · 己方实时") % owner_name
		var condition_name: String = {
			"normal": tr("正常"), "famine": tr("饥荒"), "drought": tr("旱灾"),
			"flood": tr("水灾"), "rebellion": tr("叛乱"),
		}.get(str(city.get("condition", "normal")), tr("未知"))
		_full_stats_text = "%s  %s\n%s  %s\n%s  %s\n%s" % [
			tr("人口：%s") % _format_number(int(city.get("population", 0))),
			tr("民忠：%d") % int(city.get("publicLoyalty", 0)),
			tr("农业：%d / %d") % [int(city.get("farming", 0)), int(city.get("farmingLimit", 0))],
			tr("商业：%d / %d") % [int(city.get("commerce", 0)), int(city.get("commerceLimit", 0))],
			tr("金：%d") % int(city.get("money", 0)),
			tr("粮：%d") % int(city.get("food", 0)),
			tr("城况：%s · 防灾 %d") % [condition_name, int(city.get("disasterPrevention", 0))],
		]
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
	stats_label.text = _full_stats_text
	_populate_commands(command_queries)
	command_row.visible = _is_owned
	executor_row.visible = _is_owned
	trade_row.visible = _is_owned and trade_row.visible
	develop_button.visible = _is_owned
	officer_button.visible = _is_owned
	personnel_button.visible = _is_owned
	logistics_button.visible = _is_owned
	reconnaissance_button.visible = _is_owned
	diplomacy_button.visible = _is_owned
	# This Control is not container-owned. Recompute its actual rect whenever a
	# visibility mode hides rows or changes compact hostile text density.
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
		stats_label.autowrap_mode = TextServer.AUTOWRAP_OFF
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
		stats_label.autowrap_mode = TextServer.AUTOWRAP_OFF
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
		command_label.visible = true
	_apply_information_density()
	reset_size()


func place_near(anchor_position: Vector2, usable_rect: Rect2) -> void:
	if not visible:
		return
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


func _as_dictionary(value: Variant) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
