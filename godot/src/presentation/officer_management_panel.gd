class_name OfficerManagementPanel
extends PanelContainer

signal command_requested(kind: String, parameters: Dictionary)
signal close_requested

@onready var outer_margin: MarginContainer = $OuterMargin
@onready var content: VBoxContainer = $OuterMargin/Content
@onready var city_title: Label = %CityTitle
@onready var ruleset_label: Label = %RulesetLabel
@onready var close_button: Button = %CloseButton
@onready var previous_officer: Button = %PreviousOfficer
@onready var officer_option: OptionButton = %OfficerOption
@onready var next_officer: Button = %NextOfficer
@onready var identity_label: Label = %IdentityLabel
@onready var attributes_label: Label = %AttributesLabel
@onready var equipment_label: Label = %EquipmentLabel
@onready var reward_button: Button = %RewardButton
@onready var appoint_button: Button = %AppointButton
@onready var give_option: OptionButton = %GiveOption
@onready var give_button: Button = %GiveButton
@onready var unequip_option: OptionButton = %UnequipOption
@onready var unequip_button: Button = %UnequipButton
@onready var reason_label: Label = %ReasonLabel

var _city_id := ""
var _query: Dictionary = {}
var _officers: Array[Dictionary] = []
var _selected_officer: Dictionary = {}
var _busy := false
var _compact := false
var _canvas_scale := 1.0
var _confirmation: ConfirmationDialog
var _pending_command: Dictionary = {}

const DEFAULT_MINIMUM := Vector2(820.0, 430.0)


func _ready() -> void:
	close_button.pressed.connect(func() -> void: close_requested.emit())
	previous_officer.pressed.connect(func() -> void: _step_officer(-1))
	next_officer.pressed.connect(func() -> void: _step_officer(1))
	officer_option.item_selected.connect(_on_officer_selected)
	reward_button.pressed.connect(func() -> void: _request_confirmation("reward_officer"))
	appoint_button.pressed.connect(func() -> void: _emit_simple("appoint_satrap"))
	give_button.pressed.connect(func() -> void: _request_confirmation("give_item"))
	unequip_button.pressed.connect(func() -> void: _emit_item("unequip_item", unequip_option))
	give_option.item_selected.connect(func(_index: int) -> void: _render_action_state())
	unequip_option.item_selected.connect(func(_index: int) -> void: _render_action_state())
	_confirmation = ConfirmationDialog.new()
	_confirmation.title = tr("确认人物命令")
	_confirmation.get_ok_button().text = tr("确认")
	_confirmation.get_cancel_button().text = tr("取消")
	_confirmation.get_label().autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_confirmation.confirmed.connect(_emit_pending_command)
	add_child(_confirmation)
	hide()


func show_city(city_id: String, city_name: String, query: Dictionary) -> void:
	_city_id = city_id
	city_title.text = tr("%s · 人物与装备") % city_name
	refresh(query)
	show()


func refresh(query: Dictionary) -> void:
	var selected_id: String = str(_selected_officer.get("id", ""))
	_query = query.duplicate(true)
	ruleset_label.text = tr("经典自动太守") \
			if _query.get("appointmentMode", "automatic") == "automatic" \
			else tr("现代手动太守")
	_officers.clear()
	for raw_officer: Variant in _query.get("officers", []):
		if raw_officer is Dictionary:
			_officers.append((raw_officer as Dictionary).duplicate(true))
	officer_option.clear()
	var selected_index := 0
	for index: int in range(_officers.size()):
		var officer: Dictionary = _officers[index]
		var badge: String = tr(" · 太守") if bool(officer.get("isSatrap", false)) else ""
		officer_option.add_item("%s%s" % [officer.get("name", officer["id"]), badge])
		officer_option.set_item_metadata(index, officer["id"])
		if officer["id"] == selected_id:
			selected_index = index
	if _officers.is_empty():
		officer_option.add_item(str(_query.get("reason", tr("城中没有可管理武将"))))
		_selected_officer = {}
	else:
		officer_option.select(selected_index)
		_selected_officer = _officers[selected_index]
	_render_selected_officer()
	set_busy(_busy)


func set_busy(value: bool) -> void:
	_busy = value
	close_button.disabled = value
	previous_officer.disabled = value or _officers.size() <= 1
	next_officer.disabled = value or _officers.size() <= 1
	officer_option.disabled = value or _officers.is_empty()
	_render_action_state()


