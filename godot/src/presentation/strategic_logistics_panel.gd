extends PanelContainer

const TouchMetrics = preload("res://src/presentation/touch_metrics.gd")

signal command_requested(kind: String, parameters: Dictionary)
signal advance_requested
signal demo_campaign_requested
signal route_preview_requested(route_city_ids: Array)
signal close_requested

@onready var outer_margin: MarginContainer = $OuterMargin
@onready var content: VBoxContainer = $OuterMargin/Content
@onready var city_title: Label = %CityTitle
@onready var close_button: Button = %CloseButton
@onready var mode_option: OptionButton = %ModeOption
@onready var target_option: OptionButton = %TargetOption
@onready var executor_option: OptionButton = %ExecutorOption
@onready var money_amount: SpinBox = %MoneyAmount
@onready var food_amount: SpinBox = %FoodAmount
@onready var troops_amount: SpinBox = %TroopsAmount
@onready var cargo_row: HBoxContainer = %CargoRow
@onready var route_label: Label = %RouteLabel
@onready var orders_label: Label = %OrdersLabel
@onready var reason_label: Label = %ReasonLabel
@onready var execute_button: Button = %ExecuteButton
@onready var advance_button: Button = %AdvanceButton
@onready var cargo_preset_button: Button = %CargoPresetButton
@onready var demo_button: Button = %DemoButton

var _city_id := ""
var _query: Dictionary = {}
var _busy := false
var _compact := false
var _canvas_scale := 1.0

const DEFAULT_MINIMUM := Vector2(900.0, 382.0)


func _ready() -> void:
	close_button.pressed.connect(func() -> void: close_requested.emit())
	mode_option.add_item(tr("武将调动"))
	mode_option.set_item_metadata(0, "issue_move_order")
	mode_option.add_item(tr("物资输送"))
	mode_option.set_item_metadata(1, "issue_transport_order")
	mode_option.item_selected.connect(func(_index: int) -> void: _render_selection())
	target_option.item_selected.connect(func(_index: int) -> void: _render_selection())
	executor_option.item_selected.connect(func(_index: int) -> void: _render_selection())
	for amount: SpinBox in [money_amount, food_amount, troops_amount]:
		amount.value_changed.connect(func(_value: float) -> void: _render_action_state())
	execute_button.pressed.connect(_emit_command)
	advance_button.pressed.connect(func() -> void: advance_requested.emit())
	cargo_preset_button.pressed.connect(_apply_small_mixed_cargo)
	demo_button.pressed.connect(func() -> void: demo_campaign_requested.emit())
	hide()


func show_city(city_id: String, city_name: String, query: Dictionary) -> void:
	_city_id = city_id
	city_title.text = tr("%s · 战略后勤") % city_name
	refresh(query)
	show()


func refresh(query: Dictionary) -> void:
	var previous_target: String = _selected_record(target_option).get("id", "")
	var previous_executor: String = _selected_record(executor_option).get("id", "")
	_query = query.duplicate(true)
	target_option.clear()
	for raw_target: Variant in _query.get("destinations", []):
		var target: Dictionary = raw_target
		target_option.add_item("%s · %d 月" % [target["name"], int(target["durationMonths"])])
		target_option.set_item_metadata(target_option.item_count - 1, target.duplicate(true))
	_select_by_id(target_option, previous_target)
	executor_option.clear()
	for raw_officer: Variant in _query.get("officers", []):
		var officer: Dictionary = raw_officer
		executor_option.add_item("%s · 体 %d" % [officer["name"], int(officer["stamina"])])
		executor_option.set_item_metadata(executor_option.item_count - 1, officer.duplicate(true))
	_select_by_id(executor_option, previous_executor)
	var limits: Dictionary = _query.get("cargoLimits", {})
	_configure_amount(money_amount, int(limits.get("money", 0)))
	_configure_amount(food_amount, int(limits.get("food", 0)))
	_configure_amount(troops_amount, int(limits.get("reserveTroops", 0)))
	if money_amount.value == 0 and food_amount.value == 0 and troops_amount.value == 0:
		money_amount.value = minf(10.0, money_amount.max_value)
	_render_orders()
	_render_selection()
	set_busy(_busy)


