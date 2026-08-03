extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const CanonicalJson = preload("res://src/domain/validation/canonical_json.gd")
const ProductionDataRepository = preload("res://src/application/game_session/production_data_repository.gd")

const SAVE_FORMAT: String = "sanguo-baye-godot-spike"
const SAVE_VERSION: int = 1
const WEB_SAVE_FORMAT: String = "sanguo-baye-web"
const WEB_SAVE_VERSION: int = 1
const PRODUCTION_SAVE_FORMAT: String = "sanguo-baye-godot-production"
const PRODUCTION_SAVE_VERSION: int = 1
const PRODUCTION_LEGACY_SAVE_VERSION: int = 0
const PRODUCTION_DATA_CONTRACT_VERSION: int = 2
const PRODUCTION_RULESET_ID: String = "baye-classic-v1"
const PRODUCTION_CAMPAIGN_KEYS: Array[String] = [
	"productionDataContractVersion", "periodId", "title", "rulerSourceIndex",
	"playerFactionId", "rulerOfficerId", "rulerName",
]
const PRODUCTION_ENVELOPE_KEYS: Array[String] = [
	"format", "version", "dataContractVersion", "rulesetId", "saveRevision", "savedAt",
	"label", "campaign", "stateSha256", "state",
]
const PRODUCTION_LEGACY_ENVELOPE_KEYS: Array[String] = ["format", "version", "savedAt", "label", "state"]

var _save_path: String


func _init(save_path: String = "user://godot-spike-save.json") -> void:
	_save_path = save_path


func save(state: GameState, label: String = "", saved_at: String = "") -> Dictionary:
	var state_data: Dictionary = state.snapshot()
	if not _is_integer_number(state_data.get("dataContractVersion")) \
			or int(state_data.get("dataContractVersion")) != 1:
		return _failure("MB01 样片存档只接受 dataContractVersion 1")
	var issues: Array[Dictionary] = Validator.validate_runtime(state_data)
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

	return _write_envelope(envelope)


func save_production(
	state: GameState,
	campaign: Dictionary,
	label: String = "",
	saved_at: String = "",
) -> Dictionary:
	var envelope_result: Dictionary = create_production_envelope(state, campaign, label, saved_at)
	if not envelope_result["ok"]:
		return envelope_result
	var current_revision := current_save_revision()
	if current_revision < 0:
		return _failure("有效备用存档尚未安全提升，拒绝覆盖")
	if current_revision >= CanonicalJson.MAX_SAFE_INTEGER:
		return _failure("生产存档 saveRevision 已达到安全整数上限")
	envelope_result["envelope"]["saveRevision"] = current_revision + 1
	return _write_envelope(envelope_result["envelope"])


func create_production_envelope(
	state: GameState,
	campaign: Dictionary,
	label: String = "",
	saved_at: String = "",
) -> Dictionary:
	var state_data: Dictionary = state.snapshot()
	var issues: Array[Dictionary] = Validator.validate_runtime(state_data)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))
	if not _is_integer_number(state_data.get("dataContractVersion")) \
			or int(state_data.get("dataContractVersion")) != PRODUCTION_DATA_CONTRACT_VERSION:
		return _failure("生产存档只接受 dataContractVersion 2")
	if String(state_data.get("rulesetId", "")) != PRODUCTION_RULESET_ID:
		return _failure("生产存档 rulesetId 不匹配")
	var campaign_error: String = _validate_campaign(campaign, state_data)
	if not campaign_error.is_empty():
		return _failure(campaign_error)
	var digest: Dictionary = CanonicalJson.try_sha256(state_data)
	if not digest["ok"]:
		return _failure("生产存档无法计算状态摘要：%s" % digest["error"])
	var envelope: Dictionary = {
		"format": PRODUCTION_SAVE_FORMAT,
		"version": PRODUCTION_SAVE_VERSION,
		"dataContractVersion": PRODUCTION_DATA_CONTRACT_VERSION,
		"rulesetId": PRODUCTION_RULESET_ID,
		"saveRevision": 0,
		"savedAt": saved_at if not saved_at.is_empty() else Time.get_datetime_string_from_system(true),
		"campaign": campaign.duplicate(true),
		"stateSha256": digest["value"],
		"state": state_data,
	}
	if not label.is_empty():
		envelope["label"] = label
	return {"ok": true, "error": "", "envelope": envelope}


