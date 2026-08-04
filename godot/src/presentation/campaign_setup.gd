extends Control

const CONTEXT = preload("res://src/application/campaign_launch_context.gd")
const SESSION_CONTEXT = preload("res://src/application/campaign_session_context.gd")
const ProductionDataRepository = preload("res://src/application/game_session/production_data_repository.gd")
const PauseRepository = preload("res://src/application/persistence/tactical_pause_repository.gd")
const SafeArea = preload("res://src/presentation/safe_area_margin.gd")
const TouchMetrics = preload("res://src/presentation/touch_metrics.gd")
const EntryChrome = preload("res://src/presentation/entry_chrome.gd")
const Rulesets = preload("res://src/domain/rules/campaign_rulesets.gd")

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
@onready var period_section: VBoxContainer = %PeriodSection
@onready var period_choices: GridContainer = %PeriodChoices
@onready var period_step_label: Label = %PeriodStepLabel
@onready var ruler_section: VBoxContainer = %RulerSection
@onready var ruler_step_label: Label = %RulerStepLabel
@onready var back_to_periods_button: Button = %BackToPeriodsButton
@onready var ruler_choices_scroll: ScrollContainer = %RulerChoicesScroll
@onready var ruler_choices: VBoxContainer = %RulerChoices
@onready var ruler_preview_text: Label = %RulerPreviewText
@onready var policy_section: VBoxContainer = %PolicySection
@onready var ruleset_option: OptionButton = %RulesetOption
@onready var ruleset_hint: Label = %RulesetHint
@onready var battle_death_option: OptionButton = %BattleDeathOption
@onready var natural_death_option: OptionButton = %NaturalDeathOption
@onready var captive_escape_option: OptionButton = %CaptiveEscapeOption
@onready var period_row: HBoxContainer = $Center/Card/Margin/Stack/PeriodRow
@onready var ruler_row: HBoxContainer = $Center/Card/Margin/Stack/RulerRow

var _periods: Array[Dictionary] = []
var _selected_period := -1
var _selected_ruler_source := -1
var _showing_rulers := false
var _selected_ruleset_id: String = Rulesets.DEFAULT_RULESET_ID
var _lifecycle_policy: Dictionary = Rulesets.default_lifecycle_policy()


func _ready() -> void:
	period_option.item_selected.connect(_on_period_selected)
	ruler_option.item_selected.connect(_on_ruler_selected)
	start_button.pressed.connect(_on_primary_action_pressed)
	back_button.pressed.connect(_return_to_menu)
	back_to_periods_button.pressed.connect(_show_period_selection)
	ruleset_option.item_selected.connect(_on_ruleset_selected)
	battle_death_option.item_selected.connect(_on_lifecycle_option_changed)
	natural_death_option.item_selected.connect(_on_lifecycle_option_changed)
	captive_escape_option.item_selected.connect(_on_lifecycle_option_changed)
	get_viewport().size_changed.connect(_on_viewport_size_changed)
	EntryChrome.apply_plaque_button(back_button, false)
	EntryChrome.apply_plaque_button(start_button, true)
	EntryChrome.apply_plaque_button(back_to_periods_button, false)
	_populate_policy_options()
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
		_add_period_choice(_periods.size() - 1)
	if not _periods.is_empty():
		# Preserve the original focus order without silently confirming a period.
		period_option.select(-1)
		_show_period_selection()
	_selection_label_reset()
	if period_choices.get_child_count() > 0:
		period_choices.get_child(0).grab_focus()


func _populate_policy_options() -> void:
	ruleset_option.clear()
	for ruleset_id: String in Rulesets.SUPPORTED_RULESET_IDS:
		ruleset_option.add_item(Rulesets.label_for(ruleset_id))
		ruleset_option.set_item_metadata(ruleset_option.item_count - 1, ruleset_id)
	ruleset_option.select(0)
	_selected_ruleset_id = Rulesets.DEFAULT_RULESET_ID
	_refresh_ruleset_hint()
	battle_death_option.clear()
	battle_death_option.add_item(tr("关闭（安全模式）"))
	battle_death_option.set_item_metadata(0, "disabled")
	battle_death_option.add_item(tr("固定源码稀有战死"))
	battle_death_option.set_item_metadata(1, "baye-rare")
	battle_death_option.select(0)
	natural_death_option.clear()
	natural_death_option.add_item(tr("关闭（固定源码现行）"))
	natural_death_option.set_item_metadata(0, "disabled")
	natural_death_option.add_item(tr("90 岁后年度判定（现代可选）"))
	natural_death_option.set_item_metadata(1, "age-90-coinflip")
	natural_death_option.select(0)
	captive_escape_option.clear()
	captive_escape_option.add_item(tr("关闭（安全模式）"))
	captive_escape_option.set_item_metadata(0, "disabled")
	captive_escape_option.add_item(tr("每月判定（现代可选）"))
	captive_escape_option.set_item_metadata(1, "modern-monthly")
	captive_escape_option.select(0)
	_lifecycle_policy = Rulesets.default_lifecycle_policy()
	_on_lifecycle_option_changed()
	_refresh_ruleset_hint()


