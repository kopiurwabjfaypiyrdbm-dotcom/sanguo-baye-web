## Month-end preflight review aligned with Web `buildMonthAdvanceReview`.
## Presentation consumes the DTO; GameSession remains the only mutator.
class_name MonthAdvanceReview
extends RefCounted

const MonthlyEconomy = preload("res://src/domain/progression/monthly_economy.gd")

const VULNERABLE_GARRISON := 500

const CONDITION_LABELS := {
	"famine": "饥荒",
	"drought": "旱灾",
	"flood": "水灾",
	"rebellion": "暴动",
}


static func build(snapshot: Dictionary) -> Dictionary:
	var player_faction_id := str(snapshot.get("playerFactionId", ""))
	var calendar := _as_dict(snapshot.get("calendar", {}))
	var cities := _as_dict(snapshot.get("cities", {}))
	var officers := _as_dict(snapshot.get("officers", {}))
	var factions := _as_dict(snapshot.get("factions", {}))
	var acted_ids: Array = snapshot.get("actedOfficerIds", []) if snapshot.get("actedOfficerIds") is Array else []
	var player_city_ids: Array[String] = []
	for raw_city_id: Variant in snapshot.get("cityOrder", cities.keys()):
		var city_id := str(raw_city_id)
		var city := _as_dict(cities.get(city_id, {}))
		if str(city.get("ownerId", "")) == player_faction_id:
			player_city_ids.append(city_id)
	var serving: Array[Dictionary] = []
	for raw_officer_id: Variant in snapshot.get("officerOrder", officers.keys()):
		var officer_id := str(raw_officer_id)
		var officer := _as_dict(officers.get(officer_id, {}))
		if str(officer.get("status", "")) != "serving":
			continue
		if str(officer.get("factionId", "")) != player_faction_id:
			continue
		if str(officer.get("cityId", "")).is_empty():
			continue
		serving.append(officer)
	var available: Array[Dictionary] = []
	for officer: Dictionary in serving:
		if not acted_ids.has(str(officer.get("id", ""))):
			available.append(officer)
	var acted_player_count := 0
	for raw_id: Variant in acted_ids:
		var officer := _as_dict(officers.get(str(raw_id), {}))
		if str(officer.get("factionId", "")) == player_faction_id:
			acted_player_count += 1
	var next_month := int(calendar.get("month", 1)) + 1
	var next_year := int(calendar.get("year", 0))
	if next_month > 12:
		next_month = 1
		next_year += 1
	var next_calendar := {"year": next_year, "month": next_month}
	var supported: Dictionary = MonthlyEconomy.supported_officers_by_city(snapshot)
	var notices: Array[Dictionary] = []
	if not available.is_empty():
		notices.append({
			"id": "available-officers",
			"tone": "info",
			"title": "尚有 %d 名驻城武将未行动" % available.size(),
			"detail": "结束本月后，本月未使用的行动机会不会保留。",
			"cityId": "",
		})
	for city_id: String in player_city_ids:
		var city := _as_dict(cities.get(city_id, {}))
		var city_name := str(city.get("name", city_id))
		var stationed := 0
		for officer: Dictionary in serving:
			if str(officer.get("cityId", "")) == city_id:
				stationed += 1
		if stationed == 0:
			notices.append({
				"id": "empty-%s" % city_id,
				"tone": "critical",
				"title": "%s没有驻城武将" % city_name,
				"detail": "空城无法执行命令，且受到进攻时没有武将部队守备。",
				"cityId": city_id,
			})
		var supported_ids: Array = supported.get(city_id, [])
		var supported_troops := 0
		var forecast_troops := 0
		for raw_officer_id: Variant in supported_ids:
			var officer := _as_dict(officers.get(str(raw_officer_id), {}))
			if str(officer.get("factionId", "")) != player_faction_id:
				continue
			var troops := int(officer.get("troops", 0))
			supported_troops += troops
			if str(officer.get("cityId", "")) != city_id:
				forecast_troops += troops
				continue
			var condition := str(city.get("condition", "normal"))
			if condition == "drought" or condition == "flood":
				forecast_troops += troops - floori(float(troops) / 4.0)
			elif condition == "rebellion":
				forecast_troops += floori(float(troops) / 2.0)
			else:
				forecast_troops += troops
		var growth := _city_growth(city, next_calendar, forecast_troops)
		var available_food := int(city.get("food", 0)) + int(growth.get("food", 0))
		if available_food <= int(growth.get("upkeep", 0)):
			notices.append({
				"id": "food-%s" % city_id,
				"tone": "critical",
				"title": "%s预计粮草不足" % city_name,
				"detail": "按当前驻军估算，下月可用粮 %d、军粮消耗 %d；若局势不变，驻军与受该城支持的在途部队会减员。" % [
					available_food, int(growth.get("upkeep", 0))
				],
				"cityId": city_id,
			})
		var hostile_border := false
		for raw_neighbor: Variant in city.get("neighbors", []):
			var neighbor := _as_dict(cities.get(str(raw_neighbor), {}))
			if neighbor.is_empty():
				continue
			if str(neighbor.get("ownerId", "")) == player_faction_id:
				continue
			var neighbor_faction := _as_dict(factions.get(str(neighbor.get("ownerId", "")), {}))
			if bool(neighbor_faction.get("isNeutral", false)):
				continue
			hostile_border = true
			break
		var garrison := supported_troops + int(city.get("reserveTroops", 0))
		if hostile_border and garrison < VULNERABLE_GARRISON:
			notices.append({
				"id": "border-%s" % city_id,
				"tone": "warning",
				"title": "%s边境守备薄弱" % city_name,
				"detail": "现有驻军与后备兵合计 %d；敌军是否进攻仍取决于其月度决策。" % garrison,
				"cityId": city_id,
			})
		var condition := str(city.get("condition", "normal"))
		if condition != "normal" and CONDITION_LABELS.has(condition):
			notices.append({
				"id": "condition-%s" % city_id,
				"tone": "warning",
				"title": "%s仍处于%s" % [city_name, CONDITION_LABELS[condition]],
				"detail": "月末将继续按现有规则结算影响；能否自然恢复取决于当前城市状态。",
				"cityId": city_id,
			})
	var strategic_order_count := 0
	for raw_order: Variant in _as_dict(snapshot.get("strategicOrders", {})).values():
		if str(_as_dict(raw_order).get("factionId", "")) == player_faction_id:
			strategic_order_count += 1
	var diplomatic_order_count := 0
	for raw_order: Variant in _as_dict(snapshot.get("diplomaticOrders", {})).values():
		if str(_as_dict(raw_order).get("factionId", "")) == player_faction_id:
			diplomatic_order_count += 1
	if strategic_order_count + diplomatic_order_count > 0:
		notices.append({
			"id": "active-orders",
			"tone": "info",
			"title": "%d 项命令将在月末推进" % (strategic_order_count + diplomatic_order_count),
			"detail": "含 %d 项调动或输送、%d 项谋略；到期命令将按既有确定性规则结算。" % [
				strategic_order_count, diplomatic_order_count
			],
			"cityId": "",
		})
	var actions: Array[String] = []
	var turn := int(snapshot.get("turn", 0))
	var logs: Array = snapshot.get("logs", []) if snapshot.get("logs") is Array else []
	for index: int in range(maxi(0, logs.size() - 6), logs.size()):
		var entry := _as_dict(logs[index])
		if int(entry.get("turn", -1)) != turn:
			continue
		var kind := str(entry.get("kind", ""))
		if kind != "map" and kind != "battle":
			continue
		actions.append(str(entry.get("message", "")))
	return {
		"year": int(calendar.get("year", 0)),
		"month": int(calendar.get("month", 0)),
		"actedOfficerCount": acted_player_count,
		"availableOfficerCount": available.size(),
		"playerCityCount": player_city_ids.size(),
		"actions": actions,
		"notices": notices,
		"strategicOrderCount": strategic_order_count,
		"diplomaticOrderCount": diplomatic_order_count,
	}


static func _city_growth(city: Dictionary, calendar: Dictionary, stationed_troops: int) -> Dictionary:
	var month := int(calendar.get("month", 0))
	return {
		"money": floori(float(int(city.get("commerce", 0))) / 2.0) if month % 3 == 0 else 0,
		"food": floori(float(int(city.get("farming", 0))) / 4.0) if month == 6 or month == 10 else 0,
		"upkeep": floori(float(int(city.get("reserveTroops", 0)) + stationed_troops) / 50.0),
	}


static func _as_dict(value: Variant) -> Dictionary:
	return value if value is Dictionary else {}
