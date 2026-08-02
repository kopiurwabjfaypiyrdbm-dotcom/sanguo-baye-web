extends SceneTree

const CanonicalJson = preload("res://src/domain/validation/canonical_json.gd")
const Validator = preload("res://src/domain/validation/game_state_validator.gd")
const ProductionDataRepository = preload("res://src/application/game_session/production_data_repository.gd")
const GameSession = preload("res://src/application/game_session/game_session.gd")

const FIXTURE_PATH: String = "res://data/fixtures/application-session-suite-v1.json"

var _assertions: int = 0
var _failures: Array[String] = []


func _initialize() -> void:
	print("[Godot application session] starting")
	_test_all_campaign_candidates()
	_test_transaction_fixture()
	if not _failures.is_empty():
		for failure: String in _failures:
			push_error("[Godot application session] " + failure)
		push_error("[Godot application session] FAILED: %d failure(s), %d assertions" % [_failures.size(), _assertions])
		quit(1)
		return
	print("[Godot application session] PASSED: %d assertions" % _assertions)
	quit(0)


func _test_all_campaign_candidates() -> void:
	var loaded: Dictionary = ProductionDataRepository.load_all()
	_assert_true(loaded["ok"], "production data must load: %s" % loaded.get("error", ""))
	if not loaded["ok"]:
		return
	var session: GameSession = GameSession.new()
	var envelopes: Dictionary = loaded["envelopes"]
	for period_id: int in [1, 2, 3, 4]:
		var envelope: Dictionary = envelopes[period_id]
		var expected_seed: int = int(envelope["state"]["rngSeed"])
		for raw_candidate: Variant in envelope["scenario"]["playerCandidates"]:
			var candidate: Dictionary = raw_candidate
			var started: Dictionary = session.start_campaign(period_id, candidate["sourceIndex"])
			_assert_true(started["ok"], "period %d candidate %s must start: %s" % [period_id, candidate["sourceIndex"], started.get("error", "")])
			if not started["ok"]:
				continue
			var state: Dictionary = session.snapshot()
			_assert_equal(state["rngSeed"], expected_seed, "candidate selection must not consume RNG")
			_assert_equal(state["playerFactionId"], candidate["factionId"], "player faction must match candidate")
			_assert_equal(state["activeFactionId"], candidate["factionId"], "active faction must match candidate")
			_assert_equal(Validator.validate(state), [], "started state must validate")
			var player_count: int = 0
			var faction_ids: Array[String] = []
			for raw_faction_id: Variant in (state["factions"] as Dictionary).keys():
				faction_ids.append(str(raw_faction_id))
			faction_ids.sort()
			for faction_id: String in faction_ids:
				if bool(state["factions"][faction_id].get("isPlayer", false)):
					player_count += 1
			_assert_equal(player_count, 1, "started state must have exactly one player faction")

	var before_invalid: String = session.state_sha256()
	_assert_true(not session.start_campaign(9, 1)["ok"], "unknown period must fail")
	_assert_equal(session.state_sha256(), before_invalid, "unknown period must not mutate active session")
	_assert_true(not session.start_campaign(1, 999)["ok"], "unknown candidate must fail")
	_assert_equal(session.state_sha256(), before_invalid, "unknown candidate must not mutate active session")
	_assert_true(not session.start_campaign("1", 1)["ok"], "wrong period type must fail")
	_assert_equal(session.state_sha256(), before_invalid, "wrong period type must not mutate active session")

	var restarted: Dictionary = session.start_campaign(1, 1)
	_assert_true(restarted["ok"], "query test campaign must start")
	if restarted["ok"]:
		var query_before: String = session.state_sha256()
		var detached: Dictionary = session.snapshot()
		detached["rngSeed"] = 0
		var city_result: Dictionary = session.city_query("city-12")
		_assert_true(city_result["found"], "city query must find city-12")
		_assert_equal(city_result["developFarming"]["defaultOfficerId"], "officer-1", "query must select stable default executor")
		_assert_equal(session.state_sha256(), query_before, "snapshot mutation and query must not mutate session")


func _test_transaction_fixture() -> void:
	var fixture: Dictionary = _read_json(FIXTURE_PATH)
	if fixture.is_empty():
		return
	var session: GameSession = GameSession.new()
	var campaign: Dictionary = fixture["campaign"]
	var started: Dictionary = session.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
	_assert_true(started["ok"], "fixture campaign must start: %s" % started.get("error", ""))
	if not started["ok"]:
		return
	_assert_equal(session.state_sha256(), campaign["initialStateSha256"], "initial state digest must match TypeScript")
	var first_result: Dictionary = {}
	for raw_step: Variant in fixture["steps"]:
		var step: Dictionary = raw_step
		var before_digest: String = session.state_sha256()
		var actual: Dictionary = session.execute_command(step["command"])
		var expected: Dictionary = step["expected"]
		_assert_canonical_equal(actual, expected, "%s result must match TypeScript" % step["id"])
		if step["id"] == "success":
			first_result = actual.duplicate(true)
		if not bool(expected["stateChanged"]):
			_assert_equal(session.state_sha256(), before_digest, "%s failure must not mutate state" % step["id"])
	_assert_equal(session.state_sha256(), fixture["finalStateSha256"], "final state digest must match TypeScript")

	var restored: GameSession = GameSession.new()
	var restored_start: Dictionary = restored.start_campaign(campaign["periodId"], campaign["rulerSourceIndex"])
	_assert_true(restored_start["ok"], "snapshot recovery rehearsal must restart campaign")
	if restored_start["ok"]:
		var replayed: Dictionary = restored.execute_command(fixture["steps"][0]["command"])
		_assert_canonical_equal(replayed, first_result, "fresh-session replay must reproduce the committed transaction")


func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		_fail("missing fixture: %s" % path)
		return {}
	var parser: JSON = JSON.new()
	var error: Error = parser.parse(FileAccess.get_file_as_string(path))
	if error != OK or typeof(parser.data) != TYPE_DICTIONARY:
		_fail("invalid fixture: %s" % path)
		return {}
	return parser.data


func _assert_canonical_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	var actual_digest: Dictionary = CanonicalJson.try_sha256(actual)
	var expected_digest: Dictionary = CanonicalJson.try_sha256(expected)
	if not actual_digest["ok"] or not expected_digest["ok"] or actual_digest["value"] != expected_digest["value"]:
		_fail("%s\n expected=%s\n actual=%s" % [message, expected_digest, actual_digest])


func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value:
		_fail(message)


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if actual != expected:
		_fail("%s\n expected=%s\n actual=%s" % [message, expected, actual])


func _fail(message: String) -> void:
	_failures.append(message)
