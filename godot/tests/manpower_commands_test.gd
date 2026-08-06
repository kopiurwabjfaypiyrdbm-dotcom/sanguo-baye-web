extends FlightDeckTest

const GameSession = preload("res://src/application/game_session/game_session.gd")
const Manpower = preload("res://src/domain/commands/manpower_commands.gd")


func test_player_can_recruit_and_distribute_troops() -> void:
	var session := GameSession.new("user://flightdeck-manpower-smoke-save.json")
	var started: Dictionary = session.start_campaign(1, 0)
	assert_true(bool(started.get("ok", false)), "period 1 campaign must start for manpower smoke")
	if not bool(started.get("ok", false)):
		return

	var snapshot: Dictionary = session.snapshot()
	var city_id := ""
	var officer_id := ""
	for raw_city_id: Variant in snapshot.get("cityOrder", []):
		var city: Dictionary = snapshot["cities"][str(raw_city_id)]
		if str(city.get("ownerId", "")) != str(snapshot.get("playerFactionId", "")):
			continue
		for raw_officer_id: Variant in snapshot.get("officerOrder", []):
			var officer: Dictionary = snapshot["officers"][str(raw_officer_id)]
			if officer.get("status", "") != "serving":
				continue
			if str(officer.get("cityId", "")) != str(raw_city_id):
				continue
			if str(officer.get("factionId", "")) != str(snapshot.get("playerFactionId", "")):
				continue
			city_id = str(raw_city_id)
			officer_id = str(raw_officer_id)
			break
		if not city_id.is_empty():
			break
	assert_false(city_id.is_empty(), "player must own at least one city with a serving officer")
	if city_id.is_empty():
		return

	var before_reserve := int(snapshot["cities"][city_id].get("reserveTroops", 0))
	var before_troops := int(snapshot["officers"][officer_id].get("troops", 0))
	var recruit: Dictionary = session.execute_command({
		"commandEnvelopeVersion": 1,
		"commandId": "manpower-recruit-1",
		"expectedStateSha256": session.state_sha256(),
		"kind": "recruit_troops",
		"parameters": {"cityId": city_id, "officerId": officer_id},
	})
	assert_true(bool(recruit.get("ok", false)), "recruit_troops must succeed on a valid owned city")
	if not bool(recruit.get("ok", false)):
		assert_equal(str(recruit.get("error", "")), "", "recruit failure reason")
		return

	var after_recruit: Dictionary = session.snapshot()
	var after_reserve := int(after_recruit["cities"][city_id].get("reserveTroops", 0))
	assert_true(after_reserve > before_reserve, "recruit must increase city reserve troops")

	var capacity := Manpower.calculate_officer_troop_capacity(after_recruit["officers"][officer_id])
	var target := mini(
		capacity,
		mini(before_troops + after_reserve, before_troops + Manpower.MAX_DISTRIBUTION_INCREASE),
	)
	# Officer already acted during recruit; pick another idle officer in the same city if needed.
	var distribute_officer := officer_id
	if (after_recruit.get("actedOfficerIds", []) as Array).has(officer_id):
		distribute_officer = ""
		for raw_officer_id: Variant in after_recruit.get("officerOrder", []):
			var candidate_id := str(raw_officer_id)
			var officer: Dictionary = after_recruit["officers"][candidate_id]
			if officer.get("status", "") != "serving":
				continue
			if str(officer.get("cityId", "")) != city_id:
				continue
			if str(officer.get("factionId", "")) != str(after_recruit.get("playerFactionId", "")):
				continue
			if (after_recruit.get("actedOfficerIds", []) as Array).has(candidate_id):
				continue
			distribute_officer = candidate_id
			before_troops = int(officer.get("troops", 0))
			capacity = Manpower.calculate_officer_troop_capacity(officer)
			target = mini(
				capacity,
				mini(before_troops + after_reserve, before_troops + Manpower.MAX_DISTRIBUTION_INCREASE),
			)
			break
	assert_false(distribute_officer.is_empty(), "city must expose a second idle officer or same-city alternate for distribute")
	if distribute_officer.is_empty():
		return
	if target <= before_troops:
		# Still assert the command exists and rejects a no-op clearly.
		var noop: Dictionary = session.execute_command({
			"commandEnvelopeVersion": 1,
			"commandId": "manpower-distribute-noop",
			"expectedStateSha256": session.state_sha256(),
			"kind": "distribute_troops",
			"parameters": {
				"cityId": city_id,
				"officerId": distribute_officer,
				"targetTroops": before_troops,
			},
		})
		assert_false(bool(noop.get("ok", true)), "no-op distribute must be rejected")
		return

	var distribute: Dictionary = session.execute_command({
		"commandEnvelopeVersion": 1,
		"commandId": "manpower-distribute-1",
		"expectedStateSha256": session.state_sha256(),
		"kind": "distribute_troops",
		"parameters": {
			"cityId": city_id,
			"officerId": distribute_officer,
			"targetTroops": target,
		},
	})
	assert_true(bool(distribute.get("ok", false)), "distribute_troops must succeed after recruiting reserves")
	if bool(distribute.get("ok", false)):
		var after: Dictionary = session.snapshot()
		assert_equal(int(after["officers"][distribute_officer].get("troops", -1)), target, "officer troops must match target")
