extends SceneTree

const TacticalScene = preload("res://scenes/presentation/tactical_battle_screen.tscn")
const Session = preload("res://src/application/tactical_battle/tactical_battle_session.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const GameSession = preload("res://src/application/game_session/game_session.gd")
const TACTICAL_CONTEXT = preload("res://src/application/tactical_launch_context.gd")
const SESSION_CONTEXT = preload("res://src/application/campaign_session_context.gd")
const PauseRepository = preload("res://src/application/persistence/tactical_pause_repository.gd")
var _failures := 0
var _assertions := 0

func _init() -> void: call_deferred("_run")

func _run() -> void:
	for viewport_size: Vector2i in [Vector2i(1280, 720), Vector2i(844, 390)]:
		root.size = viewport_size
		for stale_candidate: String in ["user://godot-tactical-pause.json", "user://godot-tactical-pause.json.tmp", "user://godot-tactical-pause.json.bak"]:
			if FileAccess.file_exists(stale_candidate): DirAccess.remove_absolute(ProjectSettings.globalize_path(stale_candidate))
		var screen := TacticalScene.instantiate()
		root.add_child(screen)
		await process_frame
		await process_frame
		screen.call("_apply_responsive_layout_for_size", viewport_size)
		_assert_true(screen.get("_session") != null, "tactical presentation must restore its demo session at %s" % viewport_size)
		var snapshot: Dictionary = screen.get("_snapshot")
		_assert_true(String(screen.get("_round_label").text).contains("第 1/30 天"), "tactical HUD must show day progress at %s" % viewport_size)
		_assert_true(String(screen.get("_phase_label").text).contains("攻方回合"), "tactical HUD must show active side at %s" % viewport_size)
		_assert_equal(String(screen.get("_unit_count_label").text), "存活 2/2", "tactical HUD must show alive unit count at %s" % viewport_size)
		var responsive_scale := minf(float(viewport_size.x) / 1280.0, float(viewport_size.y) / 720.0)
		for hud_button: Button in [screen.get("_settings_button"), screen.get("_back_button"), screen.get("_turn_button")]:
			_assert_true(hud_button.custom_minimum_size.y * responsive_scale >= 47.5, "tactical HUD controls must retain 48px physical targets at %s" % viewport_size)
		var return_dialog: ConfirmationDialog = screen.get("_return_confirmation")
		for dialog_button: Button in [return_dialog.get_ok_button(), return_dialog.get_cancel_button()]:
			_assert_true(dialog_button.custom_minimum_size.y * responsive_scale >= 47.5, "tactical return confirmation must retain 48px physical targets at %s" % viewport_size)
		screen._open_settings()
		_assert_true(screen.get("_settings_panel").visible, "settings panel must open from tactical HUD at %s" % viewport_size)
		screen._on_text_scale_selected(1)
		screen._on_high_contrast_toggled(true)
		screen._on_reduced_motion_toggled(true)
		screen._on_hints_toggled(false)
		_assert_equal(screen.get("_text_scale"), 1.2, "settings must apply large text at %s" % viewport_size)
		_assert_true(bool(screen.get("_high_contrast")) and bool(screen.get("_reduced_motion")), "settings must apply contrast and reduced motion at %s" % viewport_size)
		_assert_true(not screen.get("_hint_label").visible, "settings must hide operation hints when disabled at %s" % viewport_size)
		screen._on_hints_toggled(true)
		screen._close_settings()
		_assert_true(not screen.get("_settings_panel").visible, "settings panel must close at %s" % viewport_size)
		_assert_equal(snapshot.get("width"), 12, "native battlefield must expose 12 columns at %s" % viewport_size)
		_assert_equal(snapshot.get("height"), 8, "native battlefield must expose 8 rows at %s" % viewport_size)
		_assert_equal(snapshot.get("units", {}).size(), 2, "native battlefield must render both factions at %s" % viewport_size)
		var world: Vector2 = Vector2(8.5, 4.5) * screen.CELL_SIZE
		var screen_position: Vector2 = screen.get_viewport().get_canvas_transform() * world
		screen._select_at_screen(screen_position)
		_assert_equal(screen.get("_selected_unit_id"), "officer:demo-attacker", "tap must select the attacker unit at %s" % viewport_size)
		var canceled_press := InputEventScreenTouch.new(); canceled_press.index = 0; canceled_press.pressed = true; canceled_press.position = screen_position; screen._unhandled_input(canceled_press)
		var canceled_release := InputEventScreenTouch.new(); canceled_release.index = 0; canceled_release.pressed = false; canceled_release.canceled = true; canceled_release.position = screen_position; screen._unhandled_input(canceled_release)
		_assert_equal(screen.get("_selected_unit_id"), "officer:demo-attacker", "canceled touch must not change selection at %s" % viewport_size)
		var zoom_before: float = screen.get("battle_camera").zoom.x if screen.get("battle_camera") else 1.0
		screen._set_zoom(zoom_before * 1.2, screen.get_viewport_rect().size * 0.5)
		_assert_true(screen.get("battle_camera").zoom.x > zoom_before, "zoom gesture must change bounded camera zoom at %s" % viewport_size)
		var position_before: Vector2 = screen.get("battle_camera").position
		var press := InputEventMouseButton.new(); press.button_index = MOUSE_BUTTON_LEFT; press.pressed = true; press.position = Vector2(100, 150); screen._unhandled_input(press)
		var drag := InputEventMouseMotion.new(); drag.position = Vector2(140, 180); screen._unhandled_input(drag)
		var release := InputEventMouseButton.new(); release.button_index = MOUSE_BUTTON_LEFT; release.pressed = false; release.position = Vector2(140, 180); screen._unhandled_input(release)
		_assert_true(screen.get("battle_camera").position != position_before, "mouse drag must pan the camera at %s" % viewport_size)
		var touch_position_before: Vector2 = screen.get("battle_camera").position
		var touch_press := InputEventScreenTouch.new(); touch_press.index = 0; touch_press.pressed = true; touch_press.position = Vector2(220, 190); screen._unhandled_input(touch_press)
		var touch_drag := InputEventScreenDrag.new(); touch_drag.index = 0; touch_drag.position = Vector2(190, 160); screen._unhandled_input(touch_drag)
		var touch_release := InputEventScreenTouch.new(); touch_release.index = 0; touch_release.pressed = false; touch_release.position = Vector2(190, 160); screen._unhandled_input(touch_release)
		_assert_true(screen.get("battle_camera").position != touch_position_before, "touch drag must pan the camera at %s" % viewport_size)
		var selected_before_pinch := String(screen.get("_selected_unit_id"))
		var pinch_zoom_before: float = screen.get("battle_camera").zoom.x
		var pinch_a := InputEventScreenTouch.new(); pinch_a.index = 0; pinch_a.pressed = true; pinch_a.position = Vector2(300, 200); screen._unhandled_input(pinch_a)
		var pinch_b := InputEventScreenTouch.new(); pinch_b.index = 1; pinch_b.pressed = true; pinch_b.position = Vector2(400, 200); screen._unhandled_input(pinch_b)
		var pinch_drag := InputEventScreenDrag.new(); pinch_drag.index = 1; pinch_drag.position = Vector2(460, 200); screen._unhandled_input(pinch_drag)
		var pinch_release_a := InputEventScreenTouch.new(); pinch_release_a.index = 0; pinch_release_a.pressed = false; pinch_release_a.position = Vector2(300, 200); screen._unhandled_input(pinch_release_a)
		var post_pinch_position: Vector2 = screen.get("battle_camera").position
		var post_pinch_drag := InputEventScreenDrag.new(); post_pinch_drag.index = 1; post_pinch_drag.position = Vector2(500, 220); screen._unhandled_input(post_pinch_drag)
		_assert_true(screen.get("battle_camera").position != post_pinch_position, "remaining finger must continue dragging from a fresh anchor at %s" % viewport_size)
		var pinch_release_b := InputEventScreenTouch.new(); pinch_release_b.index = 1; pinch_release_b.pressed = false; pinch_release_b.position = Vector2(500, 220); screen._unhandled_input(pinch_release_b)
		_assert_true(screen.get("battle_camera").zoom.x > pinch_zoom_before, "two-finger pinch must change bounded camera zoom at %s" % viewport_size)
		_assert_equal(screen.get("_selected_unit_id"), selected_before_pinch, "two-finger pinch must not trigger a tap selection at %s" % viewport_size)
		var invalid_before: Dictionary = screen.get("_snapshot").duplicate(true)
		screen._execute_command("attack_unit", {"unitId": "officer:demo-attacker", "targetUnitId": "officer:unknown"})
		_assert_equal(screen.get("_snapshot"), invalid_before, "invalid command must not mutate the presentation snapshot at %s" % viewport_size)
		_assert_true(String(screen.get("_status_label").text).contains("命令未执行"), "invalid command must surface domain feedback at %s" % viewport_size)
		screen._execute_command("unsupported_presentation_action", {})
		_assert_equal(screen.get("_snapshot"), invalid_before, "unsupported presentation action must not mutate state at %s" % viewport_size)
		_assert_true(String(screen.get("_status_label").text).contains("命令未执行"), "unsupported presentation action must surface feedback at %s" % viewport_size)
		var move_before: Dictionary = screen.get("_snapshot").duplicate(true)
		var move_before_digest := _digest(move_before)
		screen._on_move_pressed()
		_assert_true(bool(screen.get("_snapshot").get("units", {}).get("officer:demo-attacker", {}).get("moved", false)), "move action must dispatch through session at %s" % viewport_size)
		_assert_equal(screen.get("_last_command_result").get("beforeBattleStateSha256", ""), move_before_digest, "move command must expose its before digest at %s" % viewport_size)
		_assert_equal(screen.get("_last_command_result").get("afterBattleStateSha256", ""), _digest(screen.get("_snapshot")), "move command must expose its after digest at %s" % viewport_size)
		screen._on_wait_pressed()
		_assert_true(bool(screen.get("_snapshot").get("units", {}).get("officer:demo-attacker", {}).get("acted", false)), "wait action must dispatch through session at %s" % viewport_size)
		screen._on_end_side_turn()
		_assert_equal(String(screen.get("_snapshot").get("activeSide", "")), "defender", "end-side-turn action must advance the active side at %s" % viewport_size)
		for zoom_value: float in [screen.MIN_ZOOM, screen.MAX_ZOOM]:
			screen._set_zoom(zoom_value, screen.get_viewport_rect().size * 0.5)
			_assert_equal(screen.get("battle_camera").position, screen._clamp_camera_position(screen.get("battle_camera").position), "camera must remain inside safe bounds at zoom %s/%s" % [zoom_value, viewport_size])
		var final_snapshot: Dictionary = screen.get("_snapshot").duplicate(true)
		var restored := Session.from_snapshot(final_snapshot)
		_assert_true(restored != null, "post-command snapshot must restore at %s" % viewport_size)
		if restored != null: _assert_equal(restored.snapshot(), final_snapshot, "restored snapshot must equal presentation state at %s" % viewport_size)
		var terminal_snapshot := invalid_before.duplicate(true); terminal_snapshot["status"] = "attacker-won"; terminal_snapshot["outcome"] = "objective-held"
		var terminal_session := Session.from_snapshot(terminal_snapshot)
		_assert_true(terminal_session != null, "terminal snapshot must restore for feedback test at %s" % viewport_size)
		if terminal_session != null:
			var terminal_digest := _digest(terminal_snapshot)
			var terminal_result: Dictionary = terminal_session.execute({"commandEnvelopeVersion": 1, "commandId": "presentation-terminal", "expectedBattleStateSha256": terminal_digest, "kind": "wait_unit", "parameters": {"unitId": "officer:demo-attacker"}})
			_assert_true(not bool(terminal_result.get("ok", false)), "terminal command must be rejected at %s" % viewport_size)
			_assert_equal(terminal_session.snapshot(), terminal_snapshot, "terminal rejection must preserve state at %s" % viewport_size)
		# Exercise the crash-recovery candidates without depending on platform
		# process-kill timing: every candidate must validate the same digest and
		# a valid fallback must be promoted back to the primary path.
		var pause_candidates: Array[String] = ["user://godot-tactical-pause.json", "user://godot-tactical-pause.json.tmp", "user://godot-tactical-pause.json.bak"]
		for candidate: String in pause_candidates:
			if FileAccess.file_exists(candidate): DirAccess.remove_absolute(ProjectSettings.globalize_path(candidate))
		_assert_true(bool(screen._save_pause_snapshot()), "pause checkpoint must write atomically at %s" % viewport_size)
		var primary_file := FileAccess.open(pause_candidates[0], FileAccess.READ)
		var primary_text := primary_file.get_as_text() if primary_file != null else ""
		if primary_file != null: primary_file.close()
		if FileAccess.file_exists(pause_candidates[0]): DirAccess.remove_absolute(ProjectSettings.globalize_path(pause_candidates[0]))
		var tmp_file := FileAccess.open(pause_candidates[1], FileAccess.WRITE)
		if tmp_file != null: tmp_file.store_string(primary_text); tmp_file.close()
		var tmp_recovered: Dictionary = screen._load_pause_snapshot()
		_assert_equal(_digest(tmp_recovered), _digest(screen.get("_snapshot")), "tmp checkpoint fallback must restore the same battle digest at %s error=%s" % [viewport_size, screen.get("_pause_recovery_error")])
		_assert_true(FileAccess.file_exists(ProjectSettings.globalize_path(pause_candidates[0])), "tmp checkpoint fallback must promote the primary file at %s error=%s" % [viewport_size, screen.get("_pause_recovery_error")])
		if FileAccess.file_exists(pause_candidates[0]): DirAccess.remove_absolute(ProjectSettings.globalize_path(pause_candidates[0]))
		if FileAccess.file_exists(pause_candidates[1]): DirAccess.remove_absolute(ProjectSettings.globalize_path(pause_candidates[1]))
		var bak_file := FileAccess.open(pause_candidates[2], FileAccess.WRITE)
		if bak_file != null: bak_file.store_string(primary_text); bak_file.close()
		var bak_recovered: Dictionary = screen._load_pause_snapshot()
		_assert_equal(_digest(bak_recovered), _digest(screen.get("_snapshot")), "bak checkpoint fallback must restore the same battle digest at %s error=%s" % [viewport_size, screen.get("_pause_recovery_error")])
		_assert_true(FileAccess.file_exists(ProjectSettings.globalize_path(pause_candidates[0])), "bak checkpoint fallback must promote the primary file at %s error=%s" % [viewport_size, screen.get("_pause_recovery_error")])
		if FileAccess.file_exists(pause_candidates[0]): DirAccess.remove_absolute(ProjectSettings.globalize_path(pause_candidates[0]))
		var invalid_primary := FileAccess.open(pause_candidates[0], FileAccess.WRITE)
		if invalid_primary != null: invalid_primary.store_string("{}"); invalid_primary.close()
		var fallback_file := FileAccess.open(pause_candidates[2], FileAccess.WRITE)
		if fallback_file != null: fallback_file.store_string(primary_text); fallback_file.close()
		var invalid_primary_recovered: Dictionary = screen._load_pause_snapshot()
		_assert_equal(_digest(invalid_primary_recovered), _digest(screen.get("_snapshot")), "invalid primary must fall through to a valid bak digest at %s" % viewport_size)
		_assert_true(FileAccess.file_exists(ProjectSettings.globalize_path(pause_candidates[0])), "valid fallback must replace invalid primary at %s" % viewport_size)
		for candidate: String in pause_candidates:
			if FileAccess.file_exists(candidate): DirAccess.remove_absolute(ProjectSettings.globalize_path(candidate))
		screen.queue_free()
	await _run_terminal_settlement_presentation()
	if _failures > 0: push_error("[Godot tactical presentation] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions]); quit(1); return
	print("[Godot tactical presentation] PASSED: %d assertion(s)" % _assertions); quit(0)


func _run_terminal_settlement_presentation() -> void:
	# Exercise the application-owned hand-off and presentation return path with
	# a real production strategic session. This closes the vertical gap between
	# the domain exact-once runner and the terminal tactical screen.
	PauseRepository.clear_candidates()
	SESSION_CONTEXT.clear()
	TACTICAL_CONTEXT.clear()
	var strategic := GameSession.new()
	strategic.clear_battle_recovery()
	var started := strategic.start_campaign(1, 1)
	_assert_true(bool(started.get("ok", false)), "terminal presentation campaign must start")
	if not bool(started.get("ok", false)): return
	var order := {"sourceCityId": "city-12", "targetCityId": "city-11", "officerIds": ["officer-32"], "provisions": 20}
	var saved := strategic.save_game()
	_assert_true(bool(saved.get("ok", false)), "terminal presentation strategic baseline must save")
	var created := strategic.create_tactical_battle(order)
	_assert_true(bool(created.get("ok", false)), "terminal presentation native battle must create: %s" % created.get("error", ""))
	if not bool(created.get("ok", false)): return
	TACTICAL_CONTEXT.store(created.get("battle", {}), order, strategic.state_sha256(), strategic.campaign_descriptor())
	SESSION_CONTEXT.store(strategic)
	var screen := TacticalScene.instantiate()
	root.add_child(screen)
	await process_frame
	await process_frame
	_assert_true(screen.get("_session") != null, "terminal presentation must consume native hand-off")
	screen._execute_command("confirm_deployment", {})
	_assert_true(bool(screen._save_pause_snapshot()), "terminal presentation must save an ongoing checkpoint before the result")
	var ongoing_snapshot := (screen.get("_snapshot") as Dictionary).duplicate(true)
	var ongoing_session = screen.get("_session")
	var ongoing_digest: String = ongoing_session.state_sha256()
	screen._execute_command("retreat_side", {"side": "attacker"})
	var terminal_state: Dictionary = screen.get("_snapshot") as Dictionary
	_assert_equal(str(terminal_state.get("status", "")), "defender-won", "terminal presentation must reach a terminal battle")
	_assert_equal(str(terminal_state.get("outcome", "")), "attacker-retreated", "terminal presentation must preserve retreat outcome")
	var baseline_digest := strategic.state_sha256()
	_assert_true(screen._settle_into_strategic_session(), "warm terminal presentation settlement must succeed")
	var settled_digest := strategic.state_sha256()
	_assert_true(settled_digest != baseline_digest, "warm terminal settlement must change strategic state")
	var committed := strategic.load_battle_recovery()
	_assert_true(bool(committed.get("ok", false)) and bool(committed.get("found", false)) and str(committed.get("status", "")) == "committed", "warm terminal save must retain committed marker until pause cleanup")
	_assert_true(screen._settle_into_strategic_session(), "repeated warm terminal return must be idempotent")
	_assert_equal(strategic.state_sha256(), settled_digest, "repeated warm terminal return must not dispatch settlement twice")
	var stale_pause_write := PauseRepository.new().save(ongoing_snapshot, ongoing_digest, baseline_digest)
	_assert_true(bool(stale_pause_write.get("ok", false)), "test must be able to restore the pre-terminal pause checkpoint")
	var stale_pause_load := PauseRepository.new().load()
	_assert_true(not bool(stale_pause_load.get("ok", false)), "same-battle ongoing pause must be rejected after committed settlement")
	_assert_true(bool(PauseRepository.clear_candidates().get("ok", false)), "stale pause rejection test must clean its candidate")
	_assert_true(bool(screen._save_pause_snapshot()), "terminal presentation must restore the terminal checkpoint after stale rejection")
	var stored_terminal_pause := PauseRepository.new().load()
	_assert_true(bool(stored_terminal_pause.get("ok", false)), "terminal settlement must retain a readable pause checkpoint")
	_assert_equal(str((stored_terminal_pause.get("battle", {}) as Dictionary).get("status", "")), "defender-won", "terminal settlement must replace an older ongoing checkpoint")
	var terminal_snapshot := (screen.get("_snapshot") as Dictionary).duplicate(true)
	screen.queue_free()
	await process_frame
	SESSION_CONTEXT.clear()
	TACTICAL_CONTEXT.clear()
	var recovered := TacticalScene.instantiate()
	root.add_child(recovered)
	await process_frame
	await process_frame
	_assert_equal(_digest(recovered.get("_snapshot")), _digest(terminal_snapshot), "cold terminal pause must restore the same battle snapshot")
	_assert_true(recovered._settle_into_strategic_session(), "cold terminal presentation settlement must consume committed marker")
	_assert_true(bool(recovered.get("_strategic_settlement_applied")), "cold terminal presentation must mark settlement as already applied")
	var recovered_session = SESSION_CONTEXT.peek()
	var recovered_marker: Dictionary = {}
	_assert_true(is_instance_valid(recovered_session), "cold terminal presentation must rebuild strategic session")
	if is_instance_valid(recovered_session):
		_assert_equal(recovered_session.state_sha256(), settled_digest, "cold terminal promotion must preserve strategic settlement digest")
		recovered_marker = recovered_session.load_battle_recovery()
		_assert_true(bool(recovered_marker.get("ok", false)) and bool(recovered_marker.get("found", false)) and str(recovered_marker.get("status", "")) == "committed", "cold tactical save must preserve marker until pause cleanup")
	_assert_true(recovered._settle_into_strategic_session(), "repeated cold terminal return must remain idempotent")
	_assert_equal(recovered_session.state_sha256() if is_instance_valid(recovered_session) else "", settled_digest, "repeated cold terminal return must keep strategic digest")
	# Exercise the real presentation return path, not only its settlement helper.
	# The scene transition itself owns checkpoint/marker cleanup and should land
	# on the native strategic scene with the already-promoted session intact.
	recovered._return_to_strategy()
	await process_frame
	await process_frame
	var strategy_scene: Node = root.find_child("StrategyScreen", true, false)
	_assert_true(is_instance_valid(strategy_scene) and String(strategy_scene.scene_file_path).ends_with("strategy_screen.tscn"), "terminal return must switch to the native strategic scene")
	_assert_true(not PauseRepository.has_candidate(), "terminal return must clear pause candidates")
	if is_instance_valid(recovered_session):
		recovered_marker = recovered_session.load_battle_recovery()
		_assert_true(bool(recovered_marker.get("ok", false)) and not bool(recovered_marker.get("found", false)), "terminal return must leave no committed marker")
	SESSION_CONTEXT.clear()
	TACTICAL_CONTEXT.clear()

func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if actual != expected: _fail(message + " actual=" + str(actual) + " expected=" + str(expected))

func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value: _fail(message)

func _fail(message: String) -> void:
	_failures += 1; push_error("[Godot tactical presentation] " + message)

func _digest(value: Variant) -> String:
	var result: Dictionary = Canonical.try_sha256(value)
	return String(result.get("value", "")) if result.get("ok", false) else ""
