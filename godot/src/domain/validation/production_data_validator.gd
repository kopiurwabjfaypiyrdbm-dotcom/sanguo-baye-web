class_name ProductionDataValidator
extends RefCounted

const CanonicalJson = preload("res://src/domain/validation/canonical_json.gd")
const GameStateValidator = preload("res://src/domain/validation/game_state_validator.gd")

const CONTRACT_VERSION: int = 2
const RULESET_ID: String = "baye-classic-v1"
const ROOT_KEYS: Array[String] = [
	"facts", "id", "productionDataContractVersion", "provenance", "scenario",
	"state", "stateSha256", "usage",
]
const CLOSED_KEYS: Dictionary = {
	"usage": ["scope", "redistributionReview", "notice"],
	"provenance": ["generatedBy", "scenarioFactory", "bundledSource", "source"],
	"source": ["repository", "commit", "archiveSha256", "note"],
	"scenario": ["periodId", "title", "description", "year", "rulesetId", "defaultRulerSourceIndex", "playerCandidates"],
	"candidate": ["sourceIndex", "name", "cityCount", "officerCount", "factionId", "rulerOfficerId"],
	"facts": ["cityCount", "roadCount", "directedNeighborReferenceCount", "factionCount", "officerCount", "itemCount", "armsTypeCount"],
	"state": [
		"dataContractVersion", "cityOrder", "officerOrder", "itemOrder", "armsTypeOrder", "graph",
		"schemaVersion", "rulesetId", "scenario", "calendar", "turn", "rngSeed", "campaignStarted",
		"phase", "playerFactionId", "activeFactionId", "factionOrder", "factions", "cities",
		"officers", "items", "armsTypes", "actedOfficerIds", "discoveredOfficerIds",
		"strategicOrders", "diplomaticOrders", "intelReports", "nextStrategicOrderSerial",
		"nextDiplomaticOrderSerial", "lifecyclePolicy", "logs",
	],
	"stateScenario": ["id", "period", "source"],
	"calendar": ["year", "month"],
	"lifecyclePolicy": ["version", "ageGrowth", "naturalDeath", "battleDeath", "captiveEscape"],
	"graph": ["cityCount", "roadCount", "directedNeighborReferenceCount", "roads"],
	"faction": ["id", "name", "color", "rulerOfficerId", "isPlayer", "isNeutral", "aiProfile"],
	"city": [
		"id", "sourceIndex", "name", "type", "region", "x", "y", "neighbors", "ownerId",
		"satrapOfficerId", "farming", "farmingLimit", "commerce", "commerceLimit", "population",
		"populationLimit", "publicLoyalty", "disasterPrevention", "defense", "money", "food",
		"reserveTroops", "itemIds", "hiddenItemIds",
	],
	"officer": [
		"id", "sourceId", "name", "age", "force", "intelligence", "leadership", "character",
		"factionId", "cityId", "status", "loyalty", "stamina", "level", "experience", "troops",
		"armsTypeId", "equipmentItemIds", "appearanceYear", "appearanceCityId",
	],
	"item": ["id", "sourceId", "name", "forceBonus", "intelligenceBonus", "moveBonus", "armsTypeOverride"],
	"armsType": ["id", "name", "attackModifier", "defenseModifier", "mobility"],
	"log": ["id", "turn", "kind", "message"],
}


