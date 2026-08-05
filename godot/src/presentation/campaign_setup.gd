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
@onready var start_dock: MarginContainer = %StartDock
@onready var back_button: Button = %BackButton
@onready var header_back_button: Button = %HeaderBackButton
@onready var setup_header: HBoxContainer = %SetupHeader
@onready var actions_row: HBoxContainer = %Actions
@onready var period_section: VBoxContainer = %PeriodSection
@onready var period_choices: GridContainer = %PeriodChoices
@onready var period_step_label: Label = %PeriodStepLabel
@onready var ruler_section: VBoxContainer = %RulerSection
@onready var ruler_step_label: Label = %RulerStepLabel
@onready var back_to_periods_button: Button = %BackToPeriodsButton
@onready var ruler_choices_scroll: ScrollContainer = %RulerChoicesScroll
@onready var ruler_choices: GridContainer = %RulerChoices
@onready var ruler_preview: PanelContainer = %RulerPreview
@onready var ruler_preview_text: Label = %RulerPreviewText
@onready var policy_section: VBoxContainer = %PolicySection
@onready var ruler_aside: VBoxContainer = %RulerAside
@onready var aside_scroll: ScrollContainer = %AsideScroll
@onready var ruler_body: HBoxContainer = %RulerBody
@onready var card_margin: MarginContainer = $Center/Card/Margin
@onready var ruleset_option: OptionButton = %RulesetOption
@onready var ruleset_hint: Label = %RulesetHint
@onready var battle_death_option: OptionButton = %BattleDeathOption
@onready var natural_death_option: OptionButton = %NaturalDeathOption
@onready var captive_escape_option: OptionButton = %CaptiveEscapeOption
@onready var period_row: HBoxContainer = $Center/Card/Margin/Stack/PeriodRow
@onready var ruler_row: HBoxContainer = $Center/Card/Margin/Stack/RulerRow
@onready var center_scroll: ScrollContainer = $Center
@onready var content_stack: VBoxContainer = $Center/Card/Margin/Stack

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
	header_back_button.pressed.connect(_on_header_back_pressed)
	back_to_periods_button.pressed.connect(_show_period_selection)
	ruleset_option.item_selected.connect(_on_ruleset_selected)
	battle_death_option.item_selected.connect(_on_lifecycle_option_changed)
	natural_death_option.item_selected.connect(_on_lifecycle_option_changed)
	captive_escape_option.item_selected.connect(_on_lifecycle_option_changed)
	get_viewport().size_changed.connect(_on_viewport_size_changed)
	EntryChrome.apply_plaque_button(back_button, false)
	EntryChrome.apply_plaque_button(header_back_button, false)
	# HBox stretches children to the tall title; keep the plaque at Web 54px.
	header_back_button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	EntryChrome.apply_plaque_button(start_button, true)
	EntryChrome.apply_plaque_button(back_to_periods_button, false)
	EntryChrome.apply_scenario_heading(title_label, 48)
	var scrim := get_node_or_null("Scrim") as ColorRect
	if scrim != null:
		# Web scenario-screen has no dark overlay; keep parchment readable.
		scrim.color = Color(0.08, 0.1, 0.09, 0.08)
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
		header_back_button.grab_focus()


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
	# Keep this as a one-line footnote; long ruleset copy must not push the CTA.
	ruleset_hint.text = tr("%s · 开局后锁定") % Rulesets.label_for(_selected_ruleset_id)


func _on_viewport_size_changed() -> void:
	_apply_responsive_layout()


