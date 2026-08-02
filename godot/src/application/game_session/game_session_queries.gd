class_name GameSessionQueries
extends RefCounted

const DevelopFarming = preload("res://src/domain/commands/develop_farming_command.gd")


static func city(state: RefCounted, city_id: String) -> Dictionary:
	var data: Dictionary = state.snapshot()
	var cities: Dictionary = data["cities"]
	if not cities.has(city_id):
		return {"found": false, "city": {}, "developFarming": _unavailable("未知城池")}
	return {
		"found": true,
		"city": (cities[city_id] as Dictionary).duplicate(true),
		"developFarming": _develop_farming(state, data, city_id),
	}


static func find_default_executor(state: RefCounted, city_id: String) -> String:
	var result: Dictionary = city(state, city_id)
	if not result["found"]:
		return ""
	return String((result["developFarming"] as Dictionary)["defaultOfficerId"])


static func _develop_farming(state: RefCounted, data: Dictionary, city_id: String) -> Dictionary:
	var officers: Dictionary = data["officers"]
	var executors: Array[Dictionary] = []
	var domain_query: Dictionary = DevelopFarming.list_available_executors(state, city_id)
	for raw_officer_id: Variant in domain_query["executorIds"]:
		var officer_id: String = raw_officer_id
		var officer: Dictionary = officers[officer_id]
		executors.append({
			"id": officer_id,
			"name": officer["name"],
			"stamina": int(officer["stamina"]),
		})
	return {
		"allowed": not executors.is_empty(),
		"reason": "" if not executors.is_empty() else domain_query["reason"],
		"defaultOfficerId": "" if executors.is_empty() else executors[0]["id"],
		"executors": executors,
	}


static func _unavailable(reason: String) -> Dictionary:
	return {"allowed": false, "reason": reason, "defaultOfficerId": "", "executors": []}
