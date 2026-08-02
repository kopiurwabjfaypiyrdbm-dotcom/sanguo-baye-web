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
	city_card.call("_on_command_selected", 4)
	_assert_true(city_card.get_node("%TradeRow").visible, "trade command must reveal native direction and amount controls")
	city_card.call("_on_command_selected", 0)
	var snapshot_before: Dictionary = screen.get("_snapshot")
	var farming_before: int = int(snapshot_before["cities"]["city-12"]["farming"])
	screen.call("_execute_develop_farming", "city-12", "officer-1")
	var snapshot_after: Dictionary = screen.get("_snapshot")
	_assert_true(
		int(snapshot_after["cities"]["city-12"]["farming"]) > farming_before,
		"main scene must execute develop_farming through the production transaction boundary"
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