func current_save_revision() -> int:
	var result: Dictionary = self.load()
	if result.has("recoveryPromotionError"):
		return -1
	if not result.get("ok", false):
		return 0
	var envelope: Dictionary = result.get("envelope", {})
	if envelope.get("format", "") != PRODUCTION_SAVE_FORMAT or not _is_safe_revision(envelope.get("saveRevision")):
		return 0
	return maxi(0, int(envelope["saveRevision"]))


func load() -> Dictionary:
	var candidates: Array[String] = [_save_path, _save_path + ".tmp", _save_path + ".bak"]
	var found_candidate := false
	var primary_failed := false
	var last_failure: Dictionary = {}
	for candidate: String in candidates:
		if not FileAccess.file_exists(ProjectSettings.globalize_path(candidate)):
			continue
		found_candidate = true
		var candidate_result: Dictionary = _load_path(candidate)
		if candidate_result["ok"]:
			candidate_result["path"] = _save_path
			if candidate != _save_path:
				candidate_result["recoveredFrom"] = candidate
				if not _promote_fallback(candidate, primary_failed):
					candidate_result["recoveryPromotionError"] = "有效备用存档已读取，但无法提升为主存档"
			return candidate_result
		last_failure = candidate_result
		if candidate == _save_path:
			primary_failed = true
	if found_candidate:
		return last_failure
	return _failure("存档不存在：%s" % _save_path)


func _promote_fallback(candidate: String, replace_primary: bool = false) -> bool:
	var target_absolute := ProjectSettings.globalize_path(_save_path)
	var candidate_absolute := ProjectSettings.globalize_path(candidate)
	var invalid_absolute := target_absolute + ".invalid"
	var moved_invalid := false
	if FileAccess.file_exists(target_absolute):
		if not replace_primary:
			return true
		var invalid_index := 0
		while FileAccess.file_exists(invalid_absolute):
			invalid_index += 1
			invalid_absolute = "%s.invalid.%d" % [target_absolute, invalid_index]
		if DirAccess.rename_absolute(target_absolute, invalid_absolute) != OK:
			return false
		moved_invalid = true
	if DirAccess.rename_absolute(candidate_absolute, target_absolute) == OK:
		return true
	var promote_absolute := target_absolute + ".promote"
	if FileAccess.file_exists(promote_absolute):
		if DirAccess.remove_absolute(promote_absolute) != OK:
			return false
	if DirAccess.copy_absolute(candidate_absolute, promote_absolute) != OK:
		return false
	if DirAccess.rename_absolute(promote_absolute, target_absolute) != OK:
		DirAccess.remove_absolute(promote_absolute)
	else:
		return true
	if moved_invalid and DirAccess.rename_absolute(invalid_absolute, target_absolute) != OK:
		return false
	return false


func _load_path(path: String) -> Dictionary:
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	if file == null:
		return _failure("无法读取存档：%s（错误 %d）" % [path, FileAccess.get_open_error()])
	var contents: String = file.get_as_text()
	var read_error: Error = file.get_error()
	file.close()
	if read_error != OK:
		return _failure("读取存档失败：%s（错误 %d）" % [path, read_error])

	var parser: JSON = JSON.new()
	var parse_error: Error = parser.parse(contents)
	if parse_error != OK:
		return _failure(
			"存档不是有效的 JSON（第 %d 行：%s）" % [parser.get_error_line(), parser.get_error_message()]
		)
	if typeof(parser.data) != TYPE_DICTIONARY:
		return _failure("存档根节点必须是对象")
	var envelope: Dictionary = parser.data
	if envelope.get("format") == PRODUCTION_SAVE_FORMAT:
		return _load_production(envelope)
	if envelope.get("format") == WEB_SAVE_FORMAT:
		return _load_web_production(envelope)
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
	if not _is_integer_number(state_data.get("dataContractVersion")) \
			or int(state_data.get("dataContractVersion")) != 1:
		return _failure("MB01 样片存档只接受 dataContractVersion 1")
	var issues: Array[Dictionary] = Validator.validate_runtime(state_data)
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


func parse_production_envelope(envelope: Dictionary) -> Dictionary:
	return _load_production(envelope)


