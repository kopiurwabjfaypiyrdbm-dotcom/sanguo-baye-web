extends RefCounted

const Rulesets = preload("res://src/domain/rules/campaign_rulesets.gd")
const ShapeValidator = preload("res://src/domain/validation/game_state_shape_validator.gd")

const UINT32_MAX: int = 0xffff_ffff
const JS_MAX_SAFE_INTEGER: int = 9_007_199_254_740_991
const EQUIPMENT_LIMIT: int = 2
const SUPPORTED_DATA_CONTRACT_VERSIONS: Array[int] = [1, 2]
const INITIAL_PHASE: String = "player"
const OFFICER_STATUSES: Array[String] = ["serving", "free", "hidden", "captive", "dead"]
const DEATH_CAUSES: Array[String] = ["battle-death", "natural-death", "execution"]
const LOG_KINDS: Array[String] = ["system", "map", "turn", "battle", "ai"]
const CITY_CONDITIONS: Array[String] = ["normal", "famine", "drought", "flood", "rebellion"]


static func validate(state: Dictionary) -> Array[Dictionary]:
	return validate_initial(state)


static func validate_initial(state: Dictionary) -> Array[Dictionary]:
	return _validate(state, true)


static func validate_runtime(state: Dictionary) -> Array[Dictionary]:
	return _validate(state, false)


static func _validate(state: Dictionary, initial_contract: bool) -> Array[Dictionary]:
	var issues: Array[Dictionary] = ShapeValidator.validate(state)

	var data_contract_version: int = int(state.get("dataContractVersion", -1)) \
			if _is_integer_number(state.get("dataContractVersion")) else -1
	if not SUPPORTED_DATA_CONTRACT_VERSIONS.has(data_contract_version):
		_add(issues, "dataContractVersion", "must be a supported initial-state data contract")
	if not _is_integer_number(state.get("schemaVersion")) or int(state.get("schemaVersion", -1)) != 6:
		_add(issues, "schemaVersion", "must be 6")

	var ruleset_id: String = ""
	if _is_non_blank_string(state.get("rulesetId")):
		ruleset_id = state["rulesetId"]
		if not Rulesets.is_supported(ruleset_id):
			_add(issues, "rulesetId", "must be a supported campaign ruleset")
	else:
		_add(issues, "rulesetId", "must be a non-blank string")

	if not _is_positive_integer(state.get("turn")):
		_add(issues, "turn", "must be a positive integer")
	elif initial_contract and int(state["turn"]) != 1:
		_add(issues, "turn", "must remain 1 in the initial-state contract")
	if not _is_integer_number(state.get("rngSeed")) \
			or int(state.get("rngSeed", -1)) < 0 \
			or int(state.get("rngSeed", -1)) > UINT32_MAX:
		_add(issues, "rngSeed", "must be an unsigned 32-bit integer")
	if typeof(state.get("campaignStarted")) != TYPE_BOOL:
		_add(issues, "campaignStarted", "must be a boolean")

	var phase: String = ""
	if typeof(state.get("phase")) == TYPE_STRING:
		phase = state["phase"]
	if initial_contract and phase != INITIAL_PHASE:
		_add(issues, "phase", "must remain player in the initial-state contract")
	elif not initial_contract and phase != "player":
		_add(issues, "phase", "is not supported by the current runtime validator")
	if initial_contract and state.has("pendingSuccession") and state["pendingSuccession"] != null:
		_add(issues, "pendingSuccession", "is outside the initial-state contract")
	if initial_contract and state.has("outcome") and state["outcome"] != null:
		_add(issues, "outcome", "is outside the initial-state contract")
	if not initial_contract:
		_validate_runtime_phase_fields(state, phase, issues)

	_validate_calendar(state.get("calendar"), data_contract_version, initial_contract, issues)
	_validate_lifecycle_policy(state.get("lifecyclePolicy"), initial_contract, issues)

	var factions: Dictionary = _record_or_issue(state.get("factions"), "factions", issues)
	var cities: Dictionary = _record_or_issue(state.get("cities"), "cities", issues)
	var officers: Dictionary = _record_or_issue(state.get("officers"), "officers", issues)
	var items: Dictionary = _record_or_issue(state.get("items"), "items", issues)
	var arms_types: Dictionary = _record_or_issue(state.get("armsTypes"), "armsTypes", issues)
	var strategic_orders: Dictionary = _record_or_issue(
		state.get("strategicOrders"), "strategicOrders", issues
	)
	var diplomatic_orders: Dictionary = _record_or_issue(
		state.get("diplomaticOrders"), "diplomaticOrders", issues
	)
	var intel_reports: Dictionary = _record_or_issue(
		state.get("intelReports"), "intelReports", issues
	)
	if initial_contract:
		_validate_empty_spike_record(strategic_orders, "strategicOrders", issues)
		_validate_empty_spike_record(diplomatic_orders, "diplomaticOrders", issues)
		_validate_empty_spike_record(intel_reports, "intelReports", issues)
	else:
		_validate_strategic_orders(strategic_orders, factions, cities, officers, state, issues)
		_validate_empty_runtime_record(diplomatic_orders, "diplomaticOrders", issues)
		_validate_intel_reports(intel_reports, cities, officers, state, issues)

	_validate_exact_order(state.get("cityOrder"), "cityOrder", cities, issues)
	_validate_exact_order(state.get("officerOrder"), "officerOrder", officers, issues)
	_validate_exact_order(state.get("itemOrder"), "itemOrder", items, issues)
	_validate_exact_order(state.get("armsTypeOrder"), "armsTypeOrder", arms_types, issues)
	_validate_faction_order(state.get("factionOrder"), factions, issues)

	var player_faction_id: String = _required_reference(
		state.get("playerFactionId"), "playerFactionId", factions, issues
	)
	var active_faction_id: String = _required_reference(
		state.get("activeFactionId"), "activeFactionId", factions, issues
	)
	if (phase == "player" or phase == "succession") \
			and not player_faction_id.is_empty() \
			and active_faction_id != player_faction_id:
		_add(issues, "activeFactionId", "must be the player faction during the player phase")

	_validate_factions(factions, cities, officers, player_faction_id, issues)
	var active_order_officers: Dictionary = _validate_active_orders(
		strategic_orders, diplomatic_orders, factions, cities, officers, issues
	)

	var item_locations: Dictionary = {}
	var graph_facts: Dictionary = _validate_cities(
		cities, factions, officers, items, item_locations, issues
	)
	_validate_officers(
		officers, factions, cities, arms_types, items, active_order_officers,
		item_locations, state, initial_contract, issues
	)
	_validate_items(items, arms_types, cities, issues)
	_validate_arms_types(arms_types, issues)
	_validate_logs(state.get("logs"), issues)
	_validate_id_list(state.get("actedOfficerIds"), "actedOfficerIds", officers, issues)
	_validate_id_list(state.get("discoveredOfficerIds"), "discoveredOfficerIds", officers, issues)
	if typeof(state.get("discoveredOfficerIds")) == TYPE_ARRAY:
		var discovered: Array = state["discoveredOfficerIds"]
		if initial_contract and not discovered.is_empty():
			_add(issues, "discoveredOfficerIds", "must remain empty in the initial-state contract")
		for raw_officer_id: Variant in discovered:
			var officer_id: String = str(raw_officer_id)
			if officers.has(officer_id) and typeof(officers[officer_id]) == TYPE_DICTIONARY \
					and (officers[officer_id] as Dictionary).get("status", "") != "free":
				_add(issues, "discoveredOfficerIds", "officer is not free: %s" % officer_id)
	_validate_serial(state.get("nextStrategicOrderSerial"), "nextStrategicOrderSerial", initial_contract, issues)
	_validate_serial(state.get("nextDiplomaticOrderSerial"), "nextDiplomaticOrderSerial", initial_contract, issues)
	_validate_graph(state.get("graph"), cities, graph_facts, issues)

	return issues


