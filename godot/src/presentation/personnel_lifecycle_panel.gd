extends PanelContainer

signal command_requested(kind: String, parameters: Dictionary)
signal close_requested

@onready var outer_margin: MarginContainer = $OuterMargin
@onready var content: VBoxContainer = $OuterMargin/Content
@onready var city_title: Label = %CityTitle
@onready var close_button: Button = %CloseButton
@onready var previous_command: Button = %PreviousCommand
@onready var command_option: OptionButton = %CommandOption
@onready var next_command: Button = %NextCommand
@onready var target_option: OptionButton = %TargetOption
@onready var executor_option: OptionButton = %ExecutorOption
@onready var item_option: OptionButton = %ItemOption
@onready var cost_label: Label = %CostLabel
@onready var execute_button: Button = %ExecuteButton
@onready var summary_label: Label = %SummaryLabel
@onready var reason_label: Label = %ReasonLabel

var _city_id := ""
var _query: Dictionary = {}
var _commands: Array[Dictionary] = []
var _selected_command: Dictionary = {}
var _busy := false
var _compact := false
var _canvas_scale := 1.0
var _confirmation: ConfirmationDialog
var _pending_command: Dictionary = {}

const DEFAULT_MINIMUM := Vector2(820.0, 350.0)


func _ready() -> void:
	close_button.pressed.connect(func() -> void: close_requested.emit())
	previous_command.pressed.connect(func() -> void: _step_command(-1))
	next_command.pressed.connect(func() -> void: _step_command(1))
	command_option.item_selected.connect(_on_command_selected)
	target_option.item_selected.connect(_on_target_selected)
	executor_option.item_selected.connect(func(_index: int) -> void: _render_action_state())
	item_option.item_selected.connect(func(_index: int) -> void: _render_action_state())
	execute_button.pressed.connect(_on_execute_pressed)
	_confirmation = ConfirmationDialog.new()
	_confirmation.title = tr("确认危险人物命令")
	_confirmation.get_ok_button().text = tr("确认执行")
	_confirmation.get_cancel_button().text = tr("取消")
	_confirmation.get_label().autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_confirmation.confirmed.connect(_emit_pending_command)
	add_child(_confirmation)
	hide()


func show_city(city_id: String, city_name: String, query: Dictionary) -> void:
	_city_id = city_id
	city_title.text = tr("%s · 人才与俘虏") % city_name
	refresh(query)
	show()


func refresh(query: Dictionary) -> void:
	var selected_kind: String = str(_selected_command.get("kind", ""))
	var selected_target_id: String = _selected_id(target_option)
	var selected_executor_id: String = _selected_id(executor_option)
	var selected_item_id: String = _selected_id(item_option)
	_query = query.duplicate(true)
	_commands.clear()
	for raw_command: Variant in _query.get("commands", []):
		if raw_command is Dictionary:
			_commands.append((raw_command as Dictionary).duplicate(true))
	command_option.clear()
	var selected_index := 0
	for index: int in range(_commands.size()):
		var command: Dictionary = _commands[index]
		command_option.add_item(str(command.get("label", command.get("kind", ""))))
		command_option.set_item_metadata(index, command["kind"])
		if command["kind"] == selected_kind:
			selected_index = index
	if _commands.is_empty():
		command_option.add_item(str(_query.get("reason", tr("没有可用人才命令"))))
		_selected_command = {}
		_render_selected_command()
	else:
		command_option.select(selected_index)
		_selected_command = _commands[selected_index]
		_render_selected_command(selected_target_id, selected_executor_id, selected_item_id)
	set_busy(_busy)


func set_busy(value: bool) -> void:
	_busy = value
	close_button.disabled = value
	previous_command.disabled = value or _commands.size() <= 1
	next_command.disabled = value or _commands.size() <= 1
	command_option.disabled = value or _commands.is_empty()
	_render_action_state()


