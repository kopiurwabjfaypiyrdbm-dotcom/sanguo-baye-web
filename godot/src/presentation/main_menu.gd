extends Control

const CONTEXT = preload("res://src/application/campaign_launch_context.gd")
const SESSION_CONTEXT = preload("res://src/application/campaign_session_context.gd")
const TACTICAL_CONTEXT = preload("res://src/application/tactical_launch_context.gd")
const SafeArea = preload("res://src/presentation/safe_area_margin.gd")
const TouchMetrics = preload("res://src/presentation/touch_metrics.gd")
const PauseRepository = preload("res://src/application/persistence/tactical_pause_repository.gd")
const EntryChrome = preload("res://src/presentation/entry_chrome.gd")

@onready var continue_button: Button = %ContinueButton
@onready var new_campaign_button: Button = %NewCampaignButton
@onready var quit_button: Button = %QuitButton
@onready var status_label: Label = %StatusLabel
@onready var title_label: Label = %TitleLabel
@onready var subtitle_label: Label = %SubtitleLabel
@onready var action_row: HBoxContainer = %ActionRow
@onready var wordmark: TextureRect = %Wordmark
@onready var background_video: VideoStreamPlayer = %BackgroundVideo


func _ready() -> void:
	SESSION_CONTEXT.clear()
	new_campaign_button.pressed.connect(_open_campaign_setup)
	continue_button.pressed.connect(_continue_campaign)
	quit_button.pressed.connect(_quit_requested)
	get_viewport().size_changed.connect(_on_viewport_size_changed)
	EntryChrome.apply_plaque_button(new_campaign_button, true)
	EntryChrome.apply_plaque_button(continue_button, false)
	EntryChrome.apply_plaque_button(quit_button, false)
	if background_video.stream != null:
		background_video.volume_db = -80.0
		background_video.play()
	# MB20 can recover after a crash where only the transactional .tmp/.bak
	# candidate remains. Do not hide that recovery path behind a primary-file-only
	# existence check; GameSession.load_game() performs the authoritative validation.
	var save_candidates := [
		"user://godot-spike-save.json",
		"user://godot-spike-save.json.tmp",
		"user://godot-spike-save.json.bak",
	]
	var has_save := false
	for candidate: String in save_candidates:
		if FileAccess.file_exists(ProjectSettings.globalize_path(candidate)):
			has_save = true
			break
	var has_tactical_recovery := PauseRepository.has_candidate()
	var tactical_recovery_error := ""
	if has_tactical_recovery:
		var tactical_check: Dictionary = PauseRepository.new().load()
		if not bool(tactical_check.get("ok", false)):
			has_tactical_recovery = false
			tactical_recovery_error = String(tactical_check.get("error", "战术恢复文件校验失败"))
	var has_resume := has_save or has_tactical_recovery
	continue_button.disabled = not has_resume
	EntryChrome.sync_plaque_disabled(continue_button, false)
	new_campaign_button.text = tr("新君登基")
	if has_tactical_recovery:
		continue_button.text = tr("恢复未完成战术")
	elif has_save:
		continue_button.text = tr("重返沙场")
	else:
		continue_button.text = tr("重返沙场")
	(new_campaign_button if not has_resume else continue_button).grab_focus()
	title_label.text = tr("三国霸业")
	subtitle_label.text = ""
	# Web title CTAs keep the helper copy inside the button small (hidden on desktop).
	# Keep a light status line only when recovery needs explanation.
	status_label.visible = has_tactical_recovery or not tactical_recovery_error.is_empty()
	status_label.text = tr("选择时期与君主，开始新的霸业") if not has_resume else tr("继续最近的自动存档，或开启新战役")
	if has_tactical_recovery:
		status_label.text = tr("检测到未完成战术；可恢复沙场或开启新战役")
		status_label.visible = true
	if not tactical_recovery_error.is_empty():
		status_label.text = tr("战术恢复文件无效：%s") % tactical_recovery_error
		status_label.visible = true
	var tween := create_tween().set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	wordmark.modulate.a = 0.0
	tween.tween_property(wordmark, "modulate:a", 1.0, 0.55)
	_apply_responsive_layout()
	call_deferred("_apply_responsive_layout")


func _on_viewport_size_changed() -> void:
	_apply_responsive_layout()


func _apply_responsive_layout() -> void:
	var physical_size := DisplayServer.window_get_size()
	if physical_size.x <= 1 or physical_size.y <= 1:
		physical_size = Vector2i(get_viewport_rect().size.round())
	_apply_responsive_layout_for_size(physical_size)


