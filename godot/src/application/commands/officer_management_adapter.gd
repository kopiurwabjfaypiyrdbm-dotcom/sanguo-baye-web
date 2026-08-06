extends RefCounted

const Commands = preload("res://src/domain/commands/officer_management_commands.gd")
const StringContract = preload("res://src/application/commands/application_string_contract.gd")

const PARAMETER_KEYS: Dictionary = {
	"reward_officer": ["cityId", "officerId"],
	"appoint_satrap": ["cityId", "officerId"],
	"give_item": ["cityId", "officerId", "itemId"],
	"unequip_item": ["cityId", "officerId", "itemId"],
}


static func validate_parameters(kind: String, parameters: Dictionary) -> Dictionary:
	if not PARAMETER_KEYS.has(kind):
		return _failure("unsupported officer-management command: %s" % kind)
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
	for key: String in allowed:
		if not StringContract.is_non_blank(parameters[key]):
			return _failure("%s must be a non-blank string" % key)
	return {"ok": true, "error": ""}


static func execute(kind: String, state: RefCounted, parameters: Dictionary) -> Dictionary:
	return Commands.execute(state, kind, parameters)


static func _failure(error: String) -> Dictionary:
	return {"ok": false, "error": error}