func _add_period_choice(index: int) -> void:
	var period: Dictionary = _periods[index]
	var period_id := int(period.get("periodId", 0))
	var scenario: Dictionary = period.get("scenario", {})
	var button := Button.new()
	button.name = "PeriodChoice%d" % index
	button.clip_contents = true
	# TextureRect children paint above Button text in Godot 4, so captions live in
	# an overlay that matches the Web scenario-card caption placement.
	button.text = ""
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.size_flags_vertical = Control.SIZE_EXPAND_FILL
	button.focus_mode = Control.FOCUS_ALL
	button.mouse_filter = Control.MOUSE_FILTER_STOP
	button.pressed.connect(_on_period_choice_pressed.bind(index))
	var art := TextureRect.new()
	art.name = "Art"
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_SCALE
	art.texture = EntryChrome.load_texture(EntryChrome.period_texture_path(period_id))
	button.add_child(art)
	var veil := ColorRect.new()
	veil.name = "Veil"
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Light full-card veil only — Web relies on text-shadow, not a caption plate.
	veil.color = Color(0.02, 0.05, 0.04, 0.1)
	veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	button.add_child(veil)
	var caption := VBoxContainer.new()
	caption.name = "Caption"
	caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	caption.add_theme_constant_override("separation", 6)
	caption.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	caption.offset_left = 24.0
	caption.offset_top = 24.0
	caption.offset_right = -24.0
	caption.offset_bottom = -24.0
	var spacer := Control.new()
	spacer.name = "Spacer"
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	caption.add_child(spacer)
	var title := Label.new()
	title.name = "Title"
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.text = str(scenario.get("title", ""))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	title.autowrap_mode = TextServer.AUTOWRAP_OFF
	EntryChrome.apply_scenario_card_title(title, 28)
	caption.add_child(title)
	var year := Label.new()
	year.name = "Year"
	year.mouse_filter = Control.MOUSE_FILTER_IGNORE
	year.text = tr("公元 %d 年") % int(scenario.get("year", 0))
	year.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	EntryChrome.apply_scenario_card_year(year, 12)
	caption.add_child(year)
	var description := str(scenario.get("description", "")).strip_edges()
	if not description.is_empty():
		var body := Label.new()
		body.name = "Body"
		body.mouse_filter = Control.MOUSE_FILTER_IGNORE
		body.text = description
		body.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		EntryChrome.apply_scenario_card_body(body, 12, false)
		caption.add_child(body)
	var meta := Label.new()
	meta.name = "Meta"
	meta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var rulers: Array = scenario.get("playerCandidates", [])
	meta.text = tr("38 城 · %d 方诸侯") % maxi(rulers.size(), 0)
	meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	EntryChrome.apply_scenario_card_body(meta, 12, true)
	caption.add_child(meta)
	button.add_child(caption)
	button.mouse_entered.connect(_on_period_card_hover.bind(button, true))
	button.mouse_exited.connect(_on_period_card_hover.bind(button, false))
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
		normal.bg_color = Color(0, 0, 0, 0)
		normal.border_color = Color(0.827, 0.737, 0.494, 0.25)
		normal.set_border_width_all(1 if not selected else 2)
		normal.set_corner_radius_all(4)
	else:
		# Web `.ruler-grid button` / `.ruler-grid button.selected`
		if selected:
			normal.bg_color = Color(0.314, 0.427, 0.365, 1.0) # ~#506d5d
			normal.border_color = Color(0.878, 0.773, 0.471, 1.0) # #e0c578
			normal.set_border_width_all(1)
			normal.border_width_left = 4 # inset gold bar
		else:
			normal.bg_color = Color(0.129, 0.235, 0.2, 0.76) # rgba(33,60,51,.76)
			normal.border_color = Color(0.678, 0.745, 0.686, 0.22)
			normal.set_border_width_all(1)
		normal.set_corner_radius_all(3)
	normal.content_margin_left = 16
	normal.content_margin_top = 14
	normal.content_margin_right = 16
	normal.content_margin_bottom = 14
	var hover := normal.duplicate() as StyleBoxFlat
	if period_choice:
		# Web `.scenario-card:hover`: gold border + multi-layer glow.
		hover.bg_color = Color(0, 0, 0, 0)
		hover.border_color = Color(0.941, 0.804, 0.447, 1.0) # #f0cd72
		hover.set_border_width_all(1)
		hover.shadow_color = Color(0.86, 0.68, 0.26, 0.38)
		hover.shadow_size = 18
		hover.shadow_offset = Vector2(0, 8)
	elif selected:
		hover.bg_color = Color(0.345, 0.463, 0.396, 1.0)
		hover.border_color = Color(0.941, 0.804, 0.447, 1.0)
	else:
		# Web `.ruler-grid button:hover` — only a lighter border, not a selection.
		hover.bg_color = Color(0.16, 0.28, 0.24, 0.88)
		hover.border_color = Color(0.553, 0.639, 0.588, 1.0) # #8da396
	var pressed := hover.duplicate() as StyleBoxFlat
	if period_choice:
		pressed.shadow_size = 10
		pressed.shadow_offset = Vector2(0, 3)
	elif not selected:
		pressed.bg_color = Color(0.145, 0.255, 0.22, 0.9)
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	# Focus must never impersonate selection. Use an empty focus ring so keyboard
	# navigation stays reachable without lighting the first card on entry.
	var focus := StyleBoxEmpty.new()
	if period_choice:
		var period_focus := normal.duplicate() as StyleBoxFlat
		period_focus.border_color = Color(0.941, 0.804, 0.447, 0.45)
		period_focus.set_border_width_all(1)
		button.add_theme_stylebox_override("focus", period_focus)
	else:
		button.add_theme_stylebox_override("focus", focus)
	if period_choice:
		button.add_theme_color_override("font_color", Color("#fff0c9"))
	elif selected:
		button.add_theme_color_override("font_color", Color(0.925, 0.867, 0.725, 1.0)) # #ecddb9
	else:
		button.add_theme_color_override("font_color", Color(0.925, 0.867, 0.725, 1.0))
	button.add_theme_color_override("font_hover_color", Color("#fff7d8"))
	button.add_theme_color_override("font_pressed_color", Color("#fff7d8"))
	button.add_theme_color_override("font_focus_color", Color(0.925, 0.867, 0.725, 1.0))
	button.flat = false
	if period_choice:
		_ensure_period_hover_frame(button)
	else:
		_apply_ruler_choice_type(button, selected)


