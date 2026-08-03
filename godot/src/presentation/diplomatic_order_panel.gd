class_name DiplomaticOrderPanel
extends PanelContainer

signal command_requested(kind: String, parameters: Dictionary)
signal advance_requested
signal target_preview_requested(source_city_id: String, target_city_id: String)
signal close_requested

@onready var outer_margin: MarginContainer = $OuterMargin
@onready var content: VBoxContainer = $OuterMargin/Content
@onready var title_label: Label = %TitleLabel
@onready var close_button: Button = %CloseButton
@onready var command_option: OptionButton = %CommandOption
@onready var target_option: OptionButton = %TargetOption
@onready var executor_option: OptionButton = %ExecutorOption
@onready var evidence_label: Label = %EvidenceLabel
@onready var orders_label: Label = %OrdersLabel
@onready var reason_label: Label = %ReasonLabel
@onready var advance_button: Button = %AdvanceButton
@onready var execute_button: Button = %ExecuteButton

var _source_city_id := ""
var _catalog: Dictionary = {}
var _commands: Array[Dictionary] = []
var _targets: Array[Dictionary] = []
var _busy := false


func _ready() -> void:
	close_button.pressed.connect(func() -> void: close_requested.emit())
	command_option.item_selected.connect(_on_command_selected)
	target_option.item_selected.connect(_on_target_selected)
	executor_option.item_selected.connect(func(_index: int) -> void: _render_selection())
	execute_button.pressed.connect(_emit_command)
	advance_button.pressed.connect(func() -> void: advance_requested.emit())
	close_button.text = tr("关闭")
	advance_button.text = tr("结算回报")
	hide()


func show_city(source_city_id: String, source_name: String, catalog: Dictionary) -> void:
	_source_city_id = source_city_id
	title_label.text = tr("%s · 外交谋略") % source_name
	refresh(catalog)
	show()


func refresh(catalog: Dictionary) -> void:
	var previous_kind: String = _selected_metadata(command_option)
	var previous_target: String = _selected_metadata(target_option)
	var previous_executor: String = _selected_metadata(executor_option)
	_catalog = catalog.duplicate(true)
	_commands.clear()
	command_option.clear()
	for raw_command: Variant in catalog.get("commands", []):
		if not raw_command is Dictionary: continue
		var command: Dictionary = (raw_command as Dictionary).duplicate(true)
		_commands.append(command)
		command_option.add_item(str(command.get("label", command.get("kind", ""))))
		command_option.set_item_metadata(command_option.item_count - 1, command.get("kind", ""))
	_restore_selection(command_option, previous_kind, "issue_alienate_order")
	_targets.clear()
	target_option.clear()
	for raw_target: Variant in catalog.get("targets", []):
		if not raw_target is Dictionary: continue
		var target: Dictionary = (raw_target as Dictionary).duplicate(true)
		_targets.append(target)
		target_option.add_item("%s · %s / %s" % [
			target.get("name", target.get("id", "")),
			target.get("reportedFactionName", target.get("reportedFactionId", "")),
			target.get("reportedCityName", target.get("reportedCityId", "")),
		])
		target_option.set_item_metadata(target_option.item_count - 1, target.get("id", ""))
	_restore_selection(target_option, previous_target, _default_for_selected_command("defaultTargetId"))
	executor_option.clear()
	for raw_executor: Variant in catalog.get("executors", []):
		if not raw_executor is Dictionary: continue
		var executor: Dictionary = raw_executor
		executor_option.add_item("%s · %s %d" % [
			executor.get("name", executor.get("id", "")), tr("体"), int(executor.get("stamina", 0)),
		])
		executor_option.set_item_metadata(executor_option.item_count - 1, executor.get("id", ""))
	_restore_selection(executor_option, previous_executor, _default_for_selected_command("defaultOfficerId"))
	_render_orders()
	set_busy(_busy)


func set_busy(value: bool) -> void:
	_busy = value
	command_option.disabled = value or command_option.item_count == 0
	target_option.disabled = value or target_option.item_count == 0
	executor_option.disabled = value or executor_option.item_count == 0
	advance_button.disabled = value or (_catalog.get("activeOrders", []) as Array).is_empty()
	close_button.disabled = value
	_render_selection()


func apply_responsive_layout(compact: bool, canvas_scale: float, physical_size: Vector2i) -> void:
	var scale: float = maxf(canvas_scale, 0.01)
	var touch_size: float = ceilf(48.0 / scale) if compact else 52.0
	var target_width_px: float = minf(760.0, maxf(520.0, float(physical_size.x) - 36.0)) if compact else 900.0
	custom_minimum_size = Vector2(ceilf(target_width_px / scale) if compact else target_width_px, 0.0)
	outer_margin.add_theme_constant_override("margin_left", ceili(10.0 / scale) if compact else 18)
	outer_margin.add_theme_constant_override("margin_right", ceili(10.0 / scale) if compact else 18)
	outer_margin.add_theme_constant_override("margin_top", ceili(7.0 / scale) if compact else 10)
	outer_margin.add_theme_constant_override("margin_bottom", ceili(7.0 / scale) if compact else 10)
	content.add_theme_constant_override("separation", ceili(4.0 / scale) if compact else 7)
	close_button.custom_minimum_size = Vector2(ceilf(70.0 / scale) if compact else 82.0, touch_size)
	command_option.custom_minimum_size = Vector2(ceilf(118.0 / scale) if compact else 150.0, touch_size)
	target_option.custom_minimum_size = Vector2(0.0, touch_size)
	executor_option.custom_minimum_size = Vector2(0.0, touch_size)
	advance_button.custom_minimum_size = Vector2(ceilf(112.0 / scale) if compact else 142.0, touch_size)
	execute_button.custom_minimum_size = Vector2(ceilf(132.0 / scale) if compact else 160.0, touch_size)
	var body_size: int = ceili(15.0 / scale) if compact else 18
	title_label.add_theme_font_size_override("font_size", ceili(20.0 / scale) if compact else 24)
	for control: Control in [evidence_label, orders_label, reason_label, close_button, command_option, target_option, executor_option, advance_button, execute_button]:
		control.add_theme_font_size_override("font_size", body_size)
	for popup: PopupMenu in [command_option.get_popup(), target_option.get_popup(), executor_option.get_popup()]:
		popup.add_theme_font_size_override("font_size", body_size)
		popup.add_theme_constant_override("v_separation", ceili(30.0 / scale) if compact else 10)
	reset_size()