static func first_error(issues: Array[Dictionary]) -> String:
	if issues.is_empty():
		return ""
	var issue: Dictionary = issues[0]
	return "Invalid game state at %s: %s" % [issue.get("path", "?"), issue.get("message", "invalid")]


static func _validate_runtime_phase_fields(
		state: Dictionary, phase: String, issues: Array[Dictionary]
) -> void:
	var pending: Variant = state.get("pendingSuccession")
	if pending != null:
		_add(issues, "pendingSuccession", "is not supported by the current runtime validator")
	var outcome: Variant = state.get("outcome")
	if outcome != null:
		_add(issues, "outcome", "is not supported by the current runtime validator")


static func _validate_intel_reports(
		reports: Dictionary, cities: Dictionary, officers: Dictionary,
		state: Dictionary, issues: Array[Dictionary]
) -> void:
	for city_id: String in _sorted_string_keys(reports):
		var path: String = "intelReports.%s" % city_id
		var raw: Variant = reports[city_id]
		if typeof(raw) != TYPE_DICTIONARY:
			_add(issues, path, "must be an object")
			continue
		var report: Dictionary = raw
		if report.get("cityId") != city_id:
			_add(issues, "%s.cityId" % path, "must match record key")
		if not cities.has(city_id):
			_add(issues, "%s.cityId" % path, "unknown city: %s" % city_id)
		for field: String in [
			"observedTurn", "observedYear", "observedMonth", "population", "money", "food",
			"reserveTroops", "farming", "commerce", "defense", "officerCount", "totalTroops",
		]:
			_validate_non_negative_integer(report.get(field), "%s.%s" % [path, field], issues)
		if _is_integer_number(report.get("observedTurn")):
			if int(report["observedTurn"]) == 0:
				_add(issues, "%s.observedTurn" % path, "must be a positive integer")
			elif _is_integer_number(state.get("turn")) \
					and int(report["observedTurn"]) > int(state["turn"]):
				_add(issues, "%s.observedTurn" % path, "must not be later than the current turn")
		if _is_integer_number(report.get("observedYear")) and int(report["observedYear"]) == 0:
			_add(issues, "%s.observedYear" % path, "must be a positive integer")
		if _is_integer_number(report.get("observedMonth")) \
				and (int(report["observedMonth"]) < 1 or int(report["observedMonth"]) > 12):
			_add(issues, "%s.observedMonth" % path, "must be from 1 to 12")
		if _is_integer_number(report.get("observedYear")) and _is_integer_number(report.get("observedMonth")):
			var raw_calendar: Variant = state.get("calendar", {})
			var calendar: Dictionary = raw_calendar if raw_calendar is Dictionary else {}
			if _is_integer_number(calendar.get("year")) and _is_integer_number(calendar.get("month")) \
					and int(report["observedYear"]) * 12 + int(report["observedMonth"]) \
					> int(calendar.get("year", 0)) * 12 + int(calendar.get("month", 0)):
				_add(issues, "%s.observedYear" % path, "observation date must not be later than the current calendar")
		if report.has("publicLoyalty"):
			_validate_non_negative_integer(report["publicLoyalty"], "%s.publicLoyalty" % path, issues)
		if report.has("satrapName") and typeof(report["satrapName"]) != TYPE_STRING:
			_add(issues, "%s.satrapName" % path, "must be a string when present")
		if report.has("officerIds"):
			if typeof(report["officerIds"]) != TYPE_ARRAY:
				_add(issues, "%s.officerIds" % path, "must be an array when present")
			else:
				var officer_ids: Array = report["officerIds"]
				var seen: Dictionary = {}
				for index: int in range(officer_ids.size()):
					var raw_officer_id: Variant = officer_ids[index]
					if typeof(raw_officer_id) != TYPE_STRING:
						_add(issues, "%s.officerIds" % path, "must contain only strings")
						continue
					var officer_id: String = raw_officer_id
					if seen.has(officer_id):
						_add(issues, "%s.officerIds" % path, "contains duplicate officer ids")
					seen[officer_id] = true
					if not officers.has(officer_id):
						_add(issues, "%s.officerIds" % path, "unknown officer: %s" % officer_id)
				if _is_integer_number(report.get("officerCount")) \
						and officer_ids.size() != int(report["officerCount"]):
					_add(issues, "%s.officerIds" % path, "must agree with officerCount")


static func _validate_calendar(
		raw: Variant, contract_version: int, initial_contract: bool, issues: Array[Dictionary]
) -> void:
	if typeof(raw) != TYPE_DICTIONARY:
		_add(issues, "calendar", "must be an object")
		return
	var calendar: Dictionary = raw
	if not _is_positive_integer(calendar.get("year")):
		_add(issues, "calendar.year", "must be a positive integer")
	if not _is_integer_number(calendar.get("month")) \
			or int(calendar.get("month", 0)) < 1 \
			or int(calendar.get("month", 0)) > 12:
		_add(issues, "calendar.month", "must be an integer from 1 to 12")
	if initial_contract and contract_version == 1 and _is_integer_number(calendar.get("year")) and int(calendar["year"]) != 190:
		_add(issues, "calendar.year", "must remain 190 in the spike contract")
	if initial_contract and _is_integer_number(calendar.get("month")) and int(calendar["month"]) != 1:
		_add(issues, "calendar.month", "must remain 1 in the initial-state contract")


