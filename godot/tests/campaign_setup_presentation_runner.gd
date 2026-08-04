extends SceneTree

const MainMenu = preload("res://scenes/presentation/main_menu.tscn")
const CampaignSetup = preload("res://scenes/presentation/campaign_setup.tscn")
const StrategyScreen = preload("res://scenes/presentation/strategy_screen.tscn")
const Context = preload("res://src/application/campaign_launch_context.gd")
const SessionContext = preload("res://src/application/campaign_session_context.gd")
const TouchMetrics = preload("res://src/presentation/touch_metrics.gd")

var _assertions := 0
var _failures := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	TouchMetrics.set_density_override_for_testing(2.25)
	var menu := MainMenu.instantiate()
	root.add_child(menu)
	await process_frame
	menu.call("_apply_responsive_layout_for_size", Vector2i(844, 390))
	var menu_scale := minf(844.0 / 1280.0, 390.0 / 720.0)
	for control_name: String in ["NewCampaignButton", "ContinueButton", "QuitButton"]:
		var menu_control: Control = menu.get_node("%%%s" % control_name)
		_assert_true(menu_control.custom_minimum_size.y * menu_scale >= 108.0, "high-density menu %s must retain a 48dp physical target" % control_name)
	_assert_true(menu.get_node("%NewCampaignButton").disabled == false, "main menu must expose new campaign entry")
	_assert_true(menu.get_node("%ContinueButton").disabled, "cold launch must not invent a continuation save")
	menu.call("_apply_responsive_layout_for_size", Vector2i(1280, 720))
	_assert_equal(menu.get_node("%StatusLabel").custom_minimum_size.y, 56.0, "main menu status height must restore after leaving ultra-compact mode")
	menu.queue_free()
	await process_frame

	var setup := CampaignSetup.instantiate()
	root.add_child(setup)
	await process_frame
	await process_frame
	var period_option: OptionButton = setup.get_node("%PeriodOption")
	var ruler_option: OptionButton = setup.get_node("%RulerOption")
	var start_button: Button = setup.get_node("%StartButton")
	setup.call("_apply_responsive_layout_for_size", Vector2i(844, 390))
	var compact_scale := minf(844.0 / 1280.0, 390.0 / 720.0)
	for control_name: String in ["PeriodOption", "RulerOption", "BackButton", "StartButton"]:
		var control: Control = setup.get_node("%%%s" % control_name)
		_assert_true(control.custom_minimum_size.y * compact_scale >= 108.0, "high-density setup %s must retain a 48dp physical target" % control_name)
	_assert_true(not setup.get_node("%DescriptionLabel").visible, "high-density 844x390 setup must collapse redundant description copy")
	_assert_true(not setup.get_node("%FactsLabel").visible, "high-density 844x390 setup must collapse redundant facts copy")
	var setup_center: ScrollContainer = setup.get_node("Center")
	var setup_card: Control = setup.get_node("Center/Card")
	_assert_true(setup_card.position.x >= -0.5 and setup_card.position.x + setup_card.size.x <= setup_center.size.x + 0.5, "high-density setup card must stay within horizontal safe bounds")
	_assert_true(setup_center.get_v_scroll_bar().max_value > 0.0, "high-density setup card must use vertical scrolling instead of clipping")
	var compact_period_choices: GridContainer = setup.get_node("%PeriodChoices")
	var compact_back_to_periods: Button = setup.get_node("%BackToPeriodsButton")
	_assert_true(compact_period_choices.get_child(0).custom_minimum_size.y * compact_scale >= 108.0, "high-density period cards must retain a 48dp-class touch target")
	_assert_true(compact_back_to_periods.custom_minimum_size.x * compact_scale >= 108.0 and compact_back_to_periods.custom_minimum_size.y * compact_scale >= 108.0, "high-density return-to-periods control must retain a 48dp two-dimensional touch target")
	TouchMetrics.clear_density_override_for_testing()
	setup.call("_apply_responsive_layout_for_size", Vector2i(1280, 720))
	_assert_equal(setup.get_node("Center/Card/Margin/Stack/PeriodRow").custom_minimum_size.y, 0.0, "setup row minimum height must restore after leaving high-density compact mode")
	_assert_equal(setup.get_node("Center/Card/Margin/Stack/RulerRow").custom_minimum_size.y, 0.0, "ruler row minimum height must restore after leaving high-density compact mode")
	_assert_equal(setup.get_node("Center/Card/Margin/Stack/PeriodRow/PeriodLabel").custom_minimum_size.x, 150.0, "period label width must restore after leaving high-density compact mode")
	_assert_equal(setup.get_node("Center/Card/Margin/Stack/RulerRow/RulerLabel").custom_minimum_size.x, 150.0, "ruler label width must restore after leaving high-density compact mode")
	_assert_true(not setup.get_node("Center/Card/Margin/Stack/TitleLabel").has_theme_font_size_override("font_size"), "setup title font override must clear after leaving high-density compact mode")
	_assert_equal(period_option.item_count, 4, "setup must expose all bundled production periods")
	var period_choices: GridContainer = setup.get_node("%PeriodChoices")
	var ruler_section: Control = setup.get_node("%RulerSection")
	var ruler_choices: VBoxContainer = setup.get_node("%RulerChoices")
	_assert_equal(period_choices.get_child_count(), 4, "setup must expose four in-page period choice cards")
	_assert_true(int(setup.get("_selected_ruler_source")) < 0 and start_button.disabled, "setup must not silently select a ruler")
	for index: int in range(period_option.item_count):
		period_option.select(index)
		period_option.emit_signal("item_selected", index)
		_assert_true(ruler_option.item_count > 0, "period %d must expose at least one valid ruler" % (index + 1))
		_assert_true(int(setup.get("_selected_ruler_source")) < 0, "period changes must keep ruler selection explicit")
	period_choices.get_child(3).emit_signal("pressed")
	_assert_true(ruler_section.visible, "clicking an in-page period card must advance to ruler selection")
	_assert_true(ruler_choices.get_child_count() > 0, "ruler selection must render real in-page choice buttons")
	TouchMetrics.set_density_override_for_testing(2.25)
	setup.call("_apply_responsive_layout_for_size", Vector2i(844, 390))
	var compact_ruler_scroll: ScrollContainer = setup.get_node("%RulerChoicesScroll")
	var compact_ruler_card: Button = ruler_choices.get_child(0)
	var compact_return_button: Button = setup.get_node("%BackToPeriodsButton")
	_assert_true(compact_ruler_card.custom_minimum_size.y * compact_scale >= 108.0, "high-density ruler cards must retain a 48dp-class touch target")
	_assert_true(compact_ruler_scroll.custom_minimum_size.y * compact_scale >= 108.0, "high-density ruler list must retain a scrollable touch surface")
	_assert_true(compact_return_button.custom_minimum_size.x * compact_scale >= 108.0 and compact_return_button.custom_minimum_size.y * compact_scale >= 108.0, "high-density ruler return control must retain a 48dp two-dimensional touch target")
	TouchMetrics.clear_density_override_for_testing()
	setup.call("_apply_responsive_layout_for_size", Vector2i(1280, 720))
	_assert_true(bool(setup.call("_handle_system_back")), "Android back must be consumed by campaign setup")
	_assert_true(not ruler_section.visible, "Android back from ruler step must return to period selection")
	start_button.emit_signal("pressed")
	_assert_true(ruler_section.visible and start_button.disabled, "re-entering ruler step after Android back must require a fresh ruler selection")
	ruler_choices.get_child(0).emit_signal("pressed")
	_assert_true(not start_button.disabled, "valid period and ruler selection must enable entry")
	setup.get_node("%BackToPeriodsButton").emit_signal("pressed")
	_assert_true(not ruler_section.visible, "returning from ruler step must show period cards")
	_assert_true(int(setup.get("_selected_ruler_source")) < 0, "returning to periods must clear old ruler selection")
	start_button.emit_signal("pressed")
	_assert_true(ruler_section.visible and start_button.disabled, "returning to ruler step must require a fresh ruler selection")
	ruler_choices.get_child(0).emit_signal("pressed")
	start_button.emit_signal("pressed")
	var intent := Context.take()
	_assert_true(intent.get("mode", "") == "campaign", "setup must publish an application launch intent")
	_assert_equal(int(intent.get("periodId", -1)), 4, "setup intent must preserve the selected period")
	_assert_equal(int(intent.get("rulerSourceIndex", -1)), 0, "setup intent must preserve the selected ruler")
	_assert_equal(str(intent.get("rulesetId", "")), "baye-classic-v1", "setup intent must default to classic ruleset")
	_assert_equal(str((intent.get("lifecyclePolicy", {}) as Dictionary).get("battleDeath", "")), "disabled", "setup intent must default to safe battleDeath")
	# Restore the same intent because the assertion above consumes it.
	Context.request_campaign(4, 0)
	await process_frame
	await process_frame
	var screen: Node = current_scene
	_assert_true(screen != null and screen.has_method("_refresh_snapshot"), "setup must transition to the strategic scene")
	if screen == null or not screen.has_method("_refresh_snapshot"):
		quit(1)
		return
	var campaign: Dictionary = screen.get("_session").campaign_descriptor()
	_assert_equal(int(campaign.get("periodId", -1)), 4, "selected period must reach the production GameSession")
	_assert_equal(int(campaign.get("rulerSourceIndex", -1)), 0, "selected ruler must reach the production GameSession")
	_assert_equal(screen.get_node("%MapWorld").get_ordered_city_ids().size(), 38, "strategic entry must render all cities")
	_assert_equal(screen.get_node("%MapWorld").get_road_count(), 54, "strategic entry must render all reciprocal roads")
	var before_digest := String(screen.get("_session").state_sha256())
	_assert_true(not screen.get_node("%SaveButton").disabled and not screen.get_node("%LoadButton").disabled, "production campaign must enable save and load controls")
	screen.get_node("%SaveButton").emit_signal("pressed")
	await process_frame
	var after_save_digest := String(screen.get("_session").state_sha256())
	_assert_equal(after_save_digest, before_digest, "saving must preserve the authoritative state digest")
	screen.get_node("%EndTurnButton").emit_signal("pressed")
	await process_frame
	_assert_true(String(screen.get("_session").state_sha256()) != before_digest, "end-turn must advance the deterministic campaign")
	screen.get_node("%LoadButton").emit_signal("pressed")
	await process_frame
	_assert_equal(String(screen.get("_session").state_sha256()), before_digest, "load must restore the selected campaign state")
	_assert_true(screen.get_node("%StatusLine").text != "", "strategic screen must provide command feedback")
	screen.call("_apply_responsive_layout_for_size", Vector2i(1280, 720))
	await process_frame
	var top_bar: Control = screen.get_node("UILayer/HUDRoot/SafeArea/HUDStack/TopPanel/TopMargin/TopBar")
	var top_bar_width := top_bar.size.x
	_assert_true(top_bar_width > 0.0, "strategic top bar must have a measurable 1280px layout width")
	for top_bar_child: Control in top_bar.get_children():
		_assert_true(top_bar_child.position.x + top_bar_child.size.x <= top_bar_width + 0.5, "1280px top-bar child %s must remain reachable" % top_bar_child.name)
	var menu_button_rect: Control = screen.get_node("%MenuButton")
	_assert_true(menu_button_rect.position.x + menu_button_rect.size.x <= top_bar_width + 0.5, "1280px main-menu button must remain reachable")
	screen.call("_apply_responsive_layout_for_size", Vector2i(844, 390))
	var dialog_scale := minf(844.0 / 1280.0, 390.0 / 720.0)
	var dialog: ConfirmationDialog = screen.get("_return_confirmation")
	for dialog_button: Button in [dialog.get_ok_button(), dialog.get_cancel_button()]:
		_assert_true(dialog_button.custom_minimum_size.y * dialog_scale >= 47.5, "compact return confirmation must retain a 48px-class physical target")
	TouchMetrics.set_density_override_for_testing(2.25)
	screen.call("_apply_responsive_layout_for_size", Vector2i(2560, 1440))
	await process_frame
	var high_density_dialog: ConfirmationDialog = screen.get("_return_confirmation")
	var high_density_scale := minf(2560.0 / 1280.0, 1440.0 / 720.0)
	for dialog_button: Button in [high_density_dialog.get_ok_button(), high_density_dialog.get_cancel_button()]:
		_assert_true(dialog_button.custom_minimum_size.y * high_density_scale >= 108.0, "high-density strategic return confirmation must retain a 48dp target")
	TouchMetrics.clear_density_override_for_testing()
	screen.call("_apply_responsive_layout_for_size", Vector2i(1280, 720))
	# Exercise the MB20 crash-window entry path: leave only .tmp, return to the
	# native menu, and ensure Continue remains available for repository recovery.
	var primary_path := ProjectSettings.globalize_path("user://godot-spike-save.json")
	var temporary_path := ProjectSettings.globalize_path("user://godot-spike-save.json.tmp")
	_assert_equal(DirAccess.rename_absolute(primary_path, temporary_path), OK, "test must create a tmp-only recovery candidate")
	screen.get_node("%MenuButton").emit_signal("pressed")
	var return_confirmation: ConfirmationDialog = screen.get("_return_confirmation")
	_assert_true(return_confirmation.visible, "return to menu must ask before discarding progress")
	return_confirmation.emit_signal("confirmed")
	await process_frame
	await process_frame
	var recovered_menu: Node = current_scene
	_assert_true(recovered_menu != null and recovered_menu.has_node("%ContinueButton"), "return must reach the native main menu")
	if recovered_menu != null and recovered_menu.has_node("%ContinueButton"):
		var continue_button: Button = recovered_menu.get_node("%ContinueButton")
		_assert_true(not continue_button.disabled, "tmp-only recovery candidate must keep Continue enabled")
		continue_button.emit_signal("pressed")
		await process_frame
		await process_frame
		var resumed: Node = current_scene
		_assert_true(resumed != null and resumed.has_method("_refresh_snapshot"), "Continue must reopen the strategic scene")
		if resumed != null and resumed.has_method("_refresh_snapshot"):
			_assert_equal(String(resumed.get("_session").state_sha256()), before_digest, "tmp-only Continue must restore the saved state")
			var resumed_campaign: Dictionary = resumed.get("_session").campaign_descriptor()
			_assert_equal(int(resumed_campaign.get("periodId", -1)), 4, "tmp-only Continue must preserve the selected period")
			resumed.get_node("%TacticalDemoButton").emit_signal("pressed")
			await process_frame
			await process_frame
			var tactical: Node = current_scene
			_assert_true(tactical != null and tactical.has_method("_return_to_strategy"), "tactical entry must keep a return path")
			if tactical != null and tactical.has_method("_return_to_strategy"):
				tactical.call("_return_to_strategy")
				await process_frame
				await process_frame
				var returned: Node = current_scene
				_assert_true(returned != null and returned.has_method("_refresh_snapshot"), "tactical return must reopen the strategic scene")
				if returned != null and returned.has_method("_refresh_snapshot"):
					_assert_equal(String(returned.get("_session").state_sha256()), before_digest, "tactical return must preserve strategic session digest")
					_assert_equal(int(returned.get("_session").campaign_descriptor().get("periodId", -1)), 4, "tactical return must preserve campaign identity")
				_assert_true(SessionContext.take() == null, "tactical return must consume the session hand-off")

	if _failures > 0:
		push_error("[Godot campaign setup presentation] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions])
		quit(1)
		return
	print("[Godot campaign setup presentation] PASSED: %d assertion(s)" % _assertions)
	quit(0)


func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value:
		_failures += 1
		push_error("[Godot campaign setup presentation] %s" % message)


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assert_true(actual == expected, "%s (expected %s, got %s)" % [message, expected, actual])
