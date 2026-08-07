class_name TacticalBattleResult
extends RefCounted

## Deterministic terminal projection shared by tactical settlement and fixtures.
## This mirrors createTacticalBattleResult in src/core/tacticalBattle.ts.

static func from_snapshot(snapshot: Dictionary) -> Dictionary:
	if String(snapshot.get("status", "")) == "ongoing":
		return {"ok": false, "error": "战斗尚未结束", "result": {}}
	var status := String(snapshot.get("status", ""))
	if not ["attacker-won", "defender-won"].has(status):
		return {"ok": false, "error": "战斗终局状态无效", "result": {}}
	var winner := "attacker" if status == "attacker-won" else "defender"
	var casualties: Dictionary = {}
	var units: Dictionary = snapshot.get("units", {})
	for raw_id: Variant in _sorted_keys(units):
		var unit: Dictionary = units[raw_id]
		var officer_id := String(unit.get("officerId", ""))
		if not officer_id.is_empty():
			casualties[officer_id] = maxi(0, int(unit.get("originalTroops", 0)) - int(unit.get("troops", 0)))
	var reserve_id := "reserve:%s" % String(snapshot.get("targetCityId", ""))
	var reserve: Dictionary = units.get(reserve_id, {})
	var guard: Dictionary = snapshot.get("guard", {})
	var reserve_losses := mini(
		int(guard.get("targetReserveTroops", 0)),
		maxi(0, int(reserve.get("originalTroops", 0)) - int(reserve.get("troops", 0)))
	)
	var attacker_score := _side_troops(units, "attacker")
	var defender_score := _side_troops(units, "defender")
	var logs: Array[String] = []
	var source_logs: Array = snapshot.get("logs", [])
	var start := maxi(0, source_logs.size() - 6)
	for index in range(start, source_logs.size()): logs.append(String(source_logs[index]))
	logs.append("战后兵力：攻方 %d，守方 %d。" % [attacker_score, defender_score])
	logs.append("攻方赢得战斗并占领目标城池。" if winner == "attacker" else "守方赢得战斗并击退进攻。")
	var result := {
		"battleId": snapshot.get("id", ""), "turn": int(snapshot.get("strategicTurn", 0)),
		"seedBefore": int(snapshot.get("seedBefore", 0)), "nextRngSeed": int(snapshot.get("rngSeed", 0)),
		"sourceCityId": snapshot.get("sourceCityId", ""), "targetCityId": snapshot.get("targetCityId", ""),
		"attackerFactionId": snapshot.get("attackerFactionId", ""), "defenderFactionId": snapshot.get("defenderFactionId", ""),
		"attackerOfficerIds": snapshot.get("attackerOfficerIds", []).duplicate(true),
		"defenderOfficerIds": snapshot.get("defenderOfficerIds", []).duplicate(true),
		"provisions": int(snapshot.get("provisionsCommitted", 0)), "winner": winner,
		"attackerScore": attacker_score, "defenderScore": defender_score, "casualties": casualties,
		"experienceGains": snapshot.get("experienceGains", {}).duplicate(true),
		"experienceGainOrder": _experience_order(snapshot),
		"defenderReserveLosses": reserve_losses, "cityCaptured": winner == "attacker",
		"guard": guard.duplicate(true),
		"targetFoodAfter": int(snapshot.get("attackerFood", 0)) + int(snapshot.get("defenderFood", 0)),
		"logs": logs,
	}
	return {"ok": true, "error": "", "result": result}


static func _side_troops(units: Dictionary, side: String) -> int:
	var total := 0
	for raw_id: Variant in _sorted_keys(units):
		var unit: Dictionary = units[raw_id]
		if String(unit.get("side", "")) == side: total += maxi(0, int(unit.get("troops", 0)))
	return total


static func _sorted_keys(value: Dictionary) -> Array:
	var result: Array = []
	for raw_key: Variant in value.keys(): result.append(String(raw_key))
	result.sort()
	return result


static func _experience_order(snapshot: Dictionary) -> Array:
	var order: Array = []
	if typeof(snapshot.get("experienceGainOrder")) == TYPE_ARRAY:
		for raw_id: Variant in snapshot["experienceGainOrder"]: order.append(String(raw_id))
	for raw_id: Variant in _sorted_keys(snapshot.get("experienceGains", {})):
		if not order.has(String(raw_id)): order.append(String(raw_id))
	return order
