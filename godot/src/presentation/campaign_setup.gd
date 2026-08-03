extends Control

const CONTEXT = preload("res://src/application/campaign_launch_context.gd")
const SESSION_CONTEXT = preload("res://src/application/campaign_session_context.gd")
const ProductionDataRepository = preload("res://src/application/game_session/production_data_repository.gd")
const PauseRepository = preload("res://src/application/persistence/tactical_pause_repository.gd")
const SafeArea = preload("res://src/presentation/safe_area_margin.gd")
const TouchMetrics = preload("res://src/presentation/touch_metrics.gd")

@onready var period_option: OptionButton = %PeriodOption
@onready var ruler_option: OptionButton = %RulerOption
@onready var title_label: Label = %TitleLabel
@onready var description_label: Label = %DescriptionLabel
@onready var facts_label: Label = %FactsLabel
@onready var period_label: Label = %PeriodLabel
@onready var ruler_label: Label = %RulerLabel
@onready var selection_label: Label = %SelectionLabel
@onready var start_button: Button = %StartButton
@onready var back_button: Button = %BackButton

var _periods: Array[Dictionary] = []
var _selected_period := -1
var _selected_ruler_source := -1


func _ready() -> void:
	period_option.item_selected.connect(_on_period_selected)
	ruler_option.item_selected.connect(_on_ruler_selected)
	start_button.pressed.connect(_start_campaign)
	back_button.pressed.connect(_return_to_menu)
	get_viewport().size_changed.connect(_on_viewport_size_changed)
	start_button.disabled = true
	_apply_responsive_layout()
	var loaded: Dictionary = ProductionDataRepository.load_all()
	if not bool(loaded.get("ok", false)):
		selection_label.text = tr("时期目录校验失败：%s") % str(loaded.get("error", "unknown"))
		back_button.grab_focus()
		return
	var period_ids: Array[int] = []
	var envelopes: Dictionary = loaded.get("envelopes", {})
	var states: Dictionary = loaded.get("states", {})
	for raw_id: Variant in envelopes.keys():
		period_ids.append(int(raw_id))
	period_ids.sort()
	for period_id: int in period_ids:
		var envelope: Dictionary = envelopes[period_id]
		var scenario: Dictionary = envelope.get("scenario", {})
		var state_snapshot: Dictionary = {}
		var state: Variant = states.get(period_id, null)
		if state != null and state.has_method("snapshot"):
			state_snapshot = state.snapshot()
		_periods.append({
			"periodId": period_id,
			"scenario": scenario.duplicate(true),
			"rngSeed": int(state_snapshot.get("rngSeed", 0)),
		})
		period_option.add_item("%d · %s" % [period_id, str(scenario.get("title", ""))])
	if not _periods.is_empty():
		period_option.select(0)
		_on_period_selected(0)
	_selection_label_reset()
	period_option.grab_focus()


func _on_viewport_size_changed() -> void:
	_apply_responsive_layout()


func _apply_responsive_layout() -> void:
	var physical_size := DisplayServer.window_get_size()
	if physical_size.x <= 1 or physical_size.y <= 1:
		physical_size = Vector2i(get_viewport_rect().size.round())
	_apply_responsive_layout_for_size(physical_size)


