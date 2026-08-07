extends RefCounted

const Commands = preload("res://src/domain/commands/manpower_commands.gd")
const StringContract = preload("res://src/application/commands/application_string_contract.gd")

const PARAMETER_KEYS: Dictionary = {
	"recruit_troops": ["cityId", "officerId", "amount"],
	"distribute_troops": ["cityId", "officerId", "targetTroops"],
}


static func validate_parameters(kind: String, parameters: Dictionary) -> Dictionary:
	if not PARAMETER_KEYS.has(kind):
		return _failure("unsupported manpower command: %s" % kind)
	var allowed: Array = PARAMETER_KEYS[kind]
	var unknown: Array[String] = []
	for raw_key: Variant in parameters.keys():
		var key := str(raw_key)
		if not allowed.has(key):
			unknown.append(key)
	unknown.sort()
	if not unknown.is_empty():
		return _failure("unknown %s parameter: %s" % [kind, unknown[0]])
	for key: String in ["cityId", "officerId"]:
		if not parameters.has(key):
			return _failure("%s is required" % key)
		if not StringContract.is_non_blank(parameters[key]):
			return _failure("%s must be a non-blank string" % key)
	if kind == "recruit_troops" and parameters.has("amount"):
		if not _is_safe_integer(parameters["amount"]) or int(parameters["amount"]) <= 0:
			return _failure("amount must be a positive safe integer")
	if kind == "distribute_troops":
		if not parameters.has("targetTroops"):
			return _failure("targetTroops is required")
		if not _is_safe_integer(parameters["targetTroops"]) or int(parameters["targetTroops"]) < 0:
			return _failure("targetTroops must be a non-negative safe integer")
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
