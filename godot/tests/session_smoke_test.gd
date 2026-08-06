extends FlightDeckTest

const GameSession = preload("res://src/application/game_session/game_session.gd")
const CanonicalJson = preload("res://src/domain/validation/canonical_json.gd")


func test_canonical_json_digest_is_stable_for_ordered_keys() -> void:
	var left: Dictionary = CanonicalJson.try_sha256({"b": 2, "a": 1})
	var right: Dictionary = CanonicalJson.try_sha256({"a": 1, "b": 2})
	assert_true(bool(left.get("ok", false)), "canonical digest for left object must succeed")
	assert_true(bool(right.get("ok", false)), "canonical digest for right object must succeed")
	assert_equal(
		String(left.get("value", "")),
		String(right.get("value", "")),
		"canonical JSON must ignore Dictionary insertion order",
	)
	assert_not_equal(String(left.get("value", "")), "", "canonical digest must be non-empty")


func test_game_session_start_rejects_non_integer_selection() -> void:
	var session := GameSession.new("user://flightdeck-session-smoke-save.json")
	var rejected: Dictionary = session.start_campaign("1", 0)
	assert_false(bool(rejected.get("ok", true)), "non-integer period id must be rejected")
	assert_equal(
		String(rejected.get("error", "")),
		"periodId and rulerSourceIndex must be integers",
		"rejected campaign start should expose a stable readable error",
	)