func _apply_responsive_layout_for_size(physical_size: Vector2i) -> void:
	var safe_rect := SafeArea.compute_safe_rect(get_viewport_rect().size)
	var center: Control = $Center
	center.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	center.position = safe_rect.position
	center.size = safe_rect.size
	var canvas_scale := minf(float(physical_size.x) / 1280.0, float(physical_size.y) / 720.0)
	var compact := physical_size.x <= 900 or physical_size.y <= 440
	var card: PanelContainer = $Center/Card
	var popup_font := 17 if compact else 18
	var popup_gap := ceili(28.0 / maxf(canvas_scale, 0.01)) if compact else 8
	for option: OptionButton in [period_option, ruler_option]:
		option.get_popup().add_theme_font_size_override("font_size", ceili(float(popup_font) / maxf(canvas_scale, 0.01)))
		option.get_popup().add_theme_constant_override("v_separation", popup_gap)
	if compact:
		card.custom_minimum_size = Vector2(ceilf(maxf(320.0, safe_rect.size.x - 32.0)), 0.0)
		var touch_size := TouchMetrics.target_size(canvas_scale)
		for control: Control in [period_option, ruler_option, back_button, start_button]:
			control.custom_minimum_size.y = touch_size
			control.add_theme_font_size_override("font_size", ceili(17.0 / maxf(canvas_scale, 0.01)))
		for label: Label in [title_label, description_label, facts_label, period_label, ruler_label, selection_label]:
			label.add_theme_font_size_override("font_size", ceili(15.0 / maxf(canvas_scale, 0.01)))
	else:
		card.custom_minimum_size = Vector2(760.0, 0.0)
		period_option.custom_minimum_size.y = 54.0
		ruler_option.custom_minimum_size.y = 54.0
		back_button.custom_minimum_size.y = 56.0
		start_button.custom_minimum_size.y = 56.0
		for control: Control in [period_option, ruler_option, back_button, start_button]:
			control.add_theme_font_size_override("font_size", 18)


func _on_period_selected(index: int) -> void:
	if index < 0 or index >= _periods.size():
		return
	_selected_period = int(_periods[index]["periodId"])
	var scenario: Dictionary = _periods[index]["scenario"]
	title_label.text = "%s · %s" % [tr("战役设置"), str(scenario.get("title", ""))]
	description_label.text = str(scenario.get("description", ""))
	facts_label.text = tr("公元 %d 年 · 38 城 · 54 条道路 · 初始种子 %d") % [
		int(scenario.get("year", 0)), int(_periods[index].get("rngSeed", 0))
	]
	ruler_option.clear()
	_selected_ruler_source = -1
	for raw_candidate: Variant in scenario.get("playerCandidates", []):
		var candidate: Dictionary = raw_candidate
		ruler_option.add_item("%s · %d 城 · %d 将" % [
			str(candidate.get("name", "")),
			int(candidate.get("cityCount", 0)),
			int(candidate.get("officerCount", 0)),
		])
		ruler_option.set_item_metadata(ruler_option.item_count - 1, int(candidate.get("sourceIndex", -1)))
	ruler_option.select(-1)
	_selection_label_reset()


func _on_ruler_selected(index: int) -> void:
	if index < 0 or index >= ruler_option.item_count:
		_selected_ruler_source = -1
	else:
		_selected_ruler_source = int(ruler_option.get_item_metadata(index))
	_selection_label_reset()


func _selection_label_reset() -> void:
	start_button.disabled = _selected_period < 0 or _selected_ruler_source < 0
	if start_button.disabled:
		selection_label.text = tr("请选择一个时期和一位君主；不会替你静默选定")
	else:
		selection_label.text = tr("已选择时期 %d · 君主源索引 %d · 可进入生产 GameSession") % [
			_selected_period, _selected_ruler_source
		]


func _start_campaign() -> void:
	if start_button.disabled:
		return
	# Opening this setup screen is non-destructive. Only an explicit start of a
	# different campaign is allowed to discard a prior tactical checkpoint.
	var clear_result := PauseRepository.clear_candidates()
	if not bool(clear_result.get("ok", false)):
		selection_label.text = tr("无法清理旧战术恢复检查点：错误 %d") % int(clear_result.get("error", ERR_CANT_OPEN))
		return
	SESSION_CONTEXT.clear()
	CONTEXT.request_campaign(_selected_period, _selected_ruler_source)
	var error := get_tree().change_scene_to_file("res://scenes/presentation/strategy_screen.tscn")
	if error != OK:
		CONTEXT.clear()
		selection_label.text = tr("无法进入战略地图：错误 %d") % error


func _return_to_menu() -> void:
	CONTEXT.clear()
	SESSION_CONTEXT.clear()
	var error := get_tree().change_scene_to_file("res://scenes/presentation/main_menu.tscn")
	if error != OK:
		selection_label.text = tr("无法返回主菜单：错误 %d") % error


func _handle_system_back() -> bool:
	_return_to_menu()
	return true


func _on_application_paused() -> void:
	selection_label.text = tr("应用已暂停；战役选择保持不变")


func _on_application_resumed() -> void:
	selection_label.text = tr("应用已恢复；可以继续选择战役")