static func validate_envelope(raw: Variant) -> Array[String]:
	var issues: Array[String] = []
	if typeof(raw) != TYPE_DICTIONARY:
		return ["envelope: expected object"]
	var envelope: Dictionary = raw
	_validate_exact_keys(envelope, ROOT_KEYS, "envelope", issues)
	if envelope.get("productionDataContractVersion") != float(CONTRACT_VERSION):
		issues.append("productionDataContractVersion: must be 2")
		return issues
	if typeof(envelope.get("scenario")) != TYPE_DICTIONARY:
		issues.append("scenario: expected object")
	if typeof(envelope.get("facts")) != TYPE_DICTIONARY:
		issues.append("facts: expected object")
	if typeof(envelope.get("state")) != TYPE_DICTIONARY:
		issues.append("state: expected object")
	if not issues.is_empty():
		return issues

	var scenario: Dictionary = envelope["scenario"]
	var facts: Dictionary = envelope["facts"]
	var state: Dictionary = envelope["state"]
	_validate_closed_production_shape(envelope, scenario, facts, state, issues)
	_validate_metadata_types(envelope, scenario, issues)
	_validate_production_field_types(state, issues)
	if not issues.is_empty():
		issues.sort()
		return issues
	var period_id: int = int(scenario.get("periodId", -1)) if _is_integer(scenario.get("periodId")) else -1
	if period_id < 1 or period_id > 4:
		issues.append("scenario.periodId: must be 1..4")
	if scenario.get("rulesetId") != RULESET_ID:
		issues.append("scenario.rulesetId: unsupported ruleset")
	if envelope.get("id") != "baye-period-%d" % period_id:
		issues.append("id: must match scenario.periodId")
	if typeof(envelope.get("usage")) != TYPE_DICTIONARY:
		issues.append("usage: expected object")
	if typeof(envelope.get("provenance")) != TYPE_DICTIONARY \
			or typeof((envelope.get("provenance") as Dictionary).get("source")) != TYPE_DICTIONARY \
			or typeof(((envelope.get("provenance") as Dictionary).get("source") as Dictionary).get("commit")) != TYPE_STRING:
		issues.append("provenance.source: missing pinned source evidence")
	if state.get("dataContractVersion") != float(CONTRACT_VERSION):
		issues.append("state.dataContractVersion: must be 2")
	if state.get("rulesetId") != scenario.get("rulesetId"):
		issues.append("state.rulesetId: must match scenario.rulesetId")
	if typeof(state.get("scenario")) != TYPE_DICTIONARY \
			or int((state.get("scenario") as Dictionary).get("period", -1)) != period_id:
		issues.append("state.scenario.period: must match scenario.periodId")
	else:
		var state_scenario: Dictionary = state["scenario"]
		if typeof(state_scenario.get("id")) != TYPE_STRING \
				or typeof(state_scenario.get("source")) != TYPE_STRING \
				or state_scenario.get("id") != envelope.get("id") \
				or state_scenario.get("source") != "baye-legacy":
			issues.append("state.scenario: id/source must match the production scenario")
	if typeof(state.get("calendar")) != TYPE_DICTIONARY \
			or (state.get("calendar") as Dictionary).get("year") != scenario.get("year") \
			or (state.get("calendar") as Dictionary).get("month") != 1.0:
		issues.append("state.calendar: must match the period start at month 1")

	_validate_candidates(scenario, state, issues)
	_validate_facts(facts, state, issues)
	_validate_semantic_order(state, "cityOrder", "cities", "sourceIndex", issues)
	_validate_semantic_order(state, "officerOrder", "officers", "sourceId", issues)
	_validate_semantic_order(state, "itemOrder", "items", "sourceId", issues)
	_validate_semantic_order(state, "armsTypeOrder", "armsTypes", "", issues)
	_validate_nested_orders(state, issues)
	for issue: Dictionary in GameStateValidator.validate(state):
		issues.append("state.%s: %s" % [issue.get("path", "?"), issue.get("message", "invalid")])
	var digest: Dictionary = CanonicalJson.try_sha256(state)
	if not digest["ok"]:
		issues.append("stateSha256: " + digest["error"])
	elif envelope.get("stateSha256") != digest["value"]:
		issues.append("stateSha256: expected " + digest["value"])
	issues.sort()
	return issues


