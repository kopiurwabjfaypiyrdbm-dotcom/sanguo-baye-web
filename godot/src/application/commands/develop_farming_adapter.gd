extends RefCounted

const DevelopFarming = preload("res://src/domain/commands/develop_farming_command.gd")
const StringContract = preload("res://src/application/commands/application_string_contract.gd")
const PARAMETER_KEYS: Array[String] = ["cityId", "officerId"]


static func validate_parameters(parameters: Dictionary) -> Dictionary:
	var unknown_keys: Array[String] = []
	for raw_key: Variant in parameters.keys():
		var key: String = str(raw_key)
		if not PARAMETER_KEYS.has(key):
			unknown_keys.append(key)
	unknown_keys.sort()
	if not unknown_keys.is_empty():
		return _failure("unknown develop_farming parameter: %s" % unknown_keys[0])
	for key: String in PARAMETER_KEYS:
		if not parameters.has(key) \
				or not StringContract.is_non_blank(parameters[key]):
			return _failure("%s must be a non-blank string" % key)
	return {"ok": true, "error": ""}


static func execute(state: RefCounted, parameters: Dictionary) -> Dictionary:
	return DevelopFarming.execute(state, parameters["cityId"], parameters["officerId"])


static func _failure(error: String) -> Dictionary:
	return {"ok": false, "error": error}