func set_busy(value: bool) -> void:
	_busy = value
	close_button.disabled = value
	mode_option.disabled = value
	target_option.disabled = value or target_option.item_count == 0
	executor_option.disabled = value or executor_option.item_count == 0
	for amount: SpinBox in [money_amount, food_amount, troops_amount]: amount.editable = not value
	cargo_preset_button.disabled = value
	advance_button.disabled = value or (_query.get("activeOrders", []) as Array).is_empty()
	demo_button.disabled = value
	_render_action_state()


func apply_responsive_layout(compact: bool, canvas_scale: float, physical_size: Vector2i) -> void:
	_compact = compact
	_canvas_scale = maxf(canvas_scale, 0.01)
	var touch_mode := compact or TouchMetrics.uses_density_scaled_targets()
	var touch_size: float = TouchMetrics.target_size(_canvas_scale) if touch_mode else 52.0
	var body_size: int = ceili(14.0 / _canvas_scale) if touch_mode else 18
	var action_size: int = ceili(16.0 / _canvas_scale) if touch_mode else 18
	if compact:
		var width_px: float = minf(820.0, maxf(720.0, float(physical_size.x) - 24.0))
		custom_minimum_size = Vector2(ceilf(width_px / _canvas_scale), ceilf(270.0 / _canvas_scale))
		for side: String in ["margin_left", "margin_right"]: outer_margin.add_theme_constant_override(side, ceili(9.0 / _canvas_scale))
		for side: String in ["margin_top", "margin_bottom"]: outer_margin.add_theme_constant_override(side, ceili(5.0 / _canvas_scale))
		content.add_theme_constant_override("separation", ceili(3.0 / _canvas_scale))
	else:
		custom_minimum_size = DEFAULT_MINIMUM
		for side: String in ["margin_left", "margin_right"]: outer_margin.add_theme_constant_override(side, 18)
		for side: String in ["margin_top", "margin_bottom"]: outer_margin.add_theme_constant_override(side, 10)
		content.add_theme_constant_override("separation", 7)
	for control: Control in [close_button, mode_option, target_option, executor_option, money_amount, food_amount, troops_amount, execute_button, advance_button, cargo_preset_button, demo_button]:
		control.custom_minimum_size.y = touch_size
		control.add_theme_font_size_override("font_size", action_size)
	for option: OptionButton in [mode_option, target_option, executor_option]:
		option.get_popup().add_theme_font_size_override("font_size", action_size)
		option.get_popup().add_theme_constant_override("v_separation", TouchMetrics.popup_separation(_canvas_scale, action_size))
	city_title.add_theme_font_size_override("font_size", ceili(20.0 / _canvas_scale) if compact else 24)
	for label: Label in [route_label, orders_label, reason_label]: label.add_theme_font_size_override("font_size", body_size)
	reset_size()


func place_in(usable_rect: Rect2) -> void:
	if not visible: return
	var panel_size: Vector2 = size if size.x > 1.0 and size.y > 1.0 else get_combined_minimum_size()
	panel_size.x = minf(panel_size.x, usable_rect.size.x)
	panel_size.y = minf(panel_size.y, usable_rect.size.y)
	size = panel_size
	position = (usable_rect.position + (usable_rect.size - panel_size) * 0.5).round()


func _render_selection() -> void:
	var kind: String = _selected_kind()
	var transport: bool = kind == "issue_transport_order"
	cargo_row.visible = transport
	cargo_preset_button.visible = transport
	var target: Dictionary = _selected_record(target_option)
	_configure_selected_cargo_limits(target)
	var officer: Dictionary = _selected_record(executor_option)
	if target.is_empty():
		route_label.text = str(_query.get("reason", tr("没有可达己方城市")))
		route_preview_requested.emit([])
	else:
		var route_names: Array = target.get("routeCityNames", target.get("routeCityIds", []))
		route_label.text = "%s：%s · %d 月" % [tr("冻结路线"), " → ".join(route_names), int(target["durationMonths"])]
		route_preview_requested.emit((target.get("routeCityIds", []) as Array).duplicate())
	var allowed_key: String = "transportAllowed" if transport else "moveAllowed"
	var reason_key: String = "transportReason" if transport else "moveReason"
	if not officer.is_empty() and not bool(officer.get(allowed_key, false)):
		reason_label.text = str(officer.get(reason_key, ""))
	_render_action_state()