static func _validate_lifecycle_policy(
		raw: Variant, initial_contract: bool, issues: Array[Dictionary]
) -> void:
	if typeof(raw) != TYPE_DICTIONARY:
		_add(issues, "lifecyclePolicy", "must be an object")
		return
	var policy: Dictionary = raw
	if not _is_integer_number(policy.get("version")) or int(policy.get("version", 0)) != 1:
		_add(issues, "lifecyclePolicy.version", "must be 1")
	if not ["enabled", "disabled"].has(policy.get("ageGrowth")):
		_add(issues, "lifecyclePolicy.ageGrowth", "must be enabled or disabled")
	if not ["disabled", "age-90-coinflip"].has(policy.get("naturalDeath")):
		_add(issues, "lifecyclePolicy.naturalDeath", "must be a supported policy")
	if not ["disabled", "baye-rare"].has(policy.get("battleDeath")):
		_add(issues, "lifecyclePolicy.battleDeath", "must be a supported policy")
	if not ["disabled", "modern-monthly"].has(policy.get("captiveEscape")):
		_add(issues, "lifecyclePolicy.captiveEscape", "must be a supported policy")
	if initial_contract and (policy.get("ageGrowth") != "enabled" \
			or policy.get("naturalDeath") != "disabled" \
			or policy.get("battleDeath") != "disabled" \
			or policy.get("captiveEscape") != "disabled"):
		_add(issues, "lifecyclePolicy", "must remain at the supported initial-state defaults")


static func _validate_factions(
		factions: Dictionary,
		cities: Dictionary,
		officers: Dictionary,
		player_faction_id: String,
		issues: Array[Dictionary],
) -> void:
	var player_flags: int = 0
	for key: String in _sorted_string_keys(factions):
		var path: String = "factions.%s" % key
		var raw: Variant = factions[key]
		if typeof(raw) != TYPE_DICTIONARY:
			_add(issues, path, "must be an object")
			continue
		var faction: Dictionary = raw
		_validate_record_id(faction, key, path, issues)
		_require_non_blank_string(faction, "name", path, issues)
		_require_non_blank_string(faction, "color", path, issues)
		var ruler_id: String = _required_reference(
			faction.get("rulerOfficerId"), "%s.rulerOfficerId" % path, officers, issues
		)
		if typeof(faction.get("isPlayer")) != TYPE_BOOL:
			_add(issues, "%s.isPlayer" % path, "must be a boolean")
		elif faction["isPlayer"]:
			player_flags += 1
			if key != player_faction_id:
				_add(issues, "%s.isPlayer" % path, "must match playerFactionId")
		if faction.has("isNeutral") and typeof(faction["isNeutral"]) != TYPE_BOOL:
			_add(issues, "%s.isNeutral" % path, "must be a boolean")
		if not ruler_id.is_empty() and officers.has(ruler_id):
			var raw_ruler: Variant = officers[ruler_id]
			if typeof(raw_ruler) == TYPE_DICTIONARY:
				var ruler: Dictionary = raw_ruler
				var faction_owns_city: bool = false
				for city_id: String in _sorted_string_keys(cities):
					if typeof(cities[city_id]) == TYPE_DICTIONARY \
							and (cities[city_id] as Dictionary).get("ownerId") == key:
						faction_owns_city = true
						break
				if not bool(faction.get("isNeutral", false)) and faction_owns_city \
						and ruler.get("factionId") != key:
					_add(issues, "%s.rulerOfficerId" % path, "ruler must belong to the faction")
				elif not bool(faction.get("isNeutral", false)) and faction_owns_city \
						and ruler.get("status") != "serving":
					_add(issues, "%s.rulerOfficerId" % path, "non-neutral ruler must be serving")
	if not player_faction_id.is_empty() and player_flags != 1:
		_add(issues, "factions", "must contain exactly one player faction")


static func _validate_active_orders(
		strategic_orders: Dictionary,
		diplomatic_orders: Dictionary,
		factions: Dictionary,
		cities: Dictionary,
		officers: Dictionary,
		issues: Array[Dictionary],
) -> Dictionary:
	var officer_orders: Dictionary = {}
	for descriptor: Dictionary in [
		{"name": "strategicOrders", "record": strategic_orders},
		{"name": "diplomaticOrders", "record": diplomatic_orders},
	]:
		var record_name: String = descriptor["name"]
		var record: Dictionary = descriptor["record"]
		for key: String in _sorted_string_keys(record):
			var path: String = "%s.%s" % [record_name, key]
			var raw: Variant = record[key]
			if typeof(raw) != TYPE_DICTIONARY:
				_add(issues, path, "must be an object")
				continue
			var order: Dictionary = raw
			_validate_record_id(order, key, path, issues)
			_required_reference(order.get("factionId"), "%s.factionId" % path, factions, issues)
			var officer_id: String = _required_reference(
				order.get("officerId"), "%s.officerId" % path, officers, issues
			)
			if not officer_id.is_empty():
				if officer_orders.has(officer_id):
					_add(issues, "%s.officerId" % path, "officer already has an active order")
				else:
					officer_orders[officer_id] = key
			for city_field: String in ["sourceCityId", "targetCityId"]:
				if order.has(city_field):
					_required_reference(
						order.get(city_field), "%s.%s" % [path, city_field], cities, issues
					)
	return officer_orders