func _on_ruleset_selected(index: int) -> void:
	if index < 0 or index >= ruleset_option.item_count:
		return
	_selected_ruleset_id = str(ruleset_option.get_item_metadata(index))
	_refresh_ruleset_hint()


func _on_lifecycle_option_changed(_index: int = -1) -> void:
	_lifecycle_policy = {
		"version": 1,
		"ageGrowth": "enabled",
		"battleDeath": str(battle_death_option.get_item_metadata(maxi(battle_death_option.selected, 0))),
		"naturalDeath": str(natural_death_option.get_item_metadata(maxi(natural_death_option.selected, 0))),
		"captiveEscape": str(captive_escape_option.get_item_metadata(maxi(captive_escape_option.selected, 0))),
	}


func _refresh_ruleset_hint() -> void:
	ruleset_hint.text = tr("%s 规则在开局后锁定并随存档保存。") % Rulesets.description_for(_selected_ruleset_id)


func _on_viewport_size_changed() -> void:
	_apply_responsive_layout()


func _add_period_choice(index: int) -> void:
	var period: Dictionary = _periods[index]
	var period_id := int(period.get("periodId", 0))
	var button := Button.new()
	button.name = "PeriodChoice%d" % index
	button.clip_contents = true
	button.text = _period_choice_text(period)
	button.alignment = HORIZONTAL_ALIGNMENT_RIGHT
	button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.size_flags_vertical = Control.SIZE_EXPAND_FILL
	button.focus_mode = Control.FOCUS_ALL
	button.mouse_filter = Control.MOUSE_FILTER_STOP
	button.pressed.connect(_on_period_choice_pressed.bind(index))
	var art := TextureRect.new()
	art.name = "Art"
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art.set_anchors_preset(Control.PRESET_FULL_RECT)
	art.anchor_right = 1.0
	art.anchor_bottom = 1.0
	art.offset_left = 0.0
	art.offset_top = 0.0
	art.offset_right = 0.0
	art.offset_bottom = 0.0
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	art.texture = EntryChrome.load_texture(EntryChrome.period_texture_path(period_id))
	button.add_child(art)
	button.move_child(art, 0)
	period_choices.add_child(button)
	_style_choice_button(button, false, true)


func _add_ruler_choice(index: int) -> void:
	var candidate: Dictionary = _periods[_selected_period_index()]
	var scenario: Dictionary = candidate.get("scenario", {})
	var rulers: Array = scenario.get("playerCandidates", [])
	if index < 0 or index >= rulers.size():
		return
	var ruler: Dictionary = rulers[index]
	var button := Button.new()
	button.name = "RulerChoice%d" % index
	button.text = "%s\n%d 城 · %d 将" % [
		str(ruler.get("name", "")),
		int(ruler.get("cityCount", 0)),
		int(ruler.get("officerCount", 0)),
	]
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.focus_mode = Control.FOCUS_ALL
	button.mouse_filter = Control.MOUSE_FILTER_STOP
	button.pressed.connect(_on_ruler_choice_pressed.bind(index))
	ruler_choices.add_child(button)
	_style_choice_button(button, false, false)


