extends Node

## Runtime probe installed as an autoload by `gdeck init`.
## It only responds to explicit --gdeck-* command-line arguments.

signal command_requested(command_name: String, payload: Dictionary)

const VERSION := "1.6.0-cursor.1"
const DIAGNOSTIC_EVENT_LIMIT := 10
const DIAGNOSTIC_COLLECTION_LIMIT := 16
const DIAGNOSTIC_STRING_LIMIT := 256
const DIAGNOSTIC_DEPTH_LIMIT := 4
const PERFORMANCE_TIMING_SAMPLE_LIMIT := 32
const PERFORMANCE_SLOWEST_FRAME_LIMIT := 8

var target_frames := -1
var random_seed_value := 42
var current_frame := 0
var capture_path := ""
var report_path := ""
var scenario_path := ""
var fixture_adapter_path := ""
var fixture_adapter_capability := ""
var fixture_adapter: Node
var benchmark_enabled := false
var benchmark_warmup_frames := 0
var finishing := false
var exit_code := 0
var fps_sum := 0.0
var process_ms_sum := 0.0
var physics_ms_sum := 0.0
var worst_process_ms := 0.0
var sample_count := 0
var performance_timing_samples: Array[Dictionary] = []
var performance_slowest_frames: Array[Dictionary] = []
var semantic_events: Array[Dictionary] = []
var scenario_runner: FlightDeckScenarioRunner

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_parse_arguments(OS.get_cmdline_user_args())
	if target_frames < 0:
		set_process(false)
		return
	if not scenario_path.is_empty():
		scenario_runner = FlightDeckScenarioRunner.new()
		if not scenario_runner.load_file(scenario_path):
			exit_code = 3
			finishing = true
			_finish_run.call_deferred()
			return
	if not fixture_adapter_path.is_empty() and not _load_fixture_adapter():
		exit_code = 3
		finishing = true
		_finish_run.call_deferred()
		return
	print("GDECK_READY version=%s frames=%d" % [VERSION, target_frames])

func _process(delta: float) -> void:
	if target_frames < 0 or finishing:
		return
	current_frame += 1
	var sampling_starts_after := benchmark_warmup_frames if benchmark_enabled else 5
	if current_frame > sampling_starts_after:
		_sample_performance(delta)
	if scenario_runner != null:
		scenario_runner.tick(self)
		if scenario_runner.status == "passed":
			event("scenario_completed", {"status": "passed"})
			finishing = true
			_finish_run.call_deferred()
			return
		if scenario_runner.status == "failed":
			event("scenario_completed", {"status": "failed", "reason": scenario_runner.failure})
			exit_code = 3
			finishing = true
			_finish_run.call_deferred()
			return
	if current_frame >= target_frames:
		if scenario_runner != null and scenario_runner.status == "running":
			scenario_runner.abort("Scenario exceeded global timeout of %d frames" % target_frames)
			exit_code = 3
		finishing = true
		_finish_run.call_deferred()

## Games may call FlightDeckProbe.event("quota_completed", {"ore": 80}).
func event(event_name: String, payload: Dictionary = {}) -> void:
	if not is_active():
		return
	semantic_events.append({
		"name": event_name,
		"frame": current_frame,
		"payload": payload,
	})
	print("GDECK_EVENT %s %s" % [event_name, JSON.stringify(payload)])

func is_active() -> bool:
	return target_frames >= 0

func run_seed() -> int:
	return random_seed_value

func issue_command(command_name: String, payload: Dictionary = {}) -> void:
	event("scenario_command", {"command": command_name, "payload": payload})
	command_requested.emit(command_name, payload)

func find_semantic_event(event_name: String, where: Dictionary = {}, from_index: int = 0) -> int:
	for index in range(maxi(0, from_index), semantic_events.size()):
		var candidate := semantic_events[index]
		if str(candidate.get("name", "")) != event_name:
			continue
		if _payload_matches(candidate.get("payload", {}), where):
			return index
	return -1