static func _validate_candidates(scenario: Dictionary, state: Dictionary, issues: Array[String]) -> void:
	if typeof(scenario.get("playerCandidates")) != TYPE_ARRAY:
		issues.append("scenario.playerCandidates: must be a non-empty array")
		return
	var candidates: Array = scenario["playerCandidates"]
	if candidates.is_empty():
		issues.append("scenario.playerCandidates: must be a non-empty array")
		return
	var prior: int = -1
	var seen: Dictionary = {}
	var factions: Dictionary = state.get("factions", {}) if typeof(state.get("factions")) == TYPE_DICTIONARY else {}
	var officers: Dictionary = state.get("officers", {}) if typeof(state.get("officers")) == TYPE_DICTIONARY else {}
	for index: int in range(candidates.size()):
		var path: String = "scenario.playerCandidates[%d]" % index
		if typeof(candidates[index]) != TYPE_DICTIONARY:
			issues.append(path + ": invalid candidate")
			continue
		var candidate: Dictionary = candidates[index]
		if not _is_integer(candidate.get("sourceIndex")) or typeof(candidate.get("factionId")) != TYPE_STRING \
				or typeof(candidate.get("rulerOfficerId")) != TYPE_STRING \
				or typeof(candidate.get("name")) != TYPE_STRING \
				or not _is_non_negative_integer(candidate.get("cityCount")) \
				or not _is_non_negative_integer(candidate.get("officerCount")):
			issues.append(path + ": invalid candidate")
			continue
		var source_index: int = int(candidate["sourceIndex"])
		if source_index <= prior or seen.has(source_index):
			issues.append(path + ".sourceIndex: must be unique and ascending")
		prior = source_index
		seen[source_index] = true
		var faction: Variant = factions.get(candidate["factionId"])
		var officer: Variant = officers.get(candidate["rulerOfficerId"])
		if typeof(faction) != TYPE_DICTIONARY or typeof(officer) != TYPE_DICTIONARY \
				or (faction as Dictionary).get("rulerOfficerId") != candidate["rulerOfficerId"] \
				or (officer as Dictionary).get("sourceId") != candidate["sourceIndex"]:
			issues.append(path + ": dangling ruler/faction reference")
	if not seen.has(int(scenario.get("defaultRulerSourceIndex", -1))):
		issues.append("scenario.defaultRulerSourceIndex: must name a candidate")
	else:
		var default_source_index: int = int(scenario["defaultRulerSourceIndex"])
		var default_faction_id: String = ""
		for raw_candidate: Variant in candidates:
			if typeof(raw_candidate) == TYPE_DICTIONARY \
					and int((raw_candidate as Dictionary).get("sourceIndex", -1)) == default_source_index:
				default_faction_id = str((raw_candidate as Dictionary).get("factionId", ""))
				break
		if default_faction_id.is_empty() or state.get("playerFactionId") != default_faction_id \
				or state.get("activeFactionId") != default_faction_id:
			issues.append("scenario.defaultRulerSourceIndex: must match the initial player and active faction")


static func _validate_closed_production_shape(
		envelope: Dictionary, scenario: Dictionary, facts: Dictionary, state: Dictionary,
		issues: Array[String]
) -> void:
	_validate_object_at(envelope.get("usage"), CLOSED_KEYS["usage"], "usage", issues)
	_validate_object_at(envelope.get("provenance"), CLOSED_KEYS["provenance"], "provenance", issues)
	if typeof(envelope.get("provenance")) == TYPE_DICTIONARY:
		_validate_object_at((envelope["provenance"] as Dictionary).get("source"), CLOSED_KEYS["source"], "provenance.source", issues)
	_validate_exact_keys(scenario, CLOSED_KEYS["scenario"], "scenario", issues)
	if typeof(scenario.get("playerCandidates")) == TYPE_ARRAY:
		var candidates: Array = scenario["playerCandidates"]
		for index: int in range(candidates.size()):
			_validate_object_at(candidates[index], CLOSED_KEYS["candidate"], "scenario.playerCandidates[%d]" % index, issues)
	_validate_exact_keys(facts, CLOSED_KEYS["facts"], "facts", issues)
	_validate_exact_keys(state, CLOSED_KEYS["state"], "state", issues)
	_validate_object_at(state.get("scenario"), CLOSED_KEYS["stateScenario"], "state.scenario", issues)
	_validate_object_at(state.get("calendar"), CLOSED_KEYS["calendar"], "state.calendar", issues)
	_validate_object_at(state.get("lifecyclePolicy"), CLOSED_KEYS["lifecyclePolicy"], "state.lifecyclePolicy", issues)
	_validate_object_at(state.get("graph"), CLOSED_KEYS["graph"], "state.graph", issues)
	_validate_record_values(state.get("factions"), CLOSED_KEYS["faction"], ["isNeutral"], "state.factions", issues)
	_validate_record_values(state.get("cities"), CLOSED_KEYS["city"], ["satrapOfficerId"], "state.cities", issues)
	_validate_record_values(state.get("officers"), CLOSED_KEYS["officer"], ["cityId", "appearanceYear", "appearanceCityId"], "state.officers", issues)
	_validate_record_values(state.get("items"), CLOSED_KEYS["item"], ["armsTypeOverride"], "state.items", issues)
	_validate_record_values(state.get("armsTypes"), CLOSED_KEYS["armsType"], [], "state.armsTypes", issues)
	if typeof(state.get("logs")) == TYPE_ARRAY:
		var logs: Array = state["logs"]
		for index: int in range(logs.size()):
			_validate_object_at(logs[index], CLOSED_KEYS["log"], "state.logs[%d]" % index, issues)