func apply_responsive_layout(compact: bool, canvas_scale: float, physical_size: Vector2i) -> void:
	_compact = compact
	_canvas_scale = maxf(canvas_scale, 0.01)
	var touch_size: float = ceilf(48.0 / _canvas_scale) if compact else 52.0
	var body_size: int = ceili(15.0 / _canvas_scale) if compact else 18
	var action_size: int = ceili(17.0 / _canvas_scale) if compact else 18
	if compact:
		var target_width_px := minf(790.0, maxf(720.0, float(physical_size.x) - 28.0))
		custom_minimum_size = Vector2(ceilf(target_width_px / _canvas_scale), ceilf(250.0 / _canvas_scale))
		outer_margin.add_theme_constant_override("margin_left", ceili(12.0 / _canvas_scale))
		outer_margin.add_theme_constant_override("margin_right", ceili(12.0 / _canvas_scale))
		outer_margin.add_theme_constant_override("margin_top", ceili(8.0 / _canvas_scale))
		outer_margin.add_theme_constant_override("margin_bottom", ceili(8.0 / _canvas_scale))
		content.add_theme_constant_override("separation", ceili(4.0 / _canvas_scale))
	else:
		custom_minimum_size = DEFAULT_MINIMUM
		for side: String in ["margin_left", "margin_right"]:
			outer_margin.add_theme_constant_override(side, 18)
		for side: String in ["margin_top", "margin_bottom"]:
			outer_margin.add_theme_constant_override(side, 14)
		content.add_theme_constant_override("separation", 8)
	for control: Control in [
		close_button, previous_officer, officer_option, next_officer,
		reward_button, appoint_button, give_option, give_button, unequip_option, unequip_button,
	]:
		control.custom_minimum_size.y = touch_size
		control.add_theme_font_size_override("font_size", action_size)
	if compact:
		previous_officer.custom_minimum_size = Vector2(touch_size, touch_size)
		next_officer.custom_minimum_size = Vector2(touch_size, touch_size)
	for popup: PopupMenu in [officer_option.get_popup(), give_option.get_popup(), unequip_option.get_popup()]:
		popup.add_theme_font_size_override("font_size", action_size)
		popup.add_theme_constant_override("v_separation", ceili(31.0 / _canvas_scale) if compact else 8)
	city_title.add_theme_font_size_override("font_size", ceili(20.0 / _canvas_scale) if compact else 24)
	for label: Label in [ruleset_label, identity_label, attributes_label, equipment_label, reason_label]:
		label.add_theme_font_size_override("font_size", body_size)
	_confirmation.get_label().add_theme_font_size_override("font_size", body_size)
	_confirmation.min_size = Vector2i(ceilf(360.0 / _canvas_scale), ceilf(176.0 / _canvas_scale)) if compact else Vector2i(430, 190)
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


func _on_officer_selected(index: int) -> void:
	if index < 0 or index >= _officers.size():
		_selected_officer = {}
	else:
		_selected_officer = _officers[index]
	_render_selected_officer()


func _step_officer(delta: int) -> void:
	if _officers.is_empty():
		return
	var index: int = posmod(officer_option.selected + delta, _officers.size())
	officer_option.select(index)
	_on_officer_selected(index)


func _render_selected_officer() -> void:
	give_option.clear()
	unequip_option.clear()
	if _selected_officer.is_empty():
		identity_label.text = str(_query.get("reason", tr("城中没有可管理武将")))
		attributes_label.text = ""
		equipment_label.text = ""
		_render_action_state()
		return
	var officer: Dictionary = _selected_officer
	identity_label.text = "%s · %s %d · %s %d%s" % [
		officer["armsTypeName"], tr("忠"), int(officer["loyalty"]), tr("体"), int(officer["stamina"]),
		tr(" · 太守") if bool(officer["isSatrap"]) else "",
	]
	attributes_label.text = "%s %d→%d · %s %d→%d · %s %+d" % [
		tr("武"), int(officer["force"]), int(officer["effectiveForce"]),
		tr("智"), int(officer["intelligence"]), int(officer["effectiveIntelligence"]),
		tr("移"), int(officer["effectiveMoveBonus"]),
	]
	var equipment_names: Array[String] = []
	for raw_item: Variant in officer["equipment"]:
		equipment_names.append(str((raw_item as Dictionary)["name"]))
	var equipment_limit: int = int(_query.get("equipmentLimit", 0))
	equipment_label.text = tr("装备：%s") % (
		tr("无（%d 个有序槽位）") % equipment_limit
		if equipment_names.is_empty() else " / ".join(equipment_names)
	)
	for raw_item: Variant in officer["giveItems"]:
		_add_item_option(give_option, raw_item as Dictionary)
	for raw_item: Variant in officer["unequipItems"]:
		_add_item_option(unequip_option, raw_item as Dictionary)
	if give_option.item_count == 0:
		give_option.add_item(tr("城中没有已发现道具"))
	if unequip_option.item_count == 0:
		unequip_option.add_item(tr("没有可卸下装备"))
	_render_action_state()