func count_semantic_events(event_name: String, where: Dictionary = {}, from_index: int = 0) -> int:
	var count := 0
	for index in range(maxi(0, from_index), semantic_events.size()):
		var candidate := semantic_events[index]
		if str(candidate.get("name", "")) == event_name and _payload_matches(candidate.get("payload", {}), where):
			count += 1
	return count

func matching_semantic_events_before(event_name: String, where: Dictionary, before_index: int) -> Dictionary:
	var matches: Array = []
	var total := 0
	var end_index := clampi(before_index, 0, semantic_events.size())
	for index in range(end_index):
		var candidate := semantic_events[index]
		if str(candidate.get("name", "")) != event_name or not _payload_matches(candidate.get("payload", {}), where):
			continue
		total += 1
		if matches.size() < DIAGNOSTIC_EVENT_LIMIT:
			matches.append({
				"event_index": index,
				"name": str(candidate.get("name", "")),
				"frame": int(candidate.get("frame", 0)),
				"payload": _bounded_diagnostic_value(candidate.get("payload", {})),
			})
	return {
		"total": total,
		"events": matches,
		"limit": DIAGNOSTIC_EVENT_LIMIT,
		"truncated": total > matches.size(),
	}

func _bounded_diagnostic_value(value: Variant, depth: int = 0) -> Variant:
	if value is String:
		if value.length() <= DIAGNOSTIC_STRING_LIMIT:
			return value
		return {
			"value": value.left(DIAGNOSTIC_STRING_LIMIT),
			"original_length": value.length(),
			"truncated": true,
		}
	if value is Dictionary:
		var dictionary_value: Dictionary = value
		if depth >= DIAGNOSTIC_DEPTH_LIMIT:
			return {"truncated": true, "original_type": "Dictionary", "original_size": dictionary_value.size()}
		var bounded_dictionary := {}
		var keys: Array = dictionary_value.keys()
		for index in range(mini(keys.size(), DIAGNOSTIC_COLLECTION_LIMIT)):
			var key = keys[index]
			bounded_dictionary[str(key)] = _bounded_diagnostic_value(dictionary_value[key], depth + 1)
		if keys.size() > DIAGNOSTIC_COLLECTION_LIMIT:
			bounded_dictionary["_gdeck_truncated_entries"] = keys.size() - DIAGNOSTIC_COLLECTION_LIMIT
		return bounded_dictionary
	if value is Array:
		var array_value: Array = value
		if depth >= DIAGNOSTIC_DEPTH_LIMIT:
			return [{"truncated": true, "original_type": "Array", "original_size": array_value.size()}]
		var bounded_array := []
		for index in range(mini(array_value.size(), DIAGNOSTIC_COLLECTION_LIMIT)):
			bounded_array.append(_bounded_diagnostic_value(array_value[index], depth + 1))
		if array_value.size() > DIAGNOSTIC_COLLECTION_LIMIT:
			bounded_array.append({"truncated_items": array_value.size() - DIAGNOSTIC_COLLECTION_LIMIT})
		return bounded_array
	return value

func _payload_matches(payload: Dictionary, where: Dictionary) -> bool:
	for key in where:
		if not payload.has(key) or payload[key] != where[key]:
			return false
	return true

func _parse_arguments(args: PackedStringArray) -> void:
	for argument in args:
		if argument.begins_with("--gdeck-capture="):
			capture_path = argument.trim_prefix("--gdeck-capture=")
		elif argument.begins_with("--gdeck-report="):
			report_path = argument.trim_prefix("--gdeck-report=")
		elif argument.begins_with("--gdeck-scenario="):
			scenario_path = argument.trim_prefix("--gdeck-scenario=")
		elif argument.begins_with("--gdeck-fixture-adapter="):
			fixture_adapter_path = argument.trim_prefix("--gdeck-fixture-adapter=")
		elif argument.begins_with("--gdeck-fixture-capability="):
			fixture_adapter_capability = argument.trim_prefix("--gdeck-fixture-capability=")
		elif argument.begins_with("--gdeck-after-frames="):
			target_frames = maxi(1, int(argument.trim_prefix("--gdeck-after-frames=")))
		elif argument.begins_with("--gdeck-seed="):
			random_seed_value = int(argument.trim_prefix("--gdeck-seed="))
			seed(random_seed_value)
		elif argument.begins_with("--gdeck-warmup-frames="):
			benchmark_warmup_frames = maxi(0, int(argument.trim_prefix("--gdeck-warmup-frames=")))
		elif argument == "--gdeck-benchmark":
			benchmark_enabled = true
	if (not capture_path.is_empty() or not report_path.is_empty() or not scenario_path.is_empty()) and target_frames < 0:
		target_frames = 30