func _load_web_production(envelope: Dictionary) -> Dictionary:
	var allowed: Array[String] = ["format", "version", "savedAt", "label", "state"]
	var unknown: String = _first_unknown_key(envelope, allowed)
	if not unknown.is_empty(): return _failure("Web 存档包含未知字段：%s" % unknown)
	if envelope.get("format") != WEB_SAVE_FORMAT or not _is_integer_number(envelope.get("version")) \
			or int(envelope.get("version")) != WEB_SAVE_VERSION:
		return _failure("不支持的 Web 存档版本")
	if typeof(envelope.get("savedAt")) != TYPE_STRING or String(envelope["savedAt"]).is_empty():
		return _failure("Web 存档缺少保存时间")
	if envelope.has("label") and typeof(envelope["label"]) != TYPE_STRING:
		return _failure("Web 存档标签必须是字符串")
	if typeof(envelope.get("state")) != TYPE_DICTIONARY:
		return _failure("Web 存档中的游戏状态无效")
	var state_data: Dictionary = envelope["state"]
	var catalog_error := _validate_catalog_identity(state_data)
	if not catalog_error.is_empty(): return _failure(catalog_error)
	if not _is_integer_number(state_data.get("dataContractVersion")) \
			or int(state_data.get("dataContractVersion")) != PRODUCTION_DATA_CONTRACT_VERSION \
			or String(state_data.get("rulesetId", "")) != PRODUCTION_RULESET_ID:
		return _failure("Web 存档必须携带完整生产状态契约")
	var state_issues: Array[Dictionary] = Validator.validate_runtime(state_data)
	if not state_issues.is_empty(): return _failure(Validator.first_error(state_issues))
	return {
		"ok": true,
		"error": "",
		"path": _save_path,
		"envelope": envelope.duplicate(true),
		"state": GameState.new(state_data),
		"migrated": true,
	}


func _load_production(envelope: Dictionary) -> Dictionary:
	if envelope.get("format") != PRODUCTION_SAVE_FORMAT:
		return _failure("无法识别该生产存档格式")
	var version: Variant = envelope.get("version")
	if not _is_integer_number(version):
		return _failure("生产存档版本必须是整数")
	if int(version) == PRODUCTION_LEGACY_SAVE_VERSION:
		return _load_legacy_production(envelope)
	if int(version) != PRODUCTION_SAVE_VERSION:
		return _failure("不支持的生产存档版本：%s" % str(version))
	var unknown: String = _first_unknown_key(envelope, PRODUCTION_ENVELOPE_KEYS)
	if not unknown.is_empty():
		return _failure("生产存档包含未知字段：%s" % unknown)
	for key: String in ["format", "version", "dataContractVersion", "rulesetId", "saveRevision", "savedAt", "campaign", "stateSha256", "state"]:
		if not envelope.has(key):
			return _failure("生产存档缺少字段：%s" % key)
	if typeof(envelope["savedAt"]) != TYPE_STRING or String(envelope["savedAt"]).is_empty():
		return _failure("生产存档缺少保存时间")
	if not _is_safe_revision(envelope["saveRevision"]):
		return _failure("生产存档 saveRevision 必须是非负整数")
	if envelope.has("label") and typeof(envelope["label"]) != TYPE_STRING:
		return _failure("生产存档标签必须是字符串")
	if not _is_integer_number(envelope["dataContractVersion"]) \
			or int(envelope["dataContractVersion"]) != PRODUCTION_DATA_CONTRACT_VERSION \
			or String(envelope["rulesetId"]) != PRODUCTION_RULESET_ID:
		return _failure("生产存档规则/数据契约不匹配")
	if typeof(envelope["state"]) != TYPE_DICTIONARY:
		return _failure("生产存档中的游戏状态无效")
	var state_data: Dictionary = envelope["state"]
	var catalog_error := _validate_catalog_identity(state_data)
	if not catalog_error.is_empty(): return _failure(catalog_error)
	if not _is_integer_number(state_data.get("dataContractVersion")) \
			or int(state_data.get("dataContractVersion")) != PRODUCTION_DATA_CONTRACT_VERSION \
			or String(state_data.get("rulesetId", "")) != PRODUCTION_RULESET_ID:
		return _failure("生产存档状态规则/数据契约不匹配")
	var state_issues: Array[Dictionary] = Validator.validate_runtime(state_data)
	if not state_issues.is_empty():
		return _failure(Validator.first_error(state_issues))
	var digest: Dictionary = CanonicalJson.try_sha256(state_data)
	if not digest["ok"] or String(envelope["stateSha256"]) != String(digest["value"]):
		return _failure("生产存档状态摘要不匹配")
	var campaign_error: String = _validate_campaign(envelope["campaign"], state_data)
	if not campaign_error.is_empty():
		return _failure(campaign_error)
	return {
		"ok": true,
		"error": "",
		"path": _save_path,
		"envelope": envelope.duplicate(true),
		"state": GameState.new(state_data),
		"migrated": false,
	}