static func _validate_strategic_orders(
		orders: Dictionary, factions: Dictionary, cities: Dictionary, officers: Dictionary,
		state: Dictionary, issues: Array[Dictionary]
) -> void:
	var highest_serial: int = 0
	for key: String in _sorted_string_keys(orders):
		var path: String = "strategicOrders.%s" % key
		var raw: Variant = orders[key]
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var order: Dictionary = raw
		if not _is_strategic_order_id(key):
			_add(issues, "%s.id" % path, "must use strategic-order-N format")
		else:
			highest_serial = maxi(highest_serial, int(key.trim_prefix("strategic-order-")))
		if not ["move", "transport"].has(order.get("kind")):
			_add(issues, "%s.kind" % path, "must be move or transport")
		var faction_id: String = str(order.get("factionId", ""))
		var officer_id: String = str(order.get("officerId", ""))
		if factions.has(faction_id) and officers.has(officer_id) \
				and typeof(officers[officer_id]) == TYPE_DICTIONARY:
			var officer: Dictionary = officers[officer_id]
			if officer.get("status") != "serving" or officer.get("factionId") != faction_id:
				_add(issues, "%s.officerId" % path, "executor must be a serving officer of the order faction")
		for field: String in ["createdTurn", "createdYear", "durationMonths", "remainingMonths"]:
			if not _is_positive_integer(order.get(field)):
				_add(issues, "%s.%s" % [path, field], "must be a positive integer")
		if _is_positive_integer(order.get("durationMonths")) and _is_positive_integer(order.get("remainingMonths")) \
				and int(order["remainingMonths"]) > int(order["durationMonths"]):
			_add(issues, "%s.remainingMonths" % path, "must not exceed durationMonths")
		if not _is_integer_number(order.get("createdMonth")) or int(order.get("createdMonth", 0)) < 1 \
				or int(order.get("createdMonth", 0)) > 12:
			_add(issues, "%s.createdMonth" % path, "must be an integer from 1 to 12")
		if _is_positive_integer(order.get("createdTurn")) and int(order["createdTurn"]) > int(state.get("turn", 0)):
			_add(issues, "%s.createdTurn" % path, "must not be later than the current turn")
		if _is_positive_integer(order.get("createdYear")) and _is_integer_number(order.get("createdMonth")) \
				and int(order["createdYear"]) * 12 + int(order["createdMonth"]) \
				> int(state.get("calendar", {}).get("year", 0)) * 12 + int(state.get("calendar", {}).get("month", 0)):
			_add(issues, "%s.createdYear" % path, "creation date must not be later than the current calendar")
		if _is_positive_integer(order.get("createdTurn")) and _is_positive_integer(order.get("durationMonths")) \
				and _is_positive_integer(order.get("remainingMonths")):
			var elapsed_turns: int = int(state.get("turn", 0)) - int(order["createdTurn"])
			if int(order["remainingMonths"]) != int(order["durationMonths"]) - elapsed_turns:
				_add(issues, "%s.remainingMonths" % path, "must agree with durationMonths and elapsed campaign turns")
			if _is_positive_integer(order.get("createdYear")) and _is_integer_number(order.get("createdMonth")):
				var created_calendar_index: int = int(order["createdYear"]) * 12 + int(order["createdMonth"]) - 1
				var calendar: Dictionary = state.get("calendar", {})
				var current_calendar_index: int = int(calendar.get("year", 0)) * 12 + int(calendar.get("month", 0)) - 1
				if current_calendar_index - created_calendar_index != elapsed_turns:
					_add(issues, "%s.createdYear" % path, "creation date must agree with createdTurn and the current calendar")
		var source_id: String = str(order.get("sourceCityId", ""))
		var target_id: String = str(order.get("targetCityId", ""))
		if source_id == target_id and not source_id.is_empty():
			_add(issues, "%s.targetCityId" % path, "must differ from sourceCityId")
		var raw_route: Variant = order.get("routeCityIds")
		if typeof(raw_route) != TYPE_ARRAY:
			_add(issues, "%s.routeCityIds" % path, "must be an array")
		else:
			var route: Array = raw_route
			if route.size() < 2:
				_add(issues, "%s.routeCityIds" % path, "must contain source and target")
			else:
				if str(route[0]) != source_id:
					_add(issues, "%s.routeCityIds" % path, "must start at sourceCityId")
				if str(route[-1]) != target_id:
					_add(issues, "%s.routeCityIds" % path, "must end at targetCityId")
			var seen: Dictionary = {}
			for index: int in range(route.size()):
				var city_id: String = str(route[index])
				if not cities.has(city_id):
					_add(issues, "%s.routeCityIds.%d" % [path, index], "unknown city: %s" % city_id)
				if seen.has(city_id):
					_add(issues, "%s.routeCityIds" % path, "must not repeat a city")
				seen[city_id] = true
				if index > 0:
					var previous_id: String = str(route[index - 1])
					if cities.has(previous_id) and cities.has(city_id) \
							and typeof(cities[previous_id]) == TYPE_DICTIONARY \
							and typeof(cities[city_id]) == TYPE_DICTIONARY:
						var raw_neighbors: Variant = (cities[previous_id] as Dictionary).get("neighbors")
						if typeof(raw_neighbors) == TYPE_ARRAY and not (raw_neighbors as Array).has(city_id):
							_add(issues, "%s.routeCityIds.%d" % [path, index], "must follow an existing road")
			if _is_positive_integer(order.get("durationMonths")) and route.size() >= 2 \
					and int(order["durationMonths"]) != route.size() - 1:
				_add(issues, "%s.durationMonths" % path, "must equal route road count")
		var raw_cargo: Variant = order.get("cargo")
		if typeof(raw_cargo) != TYPE_DICTIONARY:
			_add(issues, "%s.cargo" % path, "must be an object")
		else:
			var cargo: Dictionary = raw_cargo
			var total_positive: bool = false
			for field: String in ["money", "food", "reserveTroops"]:
				var amount: Variant = cargo.get(field)
				_validate_non_negative_integer(amount, "%s.cargo.%s" % [path, field], issues)
				if _is_integer_number(amount) and int(amount) > 0:
					total_positive = true
			if cargo.size() != 3:
				_add(issues, "%s.cargo" % path, "must contain exactly money, food, and reserveTroops")
			if order.get("kind") == "move" and total_positive:
				_add(issues, "%s.cargo" % path, "move cargo must be empty")
			if order.get("kind") == "transport" and not total_positive:
				_add(issues, "%s.cargo" % path, "transport cargo must not be empty")
	if _is_positive_integer(state.get("nextStrategicOrderSerial")) \
			and int(state["nextStrategicOrderSerial"]) <= highest_serial:
		_add(issues, "nextStrategicOrderSerial", "must exceed every active strategic order serial")