func apply_responsive_layout(compact: bool, canvas_scale: float, physical_size: Vector2i) -> void:
	_compact = compact
	_canvas_scale = maxf(canvas_scale, 0.01)
	var touch_size: float = ceilf(48.0 / _canvas_scale) if compact else 52.0
	var body_size: int = ceili(15.0 / _canvas_scale) if compact else 18
	var action_size: int = ceili(17.0 / _canvas_scale) if compact else 18
	if compact:
		var target_width_px := minf(810.0, maxf(720.0, float(physical_size.x) - 24.0))
		custom_minimum_size = Vector2(ceilf(target_width_px / _canvas_scale), ceilf(248.0 / _canvas_scale))
		for side: String in ["margin_left", "margin_right"]:
			outer_margin.add_theme_constant_override(side, ceili(10.0 / _canvas_scale))
		for side: String in ["margin_top", "margin_bottom"]:
			outer_margin.add_theme_constant_override(side, ceili(6.0 / _canvas_scale))
		content.add_theme_constant_override("separation", ceili(3.0 / _canvas_scale))
		summary_label.max_lines_visible = 1
	else:
		custom_minimum_size = DEFAULT_MINIMUM
		for side: String in ["margin_left", "margin_right"]:
			outer_margin.add_theme_constant_override(side, 18)
		for side: String in ["margin_top", "margin_bottom"]:
			outer_margin.add_theme_constant_override(side, 12)
		content.add_theme_constant_override("separation", 7)
		summary_label.max_lines_visible = 2
	for control: Control in [
		close_button, previous_command, command_option, next_command,
		target_option, executor_option, item_option, execute_button,
	]:
		control.custom_minimum_size.y = touch_size
		control.add_theme_font_size_override("font_size", action_size)
	if compact:
		previous_command.custom_minimum_size = Vector2(touch_size, touch_size)
		next_command.custom_minimum_size = Vector2(touch_size, touch_size)
		execute_button.custom_minimum_size.x = ceilf(118.0 / _canvas_scale)
	else:
		execute_button.custom_minimum_size.x = 156.0
	for popup: PopupMenu in [
		command_option.get_popup(), target_option.get_popup(),
		executor_option.get_popup(), item_option.get_popup(),
	]:
		popup.add_theme_font_size_override("font_size", action_size)
		popup.add_theme_constant_override("v_separation", ceili(31.0 / _canvas_scale) if compact else 8)
	city_title.add_theme_font_size_override("font_size", ceili(20.0 / _canvas_scale) if compact else 24)
	for label: Label in [cost_label, summary_label, reason_label]:
		label.add_theme_font_size_override("font_size", body_size)
	_confirmation.get_label().add_theme_font_size_override("font_size", body_size)
	_confirmation.min_size = Vector2i(ceilf(370.0 / _canvas_scale), ceilf(176.0 / _canvas_scale)) \
			if compact else Vector2i(460, 200)
	for button: Button in [_confirmation.get_ok_button(), _confirmation.get_cancel_button()]:
		button.custom_minimum_size.y = touch_size
		button.add_theme_font_size_override("font_size", action_size)
	reset_size()


func place_in(usable_rect: Rect2) -> void:
	if not visible:
		return
	var panel_size: Vector2 = size
	if panel_size.x <= 1.0 or panel_size.y <= 1.0:
		panel_size = get_combined_minimum_size()
	panel_size.x = minf(panel_size.x, usable_rect.size.x)
	panel_size.y = minf(panel_size.y, usable_rect.size.y)
	size = panel_size
	position = (usable_rect.position + (usable_rect.size - panel_size) * 0.5).round()


func _on_command_selected(index: int) -> void:
	_selected_command = _commands[index] if index >= 0 and index < _commands.size() else {}
	_render_selected_command()


func _step_command(delta: int) -> void:
	if _commands.is_empty():
		return
	var index: int = posmod(command_option.selected + delta, _commands.size())
	command_option.select(index)
	_on_command_selected(index)


