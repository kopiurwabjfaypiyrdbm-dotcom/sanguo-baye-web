extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")

const SAVE_FORMAT: String = "sanguo-baye-godot-spike"
const SAVE_VERSION: int = 1

var _save_path: String


func _init(save_path: String = "user://godot-spike-save.json") -> void:
	_save_path = save_path


func save(state: GameState, label: String = "", saved_at: String = "") -> Dictionary:
	var state_data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate(state_data)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))

	var envelope: Dictionary = {
		"format": SAVE_FORMAT,
		"version": SAVE_VERSION,
		"savedAt": saved_at if not saved_at.is_empty() else Time.get_datetime_string_from_system(true),
		"state": state_data,
	}
	if not label.is_empty():
		envelope["label"] = label

	var base_dir: String = _save_path.get_base_dir()
	if not base_dir.is_empty():
		var absolute_base_dir: String = ProjectSettings.globalize_path(base_dir)
		var directory_error: Error = DirAccess.make_dir_recursive_absolute(absolute_base_dir)
		if directory_error != OK and directory_error != ERR_ALREADY_EXISTS:
			return _failure("无法创建存档目录：%s（错误 %d）" % [base_dir, directory_error])

	var file: FileAccess = FileAccess.open(_save_path, FileAccess.WRITE)
	if file == null:
		return _failure("无法写入存档：%s（错误 %d）" % [_save_path, FileAccess.get_open_error()])
	file.store_string(JSON.stringify(envelope, "\t", true))
	var write_error: Error = file.get_error()
	file.close()
	if write_error != OK:
		return _failure("写入存档失败：%s（错误 %d）" % [_save_path, write_error])
	return {
		"ok": true,
		"error": "",
		"path": _save_path,
		"envelope": envelope.duplicate(true),
	}


func load() -> Dictionary:
	if not FileAccess.file_exists(_save_path):
		return _failure("存档不存在：%s" % _save_path)
	var file: FileAccess = FileAccess.open(_save_path, FileAccess.READ)
	if file == null:
		return _failure("无法读取存档：%s（错误 %d）" % [_save_path, FileAccess.get_open_error()])
	var contents: String = file.get_as_text()
	var read_error: Error = file.get_error()
	file.close()
	if read_error != OK:
		return _failure("读取存档失败：%s（错误 %d）" % [_save_path, read_error])

	var parser: JSON = JSON.new()
	var parse_error: Error = parser.parse(contents)
	if parse_error != OK:
		return _failure(
			"存档不是有效的 JSON（第 %d 行：%s）" % [parser.get_error_line(), parser.get_error_message()]
		)
	if typeof(parser.data) != TYPE_DICTIONARY:
		return _failure("存档根节点必须是对象")
	var envelope: Dictionary = parser.data
	if envelope.get("format") != SAVE_FORMAT:
		return _failure("无法识别该存档格式")
	if not _is_integer_number(envelope.get("version")) \
			or int(envelope.get("version", -1)) != SAVE_VERSION:
		return _failure("不支持的存档版本：%s" % str(envelope.get("version")))
	if typeof(envelope.get("savedAt")) != TYPE_STRING or String(envelope.get("savedAt")).is_empty():
		return _failure("存档缺少保存时间")
	if envelope.has("label") and typeof(envelope["label"]) != TYPE_STRING:
		return _failure("存档标签必须是字符串")
	if typeof(envelope.get("state")) != TYPE_DICTIONARY:
		return _failure("存档中的游戏状态无效")

	var state_data: Dictionary = envelope["state"]
	var issues: Array[Dictionary] = Validator.validate(state_data)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	var loaded_state: GameState = GameState.new(state_data)
	return {
		"ok": true,
		"error": "",
		"path": _save_path,
		"envelope": envelope.duplicate(true),
		"state": loaded_state,
	}


func get_save_path() -> String:
	return _save_path


static func _is_integer_number(raw: Variant) -> bool:
	return (typeof(raw) == TYPE_INT or typeof(raw) == TYPE_FLOAT) \
		and is_finite(float(raw)) \
		and floor(float(raw)) == float(raw)


static func _failure(reason: String) -> Dictionary:
	return {
		"ok": false,
		"error": reason,
	}
