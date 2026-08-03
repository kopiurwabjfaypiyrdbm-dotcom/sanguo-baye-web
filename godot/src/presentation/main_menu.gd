extends Control

const CONTEXT = preload("res://src/application/campaign_launch_context.gd")
const SESSION_CONTEXT = preload("res://src/application/campaign_session_context.gd")
const TACTICAL_CONTEXT = preload("res://src/application/tactical_launch_context.gd")
const SafeArea = preload("res://src/presentation/safe_area_margin.gd")
const PauseRepository = preload("res://src/application/persistence/tactical_pause_repository.gd")

@onready var continue_button: Button = %ContinueButton
@onready var new_campaign_button: Button = %NewCampaignButton
@onready var quit_button: Button = %QuitButton
@onready var status_label: Label = %StatusLabel
@onready var title_label: Label = %TitleLabel
@onready var subtitle_label: Label = %SubtitleLabel


func _ready() -> void:
	SESSION_CONTEXT.clear()
	new_campaign_button.pressed.connect(_open_campaign_setup)
	continue_button.pressed.connect(_continue_campaign)
	quit_button.pressed.connect(_quit_requested)
	get_viewport().size_changed.connect(_on_viewport_size_changed)
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
	continue_button.text = tr("恢复战术演练") if has_tactical_recovery else (tr("继续上次战役") if has_save else tr("暂无可继续的战役"))
	(new_campaign_button if not has_resume else continue_button).grab_focus()
	title_label.text = tr("三国霸业")
	subtitle_label.text = tr("原生战略迁移样片 · Godot 4.7.1")
	status_label.text = tr("选择战役时期与君主，进入 38 城战略地图")
	if not tactical_recovery_error.is_empty():
		status_label.text = tr("战术恢复文件无效：%s") % tactical_recovery_error
	var tween := create_tween().set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	title_label.modulate.a = 0.0
	tween.tween_property(title_label, "modulate:a", 1.0, 0.45)
	_apply_responsive_layout()


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
	if compact:
		card.custom_minimum_size = Vector2(ceilf(maxf(320.0, safe_rect.size.x - 32.0)), 0.0)
		var touch_size := ceilf(48.0 / maxf(canvas_scale, 0.01))
		for button: Button in [new_campaign_button, continue_button, quit_button]:
			button.custom_minimum_size.y = touch_size
			button.add_theme_font_size_override("font_size", ceili(17.0 / maxf(canvas_scale, 0.01)))
		title_label.add_theme_font_size_override("font_size", ceili(36.0 / maxf(canvas_scale, 0.01)))
		subtitle_label.add_theme_font_size_override("font_size", ceili(15.0 / maxf(canvas_scale, 0.01)))
		status_label.add_theme_font_size_override("font_size", ceili(15.0 / maxf(canvas_scale, 0.01)))
	else:
		card.custom_minimum_size = Vector2(520.0, 0.0)
		for button: Button in [new_campaign_button, continue_button]:
			button.custom_minimum_size.y = 58.0
			button.add_theme_font_size_override("font_size", 18)
		quit_button.custom_minimum_size.y = 52.0
		quit_button.add_theme_font_size_override("font_size", 18)
		title_label.add_theme_font_size_override("font_size", 48)
		subtitle_label.add_theme_font_size_override("font_size", 18)
		status_label.add_theme_font_size_override("font_size", 18)


func _open_campaign_setup() -> void:
	SESSION_CONTEXT.clear()
	TACTICAL_CONTEXT.clear()
	var error := get_tree().change_scene_to_file("res://scenes/presentation/campaign_setup.tscn")
	if error != OK:
		status_label.text = tr("无法打开战役设置：错误 %d") % error


func _continue_campaign() -> void:
	SESSION_CONTEXT.clear()
	if PauseRepository.has_candidate():
		var tactical_check: Dictionary = PauseRepository.new().load()
		if bool(tactical_check.get("ok", false)):
			var tactical_error := get_tree().change_scene_to_file("res://scenes/presentation/tactical_battle_screen.tscn")
			if tactical_error != OK:
				status_label.text = tr("无法恢复战术演练：错误 %d") % tactical_error
			return
		var has_strategic_candidate := false
		for candidate: String in ["user://godot-spike-save.json", "user://godot-spike-save.json.tmp", "user://godot-spike-save.json.bak"]:
			if FileAccess.file_exists(ProjectSettings.globalize_path(candidate)):
				has_strategic_candidate = true
				break
		if not has_strategic_candidate:
			status_label.text = tr("战术恢复文件无效：%s") % str(tactical_check.get("error", "校验失败"))
			return
	TACTICAL_CONTEXT.clear()
	CONTEXT.request_load()
	var error := get_tree().change_scene_to_file("res://scenes/presentation/strategy_screen.tscn")
	if error != OK:
		CONTEXT.clear()
		status_label.text = tr("无法继续战役：错误 %d") % error


func _quit_requested() -> void:
	get_tree().quit()


func _handle_system_back() -> bool:
	return false


func _on_application_paused() -> void:
	status_label.text = tr("应用已暂停；战役状态保留在当前会话")


func _on_application_resumed() -> void:
	status_label.text = tr("应用已恢复；可以继续战役")