static func _validate_cities(
		cities: Dictionary,
		factions: Dictionary,
		officers: Dictionary,
		items: Dictionary,
		item_locations: Dictionary,
		issues: Array[Dictionary],
) -> Dictionary:
	var directed_references: int = 0
	var roads: Dictionary = {}
	for key: String in _sorted_string_keys(cities):
		var path: String = "cities.%s" % key
		var raw: Variant = cities[key]
		if typeof(raw) != TYPE_DICTIONARY:
			_add(issues, path, "must be an object")
			continue
		var city: Dictionary = raw
		_validate_record_id(city, key, path, issues)
		_require_non_blank_string(city, "name", path, issues)
		var owner_id: String = _required_reference(
			city.get("ownerId"), "%s.ownerId" % path, factions, issues
		)
		if city.has("satrapOfficerId"):
			var satrap_id: String = _required_reference(
				city.get("satrapOfficerId"), "%s.satrapOfficerId" % path, officers, issues
			)
			if not satrap_id.is_empty() and officers.has(satrap_id) \
					and typeof(officers[satrap_id]) == TYPE_DICTIONARY:
				var satrap: Dictionary = officers[satrap_id]
				if satrap.get("status") != "serving" \
						or satrap.get("cityId") != key \
						or satrap.get("factionId") != owner_id:
					_add(
						issues, "%s.satrapOfficerId" % path,
						"satrap must be a stationed officer of the owning faction"
					)

		for field: String in ["x", "y"]:
			if not _is_finite_number(city.get(field)):
				_add(issues, "%s.%s" % [path, field], "must be a finite number")
		for field: String in [
			"population", "farming", "commerce", "defense", "money", "food", "reserveTroops"
		]:
			_validate_non_negative_integer(city.get(field), "%s.%s" % [path, field], issues)
		for field: String in [
			"sourceIndex", "farmingLimit", "commerceLimit", "populationLimit",
			"publicLoyalty", "disasterPrevention"
		]:
			if city.has(field):
				_validate_non_negative_integer(city[field], "%s.%s" % [path, field], issues)
		for field: String in ["publicLoyalty", "disasterPrevention"]:
			if city.has(field) and _is_integer_number(city[field]) and int(city[field]) > 100:
				_add(issues, "%s.%s" % [path, field], "must not exceed 100")
		if city.has("condition") and not CITY_CONDITIONS.has(str(city["condition"])):
			_add(issues, "%s.condition" % path, "must be a known city condition")

		for item_field: String in ["itemIds", "hiddenItemIds"]:
			_validate_item_placements(
				city.get(item_field), "%s.%s" % [path, item_field], items,
				item_locations, issues
			)

		var raw_neighbors: Variant = city.get("neighbors")
		if typeof(raw_neighbors) != TYPE_ARRAY:
			_add(issues, "%s.neighbors" % path, "must be an array")
			continue
		var neighbors: Array = raw_neighbors
		directed_references += neighbors.size()
		var seen_neighbors: Dictionary = {}
		for index: int in range(neighbors.size()):
			var raw_neighbor: Variant = neighbors[index]
			if typeof(raw_neighbor) != TYPE_STRING or String(raw_neighbor).is_empty():
				_add(issues, "%s.neighbors.%d" % [path, index], "must be a city id")
				continue
			var neighbor_id: String = raw_neighbor
			if neighbor_id == key:
				_add(issues, "%s.neighbors" % path, "must not contain the city itself")
			if seen_neighbors.has(neighbor_id):
				_add(issues, "%s.neighbors" % path, "duplicate neighbor: %s" % neighbor_id)
			seen_neighbors[neighbor_id] = true
			if not cities.has(neighbor_id):
				_add(issues, "%s.neighbors" % path, "unknown city: %s" % neighbor_id)
				continue
			var raw_neighbor_city: Variant = cities[neighbor_id]
			if typeof(raw_neighbor_city) != TYPE_DICTIONARY:
				continue
			var neighbor_city: Dictionary = raw_neighbor_city
			var reciprocal_raw: Variant = neighbor_city.get("neighbors")
			if typeof(reciprocal_raw) != TYPE_ARRAY or not (reciprocal_raw as Array).has(key):
				_add(issues, "%s.neighbors" % path, "road is not reciprocal: %s" % neighbor_id)
			roads[_road_key(key, neighbor_id)] = true
	return {
		"directed_references": directed_references,
		"roads": roads,
	}


