class_name ApplicationStringContract
extends RefCounted


static func is_non_blank(raw: Variant) -> bool:
	if typeof(raw) != TYPE_STRING:
		return false
	var value: String = raw
	for index: int in range(value.length()):
		if not _is_ecmascript_trim_code_point(value.unicode_at(index)):
			return true
	return false


static func _is_ecmascript_trim_code_point(code_point: int) -> bool:
	if code_point >= 0x0009 and code_point <= 0x000d:
		return true
	if code_point >= 0x2000 and code_point <= 0x200a:
		return true
	return code_point in [
		0x0020, 0x00a0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
	]
