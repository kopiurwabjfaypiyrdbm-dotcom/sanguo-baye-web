class_name MigrationReplayVerifier
extends RefCounted

const CanonicalJson = preload("res://src/domain/validation/canonical_json.gd")
const GameState = preload("res://src/domain/game_state/game_state.gd")
const DevelopFarming = preload("res://src/domain/commands/develop_farming_command.gd")


static func validate(suite: Variant, initial_data: Variant) -> Dictionary:
	var failures: Array[String] = []
	var counter: Dictionary = {"steps": 0}
	if typeof(suite) != TYPE_DICTIONARY:
		failures.append("suite: expected object")
		return _result(failures, counter)
	var suite_data: Dictionary = suite
	if suite_data.get("fixtureSuiteVersion") != 1.0:
		failures.append("fixtureSuiteVersion: expected 1, received %s" % str(suite_data.get("fixtureSuiteVersion")))
		return _result(failures, counter)
	if suite_data.get("id") != "godot-migration-replay-suite-v1":
		failures.append("id: unsupported %s" % str(suite_data.get("id")))
		return _result(failures, counter)
	var algorithms: Variant = suite_data.get("algorithms")
	if typeof(algorithms) != TYPE_DICTIONARY:
		return _result(["algorithms: expected object"], counter)
	var algorithm_data: Dictionary = algorithms
	if algorithm_data.get("canonical") != CanonicalJson.ALGORITHM:
		failures.append("algorithms.canonical: unsupported %s" % str(algorithm_data.get("canonical")))
	if algorithm_data.get("digest") != CanonicalJson.DIGEST_ALGORITHM:
		failures.append("algorithms.digest: unsupported %s" % str(algorithm_data.get("digest")))
	if algorithm_data.get("numberDomain") != CanonicalJson.NUMBER_DOMAIN:
		failures.append("algorithms.numberDomain: unsupported %s" % str(algorithm_data.get("numberDomain")))
	if not failures.is_empty():
		return _result(failures, counter)
	var initial_state_contract: Variant = suite_data.get("initialState")
	if typeof(initial_state_contract) != TYPE_DICTIONARY:
		failures.append("initialState.path: v1 only allows godot/data/period-1.json")
		return _result(failures, counter)
	var initial_state_data: Dictionary = initial_state_contract
	if initial_state_data.get("path") != "godot/data/period-1.json":
		failures.append("initialState.path: v1 only allows godot/data/period-1.json")
		return _result(failures, counter)
	if typeof(initial_data) != TYPE_DICTIONARY:
		failures.append("initialState: expected object")
		return _result(failures, counter)
	if typeof(suite_data.get("canonicalVectors")) != TYPE_ARRAY:
		failures.append("canonicalVectors: expected array")
	if typeof(suite_data.get("replays")) != TYPE_ARRAY:
		failures.append("replays: expected array")
	if not failures.is_empty():
		return _result(failures, counter)

	_validate_vectors(suite_data["canonicalVectors"], failures)
	for replay_index: int in range(suite_data["replays"].size()):
		_validate_replay(suite_data["replays"][replay_index], replay_index, initial_data, failures, counter)
	return _result(failures, counter)


static func _validate_vectors(vectors: Array, failures: Array[String]) -> void:
	for index: int in range(vectors.size()):
		var raw_vector: Variant = vectors[index]
		if typeof(raw_vector) != TYPE_DICTIONARY:
			failures.append("canonicalVectors[%d]: expected object" % index)
			continue
		var vector: Dictionary = raw_vector
		if typeof(vector.get("id")) != TYPE_STRING or not vector.has("value") \
				or typeof(vector.get("canonical")) != TYPE_STRING or typeof(vector.get("sha256")) != TYPE_STRING:
			failures.append("canonicalVectors[%d]: missing required field" % index)
			continue
		var label: String = String(vector["id"])
		var encoded: Dictionary = CanonicalJson.try_encode(vector["value"])
		_compare_canonical(label + ".canonical", encoded, vector["canonical"], failures)
		var digest: Dictionary = CanonicalJson.try_sha256(vector["value"])
		_compare_canonical(label + ".sha256", digest, vector["sha256"], failures)


