class_name SuccessionAdapter
extends RefCounted

const OfficerLifecycle = preload("res://src/domain/progression/officer_lifecycle.gd")
const StringContract = preload("res://src/application/commands/application_string_contract.gd")

const PARAMETER_KEYS: Array[String] = ["successorOfficerId"]


static func validate_parameters(_kind: String, parameters: Dictionary) -> Dictionary:
	var unknown: Array[String] = []
	for raw_key: Variant in parameters.keys():
		var key: String = str(raw_key)
		if not PARAMETER_KEYS.has(key): unknown.append(key)
	unknown.sort()
	if not unknown.is_empty(): return _failure("unknown command parameter: %s" % unknown[0])
	if not parameters.has("successorOfficerId"):
		return _failure("missing command parameter: successorOfficerId")
	if not StringContract.is_non_blank(parameters["successorOfficerId"]):
		return _failure("successorOfficerId must be a non-blank string")
	return {"ok": true, "error": ""}


static func execute(_kind: String, state: RefCounted, parameters: Dictionary) -> Dictionary:
	return OfficerLifecycle.resolve_succession(state, parameters["successorOfficerId"])


static func _failure(error: String) -> Dictionary:
	return {"ok": false, "error": error}
