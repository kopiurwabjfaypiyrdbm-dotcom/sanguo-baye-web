extends SceneTree

const MAIN_SCENE := preload("res://scenes/presentation/strategy_screen.tscn")

var _assertions := 0
var _failures := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var screen := MAIN_SCENE.instantiate()
	root.add_child(screen)
	await process_frame
	await create_timer(0.65).timeout

	var map_world: StrategyMapWorld = screen.get_node("%MapWorld")
	var map_camera: Camera2D = screen.get_node("%MapCamera")
	var city_card: CityCard = screen.get_node("%CityCard")
	var officer_panel = screen.get_node("%OfficerManagementPanel")
	var physical_size := Vector2i(844, 390)
	var canvas_scale := minf(float(physical_size.x) / 1280.0, float(physical_size.y) / 720.0)
	_assert_equal(map_world.get_ordered_city_ids().size(), 38, "main scene must render all 38 cities")
	_assert_equal(map_world.get_road_count(), 54, "main scene must render 54 reciprocal roads")

	screen.call("_kill_camera_tween")
	var zoom_before := map_camera.zoom.x
	screen.call("_handle_screen_touch", _touch(0, true, Vector2(360, 310)))
	screen.call("_handle_screen_touch", _touch(1, true, Vector2(560, 310)))
	screen.call("_handle_screen_drag", _drag(0, Vector2(300, 310), Vector2(-60, 0)))
	screen.call("_handle_screen_drag", _drag(1, Vector2(620, 310), Vector2(60, 0)))
	_assert_true(map_camera.zoom.x > zoom_before, "two touch points moving apart must zoom in")
	screen.call("_handle_screen_touch", _touch(0, false, Vector2(300, 310)))
	screen.call("_handle_screen_touch", _touch(1, false, Vector2(620, 310)))

	var position_before := map_camera.position
	screen.call("_handle_screen_touch", _touch(2, true, Vector2(480, 320)))
	screen.call("_handle_screen_drag", _drag(2, Vector2(590, 320), Vector2(110, 0)))
	screen.call("_handle_screen_touch", _touch(2, false, Vector2(590, 320)))
	_assert_true(
		map_camera.position.distance_to(position_before) > 0.1,
		"single-touch drag at an enlarged zoom must pan the camera"
	)

	var player_city_position := map_world.get_city_screen_position("city-12")
	screen.call("_handle_screen_touch", _touch(3, true, player_city_position))
	screen.call("_handle_screen_touch", _touch(3, false, player_city_position, true))
	_assert_true(not city_card.visible, "a canceled Android touch must not create a ghost city tap")
	screen.call("_handle_screen_touch", _touch(4, true, player_city_position))
	screen.call("_handle_screen_touch", _touch(4, false, player_city_position))
	_assert_true(city_card.visible, "touch tap on city-12 must open the spatial city card")
	var command_option: OptionButton = city_card.get_node("%CommandOption")
	_assert_equal(command_option.item_count, 7, "city card must expose all seven internal-affairs commands")
	screen.call("_open_officer_management", "city-12")
	_assert_true(officer_panel.visible, "city card entry must open the native officer-management panel")
	_assert_true(not city_card.visible, "officer-management panel must replace rather than overload the city card")
	var officer_option: OptionButton = officer_panel.get_node("%OfficerOption")
	_assert_equal(officer_option.item_count, 7, "officer panel must preserve stable stationed-officer order")
	officer_panel.apply_responsive_layout(true, canvas_scale, physical_size)
	officer_panel.reset_size()
	await process_frame
	var officer_usable := Rect2(Vector2.ZERO, Vector2(1558.0, 278.0 / canvas_scale))
	officer_panel.place_in(officer_usable)
	_assert_true(
		officer_panel.position.y >= officer_usable.position.y - 1.0
			and officer_panel.position.y + officer_panel.size.y <= officer_usable.end.y + 1.0,
		"compact officer panel must remain above the bottom status region: panel=%s usable=%s"
			% [officer_panel.get_rect(), officer_usable]
	)
	for control_name: String in [
		"CloseButton", "PreviousOfficer", "OfficerOption", "NextOfficer",
		"RewardButton", "AppointButton", "GiveOption", "GiveButton", "UnequipOption", "UnequipButton",
	]:
		var control: Control = officer_panel.get_node("%%%s" % control_name)
		_assert_true(
			control.custom_minimum_size.y * canvas_scale >= 47.5,
			"compact officer %s must retain a 48px-class physical target" % control_name
		)
	officer_panel.call("_on_officer_selected", 3)
	_assert_true(not officer_panel.get_node("%RewardButton").disabled, "eligible non-ruler must expose reward action")
	_assert_true(officer_panel.get_node("%AppointButton").disabled, "classic ruleset must disable manual satrap appointment")
	var reward_money_before: int = int(screen.get("_snapshot")["cities"]["city-12"]["money"])
	var reward_loyalty_before: int = int(screen.get("_snapshot")["officers"]["officer-34"]["loyalty"])
	officer_panel.call("_request_confirmation", "reward_officer")
	officer_panel.call("_emit_pending_command")
	officer_panel.get("_confirmation").hide()
	_assert_equal(int(screen.get("_snapshot")["cities"]["city-12"]["money"]), reward_money_before - 100, "officer panel reward must spend city money")
	_assert_equal(int(screen.get("_snapshot")["officers"]["officer-34"]["loyalty"]), reward_loyalty_before + 8, "officer panel reward must raise loyalty")
	var patched: Dictionary = screen.get("_session").snapshot()
	patched["cities"]["city-12"]["money"] = 500
	patched["cities"]["city-12"]["itemIds"] = ["item-16"]
	patched["cities"]["city-12"]["hiddenItemIds"] = ["item-20"]
	_assert_true(screen.get("_session").restore_snapshot(patched)["ok"], "presentation harness must restore a valid discovered-item state")
	screen.call("_refresh_snapshot", false)
	screen.call("_open_officer_management", "city-12")
	officer_panel.call("_on_officer_selected", 3)
	officer_panel.call("_request_confirmation", "give_item")
	officer_panel.call("_emit_pending_command")
	officer_panel.get("_confirmation").hide()
	_assert_equal(screen.get("_snapshot")["officers"]["officer-34"]["equipmentItemIds"], ["item-16"], "officer panel must give an ordered equipment item")
	officer_panel.call("_emit_item", "unequip_item", officer_panel.get_node("%UnequipOption"))
	_assert_equal(screen.get("_snapshot")["officers"]["officer-34"]["equipmentItemIds"], [], "officer panel must unequip the selected item")
	_assert_equal(screen.get("_snapshot")["cities"]["city-12"]["itemIds"], ["item-16"], "unequipped item must return to city inventory")
	screen.call("_close_officer_management")
	city_card.call("_step_command", -1)
	_assert_equal(command_option.get_item_metadata(command_option.selected), "plunder_city", "left command control must wrap to plunder")
	city_card.call("_on_action_pressed")
	var confirmation: ConfirmationDialog = city_card.get("_confirm_dialog")
	_assert_true(confirmation.visible, "plunder must open a native dangerous-action confirmation")
	_assert_true(confirmation.get_ok_button().custom_minimum_size.y >= 48.0, "danger confirmation must keep a 48px-class confirm target")
	confirmation.hide()
	var compact_card: CityCard = load("res://scenes/presentation/city_card.tscn").instantiate()
	root.add_child(compact_card)
	await process_frame
	var compact_query: Dictionary = screen.get("_session").city_query("city-12")
	compact_card.show_city(screen.get("_snapshot"), "city-12", compact_query["internalAffairs"])
	compact_card.apply_responsive_layout(true, canvas_scale, physical_size)
	compact_card.call("_on_command_selected", 6)
	await process_frame
	compact_card.reset_size()
	await process_frame
	var compact_size := compact_card.get_combined_minimum_size()
	var usable_rect := Rect2(Vector2.ZERO, Vector2(1558.0, 278.0 / canvas_scale))
	compact_card.size = compact_size
	compact_card.place_near(Vector2(800.0, 130.0), usable_rect)
	_assert_true(
		compact_card.position.y >= usable_rect.position.y - 1.0
			and compact_card.position.y + compact_card.size.y <= usable_rect.end.y + 1.0,
		"compact city card must remain inside the top/bottom safe content region: card=%s usable=%s"
			% [compact_card.get_rect(), usable_rect]
	)
	city_card.call("_on_command_selected", 4)
	_assert_true(city_card.get_node("%TradeRow").visible, "trade command must reveal native direction and amount controls")
	compact_card.call("_on_command_selected", 4)
	for control_name: String in ["CommandOption", "ExecutorOption", "TradeDirection", "TradeAmount"]:
		var control: Control = compact_card.get_node("%%%s" % control_name)
		_assert_true(
			control.custom_minimum_size.y * canvas_scale >= 47.5,
			"compact %s must retain a 48px-class physical target" % control_name
		)
	compact_card.queue_free()
	city_card.call("_on_command_selected", 0)
	var snapshot_before: Dictionary = screen.get("_snapshot")
	var farming_before: int = int(snapshot_before["cities"]["city-12"]["farming"])
	screen.call("_execute_develop_farming", "city-12", "officer-1")
	var snapshot_after: Dictionary = screen.get("_snapshot")
	_assert_true(
		int(snapshot_after["cities"]["city-12"]["farming"]) > farming_before,
		"main scene must execute develop_farming through the production transaction boundary: %s"
			% screen.get_node("%StatusLine").text
	)
	_assert_equal(snapshot_after["dataContractVersion"], 2, "main scene must use MB03 production data")
	var trade_seed_before: int = int(snapshot_after["rngSeed"])
	var trade_money_before: int = int(snapshot_after["cities"]["city-12"]["money"])
	var trade_food_before: int = int(snapshot_after["cities"]["city-12"]["food"])
	screen.call("_execute_internal_command", "trade_food", {
		"cityId": "city-12", "officerId": "officer-32", "direction": "sell", "amount": 10,
	})
	var trade_after: Dictionary = screen.get("_snapshot")
	_assert_equal(int(trade_after["rngSeed"]), trade_seed_before, "trade must not advance the deterministic seed")
	_assert_equal(int(trade_after["cities"]["city-12"]["money"]), trade_money_before + 20, "trade sell must credit money")
	_assert_equal(int(trade_after["cities"]["city-12"]["food"]), trade_food_before - 10, "trade sell must debit food")

	if _failures > 0:
		push_error(
			"[Godot presentation input smoke] FAILED: %d failure(s), %d assertion(s)"
			% [_failures, _assertions]
		)
		quit(1)
		return
	print("[Godot presentation input smoke] PASSED: %d assertion(s)" % _assertions)
	quit(0)


func _touch(
		index: int,
		pressed: bool,
		position: Vector2,
		canceled: bool = false,
) -> InputEventScreenTouch:
	var event := InputEventScreenTouch.new()
	event.index = index
	event.pressed = pressed
	event.position = position
	event.canceled = canceled
	return event


func _drag(index: int, position: Vector2, relative: Vector2) -> InputEventScreenDrag:
	var event := InputEventScreenDrag.new()
	event.index = index
	event.position = position
	event.relative = relative
	return event


func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value:
		_failures += 1
		push_error("[Godot presentation input smoke] %s" % message)


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assert_true(actual == expected, "%s (expected %s, got %s)" % [message, expected, actual])