func _load_legacy_production(envelope: Dictionary) -> Dictionary:
	var unknown: String = _first_unknown_key(envelope, PRODUCTION_LEGACY_ENVELOPE_KEYS)
	if not unknown.is_empty():
		return _failure("旧生产存档包含未知字段：%s" % unknown)
	if typeof(envelope.get("savedAt")) != TYPE_STRING or String(envelope.get("savedAt", "")).is_empty():
		return _failure("旧生产存档缺少保存时间")
	if envelope.has("label") and typeof(envelope["label"]) != TYPE_STRING:
		return _failure("旧生产存档标签必须是字符串")
	if typeof(envelope.get("state")) != TYPE_DICTIONARY:
		return _failure("旧生产存档中的游戏状态无效")
	var state_data: Dictionary = envelope["state"]
	var catalog_error := _validate_catalog_identity(state_data)
	if not catalog_error.is_empty(): return _failure(catalog_error)
	if not _is_integer_number(state_data.get("dataContractVersion")) \
			or int(state_data.get("dataContractVersion")) != PRODUCTION_DATA_CONTRACT_VERSION \
			or String(state_data.get("rulesetId", "")) != PRODUCTION_RULESET_ID:
		return _failure("旧生产存档的状态契约不完整，拒绝猜测迁移")
	var state_issues: Array[Dictionary] = Validator.validate_runtime(state_data)
	if not state_issues.is_empty():
		return _failure(Validator.first_error(state_issues))
	return {
		"ok": true,
		"error": "",
		"path": _save_path,
		"envelope": envelope.duplicate(true),
		"state": GameState.new(state_data),
		"migrated": true,
	}


func _write_envelope(envelope: Dictionary) -> Dictionary:
	var base_dir: String = _save_path.get_base_dir()
	if not base_dir.is_empty():
		var absolute_base_dir: String = ProjectSettings.globalize_path(base_dir)
		var directory_error: Error = DirAccess.make_dir_recursive_absolute(absolute_base_dir)
		if directory_error != OK and directory_error != ERR_ALREADY_EXISTS:
			return _failure("无法创建存档目录：%s（错误 %d）" % [base_dir, directory_error])
	var temporary_path: String = _save_path + ".tmp"
	var temporary_absolute: String = ProjectSettings.globalize_path(temporary_path)
	var target_absolute: String = ProjectSettings.globalize_path(_save_path)
	if FileAccess.file_exists(temporary_absolute):
		DirAccess.remove_absolute(temporary_absolute)
	var file: FileAccess = FileAccess.open(temporary_absolute, FileAccess.WRITE)
	if file == null:
		return _failure("无法写入存档临时文件：%s（错误 %d）" % [temporary_path, FileAccess.get_open_error()])
	file.store_string(JSON.stringify(envelope, "\t", true))
	var write_error: Error = file.get_error()
	file.close()
	if write_error != OK:
		return _failure("写入存档失败：%s（错误 %d）" % [temporary_path, write_error])
	var backup_absolute: String = target_absolute + ".bak"
	var had_backup: bool = FileAccess.file_exists(backup_absolute)
	var had_target: bool = FileAccess.file_exists(target_absolute)
	if had_backup and had_target:
		DirAccess.remove_absolute(backup_absolute)
	if had_target:
		var backup_error: Error = DirAccess.rename_absolute(target_absolute, backup_absolute)
		if backup_error != OK:
			DirAccess.remove_absolute(temporary_absolute)
			return _failure("无法准备存档替换：错误 %d" % backup_error)
	var rename_error: Error = DirAccess.rename_absolute(temporary_absolute, target_absolute)
	if rename_error != OK:
		if had_target:
			DirAccess.rename_absolute(backup_absolute, target_absolute)
		return _failure("无法提交存档替换：错误 %d" % rename_error)
	if (had_target or had_backup) and FileAccess.file_exists(backup_absolute):
		DirAccess.remove_absolute(backup_absolute)
	return {"ok": true, "error": "", "path": _save_path, "envelope": envelope.duplicate(true)}