func _load_fixture_adapter() -> bool:
	var expected_capability := OS.get_environment("GDECK_FIXTURE_CAPABILITY")
	if fixture_adapter_capability.length() != 64 or expected_capability.length() != 64 or fixture_adapter_capability != expected_capability:
		push_error("Flight Deck fixture adapter capability is missing or invalid; adapters only run through an isolated test profile")
		return false
	if not _fixture_adapter_path_is_safe(fixture_adapter_path):
		push_error("Flight Deck fixture adapter must be a non-symlink res://tests/ or res://qa/ .gd file: %s" % fixture_adapter_path)
		return false
	var script := load(fixture_adapter_path)
	if not script is GDScript or not script.can_instantiate():
		push_error("Flight Deck fixture adapter is not an instantiable GDScript: %s" % fixture_adapter_path)
		return false
	var candidate = script.new()
	if not candidate is Node:
		if candidate != null and candidate.has_method("free"):
			candidate.free()
		push_error("Flight Deck fixture adapter must extend Node: %s" % fixture_adapter_path)
		return false
	fixture_adapter = candidate
	add_child(fixture_adapter)
	if fixture_adapter.has_method("gdeck_setup"):
		fixture_adapter.call("gdeck_setup", self)
	return true

func _fixture_adapter_path_is_safe(path: String) -> bool:
	if not path.ends_with(".gd") or "\\" in path:
		return false
	var relative_path := path.trim_prefix("res://")
	if relative_path == path:
		return false
	var components := relative_path.split("/", false)
	if components.size() < 2 or (components[0] != "tests" and components[0] != "qa"):
		return false
	for component in components:
		if component.is_empty() or component == "." or component == "..":
			return false
	var project_directory := DirAccess.open("res://")
	if project_directory == null:
		return false
	var current := ""
	for component in components:
		current = current.path_join(component)
		if project_directory.is_link(current):
			return false
	return FileAccess.file_exists(path)

func _sample_performance(delta: float) -> void:
	var fps := 1.0 / maxf(delta, 0.0001)
	var process_ms := float(Performance.get_monitor(Performance.TIME_PROCESS)) * 1000.0
	var physics_ms := float(Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)) * 1000.0
	fps_sum += fps
	process_ms_sum += process_ms
	physics_ms_sum += physics_ms
	worst_process_ms = maxf(worst_process_ms, process_ms)
	sample_count += 1
	var expected_samples := maxi(1, target_frames - (benchmark_warmup_frames if benchmark_enabled else 5))
	var sample_stride := maxi(1, ceili(float(expected_samples) / float(PERFORMANCE_TIMING_SAMPLE_LIMIT)))
	if performance_timing_samples.size() < PERFORMANCE_TIMING_SAMPLE_LIMIT and ((sample_count - 1) % sample_stride == 0 or current_frame >= target_frames):
		performance_timing_samples.append(_performance_timing_fact(fps, process_ms, physics_ms))
	var replacement_index := performance_slowest_frames.size()
	if replacement_index >= PERFORMANCE_SLOWEST_FRAME_LIMIT:
		replacement_index = 0
		for index in range(1, performance_slowest_frames.size()):
			var current_weakest: Dictionary = performance_slowest_frames[replacement_index]
			var candidate_weakest: Dictionary = performance_slowest_frames[index]
			if float(candidate_weakest.process_ms) < float(current_weakest.process_ms) or (float(candidate_weakest.process_ms) == float(current_weakest.process_ms) and int(candidate_weakest.frame) > int(current_weakest.frame)):
				replacement_index = index
		var weakest: Dictionary = performance_slowest_frames[replacement_index]
		if process_ms < float(weakest.process_ms) or (process_ms == float(weakest.process_ms) and current_frame >= int(weakest.frame)):
			return
	var slow_fact := _performance_timing_fact(fps, process_ms, physics_ms)
	if performance_slowest_frames.size() < PERFORMANCE_SLOWEST_FRAME_LIMIT:
		performance_slowest_frames.append(slow_fact)
	else:
		performance_slowest_frames[replacement_index] = slow_fact

