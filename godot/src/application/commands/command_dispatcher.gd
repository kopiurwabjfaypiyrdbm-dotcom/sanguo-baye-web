class_name CommandDispatcher
extends RefCounted

const DevelopFarming = preload("res://src/domain/commands/develop_farming_command.gd")

const ENVELOPE_VERSION: int = 1
const ENVELOPE_KEYS: Array[String] = [
	"commandEnvelopeVersion", "commandId", "expectedStateSha256", "kind", "parameters",
]
const DEVELOP_FARMING_KEYS: Array[String] = ["cityId", "officerId"]


static func validate_envelope(raw: Variant) -> Dictionary:
	if typeof(raw) != TYPE_DICTIONARY:
		return _failure("invalid_envelope", "command envelope must be an object")
	var envelope: Dictionary = raw
	var unknown_keys: Array[String] = _unknown_keys(envelope, ENVELOPE_KEYS)
	if not unknown_keys.is_empty():
		return _failure("invalid_envelope", "unknown command envelope field: %s" % unknown_keys[0])
	for key: String in ENVELOPE_KEYS:
		if not envelope.has(key):
			return _failure("invalid_envelope", "missing command envelope field: %s" % key)
	if not _is_integer(envelope["commandEnvelopeVersion"]) \
			or int(envelope["commandEnvelopeVersion"]) != ENVELOPE_VERSION:
		return _failure("unsupported_version", "commandEnvelopeVersion must be 1")
	if not _is_non_blank_string(envelope["commandId"]):
		return _failure("invalid_command_id", "commandId must be a non-blank string")
	if not _is_sha256(envelope["expectedStateSha256"]):
		return _failure("invalid_expected_digest", "expectedStateSha256 must be a lowercase SHA-256 digest")
	if not _is_non_blank_string(envelope["kind"]):
		return _failure("invalid_kind", "kind must be a non-blank string")
	if typeof(envelope["parameters"]) != TYPE_DICTIONARY:
		return _failure("invalid_parameters", "parameters must be an object")

	var kind: String = envelope["kind"]
	if kind != "develop_farming":
		return _failure("unknown_command", "unsupported command kind: %s" % kind)
	var parameters: Dictionary = envelope["parameters"]
	unknown_keys = _unknown_keys(parameters, DEVELOP_FARMING_KEYS)
	if not unknown_keys.is_empty():
		return _failure("invalid_parameters", "unknown develop_farming parameter: %s" % unknown_keys[0])
	for key: String in DEVELOP_FARMING_KEYS:
		if not parameters.has(key) or not _is_non_blank_string(parameters[key]):
			return _failure("invalid_parameters", "%s must be a non-blank string" % key)
	return {
		"ok": true,
		"code": "ok",
		"error": "",
		"envelope": envelope.duplicate(true),
	}


static func dispatch(state: RefCounted, envelope: Dictionary) -> Dictionary:
	match String(envelope["kind"]):
		"develop_farming":
			var parameters: Dictionary = envelope["parameters"]
			return DevelopFarming.execute(state, parameters["cityId"], parameters["officerId"])
	return _failure("unknown_command", "unsupported command kind: %s" % envelope["kind"])


static func _unknown_keys(record: Dictionary, allowed: Array[String]) -> Array[String]:
	var result: Array[String] = []
	for raw_key: Variant in record.keys():
		var key: String = str(raw_key)
		if not allowed.has(key):
			result.append(key)
	result.sort()
	return result


static func _is_integer(raw: Variant) -> bool:
	return (typeof(raw) == TYPE_INT or typeof(raw) == TYPE_FLOAT) and floor(float(raw)) == float(raw)


static func _is_non_blank_string(raw: Variant) -> bool:
	return typeof(raw) == TYPE_STRING and not String(raw).strip_edges().is_empty()


static func _is_sha256(raw: Variant) -> bool:
	if typeof(raw) != TYPE_STRING or String(raw).length() != 64:
		return false
	for character: String in String(raw):
		if not "0123456789abcdef".contains(character):
			return false
	return true


static func _failure(code: String, error: String) -> Dictionary:
	return {"ok": false, "code": code, "error": error}