func _render_selected_command(
		preferred_target_id: String = "", preferred_executor_id: String = "",
		preferred_item_id: String = ""
) -> void:
	target_option.clear()
	executor_option.clear()
	item_option.clear()
	if _selected_command.is_empty():
		target_option.visible = false
		executor_option.visible = false
		item_option.visible = false
		cost_label.text = ""
		summary_label.text = ""
		reason_label.text = str(_query.get("reason", tr("没有可用人才命令")))
		execute_button.disabled = true
		return
	var mode: String = str(_selected_command.get("mode", "executor"))
	target_option.visible = mode != "executor"
	executor_option.visible = mode == "executor" or mode == "executor_target"
	item_option.visible = mode == "target_item"
	if target_option.visible:
		for raw_target: Variant in _selected_command.get("targets", []):
			var target: Dictionary = raw_target
			target_option.add_item(_target_label(target))
			target_option.set_item_metadata(target_option.item_count - 1, target.duplicate(true))
		_select_option_by_id(
			target_option,
			preferred_target_id if not preferred_target_id.is_empty() else str(_selected_command.get("defaultTargetId", ""))
		)
	_render_dependent_options(
		preferred_executor_id if not preferred_executor_id.is_empty() else str(_selected_command.get("defaultExecutorId", "")),
		preferred_item_id if not preferred_item_id.is_empty() else str(_selected_command.get("defaultItemId", ""))
	)
	var cost: Dictionary = _selected_command.get("cost", {})
	cost_label.text = "%s %d · %s %d · %s" % [
		tr("体"), int(cost.get("stamina", 0)), tr("金"), int(cost.get("money", 0)),
		tr("占本月行动") if bool(cost.get("usesAction", false)) else tr("不占本月行动"),
	]
	summary_label.text = str(_selected_command.get("summary", ""))
	execute_button.text = str(_selected_command.get("label", tr("执行")))
	_render_action_state()


func _on_target_selected(_index: int) -> void:
	_render_dependent_options()
	_render_action_state()


func _render_dependent_options(
		preferred_executor_id: String = "", preferred_item_id: String = ""
) -> void:
	executor_option.clear()
	item_option.clear()
	var mode: String = str(_selected_command.get("mode", "executor"))
	var target: Dictionary = _selected_record(target_option)
	if executor_option.visible:
		var executors: Array = _selected_command.get("executors", []) if mode == "executor" \
				else target.get("surrenderExecutors", target.get("executors", []))
		for raw_executor: Variant in executors:
			var executor: Dictionary = raw_executor
			executor_option.add_item(_executor_label(executor))
			executor_option.set_item_metadata(executor_option.item_count - 1, executor.duplicate(true))
		_select_option_by_id(executor_option, preferred_executor_id)
	if item_option.visible:
		for raw_item: Variant in target.get("items", []):
			var item: Dictionary = raw_item
			item_option.add_item(_item_label(item))
			item_option.set_item_metadata(item_option.item_count - 1, item.duplicate(true))
		_select_option_by_id(item_option, preferred_item_id)


func _render_action_state() -> void:
	if _selected_command.is_empty():
		execute_button.disabled = true
		return
	var mode: String = str(_selected_command.get("mode", "executor"))
	var target: Dictionary = _selected_record(target_option)
	var executor: Dictionary = _selected_record(executor_option)
	var item: Dictionary = _selected_record(item_option)
	var allowed: bool = bool(_selected_command.get("allowed", false))
	var reason: String = str(_selected_command.get("reason", ""))
	if mode == "executor":
		allowed = not executor.is_empty() and bool(executor.get("allowed", false))
		reason = str(executor.get("reason", reason))
	elif mode == "executor_target":
		allowed = not target.is_empty() and not executor.is_empty() and bool(executor.get("allowed", false))
		reason = str(executor.get("reason", reason))
	elif mode == "target":
		allowed = not target.is_empty() and bool(target.get("allowed", false))
		reason = str(target.get("reason", reason))
	elif mode == "target_item":
		allowed = not target.is_empty() and not item.is_empty() and bool(item.get("allowed", false))
		reason = str(item.get("reason", reason))
	target_option.disabled = _busy or not target_option.visible or target_option.item_count == 0
	executor_option.disabled = _busy or not executor_option.visible or executor_option.item_count == 0
	item_option.disabled = _busy or not item_option.visible or item_option.item_count == 0
	execute_button.disabled = _busy or not allowed
	reason_label.text = tr("已选择合法目标，可执行命令") if allowed else reason