func place_in(usable_rect: Rect2) -> void:
	var panel_size: Vector2 = size if size.x > 1.0 and size.y > 1.0 else get_combined_minimum_size()
	position = Vector2(
		clampf(usable_rect.end.x - panel_size.x - 10.0, usable_rect.position.x, usable_rect.end.x - panel_size.x),
		clampf(usable_rect.position.y + 10.0, usable_rect.position.y, usable_rect.end.y - panel_size.y),
	).round()


func _on_command_selected(_index: int) -> void:
	_restore_selection(target_option, "", _default_for_selected_command("defaultTargetId"))
	_restore_selection(executor_option, "", _default_for_selected_command("defaultOfficerId"))
	_render_selection()
	_emit_target_preview()


func _on_target_selected(_index: int) -> void:
	_render_selection()
	_emit_target_preview()


func _emit_target_preview() -> void:
	var target: Dictionary = _selected_target()
	var target_city_id: String = str(target.get("reportedCityId", ""))
	if not target_city_id.is_empty(): target_preview_requested.emit(_source_city_id, target_city_id)


func _render_selection() -> void:
	var command: Dictionary = _selected_command()
	var target: Dictionary = _selected_target()
	var target_id: String = _selected_metadata(target_option)
	var officer_id: String = _selected_metadata(executor_option)
	var cost: Dictionary = command.get("cost", {})
	if target.is_empty():
		evidence_label.text = tr("尚无当月人物情报；请先从己方城池执行侦察。")
	else:
		evidence_label.text = tr("情报证据 %d 年 %d 月 / 回合 %d · %s · 不显示实时忠诚、智力与位置") % [
			int(target.get("observedYear", 0)), int(target.get("observedMonth", 0)),
			int(target.get("observedTurn", 0)), target.get("reportedCityName", target.get("reportedCityId", "")),
		]
	var pair: Dictionary = command.get("pairAvailability", {}).get("%s|%s" % [officer_id, target_id], {})
	var allowed: bool = not command.is_empty() and bool(pair.get("allowed", false))
	var reason: String = str(pair.get("reason", command.get("reason", _catalog.get("reason", ""))))
	reason_label.text = tr("消耗 %d 金 / %d 体 · %d 月回报") % [
		int(cost.get("money", 0)), int(cost.get("stamina", 0)), int(command.get("durationMonths", 1)),
	]
	if not allowed and not reason.is_empty(): reason_label.text += tr(" · 不可执行：%s") % reason
	execute_button.text = tr("签发%s") % str(command.get("label", "谋略"))
	execute_button.disabled = _busy or not allowed
	execute_button.tooltip_text = "" if allowed else reason


func _render_orders() -> void:
	var rows: Array[String] = []
	for raw_order: Variant in _catalog.get("activeOrders", []):
		if not raw_order is Dictionary: continue
		var order: Dictionary = raw_order
		rows.append(tr("%s：%s → %s（余 %d 月）") % [
			order.get("label", order.get("kind", "")), order.get("officerName", order.get("officerId", "")),
			order.get("targetOfficerName", order.get("targetOfficerId", "")), int(order.get("remainingMonths", 0)),
		])
	orders_label.text = tr("当前无在途谋略") if rows.is_empty() else tr("在途：%s") % "；".join(rows)


func _emit_command() -> void:
	var command: Dictionary = _selected_command()
	var target_id: String = _selected_metadata(target_option)
	var officer_id: String = _selected_metadata(executor_option)
	if command.is_empty() or target_id.is_empty() or officer_id.is_empty() or execute_button.disabled: return
	command_requested.emit(command["kind"], {
		"sourceCityId": _source_city_id, "officerId": officer_id, "targetOfficerId": target_id,
	})


func _selected_command() -> Dictionary:
	return {} if command_option.selected < 0 or command_option.selected >= _commands.size() \
		else _commands[command_option.selected]


func _selected_target() -> Dictionary:
	return {} if target_option.selected < 0 or target_option.selected >= _targets.size() \
		else _targets[target_option.selected]


func _default_for_selected_command(key: String) -> String:
	return str(_selected_command().get(key, ""))


func _restore_selection(option: OptionButton, preferred: String, fallback: String) -> void:
	for candidate: String in [preferred, fallback]:
		if candidate.is_empty(): continue
		for index: int in range(option.item_count):
			if str(option.get_item_metadata(index)) == candidate:
				option.select(index)
				return
	if option.item_count > 0: option.select(0)


func _selected_metadata(option: OptionButton) -> String:
	return "" if option.selected < 0 else str(option.get_item_metadata(option.selected))