static func _validate_record_values(
		raw: Variant, allowed: Array, optional: Array, path: String, issues: Array[String]
) -> void:
	if typeof(raw) != TYPE_DICTIONARY:
		return
	var record: Dictionary = raw
	var keys: Array[String] = []
	for raw_key: Variant in record.keys(): keys.append(str(raw_key))
	keys.sort()
	for key: String in keys:
		_validate_object_at(record[key], allowed, "%s.%s" % [path, key], issues, optional)


static func _validate_object_at(
		raw: Variant, allowed: Array, path: String, issues: Array[String], optional: Array = []
) -> void:
	if typeof(raw) != TYPE_DICTIONARY:
		issues.append(path + ": expected object")
		return
	var typed_allowed: Array[String] = []
	for key: Variant in allowed: typed_allowed.append(str(key))
	_validate_exact_keys(raw, typed_allowed, path, issues, optional)


static func _validate_metadata_types(
		envelope: Dictionary, scenario: Dictionary, issues: Array[String]
) -> void:
	for descriptor: Dictionary in [
		{"path": "usage", "raw": envelope.get("usage"), "fields": CLOSED_KEYS["usage"]},
		{"path": "provenance", "raw": envelope.get("provenance"), "fields": ["generatedBy", "scenarioFactory", "bundledSource"]},
		{"path": "provenance.source", "raw": (envelope.get("provenance") as Dictionary).get("source") if typeof(envelope.get("provenance")) == TYPE_DICTIONARY else null, "fields": CLOSED_KEYS["source"]},
	]:
		if typeof(descriptor["raw"]) != TYPE_DICTIONARY:
			continue
		var record: Dictionary = descriptor["raw"]
		for raw_field: Variant in descriptor["fields"]:
			var field: String = str(raw_field)
			if typeof(record.get(field)) != TYPE_STRING or String(record.get(field)).is_empty():
				issues.append("%s.%s: must be a non-empty string" % [descriptor["path"], field])
	for field: String in ["title", "description"]:
		if typeof(scenario.get(field)) != TYPE_STRING:
			issues.append("scenario.%s: must be a string" % field)
	if not _is_integer(scenario.get("year")) or int(scenario.get("year", 0)) <= 0:
		issues.append("scenario.year: must be a positive integer")
	if not _is_integer(scenario.get("defaultRulerSourceIndex")):
		issues.append("scenario.defaultRulerSourceIndex: must be an integer")