static func _validate_officers(
		officers: Dictionary,
		factions: Dictionary,
		cities: Dictionary,
		arms_types: Dictionary,
		items: Dictionary,
		active_order_officers: Dictionary,
		item_locations: Dictionary,
		state: Dictionary,
		initial_contract: bool,
		issues: Array[Dictionary],
) -> void:
	var acted_ids: Array = state.get("actedOfficerIds", []) if typeof(state.get("actedOfficerIds")) == TYPE_ARRAY else []
	for key: String in _sorted_string_keys(officers):
		var path: String = "officers.%s" % key
		var raw: Variant = officers[key]
		if typeof(raw) != TYPE_DICTIONARY:
			_add(issues, path, "must be an object")
			continue
		var officer: Dictionary = raw
		_validate_record_id(officer, key, path, issues)
		if typeof(officer.get("name")) != TYPE_STRING:
			_add(issues, "%s.name" % path, "must be a string")
		var faction_id: String = _required_reference(
			officer.get("factionId"), "%s.factionId" % path, factions, issues
		)
		_required_reference(officer.get("armsTypeId"), "%s.armsTypeId" % path, arms_types, issues)
		var status: String = str(officer.get("status", ""))
		if not OFFICER_STATUSES.has(status):
			_add(issues, "%s.status" % path, "must be a known officer status")
		var has_order: bool = active_order_officers.has(key)
		var city_id: String = ""
		if officer.has("cityId") and typeof(officer["cityId"]) == TYPE_STRING:
			city_id = officer["cityId"]
		if status == "hidden" or status == "dead":
			if officer.has("cityId") and officer["cityId"] != null:
				_add(issues, "%s.cityId" % path, "%s officer must not be assigned to a city" % status)
			if not faction_id.is_empty() and factions.has(faction_id) \
					and typeof(factions[faction_id]) == TYPE_DICTIONARY \
					and not (factions[faction_id] as Dictionary).get("isNeutral", false):
				_add(issues, "%s.factionId" % path, "%s officer must be neutral" % status)
		elif status == "serving" and has_order:
			if not city_id.is_empty():
				_add(issues, "%s.cityId" % path, "ordered serving officer must not be stationed")
		else:
			if city_id.is_empty() or not cities.has(city_id):
				_add(issues, "%s.cityId" % path, "must reference a known city")

		if status == "serving" and not has_order and not city_id.is_empty() and cities.has(city_id) \
				and typeof(cities[city_id]) == TYPE_DICTIONARY \
				and (cities[city_id] as Dictionary).get("ownerId") != faction_id:
			_add(issues, "%s.cityId" % path, "serving officer must be stationed in a city owned by their faction")
		if status == "free" and not faction_id.is_empty() and factions.has(faction_id) \
				and typeof(factions[faction_id]) == TYPE_DICTIONARY \
				and not (factions[faction_id] as Dictionary).get("isNeutral", false):
			_add(issues, "%s.factionId" % path, "free officer must belong to the neutral faction")
		if status == "serving" and not faction_id.is_empty() and factions.has(faction_id) \
				and typeof(factions[faction_id]) == TYPE_DICTIONARY \
				and (factions[faction_id] as Dictionary).get("isNeutral", false):
			_add(issues, "%s.factionId" % path, "serving officer must belong to a playable faction")
		if status == "captive":
			if not faction_id.is_empty() and factions.has(faction_id) \
					and typeof(factions[faction_id]) == TYPE_DICTIONARY \
					and not (factions[faction_id] as Dictionary).get("isNeutral", false):
				_add(issues, "%s.factionId" % path, "captive officer must be neutral")
			if int(officer.get("troops", -1)) != 0:
				_add(issues, "%s.troops" % path, "captive officer must have zero troops")
			if int(officer.get("stamina", -1)) != 0:
				_add(issues, "%s.stamina" % path, "captive officer must have zero stamina")
			var captor_id: String = _required_reference(
				officer.get("captorFactionId"), "%s.captorFactionId" % path, factions, issues
			)
			var former_id: String = _required_reference(
				officer.get("formerFactionId"), "%s.formerFactionId" % path, factions, issues
			)
			if not captor_id.is_empty() and factions.has(captor_id) \
					and (factions[captor_id] as Dictionary).get("isNeutral", false):
				_add(issues, "%s.captorFactionId" % path, "captive officer must name a playable captor faction")
			if not former_id.is_empty() and factions.has(former_id) \
					and (factions[former_id] as Dictionary).get("isNeutral", false):
				_add(issues, "%s.formerFactionId" % path, "captive officer must retain a playable former faction")
			if not captor_id.is_empty() and former_id == captor_id:
				_add(issues, "%s.formerFactionId" % path, "captive officer cannot be held by their former faction")
			if not captor_id.is_empty() and cities.has(city_id) \
					and (cities[city_id] as Dictionary).get("ownerId", "") != captor_id:
				_add(issues, "%s.cityId" % path, "captive officer must be held in a city owned by the captor")
		elif (officer.has("captorFactionId") and officer["captorFactionId"] != null) \
				or (officer.has("formerFactionId") and officer["formerFactionId"] != null):
			_add(issues, "%s.captorFactionId" % path, "capture metadata is only valid for captive officers")

		for field: String in [
			"force", "intelligence", "leadership", "troops", "loyalty", "age", "stamina"
		]:
			_validate_non_negative_integer(officer.get(field), "%s.%s" % [path, field], issues)
		for field: String in ["sourceId", "level", "character", "experience", "appearanceYear"]:
			if officer.has(field):
				_validate_non_negative_integer(officer[field], "%s.%s" % [path, field], issues)
		if _is_integer_number(officer.get("loyalty")) and int(officer["loyalty"]) > 100:
			_add(issues, "%s.loyalty" % path, "must not exceed 100")
		if _is_integer_number(officer.get("stamina")) and int(officer["stamina"]) > 100:
			_add(issues, "%s.stamina" % path, "must not exceed 100")
		if officer.has("appearanceCityId"):
			_required_reference(
				officer.get("appearanceCityId"), "%s.appearanceCityId" % path, cities, issues
			)
			if not officer.has("appearanceYear"):
				_add(issues, "%s.appearanceCityId" % path, "requires appearanceYear")
		if status == "dead" and acted_ids.has(key):
			_add(issues, "%s.status" % path, "dead officer cannot be marked as acted")
		if status == "dead":
			if int(officer.get("troops", -1)) != 0:
				_add(issues, "%s.troops" % path, "dead officer must have zero troops")
			if int(officer.get("stamina", -1)) != 0:
				_add(issues, "%s.stamina" % path, "dead officer must have zero stamina")
			if typeof(officer.get("death")) != TYPE_DICTIONARY:
				_add(issues, "%s.death" % path, "dead officer must retain a death record")
			else:
				_validate_death_record(
					officer["death"], path, factions, cities, state, issues
				)
		elif officer.has("death") and officer["death"] != null:
			_add(issues, "%s.death" % path, "only dead officers may retain a death record")

		var equipment_path: String = "%s.equipmentItemIds" % path
		var raw_equipment: Variant = officer.get("equipmentItemIds")
		if typeof(raw_equipment) != TYPE_ARRAY:
			_add(issues, equipment_path, "must be an array")
		else:
			var equipment: Array = raw_equipment
			if equipment.size() > EQUIPMENT_LIMIT:
				_add(issues, equipment_path, "must contain at most %d items" % EQUIPMENT_LIMIT)
			_validate_item_placements(
				equipment, equipment_path, items, item_locations, issues
			)
			if status == "dead" and not equipment.is_empty():
				_add(issues, equipment_path, "dead officer cannot retain equipment")


static func _validate_death_record(
		death: Dictionary, officer_path: String, factions: Dictionary, cities: Dictionary,
		state: Dictionary, issues: Array[Dictionary]
) -> void:
	var path: String = "%s.death" % officer_path
	if not DEATH_CAUSES.has(str(death.get("cause", ""))):
		_add(issues, "%s.cause" % path, "must be a supported death cause")
	if not _is_positive_integer(death.get("turn")) \
			or (_is_positive_integer(state.get("turn")) and int(death.get("turn", 0)) > int(state["turn"])):
		_add(issues, "%s.turn" % path, "must be within the current campaign")
	if not _is_positive_integer(death.get("year")):
		_add(issues, "%s.year" % path, "must be a positive integer")
	if not _is_integer_number(death.get("month")) \
			or int(death.get("month", 0)) < 1 or int(death.get("month", 0)) > 12:
		_add(issues, "%s.month" % path, "must be from 1 to 12")
	var calendar: Dictionary = state.get("calendar", {}) if state.get("calendar") is Dictionary else {}
	if _is_positive_integer(death.get("year")) and _is_integer_number(death.get("month")) \
			and _is_positive_integer(calendar.get("year")) and _is_integer_number(calendar.get("month")) \
			and int(death["year"]) * 12 + int(death["month"]) \
			> int(calendar["year"]) * 12 + int(calendar["month"]):
		_add(issues, "%s.year" % path, "must not be later than the current calendar")
	if death.has("cityId"):
		_required_reference(death.get("cityId"), "%s.cityId" % path, cities, issues)
	if death.has("responsibleFactionId"):
		_required_reference(
			death.get("responsibleFactionId"), "%s.responsibleFactionId" % path, factions, issues
		)