func _on_execute_pressed() -> void:
	if execute_button.disabled:
		return
	_pending_command = {"kind": _selected_command["kind"], "parameters": _command_parameters()}
	if not bool(_selected_command.get("dangerous", false)):
		_emit_pending_command()
		return
	var target: Dictionary = _selected_record(target_option)
	var target_name: String = str(target.get("name", tr("所选人物")))
	var item: Dictionary = _selected_record(item_option)
	var confirmation: String = str(_selected_command.get(
		"confirmationTemplate", tr("此操作不可撤销。确认继续？")
	))
	_confirmation.dialog_text = confirmation.replace("{target}", target_name).replace(
		"{item}", str(item.get("name", tr("装备")))
	)
	_confirmation.popup_centered()
	_apply_confirmation_layout()


func _apply_confirmation_layout() -> void:
	var touch_size: float = ceilf(48.0 / maxf(_canvas_scale, 0.01)) if _compact else 52.0
	_confirmation.get_ok_button().custom_minimum_size = Vector2(
		ceilf(112.0 / maxf(_canvas_scale, 0.01)) if _compact else 132.0, touch_size
	)
	_confirmation.get_cancel_button().custom_minimum_size = Vector2(
		ceilf(88.0 / maxf(_canvas_scale, 0.01)) if _compact else 96.0, touch_size
	)


func _emit_pending_command() -> void:
	if _pending_command.is_empty():
		return
	command_requested.emit(_pending_command["kind"], (_pending_command["parameters"] as Dictionary).duplicate(true))
	_pending_command = {}


func _command_parameters() -> Dictionary:
	var kind: String = str(_selected_command["kind"])
	var target: Dictionary = _selected_record(target_option)
	var executor: Dictionary = _selected_record(executor_option)
	var item: Dictionary = _selected_record(item_option)
	match kind:
		"search_city":
			return {"cityId": _city_id, "officerId": executor["id"]}
		"recruit_free_officer":
			return {
				"cityId": _city_id, "executorOfficerId": executor["id"],
				"targetOfficerId": target["id"],
			}
		"recruit_captive":
			return {
				"cityId": _city_id, "executorOfficerId": executor["id"],
				"captiveOfficerId": target["id"],
			}
		"release_captive", "execute_captive":
			return {"cityId": _city_id, "captiveOfficerId": target["id"]}
		"banish_officer":
			return {"cityId": _city_id, "officerId": target["id"]}
		"confiscate_equipment":
			return {"cityId": _city_id, "officerId": target["id"], "itemId": item["id"]}
	return {"cityId": _city_id}


func _target_label(target: Dictionary) -> String:
	var status: String = {
		"serving": tr("在职"), "free": tr("在野"), "captive": tr("俘虏"),
	}.get(str(target.get("status", "")), str(target.get("status", "")))
	return "%s · %s · %s %d · %s %d" % [
		target.get("name", target.get("id", "")), status,
		tr("忠"), int(target.get("loyalty", 0)),
		tr("智"), int(target.get("effectiveIntelligence", target.get("intelligence", 0))),
	]


func _executor_label(executor: Dictionary) -> String:
	return "%s · %s %d · %s %d" % [
		executor.get("name", executor.get("id", "")),
		tr("体"), int(executor.get("stamina", 0)),
		tr("智"), int(executor.get("effectiveIntelligence", executor.get("intelligence", 0))),
	]


func _item_label(item: Dictionary) -> String:
	return "%s · %s%+d · %s%+d" % [
		item.get("name", item.get("id", "")),
		tr("武"), int(item.get("forceBonus", 0)),
		tr("智"), int(item.get("intelligenceBonus", 0)),
	]


func _select_option_by_id(option: OptionButton, preferred_id: String) -> void:
	if option.item_count == 0:
		return
	var selected_index := 0
	for index: int in range(option.item_count):
		var metadata: Variant = option.get_item_metadata(index)
		if metadata is Dictionary and str((metadata as Dictionary).get("id", "")) == preferred_id:
			selected_index = index
			break
	option.select(selected_index)


func _selected_record(option: OptionButton) -> Dictionary:
	if option.selected < 0 or option.selected >= option.item_count:
		return {}
	var metadata: Variant = option.get_item_metadata(option.selected)
	return metadata as Dictionary if metadata is Dictionary else {}


func _selected_id(option: OptionButton) -> String:
	return str(_selected_record(option).get("id", ""))
