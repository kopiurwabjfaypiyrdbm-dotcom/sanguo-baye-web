extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const DevelopFarming = preload("res://src/domain/commands/develop_farming_command.gd")
const Rulesets = preload("res://src/domain/rules/campaign_rulesets.gd")
const SaveRepository = preload("res://src/application/persistence/json_save_repository.gd")

const DEFAULT_PERIOD_PATH: String = "res://data/period-1.json"
const DEFAULT_SAVE_PATH: String = "user://godot-spike-save.json"

var _state: GameState
var _repository: SaveRepository


func _init(save_path: String = DEFAULT_SAVE_PATH) -> void:
	_repository = SaveRepository.new(save_path)


func start_period_1(path: String = DEFAULT_PERIOD_PATH) -> Dictionary:
	if not FileAccess.file_exists(path):
		return _failure("时期数据不存在：%s" % path)
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	if file == null:
		return _failure("无法读取时期数据：%s（错误 %d）" % [path, FileAccess.get_open_error()])
	var contents: String = file.get_as_text()
	var read_error: Error = file.get_error()
	file.close()
	if read_error != OK:
		return _failure("读取时期数据失败：%s（错误 %d）" % [path, read_error])

	var parser: JSON = JSON.new()
	var parse_error: Error = parser.parse(contents)
	if parse_error != OK:
		return _failure(
			"时期数据不是有效的 JSON（第 %d 行：%s）" % [parser.get_error_line(), parser.get_error_message()]
		)
	if typeof(parser.data) != TYPE_DICTIONARY:
		return _failure("时期数据根节点必须是对象")
	var candidate_data: Dictionary = parser.data
	var issues: Array[Dictionary] = Validator.validate(candidate_data)
	if not issues.is_empty():
		return _failure(Validator.first_error(issues))

	_state = GameState.new(candidate_data)
	return _success_with_state()


func snapshot() -> Dictionary:
	return {} if _state == null else _state.snapshot()


func execute_develop_farming(city_id: String, officer_id: String) -> Dictionary:
	if _state == null:
		return _failure("尚未载入战役")
	var result: Dictionary = DevelopFarming.execute(_state, city_id, officer_id)
	if not result["ok"]:
		return {
			"ok": false,
			"error": result["error"],
			"receipt": {},
			"state": snapshot(),
		}
	_state = result["next_state"]
	return {
		"ok": true,
		"error": "",
		"receipt": (result["receipt"] as Dictionary).duplicate(true),
		"state": snapshot(),
	}

func save_game() -> Dictionary:
	if _state == null:
		return _failure("尚未载入战役")
	var result: Dictionary = _repository.save(_state, "Godot migration spike")
	if not result["ok"]:
		return result
	return {
		"ok": true,
		"error": "",
		"path": result["path"],
		"envelope": result["envelope"],
		"state": snapshot(),
	}


func load_game() -> Dictionary:
	var result: Dictionary = _repository.load()
	if not result["ok"]:
		return result
	_state = result["state"]
	return {
		"ok": true,
		"error": "",
		"path": result["path"],
		"envelope": result["envelope"],
		"state": snapshot(),
	}


func find_default_executor(city_id: String) -> String:
	if _state == null:
		return ""
	var data: Dictionary = _state.snapshot()
	var cities: Dictionary = data["cities"]
	if not cities.has(city_id):
		return ""
	var city: Dictionary = cities[city_id]
	if city["ownerId"] != data["activeFactionId"]:
		return ""
	var cost: Dictionary = Rulesets.get_develop_cost(data["rulesetId"])
	if cost.is_empty() or int(city["money"]) < int(cost["money"]):
		return ""
	if city.has("farmingLimit") and int(city["farming"]) >= int(city["farmingLimit"]):
		return ""

	var officers: Dictionary = data["officers"]
	var acted_ids: Array = data["actedOfficerIds"]
	var ordered_ids: Array = data["officerOrder"]
	for raw_officer_id: Variant in ordered_ids:
		var officer_id: String = raw_officer_id
		var officer: Dictionary = officers[officer_id]
		if officer["status"] == "serving" \
				and officer["factionId"] == data["activeFactionId"] \
				and officer.get("cityId", "") == city_id \
				and int(officer["stamina"]) >= int(cost["stamina"]) \
				and not acted_ids.has(officer_id):
			return officer_id
	return ""


func _success_with_state() -> Dictionary:
	return {
		"ok": true,
		"error": "",
		"state": snapshot(),
	}


func _failure(reason: String) -> Dictionary:
	return {
		"ok": false,
		"error": reason,
		"state": snapshot(),
	}
