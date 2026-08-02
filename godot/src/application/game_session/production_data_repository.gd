extends RefCounted

const CanonicalJson = preload("res://src/domain/validation/canonical_json.gd")
const ProductionDataValidator = preload("res://src/domain/validation/production_data_validator.gd")
const GameState = preload("res://src/domain/game_state/game_state.gd")

const CATALOG_PATH: String = "res://data/campaigns/catalog-v1.json"
const ALLOWED_PERIOD_PATHS: Dictionary = {
	1: "res://data/campaigns/period-1.json",
	2: "res://data/campaigns/period-2.json",
	3: "res://data/campaigns/period-3.json",
	4: "res://data/campaigns/period-4.json",
}
const CATALOG_KEYS: Array[String] = [
	"id", "periods", "productionCatalogVersion", "productionDataContractVersion", "usage",
]
const CATALOG_ENTRY_KEYS: Array[String] = [
	"envelopeSha256", "facts", "path", "periodId", "stateSha256",
]
const USAGE_KEYS: Array[String] = ["scope", "redistributionReview", "notice"]


static func load_all() -> Dictionary:
	var catalog_result: Dictionary = _read_json(CATALOG_PATH)
	if not catalog_result["ok"]:
		return catalog_result
	var catalog: Variant = catalog_result["value"]
	var failures: Array[String] = _validate_catalog_shape(catalog)
	if not failures.is_empty():
		return _failure(failures)
	var envelopes: Dictionary = {}
	var states: Dictionary = {}
	for raw_entry: Variant in (catalog as Dictionary)["periods"]:
		var entry: Dictionary = raw_entry
		var period_id: int = int(entry["periodId"])
		var envelope_result: Dictionary = _read_json(ALLOWED_PERIOD_PATHS[period_id])
		if not envelope_result["ok"]:
			failures.append(envelope_result["error"])
			continue
		var envelope: Variant = envelope_result["value"]
		var period_issues: Array[String] = ProductionDataValidator.validate_envelope(envelope)
		if typeof(envelope) != TYPE_DICTIONARY \
				or typeof((envelope as Dictionary).get("scenario")) != TYPE_DICTIONARY \
				or int(((envelope as Dictionary).get("scenario") as Dictionary).get("periodId", -1)) != period_id:
			period_issues.append("scenario.periodId: must match catalog periodId %d" % period_id)
		for issue: String in period_issues:
			failures.append("period-%d: %s" % [period_id, issue])
		var digest: Dictionary = CanonicalJson.try_sha256(envelope)
		if not digest["ok"]:
			failures.append("period-%d.envelopeSha256: %s" % [period_id, digest["error"]])
		elif digest["value"] != entry["envelopeSha256"]:
			failures.append("period-%d.envelopeSha256: mismatch" % period_id)
		if typeof(envelope) == TYPE_DICTIONARY:
			if entry.get("stateSha256") != (envelope as Dictionary).get("stateSha256"):
				failures.append("period-%d.stateSha256: catalog mismatch" % period_id)
			var catalog_facts: Dictionary = CanonicalJson.try_sha256(entry.get("facts"))
			var envelope_facts: Dictionary = CanonicalJson.try_sha256((envelope as Dictionary).get("facts"))
			if not catalog_facts["ok"] or not envelope_facts["ok"] or catalog_facts["value"] != envelope_facts["value"]:
				failures.append("period-%d.facts: catalog mismatch" % period_id)
		if period_issues.is_empty() and digest["ok"]:
			envelopes[period_id] = envelope
			states[period_id] = GameState.new((envelope as Dictionary)["state"])
	if not failures.is_empty():
		return _failure(failures)
	return {"ok": true, "error": "", "failures": [], "catalog": catalog, "envelopes": envelopes, "states": states}


static func _validate_catalog_shape(raw: Variant) -> Array[String]:
	var issues: Array[String] = []
	if typeof(raw) != TYPE_DICTIONARY:
		return ["catalog: expected object"]
	var catalog: Dictionary = raw
	_validate_exact_keys(catalog, CATALOG_KEYS, "catalog", issues)
	if catalog.get("productionCatalogVersion") != 1.0:
		issues.append("productionCatalogVersion: must be 1")
	if catalog.get("productionDataContractVersion") != 2.0:
		issues.append("productionDataContractVersion: must be 2")
	if catalog.get("id") != "baye-production-campaign-catalog-v1":
		issues.append("id: unsupported catalog id")
	if typeof(catalog.get("usage")) != TYPE_DICTIONARY:
		issues.append("usage: expected object")
	else:
		var usage: Dictionary = catalog["usage"]
		_validate_exact_keys(usage, USAGE_KEYS, "usage", issues)
		for field: String in USAGE_KEYS:
			if typeof(usage.get(field)) != TYPE_STRING or String(usage.get(field)).is_empty():
				issues.append("usage.%s: must be a non-empty string" % field)
	if typeof(catalog.get("periods")) != TYPE_ARRAY or (catalog.get("periods") as Array).size() != 4:
		issues.append("periods: must contain four entries")
		return issues
	var prior: int = 0
	for index: int in range((catalog["periods"] as Array).size()):
		var raw_entry: Variant = catalog["periods"][index]
		if typeof(raw_entry) != TYPE_DICTIONARY:
			issues.append("periods[%d]: expected object" % index)
			continue
		var entry: Dictionary = raw_entry
		_validate_exact_keys(entry, CATALOG_ENTRY_KEYS, "periods[%d]" % index, issues)
		var period_id: int = int(entry.get("periodId", -1)) if _is_integer(entry.get("periodId")) else -1
		if period_id <= prior or not ALLOWED_PERIOD_PATHS.has(period_id):
			issues.append("periods[%d].periodId: must be unique, ascending and allowlisted" % index)
		prior = period_id
		var expected_contract_path: String = "godot/data/campaigns/period-%d.json" % period_id
		if entry.get("path") != expected_contract_path:
			issues.append("periods[%d].path: unsupported path" % index)
		for field: String in ["envelopeSha256", "stateSha256"]:
			if typeof(entry.get(field)) != TYPE_STRING or String(entry.get(field)).length() != 64:
				issues.append("periods[%d].%s: must be a SHA-256 hex digest" % [index, field])
		if typeof(entry.get("facts")) != TYPE_DICTIONARY:
			issues.append("periods[%d].facts: expected object" % index)
	return issues


static func _validate_exact_keys(
		record: Dictionary, allowed: Array[String], path: String, issues: Array[String]
) -> void:
	var keys: Array[String] = []
	for raw_key: Variant in record.keys():
		keys.append(str(raw_key))
	keys.sort()
	for key: String in keys:
		if not allowed.has(key):
			issues.append("%s.%s: unknown field" % [path, key])
	for key: String in allowed:
		if not record.has(key):
			issues.append("%s.%s: missing field" % [path, key])


static func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return _failure(["missing JSON file: " + path])
	var parser: JSON = JSON.new()
	var error: Error = parser.parse(FileAccess.get_file_as_string(path))
	if error != OK:
		return _failure(["%s:%d: %s" % [path, parser.get_error_line(), parser.get_error_message()]])
	return {"ok": true, "value": parser.data, "error": "", "failures": []}


static func _failure(failures: Array[String]) -> Dictionary:
	return {"ok": false, "value": null, "error": failures[0] if not failures.is_empty() else "unknown", "failures": failures}


static func _is_integer(raw: Variant) -> bool:
	return (typeof(raw) == TYPE_INT or typeof(raw) == TYPE_FLOAT) and floor(float(raw)) == float(raw)
