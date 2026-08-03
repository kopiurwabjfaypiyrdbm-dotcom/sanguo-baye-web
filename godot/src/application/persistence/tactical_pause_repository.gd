class_name TacticalPauseRepository
extends RefCounted

const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const SaveRepository = preload("res://src/application/persistence/json_save_repository.gd")
const BattleRecoveryRepository = preload("res://src/application/persistence/battle_recovery_repository.gd")
const BattleResult = preload("res://src/domain/tactical/battle_result.gd")
const BattleValidator = preload("res://src/domain/tactical/battle_validator.gd")
const PATH := "user://godot-tactical-pause.json"
const CANDIDATES: Array[String] = [PATH, PATH + ".tmp", PATH + ".bak"]


func save(battle: Dictionary, state_sha256: String, parent_state_sha256: String) -> Dictionary:
	if battle.is_empty() or state_sha256.is_empty():
		return {"ok": false, "error": "战术状态为空或摘要缺失"}
	var battle_digest: Dictionary = Canonical.try_sha256(battle)
	if not bool(battle_digest.get("ok", false)) or str(battle_digest.get("value", "")) != state_sha256:
		return {"ok": false, "error": "战术状态摘要与快照不一致"}
	if not _is_sha256(state_sha256):
		return {"ok": false, "error": "战术状态摘要格式无效"}
	var battle_issues: Array[Dictionary] = BattleValidator.validate(battle)
	if not battle_issues.is_empty():
		return {"ok": false, "error": BattleValidator.first_error(battle_issues)}
	if parent_state_sha256.is_empty() or (parent_state_sha256.begins_with("demo:") and parent_state_sha256 != "demo:%s" % str(battle.get("id", ""))) or (not parent_state_sha256.begins_with("demo:") and not _is_sha256(parent_state_sha256)):
		return {"ok": false, "error": "战术恢复父状态摘要格式无效"}
	var payload := {
		"version": 2,
		"stateSha256": state_sha256,
		"identity": {
			"battleId": str(battle.get("id", "")),
			"sourceCityId": str(battle.get("sourceCityId", "")),
			"targetCityId": str(battle.get("targetCityId", "")),
			"rngSeed": int(battle.get("rngSeed", -1)),
			"parentStateSha256": parent_state_sha256,
		},
		"battle": battle,
	}
	var temporary_path := PATH + ".tmp"
	var temporary_absolute := ProjectSettings.globalize_path(temporary_path)
	var target_absolute := ProjectSettings.globalize_path(PATH)
	var backup_absolute := target_absolute + ".bak"
	if FileAccess.file_exists(temporary_path): DirAccess.remove_absolute(temporary_absolute)
	var file := FileAccess.open(temporary_path, FileAccess.WRITE)
	if file == null: return {"ok": false, "error": "无法打开战术临时恢复文件"}
	file.store_string(JSON.stringify(payload))
	var write_error := file.get_error()
	file.close()
	if write_error != OK:
		DirAccess.remove_absolute(temporary_absolute)
		return {"ok": false, "error": "战术恢复文件写入失败"}
	var moved_target := false
	if FileAccess.file_exists(PATH):
		if FileAccess.file_exists(backup_absolute): DirAccess.remove_absolute(backup_absolute)
		if DirAccess.rename_absolute(target_absolute, backup_absolute) != OK:
			DirAccess.remove_absolute(temporary_absolute)
			return {"ok": false, "error": "无法备份现有战术恢复文件"}
		moved_target = true
	var rename_error := DirAccess.rename_absolute(temporary_absolute, target_absolute)
	if rename_error != OK:
		if moved_target: DirAccess.rename_absolute(backup_absolute, target_absolute)
		DirAccess.remove_absolute(temporary_absolute)
		return {"ok": false, "error": "无法提升战术恢复文件"}
	if moved_target: DirAccess.remove_absolute(backup_absolute)
	return {"ok": true, "error": ""}


func load() -> Dictionary:
	var first_error := ""
	for candidate: String in CANDIDATES:
		if not FileAccess.file_exists(candidate): continue
		var decoded: Dictionary = _read_candidate(candidate)
		if bool(decoded.get("ok", false)):
			var promoted := true
			if candidate != PATH: promoted = _promote(candidate)
			return {"ok": true, "error": "", "battle": decoded["battle"], "parentStateSha256": decoded.get("parentStateSha256", ""), "recoveredFromFallback": candidate != PATH, "promoted": promoted}
		if first_error.is_empty(): first_error = String(decoded.get("error", "战术恢复文件校验失败"))
	return {"ok": false, "error": first_error, "battle": {}, "parentStateSha256": "", "recoveredFromFallback": false, "promoted": false}


static func clear_candidates() -> Dictionary:
	# Remove sidecars first and the primary last. If the process is reclaimed
	# between operations, a still-present primary prevents a stale fallback from
	# being promoted as a newly requested recovery.
	for candidate: String in [PATH + ".bak", PATH + ".tmp", PATH]:
		if not FileAccess.file_exists(candidate): continue
		var error := DirAccess.remove_absolute(ProjectSettings.globalize_path(candidate))
		if error != OK and FileAccess.file_exists(candidate): return {"ok": false, "error": error}
	return {"ok": true, "error": OK}


static func has_candidate() -> bool:
	for candidate: String in CANDIDATES:
		if FileAccess.file_exists(candidate): return true
	return false


