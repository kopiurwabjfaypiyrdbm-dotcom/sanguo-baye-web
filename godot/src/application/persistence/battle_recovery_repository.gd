extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const SaveRepository = preload("res://src/application/persistence/json_save_repository.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const TacticalCommands = preload("res://src/domain/tactical/battle_commands.gd")
const TacticalBattleSettlement = preload("res://src/domain/tactical/battle_settlement.gd")

const RECOVERY_FORMAT: String = "sanguo-baye-godot:battle-recovery"
const RECOVERY_VERSION: int = 2
const RECOVERY_PENDING_KEYS: Array[String] = [
	"format", "version", "status", "mode", "battleId", "strategicFingerprint",
	"strategicSave", "parentSaveRevision", "order", "resume",
]
const RECOVERY_COMMITTED_KEYS: Array[String] = [
	"format", "version", "status", "mode", "battleId", "strategicFingerprint",
	"strategicSave", "sourceStrategicSave", "settlementResult", "parentSaveRevision", "order", "resume",
]
const ORDER_KEYS: Array[String] = ["sourceCityId", "targetCityId", "officerIds", "provisions"]

var _path: String


func _init(path: String) -> void:
	_path = path


func save_pending(
	state: GameState,
	campaign: Dictionary,
	order: Dictionary,
	resume: Dictionary,
	label: String = "",
	saved_at: String = "",
	parent_save_revision: int = 0,
) -> Dictionary:
	var state_data: Dictionary = state.snapshot()
	var checked: Dictionary = _validate_pending(state_data, order, resume)
	if not checked["ok"]: return checked
	var binding: Dictionary = _validate_binding(order, resume, TacticalCommands.strategic_fingerprint(state_data))
	if not binding["ok"]: return binding
	if not _is_safe_revision(parent_save_revision): return _failure("战斗恢复记录 parentSaveRevision 超出安全整数范围")
	var strategic_save: Dictionary = SaveRepository.new().create_production_envelope(state, campaign, label, saved_at)
	if not strategic_save["ok"]: return strategic_save
	var existing: Dictionary = self.load()
	if existing.has("recoveryPromotionError"):
		return _failure(String(existing["recoveryPromotionError"]))
	if not existing["ok"]:
		if existing.get("found", false) or FileAccess.file_exists(ProjectSettings.globalize_path(_path)) \
				or FileAccess.file_exists(ProjectSettings.globalize_path(_path + ".tmp")) \
				or FileAccess.file_exists(ProjectSettings.globalize_path(_path + ".bak")):
			return _failure("已有战斗恢复记录损坏，拒绝覆盖")
	if existing.get("found", false):
		if String(existing.get("status", "")) == "committed":
			return _failure("已有已提交战斗恢复记录，必须先完成主存档或显式清理")
		var existing_envelope: Dictionary = existing.get("envelope", {})
		var existing_binding: Dictionary = _binding_from_envelope(existing_envelope)
		var same_state := String((existing_envelope.get("strategicSave", {}) as Dictionary).get("stateSha256", "")) == String(strategic_save["envelope"].get("stateSha256", ""))
		var same_parent := _is_safe_revision(existing_envelope.get("parentSaveRevision")) \
				and int(existing_envelope["parentSaveRevision"]) == parent_save_revision
		if not _binding_equal(existing_binding, binding) or not same_state or not same_parent:
			return _failure("待处理战斗恢复记录冲突：身份、状态或主存档版本不一致")
	var envelope: Dictionary = {
		"format": RECOVERY_FORMAT,
		"version": RECOVERY_VERSION,
		"status": "pending",
		"mode": binding["mode"],
		"battleId": TacticalCommands.battle_id(state_data, order),
		"strategicFingerprint": binding["strategicFingerprint"],
		"strategicSave": strategic_save["envelope"],
		"parentSaveRevision": parent_save_revision,
		"order": order.duplicate(true),
		"resume": resume.duplicate(true),
	}
	var written: Dictionary = _write(envelope)
	if not written["ok"]: return written
	return {
		"ok": true, "error": "", "path": _path, "envelope": envelope.duplicate(true),
		"status": "pending", "mode": envelope["mode"], "battleId": envelope["battleId"],
		"state": state_data, "order": order.duplicate(true), "resume": resume.duplicate(true),
	}


func save_committed(
	state: GameState,
	campaign: Dictionary,
	battle_id: String,
	label: String = "",
	saved_at: String = "",
	order: Dictionary = {},
	resume: Dictionary = {},
	strategic_fingerprint: String = "",
	source_state: Dictionary = {},
	parent_save_revision: int = 0,
	settlement_result: Dictionary = {},
) -> Dictionary:
	if battle_id.is_empty(): return _failure("战斗恢复记录缺少战斗标识")
	var binding: Dictionary = _validate_binding(order, resume, strategic_fingerprint)
	if not binding["ok"]: return binding
	var strategic_save: Dictionary = SaveRepository.new().create_production_envelope(state, campaign, label, saved_at)
	if not strategic_save["ok"]: return strategic_save
	var source_snapshot: Dictionary = state.snapshot() if source_state.is_empty() else source_state.duplicate(true)
	var source_check: Dictionary = _validate_pending(source_snapshot, order, resume)
	if not source_check["ok"]: return source_check
	var expected_mode := "player-attack" if resume["kind"] == "player-phase" else "ai-defense"
	if binding["mode"] != expected_mode \
			or battle_id != TacticalCommands.battle_id(source_snapshot, order) \
			or strategic_fingerprint != TacticalCommands.strategic_fingerprint(source_snapshot):
		return _failure("已提交战斗恢复记录与源战略状态不匹配")
	if not _is_safe_revision(parent_save_revision): return _failure("战斗恢复记录 parentSaveRevision 超出安全整数范围")
	if settlement_result.is_empty(): return _failure("已提交战斗恢复记录缺少战后结果")
	var settled := TacticalBattleSettlement.apply(GameState.new(source_snapshot), settlement_result)
	if not settled.get("ok", false): return _failure("已提交战斗恢复记录战后结果无效：%s" % settled.get("error", ""))
	if String(settlement_result.get("battleId", "")) != battle_id:
		return _failure("已提交战斗恢复记录 battleId 与战后结果不一致")
	var settled_digest: Dictionary = Canonical.try_sha256((settled["next_state"] as GameState).snapshot())
	var post_digest: Dictionary = Canonical.try_sha256(state.snapshot())
	if not settled_digest.get("ok", false) or not post_digest.get("ok", false) \
			or String(settled_digest["value"]) != String(post_digest["value"]):
		return _failure("已提交战斗恢复记录的战后状态不匹配")
	var source_envelope: Dictionary = SaveRepository.new().create_production_envelope(
		GameState.new(source_snapshot), campaign, label, saved_at
	)
	if not source_envelope["ok"]: return source_envelope
	var existing: Dictionary = self.load()
	if existing.has("recoveryPromotionError"):
		return _failure(String(existing["recoveryPromotionError"]))
	if not existing["ok"]:
		if FileAccess.file_exists(ProjectSettings.globalize_path(_path)) \
				or FileAccess.file_exists(ProjectSettings.globalize_path(_path + ".tmp")) \
				or FileAccess.file_exists(ProjectSettings.globalize_path(_path + ".bak")):
			return _failure("已有战斗恢复记录损坏，拒绝覆盖")
	if existing.get("found", false):
		if String(existing.get("battleId", "")) != battle_id:
			return _failure("战斗恢复记录冲突：已有不同战斗标识")
		var existing_envelope: Dictionary = existing.get("envelope", {})
		var existing_binding: Dictionary = _binding_from_envelope(existing_envelope)
		if not _binding_equal(existing_binding, binding):
			return _failure("战斗恢复记录冲突：战斗身份绑定不一致")
		if not _is_safe_revision(existing_envelope.get("parentSaveRevision")) \
				or int(existing_envelope["parentSaveRevision"]) != parent_save_revision:
			return _failure("战斗恢复记录冲突：parentSaveRevision 不一致")
		if existing["status"] == "committed":
			var old_save: Dictionary = existing_envelope.get("strategicSave", {})
			if String(old_save.get("stateSha256", "")) != String(strategic_save["envelope"].get("stateSha256", "")):
				return _failure("战斗恢复记录冲突：已提交状态不一致")
			var old_source: Dictionary = existing_envelope.get("sourceStrategicSave", {})
			if String(old_source.get("stateSha256", "")) != String(source_envelope["envelope"].get("stateSha256", "")):
				return _failure("战斗恢复记录冲突：已提交源状态不一致")
			var old_result_digest: Dictionary = Canonical.try_sha256(existing_envelope.get("settlementResult", {}))
			var result_digest: Dictionary = Canonical.try_sha256(settlement_result)
			if not old_result_digest.get("ok", false) or not result_digest.get("ok", false) \
					or String(old_result_digest["value"]) != String(result_digest["value"]):
				return _failure("战斗恢复记录冲突：已提交战后结果不一致")
		else:
			var pending_source: Dictionary = existing_envelope.get("strategicSave", {})
			if String(pending_source.get("stateSha256", "")) != String(source_envelope["envelope"].get("stateSha256", "")):
				return _failure("战斗恢复记录冲突：待处理战前状态不一致")
	var envelope: Dictionary = {
		"format": RECOVERY_FORMAT,
		"version": RECOVERY_VERSION,
		"status": "committed",
		"mode": binding["mode"],
		"battleId": battle_id,
		"strategicFingerprint": strategic_fingerprint,
		"strategicSave": strategic_save["envelope"],
		"sourceStrategicSave": source_envelope["envelope"],
		"settlementResult": settlement_result.duplicate(true),
		"parentSaveRevision": parent_save_revision,
		"order": order.duplicate(true),
		"resume": resume.duplicate(true),
	}
	var written: Dictionary = _write(envelope)
	if not written["ok"]: return written
	return {"ok": true, "error": "", "path": _path, "envelope": envelope.duplicate(true), "status": "committed", "battleId": battle_id, "state": state.snapshot(), "mode": binding["mode"], "order": order.duplicate(true), "resume": resume.duplicate(true)}


func load() -> Dictionary:
	var candidates: Array[String] = [_path, _path + ".tmp", _path + ".bak"]
	var found_candidate := false
	var primary_failed := false
	var last_failure: Dictionary = {}
	for candidate: String in candidates:
		if not FileAccess.file_exists(ProjectSettings.globalize_path(candidate)):
			continue
		found_candidate = true
		var candidate_result: Dictionary = _load_path(candidate)
		if candidate_result["ok"]:
			candidate_result["path"] = _path
			if candidate != _path:
				candidate_result["recoveredFrom"] = candidate
				if not _promote_fallback(candidate, primary_failed):
					candidate_result["recoveryPromotionError"] = "有效备用战斗恢复记录已读取，但无法提升为主记录"
			return candidate_result
		last_failure = candidate_result
		if candidate == _path:
			primary_failed = true
	if found_candidate:
		return last_failure
	return {"ok": true, "error": "", "found": false}


func _promote_fallback(candidate: String, replace_primary: bool = false) -> bool:
	var target_absolute := ProjectSettings.globalize_path(_path)
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
	if file == null: return _failure("无法读取战斗恢复记录：错误 %d" % FileAccess.get_open_error())
	var contents := file.get_as_text(); var read_error := file.get_error(); file.close()
	if read_error != OK: return _failure("读取战斗恢复记录失败：错误 %d" % read_error)
	var parser := JSON.new()
	if parser.parse(contents) != OK: return _failure("战斗恢复记录不是有效的 JSON")
	if typeof(parser.data) != TYPE_DICTIONARY: return _failure("战斗恢复记录根节点必须是对象")
	var envelope: Dictionary = parser.data
	var basic: Dictionary = _validate_basic(envelope)
	if not basic["ok"]: return basic
	var strategic: Dictionary = SaveRepository.new().parse_production_envelope(envelope["strategicSave"])
	if not strategic["ok"]: return _failure("战斗恢复记录的战略存档无效：%s" % strategic["error"])
	var state: Dictionary = (strategic["state"] as GameState).snapshot()
	var binding: Dictionary = _binding_from_envelope(envelope)
	if not binding["ok"]: return binding
	if envelope["status"] == "committed":
		var source: Dictionary = SaveRepository.new().parse_production_envelope(envelope["sourceStrategicSave"])
		if not source["ok"]: return _failure("已提交战斗恢复记录的源战略存档无效：%s" % source["error"])
		var source_state: Dictionary = (source["state"] as GameState).snapshot()
		if not _is_safe_revision(envelope["parentSaveRevision"]):
			return _failure("已提交战斗恢复记录 parentSaveRevision 无效")
		var source_check: Dictionary = _validate_pending(source_state, envelope["order"], envelope["resume"])
		if not source_check["ok"]: return source_check
		if typeof(envelope["settlementResult"]) != TYPE_DICTIONARY:
			return _failure("已提交战斗恢复记录 settlementResult 必须是对象")
		var settled := TacticalBattleSettlement.apply(GameState.new(source_state), envelope["settlementResult"])
		if not settled.get("ok", false): return _failure("已提交战斗恢复记录战后结果无效：%s" % settled.get("error", ""))
		var settled_digest: Dictionary = Canonical.try_sha256((settled["next_state"] as GameState).snapshot())
		var post_digest: Dictionary = Canonical.try_sha256(state)
		if not settled_digest.get("ok", false) or not post_digest.get("ok", false) \
				or String(settled_digest["value"]) != String(post_digest["value"]):
			return _failure("已提交战斗恢复记录的战后状态不匹配")
		var expected_mode := "player-attack" if envelope["resume"]["kind"] == "player-phase" else "ai-defense"
		if String(envelope["mode"]) != expected_mode \
				or String(envelope["battleId"]) != TacticalCommands.battle_id(source_state, envelope["order"]) \
				or String(envelope["strategicFingerprint"]) != TacticalCommands.strategic_fingerprint(source_state) \
				or String(envelope["settlementResult"].get("battleId", "")) != String(envelope["battleId"]):
			return _failure("已提交战斗恢复记录与源战略状态不匹配")
		return {
			"ok": true, "error": "", "found": true, "status": "committed",
			"battleId": String(envelope["battleId"]), "state": state,
			"strategicFingerprint": String(envelope["strategicFingerprint"]),
			"mode": binding["mode"], "order": envelope["order"].duplicate(true), "resume": envelope["resume"].duplicate(true),
			"label": String((envelope["strategicSave"] as Dictionary).get("label", "")),
			"envelope": envelope.duplicate(true),
		}
	var checked: Dictionary = _validate_pending(state, envelope.get("order", {}), envelope.get("resume", {}))
	if not checked["ok"]: return checked
	var expected_mode := "player-attack" if envelope["resume"]["kind"] == "player-phase" else "ai-defense"
	if String(envelope.get("mode", "")) != expected_mode \
			or String(envelope["battleId"]) != TacticalCommands.battle_id(state, envelope["order"]) \
			or String(envelope["strategicFingerprint"]) != TacticalCommands.strategic_fingerprint(state):
		return _failure("战斗恢复记录与战略状态不匹配")
	return {
		"ok": true, "error": "", "found": true, "status": "pending", "mode": envelope["mode"],
		"battleId": envelope["battleId"], "state": state,
			"strategicFingerprint": String(envelope["strategicFingerprint"]),
		"order": envelope["order"].duplicate(true), "resume": envelope["resume"].duplicate(true),
		"label": String((envelope["strategicSave"] as Dictionary).get("label", "")),
		"envelope": envelope.duplicate(true),
	}


func clear() -> Dictionary:
	# Remove recovery sidecars before the primary. If the process is killed
	# between removals, leaving the committed primary is safer than leaving a
	# temporary/backup marker that can be mistaken for a newer checkpoint.
	for candidate: String in [_path + ".bak", _path + ".tmp", _path]:
		var absolute_path := ProjectSettings.globalize_path(candidate)
		if not FileAccess.file_exists(absolute_path):
			continue
		var remove_error := DirAccess.remove_absolute(absolute_path)
		if remove_error != OK:
			return _failure("无法清理战斗恢复记录：错误 %d" % remove_error)
	return {"ok": true, "error": ""}


func get_path() -> String:
	return _path


func _validate_basic(envelope: Dictionary) -> Dictionary:
	var unknown: Array[String] = []
	var allowed_keys: Array[String] = RECOVERY_PENDING_KEYS if envelope.get("status") == "pending" else RECOVERY_COMMITTED_KEYS
	for raw_key: Variant in envelope.keys():
		var key := str(raw_key)
		if not allowed_keys.has(key): unknown.append(key)
	unknown.sort()
	if not unknown.is_empty(): return _failure("战斗恢复记录包含未知字段：%s" % unknown[0])
	if envelope.get("format") != RECOVERY_FORMAT \
			or not _is_integer_number(envelope.get("version")) \
			or int(envelope.get("version", -1)) != RECOVERY_VERSION:
		return _failure("无法识别战斗恢复记录")
	if typeof(envelope.get("battleId")) != TYPE_STRING or String(envelope["battleId"]).is_empty():
		return _failure("战斗恢复记录缺少战斗标识")
	if envelope.get("status") != "pending" and envelope.get("status") != "committed":
		return _failure("战斗恢复记录状态无效")
	if typeof(envelope.get("strategicSave")) != TYPE_DICTIONARY:
		return _failure("战斗恢复记录缺少战略存档")
	if envelope["status"] == "pending":
		for key: String in ["mode", "strategicFingerprint", "parentSaveRevision", "order", "resume"]:
			if not envelope.has(key): return _failure("待处理战斗恢复记录缺少字段：%s" % key)
		if typeof(envelope["strategicFingerprint"]) != TYPE_STRING: return _failure("战斗恢复指纹无效")
		if not _is_safe_revision(envelope["parentSaveRevision"]):
			return _failure("待处理战斗恢复记录 parentSaveRevision 无效")
	else:
		for key: String in ["mode", "strategicFingerprint", "sourceStrategicSave", "settlementResult", "parentSaveRevision", "order", "resume"]:
			if not envelope.has(key): return _failure("已提交战斗恢复记录缺少字段：%s" % key)
		if typeof(envelope["sourceStrategicSave"]) != TYPE_DICTIONARY:
			return _failure("已提交战斗恢复记录 sourceStrategicSave 必须是对象")
		if typeof(envelope["settlementResult"]) != TYPE_DICTIONARY:
			return _failure("已提交战斗恢复记录 settlementResult 必须是对象")
	return {"ok": true, "error": ""}


func _validate_pending(state: Dictionary, order: Variant, resume: Variant) -> Dictionary:
	if typeof(order) != TYPE_DICTIONARY: return _failure("待处理战斗恢复记录的 order 无效")
	var order_data: Dictionary = order
	for raw_key: Variant in order_data.keys():
		if not ORDER_KEYS.has(str(raw_key)): return _failure("战斗恢复 order 包含未知字段：%s" % str(raw_key))
	for key: String in ORDER_KEYS:
		if not order_data.has(key): return _failure("战斗恢复 order 缺少字段：%s" % key)
	if typeof(order_data["sourceCityId"]) != TYPE_STRING or typeof(order_data["targetCityId"]) != TYPE_STRING \
			or typeof(order_data["officerIds"]) != TYPE_ARRAY or typeof(order_data["provisions"]) not in [TYPE_INT, TYPE_FLOAT]:
		return _failure("战斗恢复 order 字段类型无效")
	var order_check: Dictionary = TacticalCommands.validate_attack_order(state, order_data)
	if not order_check["ok"]: return _failure(String(order_check["error"]))
	if typeof(resume) != TYPE_DICTIONARY: return _failure("战斗恢复位置无效")
	var resume_data: Dictionary = resume
	if resume_data.get("kind") == "player-phase":
		if state.get("phase") != "player" or state.get("activeFactionId") != state.get("playerFactionId") \
				or state["cities"][order_data["sourceCityId"]]["ownerId"] != state["playerFactionId"]:
			return _failure("玩家进攻恢复记录必须位于玩家阶段且出发城属于玩家")
	elif resume_data.get("kind") == "ai-phase":
		if typeof(resume_data.get("nextFactionIndex")) not in [TYPE_INT, TYPE_FLOAT] \
				or int(resume_data["nextFactionIndex"]) != float(resume_data["nextFactionIndex"]):
			return _failure("AI 恢复位置无效")
		var faction_order: Array = state.get("factionOrder", [])
		var expected := faction_order.find(state.get("activeFactionId")) + 1
		if state.get("phase") != "ai" or expected <= 0 or int(resume_data["nextFactionIndex"]) != expected \
				or int(resume_data["nextFactionIndex"]) > faction_order.size() \
				or state["cities"][order_data["targetCityId"]]["ownerId"] != state["playerFactionId"]:
			return _failure("AI 恢复位置无效")
	else:
		return _failure("战斗恢复位置无效")
	return {"ok": true, "error": ""}


func _validate_binding(order: Variant, resume: Variant, strategic_fingerprint: Variant) -> Dictionary:
	if typeof(strategic_fingerprint) != TYPE_STRING or String(strategic_fingerprint).is_empty():
		return _failure("战斗恢复记录缺少战略指纹")
	if typeof(order) != TYPE_DICTIONARY:
		return _failure("战斗恢复记录 order 无效")
	var order_data: Dictionary = order
	for raw_key: Variant in order_data.keys():
		if not ORDER_KEYS.has(str(raw_key)): return _failure("战斗恢复 order 包含未知字段：%s" % str(raw_key))
	for key: String in ORDER_KEYS:
		if not order_data.has(key): return _failure("战斗恢复 order 缺少字段：%s" % key)
	if typeof(order_data["sourceCityId"]) != TYPE_STRING \
			or typeof(order_data["targetCityId"]) != TYPE_STRING \
			or typeof(order_data["officerIds"]) != TYPE_ARRAY \
			or not _is_integer_number(order_data["provisions"]):
		return _failure("战斗恢复 order 字段类型无效")
	for raw_officer_id: Variant in order_data["officerIds"]:
		if typeof(raw_officer_id) != TYPE_STRING: return _failure("战斗恢复 officerIds 字段类型无效")
	if int(order_data["provisions"]) <= 0: return _failure("战斗恢复 provisions 必须为正整数")
	if typeof(resume) != TYPE_DICTIONARY: return _failure("战斗恢复位置无效")
	var resume_data: Dictionary = resume
	var kind := String(resume_data.get("kind", ""))
	if kind == "player-phase":
		if resume_data.size() != 1: return _failure("玩家战斗恢复位置包含未知字段")
	elif kind == "ai-phase":
		if resume_data.size() != 2 or not resume_data.has("nextFactionIndex") \
				or not _is_integer_number(resume_data["nextFactionIndex"]) \
				or int(resume_data["nextFactionIndex"]) <= 0:
			return _failure("AI 战斗恢复位置无效")
	else:
		return _failure("战斗恢复位置无效")
	return {
		"ok": true, "error": "",
		"mode": "player-attack" if kind == "player-phase" else "ai-defense",
		"strategicFingerprint": String(strategic_fingerprint),
		"order": order_data.duplicate(true),
		"resume": resume_data.duplicate(true),
	}


func _binding_from_envelope(envelope: Dictionary) -> Dictionary:
	return _validate_binding(
		envelope.get("order", {}), envelope.get("resume", {}), envelope.get("strategicFingerprint", "")
	)


func _binding_equal(left: Dictionary, right: Dictionary) -> bool:
	if not left.get("ok", false) or not right.get("ok", false): return false
	if left.get("mode", "") != right.get("mode", "") \
			or left.get("strategicFingerprint", "") != right.get("strategicFingerprint", ""):
		return false
	var left_order: Dictionary = left.get("order", {})
	var right_order: Dictionary = right.get("order", {})
	if left_order.get("sourceCityId", "") != right_order.get("sourceCityId", "") \
			or left_order.get("targetCityId", "") != right_order.get("targetCityId", "") \
			or int(left_order.get("provisions", -1)) != int(right_order.get("provisions", -1)):
		return false
	if (left_order.get("officerIds", []) as Array) != (right_order.get("officerIds", []) as Array):
		return false
	var left_resume: Dictionary = left.get("resume", {})
	var right_resume: Dictionary = right.get("resume", {})
	if left_resume.get("kind", "") != right_resume.get("kind", ""): return false
	if left_resume.get("kind", "") == "ai-phase" \
			and int(left_resume.get("nextFactionIndex", -1)) != int(right_resume.get("nextFactionIndex", -1)):
		return false
	return true


static func _is_integer_number(raw: Variant) -> bool:
	return (typeof(raw) == TYPE_INT or typeof(raw) == TYPE_FLOAT) \
			and is_finite(float(raw)) and floor(float(raw)) == float(raw)


static func _is_safe_revision(raw: Variant) -> bool:
	return _is_integer_number(raw) and float(raw) >= 0.0 and float(raw) <= float(Canonical.MAX_SAFE_INTEGER)


func _write(envelope: Dictionary) -> Dictionary:
	var directory := _path.get_base_dir()
	if not directory.is_empty():
		var directory_error := DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))
		if directory_error != OK and directory_error != ERR_ALREADY_EXISTS: return _failure("无法创建恢复记录目录：错误 %d" % directory_error)
	var absolute_path := ProjectSettings.globalize_path(_path)
	var temporary_path := absolute_path + ".tmp"
	if FileAccess.file_exists(temporary_path): DirAccess.remove_absolute(temporary_path)
	var file := FileAccess.open(temporary_path, FileAccess.WRITE)
	if file == null: return _failure("无法写入战斗恢复临时记录：错误 %d" % FileAccess.get_open_error())
	file.store_string(JSON.stringify(envelope, "\t", true)); var write_error := file.get_error(); file.close()
	if write_error != OK: return _failure("写入战斗恢复记录失败：错误 %d" % write_error)
	var backup := absolute_path + ".bak"
	var had_backup := FileAccess.file_exists(backup)
	var had_target := FileAccess.file_exists(absolute_path)
	if had_backup and had_target: DirAccess.remove_absolute(backup)
	if had_target:
		var backup_error := DirAccess.rename_absolute(absolute_path, backup)
		if backup_error != OK: DirAccess.remove_absolute(temporary_path); return _failure("无法准备恢复记录替换：错误 %d" % backup_error)
	var rename_error := DirAccess.rename_absolute(temporary_path, absolute_path)
	if rename_error != OK:
		if had_target: DirAccess.rename_absolute(backup, absolute_path)
		return _failure("无法提交恢复记录替换：错误 %d" % rename_error)
	if (had_target or had_backup) and FileAccess.file_exists(backup): DirAccess.remove_absolute(backup)
	return {"ok": true, "error": ""}


func _failure(error: String) -> Dictionary:
	return {"ok": false, "error": error}