func _add_item_option(option: OptionButton, item: Dictionary) -> void:
	var suffix: Array[String] = []
	if int(item.get("forceBonus", 0)) != 0:
		suffix.append("%s%+d" % [tr("武"), int(item["forceBonus"])])
	if int(item.get("intelligenceBonus", 0)) != 0:
		suffix.append("%s%+d" % [tr("智"), int(item["intelligenceBonus"])])
	if item.get("armsTypeOverride", null) != null:
		suffix.append(tr("兵符"))
	var label: String = str(item["name"])
	if not suffix.is_empty():
		label += " · " + " ".join(suffix)
	option.add_item(label)
	option.set_item_metadata(option.item_count - 1, item.duplicate(true))


func _render_action_state() -> void:
	if _selected_officer.is_empty():
		for control: Control in [reward_button, appoint_button, give_button, unequip_button, give_option, unequip_option]:
			control.set("disabled", true)
		return
	var reward: Dictionary = _selected_officer["reward"]
	reward_button.text = tr("奖赏 %d 金") % int(reward.get("moneyCost", 0))
	var appoint: Dictionary = _selected_officer["appoint"]
	var give: Dictionary = _selected_item(give_option)
	var unequip: Dictionary = _selected_item(unequip_option)
	reward_button.disabled = _busy or not bool(reward.get("allowed", false))
	appoint_button.disabled = _busy or not bool(appoint.get("allowed", false))
	give_option.disabled = _busy or give_option.item_count == 0 or give.is_empty()
	give_button.disabled = _busy or not bool(give.get("allowed", false))
	unequip_option.disabled = _busy or unequip_option.item_count == 0 or unequip.is_empty()
	unequip_button.disabled = _busy or not bool(unequip.get("allowed", false))
	var reasons: Array[String] = []
	if not bool(reward.get("allowed", false)):
		reasons.append(tr("奖赏：%s") % reward.get("reason", ""))
	if not bool(appoint.get("allowed", false)):
		reasons.append(tr("任命：%s") % appoint.get("reason", ""))
	if give.is_empty():
		reasons.append(tr("赏赐：城中没有已发现道具"))
	elif not bool(give.get("allowed", false)):
		reasons.append(tr("赏赐：%s") % give.get("reason", ""))
	reason_label.text = tr("可执行人物命令") if reasons.is_empty() else " · ".join(reasons)


func _request_confirmation(kind: String) -> void:
	if kind == "reward_officer":
		_pending_command = {"kind": kind, "parameters": _base_parameters()}
		var money_cost: int = int((_selected_officer["reward"] as Dictionary).get("moneyCost", 0))
		_confirmation.dialog_text = tr("奖赏将从城中支出 %d 金。确认奖赏 %s？") % [money_cost, _selected_officer["name"]]
	else:
		var item: Dictionary = _selected_item(give_option)
		if item.is_empty() or not bool(item.get("allowed", false)):
			return
		var parameters: Dictionary = _base_parameters()
		parameters["itemId"] = item["id"]
		_pending_command = {"kind": kind, "parameters": parameters}
		_confirmation.dialog_text = tr("%s将离开城池库存并交给%s。确认继续？") % [item["name"], _selected_officer["name"]]
	_confirmation.popup_centered()


func _emit_pending_command() -> void:
	if _pending_command.is_empty():
		return
	command_requested.emit(_pending_command["kind"], (_pending_command["parameters"] as Dictionary).duplicate(true))
	_pending_command = {}


func _emit_simple(kind: String) -> void:
	command_requested.emit(kind, _base_parameters())


func _emit_item(kind: String, option: OptionButton) -> void:
	var item: Dictionary = _selected_item(option)
	if item.is_empty() or not bool(item.get("allowed", false)):
		return
	var parameters: Dictionary = _base_parameters()
	parameters["itemId"] = item["id"]
	command_requested.emit(kind, parameters)


func _base_parameters() -> Dictionary:
	return {"cityId": _city_id, "officerId": _selected_officer["id"]}


func _selected_item(option: OptionButton) -> Dictionary:
	if option.selected < 0 or option.selected >= option.item_count:
		return {}
	var metadata: Variant = option.get_item_metadata(option.selected)
	return metadata as Dictionary if metadata is Dictionary else {}