static func _validate_replay(
	raw_replay: Variant,
	replay_index: int,
	initial_data: Dictionary,
	failures: Array[String],
	counter: Dictionary
) -> void:
	if typeof(raw_replay) != TYPE_DICTIONARY:
		failures.append("replays[%d]: expected object" % replay_index)
		return
	var replay: Dictionary = raw_replay
	if typeof(replay.get("id")) != TYPE_STRING or typeof(replay.get("initialStateSha256")) != TYPE_STRING \
			or typeof(replay.get("finalStateSha256")) != TYPE_STRING or typeof(replay.get("steps")) != TYPE_ARRAY:
		failures.append("replays[%d]: missing or invalid required field" % replay_index)
		return
	var replay_id: String = String(replay["id"])
	var state: GameState = GameState.new(initial_data)
	_compare_digest(replay_id + ".initialStateSha256", state.snapshot(), replay["initialStateSha256"], failures)
	var steps: Array = replay["steps"]
	for index: int in range(steps.size()):
		counter["steps"] = int(counter["steps"]) + 1
		var raw_step: Variant = steps[index]
		var prefix: String = "%s.step[%d]" % [replay_id, index]
		if typeof(raw_step) != TYPE_DICTIONARY:
			failures.append(prefix + ": expected object")
			continue
		var step: Dictionary = raw_step
		if typeof(step.get("command")) != TYPE_DICTIONARY or typeof(step.get("expected")) != TYPE_DICTIONARY \
				or typeof(step.get("beforeStateSha256")) != TYPE_STRING \
				or typeof(step.get("afterStateSha256")) != TYPE_STRING \
				or typeof(step.get("stateChanged")) != TYPE_BOOL:
			failures.append(prefix + ": missing or invalid required field")
			continue
		var command: Dictionary = step["command"]
		if command.get("kind") != "developFarming" or typeof(command.get("cityId")) != TYPE_STRING \
				or typeof(command.get("officerId")) != TYPE_STRING \
				or String(command.get("cityId")).is_empty() or String(command.get("officerId")).is_empty():
			failures.append(prefix + ".command: unsupported or incomplete adapter payload")
			continue
		var before_result: Dictionary = CanonicalJson.try_sha256(state.snapshot())
		_compare_canonical(prefix + ".beforeStateSha256", before_result, step["beforeStateSha256"], failures)
		var before_digest: String = before_result["value"] if before_result["ok"] else ""
		var execution: Dictionary = _execute(state, command)
		if execution["ok"]:
			state = execution["next_state"]
		var after_result: Dictionary = CanonicalJson.try_sha256(state.snapshot())
		_compare_canonical(prefix + ".afterStateSha256", after_result, step["afterStateSha256"], failures)
		var after_digest: String = after_result["value"] if after_result["ok"] else ""
		_compare(prefix + ".stateChanged", before_digest != after_digest, step["stateChanged"], failures)
		var observable: Dictionary = {"ok": execution["ok"], "receipt": execution["receipt"]}
		if not execution["ok"]:
			observable["error"] = execution["error"]
		var actual_observable: Dictionary = CanonicalJson.try_encode(observable)
		var expected_observable: Dictionary = CanonicalJson.try_encode(step["expected"])
		if not expected_observable["ok"]:
			failures.append(prefix + ".expected: " + expected_observable["error"])
		elif actual_observable["ok"]:
			_compare(prefix + ".expected", actual_observable["value"], expected_observable["value"], failures)
		else:
			failures.append(prefix + ".actual: " + actual_observable["error"])
	_compare_digest(replay_id + ".finalStateSha256", state.snapshot(), replay["finalStateSha256"], failures)


static func _execute(state: GameState, command: Dictionary) -> Dictionary:
	return DevelopFarming.execute(state, command["cityId"], command["officerId"])


static func _compare_digest(label: String, value: Variant, expected: Variant, failures: Array[String]) -> void:
	_compare_canonical(label, CanonicalJson.try_sha256(value), expected, failures)


static func _compare_canonical(label: String, encoded: Dictionary, expected: Variant, failures: Array[String]) -> void:
	if not encoded["ok"]:
		failures.append(label + ": " + encoded["error"])
		return
	_compare(label, encoded["value"], expected, failures)


static func _compare(label: String, actual: Variant, expected: Variant, failures: Array[String]) -> void:
	if actual != expected:
		failures.append("%s: expected %s, received %s" % [label, str(expected), str(actual)])


static func _result(failures: Array[String], counter: Dictionary) -> Dictionary:
	return {"ok": failures.is_empty(), "failures": failures, "step_count": int(counter["steps"])}
