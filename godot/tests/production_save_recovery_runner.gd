extends SceneTree

const GameSession = preload("res://src/application/game_session/game_session.gd")
const Canonical = preload("res://src/domain/validation/canonical_json.gd")
const TacticalCommands = preload("res://src/domain/tactical/battle_commands.gd")
const FIXTURE_PATH := "res://data/fixtures/godot-production-save-recovery-v1.json"
const SETTLEMENT_FIXTURE_PATH := "res://data/fixtures/tactical-battle-settlement-v1.json"
const SAVE_PATH := "user://godot-mb20-save-recovery-test.json"
var _failures := 0
var _assertions := 0


func _initialize() -> void:
	var fixture := _read_dictionary(FIXTURE_PATH)
	if fixture.is_empty(): quit(1); return
	_assert_equal(TacticalCommands._fnv1a(JSON.stringify("😀")), "accb0e0e", "non-BMP fingerprint must match JS UTF-16 FNV-1a")
	var session := GameSession.new(SAVE_PATH)
	var started := session.start_campaign(1, 1)
	_assert_true(started.get("ok", false), "production campaign must start")
	if not started.get("ok", false): quit(1); return
	_assert_equal(_digest(session.snapshot()), fixture["initialStateSha256"], "production start must match Web state")
	_assert_equal(session.campaign_descriptor(), fixture["campaign"], "production campaign identity must match fixture")

	var saved := session.save_game()
	_assert_true(saved.get("ok", false), "production save must succeed: %s" % saved.get("error", ""))
	if saved.get("ok", false):
		var envelope: Dictionary = saved["envelope"]
		_assert_equal(envelope.get("format", ""), "sanguo-baye-godot-production", "production save must use native format")
		_assert_equal(envelope.get("version", -1), 1, "production save version must be stable")
		_assert_equal(envelope.get("dataContractVersion", -1), 2, "production save must carry data contract")
		_assert_equal(envelope.get("stateSha256", ""), fixture["initialStateSha256"], "production save digest must match state")
		_assert_equal(envelope.get("campaign", {}), fixture["campaign"], "production save campaign must match fixture")

	var restored := GameSession.new(SAVE_PATH)
	var loaded := restored.load_game()
	_assert_true(loaded.get("ok", false), "production save must load: %s" % loaded.get("error", ""))
	if loaded.get("ok", false):
		_assert_equal(_digest(restored.snapshot()), fixture["initialStateSha256"], "save/load must preserve complete production state")
		_assert_equal(restored.campaign_descriptor(), fixture["campaign"], "save/load must preserve campaign descriptor")

	# Simulate a process stop between the temporary/backup renames. A valid
	# fallback must remain loadable without guessing or mutating the session.
	for suffix: String in [".tmp", ".bak"]:
		_write_json(SAVE_PATH + suffix, saved["envelope"])
		_remove_file(SAVE_PATH)
		var recovered_save := GameSession.new(SAVE_PATH).load_game()
		_assert_true(recovered_save.get("ok", false), "production save must recover from %s" % suffix)
		_assert_true(String(recovered_save.get("recoveredFrom", "")).ends_with(suffix), "production save must report %s recovery source" % suffix)
		_assert_true(FileAccess.file_exists(ProjectSettings.globalize_path(SAVE_PATH)), "production fallback must be promoted to the primary path")
		_remove_file(SAVE_PATH + suffix)
		_write_json(SAVE_PATH, saved["envelope"])
	# A corrupt primary must not hide a valid fallback. The corrupt bytes are
	# retained in a recoverable .invalid sidecar and the promoted primary must
	# remain readable after the fallback file is removed.
	_write_json(SAVE_PATH, {"format": "corrupt-primary"})
	_write_json(SAVE_PATH + ".tmp", saved["envelope"])
	var corrupt_primary_recovered := GameSession.new(SAVE_PATH).load_game()
	_assert_true(corrupt_primary_recovered.get("ok", false), "valid fallback must replace a corrupt primary")
	_assert_true(FileAccess.file_exists(ProjectSettings.globalize_path(SAVE_PATH + ".invalid")), "corrupt primary must be retained as an invalid sidecar")
	_remove_file(SAVE_PATH + ".tmp")
	var promoted_primary_read := GameSession.new(SAVE_PATH).load_game()
	_assert_true(promoted_primary_read.get("ok", false), "promoted primary must survive fallback cleanup")
	_remove_file(SAVE_PATH + ".invalid")

	# Malformed and corrupt input must not replace an already loaded session.
	var stable_digest := restored.state_sha256()
	for malformed_id: String in ["badJson", "unknownSaveField", "badSaveDigest", "badSaveState"]:
		_write_json(SAVE_PATH, fixture["malformed"][malformed_id])
		var rejected := restored.load_game()
		_assert_true(not rejected.get("ok", false), "%s save must be rejected" % malformed_id)
		_assert_equal(restored.state_sha256(), stable_digest, "%s rejection must preserve current session" % malformed_id)
	var malformed_production_contract: Dictionary = fixture["productionSave"].duplicate(true)
	(malformed_production_contract["state"] as Dictionary)["dataContractVersion"] = {}
	_write_json(SAVE_PATH, malformed_production_contract)
	var rejected_production_contract := GameSession.new(SAVE_PATH).load_game()
	_assert_true(not rejected_production_contract.get("ok", false), "production non-numeric data contract must be rejected")
	var malformed_legacy_contract: Dictionary = fixture["legacyProductionSave"].duplicate(true)
	(malformed_legacy_contract["state"] as Dictionary)["dataContractVersion"] = []
	_write_json(SAVE_PATH, malformed_legacy_contract)
	var rejected_legacy_contract := GameSession.new(SAVE_PATH).load_game()
	_assert_true(not rejected_legacy_contract.get("ok", false), "legacy non-numeric data contract must be rejected")
	var oversized_production_revision: Dictionary = fixture["productionSave"].duplicate(true)
	oversized_production_revision["saveRevision"] = 9_007_199_254_740_992
	_write_json(SAVE_PATH, oversized_production_revision)
	var rejected_oversized_production := GameSession.new(SAVE_PATH).load_game()
	_assert_true(not rejected_oversized_production.get("ok", false), "production revision beyond safe integer must be rejected")
	var oversized_pending_revision: Dictionary = fixture["pendingPlayer"].duplicate(true)
	oversized_pending_revision["parentSaveRevision"] = 9_007_199_254_740_992
	_write_json(SAVE_PATH + ".battle-recovery.json", oversized_pending_revision)
	var rejected_oversized_pending := GameSession.new(SAVE_PATH).load_battle_recovery()
	_assert_true(not rejected_oversized_pending.get("ok", false), "pending revision beyond safe integer must be rejected")
	_remove_file(SAVE_PATH + ".battle-recovery.json")

	# Version-zero is an explicitly supported, evidence-complete migration: it
	# carries the complete production state, so the campaign identity is rebuilt
	# from the checked-in production catalog rather than guessed.
	_write_json(SAVE_PATH, fixture["legacyProductionSave"])
	var migrated := GameSession.new(SAVE_PATH).load_game()
	_assert_true(migrated.get("ok", false), "supported legacy production save must migrate")
	_assert_true(migrated.get("migrated", false), "legacy production save must report migration")
	if migrated.get("ok", false):
		_assert_equal(_digest(migrated["state"]), fixture["initialStateSha256"], "migrated state must preserve digest")
		_assert_equal(migrated["campaign"], fixture["campaign"], "migrated campaign must be reconstructed")
	_write_json(SAVE_PATH, fixture["webSaveV1"])
	var migrated_web := GameSession.new(SAVE_PATH).load_game()
	_assert_true(migrated_web.get("ok", false) and migrated_web.get("migrated", false), "supported Web v1 production save must migrate")
	if migrated_web.get("ok", false):
		_assert_equal(_digest(migrated_web["state"]), fixture["initialStateSha256"], "Web v1 migration must preserve digest")
	var invalid_web_primary: Dictionary = fixture["webSaveV1"].duplicate(true)
	(invalid_web_primary["state"] as Dictionary)["scenario"] = ((fixture["webSaveV1"]["state"] as Dictionary)["scenario"] as Dictionary).duplicate(true)
	(invalid_web_primary["state"] as Dictionary)["scenario"]["id"] = "catalog-invalid"
	_write_json(SAVE_PATH, invalid_web_primary)
	_write_json(SAVE_PATH + ".tmp", fixture["webSaveV1"])
	var semantic_fallback := GameSession.new(SAVE_PATH).load_game()
	_assert_true(semantic_fallback.get("ok", false), "catalog-invalid Web primary must fall back to a valid temporary save")
	_assert_true(String(semantic_fallback.get("recoveredFrom", "")).ends_with(".tmp"), "catalog-invalid Web primary must report fallback source")
	_remove_file(SAVE_PATH + ".tmp")
	var invalid_campaign_primary: Dictionary = fixture["productionSave"].duplicate(true)
	invalid_campaign_primary["campaign"] = (fixture["campaign"] as Dictionary).duplicate(true)
	invalid_campaign_primary["campaign"]["title"] = "目录外标题"
	_write_json(SAVE_PATH, invalid_campaign_primary)
	_write_json(SAVE_PATH + ".tmp", fixture["productionSave"])
	var campaign_fallback := GameSession.new(SAVE_PATH).load_game()
	_assert_true(campaign_fallback.get("ok", false), "catalog-invalid campaign primary must fall back to a valid temporary save")
	_assert_true(String(campaign_fallback.get("recoveredFrom", "")).ends_with(".tmp"), "catalog-invalid campaign must report fallback source")
	_remove_file(SAVE_PATH + ".tmp")

	# Pending player and AI checkpoints round-trip through the same versioned
	# recovery envelope and never depend on Dictionary traversal order.
	var player_session := GameSession.new(SAVE_PATH)
	player_session.start_campaign(1, 1)
	var pending_player := player_session.save_battle_recovery_pending(fixture["pendingPlayer"]["order"], fixture["pendingPlayer"]["resume"], "玩家检查点", "2026-08-03T00:00:00.000Z")
	_assert_true(pending_player.get("ok", false), "player pending recovery must save: %s" % pending_player.get("error", ""))
	var duplicate_pending := player_session.save_battle_recovery_pending(fixture["pendingPlayer"]["order"], fixture["pendingPlayer"]["resume"], "玩家检查点", "2026-08-03T00:00:00.000Z")
	_assert_true(duplicate_pending.get("ok", false), "identical pending recovery must be idempotent")
	var conflicting_pending_order: Dictionary = (fixture["pendingPlayer"]["order"] as Dictionary).duplicate(true)
	conflicting_pending_order["provisions"] = int(conflicting_pending_order["provisions"]) + 1
	var conflicting_pending := player_session.save_battle_recovery_pending(conflicting_pending_order, fixture["pendingPlayer"]["resume"], "冲突检查点", "2026-08-03T00:00:00.000Z")
	_assert_true(not conflicting_pending.get("ok", false), "conflicting pending recovery must be rejected")
	var player_loaded := player_session.load_battle_recovery()
	_assert_true(player_loaded.get("ok", false) and player_loaded.get("status", "") == "pending", "player pending recovery must load")
	_assert_equal(player_loaded.get("battleId", ""), fixture["identifiers"]["playerBattleId"], "player recovery battle id must be deterministic")
	_assert_equal(_digest(player_loaded.get("state", {})), fixture["initialStateSha256"], "player recovery state must round-trip")
	_write_json(SAVE_PATH + ".battle-recovery.json.bak", pending_player["envelope"])
	_remove_file(SAVE_PATH + ".battle-recovery.json")
	var recovered_pending := player_session.load_battle_recovery()
	_assert_true(recovered_pending.get("ok", false) and recovered_pending.get("status", "") == "pending", "pending recovery must recover from backup")
	_assert_true(String(recovered_pending.get("recoveredFrom", "")).ends_with(".bak"), "pending recovery must report backup source")
	_assert_true(FileAccess.file_exists(ProjectSettings.globalize_path(SAVE_PATH + ".battle-recovery.json")), "recovery fallback must be promoted to the primary path")
	_remove_file(SAVE_PATH + ".battle-recovery.json.bak")
	_write_json(SAVE_PATH + ".battle-recovery.json", {"format": "corrupt-recovery-primary"})
	_write_json(SAVE_PATH + ".battle-recovery.json.tmp", pending_player["envelope"])
	var corrupt_recovery_recovered := player_session.load_battle_recovery()
	_assert_true(corrupt_recovery_recovered.get("ok", false), "valid recovery fallback must replace a corrupt primary")
	_assert_true(FileAccess.file_exists(ProjectSettings.globalize_path(SAVE_PATH + ".battle-recovery.json.invalid")), "corrupt recovery primary must be retained as an invalid sidecar")
	_remove_file(SAVE_PATH + ".battle-recovery.json.tmp")
	var promoted_recovery_read := player_session.load_battle_recovery()
	_assert_true(promoted_recovery_read.get("ok", false), "promoted recovery primary must survive fallback cleanup")
	_remove_file(SAVE_PATH + ".battle-recovery.json.invalid")
	# Consume the checked-in Web fixture directly, not only a Godot-produced
	# round-trip. This keeps the language-neutral recovery contract executable.
	player_session.clear_battle_recovery()
	_write_json(SAVE_PATH + ".battle-recovery.json", fixture["pendingPlayer"])
	var fixture_player_loaded := player_session.load_battle_recovery()
	_assert_true(fixture_player_loaded.get("ok", false), "Web player recovery fixture must load")
	if fixture_player_loaded.get("ok", false):
		_assert_equal(fixture_player_loaded.get("status", ""), "pending", "Web player fixture status must remain pending")
		_assert_equal(fixture_player_loaded.get("mode", ""), fixture["pendingPlayer"]["mode"], "Web player fixture mode must match")
		_assert_equal(fixture_player_loaded.get("battleId", ""), fixture["identifiers"]["playerBattleId"], "Web player fixture battle id must match")
		_assert_equal(fixture_player_loaded.get("strategicFingerprint", ""), fixture["identifiers"]["playerFingerprint"], "Web player fixture fingerprint must match (actual=%s expected=%s)" % [fixture_player_loaded.get("strategicFingerprint", ""), fixture["identifiers"]["playerFingerprint"]])
		_assert_equal(fixture_player_loaded.get("order", {}), fixture["pendingPlayer"]["order"], "Web player fixture order must match")
		_assert_equal(fixture_player_loaded.get("resume", {}), fixture["pendingPlayer"]["resume"], "Web player fixture resume must match")
	_remove_file(SAVE_PATH + ".battle-recovery.json")
	# Pending checkpoints also carry the main-save revision they were created
	# from. A newer unsaved session may resume over the old main save, while a
	# later main save must win on cold start.
	var pending_revision_session := GameSession.new(SAVE_PATH)
	pending_revision_session.start_campaign(1, 1)
	var pending_base_save := pending_revision_session.save_game()
	_assert_true(pending_base_save.get("ok", false), "pending revision base save must succeed")
	var pending_changed := pending_revision_session.execute_develop_farming("city-12", "officer-32")
	_assert_true(pending_changed.get("ok", false), "pending revision unsaved change must succeed")
	var pending_revision := pending_revision_session.save_battle_recovery_pending(fixture["pendingPlayer"]["order"], fixture["pendingPlayer"]["resume"], "版本检查点", "2026-08-03T00:00:00.000Z")
	_assert_true(pending_revision.get("ok", false), "pending revision marker must save: %s" % pending_revision.get("error", ""))
	if pending_revision.get("ok", false):
		_assert_equal(pending_revision["envelope"].get("parentSaveRevision", -1), pending_base_save["envelope"].get("saveRevision", -2), "pending marker must bind parent save revision")
	var cold_pending_resume := GameSession.new(SAVE_PATH).resume_battle_recovery()
	_assert_true(cold_pending_resume.get("ok", false) and cold_pending_resume.get("code", "") == "resumed", "cold start must resume newer pending state over older main save")
	var newer_main_envelope: Dictionary = fixture["productionSave"].duplicate(true)
	newer_main_envelope["saveRevision"] = int(pending_base_save["envelope"].get("saveRevision", 0)) + 1
	_write_json(SAVE_PATH, newer_main_envelope)
	var newer_main_save := GameSession.new(SAVE_PATH).load_game()
	_assert_true(newer_main_save.get("ok", false), "newer main save must remain valid")
	var stale_pending_resume := GameSession.new(SAVE_PATH).resume_battle_recovery()
	_assert_true(not stale_pending_resume.get("ok", false), "newer main save must reject stale pending recovery")
	pending_revision_session.clear_battle_recovery()

	var ai_session := GameSession.new(SAVE_PATH)
	var ai_restored := ai_session.restore_snapshot(fixture["pendingAi"]["strategicSave"]["state"], fixture["campaign"])
	_assert_true(ai_restored.get("ok", false), "AI phase recovery input must restore")
	if ai_restored.get("ok", false):
		var pending_ai := ai_session.save_battle_recovery_pending(fixture["pendingAi"]["order"], fixture["pendingAi"]["resume"], "AI 检查点", "2026-08-03T00:00:00.000Z")
		_assert_true(pending_ai.get("ok", false), "AI pending recovery must save: %s" % pending_ai.get("error", ""))
		var ai_loaded := ai_session.load_battle_recovery()
		_assert_true(ai_loaded.get("ok", false) and ai_loaded.get("status", "") == "pending", "AI pending recovery must load")
		_assert_equal(ai_loaded.get("battleId", ""), fixture["identifiers"]["aiBattleId"], "AI recovery battle id must be deterministic")
		ai_session.clear_battle_recovery()
		_write_json(SAVE_PATH + ".battle-recovery.json", fixture["pendingAi"])
		var fixture_ai_loaded := ai_session.load_battle_recovery()
		_assert_true(fixture_ai_loaded.get("ok", false), "Web AI recovery fixture must load")
		if fixture_ai_loaded.get("ok", false):
			_assert_equal(fixture_ai_loaded.get("status", ""), "pending", "Web AI fixture status must remain pending")
			_assert_equal(fixture_ai_loaded.get("mode", ""), fixture["pendingAi"]["mode"], "Web AI fixture mode must match")
			_assert_equal(fixture_ai_loaded.get("battleId", ""), fixture["identifiers"]["aiBattleId"], "Web AI fixture battle id must match")
			_assert_equal(fixture_ai_loaded.get("strategicFingerprint", ""), fixture["identifiers"]["aiFingerprint"], "Web AI fixture fingerprint must match (actual=%s expected=%s)" % [fixture_ai_loaded.get("strategicFingerprint", ""), fixture["identifiers"]["aiFingerprint"]])
			_assert_equal(fixture_ai_loaded.get("order", {}), fixture["pendingAi"]["order"], "Web AI fixture order must match")
			_assert_equal(fixture_ai_loaded.get("resume", {}), fixture["pendingAi"]["resume"], "Web AI fixture resume must match")
		_remove_file(SAVE_PATH + ".battle-recovery.json")

	var committed_session := GameSession.new(SAVE_PATH)
	var committed_started := committed_session.restore_snapshot(fixture["committed"]["strategicSave"]["state"], fixture["campaign"])
	_assert_true(committed_started.get("ok", false), "committed post-state fixture must restore")
	committed_session.clear_battle_recovery()
	var committed := committed_session.save_battle_recovery_committed(
		fixture["committed"]["battleId"], "战后已提交", "2026-08-03T00:00:00.000Z",
		fixture["committed"]["order"], fixture["committed"]["resume"], fixture["committed"]["strategicFingerprint"],
		fixture["initialState"], -1, fixture["committed"]["settlementResult"]
	)
	_assert_true(committed.get("ok", false), "committed recovery must save")
	var committed_overwrite_probe := GameSession.new(SAVE_PATH)
	committed_overwrite_probe.restore_snapshot(fixture["initialState"], fixture["campaign"])
	var committed_overwrite := committed_overwrite_probe.save_battle_recovery_pending(fixture["committed"]["order"], fixture["committed"]["resume"], "覆盖尝试", "2026-08-03T00:00:00.000Z")
	_assert_true(not committed_overwrite.get("ok", false), "pending recovery must not overwrite a committed marker")
	var committed_resume := GameSession.new(SAVE_PATH).resume_battle_recovery()
	_assert_true(committed_resume.get("ok", false) and committed_resume.get("code", "") == "already_committed", "committed recovery must be idempotent")
	_assert_equal(_digest(committed_resume.get("state", {})), fixture["committed"]["strategicSave"]["stateSha256"], "committed recovery must restore exact post state")
	var warm_committed := GameSession.new(SAVE_PATH)
	var warm_loaded := warm_committed.load_game()
	_assert_true(warm_loaded.get("ok", false), "warm committed recovery baseline must load")
	_assert_equal(_digest(warm_loaded.get("state", {})), fixture["committed"]["strategicSave"]["stateSha256"], "warm load must promote committed checkpoint to the post-battle state")
	var warm_recovery_after_load := warm_committed.load_battle_recovery()
	_assert_true(not bool(warm_recovery_after_load.get("found", false)), "warm load must clear the committed recovery marker after promotion")
	committed_session.clear_battle_recovery()
	_write_json(SAVE_PATH + ".battle-recovery.json", fixture["committed"])
	var fixture_committed_loaded := committed_session.load_battle_recovery()
	_assert_true(fixture_committed_loaded.get("ok", false), "Web committed recovery fixture must load")
	if fixture_committed_loaded.get("ok", false):
		_assert_equal(fixture_committed_loaded.get("status", ""), "committed", "Web committed fixture status must remain committed")
		_assert_equal(fixture_committed_loaded.get("battleId", ""), fixture["committed"]["battleId"], "Web committed fixture battle id must match")
		_assert_equal(fixture_committed_loaded.get("strategicFingerprint", ""), fixture["committed"]["strategicFingerprint"], "Web committed fixture fingerprint must match (actual=%s expected=%s)" % [fixture_committed_loaded.get("strategicFingerprint", ""), fixture["committed"]["strategicFingerprint"]])
		_assert_equal(fixture_committed_loaded.get("order", {}), fixture["committed"]["order"], "Web committed fixture order must match")
		_assert_equal(fixture_committed_loaded.get("resume", {}), fixture["committed"]["resume"], "Web committed fixture resume must match")
	_remove_file(SAVE_PATH + ".battle-recovery.json")
	var committed_tamper_cases: Array[Dictionary] = []
	var wrong_committed_mode: Dictionary = fixture["committed"].duplicate(true); wrong_committed_mode["mode"] = "ai-defense"; committed_tamper_cases.append(wrong_committed_mode)
	var wrong_committed_id: Dictionary = fixture["committed"].duplicate(true); wrong_committed_id["battleId"] = "tampered-battle"; committed_tamper_cases.append(wrong_committed_id)
	var wrong_committed_fingerprint: Dictionary = fixture["committed"].duplicate(true); wrong_committed_fingerprint["strategicFingerprint"] = "00000000"; committed_tamper_cases.append(wrong_committed_fingerprint)
	var wrong_committed_order: Dictionary = fixture["committed"].duplicate(true); wrong_committed_order["order"] = (fixture["pendingPlayer"]["order"] as Dictionary).duplicate(true); wrong_committed_order["order"]["provisions"] = 21; committed_tamper_cases.append(wrong_committed_order)
	var wrong_committed_version: Dictionary = fixture["committed"].duplicate(true); wrong_committed_version["version"] = "2"; committed_tamper_cases.append(wrong_committed_version)
	var wrong_committed_source_type: Dictionary = fixture["committed"].duplicate(true); wrong_committed_source_type["sourceStrategicSave"] = null; committed_tamper_cases.append(wrong_committed_source_type)
	var wrong_committed_result_type: Dictionary = fixture["committed"].duplicate(true); wrong_committed_result_type["settlementResult"] = []; committed_tamper_cases.append(wrong_committed_result_type)
	var wrong_committed_revision: Dictionary = fixture["committed"].duplicate(true); wrong_committed_revision["parentSaveRevision"] = "0"; committed_tamper_cases.append(wrong_committed_revision)
	for tampered: Dictionary in committed_tamper_cases:
		_write_json(SAVE_PATH + ".battle-recovery.json", tampered)
		var tampered_loaded := committed_session.load_battle_recovery()
		_assert_true(not tampered_loaded.get("ok", false), "tampered committed binding must be rejected")
		_remove_file(SAVE_PATH + ".battle-recovery.json")
	committed_session.save_battle_recovery_committed(
		fixture["committed"]["battleId"], "战后已提交", "2026-08-03T00:00:00.000Z",
		fixture["committed"]["order"], fixture["committed"]["resume"], fixture["committed"]["strategicFingerprint"],
		fixture["initialState"], -1, fixture["committed"]["settlementResult"]
	)
	var stale_session := GameSession.new(SAVE_PATH)
	stale_session.start_campaign(1, 1)
	stale_session.execute_develop_farming("city-12", "officer-1")
	var stale_resume := stale_session.resume_battle_recovery()
	_assert_true(not stale_resume.get("ok", false), "committed recovery must not overwrite a newer session")
	committed_session.clear_battle_recovery()

	# Recovery corruption is rejected before any session replacement.
	for malformed_id: String in ["recoveryUnknownField", "recoveryWrongFingerprint", "recoveryWrongMode", "recoveryWrongResume"]:
		_write_json(SAVE_PATH + ".battle-recovery.json", fixture["malformed"][malformed_id])
		var recovery_rejected_session := GameSession.new(SAVE_PATH)
		recovery_rejected_session.start_campaign(1, 1)
		var recovery_rejected := recovery_rejected_session.load_battle_recovery()
		_assert_true(not recovery_rejected.get("ok", false), "%s recovery must be rejected" % malformed_id)
		_assert_equal(recovery_rejected_session.state_sha256(), fixture["initialStateSha256"], "%s recovery rejection must not mutate session" % malformed_id)
	var pending_with_result: Dictionary = fixture["pendingPlayer"].duplicate(true)
	pending_with_result["settlementResult"] = {}
	var pending_with_source: Dictionary = fixture["pendingPlayer"].duplicate(true)
	pending_with_source["sourceStrategicSave"] = fixture["productionSave"].duplicate(true)
	for pending_with_committed_field: Dictionary in [pending_with_result, pending_with_source]:
		_write_json(SAVE_PATH + ".battle-recovery.json", pending_with_committed_field)
		var pending_field_rejected := GameSession.new(SAVE_PATH).load_battle_recovery()
		_assert_true(not pending_field_rejected.get("ok", false), "pending recovery must reject committed-only fields")
		_remove_file(SAVE_PATH + ".battle-recovery.json")

	# A real settlement writes a committed marker before exposing success; a
	# fresh process therefore treats replay as already committed.
	var settlement_fixture := _read_dictionary(SETTLEMENT_FIXTURE_PATH)
	var settle_session := GameSession.new(SAVE_PATH)
	settle_session.clear_battle_recovery()
	settle_session.start_campaign(1, 1)
	var settlement_order: Dictionary = {
		"sourceCityId": settlement_fixture["result"]["sourceCityId"],
		"targetCityId": settlement_fixture["result"]["targetCityId"],
		"officerIds": settlement_fixture["result"]["attackerOfficerIds"].duplicate(true),
		"provisions": settlement_fixture["result"]["provisions"],
	}
	var lineage_session := GameSession.new(SAVE_PATH)
	lineage_session.start_campaign(1, 1)
	lineage_session.save_game()
	var lineage_pending := lineage_session.save_battle_recovery_pending(settlement_order, {"kind": "player-phase"}, "战前 lineage", "2026-08-03T00:00:00.000Z")
	_assert_true(lineage_pending.get("ok", false), "lineage pending marker must save")
	lineage_session.save_game()
	var lineage_settled := lineage_session.execute_command({
		"commandEnvelopeVersion": 1, "commandId": "mb20-lineage-conflict", "expectedStateSha256": settlement_fixture["initialStateSha256"],
		"kind": "settle_tactical_battle", "parameters": {"battleResult": settlement_fixture["result"]},
	})
	_assert_true(not lineage_settled.get("ok", false), "pending marker must reject commit after main save revision advances")
	lineage_session.clear_battle_recovery()
	var pending_settlement := settle_session.save_battle_recovery_pending(settlement_order, {"kind": "player-phase"}, "战前待处理", "2026-08-03T00:00:00.000Z")
	_assert_true(pending_settlement.get("ok", false), "settlement pending marker must be written before commit")
	var settlement_command := {
		"commandEnvelopeVersion": 1, "commandId": "mb20-settlement", "expectedStateSha256": settlement_fixture["initialStateSha256"],
		"kind": "settle_tactical_battle", "parameters": {"battleResult": settlement_fixture["result"]},
	}
	var settled := settle_session.execute_command(settlement_command)
	_assert_true(settled.get("ok", false), "settlement must commit recovery marker")
	var committed_after_settlement := GameSession.new(SAVE_PATH).resume_battle_recovery()
	_assert_true(committed_after_settlement.get("ok", false) and committed_after_settlement.get("code", "") == "already_committed", "settlement recovery must be exact-once: %s" % committed_after_settlement.get("error", ""))
	_assert_equal(_digest(committed_after_settlement.get("state", {})), settlement_fixture["expectedStateSha256"], "committed settlement state must survive restart")
	var saved_after_settlement := settle_session.save_game()
	_assert_true(saved_after_settlement.get("ok", false), "saving settled state must succeed")
	var cleared_after_settlement := settle_session.load_battle_recovery()
	_assert_true(cleared_after_settlement.get("ok", false) and not cleared_after_settlement.get("found", false), "saving settled state must clear same-state committed marker")
	# The tactical presentation deliberately preserves the committed marker until
	# its pause checkpoint is removed. A crash after the strategic save but before
	# that cleanup must cold-promote exactly once, then expose the consumed battle
	# id so the presentation does not dispatch the settlement a second time.
	var crash_window := GameSession.new(SAVE_PATH)
	crash_window.clear_battle_recovery()
	crash_window.start_campaign(1, 1)
	crash_window.save_game()
	var crash_pending := crash_window.save_battle_recovery_pending(
		settlement_order, {"kind": "player-phase"}, "战术终局 crash window", "2026-08-03T00:00:01.000Z"
	)
	_assert_true(crash_pending.get("ok", false), "crash-window pending marker must be written")
	var crash_settled := crash_window.execute_command(settlement_command)
	_assert_true(crash_settled.get("ok", false), "crash-window settlement must commit")
	var crash_saved := crash_window.save_game(true)
	_assert_true(crash_saved.get("ok", false), "tactical save must preserve committed marker")
	var marker_before_cold_load := GameSession.new(SAVE_PATH).load_battle_recovery()
	_assert_true(marker_before_cold_load.get("ok", false) and marker_before_cold_load.get("found", false) and marker_before_cold_load.get("status", "") == "committed", "crash-window marker must survive tactical save")
	var crash_cold := GameSession.new(SAVE_PATH)
	var crash_loaded := crash_cold.load_game()
	_assert_true(crash_loaded.get("ok", false), "cold load must promote committed tactical settlement: %s" % crash_loaded.get("error", ""))
	_assert_equal(crash_loaded.get("recoveredCommittedBattleId", ""), crash_settled.get("receipt", {}).get("battleId", ""), "cold load must expose the consumed battle id")
	_assert_equal(_digest(crash_loaded.get("state", {})), settlement_fixture["expectedStateSha256"], "cold promotion must preserve the terminal strategic result")
	var marker_after_cold_load := crash_cold.load_battle_recovery()
	_assert_true(marker_after_cold_load.get("ok", false) and not marker_after_cold_load.get("found", false), "cold promotion must clear the committed marker after saving")
	# Simulate a crash after a newer main save lands but before an older
	# committed marker is cleared. A cold process must reject that stale marker
	# using the monotonic saveRevision rather than rolling back to the old state.
	var advanced := settle_session.advance_turn_month()
	_assert_true(advanced.get("ok", false), "post-settlement continuation must succeed: %s" % advanced.get("error", ""))
	var advanced_save := settle_session.save_game()
	_assert_true(advanced_save.get("ok", false), "post-settlement continuation must save")
	var stale_marker := GameSession.new(SAVE_PATH)
	var stale_restored := stale_marker.restore_snapshot(settled["state"], settle_session.campaign_descriptor())
	_assert_true(stale_restored.get("ok", false), "old settlement state must be reconstructable for crash simulation")
	if stale_restored.get("ok", false):
		var stale_order: Dictionary = {
			"sourceCityId": settlement_fixture["result"]["sourceCityId"],
			"targetCityId": settlement_fixture["result"]["targetCityId"],
			"officerIds": settlement_fixture["result"]["attackerOfficerIds"].duplicate(true),
			"provisions": settlement_fixture["result"]["provisions"],
		}
		var stale_written := stale_marker.save_battle_recovery_committed(
			settled["receipt"]["battleId"], "旧提交标记", "2000-01-01T00:00:00.000Z", stale_order,
			{"kind": "player-phase"}, settlement_fixture["result"]["guard"]["strategicFingerprint"], fixture["initialState"], 1, settlement_fixture["result"]
		)
		_assert_true(stale_written.get("ok", false), "old committed marker must be writable for crash simulation")
	var cold_stale_resume := GameSession.new(SAVE_PATH).resume_battle_recovery()
	_assert_true(not cold_stale_resume.get("ok", false), "cold resume must reject marker older than main save: %s" % cold_stale_resume.get("error", ""))
	var cold_stale_load_session := GameSession.new(SAVE_PATH)
	var cold_stale_load := cold_stale_load_session.load_game()
	_assert_true(cold_stale_load.get("ok", false), "cold load must continue from the newer main save after isolating stale marker: %s" % cold_stale_load.get("error", ""))
	_assert_equal(_digest(cold_stale_load.get("state", {})), _digest(advanced_save.get("state", {})), "stale committed marker must not roll back the newer main save")
	_assert_equal(cold_stale_load.get("recoveryIgnored", ""), "stale-committed-marker", "cold load must record stale marker isolation")
	var stale_cleared_after_load := cold_stale_load_session.load_battle_recovery()
	_assert_true(stale_cleared_after_load.get("ok", false) and not stale_cleared_after_load.get("found", false), "stale committed marker must be cleared after isolation")

	FileAccess.open(ProjectSettings.globalize_path(SAVE_PATH), FileAccess.WRITE).close()
	var cleaner := GameSession.new(SAVE_PATH)
	cleaner.clear_battle_recovery()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH))
	if _failures > 0:
		push_error("[Godot production save/recovery] FAILED: %d failure(s), %d assertion(s)" % [_failures, _assertions]); quit(1); return
	print("[Godot production save/recovery] PASSED: %d assertion(s)" % _assertions); quit(0)


func _write_json(path: String, value: Variant) -> void:
	var file := FileAccess.open(ProjectSettings.globalize_path(path), FileAccess.WRITE)
	if file == null: _fail("cannot write test file %s" % path); return
	file.store_string(value if typeof(value) == TYPE_STRING else JSON.stringify(value, "\t", true)); file.close()


func _read_dictionary(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null: _fail("fixture missing: %s" % path); return {}
	var parser := JSON.new(); var error := parser.parse(file.get_as_text()); file.close()
	if error != OK or typeof(parser.data) != TYPE_DICTIONARY: _fail("fixture invalid: %s" % path); return {}
	return parser.data


func _remove_file(path: String) -> void:
	var absolute_path := ProjectSettings.globalize_path(path)
	if FileAccess.file_exists(absolute_path):
		DirAccess.remove_absolute(absolute_path)


func _digest(value: Variant) -> String:
	var result := Canonical.try_sha256(value); return String(result.get("value", ""))


func _assert_true(value: bool, message: String) -> void:
	_assertions += 1
	if not value: _fail(message)


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	_assertions += 1
	if _digest(actual) != _digest(expected): _fail(message)


func _fail(message: String) -> void:
	_failures += 1; push_error("[Godot production save/recovery] %s" % message)
