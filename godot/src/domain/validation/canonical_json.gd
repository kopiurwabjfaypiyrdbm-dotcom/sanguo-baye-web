class_name CanonicalJson
extends RefCounted

const ALGORITHM: String = "canonical-json-v1"
const DIGEST_ALGORITHM: String = "sha256"
const NUMBER_DOMAIN: String = "safe-integer-or-decimal-6-v1"
const MAX_SAFE_INTEGER: int = 9_007_199_254_740_991
const DECIMAL_SCALE: int = 1_000_000
const MAX_DECIMAL_MAGNITUDE: float = 9_000_000_000.0


static func try_encode(value: Variant) -> Dictionary:
	if value == null:
		return _success("null")
	match typeof(value):
		TYPE_BOOL:
			return _success("true" if value else "false")
		TYPE_INT:
			if absi(value) > MAX_SAFE_INTEGER:
				return _failure("canonical-json-v1 integer exceeds the safe integer domain")
			return _success(str(value))
		TYPE_FLOAT:
			var numeric: float = value
			if not is_finite(numeric):
				return _failure("canonical-json-v1 only accepts finite numbers")
			if numeric == floor(numeric) and absf(numeric) <= float(MAX_SAFE_INTEGER):
				return _success(str(int(numeric)))
			if absf(numeric) > MAX_DECIMAL_MAGNITUDE:
				return _failure("canonical-json-v1 decimal magnitude exceeds %s" % str(MAX_DECIMAL_MAGNITUDE))
			var scaled: int = roundi(numeric * float(DECIMAL_SCALE))
			var normalized: float = float(scaled) / float(DECIMAL_SCALE)
			if (scaled == 0 and numeric != 0.0) or absf(numeric - normalized) > 0.000000000001:
				return _failure("canonical-json-v1 accepts at most 6 decimal places")
			return _success(_format_scaled_decimal(scaled))
		TYPE_STRING, TYPE_STRING_NAME:
			return _success(JSON.stringify(String(value)))
		TYPE_ARRAY:
			var encoded_items: PackedStringArray = []
			for index: int in range(value.size()):
				var item_result: Dictionary = try_encode(value[index])
				if not item_result["ok"]:
					return _failure("array[%d]: %s" % [index, item_result["error"]])
				encoded_items.append(item_result["value"])
			return _success("[" + ",".join(encoded_items) + "]")
		TYPE_DICTIONARY:
			var keys: Array = value.keys()
			keys.sort_custom(_compare_keys)
			var encoded_entries: PackedStringArray = []
			for raw_key: Variant in keys:
				if typeof(raw_key) != TYPE_STRING and typeof(raw_key) != TYPE_STRING_NAME:
					return _failure("canonical-json-v1 requires string object keys")
				var key: String = String(raw_key)
				var value_result: Dictionary = try_encode(value[raw_key])
				if not value_result["ok"]:
					return _failure("object.%s: %s" % [key, value_result["error"]])
				encoded_entries.append(JSON.stringify(key) + ":" + value_result["value"])
			return _success("{" + ",".join(encoded_entries) + "}")
	return _failure("canonical-json-v1 cannot encode Variant type %d" % typeof(value))


static func try_sha256(value: Variant) -> Dictionary:
	var encoded: Dictionary = try_encode(value)
	if not encoded["ok"]:
		return encoded
	return _success(String(encoded["value"]).sha256_text())


static func _format_scaled_decimal(scaled: int) -> String:
	var sign_text: String = "-" if scaled < 0 else ""
	var absolute: int = absi(scaled)
	var integer_part: int = int(absolute / DECIMAL_SCALE)
	var fraction: String = "%06d" % (absolute % DECIMAL_SCALE)
	while fraction.ends_with("0"):
		fraction = fraction.substr(0, fraction.length() - 1)
	if fraction.is_empty():
		return sign_text + str(integer_part)
	return sign_text + str(integer_part) + "." + fraction


static func _success(value: String) -> Dictionary:
	return {"ok": true, "value": value, "error": ""}


static func _failure(error: String) -> Dictionary:
	return {"ok": false, "value": "", "error": error}


static func _compare_keys(left: Variant, right: Variant) -> bool:
	var left_text: String = String(left)
	var right_text: String = String(right)
	var shared_length: int = mini(left_text.length(), right_text.length())
	for index: int in range(shared_length):
		var difference: int = left_text.unicode_at(index) - right_text.unicode_at(index)
		if difference != 0:
			return difference < 0
	return left_text.length() < right_text.length()
