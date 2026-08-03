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
	var personnel_panel = screen.get_node("%PersonnelLifecyclePanel")
	var logistics_panel = screen.get_node("%StrategicLogisticsPanel")
	var reconnaissance_panel = screen.get_node("%ReconnaissancePanel")
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
	for control_name: String in ["PreviousOfficer", "NextOfficer"]:
		var control: Control = officer_panel.get_node("%%%s" % control_name)
		_assert_true(
			control.custom_minimum_size.x * canvas_scale >= 47.5,
			"compact officer %s must retain a 48px-class physical width" % control_name
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
	_assert_equal(
		screen.get("_session").officer_management_query("city-12")["officerManagement"]["officers"][3]["effectiveIntelligence"],
		85, "officer panel query must show normal-item effective intelligence"
	)
	officer_panel.call("_emit_item", "unequip_item", officer_panel.get_node("%UnequipOption"))
	_assert_equal(screen.get("_snapshot")["officers"]["officer-34"]["equipmentItemIds"], [], "officer panel must unequip the selected item")
	_assert_equal(screen.get("_snapshot")["cities"]["city-12"]["itemIds"], ["item-16"], "unequipped item must return to city inventory")
	screen.call("_close_officer_management")

	var personnel_state: Dictionary = screen.get("_session").snapshot()
	personnel_state["discoveredOfficerIds"] = ["officer-126"]
	personnel_state["officers"]["officer-30"]["status"] = "captive"
	personnel_state["officers"]["officer-30"]["factionId"] = "neutral"
	personnel_state["officers"]["officer-30"]["cityId"] = "city-12"
	personnel_state["officers"]["officer-30"]["captorFactionId"] = "ruler-1"
	personnel_state["officers"]["officer-30"]["formerFactionId"] = "ruler-0"
	personnel_state["officers"]["officer-30"]["troops"] = 0
	personnel_state["officers"]["officer-30"]["stamina"] = 0
	personnel_state["officers"]["officer-34"]["equipmentItemIds"] = ["item-16"]
	personnel_state["cities"]["city-12"]["itemIds"] = []
	_assert_true(
		screen.get("_session").restore_snapshot(personnel_state)["ok"],
		"presentation harness must restore valid free-officer, captive and equipment state"
	)
	screen.call("_refresh_snapshot", false)
	screen.call("_open_personnel_lifecycle", "city-12")
	_assert_true(personnel_panel.visible, "city card entry must open the native personnel-lifecycle panel")
	_assert_true(not city_card.visible, "personnel-lifecycle panel must replace rather than overload the city card")
	var personnel_commands: OptionButton = personnel_panel.get_node("%CommandOption")
	_assert_equal(personnel_commands.item_count, 7, "personnel panel must expose all seven lifecycle commands")
	var expected_personnel_order := [
		"search_city", "recruit_free_officer", "recruit_captive", "release_captive",
		"execute_captive", "banish_officer", "confiscate_equipment",
	]
	for command_index: int in range(expected_personnel_order.size()):
		_assert_equal(
			personnel_commands.get_item_metadata(command_index), expected_personnel_order[command_index],
			"personnel command order must be explicit and stable at index %d" % command_index
		)
	personnel_panel.apply_responsive_layout(true, canvas_scale, physical_size)
	personnel_panel.reset_size()
	await process_frame
	var personnel_usable := Rect2(Vector2.ZERO, Vector2(1558.0, 278.0 / canvas_scale))
	personnel_panel.place_in(personnel_usable)
	_assert_true(
		personnel_panel.position.y >= personnel_usable.position.y - 1.0
			and personnel_panel.position.y + personnel_panel.size.y <= personnel_usable.end.y + 1.0,
		"compact personnel panel must remain above the bottom status region: panel=%s usable=%s"
			% [personnel_panel.get_rect(), personnel_usable]
	)
	for control_name: String in [
		"CloseButton", "PreviousCommand", "CommandOption", "NextCommand",
		"TargetOption", "ExecutorOption", "ItemOption", "ExecuteButton",
	]:
		var control: Control = personnel_panel.get_node("%%%s" % control_name)
		_assert_true(
			control.custom_minimum_size.y * canvas_scale >= 47.5,
			"compact personnel %s must retain a 48px-class physical target" % control_name
		)
	personnel_panel.call("_on_command_selected", 1)
	_assert_equal(
		personnel_panel.get_node("%TargetOption").get_item_metadata(0)["id"], "officer-126",
		"recruit UI must preserve query-selected free-officer target"
	)
	personnel_panel.call("_on_command_selected", 2)
	_assert_equal(
		personnel_panel.get_node("%TargetOption").get_item_metadata(0)["id"], "officer-30",
		"surrender UI must preserve query-selected captive target"
	)
	personnel_panel.call("_on_command_selected", 6)
	_assert_true(
		personnel_panel.get_node("%ItemOption").item_count > 0,
		"confiscation UI must expose the selected officer's equipment"
	)
	personnel_panel.call("_on_execute_pressed")
	var personnel_confirmation: ConfirmationDialog = personnel_panel.get("_confirmation")
	_assert_true(personnel_confirmation.visible, "dangerous personnel action must open native confirmation")
	_assert_true(
		personnel_confirmation.get_ok_button().custom_minimum_size.y * canvas_scale >= 47.5,
		"compact personnel confirmation must retain a 48px-class physical target: logical=%s scale=%s"
			% [personnel_confirmation.get_ok_button().custom_minimum_size.y, canvas_scale]
	)
	personnel_confirmation.hide()
	personnel_panel.call("_on_command_selected", 3)
	personnel_panel.call("_on_execute_pressed")
	_assert_equal(
		screen.get("_snapshot")["officers"]["officer-30"]["status"], "free",
		"personnel panel release must execute through the production transaction boundary"
	)
	_assert_true(
		"officer-30" in screen.get("_snapshot")["discoveredOfficerIds"],
		"released captive must remain visible as a discovered free officer"
	)
	screen.call("_close_personnel_lifecycle")
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
	var compact_query: Dictionary = screen.get("_session").internal_affairs_query("city-12")
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

	# MB09: hostile cities expose only public ownership until a real reconnaissance
	# command creates a frozen report. The presenter must never read live enemy stats.
	var recon_query: Dictionary = screen.get("_session").reconnaissance_query("city-12")
	var recon_catalog: Dictionary = recon_query["reconnaissance"]
	_assert_equal(recon_catalog["targets"].size(), 37, "single-city period-1 start must expose 37 hostile reconnaissance targets")
	_assert_equal(recon_catalog["targets"][0]["id"], "city-0", "recon targets must use explicit sourceIndex order")
	_assert_equal(recon_catalog["cost"], {"stamina": 10, "money": 20}, "classic reconnaissance cost must come from the ruleset")
	var recon_target_id: String = recon_catalog["defaultTargetCityId"]
	var recon_officer_id: String = recon_catalog["defaultOfficerId"]
	var live_target_before: Dictionary = screen.get("_snapshot")["cities"][recon_target_id]
	screen.call("_select_city", recon_target_id)
	_assert_true("未侦察" in city_card.get_node("%OwnershipLabel").text, "unscouted hostile card must label its public-only knowledge")
	_assert_true("情报未知" in city_card.get_node("%StatsLabel").text, "unscouted hostile card must replace live statistics with unknown copy")
	_assert_true(not "金：" in city_card.get_node("%StatsLabel").text, "unscouted hostile card must not leak live money")
	_assert_true(not city_card.get_node("%CommandRow").visible and not city_card.get_node("%ExecutorRow").visible, "hostile card must not expose owned-city command controls")
	city_card.show_city(screen.get("_snapshot"), recon_target_id, [], {})
	_assert_true("情报未知" in city_card.get_node("%StatsLabel").text and not "金：" in city_card.get_node("%StatsLabel").text, "missing visibility must fail closed for hostile city data")
	city_card.show_city(screen.get("_snapshot"), recon_target_id, [], {"found": true, "knowledge": "current"})
	_assert_true("情报未知" in city_card.get_node("%StatsLabel").text and not "金：" in city_card.get_node("%StatsLabel").text, "forged current visibility must not expose hostile city data")
	_assert_true(city_card.get("_compact_stats_by_kind").is_empty(), "hostile city card must not cache live compact statistics")
	city_card.apply_responsive_layout(true, canvas_scale, physical_size)
	_assert_true(city_card.get_node("%OwnershipLabel").visible, "compact hostile card must retain textual public ownership")
	_assert_true("势力：" in city_card.get_node("%OwnershipLabel").text, "compact hostile card must identify the current public faction in text")
	city_card.reset_size()
	await process_frame
	var hostile_compact_usable := Rect2(Vector2.ZERO, Vector2(1558.0, 278.0 / canvas_scale))
	var hostile_compact_size := city_card.get_combined_minimum_size()
	_assert_true(hostile_compact_size.y <= hostile_compact_usable.size.y + 1.0, "compact hostile card must fit above the 844x390 status region")
	city_card.size = hostile_compact_size
	city_card.place_near(map_world.get_city_screen_position(recon_target_id), hostile_compact_usable)
	_assert_true(city_card.position.y + city_card.size.y <= hostile_compact_usable.end.y + 1.0, "placed compact hostile card must not overlap the status region")
	city_card.apply_responsive_layout(false, 1.0, Vector2i(1280, 720))
	screen.call("_select_city", "city-12")
	screen.call("_open_reconnaissance", "city-12")
	_assert_true(reconnaissance_panel.visible and not city_card.visible, "native reconnaissance panel must replace the city card")
	var recon_target_option: OptionButton = reconnaissance_panel.get_node("%TargetOption")
	var recon_executor_option: OptionButton = reconnaissance_panel.get_node("%ExecutorOption")
	_assert_equal(recon_target_option.get_item_metadata(0), "city-0", "recon panel must preserve the query target order")
	_assert_equal(recon_target_option.get_item_metadata(recon_target_option.selected), recon_target_id, "recon panel must select the declared default target")
	_assert_equal(recon_executor_option.get_item_metadata(recon_executor_option.selected), recon_officer_id, "recon panel must select the declared default executor")
	_assert_true("20 金、10 体力" in reconnaissance_panel.get_node("%CostLabel").text, "recon panel must disclose exact command costs")
	_assert_true("未侦察" in reconnaissance_panel.get_node("%IntelLabel").text, "recon panel must disclose public-only target knowledge")
	_assert_equal(map_world.get("_recon_target_id"), recon_target_id, "opening reconnaissance must preview the selected target in map space")
	map_world.play_recon_scan("city-12", recon_target_id)
	map_world.preview_recon_target("city-12", "city-1")
	_assert_equal(map_world.get("_recon_target_id"), "city-1", "new reconnaissance preview must supersede an in-flight scan target")
	_assert_true(map_world.get("_recon_tween") == null and is_equal_approx(float(map_world.get("_recon_progress")), 0.42), "new reconnaissance preview must terminate the old scan tween")
	map_world.preview_recon_target("city-12", recon_target_id)
	reconnaissance_panel.apply_responsive_layout(true, canvas_scale, physical_size)
	for control_name: String in ["CloseButton", "TargetOption", "ExecutorOption", "ExecuteButton"]:
		var control: Control = reconnaissance_panel.get_node("%%%s" % control_name)
		_assert_true(control.custom_minimum_size.y * canvas_scale >= 47.5, "compact reconnaissance %s must retain a 48px-class physical target" % control_name)
	for label_name: String in ["TargetLabel", "ExecutorLabel"]:
		var field_label: Label = reconnaissance_panel.get_node("%%%s" % label_name)
		_assert_true(field_label.get_theme_font_size("font_size") * canvas_scale >= 14.5, "compact reconnaissance %s must remain physically readable" % label_name)
	var blocked_recon_catalog: Dictionary = recon_catalog.duplicate(true)
	blocked_recon_catalog["allowed"] = false
	blocked_recon_catalog["reason"] = "本城没有可执行侦察的武将"
	blocked_recon_catalog["executors"] = []
	reconnaissance_panel.refresh(blocked_recon_catalog)
	_assert_true("不可执行：本城没有可执行侦察的武将" in reconnaissance_panel.get_node("%IntelLabel").text, "touch reconnaissance panel must render disabled reasons without relying on a tooltip")
	reconnaissance_panel.refresh(recon_catalog)
	var recon_seed_before: int = int(screen.get("_snapshot")["rngSeed"])
	var recon_money_before: int = int(screen.get("_snapshot")["cities"]["city-12"]["money"])
	var recon_stamina_before: int = int(screen.get("_snapshot")["officers"][recon_officer_id]["stamina"])
	reconnaissance_panel.call("_emit_command")
	var recon_after: Dictionary = screen.get("_snapshot")
	_assert_equal(int(recon_after["rngSeed"]), recon_seed_before, "reconnaissance must not advance the deterministic seed")
	_assert_equal(int(recon_after["cities"]["city-12"]["money"]), recon_money_before - 20, "reconnaissance must debit source money atomically")
	_assert_equal(int(recon_after["officers"][recon_officer_id]["stamina"]), recon_stamina_before - 10, "reconnaissance must debit executor stamina atomically")
	_assert_true(recon_officer_id in recon_after["actedOfficerIds"], "reconnaissance must consume the executor's monthly action")
	_assert_true(recon_after["intelReports"].has(recon_target_id), "reconnaissance must persist a target report")
	var frozen_report: Dictionary = recon_after["intelReports"][recon_target_id].duplicate(true)
	_assert_equal(int(frozen_report["money"]), int(live_target_before["money"]), "fresh report must snapshot the target's observed money")
	_assert_true("旧情报" in reconnaissance_panel.get_node("%IntelLabel").text, "successful reconnaissance must refresh the panel to report mode")
	_assert_equal(map_world.get("_recon_target_id"), recon_target_id, "successful reconnaissance must play its native map scan on the target")
	var stale_state: Dictionary = screen.get("_session").snapshot()
	var stale_live_money: int = mini(9999, int(frozen_report["money"]) + 777)
	stale_state["cities"][recon_target_id]["money"] = stale_live_money
	_assert_true(screen.get("_session").restore_snapshot(stale_state)["ok"], "presentation harness must restore a valid changed enemy state")
	screen.call("_refresh_snapshot", false)
	screen.call("_select_city", recon_target_id)
	_assert_true("旧情报" in city_card.get_node("%OwnershipLabel").text, "scouted hostile card must identify report-derived stale knowledge")
	_assert_true("金：%d" % int(frozen_report["money"]) in city_card.get_node("%StatsLabel").text, "scouted hostile card must render the frozen report value")
	_assert_true(not "金：%d" % stale_live_money in city_card.get_node("%StatsLabel").text, "scouted hostile card must not leak a newer live enemy value")

	# MB08 uses a legitimate period-1 multi-city candidate so the device path can
	# issue real road orders without mutating ownership in presentation code.
	screen.call("_start_logistics_demo")
	_assert_equal(screen.get("_snapshot")["playerFactionId"], "ruler-5", "logistics sample must start the legitimate Ma Teng campaign candidate")
	_assert_true(logistics_panel.visible, "logistics sample must open the native strategic-logistics panel")
	var target_option: OptionButton = logistics_panel.get_node("%TargetOption")
	_assert_equal(target_option.item_count, 2, "Xiliang logistics must expose two reachable owned destinations")
	var selected_target: Dictionary = target_option.get_item_metadata(target_option.selected)
	_assert_equal(selected_target["routeCityIds"], ["city-0", "city-3"], "logistics query must freeze the stable direct route first")
	logistics_panel.apply_responsive_layout(true, canvas_scale, physical_size)
	logistics_panel.reset_size()
	await process_frame
	var logistics_usable := Rect2(Vector2.ZERO, Vector2(1558.0, 278.0 / canvas_scale))
	logistics_panel.place_in(logistics_usable)
	_assert_true(logistics_panel.position.y + logistics_panel.size.y <= logistics_usable.end.y + 1.0, "compact logistics panel must remain above the status region")
	for control_name: String in ["CloseButton", "ModeOption", "TargetOption", "ExecutorOption", "MoneyAmount", "FoodAmount", "TroopsAmount", "ExecuteButton", "AdvanceButton", "CargoPresetButton", "DemoButton"]:
		var control: Control = logistics_panel.get_node("%%%s" % control_name)
		_assert_true(control.custom_minimum_size.y * canvas_scale >= 47.5, "compact logistics %s must retain a 48px-class physical target" % control_name)
	# Destination capacity is a query DTO concern; the Control only applies the
	# selected target's declared headroom and the declared risk percentage.
	var original_target: Dictionary = target_option.get_item_metadata(0).duplicate(true)
	_assert_true(original_target.has("cargoHeadroom"), "logistics target DTO must expose cargo headroom")
	var full_target: Dictionary = original_target.duplicate(true)
	full_target["cargoHeadroom"] = {"money": 0, "food": 0, "reserveTroops": 0}
	full_target["cargoLimits"] = {"money": 0, "food": 0, "reserveTroops": 0}
	full_target["transportAllowed"] = false
	full_target["transportReason"] = "目标城无接收空间或源城无可输送物资"
	target_option.set_item_metadata(0, full_target)
	logistics_panel.get_node("%ModeOption").select(1)
	target_option.select(0)
	logistics_panel.call("_render_selection")
	_assert_equal(int(logistics_panel.get_node("%MoneyAmount").max_value), 0, "full selected target must clamp money input")
	_assert_equal(int(logistics_panel.get_node("%FoodAmount").max_value), 0, "full selected target must clamp food input")
	_assert_true(logistics_panel.get_node("%ExecuteButton").disabled, "full selected target must disable transport")
	_assert_true("无接收空间" in logistics_panel.get_node("%ReasonLabel").text, "full selected target must expose the query reason")
	target_option.set_item_metadata(0, original_target)
	logistics_panel.call("_render_selection")
	logistics_panel.call("_apply_small_mixed_cargo")
	_assert_true("20%" in logistics_panel.get_node("%ReasonLabel").text, "risk copy must use the query threshold")
	logistics_panel.get_node("%ModeOption").select(0)
	# Select the two-road destination and issue a real move through the application envelope.
	target_option.select(1)
	logistics_panel.call("_render_selection")
	var moving_officer_id: String = logistics_panel.get_node("%ExecutorOption").get_item_metadata(0)["id"]
	logistics_panel.call("_emit_command")
	_assert_equal(screen.get("_snapshot")["strategicOrders"]["strategic-order-1"]["routeCityIds"], ["city-0", "city-3", "city-8"], "native move must preserve the frozen two-road route")
	_assert_equal(screen.get("_snapshot")["officers"][moving_officer_id].get("cityId", null), null, "issued move executor must become in-transit")
	screen.call("_advance_strategic_logistics")
	_assert_equal(screen.get("_snapshot")["strategicOrders"]["strategic-order-1"]["remainingMonths"], 1, "first month must decrement a multi-road order")
	screen.call("_advance_strategic_logistics")
	_assert_true(not screen.get("_snapshot")["strategicOrders"].has("strategic-order-1"), "second month must complete the move")
	_assert_equal(screen.get("_snapshot")["officers"][moving_officer_id]["cityId"], "city-8", "completed move must station the executor at the target")
	# Reopen at Xiliang and issue transport; cargo is debited immediately and RNG only advances on valid arrival.
	screen.set("_selected_city_id", "city-0")
	screen.call("_open_strategic_logistics", "city-0")
	logistics_panel.get_node("%ModeOption").select(1)
	logistics_panel.get_node("%TargetOption").select(0)
	logistics_panel.call("_render_selection")
	var transport_money_before: int = int(screen.get("_snapshot")["cities"]["city-0"]["money"])
	var transport_food_before: int = int(screen.get("_snapshot")["cities"]["city-0"]["food"])
	var transport_troops_before: int = int(screen.get("_snapshot")["cities"]["city-0"]["reserveTroops"])
	var transport_seed_before: int = int(screen.get("_snapshot")["rngSeed"])
	logistics_panel.call("_apply_small_mixed_cargo")
	_assert_equal(int(logistics_panel.get_node("%MoneyAmount").value), mini(10, transport_money_before), "touch preset must fill a safe money batch")
	_assert_equal(int(logistics_panel.get_node("%FoodAmount").value), mini(10, transport_food_before), "touch preset must fill a safe food batch")
	_assert_equal(int(logistics_panel.get_node("%TroopsAmount").value), mini(10, transport_troops_before), "touch preset must fill a safe reserve-troop batch")
	logistics_panel.call("_emit_command")
	_assert_equal(int(screen.get("_snapshot")["cities"]["city-0"]["money"]), transport_money_before - mini(10, transport_money_before), "transport must debit money atomically on issue")
	_assert_equal(int(screen.get("_snapshot")["cities"]["city-0"]["food"]), transport_food_before - mini(10, transport_food_before), "transport must debit food atomically on issue")
	_assert_equal(int(screen.get("_snapshot")["cities"]["city-0"]["reserveTroops"]), transport_troops_before - mini(10, transport_troops_before), "transport must debit reserve troops atomically on issue")
	_assert_true("10 金" in logistics_panel.get_node("%OrdersLabel").text and "10 粮" in logistics_panel.get_node("%OrdersLabel").text, "active transport summary must expose its cargo")
	screen.call("_advance_strategic_logistics")
	_assert_true(int(screen.get("_snapshot")["rngSeed"]) != transport_seed_before, "valid transport arrival must consume exactly the deterministic loss roll")
	_assert_true("全部损失" in screen.get_node("%StatusLine").text or "完成对" in screen.get_node("%StatusLine").text, "advance feedback must expose the transport outcome")

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
