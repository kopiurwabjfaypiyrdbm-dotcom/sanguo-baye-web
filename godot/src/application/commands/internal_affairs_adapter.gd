extends RefCounted

const Commands = preload("res://src/domain/commands/internal_affairs_commands.gd")
const StringContract = preload("res://src/application/commands/application_string_contract.gd")

const PARAMETER_KEYS: Dictionary = {
	"develop_commerce": ["cityId", "officerId"],
	"govern_city": ["cityId", "officerId"],
	"inspect_city": ["cityId", "officerId"],
	"trade_food": ["cityId", "officerId", "direction", "amount"],
	"banquet_officer": ["cityId", "targetOfficerId"],
	"plunder_city": ["cityId", "officerId"],
}


static func validate_parameters(kind: String, parameters: Dictionary) -> Dictionary:
	if not PARAMETER_KEYS.has(kind):
		return _failure("unsupported internal-affairs command: %s" % kind)
	var allowed: Array = PARAMETER_KEYS[kind]
	var unknown: Array[String] = []
	for raw_key: Variant in parameters.keys():
		var key: String = str(raw_key)
		if not allowed.has(key):
			unknown.append(key)
	unknown.sort()
	if not unknown.is_empty():
		return _failure("unknown %s parameter: %s" % [kind, unknown[0]])
	for key: String in allowed:
		if not parameters.has(key):
			return _failure("%s is required" % key)
	for key: String in ["cityId", "officerId", "targetOfficerId"]:
		if allowed.has(key) and not StringContract.is_non_blank(parameters[key]):
			return _failure("%s must be a non-blank string" % key)
	if kind == "trade_food":
		if typeof(parameters["direction"]) != TYPE_STRING \
				or not ["buy", "sell"].has(parameters["direction"]):
			return _failure("direction must be buy or sell")
		if not _is_safe_integer(parameters["amount"]) or int(parameters["amount"]) <= 0:
			return _failure("amount must be a positive safe integer")
	return {"ok": true, "error": ""}


static func execute(kind: String, state: RefCounted, parameters: Dictionary) -> Dictionary:
	return Commands.execute(state, kind, parameters)


static func _is_safe_integer(raw: Variant) -> bool:
	return (typeof(raw) == TYPE_INT or typeof(raw) == TYPE_FLOAT) \
			and is_finite(float(raw)) \
			and floor(float(raw)) == float(raw) \
			and absf(float(raw)) <= 9_007_199_254_740_991.0


static func _failure(error: String) -> Dictionary:
	return {"ok": false, "error": error}