func _validate_campaign(campaign: Variant, state_data: Dictionary) -> String:
	if typeof(campaign) != TYPE_DICTIONARY:
		return "生产存档 campaign 必须是对象"
	var data: Dictionary = campaign
	var unknown: String = _first_unknown_key(data, PRODUCTION_CAMPAIGN_KEYS)
	if not unknown.is_empty():
		return "生产存档 campaign 包含未知字段：%s" % unknown
	for key: String in PRODUCTION_CAMPAIGN_KEYS:
		if not data.has(key): return "生产存档 campaign 缺少字段：%s" % key
	var scenario: Dictionary = state_data.get("scenario", {})
	if not _is_integer_number(data["productionDataContractVersion"]) \
			or not _is_integer_number(data["periodId"]) \
			or not _is_integer_number(data["rulerSourceIndex"]) \
			or int(data["productionDataContractVersion"]) != PRODUCTION_DATA_CONTRACT_VERSION \
			or int(data["periodId"]) != int(scenario.get("period", -1)) \
			or int(data["rulerSourceIndex"]) < 0 \
			or typeof(data["title"]) != TYPE_STRING \
			or typeof(data["playerFactionId"]) != TYPE_STRING \
		or typeof(data["rulerOfficerId"]) != TYPE_STRING \
			or typeof(data["rulerName"]) != TYPE_STRING:
		return "生产存档 campaign 字段类型或时期不匹配"
	var catalog_result: Dictionary = ProductionDataRepository.load_period(int(data["periodId"]))
	if not catalog_result.get("ok", false):
		return "生产存档时期目录不可用：%s" % String(catalog_result.get("error", ""))
	var catalog_scenario: Dictionary = catalog_result["envelope"].get("scenario", {})
	if String(data["title"]) != String(catalog_scenario.get("title", "")):
		return "生产存档 campaign title 与时期目录不一致"
	var candidate_found := false
	for raw_candidate: Variant in catalog_scenario.get("playerCandidates", []):
		var candidate: Dictionary = raw_candidate
		if String(candidate.get("factionId", "")) != String(data["playerFactionId"]):
			continue
		candidate_found = true
		if int(candidate.get("sourceIndex", -1)) != int(data["rulerSourceIndex"]):
			return "生产存档 campaign rulerSourceIndex 与时期目录不一致"
		break
	if not candidate_found:
		return "生产存档 campaign playerFactionId 不是时期可选势力"
	var factions: Dictionary = state_data.get("factions", {})
	var officers: Dictionary = state_data.get("officers", {})
	var faction: Dictionary = factions.get(data["playerFactionId"], {})
	var ruler: Dictionary = officers.get(data["rulerOfficerId"], {})
	if faction.is_empty() or ruler.is_empty(): return "生产存档 campaign 身份不存在"
	if String(state_data.get("playerFactionId", "")) != String(data["playerFactionId"]) \
			or faction.get("rulerOfficerId", "") != data["rulerOfficerId"] \
			or String(ruler.get("name", "")) != String(data["rulerName"]):
		return "生产存档 campaign 身份与状态不一致"
	return ""


func _first_unknown_key(data: Dictionary, allowed: Array[String]) -> String:
	var unknown: Array[String] = []
	for raw_key: Variant in data.keys():
		var key := str(raw_key)
		if not allowed.has(key): unknown.append(key)
	unknown.sort()
	return unknown[0] if not unknown.is_empty() else ""


func _validate_catalog_identity(state_data: Dictionary) -> String:
	if typeof(state_data.get("scenario")) != TYPE_DICTIONARY:
		return "生产存档缺少 scenario 身份"
	var scenario: Dictionary = state_data["scenario"]
	if not _is_integer_number(scenario.get("period")) or int(scenario["period"]) < 1:
		return "生产存档 scenario.period 无效"
	var catalog_result: Dictionary = ProductionDataRepository.load_period(int(scenario["period"]))
	if not catalog_result.get("ok", false):
		return "生产存档时期目录不可用：%s" % String(catalog_result.get("error", ""))
	var catalog_state: Dictionary = (catalog_result["state"] as GameState).snapshot()
	if scenario != catalog_state.get("scenario", {}):
		return "生产存档 scenario 身份与时期目录不一致"
	var catalog_scenario: Dictionary = catalog_result["envelope"].get("scenario", {})
	var candidate_found := false
	for raw_candidate: Variant in catalog_scenario.get("playerCandidates", []):
		if String((raw_candidate as Dictionary).get("factionId", "")) == String(state_data.get("playerFactionId", "")):
			candidate_found = true
			break
	if not candidate_found:
		return "生产存档 playerFactionId 不是时期可选势力"
	return ""


func get_save_path() -> String:
	return _save_path


static func _is_integer_number(raw: Variant) -> bool:
	return (typeof(raw) == TYPE_INT or typeof(raw) == TYPE_FLOAT) \
		and is_finite(float(raw)) \
		and floor(float(raw)) == float(raw)


static func _is_safe_revision(raw: Variant) -> bool:
	return _is_integer_number(raw) and float(raw) >= 0.0 and float(raw) <= float(CanonicalJson.MAX_SAFE_INTEGER)


static func _failure(reason: String) -> Dictionary:
	return {
		"ok": false,
		"error": reason,
	}
