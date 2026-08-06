class_name CampaignCalendarEvents
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const CoreLcg = preload("res://src/domain/random/core_lcg.gd")

const CONDITION_LABELS: Dictionary = {
	"normal": "正常", "famine": "饥荒", "drought": "旱灾", "flood": "水灾", "rebellion": "暴动",
}


static func advance_calendar(calendar: Dictionary) -> Dictionary:
	return {"year": int(calendar["year"]) + 1, "month": 1} if int(calendar["month"]) == 12 \
			else {"year": int(calendar["year"]), "month": int(calendar["month"]) + 1}


static func apply_city_condition_effect(city: Dictionary) -> Dictionary:
	var condition: String = str(city.get("condition", "normal"))
	var next: Dictionary = city.duplicate(true)
	next["condition"] = condition
	if condition == "normal": return next
	next["farming"] = _reduce_by_fraction(int(city["farming"]), 20)
	if condition == "famine":
		next["commerce"] = _reduce_by_fraction(int(city["commerce"]), 20)
		next["publicLoyalty"] = _reduce_by_fraction(int(city.get("publicLoyalty", 70)), 20)
		next["reserveTroops"] = floori(float(city["reserveTroops"]) / 2.0)
		next["population"] = _reduce_by_fraction(int(city["population"]), 4)
	elif condition == "drought":
		next["food"] = _reduce_by_fraction(int(city["food"]), 20)
		next["reserveTroops"] = _reduce_by_fraction(int(city["reserveTroops"]), 4)
		next["population"] = _reduce_by_fraction(int(city["population"]), 4)
	elif condition == "flood":
		next["food"] = _reduce_by_fraction(int(city["food"]), 20)
		next["commerce"] = _reduce_by_fraction(int(city["commerce"]), 10)
		next["money"] = _reduce_by_fraction(int(city["money"]), 10)
		next["reserveTroops"] = _reduce_by_fraction(int(city["reserveTroops"]), 4)
		next["population"] = _reduce_by_fraction(int(city["population"]), 4)
	elif condition == "rebellion":
		next["food"] = _reduce_by_fraction(int(city["food"]), 20)
		next["commerce"] = _reduce_by_fraction(int(city["commerce"]), 20)
		next["money"] = _reduce_by_fraction(int(city["money"]), 20)
		next["publicLoyalty"] = _reduce_by_fraction(int(city.get("publicLoyalty", 70)), 10)
		next["reserveTroops"] = floori(float(city["reserveTroops"]) / 2.0)
	return next


static func resolve_city_condition(
		city: Dictionary, primary_roll: int, kind_roll: Variant = null, rebellion_roll: Variant = null
) -> String:
	var previous: String = str(city.get("condition", "normal"))
	if previous == "normal":
		if primary_roll <= int(city.get("disasterPrevention", 0)): return "normal"
		if kind_roll == 0: return "drought"
		if kind_roll == 1: return "flood"
		if kind_roll == 2 and rebellion_roll != null \
				and int(rebellion_roll) > int(city.get("publicLoyalty", 70)): return "rebellion"
		return "normal"
	if previous == "famine": return "normal" if int(city["food"]) > 0 else "famine"
	if previous == "drought" or previous == "flood":
		return "normal" if primary_roll < int(city.get("disasterPrevention", 0)) else previous
	return "normal" if primary_roll < int(city.get("publicLoyalty", 70)) else "rebellion"


static func settle_city_events(state: GameState, validate_result: bool = true) -> Dictionary:
	var before: Dictionary = state.snapshot()
	var next: Dictionary = before.duplicate(true)
	var seed: int = int(before["rngSeed"])
	var messages: Array[String] = []
	var transitions: Array[Dictionary] = []
	for raw_city_id: Variant in before["cityOrder"]:
		var city_id: String = str(raw_city_id)
		var source_city: Dictionary = before["cities"][city_id]
		var faction: Dictionary = before["factions"].get(source_city["ownerId"], {})
		if faction.is_empty() or bool(faction.get("isNeutral", false)):
			continue
		var previous: String = str(source_city.get("condition", "normal"))
		var affected: Dictionary = apply_city_condition_effect(source_city)
		var primary: Dictionary = CoreLcg.next_random(seed)
		seed = int(primary["seed"])
		var primary_roll: int = int(floor(float(primary["value"]) * 100.0))
		var kind_roll: Variant = null
		var rebellion_roll: Variant = null
		if previous == "normal" and primary_roll > int(affected.get("disasterPrevention", 0)):
			var kind_random: Dictionary = CoreLcg.next_random(seed)
			seed = int(kind_random["seed"])
			kind_roll = int(floor(float(kind_random["value"]) * 5.0))
			if kind_roll == 2:
				var rebellion_random: Dictionary = CoreLcg.next_random(seed)
				seed = int(rebellion_random["seed"])
				rebellion_roll = int(floor(float(rebellion_random["value"]) * 100.0))
		var condition: String = resolve_city_condition(affected, primary_roll, kind_roll, rebellion_roll)
		affected["condition"] = condition
		next["cities"][city_id] = affected
		if condition != previous:
			transitions.append({"cityId": city_id, "from": previous, "to": condition})
			if source_city["ownerId"] == before["playerFactionId"]:
				messages.append("%s已从%s中恢复。" % [source_city["name"], CONDITION_LABELS[previous]] \
						if condition == "normal" else "%s发生%s。" % [source_city["name"], CONDITION_LABELS[condition]])
	next["rngSeed"] = seed
	_append_logs(next, "turn", messages)
	if validate_result:
		var issues: Array[Dictionary] = Validator.validate_runtime(next)
		if not issues.is_empty(): return _failure(Validator.first_error(issues))
	return {"ok": true, "error": "", "next_state": GameState.new(next), "receipt": {
		"kind": "settle_city_events", "beforeSeed": before["rngSeed"], "afterSeed": seed,
		"transitions": transitions, "appendedLogs": (next["logs"] as Array).slice((before["logs"] as Array).size()).duplicate(true),
	}}


static func _reduce_by_fraction(value: int, divisor: int) -> int:
	return value - floori(float(value) / float(divisor))


static func _append_logs(data: Dictionary, kind: String, messages: Array[String]) -> void:
	var used: Dictionary = {}
	for raw_log: Variant in data["logs"]: used[(raw_log as Dictionary)["id"]] = true
	var serial: int = (data["logs"] as Array).size() + 1
	for message: String in messages:
		var log_id: String = "log-%d-%03d" % [int(data["turn"]), serial]
		while used.has(log_id): serial += 1; log_id = "log-%d-%03d" % [int(data["turn"]), serial]
		used[log_id] = true
		(data["logs"] as Array).append({"id": log_id, "kind": kind, "message": message, "turn": int(data["turn"])})
		serial += 1


static func _failure(error: String) -> Dictionary:
	return {"ok": false, "error": error, "next_state": null, "receipt": {}}
