class_name TacticalBattleSession
extends RefCounted

const BattleState = preload("res://src/domain/tactical/battle_state.gd")
const Commands = preload("res://src/domain/tactical/battle_commands.gd")
const BattleValidator = preload("res://src/domain/tactical/battle_validator.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")

var _battle: BattleState
var _completed: Dictionary = {}
var _completed_order: Array[String] = []


func _init(battle: BattleState = null) -> void:
	_battle = battle


static func from_snapshot(snapshot: Dictionary) -> TacticalBattleSession:
	var issues: Array[Dictionary] = BattleValidator.validate(snapshot)
	if not issues.is_empty(): return null
	var session := TacticalBattleSession.new(BattleState.new(snapshot))
	return session


func snapshot() -> Dictionary:
	return _battle.snapshot() if _battle != null else {}


func state_sha256() -> String:
	var result: Dictionary = Canonical.try_sha256(snapshot())
	return String(result.get("value", ""))


func restore_snapshot(snapshot: Dictionary) -> Dictionary:
	var issues: Array[Dictionary] = BattleValidator.validate(snapshot)
	if not issues.is_empty(): return {"ok": false, "error": BattleValidator.first_error(issues)}
	_battle = BattleState.new(snapshot)
	_completed.clear(); _completed_order.clear()
	return {"ok": true, "error": ""}


func execute(command: Dictionary) -> Dictionary:
	var before := snapshot()
	var before_digest_result: Dictionary = Canonical.try_sha256(before)
	var before_digest := String(before_digest_result.get("value", ""))
	if not before_digest_result.get("ok", false):
		return _decorate_failure(_failure("", "战斗状态无法生成摘要：%s" % String(before_digest_result.get("error", "canonical digest failed"))), command, before)
	var state_issues: Array[Dictionary] = BattleValidator.validate(before)
	if not state_issues.is_empty(): return _decorate_failure(_failure(before_digest, BattleValidator.first_error(state_issues)), command, before)
	var command_check := _validate_command(command)
	if not command_check.get("ok", false): return _decorate_failure(_failure(before_digest, String(command_check.get("error", "战斗命令格式无效"))), command, before)
	var command_id := String(command_check["commandId"])
	var request_digest_result: Dictionary = Canonical.try_sha256(command)
	if not request_digest_result.get("ok", false):
		return _decorate_failure(_failure(before_digest, "战斗命令无法生成摘要：%s" % String(request_digest_result.get("error", "canonical digest failed"))), command, before)
	var request_digest := String(request_digest_result["value"])
	if _completed.has(command_id):
		if _completed[command_id]["requestSha256"] == request_digest:
			var duplicate: Dictionary = _completed[command_id]["result"].duplicate(true)
			duplicate["battle"] = before
			duplicate["beforeBattleStateSha256"] = before_digest
			duplicate["afterBattleStateSha256"] = before_digest
			duplicate["stateChanged"] = false
			duplicate["duplicate"] = true
			return duplicate
		return _decorate_failure(_failure(before_digest, "commandId 已经用于另一条战斗命令"), command, before)
	if String(command["expectedBattleStateSha256"]) != before_digest:
		return _decorate_failure(_failure(before_digest, "战斗状态摘要已过期"), command, before)
	var kind := String(command_check["kind"])
	var parameters: Dictionary = command_check["parameters"]
	var result: Dictionary
	match kind:
		"confirm_deployment": result = Commands.confirm_deployment(_battle)
		"deploy_unit": result = Commands.deploy_unit(_battle, String(parameters.get("unitId", "")), int(parameters.get("slotX", -1)), int(parameters.get("slotY", -1)))
		"move_deployment": result = Commands.move_deployment(_battle, String(parameters.get("unitId", "")), int(parameters.get("slotX", -1)), int(parameters.get("slotY", -1)))
		"move_unit": result = Commands.move_unit(_battle, String(parameters.get("unitId", "")), int(parameters.get("slotX", -1)), int(parameters.get("slotY", -1)))
		"attack_unit": result = Commands.attack_unit(_battle, String(parameters.get("unitId", "")), String(parameters.get("targetUnitId", "")))
		"use_skill": result = Commands.use_skill(_battle, String(parameters.get("unitId", "")), String(parameters.get("skillId", "")), String(parameters.get("targetUnitId", "")))
		"remove_deployment": result = Commands.remove_deployment(_battle, String(parameters.get("unitId", "")))
		"end_unit_turn": result = Commands.end_unit_turn(_battle, String(parameters.get("unitId", "")))
		"end_side_turn": result = Commands.end_side_turn(_battle)
		_: result = _failure(before_digest, "不支持的战斗命令：%s" % kind)
	if result.get("ok", false):
		_battle = result["battle"]
		result.erase("battle")
		result["commandId"] = command_id
		result["kind"] = kind
		result["battle"] = snapshot()
	else:
		result["commandId"] = command_id; result["kind"] = kind; result["battle"] = before
	var completed := {"requestSha256": request_digest, "result": result.duplicate(true)}
	_completed[command_id] = completed; _completed_order.append(command_id)
	while _completed_order.size() > 256:
		_completed.erase(_completed_order.pop_front())
	return result


