class_name ReconnaissancePanel
extends PanelContainer

signal command_requested(kind: String, parameters: Dictionary)
signal target_preview_requested(source_city_id: String, target_city_id: String)
signal close_requested

@onready var title_label: Label = %TitleLabel
@onready var cost_label: Label = %CostLabel
@onready var target_label: Label = %TargetLabel
@onready var target_option: OptionButton = %TargetOption
@onready var executor_label: Label = %ExecutorLabel
@onready var executor_option: OptionButton = %ExecutorOption
@onready var intel_label: Label = %IntelLabel
@onready var execute_button: Button = %ExecuteButton
@onready var close_button: Button = %CloseButton
@onready var outer_margin: MarginContainer = $OuterMargin
@onready var content: VBoxContainer = $OuterMargin/Content

var _source_city_id := ""
var _catalog: Dictionary = {}
var _targets: Array[Dictionary] = []
var _busy := false


func _ready() -> void:
	close_button.pressed.connect(func() -> void: close_requested.emit())
	execute_button.pressed.connect(_emit_command)
	target_option.item_selected.connect(_on_target_selected)
	close_button.text = tr("关闭")
	execute_button.text = tr("执行侦察")
	hide()


func show_city(source_city_id: String, source_name: String, catalog: Dictionary) -> void:
	_source_city_id = source_city_id
	title_label.text = tr("%s · 侦察") % source_name
	refresh(catalog)
	show()


func refresh(catalog: Dictionary) -> void:
	var previous_target: String = _selected_metadata(target_option)
	var previous_officer: String = _selected_metadata(executor_option)
	_catalog = catalog.duplicate(true)
	_targets.clear()
	target_option.clear()
	for raw_target: Variant in catalog.get("targets", []):
		if not raw_target is Dictionary: continue
		var target: Dictionary = (raw_target as Dictionary).duplicate(true)
		_targets.append(target)
		var tag: String = tr("已侦察") if target.get("knowledge", "public") == "report" else tr("未知")
		target_option.add_item("%s · %s · %s" % [target.get("name", target.get("id", "")), target.get("ownerName", ""), tag])
		target_option.set_item_metadata(target_option.item_count - 1, target.get("id", ""))
	_restore_selection(target_option, previous_target, str(catalog.get("defaultTargetCityId", "")))
	executor_option.clear()
	for raw_executor: Variant in catalog.get("executors", []):
		if not raw_executor is Dictionary: continue
		var executor: Dictionary = raw_executor
		executor_option.add_item("%s · %s %d" % [executor.get("name", executor.get("id", "")), tr("体"), int(executor.get("stamina", 0))])
		executor_option.set_item_metadata(executor_option.item_count - 1, executor.get("id", ""))
	_restore_selection(executor_option, previous_officer, str(catalog.get("defaultOfficerId", "")))
	var cost: Dictionary = catalog.get("cost", {})
	cost_label.text = tr("消耗 %d 金、%d 体力、本月行动 · 不使用随机数") % [int(cost.get("money", 0)), int(cost.get("stamina", 0))]
	_render_intel()
	set_busy(_busy)


func set_busy(value: bool) -> void:
	_busy = value
	target_option.disabled = value or target_option.item_count == 0
	executor_option.disabled = value or executor_option.item_count == 0
	execute_button.disabled = value or not bool(_catalog.get("allowed", false)) \
			or target_option.item_count == 0 or executor_option.item_count == 0
	close_button.disabled = value
	if not bool(_catalog.get("allowed", false)) and not str(_catalog.get("reason", "")).is_empty():
		execute_button.tooltip_text = str(_catalog["reason"])


