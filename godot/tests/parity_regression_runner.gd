extends SceneTree

const CanonicalJson = preload("res://src/domain/validation/canonical_json.gd")

const MANIFEST_PATH := "res://data/fixtures/full-parity-regression-v1.json"

var _failures := 0
var _assertions := 0


func _initialize() -> void:
	var manifest := _read_json(MANIFEST_PATH)
	_assert_equal(manifest.get("manifestVersion", -1), 1, "full parity manifest version")
	_assert_equal(manifest.get("id", ""), "godot-full-parity-regression-v1", "full parity manifest id")
	var algorithms: Dictionary = manifest.get("algorithms", {})
	_assert_equal(algorithms.get("canonical", ""), "canonical-json-v1", "full parity canonical algorithm")
	_assert_equal(algorithms.get("digest", ""), "sha256", "full parity digest algorithm")
	_assert_equal(algorithms.get("ordering", ""), "fixture-list-order-v1", "full parity ordering algorithm")
	var fixtures: Array = manifest.get("fixtures", [])
	_assert_equal(fixtures.size(), 13, "full parity fixture count")
	var ids := {}
	var paths := {}
	for entry: Variant in fixtures:
		if entry is Dictionary:
			var entry_id := str(entry.get("id", ""))
			var entry_path := str(entry.get("path", ""))
			_assert_true(not ids.has(entry_id) and not paths.has(entry_path), "fixture id/path must be unique")
			ids[entry_id] = true
			paths[entry_path] = true
		_verify_fixture(entry)
	if _failures > 0:
		push_error("[Godot parity regression] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions])
		quit(1)
		return
	print("[Godot parity regression] PASSED: %d fixture assertions" % _assertions)
	quit(0)


func _verify_fixture(entry: Variant) -> void:
	_assert_true(entry is Dictionary, "manifest entry must be an object")
	if not entry is Dictionary:
		return
	var fixture: Dictionary = entry
	var path := str(fixture.get("path", ""))
	_assert_equal(str(fixture.get("id", "")), path.get_file().get_basename(), "%s fixture id" % path)
	_assert_true(path.begins_with("res://data/fixtures/") and not path.contains(".."), "fixture path must stay inside godot/data/fixtures")
	if not path.begins_with("res://data/fixtures/") or path.contains(".."):
		return
	var value := _read_json(path)
	var digest := CanonicalJson.try_sha256(value)
	_assert_true(bool(digest.get("ok", false)), "%s canonical digest must succeed" % path)
	if bool(digest.get("ok", false)):
		_assert_equal(str(digest.get("value", "")), str(fixture.get("canonicalSha256", "")), "%s canonical digest" % path)
	var versions: Array = fixture.get("versionFields", [])
	_assert_true(not versions.is_empty(), "%s must declare a version field" % path)
	for version: Variant in versions:
		_assert_true(version is Dictionary, "%s version metadata must be an object" % path)
		if version is Dictionary:
			var key := str(version.get("key", ""))
			_assert_true(value.has(key), "%s must keep version field %s" % [path, key])
			_assert_equal(value.get(key), version.get("value"), "%s version field %s" % [path, key])


func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		_fail("missing JSON file: %s" % path)
		return {}
	var parser := JSON.new()
	var error := parser.parse(FileAccess.get_file_as_string(path))
	if error != OK or not parser.data is Dictionary:
		_fail("invalid JSON object: %s" % path)
		return {}
	return parser.data


func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value:
		_fail(message)


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if actual != expected:
		_fail("%s (expected %s, received %s)" % [message, str(expected), str(actual)])


func _fail(message: String) -> void:
	_failures += 1
	push_error("[Godot parity regression] " + message)