func _apply_responsive_layout_for_size(physical_size: Vector2i) -> void:
	var viewport_size := get_viewport_rect().size
	var safe_rect := SafeArea.compute_safe_rect(viewport_size)
	var center: Control = $Center
	center.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	center.position = safe_rect.position
	center.size = safe_rect.size
	var canvas_scale := minf(float(physical_size.x) / 1280.0, float(physical_size.y) / 720.0)
	var compact := physical_size.x <= 900 or physical_size.y <= 440
	var card: PanelContainer = $Center/Card
	var mobile_touch := TouchMetrics.uses_density_scaled_targets()
	var touch_mode := compact or mobile_touch
	var ultra_compact := mobile_touch and (physical_size.x <= 900 or physical_size.y <= 440)
	action_row.alignment = BoxContainer.ALIGNMENT_CENTER
	_layout_wordmark(safe_rect, canvas_scale, ultra_compact)
	if touch_mode:
		card.custom_minimum_size = Vector2(ceilf(maxf(320.0, safe_rect.size.x - 32.0)), 0.0)
		var touch_size := TouchMetrics.target_size(canvas_scale)
		var plaque_font := ceili(17.0 / maxf(canvas_scale, 0.01))
		EntryChrome.set_plaque_minimum_size(
			new_campaign_button, Vector2(ceili(184.0 / maxf(canvas_scale, 0.85)), touch_size)
		)
		EntryChrome.set_plaque_minimum_size(
			continue_button, Vector2(ceili(184.0 / maxf(canvas_scale, 0.85)), touch_size)
		)
		EntryChrome.set_plaque_minimum_size(
			quit_button, Vector2(ceili(120.0 / maxf(canvas_scale, 0.85)), touch_size)
		)
		new_campaign_button.add_theme_font_size_override("font_size", plaque_font)
		continue_button.add_theme_font_size_override("font_size", plaque_font)
		quit_button.add_theme_font_size_override("font_size", plaque_font)
		title_label.add_theme_font_size_override("font_size", ceili(36.0 / maxf(canvas_scale, 0.01)))
		subtitle_label.add_theme_font_size_override("font_size", ceili(15.0 / maxf(canvas_scale, 0.01)))
		status_label.add_theme_font_size_override("font_size", ceili(15.0 / maxf(canvas_scale, 0.01)))
	else:
		card.custom_minimum_size = Vector2(560.0, 0.0)
		EntryChrome.set_plaque_minimum_size(new_campaign_button, Vector2(184.0, 58.0))
		EntryChrome.set_plaque_minimum_size(continue_button, Vector2(184.0, 58.0))
		EntryChrome.set_plaque_minimum_size(quit_button, Vector2(120.0, 58.0))
		new_campaign_button.add_theme_font_size_override("font_size", 19)
		continue_button.add_theme_font_size_override("font_size", 19)
		quit_button.add_theme_font_size_override("font_size", 19)
		title_label.add_theme_font_size_override("font_size", 48)
		subtitle_label.add_theme_font_size_override("font_size", 18)
		status_label.add_theme_font_size_override("font_size", 15)
	if ultra_compact:
		# Three vertical 48dp targets cannot fit an 844x390 landscape viewport.
		# Keep all commands reachable in one horizontal row instead of shrinking
		# below the platform touch target.
		status_label.custom_minimum_size.y = 28.0
		status_label.visible = false
		title_label.add_theme_font_size_override("font_size", ceili(28.0 / maxf(canvas_scale, 0.01)))
	else:
		status_label.custom_minimum_size.y = 56.0
	_layout_action_card(safe_rect, ultra_compact)


func _layout_wordmark(safe_rect: Rect2, canvas_scale: float, ultra_compact: bool) -> void:
	var width := minf(safe_rect.size.x * 0.62, 700.0)
	if ultra_compact:
		width = minf(safe_rect.size.x * 0.72, 520.0)
	var height := width * 0.32
	wordmark.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	wordmark.size = Vector2(width, height)
	wordmark.position = Vector2(
		safe_rect.position.x + (safe_rect.size.x - width) * 0.5,
		safe_rect.position.y + maxf(12.0, safe_rect.size.y * (0.08 if not ultra_compact else 0.02)) * maxf(canvas_scale, 0.75)
	)


func _layout_action_card(_safe_rect: Rect2, ultra_compact: bool) -> void:
	# Match Web `.title-actions`: centered near the bottom of the title screen.
	var card: PanelContainer = $Center/Card
	card.reset_size()
	var card_size := card.get_combined_minimum_size()
	if card_size.x <= 1.0:
		card_size.x = card.custom_minimum_size.x
	if card_size.y <= 1.0:
		card_size.y = 120.0
	var bottom_margin := 16.0 if ultra_compact else maxf(24.0, $Center.size.y * 0.07)
	card.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	card.size = card_size
	card.position = Vector2(
		($Center.size.x - card_size.x) * 0.5,
		maxf(0.0, $Center.size.y - card_size.y - bottom_margin)
	)


func _open_campaign_setup() -> void:
	SESSION_CONTEXT.clear()
	TACTICAL_CONTEXT.clear()
	var error := get_tree().change_scene_to_file("res://scenes/presentation/campaign_setup.tscn")
	if error != OK:
		status_label.visible = true
		status_label.text = tr("无法打开战役设置：错误 %d") % error


func _continue_campaign() -> void:
	SESSION_CONTEXT.clear()
	if PauseRepository.has_candidate():
		var tactical_check: Dictionary = PauseRepository.new().load()
		if bool(tactical_check.get("ok", false)):
			var tactical_error := get_tree().change_scene_to_file("res://scenes/presentation/tactical_battle_screen.tscn")
			if tactical_error != OK:
				status_label.visible = true
				status_label.text = tr("无法恢复战术演练：错误 %d") % tactical_error
			return
		var has_strategic_candidate := false
		for candidate: String in ["user://godot-spike-save.json", "user://godot-spike-save.json.tmp", "user://godot-spike-save.json.bak"]:
			if FileAccess.file_exists(ProjectSettings.globalize_path(candidate)):
				has_strategic_candidate = true
				break
		if not has_strategic_candidate:
			status_label.visible = true
			status_label.text = tr("战术恢复文件无效：%s") % str(tactical_check.get("error", "校验失败"))
			return
	TACTICAL_CONTEXT.clear()
	CONTEXT.request_load()
	var error := get_tree().change_scene_to_file("res://scenes/presentation/strategy_screen.tscn")
	if error != OK:
		CONTEXT.clear()
		status_label.visible = true
		status_label.text = tr("无法继续战役：错误 %d") % error


func _quit_requested() -> void:
	get_tree().quit()


func _handle_system_back() -> bool:
	return false


func _on_application_paused() -> void:
	status_label.visible = true
	status_label.text = tr("应用已暂停；战役状态保留在当前会话")


func _on_application_resumed() -> void:
	status_label.visible = true
	status_label.text = tr("应用已恢复；可以继续战役")