func _performance_timing_fact(fps: float, process_ms: float, physics_ms: float) -> Dictionary:
	return {
		"sample_index": sample_count - 1,
		"frame": current_frame,
		"fps": fps,
		"process_ms": process_ms,
		"physics_ms": physics_ms,
	}

func _finish_run() -> void:
	await RenderingServer.frame_post_draw
	var capture_error := OK
	if not capture_path.is_empty():
		DirAccess.make_dir_recursive_absolute(capture_path.get_base_dir())
		var image := get_viewport().get_texture().get_image()
		if image == null:
			capture_error = ERR_CANT_CREATE
		else:
			capture_error = image.save_png(capture_path)
		if capture_error == OK:
			print("GDECK_CAPTURED %s" % capture_path)
		else:
			push_error("Flight Deck could not save capture: %s" % capture_path)
			exit_code = 2
	if not report_path.is_empty():
		_write_report(capture_error)
	get_tree().quit(exit_code)

func _write_report(capture_error: Error) -> void:
	DirAccess.make_dir_recursive_absolute(report_path.get_base_dir())
	performance_slowest_frames.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		if float(left.process_ms) == float(right.process_ms):
			return int(left.frame) < int(right.frame)
		return float(left.process_ms) > float(right.process_ms)
	)
	var divisor := maxf(1.0, sample_count)
	var performance := {
		"average_fps": fps_sum / divisor,
		"average_process_ms": process_ms_sum / divisor,
		"average_physics_ms": physics_ms_sum / divisor,
		"worst_process_ms": worst_process_ms,
		"draw_calls": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		"nodes": Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
		"objects": Performance.get_monitor(Performance.OBJECT_COUNT),
		"static_memory_bytes": Performance.get_monitor(Performance.MEMORY_STATIC),
		"active_2d_objects": Performance.get_monitor(Performance.PHYSICS_2D_ACTIVE_OBJECTS),
	}
	var report := {
		"schema_version": 3,
		"flight_deck_version": VERSION,
		"godot_version": Engine.get_version_info().get("string", "unknown"),
		"project": ProjectSettings.get_setting("application/config/name", "Unnamed"),
		"frames": sample_count if benchmark_enabled else current_frame,
		"total_frames": current_frame,
		"capture": capture_path,
		"capture_error": capture_error,
		"benchmark": benchmark_enabled,
		"benchmark_window": {
			"warmup_frames": benchmark_warmup_frames if benchmark_enabled else 5,
			"stable_frames": sample_count,
			"total_frames": current_frame,
		},
		"performance": performance,
		"stable_performance": performance.duplicate(true),
		"performance_timing": {
			"sample_limit": PERFORMANCE_TIMING_SAMPLE_LIMIT,
			"slowest_frame_limit": PERFORMANCE_SLOWEST_FRAME_LIMIT,
			"sample_count": sample_count,
			"samples": performance_timing_samples,
			"samples_truncated": sample_count > performance_timing_samples.size(),
			"slowest_frames": performance_slowest_frames,
		},
		"memory_semantics": {
			"metric": "Performance.MEMORY_STATIC",
			"kind": "completion_snapshot",
			"is_process_rss": false,
			"is_peak_memory": false,
			"bytes_per_mebibyte": 1048576,
		},
		"events": semantic_events,
		"scenario": scenario_runner.result() if scenario_runner != null else null,
	}
	var file := FileAccess.open(report_path, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(report, "  "))
		print("GDECK_REPORTED %s" % report_path)
	else:
		push_error("Flight Deck could not write report: %s" % report_path)