func apply_responsive_layout(compact: bool, canvas_scale: float, physical_size: Vector2i) -> void:
	var scale: float = maxf(canvas_scale, 0.01)
	var touch_size: float = ceilf(48.0 / scale) if compact else 52.0
	var target_width_px: float = minf(420.0, maxf(330.0, float(physical_size.x) - 40.0)) if compact else 430.0
	custom_minimum_size = Vector2(ceilf(target_width_px / scale) if compact else target_width_px, 0.0)
	outer_margin.add_theme_constant_override("margin_left", ceili(10.0 / scale) if compact else 16)
	outer_margin.add_theme_constant_override("margin_right", ceili(10.0 / scale) if compact else 16)
	outer_margin.add_theme_constant_override("margin_top", ceili(8.0 / scale) if compact else 12)
	outer_margin.add_theme_constant_override("margin_bottom", ceili(8.0 / scale) if compact else 12)
	content.add_theme_constant_override("separation", ceili(4.0 / scale) if compact else 9)
	close_button.custom_minimum_size = Vector2(ceilf(68.0 / scale) if compact else 82.0, touch_size)
	target_option.custom_minimum_size = Vector2(0.0, touch_size)
	executor_option.custom_minimum_size = Vector2(0.0, touch_size)
	execute_button.custom_minimum_size = Vector2(ceilf(120.0 / scale) if compact else 138.0, touch_size)
	var body_size: int = ceili(15.0 / scale) if compact else 18
	title_label.add_theme_font_size_override("font_size", ceili(20.0 / scale) if compact else 24)
	for control: Control in [cost_label, target_label, target_option, executor_label, executor_option, intel_label, close_button, execute_button]:
		control.add_theme_font_size_override("font_size", body_size)
	for popup: PopupMenu in [target_option.get_popup(), executor_option.get_popup()]:
		popup.add_theme_font_size_override("font_size", body_size)
		popup.add_theme_constant_override("v_separation", ceili(30.0 / scale) if compact else 10)
	reset_size()


func place_in(usable_rect: Rect2) -> void:
	var panel_size: Vector2 = size if size.x > 1.0 and size.y > 1.0 else get_combined_minimum_size()
	position = Vector2(
		clampf(usable_rect.end.x - panel_size.x - 10.0, usable_rect.position.x, usable_rect.end.x - panel_size.x),
		clampf(usable_rect.position.y + 10.0, usable_rect.position.y, usable_rect.end.y - panel_size.y),
	).round()


func _on_target_selected(_index: int) -> void:
	_render_intel()
	var target_id: String = _selected_metadata(target_option)
	if not target_id.is_empty(): target_preview_requested.emit(_source_city_id, target_id)


func _render_intel() -> void:
	var index: int = target_option.selected
	if index < 0 or index >= _targets.size():
		intel_label.text = str(_catalog.get("reason", tr("当前没有可侦察目标")))
		return
	var target: Dictionary = _targets[index]
	var visibility: Dictionary = target.get("visibility", {})
	if visibility.get("knowledge", "public") != "report":
		intel_label.text = tr("未侦察：只知道城名与当前势力。执行后取得当月快照。")
	else:
		var report: Dictionary = visibility.get("report", {})
		intel_label.text = tr("旧情报 %d 年 %d 月 · %d 将 / %d 兵 · 金 %d · 粮 %d · 后备 %d") % [
			int(report.get("observedYear", 0)), int(report.get("observedMonth", 0)),
			int(report.get("officerCount", 0)), int(report.get("totalTroops", 0)),
			int(report.get("money", 0)), int(report.get("food", 0)), int(report.get("reserveTroops", 0)),
		]
	var reason: String = str(_catalog.get("reason", ""))
	if not bool(_catalog.get("allowed", false)) and not reason.is_empty():
		intel_label.text += "\n" + tr("不可执行：%s") % reason


func _emit_command() -> void:
	var target_id: String = _selected_metadata(target_option)
	var officer_id: String = _selected_metadata(executor_option)
	if target_id.is_empty() or officer_id.is_empty(): return
	command_requested.emit("reconnoitre_city", {
		"sourceCityId": _source_city_id, "targetCityId": target_id, "officerId": officer_id,
	})


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