static func _validate_items(
		items: Dictionary,
		arms_types: Dictionary,
		cities: Dictionary,
		issues: Array[Dictionary],
) -> void:
	for key: String in _sorted_string_keys(items):
		var path: String = "items.%s" % key
		var raw: Variant = items[key]
		if typeof(raw) != TYPE_DICTIONARY:
			_add(issues, path, "must be an object")
			continue
		var item: Dictionary = raw
		_validate_record_id(item, key, path, issues)
		_require_non_blank_string(item, "name", path, issues)
		for field: String in ["forceBonus", "intelligenceBonus", "moveBonus"]:
			_validate_non_negative_integer(item.get(field), "%s.%s" % [path, field], issues)
		for field: String in ["sourceId", "appearanceYear"]:
			if item.has(field):
				_validate_non_negative_integer(item[field], "%s.%s" % [path, field], issues)
		if item.has("armsTypeOverride"):
			_required_reference(
				item.get("armsTypeOverride"), "%s.armsTypeOverride" % path, arms_types, issues
			)
		if item.has("appearanceCityId"):
			_required_reference(
				item.get("appearanceCityId"), "%s.appearanceCityId" % path, cities, issues
			)
			if not item.has("appearanceYear"):
				_add(issues, "%s.appearanceCityId" % path, "requires appearanceYear")
		if item.has("appearanceYear") and not item.has("appearanceCityId"):
			_add(issues, "%s.appearanceCityId" % path, "is required for annual appearance")


static func _validate_arms_types(arms_types: Dictionary, issues: Array[Dictionary]) -> void:
	for key: String in _sorted_string_keys(arms_types):
		var path: String = "armsTypes.%s" % key
		var raw: Variant = arms_types[key]
		if typeof(raw) != TYPE_DICTIONARY:
			_add(issues, path, "must be an object")
			continue
		var arms_type: Dictionary = raw
		_validate_record_id(arms_type, key, path, issues)
		_require_non_blank_string(arms_type, "name", path, issues)
		for field: String in ["attackModifier", "defenseModifier", "mobility"]:
			if not _is_finite_number(arms_type.get(field)):
				_add(issues, "%s.%s" % [path, field], "must be a finite number")


static func _validate_logs(raw: Variant, issues: Array[Dictionary]) -> void:
	if typeof(raw) != TYPE_ARRAY:
		_add(issues, "logs", "must be an array")
		return
	var logs: Array = raw
	var ids: Dictionary = {}
	for index: int in range(logs.size()):
		var path: String = "logs.%d" % index
		if typeof(logs[index]) != TYPE_DICTIONARY:
			_add(issues, path, "must be an object")
			continue
		var log_entry: Dictionary = logs[index]
		var log_id: String = ""
		if _is_non_blank_string(log_entry.get("id")):
			log_id = log_entry["id"]
			if ids.has(log_id):
				_add(issues, "%s.id" % path, "duplicate log id: %s" % log_id)
			ids[log_id] = true
		else:
			_add(issues, "%s.id" % path, "must be a non-blank string")
		if not LOG_KINDS.has(str(log_entry.get("kind", ""))):
			_add(issues, "%s.kind" % path, "must be a known log kind")
		_require_non_blank_string(log_entry, "message", path, issues)
		if not _is_positive_integer(log_entry.get("turn")):
			_add(issues, "%s.turn" % path, "must be a positive integer")


static func _validate_graph(
		raw: Variant,
		cities: Dictionary,
		facts: Dictionary,
		issues: Array[Dictionary],
) -> void:
	if raw == null:
		return
	if typeof(raw) != TYPE_DICTIONARY:
		_add(issues, "graph", "must be an object")
		return
	var graph: Dictionary = raw
	var roads: Dictionary = facts.get("roads", {})
	var expected_counts: Dictionary = {
		"cityCount": cities.size(),
		"roadCount": roads.size(),
		"directedNeighborReferenceCount": int(facts.get("directed_references", 0)),
	}
	for field: String in ["cityCount", "roadCount", "directedNeighborReferenceCount"]:
		if not _is_integer_number(graph.get(field)) or int(graph.get(field, -1)) != int(expected_counts[field]):
			_add(issues, "graph.%s" % field, "must equal %d" % int(expected_counts[field]))
	var raw_roads: Variant = graph.get("roads")
	if typeof(raw_roads) != TYPE_ARRAY:
		_add(issues, "graph.roads", "must be an array")
		return
	var listed: Dictionary = {}
	var graph_roads: Array = raw_roads
	for index: int in range(graph_roads.size()):
		var path: String = "graph.roads.%d" % index
		var pair_raw: Variant = graph_roads[index]
		if typeof(pair_raw) != TYPE_ARRAY or (pair_raw as Array).size() != 2:
			_add(issues, path, "must contain exactly two city ids")
			continue
		var pair: Array = pair_raw
		if typeof(pair[0]) != TYPE_STRING or typeof(pair[1]) != TYPE_STRING:
			_add(issues, path, "must contain city ids")
			continue
		var road_key: String = _road_key(pair[0], pair[1])
		if listed.has(road_key):
			_add(issues, path, "duplicate road")
		listed[road_key] = true
		if not roads.has(road_key):
			_add(issues, path, "road is not present in reciprocal city neighbors")
	for road_key: String in _sorted_string_keys(roads):
		if not listed.has(road_key):
			_add(issues, "graph.roads", "missing reciprocal road: %s" % road_key.replace("|", " <-> "))


static func _validate_exact_order(
		raw: Variant,
		path: String,
		record: Dictionary,
		issues: Array[Dictionary],
) -> void:
	if typeof(raw) != TYPE_ARRAY:
		_add(issues, path, "must be an array")
		return
	var values: Array = raw
	var seen: Dictionary = {}
	for index: int in range(values.size()):
		var raw_id: Variant = values[index]
		if typeof(raw_id) != TYPE_STRING or String(raw_id).is_empty():
			_add(issues, "%s.%d" % [path, index], "must be an entity id")
			continue
		var entity_id: String = raw_id
		if seen.has(entity_id):
			_add(issues, path, "contains duplicate id: %s" % entity_id)
		seen[entity_id] = true
		if not record.has(entity_id):
			_add(issues, path, "unknown id: %s" % entity_id)
	for key: String in _sorted_string_keys(record):
		if not seen.has(key):
			_add(issues, path, "missing id: %s" % key)


