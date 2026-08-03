class_name TacticalBattleValidator
extends RefCounted

const BattleState = preload("res://src/domain/tactical/battle_state.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const Battlefield = preload("res://src/domain/tactical/battlefield.gd")


static func validate(snapshot: Dictionary) -> Array[Dictionary]:
	var issues: Array[Dictionary] = []
	var canonical_result: Dictionary = Canonical.try_encode(snapshot)
	if not canonical_result.get("ok", false): _issue(issues, "canonical", String(canonical_result.get("error", "cannot encode snapshot")))
	var required: Array[String] = [
		"contractVersion", "id", "strategicTurn", "seedBefore", "rngSeed",
		"sourceCityId", "targetCityId", "attackerFactionId", "defenderFactionId",
		"attackerOfficerIds", "defenderOfficerIds", "provisionsCommitted",
		"attackerFood", "defenderFood", "width", "height", "day", "maxDays",
		"phase", "activeSide", "status", "outcome", "approach", "deployment", "units",
		"actedUnitIds", "logs", "guard",
	]
	for key: String in required:
		if not snapshot.has(key): _issue(issues, key, "is required")
	if not _is_exact_integer(snapshot.get("contractVersion")):
		_issue(issues, "contractVersion", "must be the integer 1")
	elif int(snapshot.get("contractVersion")) != BattleState.CONTRACT_VERSION:
		_issue(issues, "contractVersion", "must be 1")
	if not _non_empty_string(snapshot.get("id")): _issue(issues, "id", "must be a non-empty string")
	for key: String in ["strategicTurn", "seedBefore", "rngSeed", "provisionsCommitted", "attackerFood", "defenderFood", "width", "height", "day", "maxDays"]:
		if not _is_integer(snapshot.get(key)): _issue(issues, key, "must be an integer")
	if _is_exact_integer(snapshot.get("provisionsCommitted")) and int(snapshot.get("provisionsCommitted")) <= 0: _issue(issues, "provisionsCommitted", "must be positive")
	if _is_exact_integer(snapshot.get("width")) and _is_exact_integer(snapshot.get("height")):
		if int(snapshot.get("width")) != 12 or int(snapshot.get("height")) != 8: _issue(issues, "dimensions", "must be exactly 12x8 in contract version 1")
	if _is_exact_integer(snapshot.get("day")) and _is_exact_integer(snapshot.get("maxDays")):
		if int(snapshot.get("day")) < 1 or int(snapshot.get("maxDays")) < 1: _issue(issues, "days", "must be positive")
	if typeof(snapshot.get("phase")) != TYPE_STRING or not ["deployment", "battle", "ended"].has(String(snapshot.get("phase"))):
		_issue(issues, "phase", "must be deployment, battle or ended")
	if typeof(snapshot.get("activeSide")) != TYPE_STRING or not ["attacker", "defender"].has(String(snapshot.get("activeSide"))):
		_issue(issues, "activeSide", "must be attacker or defender")
	var raw_status: Variant = snapshot.get("status")
	if typeof(raw_status) != TYPE_STRING and typeof(raw_status) != TYPE_STRING_NAME:
		_issue(issues, "status", "must be a string")
	elif not ["ongoing", "attacker-won", "defender-won"].has(String(raw_status)):
		_issue(issues, "status", "has an unsupported value")
	if typeof(snapshot.get("outcome")) != TYPE_STRING: _issue(issues, "outcome", "must be a string")
	for key: String in ["sourceCityId", "targetCityId", "attackerFactionId", "defenderFactionId", "approach"]:
		if not _non_empty_string(snapshot.get(key)): _issue(issues, key, "must be a non-empty string")
	if _non_empty_string(snapshot.get("sourceCityId")) and _non_empty_string(snapshot.get("targetCityId")) and snapshot.get("sourceCityId") == snapshot.get("targetCityId"): _issue(issues, "cities", "source and target must differ")
	if _non_empty_string(snapshot.get("attackerFactionId")) and _non_empty_string(snapshot.get("defenderFactionId")) and snapshot.get("attackerFactionId") == snapshot.get("defenderFactionId"): _issue(issues, "factions", "attacker and defender must differ")
	if not _non_empty_string(snapshot.get("approach")) or not ["east", "west", "south", "north"].has(String(snapshot.get("approach"))): _issue(issues, "approach", "has an unsupported value")
	var phase := String(snapshot.get("phase", "")) if typeof(snapshot.get("phase")) == TYPE_STRING else ""
	var status := String(snapshot.get("status", "")) if typeof(snapshot.get("status")) == TYPE_STRING else ""
	var outcome := String(snapshot.get("outcome", "")) if typeof(snapshot.get("outcome")) == TYPE_STRING else ""
	if status == "ongoing" and (phase == "ended" or not outcome.is_empty()): _issue(issues, "status", "ongoing state must not be ended or have an outcome")
	if status != "" and status != "ongoing" and (phase != "ended" or outcome.is_empty()): _issue(issues, "outcome", "ended state must have a non-empty outcome")
	for key: String in ["attackerOfficerIds", "defenderOfficerIds", "actedUnitIds", "logs"]:
		if typeof(snapshot.get(key)) != TYPE_ARRAY: _issue(issues, key, "must be an array")
	_validate_unique_strings(snapshot.get("attackerOfficerIds", []), "attackerOfficerIds", issues)
	_validate_unique_strings(snapshot.get("defenderOfficerIds", []), "defenderOfficerIds", issues)
	_validate_unique_strings(snapshot.get("actedUnitIds", []), "actedUnitIds", issues)
	_validate_sorted_strings(snapshot.get("actedUnitIds", []), "actedUnitIds", issues)
	if typeof(snapshot.get("deployment")) != TYPE_DICTIONARY: _issue(issues, "deployment", "must be an object")
	if typeof(snapshot.get("units")) != TYPE_DICTIONARY: _issue(issues, "units", "must be an object")
	else:
		_validate_units(snapshot, issues)
		if typeof(snapshot.get("deployment")) == TYPE_DICTIONARY: _validate_deployment(snapshot, issues)
		_validate_roster(snapshot, issues)
		_validate_acted(snapshot, issues)
		_validate_terminal_invariants(snapshot, issues)
	Battlefield.validate_grid(snapshot, issues)
	_validate_optional_attack_fields(snapshot, issues)
	if typeof(snapshot.get("guard")) != TYPE_DICTIONARY: _issue(issues, "guard", "must be an object")
	else: _validate_guard(snapshot, snapshot["guard"], issues)
	return issues


static func first_error(issues: Array[Dictionary]) -> String:
	return String(issues[0].get("message", "invalid tactical battle state")) if not issues.is_empty() else ""


static func _validate_units(snapshot: Dictionary, issues: Array[Dictionary]) -> void:
	var units: Dictionary = snapshot["units"]
	for raw_key in units.keys():
		if typeof(raw_key) != TYPE_STRING:
			_issue(issues, "units", "keys must be strings")
			return
	var known_ids: Array[String] = []
	for raw_id: Variant in _sorted_keys(units):
		var unit_id := String(raw_id)
		known_ids.append(unit_id)
		var unit: Variant = units[raw_id]
		if typeof(unit) != TYPE_DICTIONARY:
			_issue(issues, "units.%s" % unit_id, "must be an object")
			continue
		for key: String in ["id", "factionId", "side", "status"]:
			if not _non_empty_string(unit.get(key)): _issue(issues, "units.%s.%s" % [unit_id, key], "must be a non-empty string")
		if typeof(unit.get("officerId", "")) != TYPE_STRING and typeof(unit.get("officerId", "")) != TYPE_STRING_NAME:
			_issue(issues, "units.%s.officerId" % unit_id, "must be a string")
		if unit.get("id", "") != unit_id: _issue(issues, "units.%s.id" % unit_id, "must match its map key")
		if not ["attacker", "defender"].has(unit.get("side", "")): _issue(issues, "units.%s.side" % unit_id, "must be attacker or defender")
		var expected_faction := ""
		if unit.get("side") == "attacker" and _non_empty_string(snapshot.get("attackerFactionId")): expected_faction = String(snapshot.get("attackerFactionId"))
		elif unit.get("side") == "defender" and _non_empty_string(snapshot.get("defenderFactionId")): expected_faction = String(snapshot.get("defenderFactionId"))
		if _non_empty_string(unit.get("factionId")) and not expected_faction.is_empty() and String(unit.get("factionId")) != expected_faction:
			_issue(issues, "units.%s.factionId" % unit_id, "does not match its side faction")
		if not _is_integer(unit.get("troops")) or int(unit.get("troops")) < 0: _issue(issues, "units.%s.troops" % unit_id, "must be non-negative")
		if not _is_exact_integer(unit.get("armsType")) or int(unit.get("armsType")) < 0 or int(unit.get("armsType")) >= 6: _issue(issues, "units.%s.armsType" % unit_id, "must be an integer from 0 to 5")
		if not _is_exact_integer(unit.get("mobility")) or int(unit.get("mobility")) < 0 or int(unit.get("mobility")) > 8: _issue(issues, "units.%s.mobility" % unit_id, "must be an integer from 0 to 8")
		for attribute: String in ["force", "intelligence", "level"]:
			if not _is_exact_integer(unit.get(attribute)) or int(unit.get(attribute)) < 0 or int(unit.get(attribute)) > 255:
				_issue(issues, "units.%s.%s" % [unit_id, attribute], "must be an integer from 0 to 255")
		var status_value: Variant = unit.get("status", "")
		if (typeof(status_value) != TYPE_STRING and typeof(status_value) != TYPE_STRING_NAME) or not ["normal", "confused", "silenced", "rooted", "qimen", "dunjia", "stone-array", "hidden"].has(String(status_value)):
			_issue(issues, "units.%s.status" % unit_id, "must be a supported tactical status string")
		if not _is_integer(unit.get("slotX")) or not _is_integer(unit.get("slotY")): _issue(issues, "units.%s.slot" % unit_id, "must have integer slot coordinates")
		if not typeof(unit.get("deployed")) == TYPE_BOOL: _issue(issues, "units.%s.deployed" % unit_id, "must be boolean")
		if not typeof(unit.get("acted")) == TYPE_BOOL: _issue(issues, "units.%s.acted" % unit_id, "must be boolean")
		if not typeof(unit.get("moved")) == TYPE_BOOL: _issue(issues, "units.%s.moved" % unit_id, "must be boolean")
	known_ids.sort()
	if typeof(snapshot.get("actedUnitIds")) != TYPE_ARRAY: return
	var acted: Array = snapshot.get("actedUnitIds")
	for raw_acted: Variant in acted:
		if _non_empty_string(raw_acted) and not units.has(String(raw_acted)): _issue(issues, "actedUnitIds", "references unknown unit")


static func _validate_deployment(snapshot: Dictionary, issues: Array[Dictionary]) -> void:
	if typeof(snapshot.get("deployment")) != TYPE_DICTIONARY: return
	var deployment: Dictionary = snapshot.get("deployment", {})
	var units: Dictionary = snapshot.get("units", {})
	for raw_key in units.keys():
		if typeof(raw_key) != TYPE_STRING: return
	var seen_units: Dictionary = {}
	var seen_slots: Dictionary = {}
	for side: String in ["attacker", "defender"]:
		if typeof(deployment.get(side)) != TYPE_ARRAY:
			_issue(issues, "deployment.%s" % side, "must be an array")
			continue
		var deployment_ids: Array[String] = []
		for index: int in range(deployment[side].size()):
			if typeof(deployment[side][index]) != TYPE_DICTIONARY:
				_issue(issues, "deployment.%s[%d]" % [side, index], "must be an object")
				continue
			var entry: Dictionary = deployment[side][index]
			if not _non_empty_string(entry.get("unitId")):
				_issue(issues, "deployment.%s[%d].unitId" % [side, index], "must be a non-empty string")
				continue
			var unit_id := String(entry.get("unitId"))
			deployment_ids.append(unit_id)
			if not units.has(unit_id):
				_issue(issues, "deployment.%s[%d]" % [side, index], "references unknown unit")
				continue
			if typeof(units[unit_id]) != TYPE_DICTIONARY:
				_issue(issues, "deployment.%s[%d]" % [side, index], "references a malformed unit")
				continue
			var unit: Dictionary = units[unit_id]
			if unit.get("side") != side: _issue(issues, "deployment.%s[%d]" % [side, index], "references the wrong side")
			if typeof(unit.get("deployed")) != TYPE_BOOL or not bool(unit.get("deployed")):
				_issue(issues, "deployment.%s[%d]" % [side, index], "references an undeployed unit")
			var entry_x_ok := _is_exact_integer(entry.get("slotX")); var entry_y_ok := _is_exact_integer(entry.get("slotY"))
			var unit_x_ok := _is_exact_integer(unit.get("slotX")); var unit_y_ok := _is_exact_integer(unit.get("slotY"))
			if not entry_x_ok: _issue(issues, "deployment.%s[%d].slotX" % [side, index], "must be an integer")
			if not entry_y_ok: _issue(issues, "deployment.%s[%d].slotY" % [side, index], "must be an integer")
			if not unit_x_ok: _issue(issues, "units.%s.slotX" % unit_id, "must be an integer")
			if not unit_y_ok: _issue(issues, "units.%s.slotY" % unit_id, "must be an integer")
			if entry_x_ok and entry_y_ok and unit_x_ok and unit_y_ok:
				var slot_x := int(entry.get("slotX")); var slot_y := int(entry.get("slotY"))
				if slot_x != int(unit.get("slotX")) or slot_y != int(unit.get("slotY")):
					_issue(issues, "deployment.%s[%d]" % [side, index], "slot does not match the unit")
				if slot_x < 0 or slot_x >= 12 or slot_y < 0 or slot_y >= 8:
					_issue(issues, "deployment.%s[%d]" % [side, index], "slot is outside the battlefield")
				if snapshot.get("phase") == "deployment" and _non_empty_string(snapshot.get("approach")) and not _slot_allowed(String(snapshot.get("approach")), side, slot_x, slot_y):
					_issue(issues, "deployment.%s[%d]" % [side, index], "slot is outside the side deployment zone")
				var slot_key := "%d,%d" % [slot_x, slot_y]
				if seen_slots.has(slot_key): _issue(issues, "deployment", "must not contain duplicate slots")
				seen_slots[slot_key] = true
			if seen_units.has(unit_id): _issue(issues, "deployment", "must not contain duplicate units")
			seen_units[unit_id] = true
		var sorted_deployment_ids := deployment_ids.duplicate(); sorted_deployment_ids.sort()
		if deployment_ids != sorted_deployment_ids: _issue(issues, "deployment.%s" % side, "must be sorted by unitId")
	for raw_id: Variant in _sorted_keys(units):
		if typeof(units[raw_id]) != TYPE_DICTIONARY: continue
		var unit: Dictionary = units[raw_id]
		if typeof(unit.get("deployed")) == TYPE_BOOL and bool(unit.get("deployed")) and not seen_units.has(String(raw_id)):
			_issue(issues, "units.%s" % String(raw_id), "deployed unit is missing from deployment")
		if typeof(unit.get("deployed")) == TYPE_BOOL and bool(unit.get("deployed")) and _is_exact_integer(unit.get("slotX")) and _is_exact_integer(unit.get("slotY")):
			var x := int(unit.get("slotX")); var y := int(unit.get("slotY"))
			if x < 0 or x >= 12 or y < 0 or y >= 8:
				_issue(issues, "units.%s.slot" % String(raw_id), "deployed slot is outside the battlefield")


static func _validate_roster(snapshot: Dictionary, issues: Array[Dictionary]) -> void:
	var units: Dictionary = snapshot.get("units", {})
	for raw_key in units.keys():
		if typeof(raw_key) != TYPE_STRING: return
	for side: String in ["attacker", "defender"]:
		var roster: Variant = snapshot.get("%sOfficerIds" % side, [])
		if typeof(roster) != TYPE_ARRAY: continue
		for raw_id in roster:
			if not _non_empty_string(raw_id):
				_issue(issues, "%sOfficerIds" % side, "must contain only non-empty strings")
				continue
			var officer_id := String(raw_id); var unit_id := "officer:%s" % officer_id
			if not units.has(unit_id):
				_issue(issues, "%sOfficerIds" % side, "references missing officer unit")
				continue
			if typeof(units[unit_id]) != TYPE_DICTIONARY:
				_issue(issues, unit_id, "roster references a malformed unit")
				continue
			var unit: Dictionary = units[unit_id]
			if unit.get("side") != side: _issue(issues, unit_id, "roster side does not match unit side")
			if _non_empty_string(unit.get("officerId")) and String(unit.get("officerId")) != officer_id: _issue(issues, unit_id, "officer id does not match roster")
	for raw_id in _sorted_keys(units):
		if typeof(units[raw_id]) != TYPE_DICTIONARY: continue
		var unit: Dictionary = units[raw_id]
		if not _non_empty_string(unit.get("officerId")): continue
		var officer_id := String(unit.get("officerId"))
		if officer_id.is_empty(): continue
		if not _non_empty_string(unit.get("side")): continue
		var side := String(unit.get("side"))
		var roster: Variant = snapshot.get("%sOfficerIds" % side, [])
		if typeof(roster) != TYPE_ARRAY or not roster.has(officer_id): _issue(issues, raw_id, "officer unit is missing from roster")


static func _validate_acted(snapshot: Dictionary, issues: Array[Dictionary]) -> void:
	if typeof(snapshot.get("actedUnitIds")) != TYPE_ARRAY: return
	var units: Dictionary = snapshot.get("units", {}); var acted: Array = snapshot.get("actedUnitIds", []); var acted_set: Dictionary = {}
	for raw_key in units.keys():
		if typeof(raw_key) != TYPE_STRING: return
	for raw_id in acted:
		if _non_empty_string(raw_id): acted_set[String(raw_id)] = true
	for raw_id in _sorted_keys(units):
		if typeof(units[raw_id]) != TYPE_DICTIONARY: continue
		var unit: Dictionary = units[raw_id]
		if typeof(unit.get("acted")) == TYPE_BOOL and bool(unit.get("acted")) != acted_set.has(String(raw_id)):
			_issue(issues, "actedUnitIds", "does not match unit acted flags")


static func _validate_guard(snapshot: Dictionary, guard: Dictionary, issues: Array[Dictionary]) -> void:
	if not _is_exact_integer(guard.get("version")):
		_issue(issues, "guard.version", "must be the integer 2")
	elif int(guard.get("version")) != 2: _issue(issues, "guard.version", "must be 2")
	for key: String in ["strategicFingerprint", "sourceCityId", "targetCityId"]:
		if not _non_empty_string(guard.get(key)): _issue(issues, "guard.%s" % key, "must be a non-empty string")
	if _non_empty_string(guard.get("sourceCityId")) and _non_empty_string(snapshot.get("sourceCityId")) and guard.get("sourceCityId") != snapshot.get("sourceCityId"): _issue(issues, "guard.sourceCityId", "must match the battle source city")
	if _non_empty_string(guard.get("targetCityId")) and _non_empty_string(snapshot.get("targetCityId")) and guard.get("targetCityId") != snapshot.get("targetCityId"): _issue(issues, "guard.targetCityId", "must match the battle target city")
	for key: String in ["sourceFood", "targetFood", "targetDefense", "targetReserveTroops"]:
		if not _is_integer(guard.get(key)) or int(guard.get(key)) < 0: _issue(issues, "guard.%s" % key, "must be a non-negative integer")
	if typeof(guard.get("participants")) != TYPE_ARRAY: _issue(issues, "guard.participants", "must be an array")
	else:
		var ids: Array[String] = []
		for index in range(guard["participants"].size()):
			if typeof(guard["participants"][index]) != TYPE_DICTIONARY:
				_issue(issues, "guard.participants[%d]" % index, "must be an object")
				continue
			var participant: Dictionary = guard["participants"][index]
			if not _non_empty_string(participant.get("officerId")): _issue(issues, "guard.participants[%d].officerId" % index, "must be a non-empty string")
			if typeof(participant.get("equipmentKey")) != TYPE_STRING: _issue(issues, "guard.participants[%d].equipmentKey" % index, "must be a string")
			if not participant.has("equipmentKeyEncoding") or typeof(participant.get("equipmentKeyEncoding")) != TYPE_STRING or participant.get("equipmentKeyEncoding") != "pipe-v1": _issue(issues, "guard.participants[%d].equipmentKeyEncoding" % index, "must be explicitly pipe-v1")
			if _non_empty_string(participant.get("officerId")): ids.append(String(participant.get("officerId")))
		var sorted_ids := ids.duplicate(); sorted_ids.sort()
		if ids != sorted_ids: _issue(issues, "guard.participants", "must be sorted by officerId")
		if ids != _unique_sorted(ids): _issue(issues, "guard.participants", "must not contain duplicate officerId")


static func _validate_terminal_invariants(snapshot: Dictionary, issues: Array[Dictionary]) -> void:
	if snapshot.get("status") != "ongoing": return
	var units: Variant = snapshot.get("units")
	if typeof(units) != TYPE_DICTIONARY: return
	var defender_alive := false
	for raw_id in units.keys():
		if typeof(units[raw_id]) != TYPE_DICTIONARY: continue
		var unit: Dictionary = units[raw_id]
		if not _is_exact_integer(unit.get("troops")): continue
		if unit.get("side") == "defender" and int(unit.get("troops")) > 0:
			defender_alive = true
			break
	if not defender_alive: _issue(issues, "status", "ongoing battle must have defender troops or be ended")
	if _is_exact_integer(snapshot.get("day")) and _is_exact_integer(snapshot.get("maxDays")) and int(snapshot.get("day")) > int(snapshot.get("maxDays")):
		_issue(issues, "day", "ongoing battle cannot exceed maxDays")


static func _validate_optional_attack_fields(snapshot: Dictionary, issues: Array[Dictionary]) -> void:
	var units_value: Variant = snapshot.get("units", {})
	if typeof(units_value) != TYPE_DICTIONARY:
		return
	var units: Dictionary = units_value
	if snapshot.has("commanderUnitIds"):
		if typeof(snapshot.get("commanderUnitIds")) != TYPE_DICTIONARY:
			_issue(issues, "commanderUnitIds", "must be an object")
		else:
			var commanders: Dictionary = snapshot["commanderUnitIds"]
			for side: String in ["attacker", "defender"]:
				var commander: Variant = commanders.get(side, "")
				var commander_is_string := typeof(commander) == TYPE_STRING or typeof(commander) == TYPE_STRING_NAME
				var commander_unit: Variant = units.get(String(commander), null) if commander_is_string else null
				if not commander_is_string or (not String(commander).is_empty() and (typeof(commander_unit) != TYPE_DICTIONARY or commander_unit.get("side") != side)):
					_issue(issues, "commanderUnitIds.%s" % side, "must be an empty string or same-side unit id")
	if snapshot.has("experienceGains"):
		if typeof(snapshot.get("experienceGains")) != TYPE_DICTIONARY:
			_issue(issues, "experienceGains", "must be an object")
		else:
			for raw_id: Variant in snapshot["experienceGains"].keys():
				if (typeof(raw_id) != TYPE_STRING and typeof(raw_id) != TYPE_STRING_NAME) or String(raw_id).is_empty() or not _is_exact_integer(snapshot["experienceGains"][raw_id]) or int(snapshot["experienceGains"][raw_id]) < 0:
					_issue(issues, "experienceGains", "keys must be non-empty strings with non-negative integer values")
	for raw_key: Variant in units.keys():
		var raw_id := str(raw_key)
		var unit: Variant = units[raw_key]
		if typeof(unit) != TYPE_DICTIONARY or not unit.has("normalAttackPatternOverride"): continue
		var override: Variant = unit.get("normalAttackPatternOverride")
		if (typeof(override) != TYPE_STRING and typeof(override) != TYPE_STRING_NAME) or not ["orthogonal-adjacent", "adjacent-eight", "manhattan-ring-two"].has(String(override)):
			_issue(issues, "units.%s.normalAttackPatternOverride" % raw_id, "must be a supported attack pattern")


static func _slot_allowed(approach: String, side: String, x: int, y: int) -> bool:
	if approach == "east": return x <= 3 if side == "attacker" else x >= 8
	if approach == "west": return x >= 8 if side == "attacker" else x <= 3
	if approach == "south": return y <= 3 if side == "attacker" else y >= 4
	return y >= 4 if side == "attacker" else y <= 3


static func _sorted_keys(value: Dictionary) -> Array:
	var result: Array = []
	for raw_key in value.keys(): result.append(str(raw_key))
	result.sort()
	return result


static func _validate_sorted_strings(value: Variant, path: String, issues: Array[Dictionary]) -> void:
	if typeof(value) != TYPE_ARRAY: return
	var values: Array[String] = []
	for item in value:
		if _non_empty_string(item): values.append(String(item))
	var sorted := values.duplicate(); sorted.sort()
	if values != sorted: _issue(issues, path, "must be sorted")


static func _unique_sorted(value: Array) -> Array:
	var result: Array = []
	for item in value:
		if not result.has(item): result.append(item)
	result.sort()
	return result


static func _validate_unique_strings(value: Variant, path: String, issues: Array[Dictionary]) -> void:
	if typeof(value) != TYPE_ARRAY: return
	var seen: Dictionary = {}
	for index: int in range(value.size()):
		var item: Variant = value[index]
		if not _non_empty_string(item):
			_issue(issues, "%s[%d]" % [path, index], "must be a non-empty string")
			continue
		var text := String(item)
		if seen.has(text): _issue(issues, path, "must not contain duplicates")
		seen[text] = true


static func _is_exact_integer(value: Variant) -> bool:
	return typeof(value) == TYPE_INT or (typeof(value) == TYPE_FLOAT and is_finite(float(value)) and float(value) == floor(float(value)))


static func _is_integer(value: Variant) -> bool:
	return _is_exact_integer(value)


static func _non_empty_string(value: Variant) -> bool:
	return (typeof(value) == TYPE_STRING or typeof(value) == TYPE_STRING_NAME) and not String(value).is_empty()


static func _issue(issues: Array[Dictionary], path: String, message: String) -> void:
	issues.append({"path": path, "message": "%s: %s" % [path, message]})
