extends SceneTree

const Skill = preload("res://src/domain/tactical/battle_skill.gd")
const Commands = preload("res://src/domain/tactical/battle_commands.gd")
const GameState = preload("res://src/domain/game_state/game_state.gd")
const GameSession = preload("res://src/application/game_session/game_session.gd")
const Session = preload("res://src/application/tactical_battle/tactical_battle_session.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const FIXTURE_PATH := "res://data/fixtures/tactical-battle-skill-v1.json"
var _failures := 0
var _assertions := 0

func _init() -> void: call_deferred("_run")

func _run() -> void:
	print("[Godot tactical skill] starting")
	var fixture := _read_dictionary(FIXTURE_PATH)
	if fixture.is_empty(): quit(1); return
	var initial: Dictionary = fixture["initialBattle"]
	var session := Session.from_snapshot(initial)
	_assert_true(session != null, "skill snapshot must restore")
	if session != null:
		_test_oracle(fixture)
		_test_modifier_case(fixture)
		_test_equipment_factory(fixture)
		_test_success(fixture, session)
		_test_self_target(fixture)
		_test_restore(fixture)
		_test_boundaries(fixture)
		_test_malformed_restore(initial)
	if _failures > 0: push_error("[Godot tactical skill] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions]); quit(1); return
	print("[Godot tactical skill] PASSED: %d assertion(s)" % _assertions); quit(0)

func _test_oracle(fixture: Dictionary) -> void:
	var actor_id := String(fixture["expected"]["actorId"]); var target_id := String(fixture["expected"]["targetId"])
	_assert_true(Skill.available(fixture["initialBattle"], actor_id, "rally"), "rally must be available")
	_assert_equal(Skill.target_ids(fixture["initialBattle"], actor_id, "rally"), fixture["webOracle"]["targetIds"], "rally targets must match Web oracle")
	var actual_preview := Skill.preview(fixture["initialBattle"], actor_id, "rally", target_id)
	_assert_equal(actual_preview, fixture["webOracle"]["preview"], "rally preview must match Web oracle")
	_assert_equal(fixture["webOracle"]["availableSkillIds"], ["rally"], "fixture must identify the implemented Web skill slice")
	var web_skills: Array = fixture["webOracle"]["webAvailableSkillIds"].duplicate()
	var sorted_web_skills: Array = web_skills.duplicate(); sorted_web_skills.sort_custom(_web_skill_before)
	_assert_equal(web_skills, sorted_web_skills, "Web skill list must be explicitly sorted")
	_assert_true(web_skills.has("rally"), "Web skill list must contain the implemented rally slice")

func _test_success(fixture: Dictionary, session: RefCounted) -> void:
	var actual: Dictionary = session.execute(fixture["success"]["command"])
	_assert_equal(actual, fixture["success"]["expected"], "rally execute must match Web oracle")
	_assert_equal(actual["receipt"]["details"]["seedAfter"], fixture["expected"]["seedAfter"], "rally must advance the explicit LCG seed once")

func _test_modifier_case(fixture: Dictionary) -> void:
	var modifier: Dictionary = fixture["equipmentModifierCase"]
	var battle: Dictionary = modifier["battle"]
	var unmodified: Dictionary = modifier["unmodifiedBattle"]
	var actor_id := String(fixture["expected"]["actorId"])
	var target_id := String(fixture["expected"]["targetId"])
	_assert_true(String(modifier["modifier"]["kind"]) == "equipment-intelligence", "fixture must identify the equipment modifier")
	_assert_true(not bool(modifier["unmodifiedAvailable"]), "unmodified actor must fail the rally intelligence threshold")
	_assert_equal(battle["units"][actor_id]["intelligence"], unmodified["units"][actor_id]["intelligence"] + int(modifier["modifier"]["intelligenceBonus"]), "equipment modifier must change effective intelligence")
	_assert_equal(modifier["modifier"]["equipmentItemIds"], ["item-13"], "fixture must retain the source equipment slot")
	_assert_true(Skill.available(battle, actor_id, "rally"), "equipment-modified actor must retain rally eligibility")
	_assert_equal(Skill.preview(battle, actor_id, "rally", target_id), modifier["preview"], "equipment intelligence modifier must match Web oracle")
	_assert_equal(int(modifier["preview"]["expectedTroopChange"]), 91, "equipment-modified rally preview must retain the Web effective-attribute result")

func _test_self_target(fixture: Dictionary) -> void:
	var self_case: Dictionary = fixture["selfRallyCase"]
	var self_session := Session.from_snapshot(_read_dictionary(FIXTURE_PATH)["initialBattle"])
	_assert_true(self_session != null, "self rally session must initialize")
	if self_session == null: return
	var self_snapshot: Dictionary = fixture["initialBattle"].duplicate(true)
	self_snapshot["units"]["officer:officer-1"]["troops"] = 70
	self_snapshot["units"]["officer:officer-1"]["moved"] = false
	self_snapshot["units"]["officer:officer-1"]["acted"] = false
	self_snapshot["actedUnitIds"] = ["officer:officer-32"]
	self_session = Session.from_snapshot(self_snapshot)
	_assert_true(self_session != null, "self rally damaged session must initialize")
	if self_session != null:
		var actual: Dictionary = self_session.execute(self_case["command"])
		_assert_equal(actual, self_case["expected"], "self rally must preserve actor action fields")

func _test_equipment_factory(fixture: Dictionary) -> void:
	var campaign := GameSession.new()
	var loaded: Dictionary = campaign.start_campaign(1, 1)
	_assert_true(bool(loaded.get("ok", false)), "Godot production campaign must start for equipment factory")
	if not bool(loaded.get("ok", false)): return
	var state_data: Dictionary = loaded["state"].duplicate(true)
	var actor: Dictionary = state_data["officers"]["officer-1"].duplicate(true)
	actor["intelligence"] = 60
	actor["equipmentItemIds"] = ["item-13"]
	state_data["officers"]["officer-1"] = actor
	for raw_officer_id: Variant in state_data["officers"].keys():
		if String(raw_officer_id) == "officer-1": continue
		var officer: Dictionary = state_data["officers"][raw_officer_id]
		officer["equipmentItemIds"] = Array(officer.get("equipmentItemIds", [])).filter(func(item_id: Variant) -> bool: return String(item_id) != "item-13")
	for raw_city_id: Variant in state_data["cities"].keys():
		var city: Dictionary = state_data["cities"][raw_city_id]
		city["itemIds"] = Array(city.get("itemIds", [])).filter(func(item_id: Variant) -> bool: return String(item_id) != "item-13")
		city["hiddenItemIds"] = Array(city.get("hiddenItemIds", [])).filter(func(item_id: Variant) -> bool: return String(item_id) != "item-13")
	var created: Dictionary = Commands.create(GameState.new(state_data), {"sourceCityId": "city-12", "targetCityId": "city-11", "officerIds": ["officer-1", "officer-32"], "provisions": 20})
	_assert_true(bool(created.get("ok", false)), "Godot tactical factory must accept equipped production state")
	if not bool(created.get("ok", false)): return
	var battle: Dictionary = created["battle"].snapshot()
	var expected_unit: Dictionary = fixture["equipmentModifierCase"]["battle"]["units"]["officer:officer-1"]
	_assert_equal(battle["units"]["officer:officer-1"]["intelligence"], expected_unit["intelligence"], "Godot factory must project equipment intelligence")
	_assert_equal(battle["units"]["officer:officer-1"]["skillPoints"], expected_unit["skillPoints"], "Godot factory must project equipment skill points")
	_assert_true(String(battle["guard"]["participants"][0].get("equipmentKey", "")).contains("item-13"), "Godot factory guard must retain equipment provenance")

func _test_restore(fixture: Dictionary) -> void:
	var session := Session.from_snapshot(fixture["initialBattle"]); _assert_true(session != null, "skill restore session must initialize")
	if session != null: _assert_equal(session.execute(fixture["restoredContinuation"]["command"]), fixture["restoredContinuation"]["expected"], "restored rally must match oracle")

func _test_boundaries(fixture: Dictionary) -> void:
	for boundary: Dictionary in fixture["boundaryCases"]:
		var session := Session.from_snapshot(boundary.get("snapshot", fixture["initialBattle"]).duplicate(true))
		_assert_true(session != null, "boundary %s snapshot must restore" % boundary["id"])
		if session == null: continue
		for prelude: Dictionary in boundary.get("prelude", []): session.execute(prelude)
		_assert_equal(session.execute(boundary["command"]), boundary["expected"], "boundary %s must match oracle" % boundary["id"])
		if boundary.has("duplicateExpected"): _assert_equal(session.execute(boundary["command"]), boundary["duplicateExpected"], "duplicate %s must be idempotent" % boundary["id"])

func _test_malformed_restore(initial: Dictionary) -> void:
	var bad_points := initial.duplicate(true); bad_points["units"]["officer:officer-1"]["skillPoints"] = 256
	_assert_true(Session.from_snapshot(bad_points) == null, "skill points upper bound must be rejected")
	var bad_max := initial.duplicate(true); bad_max["units"]["officer:officer-1"]["skillPoints"] = 20; bad_max["units"]["officer:officer-1"]["maxSkillPoints"] = 10
	_assert_true(Session.from_snapshot(bad_max) == null, "skill points cannot exceed max")
	var bad_status := initial.duplicate(true); bad_status["units"]["officer:officer-1"]["status"] = "silenced"; bad_status["units"]["officer:officer-1"]["statusTurns"] = 1
	_assert_true(not Skill.available(bad_status, "officer:officer-1", "rally"), "silenced actor cannot use rally")
	var bad_original := initial.duplicate(true); bad_original["units"]["officer:officer-1"]["originalTroops"] = []
	_assert_true(Session.from_snapshot(bad_original) == null, "original troops type must be rejected")
	var deployment_phase := initial.duplicate(true); deployment_phase["phase"] = "deployment"; deployment_phase["units"]["officer:officer-1"]["slotX"] = 9; deployment_phase["units"]["officer:officer-1"]["slotY"] = 3; deployment_phase["units"]["officer:officer-32"]["slotX"] = 9; deployment_phase["units"]["officer:officer-32"]["slotY"] = 4; deployment_phase["deployment"]["attacker"][0]["slotX"] = 9; deployment_phase["deployment"]["attacker"][0]["slotY"] = 3; deployment_phase["deployment"]["attacker"][1]["slotX"] = 9; deployment_phase["deployment"]["attacker"][1]["slotY"] = 4
	_assert_true(not Skill.available(deployment_phase, "officer:officer-1", "rally"), "deployment phase must not expose rally")

func _read_dictionary(path: String) -> Dictionary:
	if not FileAccess.file_exists(path): _fail("fixture is missing: %s" % path); return {}
	var file := FileAccess.open(path, FileAccess.READ); if file == null: _fail("cannot open fixture: %s" % path); return {}
	var parser := JSON.new(); var error := parser.parse(file.get_as_text()); file.close()
	if error != OK or typeof(parser.data) != TYPE_DICTIONARY: _fail("cannot parse fixture: %s" % path); return {}
	return parser.data

func _digest(value: Variant) -> String:
	var result: Dictionary = Canonical.try_sha256(value); return String(result.get("value", "")) if result.get("ok", false) else ""

func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if not _equivalent(actual, expected): _fail("%s\n  first difference: %s" % [message, _first_difference(actual, expected, "$", 0)])
func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value: _fail(message)
func _equivalent(actual: Variant, expected: Variant) -> bool:
	var at := typeof(actual); var et := typeof(expected)
	if (at == TYPE_INT or at == TYPE_FLOAT) and (et == TYPE_INT or et == TYPE_FLOAT): return float(actual) == float(expected)
	if at != et: return false
	if at == TYPE_ARRAY:
		if actual.size() != expected.size(): return false
		for i in range(actual.size()):
			if not _equivalent(actual[i], expected[i]): return false
		return true
	if at == TYPE_DICTIONARY:
		if actual.size() != expected.size(): return false
		for key in actual.keys():
			if not expected.has(key) or not _equivalent(actual[key], expected[key]): return false
		return true
	return actual == expected
func _first_difference(actual: Variant, expected: Variant, path: String, depth: int) -> String:
	if depth > 5: return path
	if (typeof(actual) == TYPE_INT or typeof(actual) == TYPE_FLOAT) and (typeof(expected) == TYPE_INT or typeof(expected) == TYPE_FLOAT): return "" if float(actual) == float(expected) else path
	if typeof(actual) != typeof(expected): return "%s type" % path
	if typeof(actual) == TYPE_DICTIONARY:
		for key in expected.keys():
			if not actual.has(key): return "%s missing %s" % [path, key]
			var diff := _first_difference(actual[key], expected[key], "%s.%s" % [path, key], depth + 1)
			if diff != "": return diff
		for key in actual.keys():
			if not expected.has(key): return "%s unexpected %s" % [path, key]
		return ""
	if typeof(actual) == TYPE_ARRAY:
		if actual.size() != expected.size(): return "%s length" % path
		for i in range(actual.size()):
			var diff := _first_difference(actual[i], expected[i], "%s[%d]" % [path, i], depth + 1)
			if diff != "": return diff
		return ""
	return "" if actual == expected else path
func _fail(message: String) -> void: _failures += 1; push_error("[Godot tactical skill] %s" % message)

static func _web_skill_before(left: Variant, right: Variant) -> bool:
	var costs := {"fire": 18, "rally": 20, "root": 20, "confuse": 22, "silence": 24, "hide": 25, "raid-provisions": 26, "qimen": 28, "dunjia": 30, "stone-array": 32}
	var left_cost := int(costs.get(String(left), 999)); var right_cost := int(costs.get(String(right), 999))
	return left_cost < right_cost or (left_cost == right_cost and String(left) < String(right))