func _read_candidate(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null: return {"ok": false, "error": "无法读取恢复文件"}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	if not parsed is Dictionary: return {"ok": false, "error": "恢复文件不是 JSON 对象"}
	if not _is_integer_number(parsed.get("version")) or int(parsed.get("version", -1)) != 2: return {"ok": false, "error": "恢复文件版本不受支持"}
	if not parsed.get("battle", {}) is Dictionary or not parsed.get("identity", {}) is Dictionary: return {"ok": false, "error": "恢复文件缺少战场身份"}
	var battle: Dictionary = parsed["battle"]
	var identity: Dictionary = parsed["identity"]
	for key: String in ["battleId", "sourceCityId", "targetCityId", "parentStateSha256"]:
		if typeof(identity.get(key)) != TYPE_STRING: return {"ok": false, "error": "恢复文件身份字段类型无效"}
	if not _is_integer_number(identity.get("rngSeed")) or typeof(battle.get("id")) != TYPE_STRING or typeof(battle.get("sourceCityId")) != TYPE_STRING or typeof(battle.get("targetCityId")) != TYPE_STRING:
		return {"ok": false, "error": "恢复文件战场身份类型无效"}
	if str(identity.get("battleId")) != str(battle.get("id")) or str(identity.get("sourceCityId")) != str(battle.get("sourceCityId")) or str(identity.get("targetCityId")) != str(battle.get("targetCityId")) or int(identity.get("rngSeed")) != int(battle.get("rngSeed", -2)):
		return {"ok": false, "error": "恢复文件身份与战场不一致"}
	var early_battle_issues: Array[Dictionary] = BattleValidator.validate(battle)
	if not early_battle_issues.is_empty():
		return {"ok": false, "error": BattleValidator.first_error(early_battle_issues)}
	var digest: Dictionary = Canonical.try_sha256(battle)
	if not bool(digest.get("ok", false)) or str(digest.get("value", "")) != str(parsed.get("stateSha256", "")):
		return {"ok": false, "error": "恢复文件摘要校验失败"}
	var parent_state_sha256 := str(identity.get("parentStateSha256", ""))
	if parent_state_sha256.is_empty():
		return {"ok": false, "error": "恢复文件缺少父战略状态摘要"}
	if parent_state_sha256.begins_with("demo:"):
		if parent_state_sha256 != "demo:%s" % str(battle.get("id", "")):
			return {"ok": false, "error": "演示恢复文件身份不匹配"}
	else:
		if not _is_sha256(parent_state_sha256): return {"ok": false, "error": "父战略状态摘要格式无效"}
		var strategic_save: Dictionary = SaveRepository.new().load()
		if not bool(strategic_save.get("ok", false)):
			return {"ok": false, "error": "恢复文件对应的战略存档不可用"}
		if strategic_save.has("recoveryPromotionError"):
			return {"ok": false, "error": String(strategic_save.get("recoveryPromotionError"))}
		var envelope: Dictionary = strategic_save.get("envelope", {})
		if str(envelope.get("stateSha256", "")) != parent_state_sha256:
			# A terminal tactical checkpoint can outlive the strategic save that
			# created it: the presentation deliberately keeps a committed recovery
			# marker until the pause checkpoint is removed. Accept that one durable
			# post-state only when the marker binds the same battle, source digest,
			# and current post-state digest; unrelated newer saves remain rejected.
			var committed := BattleRecoveryRepository.new("user://godot-spike-save.json.battle-recovery.json").load()
			if not bool(committed.get("ok", false)) or not bool(committed.get("found", false)) or str(committed.get("status", "")) != "committed":
				return {"ok": false, "error": "恢复文件与当前战略存档不匹配"}
			var committed_envelope: Dictionary = committed.get("envelope", {})
			var source_envelope: Dictionary = committed_envelope.get("sourceStrategicSave", {})
			var post_envelope: Dictionary = committed_envelope.get("strategicSave", {})
			var settlement_result: Dictionary = committed_envelope.get("settlementResult", {})
			var battle_status := str(battle.get("status", "ongoing"))
			var expected_winner := "attacker" if battle_status == "attacker-won" else "defender" if battle_status == "defender-won" else ""
			var terminal_projection := BattleResult.from_snapshot(battle)
			var projection_digest := Canonical.try_sha256(terminal_projection.get("result", {})) if bool(terminal_projection.get("ok", false)) else {"ok": false}
			var committed_result_digest := Canonical.try_sha256(settlement_result)
			if str(committed.get("battleId", "")) != str(battle.get("id", "")) \
					or str(source_envelope.get("stateSha256", "")) != parent_state_sha256 \
					or str(post_envelope.get("stateSha256", "")) != str(envelope.get("stateSha256", "")) \
					or expected_winner.is_empty() \
					or str(settlement_result.get("battleId", "")) != str(battle.get("id", "")) \
					or str(settlement_result.get("winner", "")) != expected_winner \
					or not bool(projection_digest.get("ok", false)) \
					or not bool(committed_result_digest.get("ok", false)) \
					or str(projection_digest.get("value", "")) != str(committed_result_digest.get("value", "")):
				return {"ok": false, "error": "恢复文件与当前战略存档不匹配"}
	return {"ok": true, "battle": battle, "parentStateSha256": parent_state_sha256}


func _promote(candidate: String) -> bool:
	var target_absolute := ProjectSettings.globalize_path(PATH)
	if FileAccess.file_exists(PATH):
		if DirAccess.remove_absolute(target_absolute) != OK or FileAccess.file_exists(PATH): return false
	return DirAccess.rename_absolute(ProjectSettings.globalize_path(candidate), target_absolute) == OK


func _is_sha256(value: String) -> bool:
	return value.length() == 64 and value.is_valid_hex_number()


func _is_integer_number(value: Variant) -> bool:
	if typeof(value) == TYPE_INT: return true
	if typeof(value) == TYPE_FLOAT: return is_finite(float(value)) and floor(float(value)) == float(value)
	return false