func _style_choice_button(button: Button, selected: bool, period_choice: bool) -> void:
	var normal := StyleBoxFlat.new()
	if period_choice:
		normal.bg_color = Color(0.04, 0.09, 0.08, 0.18) if not selected else Color(0.12, 0.2, 0.16, 0.32)
		normal.border_color = Color(0.827, 0.737, 0.494, 0.28) if not selected else Color(0.941, 0.804, 0.447, 1.0)
	else:
		normal.bg_color = Color("#18342f") if not selected else Color("#385b4b")
		normal.border_color = Color("#466d60") if not selected else Color("#e0c578")
	normal.set_border_width_all(1 if not selected else 2)
	normal.set_corner_radius_all(4 if period_choice else 8)
	normal.content_margin_left = 16
	normal.content_margin_top = 14
	normal.content_margin_right = 16
	normal.content_margin_bottom = 14
	var hover := normal.duplicate()
	if period_choice:
		hover.bg_color = Color(0.06, 0.12, 0.1, 0.28)
		hover.border_color = Color(0.941, 0.804, 0.447, 1.0)
	else:
		hover.bg_color = Color("#284b40") if not selected else Color("#456d59")
		hover.border_color = Color("#d8b968")
	var pressed := hover.duplicate()
	pressed.bg_color = Color(0.08, 0.15, 0.13, 0.4) if period_choice else Color("#345b4a")
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	# Focus must not look like a confirmed choice. The selected state is the
	# only state that uses the gold border; keyboard/controller focus gets a
	# separate green outline so the first card is not presented as selected.
	var focus := normal.duplicate()
	focus.border_color = Color("#7fae98") if not period_choice else Color(1.0, 0.937, 0.663, 0.9)
	focus.set_border_width_all(2)
	button.add_theme_stylebox_override("focus", focus)
	button.add_theme_color_override("font_color", Color("#fff0c9") if period_choice else Color("#f0e2c2"))
	button.add_theme_color_override("font_hover_color", Color("#fff7d8"))
	button.add_theme_color_override("font_pressed_color", Color("#fff7d8"))
	button.add_theme_color_override("font_focus_color", Color("#fff7d8"))


func _period_choice_text(period: Dictionary) -> String:
	var scenario: Dictionary = period.get("scenario", {})
	var description := str(scenario.get("description", "")).strip_edges()
	var rulers: Array = scenario.get("playerCandidates", [])
	var lines: PackedStringArray = PackedStringArray([
		str(scenario.get("title", "")),
		tr("公元 %d 年") % int(scenario.get("year", 0)),
	])
	if not description.is_empty():
		lines.append(description)
	lines.append(tr("38 城 · %d 方诸侯") % maxi(rulers.size(), 0))
	return "\n".join(lines)


func _selected_period_index() -> int:
	for index: int in range(_periods.size()):
		if int(_periods[index].get("periodId", -1)) == _selected_period:
			return index
	return -1


func _on_period_choice_pressed(index: int) -> void:
	if index < 0 or index >= _periods.size():
		return
	period_option.select(index)
	_on_period_selected(index)
	_show_ruler_selection()


func _on_ruler_choice_pressed(index: int) -> void:
	if index < 0 or index >= ruler_choices.get_child_count():
		return
	if index < ruler_option.item_count:
		ruler_option.select(index)
	_on_ruler_selected(index)
	for choice_index: int in range(ruler_choices.get_child_count()):
		_style_choice_button(ruler_choices.get_child(choice_index), choice_index == index, false)


func _show_period_selection() -> void:
	_showing_rulers = false
	_selected_ruler_source = -1
	period_section.visible = true
	ruler_section.visible = false
	title_label.text = tr("选择剧本")
	description_label.text = tr("第一步 / 共两步 · 点选一个时期进入君主选择")
	facts_label.text = tr("38 城 · 四段历史剧本")
	period_step_label.text = tr("第一步 / 共两步")
	start_button.text = tr("下一步：选择君主")
	start_button.disabled = _selected_period < 0
	selection_label.text = tr("选择一个剧本后，再选择你要扮演的君主") if _selected_period < 0 else tr("已选择剧本；点击下一步选择君主")
	ruler_preview_text.text = tr("选择一位君主后，这里会显示其初始城池和将领数量")
	for choice: Button in ruler_choices.get_children():
		_style_choice_button(choice, false, false)
	_apply_responsive_layout()
	if period_choices.get_child_count() > 0:
		period_choices.get_child(0).grab_focus()


func _show_ruler_selection() -> void:
	_showing_rulers = true
	period_section.visible = false
	ruler_section.visible = true
	start_button.text = tr("开始霸业")
	_selection_label_reset()
	_apply_responsive_layout()
	if ruler_choices.get_child_count() > 0:
		ruler_choices.get_child(0).grab_focus()


