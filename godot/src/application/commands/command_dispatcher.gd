class_name CommandDispatcher
extends RefCounted

const DevelopFarmingAdapter = preload("res://src/application/commands/develop_farming_adapter.gd")
const InternalAffairsAdapter = preload("res://src/application/commands/internal_affairs_adapter.gd")
const OfficerManagementAdapter = preload("res://src/application/commands/officer_management_adapter.gd")
const PersonnelLifecycleAdapter = preload("res://src/application/commands/personnel_lifecycle_adapter.gd")
const StrategicOrderAdapter = preload("res://src/application/commands/strategic_order_adapter.gd")
const StringContract = preload("res://src/application/commands/application_string_contract.gd")

const ENVELOPE_VERSION: int = 1
const ENVELOPE_KEYS: Array[String] = [
	"commandEnvelopeVersion", "commandId", "expectedStateSha256", "kind", "parameters",
]
const ADAPTERS: Dictionary = {
	"develop_farming": {"module": DevelopFarmingAdapter, "generic": false},
	"develop_commerce": {"module": InternalAffairsAdapter, "generic": true},
	"govern_city": {"module": InternalAffairsAdapter, "generic": true},
	"inspect_city": {"module": InternalAffairsAdapter, "generic": true},
	"trade_food": {"module": InternalAffairsAdapter, "generic": true},
	"banquet_officer": {"module": InternalAffairsAdapter, "generic": true},
	"plunder_city": {"module": InternalAffairsAdapter, "generic": true},
	"reward_officer": {"module": OfficerManagementAdapter, "generic": true},
	"appoint_satrap": {"module": OfficerManagementAdapter, "generic": true},
	"give_item": {"module": OfficerManagementAdapter, "generic": true},
	"unequip_item": {"module": OfficerManagementAdapter, "generic": true},
	"search_city": {"module": PersonnelLifecycleAdapter, "generic": true},
	"recruit_free_officer": {"module": PersonnelLifecycleAdapter, "generic": true},
	"recruit_captive": {"module": PersonnelLifecycleAdapter, "generic": true},
	"release_captive": {"module": PersonnelLifecycleAdapter, "generic": true},
	"execute_captive": {"module": PersonnelLifecycleAdapter, "generic": true},
	"banish_officer": {"module": PersonnelLifecycleAdapter, "generic": true},
	"confiscate_equipment": {"module": PersonnelLifecycleAdapter, "generic": true},
	"issue_move_order": {"module": StrategicOrderAdapter, "generic": true},
	"issue_transport_order": {"module": StrategicOrderAdapter, "generic": true},
}


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
	if not ADAPTERS.has(kind):
		return _failure("unknown_command", "unsupported command kind: %s" % kind)
	var parameters: Dictionary = envelope["parameters"]
	var adapter: Dictionary = ADAPTERS[kind]
	var parameter_result: Dictionary = adapter["module"].validate_parameters(kind, parameters) \
			if adapter["generic"] else adapter["module"].validate_parameters(parameters)
	if not parameter_result["ok"]:
		return _failure("invalid_parameters", parameter_result["error"])
	return {
		"ok": true,
		"code": "ok",
		"error": "",
		"envelope": envelope.duplicate(true),
	}


static func dispatch(state: RefCounted, envelope: Dictionary) -> Dictionary:
	var kind: String = envelope["kind"]
	if not ADAPTERS.has(kind):
		return _failure("unknown_command", "unsupported command kind: %s" % kind)
	var adapter: Dictionary = ADAPTERS[kind]
	return adapter["module"].execute(kind, state, envelope["parameters"]) \
			if adapter["generic"] else adapter["module"].execute(state, envelope["parameters"])


static func _unknown_keys(record: Dictionary, allowed: Array[String]) -> Array[String]:
	var result: Array[String] = []
	for raw_key: Variant in record.keys():
		var key: String = str(raw_key)
		if not allowed.has(key):
			result.append(key)
	result.sort()
	return result


static func _is_integer(raw: Variant) -> bool:
	return (typeof(raw) == TYPE_INT or typeof(raw) == TYPE_FLOAT) \
			and is_finite(float(raw)) \
			and floor(float(raw)) == float(raw)


static func _is_non_blank_string(raw: Variant) -> bool:
	return StringContract.is_non_blank(raw)


static func _is_sha256(raw: Variant) -> bool:
	if typeof(raw) != TYPE_STRING or String(raw).length() != 64:
		return false
	for character: String in String(raw):
		if not "0123456789abcdef".contains(character):
			return false
	return true


static func _failure(code: String, error: String) -> Dictionary:
	return {"ok": false, "code": code, "error": error}