static func _validate_production_field_types(state: Dictionary, issues: Array[String]) -> void:
	_require_integer_fields(state, ["dataContractVersion", "schemaVersion", "turn", "rngSeed", "nextStrategicOrderSerial", "nextDiplomaticOrderSerial"], "state", issues)
	_require_string_fields(state, ["rulesetId", "phase", "playerFactionId", "activeFactionId"], "state", issues)
	_require_non_empty_string_fields(state, ["rulesetId", "phase", "playerFactionId", "activeFactionId"], "state", issues)
	_require_boolean_fields(state, ["campaignStarted"], "state", issues)
	_require_string_arrays(state, ["cityOrder", "officerOrder", "itemOrder", "armsTypeOrder", "factionOrder", "actedOfficerIds", "discoveredOfficerIds"], "state", issues)
	_require_record_fields(state, ["factions", "cities", "officers", "items", "armsTypes", "strategicOrders", "diplomaticOrders", "intelReports"], "state", issues)
	if typeof(state.get("logs")) != TYPE_ARRAY: issues.append("state.logs: must be an array")
	if typeof(state.get("scenario")) == TYPE_DICTIONARY:
		var state_scenario: Dictionary = state["scenario"]
		_require_string_fields(state_scenario, ["id", "source"], "state.scenario", issues)
		_require_non_empty_string_fields(state_scenario, ["id", "source"], "state.scenario", issues)
		_require_integer_fields(state_scenario, ["period"], "state.scenario", issues)
	if typeof(state.get("calendar")) == TYPE_DICTIONARY:
		_require_integer_fields(state["calendar"], ["year", "month"], "state.calendar", issues)
	if typeof(state.get("graph")) == TYPE_DICTIONARY:
		var graph: Dictionary = state["graph"]
		_require_integer_fields(graph, ["cityCount", "roadCount", "directedNeighborReferenceCount"], "state.graph", issues)
		if typeof(graph.get("roads")) != TYPE_ARRAY:
			issues.append("state.graph.roads: must be an array")
		else:
			var roads: Array = graph["roads"]
			for index: int in range(roads.size()):
				var pair: Variant = roads[index]
				if typeof(pair) != TYPE_ARRAY or (pair as Array).size() != 2 \
						or typeof((pair as Array)[0]) != TYPE_STRING or typeof((pair as Array)[1]) != TYPE_STRING:
					issues.append("state.graph.roads[%d]: must contain two city ids" % index)
	_validate_typed_record(state.get("factions"), "state.factions", func(record: Dictionary, path: String) -> void:
		_require_string_fields(record, ["id", "name", "color", "rulerOfficerId"], path, issues)
		_require_non_empty_string_fields(record, ["id", "name", "color", "rulerOfficerId"], path, issues)
		_require_boolean_fields(record, ["isPlayer"], path, issues)
		if record.has("isNeutral") and typeof(record["isNeutral"]) != TYPE_BOOL: issues.append(path + ".isNeutral: must be a boolean")
		if not ["balanced", "aggressive", "defensive"].has(record.get("aiProfile")): issues.append(path + ".aiProfile: unsupported value")
	)
	_validate_typed_record(state.get("cities"), "state.cities", func(record: Dictionary, path: String) -> void:
		_require_string_fields(record, ["id", "name", "region", "ownerId"], path, issues)
		_require_non_empty_string_fields(record, ["id", "name", "region", "ownerId"], path, issues)
		if not ["capital", "city", "frontier"].has(record.get("type")): issues.append(path + ".type: unsupported value")
		_require_integer_fields(record, ["sourceIndex", "x", "y", "farming", "farmingLimit", "commerce", "commerceLimit", "population", "populationLimit", "publicLoyalty", "disasterPrevention", "defense", "money", "food", "reserveTroops"], path, issues)
		_require_string_arrays(record, ["neighbors", "itemIds", "hiddenItemIds"], path, issues)
		if record.has("satrapOfficerId") and (typeof(record["satrapOfficerId"]) != TYPE_STRING or String(record["satrapOfficerId"]).is_empty()): issues.append(path + ".satrapOfficerId: must be a non-empty string")
	)
	_validate_typed_record(state.get("officers"), "state.officers", func(record: Dictionary, path: String) -> void:
		_require_string_fields(record, ["id", "name", "factionId", "status", "armsTypeId"], path, issues)
		_require_non_empty_string_fields(record, ["id", "factionId", "status", "armsTypeId"], path, issues)
		_require_integer_fields(record, ["sourceId", "age", "force", "intelligence", "leadership", "character", "loyalty", "stamina", "level", "experience", "troops"], path, issues)
		_require_string_arrays(record, ["equipmentItemIds"], path, issues)
		for field: String in ["cityId", "appearanceCityId"]:
			if record.has(field) and (typeof(record[field]) != TYPE_STRING or String(record[field]).is_empty()): issues.append("%s.%s: must be a non-empty string" % [path, field])
		if record.has("appearanceYear") and not _is_integer(record["appearanceYear"]): issues.append(path + ".appearanceYear: must be an integer")
	)
	_validate_typed_record(state.get("items"), "state.items", func(record: Dictionary, path: String) -> void:
		_require_string_fields(record, ["id", "name"], path, issues)
		_require_non_empty_string_fields(record, ["id", "name"], path, issues)
		_require_integer_fields(record, ["sourceId", "forceBonus", "intelligenceBonus", "moveBonus"], path, issues)
		if record.has("armsTypeOverride") and (typeof(record["armsTypeOverride"]) != TYPE_STRING or String(record["armsTypeOverride"]).is_empty()): issues.append(path + ".armsTypeOverride: must be a non-empty string")
	)
	_validate_typed_record(state.get("armsTypes"), "state.armsTypes", func(record: Dictionary, path: String) -> void:
		_require_string_fields(record, ["id", "name"], path, issues)
		_require_non_empty_string_fields(record, ["id", "name"], path, issues)
		_require_number_fields(record, ["attackModifier", "defenseModifier", "mobility"], path, issues)
	)
	if typeof(state.get("logs")) == TYPE_ARRAY:
		var logs: Array = state["logs"]
		for index: int in range(logs.size()):
			if typeof(logs[index]) != TYPE_DICTIONARY: continue
			var log_entry: Dictionary = logs[index]
			_require_string_fields(log_entry, ["id", "kind", "message"], "state.logs[%d]" % index, issues)
			_require_non_empty_string_fields(log_entry, ["id", "kind", "message"], "state.logs[%d]" % index, issues)
			_require_integer_fields(log_entry, ["turn"], "state.logs[%d]" % index, issues)
			if not ["system", "turn", "battle", "ai", "map"].has(log_entry.get("kind")):
				issues.append("state.logs[%d].kind: unsupported value" % index)