func _on_primary_action_pressed() -> void:
	if not _showing_rulers:
		if _selected_period >= 0:
			_show_ruler_selection()
		return
	_start_campaign()


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
	var mobile_touch := TouchMetrics.uses_density_scaled_targets()
	var touch_mode := compact or mobile_touch
	var ultra_compact := mobile_touch and (physical_size.x <= 900 or physical_size.y <= 440)
	var card: PanelContainer = $Center/Card
	# The legacy OptionButtons remain as an application-state bridge for old
	# presentation fixtures, but the product surface uses real in-page buttons.
	# Native PopupMenu is a poor touch surface here: it can span the whole screen
	# and makes the blank row spacing look selectable when it is not.
	period_option.visible = false
	ruler_option.visible = false
	var touch_size := TouchMetrics.target_size(canvas_scale) if touch_mode else 128.0
	period_choices.columns = 2
	period_choices.custom_minimum_size.y = (touch_size * 2.0 + 14.0) if not _showing_rulers else 0.0
	period_option.custom_minimum_size.y = touch_size
	ruler_option.custom_minimum_size.y = touch_size
	for choice: Button in period_choices.get_children():
		choice.custom_minimum_size = Vector2(0.0, touch_size)
		choice.add_theme_font_size_override("font_size", ceili(16.0 / maxf(canvas_scale, 0.01)) if touch_mode else 16)
	for choice: Button in ruler_choices.get_children():
		choice.custom_minimum_size = Vector2(0.0, touch_size if touch_mode else 72.0)
		choice.add_theme_font_size_override("font_size", ceili(17.0 / maxf(canvas_scale, 0.01)) if touch_mode else 17)
	ruler_choices_scroll.custom_minimum_size.y = maxf(touch_size * 2.0, 210.0) if _showing_rulers else 0.0
	back_to_periods_button.custom_minimum_size = Vector2(touch_size if touch_mode else 120.0, touch_size if touch_mode else 48.0)
	if touch_mode:
		card.custom_minimum_size = Vector2(ceilf(maxf(320.0, safe_rect.size.x - 32.0)), 0.0)
		for control: Control in [back_button, start_button]:
			control.custom_minimum_size.y = touch_size
			control.add_theme_font_size_override("font_size", ceili(17.0 / maxf(canvas_scale, 0.01)))
		back_to_periods_button.add_theme_font_size_override("font_size", ceili(17.0 / maxf(canvas_scale, 0.01)))
		for label: Label in [description_label, facts_label, period_label, ruler_label, selection_label]:
			label.add_theme_font_size_override("font_size", ceili(17.0 / maxf(canvas_scale, 0.01)))
		title_label.add_theme_font_size_override("font_size", ceili(30.0 / maxf(canvas_scale, 0.01)))
		period_step_label.add_theme_font_size_override("font_size", ceili(14.0 / maxf(canvas_scale, 0.01)))
		ruler_step_label.add_theme_font_size_override("font_size", ceili(20.0 / maxf(canvas_scale, 0.01)))
		ruler_preview_text.add_theme_font_size_override("font_size", ceili(17.0 / maxf(canvas_scale, 0.01)))
		period_row.custom_minimum_size.y = touch_size
		ruler_row.custom_minimum_size.y = touch_size
		if ultra_compact:
			description_label.visible = false
			facts_label.visible = false
			selection_label.visible = false
			if start_button.disabled:
				start_button.text = tr("请先完成选择")
			period_row.get_node("PeriodLabel").custom_minimum_size.x = ceilf(100.0 / maxf(canvas_scale, 0.01))
			ruler_row.get_node("RulerLabel").custom_minimum_size.x = ceilf(100.0 / maxf(canvas_scale, 0.01))
		else:
			description_label.visible = true
			facts_label.visible = true
			selection_label.visible = true
			if not _showing_rulers:
				start_button.text = tr("下一步：选择君主")
			else:
				start_button.text = tr("开始霸业")
			period_row.get_node("PeriodLabel").custom_minimum_size.x = 150.0
			ruler_row.get_node("RulerLabel").custom_minimum_size.x = 150.0
	else:
		description_label.visible = true
		facts_label.visible = true
		selection_label.visible = true
		period_row.custom_minimum_size.y = 0.0
		ruler_row.custom_minimum_size.y = 0.0
		period_label.custom_minimum_size.x = 150.0
		ruler_label.custom_minimum_size.x = 150.0
		card.custom_minimum_size = Vector2(980.0, 0.0)
		back_button.custom_minimum_size.y = 56.0
		start_button.custom_minimum_size.y = 56.0
		period_option.custom_minimum_size.y = 54.0
		ruler_option.custom_minimum_size.y = 54.0
		for control: Control in [back_button, start_button]:
			control.add_theme_font_size_override("font_size", 18)
		back_to_periods_button.remove_theme_font_size_override("font_size")
		for label: Label in [title_label, period_step_label, description_label, facts_label, period_label, ruler_label, selection_label, ruler_step_label, ruler_preview_text, ruleset_hint]:
			label.remove_theme_font_size_override("font_size")
	for policy_control: Control in [ruleset_option, battle_death_option, natural_death_option, captive_escape_option]:
		policy_control.custom_minimum_size.y = touch_size if touch_mode else 48.0
		policy_control.add_theme_font_size_override("font_size", ceili(16.0 / maxf(canvas_scale, 0.01)) if touch_mode else 16)
	policy_section.visible = _showing_rulers
	if ultra_compact and _showing_rulers:
		ruleset_hint.visible = false
	else:
		ruleset_hint.visible = true