static func _validate_faction_order(
		raw: Variant,
		factions: Dictionary,
		issues: Array[Dictionary],
) -> void:
	if typeof(raw) != TYPE_ARRAY:
		_add(issues, "factionOrder", "must be an array")
		return
	var values: Array = raw
	var seen: Dictionary = {}
	for index: int in range(values.size()):
		var raw_id: Variant = values[index]
		if typeof(raw_id) != TYPE_STRING or not factions.has(raw_id):
			_add(issues, "factionOrder.%d" % index, "must reference a known faction")
			continue
		var faction_id: String = raw_id
		if seen.has(faction_id):
			_add(issues, "factionOrder", "contains duplicate id: %s" % faction_id)
		seen[faction_id] = true
		if typeof(factions[faction_id]) == TYPE_DICTIONARY \
				and (factions[faction_id] as Dictionary).get("isNeutral", false):
			_add(issues, "factionOrder", "must not include the neutral faction")
	for key: String in _sorted_string_keys(factions):
		if typeof(factions[key]) != TYPE_DICTIONARY:
			continue
		var faction: Dictionary = factions[key]
		if not faction.get("isNeutral", false) and not seen.has(key):
			_add(issues, "factionOrder", "missing playable faction: %s" % key)


static func _validate_id_list(
		raw: Variant,
		path: String,
		record: Dictionary,
		issues: Array[Dictionary],
) -> void:
	if typeof(raw) != TYPE_ARRAY:
		_add(issues, path, "must be an array")
		return
	var ids: Array = raw
	var seen: Dictionary = {}
	for index: int in range(ids.size()):
		var raw_id: Variant = ids[index]
		if typeof(raw_id) != TYPE_STRING or not record.has(raw_id):
			_add(issues, "%s.%d" % [path, index], "must reference a known id")
			continue
		var entity_id: String = raw_id
		if seen.has(entity_id):
			_add(issues, path, "contains duplicate id: %s" % entity_id)
		seen[entity_id] = true


static func _validate_item_placements(
		raw: Variant,
		path: String,
		items: Dictionary,
		locations: Dictionary,
		issues: Array[Dictionary],
) -> void:
	if typeof(raw) != TYPE_ARRAY:
		_add(issues, path, "must be an array")
		return
	var ids: Array = raw
	var local_seen: Dictionary = {}
	for index: int in range(ids.size()):
		var raw_id: Variant = ids[index]
		if typeof(raw_id) != TYPE_STRING or String(raw_id).is_empty():
			_add(issues, "%s.%d" % [path, index], "must be an item id")
			continue
		var item_id: String = raw_id
		if local_seen.has(item_id):
			_add(issues, path, "contains duplicate item: %s" % item_id)
		local_seen[item_id] = true
		if not items.has(item_id):
			_add(issues, path, "unknown item: %s" % item_id)
		if locations.has(item_id):
			_add(issues, path, "item is already placed at %s: %s" % [locations[item_id], item_id])
		else:
			locations[item_id] = path


static func _validate_record_id(
		record: Dictionary,
		key: String,
		path: String,
		issues: Array[Dictionary],
) -> void:
	if record.get("id") != key:
		_add(issues, "%s.id" % path, "must match record key: %s" % key)


static func _validate_serial(
		raw: Variant, path: String, initial_contract: bool, issues: Array[Dictionary]
) -> void:
	if not _is_positive_integer(raw):
		_add(issues, path, "must be a positive integer")
	elif initial_contract and int(raw) != 1:
		_add(issues, path, "must remain 1 in the initial-state contract")


static func _validate_empty_spike_record(
		record: Dictionary,
		path: String,
		issues: Array[Dictionary],
) -> void:
	if not record.is_empty():
		_add(issues, path, "must remain empty in the initial-state contract")


static func _validate_empty_runtime_record(
		record: Dictionary, path: String, issues: Array[Dictionary]
) -> void:
	if not record.is_empty():
		_add(issues, path, "is not supported by the current runtime validator")


static func _validate_non_negative_integer(
		raw: Variant,
		path: String,
		issues: Array[Dictionary],
) -> void:
	if not _is_integer_number(raw) or int(raw) < 0 or int(raw) > JS_MAX_SAFE_INTEGER:
		_add(issues, path, "must be a non-negative safe integer")


static func _require_non_blank_string(
		record: Dictionary,
		field: String,
		base_path: String,
		issues: Array[Dictionary],
) -> void:
	if not _is_non_blank_string(record.get(field)):
		_add(issues, "%s.%s" % [base_path, field], "must be a non-blank string")


static func _required_reference(
		raw: Variant,
		path: String,
		record: Dictionary,
		issues: Array[Dictionary],
) -> String:
	if typeof(raw) != TYPE_STRING or String(raw).is_empty():
		_add(issues, path, "must be an id")
		return ""
	var entity_id: String = raw
	if not record.has(entity_id):
		_add(issues, path, "unknown id: %s" % entity_id)
	return entity_id


static func _record_or_issue(
		raw: Variant,
		path: String,
		issues: Array[Dictionary],
) -> Dictionary:
	if typeof(raw) != TYPE_DICTIONARY:
		_add(issues, path, "must be an object")
		return {}
	return raw


static func _sorted_string_keys(record: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for raw_key: Variant in record.keys():
		result.append(str(raw_key))
	result.sort()
	return result


static func _road_key(left: String, right: String) -> String:
	return "%s|%s" % [left, right] if left < right else "%s|%s" % [right, left]


static func _is_non_blank_string(raw: Variant) -> bool:
	return typeof(raw) == TYPE_STRING and not String(raw).strip_edges().is_empty()


static func _is_finite_number(raw: Variant) -> bool:
	return (typeof(raw) == TYPE_INT or typeof(raw) == TYPE_FLOAT) and is_finite(float(raw))


static func _is_integer_number(raw: Variant) -> bool:
	return _is_finite_number(raw) and floor(float(raw)) == float(raw)


static func _is_positive_integer(raw: Variant) -> bool:
	return _is_integer_number(raw) and int(raw) >= 1


static func _is_strategic_order_id(value: String) -> bool:
	const PREFIX := "strategic-order-"
	if not value.begins_with(PREFIX): return false
	var suffix: String = value.trim_prefix(PREFIX)
	if suffix.is_empty() or suffix.length() > 16 or suffix[0] < "1" or suffix[0] > "9":
		return false
	for index: int in range(1, suffix.length()):
		if suffix[index] < "0" or suffix[index] > "9": return false
	return int(suffix) <= JS_MAX_SAFE_INTEGER


static func _add(issues: Array[Dictionary], path: String, message: String) -> void:
	issues.append({"path": path, "message": message})