func _failure(before_digest: String, error: String) -> Dictionary:
	return {"ok": false, "error": error, "stateChanged": false, "beforeBattleStateSha256": before_digest, "afterBattleStateSha256": before_digest, "receipt": {}, "battle": snapshot()}


func _decorate_failure(result: Dictionary, command: Dictionary, before: Dictionary) -> Dictionary:
	result["commandId"] = command.get("commandId", "")
	result["kind"] = command.get("kind", "")
	result["battle"] = before
	return result


func _validate_command(command: Dictionary) -> Dictionary:
	if not command.has("commandEnvelopeVersion") or not _is_exact_integer(command.get("commandEnvelopeVersion")) or int(command.get("commandEnvelopeVersion")) != 1:
		return {"ok": false, "error": "不支持的战斗命令版本"}
	if typeof(command.get("commandId")) != TYPE_STRING or String(command.get("commandId")).is_empty():
		return {"ok": false, "error": "战斗命令缺少 commandId"}
	if typeof(command.get("expectedBattleStateSha256")) != TYPE_STRING or String(command.get("expectedBattleStateSha256")).is_empty():
		return {"ok": false, "error": "战斗命令缺少 expectedBattleStateSha256"}
	if typeof(command.get("kind")) != TYPE_STRING or String(command.get("kind")).is_empty():
		return {"ok": false, "error": "战斗命令缺少 kind"}
	if typeof(command.get("parameters")) != TYPE_DICTIONARY:
		return {"ok": false, "error": "战斗命令 parameters 必须是对象"}
	var kind := String(command["kind"])
	var parameters: Dictionary = command["parameters"]
	if ["deploy_unit", "move_deployment", "move_unit"].has(kind):
		if typeof(parameters.get("unitId")) != TYPE_STRING or String(parameters.get("unitId")).is_empty():
			return {"ok": false, "error": "战斗命令缺少 unitId"}
		for key: String in ["slotX", "slotY"]:
			if not parameters.has(key) or not _is_exact_integer(parameters[key]):
				return {"ok": false, "error": "部署坐标必须是整数"}
	elif ["remove_deployment", "end_unit_turn"].has(kind):
		if typeof(parameters.get("unitId")) != TYPE_STRING or String(parameters.get("unitId")).is_empty():
			return {"ok": false, "error": "战斗命令缺少 unitId"}
	elif kind == "attack_unit":
		for key: String in ["unitId", "targetUnitId"]:
			if typeof(parameters.get(key)) != TYPE_STRING or String(parameters.get(key)).is_empty():
				return {"ok": false, "error": "战斗命令缺少 %s" % key}
	elif kind == "use_skill":
		for key: String in ["unitId", "skillId", "targetUnitId"]:
			if typeof(parameters.get(key)) != TYPE_STRING or String(parameters.get(key)).is_empty():
				return {"ok": false, "error": "战斗命令缺少 %s" % key}
	return {"ok": true, "commandId": String(command["commandId"]), "expectedBattleStateSha256": String(command["expectedBattleStateSha256"]), "kind": kind, "parameters": parameters}


func _is_exact_integer(value: Variant) -> bool:
	return typeof(value) == TYPE_INT or (typeof(value) == TYPE_FLOAT and is_finite(float(value)) and float(value) == floor(float(value)))