func _on_period_selected(index: int) -> void:
	if index < 0 or index >= _periods.size():
		return
	_selected_period = int(_periods[index]["periodId"])
	var scenario: Dictionary = _periods[index]["scenario"]
	title_label.text = tr("选择扮演君主")
	description_label.text = tr("%s · 公元 %d 年") % [str(scenario.get("title", "")), int(scenario.get("year", 0))]
	facts_label.text = tr("第二步 / 共两步 · 38 城 · 初始种子 %d") % int(_periods[index].get("rngSeed", 0))
	ruler_option.clear()
	for child: Node in ruler_choices.get_children():
		child.free()
	_selected_ruler_source = -1
	var candidate_index := 0
	for raw_candidate: Variant in scenario.get("playerCandidates", []):
		var candidate: Dictionary = raw_candidate
		ruler_option.add_item("%s · %d 城 · %d 将" % [
			str(candidate.get("name", "")),
			int(candidate.get("cityCount", 0)),
			int(candidate.get("officerCount", 0)),
		])
		ruler_option.set_item_metadata(ruler_option.item_count - 1, int(candidate.get("sourceIndex", -1)))
		_add_ruler_choice(candidate_index)
		candidate_index += 1
	ruler_option.select(-1)
	ruler_step_label.text = tr("选择扮演君主")
	ruler_preview_text.text = tr("选择一位君主后，这里会显示其初始城池和将领数量")
	for choice_index: int in range(period_choices.get_child_count()):
		_style_choice_button(period_choices.get_child(choice_index), choice_index == index, true)
	_selection_label_reset()


func _on_ruler_selected(index: int) -> void:
	var period_index := _selected_period_index()
	if period_index < 0:
		_selected_ruler_source = -1
		_selection_label_reset()
		return
	var candidates: Array = _periods[period_index]["scenario"].get("playerCandidates", [])
	if index < 0 or index >= candidates.size():
		_selected_ruler_source = -1
	else:
		var candidate: Dictionary = candidates[index]
		_selected_ruler_source = int(candidate.get("sourceIndex", -1))
		ruler_preview_text.text = tr("即将扮演：%s\n初始城池 %d · 所属人物 %d · 天下城池 38") % [
			str(candidate.get("name", "")), int(candidate.get("cityCount", 0)), int(candidate.get("officerCount", 0))
		]
	_selection_label_reset()


func _selection_label_reset() -> void:
	if not _showing_rulers:
		start_button.disabled = _selected_period < 0
		if start_button.disabled:
			selection_label.text = tr("选择一个剧本后，再选择你要扮演的君主")
		else:
			selection_label.text = tr("已选择剧本；点击下一步选择君主")
		return
	start_button.disabled = _selected_period < 0 or _selected_ruler_source < 0
	if start_button.disabled:
		selection_label.text = tr("请选择一位君主；不会替你静默选定")
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
	CONTEXT.request_campaign(
		_selected_period,
		_selected_ruler_source,
		_selected_ruleset_id,
		_lifecycle_policy,
	)
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
	if _showing_rulers:
		_show_period_selection()
		return true
	_return_to_menu()
	return true


func _on_application_paused() -> void:
	selection_label.text = tr("应用已暂停；战役选择保持不变")


func _on_application_resumed() -> void:
	selection_label.text = tr("应用已恢复；可以继续选择战役")