func _render_action_state() -> void:
	var target: Dictionary = _selected_record(target_option)
	var officer: Dictionary = _selected_record(executor_option)
	var transport: bool = _selected_kind() == "issue_transport_order"
	var allowed_key: String = "transportAllowed" if transport else "moveAllowed"
	var reason_key: String = "transportReason" if transport else "moveReason"
	var allowed: bool = not target.is_empty() and not officer.is_empty() and bool(officer.get(allowed_key, false))
	if transport and not bool(target.get("transportAllowed", false)):
		allowed = false
		reason_label.text = str(target.get("transportReason", tr("目标城无法接收物资")))
	elif transport and int(money_amount.value) + int(food_amount.value) + int(troops_amount.value) <= 0:
		allowed = false
		reason_label.text = tr("请至少输送一种资源")
	elif allowed:
		var risk: int = int(_query.get("lossThresholdPercent", 0))
		reason_label.text = tr("物资签发后立即扣除；抵达时有 %d%% 级受损风险") % risk if transport else tr("签发后武将立即进入在途状态")
	elif not officer.is_empty():
		reason_label.text = str(officer.get(reason_key, _query.get("reason", "")))
	else:
		reason_label.text = str(_query.get("reason", tr("没有可用执行武将")))
	execute_button.text = tr("签发输送") if transport else tr("签发调动")
	execute_button.disabled = _busy or not allowed
	demo_button.visible = (_query.get("destinations", []) as Array).is_empty()


func _render_orders() -> void:
	var lines: Array[String] = []
	for raw_order: Variant in _query.get("activeOrders", []):
		var order: Dictionary = raw_order
		var cargo_text: String = ""
		if order.get("kind", "") == "transport":
			cargo_text = " · %s" % _format_cargo(order.get("cargo", {}))
		lines.append("%s · %s → %s%s · 剩 %d 月" % [order.get("officerName", order["officerId"]), order.get("sourceCityName", order["sourceCityId"]), order.get("targetCityName", order["targetCityId"]), cargo_text, int(order["remainingMonths"])])
	orders_label.text = tr("当前无在途命令") if lines.is_empty() else "%s：%s" % [tr("在途"), "  |  ".join(lines)]


func _format_cargo(cargo: Dictionary) -> String:
	var parts: Array[String] = []
	if int(cargo.get("money", 0)) > 0: parts.append("%d 金" % int(cargo["money"]))
	if int(cargo.get("food", 0)) > 0: parts.append("%d 粮" % int(cargo["food"]))
	if int(cargo.get("reserveTroops", 0)) > 0: parts.append("%d 后备兵" % int(cargo["reserveTroops"]))
	return "、".join(parts)


func _emit_command() -> void:
	if execute_button.disabled: return
	var target: Dictionary = _selected_record(target_option)
	var officer: Dictionary = _selected_record(executor_option)
	var parameters: Dictionary = {"sourceCityId": _city_id, "targetCityId": target["id"], "officerId": officer["id"]}
	if _selected_kind() == "issue_transport_order":
		parameters["cargo"] = {"money": int(money_amount.value), "food": int(food_amount.value), "reserveTroops": int(troops_amount.value)}
	command_requested.emit(_selected_kind(), parameters)


func _apply_small_mixed_cargo() -> void:
	for amount: SpinBox in [money_amount, food_amount, troops_amount]:
		amount.value = minf(10.0, amount.max_value)
	_render_action_state()


func _selected_kind() -> String:
	return str(mode_option.get_item_metadata(mode_option.selected)) if mode_option.selected >= 0 else "issue_move_order"


func _selected_record(option: OptionButton) -> Dictionary:
	if option.selected < 0 or option.selected >= option.item_count: return {}
	var metadata: Variant = option.get_item_metadata(option.selected)
	return metadata as Dictionary if metadata is Dictionary else {}


func _select_by_id(option: OptionButton, preferred_id: String) -> void:
	if option.item_count == 0: return
	var selected: int = 0
	for index: int in range(option.item_count):
		if str((option.get_item_metadata(index) as Dictionary).get("id", "")) == preferred_id: selected = index; break
	option.select(selected)


func _configure_amount(amount: SpinBox, maximum: int) -> void:
	amount.min_value = 0
	amount.max_value = float(maximum)
	amount.value = minf(amount.value, amount.max_value)
	amount.allow_greater = false
	amount.allow_lesser = false
	amount.rounded = true


func _configure_selected_cargo_limits(target: Dictionary) -> void:
	var limits: Dictionary = target.get("cargoLimits", {})
	_configure_amount(money_amount, int(limits.get("money", 0)))
	_configure_amount(food_amount, int(limits.get("food", 0)))
	_configure_amount(troops_amount, int(limits.get("reserveTroops", 0)))