func _ensure_period_hover_frame(button: Button) -> void:
	## Web hover uses inset light-gold + dark rings plus an outline offset.
	var frame := button.get_node_or_null("HoverFrame") as Panel
	if frame == null:
		frame = Panel.new()
		frame.name = "HoverFrame"
		frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
		button.add_child(frame)
	frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	frame.offset_left = -3.0
	frame.offset_top = -3.0
	frame.offset_right = 3.0
	frame.offset_bottom = 3.0
	frame.visible = false
	frame.z_index = 3
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0, 0, 0, 0)
	# Outer outline ≈ `outline: 1px rgba(255,239,169,.9); outline-offset: 3px`
	style.border_color = Color(1.0, 0.937, 0.663, 0.9)
	style.set_border_width_all(1)
	style.set_corner_radius_all(4)
	# Draw the Web inset rings via expand margins / content margins:
	# light gold 1px inside, dark brown band ~2px (inset 0 0 0 3px over 1px).
	style.shadow_color = Color(0.435, 0.302, 0.098, 0.82) # #6f4d19
	style.shadow_size = 2
	style.shadow_offset = Vector2.ZERO
	frame.add_theme_stylebox_override("panel", style)
	var inset := frame.get_node_or_null("InsetRim") as Panel
	if inset == null:
		inset = Panel.new()
		inset.name = "InsetRim"
		inset.mouse_filter = Control.MOUSE_FILTER_IGNORE
		frame.add_child(inset)
	inset.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	inset.offset_left = 4.0
	inset.offset_top = 4.0
	inset.offset_right = -4.0
	inset.offset_bottom = -4.0
	var inset_style := StyleBoxFlat.new()
	inset_style.bg_color = Color(0, 0, 0, 0)
	inset_style.border_color = Color(1.0, 0.957, 0.745, 0.86) # inset light gold
	inset_style.set_border_width_all(1)
	inset_style.set_corner_radius_all(2)
	inset.add_theme_stylebox_override("panel", inset_style)