static func _validate_typed_record(raw: Variant, path: String, validate: Callable) -> void:
	if typeof(raw) != TYPE_DICTIONARY: return
	var record: Dictionary = raw
	var keys: Array[String] = []
	for raw_key: Variant in record.keys(): keys.append(str(raw_key))
	keys.sort()
	for key: String in keys:
		if typeof(record[key]) == TYPE_DICTIONARY: validate.call(record[key], "%s.%s" % [path, key])


static func _require_string_fields(record: Dictionary, fields: Array, path: String, issues: Array[String]) -> void:
	for raw_field: Variant in fields:
		var field: String = str(raw_field)
		if typeof(record.get(field)) != TYPE_STRING: issues.append("%s.%s: must be a string" % [path, field])


static func _require_non_empty_string_fields(record: Dictionary, fields: Array, path: String, issues: Array[String]) -> void:
	for raw_field: Variant in fields:
		var field: String = str(raw_field)
		if typeof(record.get(field)) == TYPE_STRING and String(record.get(field)).is_empty():
			issues.append("%s.%s: must be a non-empty string" % [path, field])


static func _require_boolean_fields(record: Dictionary, fields: Array, path: String, issues: Array[String]) -> void:
	for raw_field: Variant in fields:
		var field: String = str(raw_field)
		if typeof(record.get(field)) != TYPE_BOOL: issues.append("%s.%s: must be a boolean" % [path, field])


static func _require_integer_fields(record: Dictionary, fields: Array, path: String, issues: Array[String]) -> void:
	for raw_field: Variant in fields:
		var field: String = str(raw_field)
		if not _is_integer(record.get(field)): issues.append("%s.%s: must be an integer" % [path, field])


static func _require_number_fields(record: Dictionary, fields: Array, path: String, issues: Array[String]) -> void:
	for raw_field: Variant in fields:
		var field: String = str(raw_field)
		var value: Variant = record.get(field)
		if (typeof(value) != TYPE_INT and typeof(value) != TYPE_FLOAT) or not is_finite(float(value)):
			issues.append("%s.%s: must be a finite number" % [path, field])


static func _require_record_fields(record: Dictionary, fields: Array, path: String, issues: Array[String]) -> void:
	for raw_field: Variant in fields:
		var field: String = str(raw_field)
		if typeof(record.get(field)) != TYPE_DICTIONARY: issues.append("%s.%s: expected object" % [path, field])


static func _require_string_arrays(record: Dictionary, fields: Array, path: String, issues: Array[String]) -> void:
	for raw_field: Variant in fields:
		var field: String = str(raw_field)
		if typeof(record.get(field)) != TYPE_ARRAY:
			issues.append("%s.%s: must be an array of strings" % [path, field])
			continue
		for value: Variant in record[field]:
			if typeof(value) != TYPE_STRING:
				issues.append("%s.%s: must be an array of strings" % [path, field])
				break


static func _validate_facts(facts: Dictionary, state: Dictionary, issues: Array[String]) -> void:
	var graph: Dictionary = state.get("graph", {}) if typeof(state.get("graph")) == TYPE_DICTIONARY else {}
	var factions: Dictionary = state.get("factions", {}) if typeof(state.get("factions")) == TYPE_DICTIONARY else {}
	var playable_factions: int = 0
	for raw_faction: Variant in factions.values():
		if typeof(raw_faction) == TYPE_DICTIONARY and not (raw_faction as Dictionary).get("isNeutral", false):
			playable_factions += 1
	var expected: Dictionary = {
		"cityCount": _array_size(state.get("cityOrder")),
		"roadCount": int(graph.get("roadCount", -1)),
		"directedNeighborReferenceCount": int(graph.get("directedNeighborReferenceCount", -1)),
		"factionCount": playable_factions,
		"officerCount": _array_size(state.get("officerOrder")),
		"itemCount": _array_size(state.get("itemOrder")),
		"armsTypeCount": _array_size(state.get("armsTypeOrder")),
	}
	for field: String in [
		"cityCount", "roadCount", "directedNeighborReferenceCount", "factionCount",
		"officerCount", "itemCount", "armsTypeCount",
	]:
		if not _is_integer(facts.get(field)) or int(facts.get(field, -1)) != int(expected[field]):
			issues.append("facts.%s: must equal %d" % [field, int(expected[field])])


