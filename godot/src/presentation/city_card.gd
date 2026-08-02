## Lightweight city inspector and application-command launcher.
## It only reads snapshots and emits intent; GameSession remains owned by the screen presenter.
class_name CityCard
extends PanelContainer

signal command_requested(kind: String, parameters: Dictionary)
signal close_requested

@onready var title_label: Label = %TitleLabel
@onready var ownership_label: Label = %OwnershipLabel
@onready var stats_label: Label = %StatsLabel
@onready var command_label: Label = %CommandLabel
@onready var command_option: OptionButton = %CommandOption
@onready var executor_label: Label = %ExecutorLabel
@onready var executor_option: OptionButton = %ExecutorOption
@onready var trade_row: HBoxContainer = %TradeRow
@onready var trade_direction: OptionButton = %TradeDirection
@onready var trade_amount: SpinBox = %TradeAmount
@onready var develop_button: Button = %DevelopButton
@onready var close_button: Button = %CloseButton

var _city_id := ""
var _base_action_enabled := false
var _busy := false
var _command_queries: Array[Dictionary] = []
var _selected_query: Dictionary = {}
var _confirm_dialog: ConfirmationDialog

const DEFAULT_CARD_MINIMUM := Vector2(334.0, 254.0)
const DEFAULT_CLOSE_MINIMUM := Vector2(52.0, 48.0)
const DEFAULT_EXECUTOR_MINIMUM := Vector2(0.0, 52.0)
const DEFAULT_DEVELOP_MINIMUM := Vector2(132.0, 54.0)


func _ready() -> void:
	close_button.pressed.connect(func() -> void: close_requested.emit())
	develop_button.pressed.connect(_on_action_pressed)
	command_option.item_selected.connect(_on_command_selected)
	_confirm_dialog = ConfirmationDialog.new()
	_confirm_dialog.title = tr("确认危险命令")
	_confirm_dialog.confirmed.connect(_emit_selected_command)
	add_child(_confirm_dialog)
	close_button.text = tr("关闭")
	command_label.text = tr("内政命令")
	executor_label.text = tr("执行武将")
	hide()


func show_city(snapshot: Dictionary, city_id: String, command_queries: Array = []) -> void:
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
	ownership_label.text = tr("势力：%s") % str(owner.get("name", tr("无主")))
	stats_label.text = "%s  %s\n%s  %s\n%s  %s" % [
		tr("人口：%s") % _format_number(int(city.get("population", 0))),
		tr("民忠：%d") % int(city.get("publicLoyalty", 0)),
		tr("农业：%d / %d") % [int(city.get("farming", 0)), int(city.get("farmingLimit", 0))],
		tr("商业：%d / %d") % [int(city.get("commerce", 0)), int(city.get("commerceLimit", 0))],
		tr("金：%d") % int(city.get("money", 0)),
		tr("粮：%d") % int(city.get("food", 0)),
	]
	_populate_commands(command_queries)
	show()


func set_busy(value: bool) -> void:
	_busy = value
	command_option.disabled = value or _command_queries.is_empty()
	executor_option.disabled = value or not _base_action_enabled
	trade_direction.disabled = value or not _base_action_enabled
	trade_amount.editable = not value and _base_action_enabled
	develop_button.disabled = value or not _base_action_enabled


func apply_responsive_layout(compact: bool, canvas_scale: float, physical_size: Vector2i) -> void:
	var scale := maxf(canvas_scale, 0.01)
	if compact:
		var touch_size := ceilf(48.0 / scale)
		var target_width_px := minf(360.0, maxf(320.0, float(physical_size.x) - 48.0))
		custom_minimum_size = Vector2(ceilf(target_width_px / scale), DEFAULT_CARD_MINIMUM.y)
		close_button.custom_minimum_size = Vector2(touch_size, touch_size)
		executor_option.custom_minimum_size = Vector2(0.0, touch_size)
		develop_button.custom_minimum_size = Vector2(ceilf(112.0 / scale), touch_size)
		var body_font_size := ceili(16.0 / scale)
		var action_font_size := ceili(17.0 / scale)
		title_label.add_theme_font_size_override("font_size", ceili(20.0 / scale))
		for label: Label in [ownership_label, stats_label, command_label, executor_label]:
			label.add_theme_font_size_override("font_size", body_font_size)
		for control: Control in [close_button, command_option, executor_option, trade_direction, trade_amount, develop_button]:
			control.add_theme_font_size_override("font_size", action_font_size)
	else:
		custom_minimum_size = DEFAULT_CARD_MINIMUM
		close_button.custom_minimum_size = DEFAULT_CLOSE_MINIMUM
		executor_option.custom_minimum_size = DEFAULT_EXECUTOR_MINIMUM
		develop_button.custom_minimum_size = DEFAULT_DEVELOP_MINIMUM
		title_label.add_theme_font_size_override("font_size", 24)
		for label: Label in [ownership_label, stats_label, command_label, executor_label]:
			label.add_theme_font_size_override("font_size", 18)
		for control: Control in [close_button, command_option, executor_option, trade_direction, trade_amount, develop_button]:
			control.add_theme_font_size_override("font_size", 18)


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
	trade_row.visible = mode == "trade"
	if mode == "trade":
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
		trade_amount.value = float(_selected_query.get("defaultAmount", 100))
	develop_button.text = str(_selected_query.get("label", tr("执行")))
	set_busy(_busy)


func _on_action_pressed() -> void:
	if executor_option.disabled or executor_option.selected < 0:
		return
	if bool(_selected_query.get("dangerous", false)):
		_confirm_dialog.dialog_text = tr("掠夺会降低民忠、农业和商业。确定继续？")
		_confirm_dialog.popup_centered()
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
	command_requested.emit(kind, parameters)


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
