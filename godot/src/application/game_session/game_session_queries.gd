class_name GameSessionQueries
extends RefCounted

const DevelopFarming = preload("res://src/domain/commands/develop_farming_command.gd")
const Rulesets = preload("res://src/domain/rules/campaign_rulesets.gd")


static func city(state: RefCounted, city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var cities: Dictionary = data["cities"]
	if not cities.has(city_id):
		return {"found": false, "city": {}, "developFarming": {"allowed": false, "reason": "未知城池"}}
	var officer_id: String = find_default_executor(state, city_id)
	var availability: Dictionary = {"allowed": false, "reason": "没有可执行开垦的武将"}
	if not officer_id.is_empty():
		availability = DevelopFarming.get_availability(state, city_id, officer_id)
	availability["defaultOfficerId"] = officer_id
	return {
		"found": true,
		"city": (cities[city_id] as Dictionary).duplicate(true),
		"developFarming": availability.duplicate(true),
	}


static func find_default_executor(state: RefCounted, city_id: String) -> String:
	var data: Dictionary = state.snapshot()
	var cities: Dictionary = data["cities"]
	if not cities.has(city_id):
		return ""
	var city_data: Dictionary = cities[city_id]
	if city_data["ownerId"] != data["activeFactionId"]:
		return ""
	var cost: Dictionary = Rulesets.get_develop_cost(data["rulesetId"])
	if cost.is_empty() or int(city_data["money"]) < int(cost["money"]):
		return ""
	if city_data.has("farmingLimit") and int(city_data["farming"]) >= int(city_data["farmingLimit"]):
		return ""
	var officers: Dictionary = data["officers"]
	var acted_ids: Array = data["actedOfficerIds"]
	for raw_officer_id: Variant in data["officerOrder"]:
		var officer_id: String = raw_officer_id
		var officer: Dictionary = officers[officer_id]
		if officer["status"] == "serving" \
				and officer["factionId"] == data["activeFactionId"] \
				and officer.get("cityId", "") == city_id \
				and int(officer["stamina"]) >= int(cost["stamina"]) \
				and not acted_ids.has(officer_id):
			return officer_id
	return ""