static func _validate_semantic_order(
		state: Dictionary, order_field: String, record_field: String, source_field: String,
		issues: Array[String]
) -> void:
	if typeof(state.get(order_field)) != TYPE_ARRAY or typeof(state.get(record_field)) != TYPE_DICTIONARY:
		return
	var actual: Array = state[order_field]
	var record: Dictionary = state[record_field]
	var expected: Array = record.keys()
	expected.sort_custom(func(left: Variant, right: Variant) -> bool:
		if not source_field.is_empty():
			var left_record: Dictionary = record[left] if typeof(record[left]) == TYPE_DICTIONARY else {}
			var right_record: Dictionary = record[right] if typeof(record[right]) == TYPE_DICTIONARY else {}
			var left_source: int = int(left_record.get(source_field, 9_007_199_254_740_991))
			var right_source: int = int(right_record.get(source_field, 9_007_199_254_740_991))
			if left_source != right_source:
				return left_source < right_source
		return String(left) < String(right)
	)
	if actual != expected:
		issues.append("state.%s: must follow the production semantic order" % order_field)


static func _validate_nested_orders(state: Dictionary, issues: Array[String]) -> void:
	if typeof(state.get("cityOrder")) != TYPE_ARRAY or typeof(state.get("itemOrder")) != TYPE_ARRAY \
			or typeof(state.get("cities")) != TYPE_DICTIONARY:
		return
	var city_order: Array = state["cityOrder"]
	var item_order: Array = state["itemOrder"]
	var cities: Dictionary = state["cities"]
	var city_rank: Dictionary = {}
	var item_rank: Dictionary = {}
	for index: int in range(city_order.size()): city_rank[city_order[index]] = index
	for index: int in range(item_order.size()): item_rank[item_order[index]] = index
	for raw_city_id: Variant in city_order:
		if typeof(raw_city_id) != TYPE_STRING or typeof(cities.get(raw_city_id)) != TYPE_DICTIONARY:
			continue
		var city_id: String = raw_city_id
		var city: Dictionary = cities[city_id]
		for field: String in ["neighbors", "itemIds", "hiddenItemIds"]:
			if typeof(city.get(field)) != TYPE_ARRAY:
				continue
			var actual: Array = city[field]
			var expected: Array = actual.duplicate()
			var rank: Dictionary = city_rank if field == "neighbors" else item_rank
			expected.sort_custom(func(left: Variant, right: Variant) -> bool:
				var left_rank: int = int(rank.get(left, 9_007_199_254_740_991))
				var right_rank: int = int(rank.get(right, 9_007_199_254_740_991))
				return left_rank < right_rank if left_rank != right_rank else String(left) < String(right)
			)
			if actual != expected:
				issues.append("state.cities.%s.%s: must follow the production semantic order" % [city_id, field])


static func _validate_exact_keys(
		record: Dictionary, allowed: Array, path: String, issues: Array[String], optional: Array = []
) -> void:
	var keys: Array[String] = []
	for raw_key: Variant in record.keys():
		keys.append(str(raw_key))
	keys.sort()
	for key: String in keys:
		if not allowed.has(key):
			issues.append("%s.%s: unknown field" % [path, key])
	for key: String in allowed:
		if not optional.has(key) and not record.has(key):
			issues.append("%s.%s: missing field" % [path, key])


static func _array_size(raw: Variant) -> int:
	return (raw as Array).size() if typeof(raw) == TYPE_ARRAY else -1


static func _is_integer(raw: Variant) -> bool:
	return (typeof(raw) == TYPE_INT or typeof(raw) == TYPE_FLOAT) \
			and is_finite(float(raw)) and floor(float(raw)) == float(raw)


static func _is_non_negative_integer(raw: Variant) -> bool:
	return _is_integer(raw) and int(raw) >= 0