func _on_period_card_hover(button: Button, hovered: bool) -> void:
	button.z_index = 2 if hovered else 0
	var art := button.get_node_or_null("Art") as TextureRect
	if art != null:
		# Web `filter: saturate(1.08) brightness(1.04)`
		art.modulate = Color(1.12, 1.1, 1.05, 1.0) if hovered else Color.WHITE
	var frame := button.get_node_or_null("HoverFrame") as Panel
	if frame != null:
		frame.visible = hovered


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
	period_step_label.text = tr("1 / 2")
	description_label.text = tr("点选一个时期进入君主选择")
	facts_label.text = tr("38 城 · 四段历史剧本")
	start_button.text = tr("下一步：选择君主")
	start_button.disabled = _selected_period < 0
	selection_label.text = tr("选择一个剧本后，再选择你要扮演的君主") if _selected_period < 0 else tr("已选择剧本；点击下一步选择君主")
	ruler_preview_text.text = tr("点选君主查看城池与将领")
	_apply_preview_density(false)
	for choice: Button in ruler_choices.get_children():
		_style_choice_button(choice, false, false)
	_apply_responsive_layout()
	# Do not leave the first card looking hovered via focus styling.
	if period_choices.get_child_count() > 0:
		header_back_button.grab_focus()


func _show_ruler_selection() -> void:
	_showing_rulers = true
	period_section.visible = false
	ruler_section.visible = true
	start_button.text = tr("开始霸业")
	period_step_label.text = tr("2 / 2")
	_selection_label_reset()
	_apply_responsive_layout()
	# Keep logical selection empty; do not focus the first ruler card or it reads
	# as "董卓 already chosen" against quieter siblings.
	header_back_button.grab_focus()


func _apply_ruler_choice_type(button: Button, _selected: bool) -> void:
	var font := EntryChrome.serif_extrabold()
	if font != null:
		button.add_theme_font_override("font", font)
	button.add_theme_font_size_override("font_size", 18)


