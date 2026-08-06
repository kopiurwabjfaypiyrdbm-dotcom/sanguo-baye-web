extends SceneTree

const MigrationReplayVerifier = preload("res://src/domain/validation/migration_replay_verifier.gd")

const DEFAULT_FIXTURE_PATH: String = "res://data/fixtures/migration-replay-suite-v1.json"
const PERIOD_RESOURCE_PATH: String = "res://data/period-1.json"


func _initialize() -> void:
	var fixture_argument: Dictionary = _fixture_path_from_arguments()
	if not fixture_argument["ok"]:
		_finish({"ok": false, "failures": [fixture_argument["error"]], "step_count": 0})
		return
	var suite_result: Dictionary = _read_json(fixture_argument["path"])
	if not suite_result["ok"]:
		_finish({"ok": false, "failures": [suite_result["error"]], "step_count": 0})
		return
	var initial_result: Dictionary = _read_json(PERIOD_RESOURCE_PATH)
	if not initial_result["ok"]:
		_finish({"ok": false, "failures": [initial_result["error"]], "step_count": 0})
		return
	_finish(MigrationReplayVerifier.validate(suite_result["value"], initial_result["value"]))


func _fixture_path_from_arguments() -> Dictionary:
	var arguments: PackedStringArray = OS.get_cmdline_user_args()
	for index: int in range(arguments.size()):
		if arguments[index] == "--fixture":
			if index + 1 >= arguments.size() or arguments[index + 1].begins_with("--"):
				return {"ok": false, "path": "", "error": "--fixture requires a JSON path"}
			return {"ok": true, "path": arguments[index + 1], "error": ""}
	return {"ok": true, "path": DEFAULT_FIXTURE_PATH, "error": ""}


func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {"ok": false, "value": null, "error": "missing JSON file: %s" % path}
	var parser: JSON = JSON.new()
	var parse_error: Error = parser.parse(FileAccess.get_file_as_string(path))
	if parse_error != OK:
		return {
			"ok": false,
			"value": null,
			"error": "%s:%d: %s" % [path, parser.get_error_line(), parser.get_error_message()],
		}
	return {"ok": true, "value": parser.data, "error": ""}


func _finish(result: Dictionary) -> void:
	if not result["ok"]:
		for failure: String in result["failures"]:
			push_error("[Godot migration replay] " + failure)
		push_error("[Godot migration replay] FAILED failures=%d steps=%d" % [result["failures"].size(), result["step_count"]])
		quit(1)
		return
	print("[Godot migration replay] PASSED steps=%d" % result["step_count"])
	quit(0)
