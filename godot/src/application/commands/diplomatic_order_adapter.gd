extends RefCounted

const Commands = preload("res://src/domain/commands/diplomatic_order_commands.gd")
const StringContract = preload("res://src/application/commands/application_string_contract.gd")

const COMMAND_KINDS: Array[String] = [
	"issue_alienate_order", "issue_canvass_order",
	"issue_counterespionage_order", "issue_induce_order",
]
const PARAMETER_KEYS: Array[String] = ["sourceCityId", "officerId", "targetOfficerId"]


static func validate_parameters(kind: String, parameters: Dictionary) -> Dictionary:
	if not COMMAND_KINDS.has(kind): return _failure("unsupported diplomatic-order command: %s" % kind)
	var unknown: Array[String] = []
	for raw_key: Variant in parameters.keys():
		var key: String = str(raw_key)
		if not PARAMETER_KEYS.has(key): unknown.append(key)
	unknown.sort()
	if not unknown.is_empty(): return _failure("unknown %s parameter: %s" % [kind, unknown[0]])
	for key: String in PARAMETER_KEYS:
		if not parameters.has(key): return _failure("%s is required" % key)
		if not StringContract.is_non_blank(parameters[key]):
			return _failure("%s must be a non-blank string" % key)
	return {"ok": true, "error": ""}


static func execute(kind: String, state: RefCounted, parameters: Dictionary) -> Dictionary:
	return Commands.execute(state, kind, parameters)


static func _failure(error: String) -> Dictionary:
	return {"ok": false, "error": error}