func _on_header_back_pressed() -> void:
	if _showing_rulers:
		_show_period_selection()
		return
	_return_to_menu()


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
	var canvas_scale := minf(float(physical_size.x) / 1280.0, float(physical_size.y) / 720.0)
	var compact := physical_size.x <= 900 or physical_size.y <= 440
	var mobile_touch := TouchMetrics.uses_density_scaled_targets()
	var touch_mode := compact or mobile_touch
	var ultra_compact := mobile_touch and (physical_size.x <= 900 or physical_size.y <= 440)
	var card: PanelContainer = $Center/Card
	# The legacy OptionButtons remain as an application-state bridge for old
	# presentation fixtures, but the product surface uses real in-page buttons.
	period_option.visible = false
	ruler_option.visible = false
	var touch_size := TouchMetrics.target_size(canvas_scale) if touch_mode else 128.0
	var cta_height := touch_size if touch_mode else 52.0
	EntryChrome.set_plaque_min_height(start_button, cta_height)
	# Pin 开始霸业 to the viewport bottom so phone players never scroll for the CTA.
	var dock_margin_v := 20.0 if touch_mode else 24.0
	var dock_height := cta_height + dock_margin_v if _showing_rulers else 0.0
	start_dock.visible = _showing_rulers
	start_dock.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	start_dock.offset_top = -dock_height
	start_dock.offset_bottom = 0.0
	start_dock.add_theme_constant_override("margin_left", 16 if touch_mode else 24)
	start_dock.add_theme_constant_override("margin_right", 16 if touch_mode else 24)
	start_dock.add_theme_constant_override("margin_top", 8)
	start_dock.add_theme_constant_override("margin_bottom", maxi(12, int(get_viewport_rect().size.y - safe_rect.end.y)))
	center_scroll.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	center_scroll.position = safe_rect.position
	center_scroll.size = Vector2(safe_rect.size.x, maxf(120.0, safe_rect.size.y - dock_height))
	period_choices.columns = 2
	period_option.custom_minimum_size.y = touch_size
	ruler_option.custom_minimum_size.y = touch_size
	# Budget chrome first so the period grid can fill the leftover viewport
	# (Web `.scenario-grid { grid-template-rows: repeat(2, minmax(0, 1fr)) }`).
	if touch_mode:
		card_margin.add_theme_constant_override("margin_top", 8)
		card_margin.add_theme_constant_override("margin_bottom", 8)
		card_margin.add_theme_constant_override("margin_left", 12)
		card_margin.add_theme_constant_override("margin_right", 12)
		content_stack.add_theme_constant_override("separation", 8)
	else:
		card_margin.add_theme_constant_override("margin_top", 24)
		card_margin.add_theme_constant_override("margin_bottom", 20)
		card_margin.add_theme_constant_override("margin_left", 24)
		card_margin.add_theme_constant_override("margin_right", 24)
		content_stack.add_theme_constant_override("separation", 14)
	EntryChrome.set_plaque_minimum_size(
		back_to_periods_button,
		Vector2(touch_size if touch_mode else 120.0, touch_size if touch_mode else 48.0)
	)
	EntryChrome.set_plaque_minimum_size(
		header_back_button,
		Vector2(
			maxf(120.0, touch_size) if touch_mode else 142.0,
			touch_size if touch_mode else 54.0
		)
	)
	var margin_v := float(
		card_margin.get_theme_constant("margin_top") + card_margin.get_theme_constant("margin_bottom")
	)
	var stack_sep := float(content_stack.get_theme_constant("separation"))
	var header_budget := EntryChrome.plaque_min_height(header_back_button)
	description_label.visible = _showing_rulers
	description_label.max_lines_visible = 1
	description_label.autowrap_mode = TextServer.AUTOWRAP_OFF if compact else TextServer.AUTOWRAP_WORD_SMART
	var subtitle_budget := 20.0 if _showing_rulers else 0.0
	var body_height := maxf(
		140.0,
		center_scroll.size.y - margin_v - header_budget - subtitle_budget - stack_sep * (2.0 if _showing_rulers else 1.0)
	)
	var title_font := ceili(clampf(float(physical_size.x) * 0.045, 34.0, 58.0) / maxf(canvas_scale if touch_mode else 1.0, 0.85))
	if touch_mode:
		title_font = ceili(clampf(28.0 / maxf(canvas_scale, 0.01), 28.0, 40.0))
	EntryChrome.apply_scenario_heading(title_label, title_font)
	var card_title_font := 21 if touch_mode else 28
	var card_body_font := 11 if touch_mode else 12
	if not _showing_rulers:
		content_stack.size_flags_vertical = Control.SIZE_EXPAND_FILL
		period_section.size_flags_vertical = Control.SIZE_EXPAND_FILL
		period_choices.size_flags_vertical = Control.SIZE_EXPAND_FILL
		period_choices.custom_minimum_size.y = body_height
		var row_h := maxf(touch_size if touch_mode else 160.0, (body_height - float(period_choices.get_theme_constant("v_separation"))) * 0.5)
		for choice: Button in period_choices.get_children():
			choice.custom_minimum_size = Vector2(0.0, row_h)
			choice.size_flags_vertical = Control.SIZE_EXPAND_FILL
			_style_period_caption_fonts(choice, card_title_font, card_body_font)
	else:
		period_choices.custom_minimum_size.y = 0.0
		for choice: Button in period_choices.get_children():
			choice.custom_minimum_size = Vector2(0.0, touch_size)
	for choice: Button in ruler_choices.get_children():
		choice.custom_minimum_size = Vector2(0.0, touch_size if touch_mode else 64.0)
		choice.add_theme_font_size_override("font_size", ceili(16.0 / maxf(canvas_scale, 0.01)) if touch_mode else 16)
	# Ruler step: page scroll off; only monarch grid / policy aside scroll.
	center_scroll.vertical_scroll_mode = (
		ScrollContainer.SCROLL_MODE_DISABLED if _showing_rulers else ScrollContainer.SCROLL_MODE_DISABLED
	)
	center_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	if _showing_rulers:
		content_stack.size_flags_vertical = Control.SIZE_EXPAND_FILL
	ruler_section.size_flags_vertical = Control.SIZE_EXPAND_FILL
	ruler_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	aside_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	ruler_choices_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	ruler_body.custom_minimum_size.y = body_height if _showing_rulers else 0.0
	ruler_choices_scroll.custom_minimum_size.y = maxf(touch_size * 2.0, 120.0) if _showing_rulers else 0.0
	aside_scroll.custom_minimum_size.y = maxf(96.0, 120.0) if _showing_rulers else 0.0
	ruler_aside.custom_minimum_size.x = 200.0 if (compact or ultra_compact) else 280.0
	_apply_preview_density(_selected_ruler_source >= 0)
	if touch_mode:
		card.custom_minimum_size = Vector2(ceilf(maxf(320.0, center_scroll.size.x - 8.0)), center_scroll.size.y)
		for control: Button in [back_button, start_button, header_back_button]:
			EntryChrome.set_plaque_min_height(control, touch_size)
			control.add_theme_font_size_override("font_size", ceili(17.0 / maxf(canvas_scale, 0.01)))
		back_to_periods_button.add_theme_font_size_override("font_size", ceili(17.0 / maxf(canvas_scale, 0.01)))
		for label: Label in [facts_label, period_label, ruler_label, selection_label]:
			label.add_theme_font_size_override("font_size", ceili(15.0 / maxf(canvas_scale, 0.01)))
		period_step_label.add_theme_font_size_override("font_size", ceili(11.0 / maxf(canvas_scale, 0.01)))
		description_label.add_theme_font_size_override("font_size", ceili(12.0 / maxf(canvas_scale, 0.01)))
		ruler_step_label.add_theme_font_size_override("font_size", ceili(18.0 / maxf(canvas_scale, 0.01)))
		ruler_preview_text.add_theme_font_size_override("font_size", ceili(12.0 / maxf(canvas_scale, 0.01)))
		ruleset_hint.add_theme_font_size_override("font_size", ceili(11.0 / maxf(canvas_scale, 0.01)))
		period_row.custom_minimum_size.y = touch_size
		ruler_row.custom_minimum_size.y = touch_size
		period_row.get_node("PeriodLabel").custom_minimum_size.x = ceilf(100.0 / maxf(canvas_scale, 0.01)) if ultra_compact else 150.0
		ruler_row.get_node("RulerLabel").custom_minimum_size.x = ceilf(100.0 / maxf(canvas_scale, 0.01)) if ultra_compact else 150.0
		if _showing_rulers and ultra_compact and start_button.disabled:
			start_button.text = tr("请先完成选择")
		elif _showing_rulers:
			start_button.text = tr("开始霸业")
		else:
			start_button.text = tr("开始霸业")
	else:
		period_row.custom_minimum_size.y = 0.0
		ruler_row.custom_minimum_size.y = 0.0
		period_label.custom_minimum_size.x = 150.0
		ruler_label.custom_minimum_size.x = 150.0
		card.custom_minimum_size = Vector2(
			minf(1240.0, maxf(980.0, center_scroll.size.x - 48.0)),
			center_scroll.size.y
		)
		EntryChrome.set_plaque_min_height(back_button, 56.0)
		EntryChrome.set_plaque_min_height(start_button, 52.0)
		EntryChrome.set_plaque_minimum_size(header_back_button, Vector2(142.0, 54.0))
		period_option.custom_minimum_size.y = 54.0
		ruler_option.custom_minimum_size.y = 54.0
		for control: Control in [back_button, start_button, header_back_button]:
			control.add_theme_font_size_override("font_size", 18)
		back_to_periods_button.remove_theme_font_size_override("font_size")
		for label: Label in [period_step_label, description_label, facts_label, period_label, ruler_label, selection_label, ruler_step_label, ruler_preview_text, ruleset_hint]:
			label.remove_theme_font_size_override("font_size")
		period_step_label.add_theme_font_size_override("font_size", 12)
		description_label.add_theme_font_size_override("font_size", 14)
		ruler_preview_text.add_theme_font_size_override("font_size", 12)
		ruleset_hint.add_theme_font_size_override("font_size", 11)
	for policy_control: Control in [ruleset_option, battle_death_option, natural_death_option, captive_escape_option]:
		policy_control.custom_minimum_size.y = mini(touch_size, 44.0) if touch_mode else 44.0
		policy_control.add_theme_font_size_override("font_size", ceili(14.0 / maxf(canvas_scale, 0.01)) if touch_mode else 15)
	# Period step: header + grid. Ruler step: content above a viewport-pinned CTA dock.
	facts_label.visible = false
	selection_label.visible = false
	actions_row.visible = false
	back_button.visible = false
	start_button.visible = _showing_rulers
	header_back_button.visible = true
	policy_section.visible = _showing_rulers
	ruleset_hint.visible = _showing_rulers
	period_step_label.visible = true
	back_to_periods_button.visible = false
	ruler_aside.visible = _showing_rulers
	if _showing_rulers:
		ruler_choices.columns = 2 if (compact or ultra_compact or physical_size.x < 1100) else 3
		header_back_button.text = tr("返回")
		title_label.text = tr("选择扮演君主")
		period_step_label.text = tr("2 / 2")
	else:
		header_back_button.text = tr("返回")
		period_step_label.text = tr("1 / 2")
		ruler_choices.columns = 3
	call_deferred("_layout_period_arts")


