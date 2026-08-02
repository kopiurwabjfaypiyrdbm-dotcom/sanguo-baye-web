class_name GameStateShapeValidator
extends RefCounted

const ALLOWED: Dictionary = {
	"state": [
		"dataContractVersion", "usage", "provenance", "cityOrder", "officerOrder", "itemOrder", "armsTypeOrder", "graph",
		"schemaVersion", "rulesetId", "scenario", "calendar", "turn", "rngSeed", "campaignStarted",
		"phase", "playerFactionId", "activeFactionId", "factionOrder", "factions", "cities",
		"officers", "items", "armsTypes", "actedOfficerIds", "discoveredOfficerIds",
		"strategicOrders", "diplomaticOrders", "intelReports", "nextStrategicOrderSerial",
		"nextDiplomaticOrderSerial", "lifecyclePolicy", "logs",
	],
	"scenario": ["id", "period", "source"],
	"usage": ["scope", "redistributionReview", "notice"],
	"provenance": ["generatedBy", "scenarioFactory", "bundledScenario"],
	"calendar": ["year", "month"],
	"lifecyclePolicy": ["version", "ageGrowth", "naturalDeath", "battleDeath", "captiveEscape"],
	"graph": ["cityCount", "roadCount", "directedNeighborReferenceCount", "roads"],
	"faction": ["id", "name", "color", "rulerOfficerId", "isPlayer", "isNeutral", "aiProfile"],
	"city": [
		"id", "sourceIndex", "name", "type", "region", "x", "y", "neighbors", "ownerId",
		"satrapOfficerId", "farming", "farmingLimit", "commerce", "commerceLimit", "population",
		"populationLimit", "publicLoyalty", "disasterPrevention", "defense", "money", "food",
		"reserveTroops", "itemIds", "hiddenItemIds", "condition",
	],
	"officer": [
		"id", "sourceId", "name", "age", "force", "intelligence", "leadership", "character",
		"factionId", "cityId", "status", "loyalty", "stamina", "level", "experience", "troops",
		"armsTypeId", "equipmentItemIds", "appearanceYear", "appearanceCityId",
		"captorFactionId", "formerFactionId", "death",
	],
	"death": ["cause", "turn", "year", "month", "cityId", "responsibleFactionId"],
	"item": [
		"id", "sourceId", "name", "forceBonus", "intelligenceBonus", "moveBonus",
		"armsTypeOverride", "appearanceYear", "appearanceCityId",
	],
	"armsType": ["id", "name", "attackModifier", "defenseModifier", "mobility"],
	"strategicOrder": [
		"id", "kind", "factionId", "officerId", "sourceCityId", "targetCityId",
		"routeCityIds", "createdTurn", "createdYear", "createdMonth", "durationMonths",
		"remainingMonths", "cargo",
	],
	"strategicCargo": ["money", "food", "reserveTroops"],
	"log": ["id", "turn", "kind", "message"],
}


static func validate(state: Dictionary) -> Array[Dictionary]:
	var issues: Array[Dictionary] = []
	_validate_allowed_keys(state, ALLOWED["state"], "state", issues)
	_validate_object(state.get("usage"), ALLOWED["usage"], "usage", issues, true)
	_validate_object(state.get("provenance"), ALLOWED["provenance"], "provenance", issues, true)
	_validate_object(state.get("scenario"), ALLOWED["scenario"], "scenario", issues, true)
	_validate_object(state.get("calendar"), ALLOWED["calendar"], "calendar", issues)
	_validate_object(state.get("lifecyclePolicy"), ALLOWED["lifecyclePolicy"], "lifecyclePolicy", issues)
	_validate_object(state.get("graph"), ALLOWED["graph"], "graph", issues, true)
	_validate_record(state.get("factions"), ALLOWED["faction"], "factions", issues)
	_validate_record(state.get("cities"), ALLOWED["city"], "cities", issues)
	_validate_record(state.get("officers"), ALLOWED["officer"], "officers", issues)
	var raw_officers: Variant = state.get("officers")
	if raw_officers is Dictionary:
		var officers: Dictionary = raw_officers
		var officer_ids: Array[String] = []
		for raw_officer_id: Variant in officers.keys():
			officer_ids.append(str(raw_officer_id))
		officer_ids.sort()
		for officer_id: String in officer_ids:
			var raw_officer: Variant = officers[officer_id]
			if raw_officer is Dictionary and (raw_officer as Dictionary).has("death"):
				_validate_object(
					(raw_officer as Dictionary)["death"], ALLOWED["death"],
					"officers.%s.death" % officer_id, issues
				)
	_validate_record(state.get("items"), ALLOWED["item"], "items", issues)
	_validate_record(state.get("armsTypes"), ALLOWED["armsType"], "armsTypes", issues)
	_validate_record(state.get("strategicOrders"), ALLOWED["strategicOrder"], "strategicOrders", issues)
	var raw_orders: Variant = state.get("strategicOrders")
	if raw_orders is Dictionary:
		var orders: Dictionary = raw_orders
		var order_ids: Array[String] = []
		for raw_order_id: Variant in orders.keys(): order_ids.append(str(raw_order_id))
		order_ids.sort()
		for order_id: String in order_ids:
			var raw_order: Variant = orders[order_id]
			if raw_order is Dictionary and (raw_order as Dictionary).has("cargo"):
				_validate_object(
					(raw_order as Dictionary)["cargo"], ALLOWED["strategicCargo"],
					"strategicOrders.%s.cargo" % order_id, issues
				)
	var logs: Variant = state.get("logs")
	if logs is Array:
		for index: int in range((logs as Array).size()):
			_validate_object((logs as Array)[index], ALLOWED["log"], "logs.%d" % index, issues)
	return issues


static func _validate_record(
		raw: Variant, allowed: Array, path: String, issues: Array[Dictionary]
) -> void:
	if typeof(raw) != TYPE_DICTIONARY:
		return
	var record: Dictionary = raw
	var keys: Array[String] = []
	for raw_key: Variant in record.keys():
		keys.append(str(raw_key))
	keys.sort()
	for key: String in keys:
		_validate_object(record[key], allowed, "%s.%s" % [path, key], issues)


static func _validate_object(
		raw: Variant,
		allowed: Array,
		path: String,
		issues: Array[Dictionary],
		optional: bool = false,
) -> void:
	if raw == null and optional:
		return
	if typeof(raw) != TYPE_DICTIONARY:
		return
	_validate_allowed_keys(raw, allowed, path, issues)


static func _validate_allowed_keys(
		record: Dictionary, allowed: Array, path: String, issues: Array[Dictionary]
) -> void:
	var keys: Array[String] = []
	for raw_key: Variant in record.keys():
		keys.append(str(raw_key))
	keys.sort()
	for key: String in keys:
		if not allowed.has(key):
			issues.append({"path": "%s.%s" % [path, key], "message": "is an unknown field"})