func _style_period_caption_fonts(choice: Button, title_size: int, body_size: int) -> void:
	var caption := choice.get_node_or_null("Caption") as VBoxContainer
	if caption == null:
		return
	var title := caption.get_node_or_null("Title") as Label
	if title != null:
		EntryChrome.apply_scenario_card_title(title, title_size)
	var year := caption.get_node_or_null("Year") as Label
	if year != null:
		EntryChrome.apply_scenario_card_year(year, body_size)
	var body := caption.get_node_or_null("Body") as Label
	if body != null:
		EntryChrome.apply_scenario_card_body(body, body_size, false)
	var meta := caption.get_node_or_null("Meta") as Label
	if meta != null:
		EntryChrome.apply_scenario_card_body(meta, body_size, true)


func _layout_period_arts() -> void:
	## Cover-fit art pinned to the top so faces survive short card aspect ratios.
	## Web uses background-size:cover + center; Godot cards were much shorter, so
	## center crop removed heads — top-align recovers the same focal area.
	for choice: Button in period_choices.get_children():
		var art := choice.get_node_or_null("Art") as TextureRect
		if art == null or art.texture == null:
			continue
		var box := choice.size
		if box.x <= 1.0 or box.y <= 1.0:
			continue
		var tex_size := art.texture.get_size()
		if tex_size.x <= 1.0 or tex_size.y <= 1.0:
			continue
		var cover := maxf(box.x / tex_size.x, box.y / tex_size.y)
		var scaled := tex_size * cover
		art.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
		art.size = scaled
		art.position = Vector2((box.x - scaled.x) * 0.5, 0.0)


func _apply_preview_density(has_selection: bool) -> void:
	# Hint / selection chip — never a tall panel competing with the CTA.
	ruler_preview.custom_minimum_size.y = 36.0 if has_selection else 28.0
	ruler_preview_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	ruler_preview_text.max_lines_visible = 1


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
	ruler_preview_text.text = tr("点选君主查看城池与将领")
	_apply_preview_density(false)
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
		ruler_preview_text.text = tr("点选君主查看城池与将领")
		_apply_preview_density(false)
	else:
		var candidate: Dictionary = candidates[index]
		_selected_ruler_source = int(candidate.get("sourceIndex", -1))
		ruler_preview_text.text = tr("%s · %d 城 · %d 将") % [
			str(candidate.get("name", "")), int(candidate.get("cityCount", 0)), int(candidate.get("officerCount", 0))
		]
		_apply_preview_density(true)
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
