class_name BayeDiplomacy
extends RefCounted

const CoreLcg = preload("res://src/domain/random/core_lcg.gd")

const CHARACTER_THRESHOLDS: Dictionary = {
	"alienate": [50, 30, 40, 30, 5],
	"canvass": [15, 40, 30, 20, 5],
	"counterespionage": [30, 10, 20, 60, 5],
	"induce": [10, 1, 20, 5, 15],
}


## Reproduces src/compat/baye/diplomacy.ts, including the fixed driver's
## unsigned arithmetic and RNG calls consumed by report-dialog selection.
static func roll(
		kind: String,
		executor_intelligence: int,
		target_intelligence: int,
		target_loyalty: int,
		target_character: int,
		seed: int,
		player_issuer: bool = false,
) -> Dictionary:
	if not CHARACTER_THRESHOLDS.has(kind):
		return {"ok": false, "error": "unsupported diplomacy kind: %s" % kind}
	var cursor: Dictionary = {"seed": seed}
	var iq_threshold: int
	if kind == "canvass":
		iq_threshold = _to_uint8(executor_intelligence - target_intelligence)
	elif kind == "alienate":
		iq_threshold = _to_uint8(executor_intelligence - target_intelligence + 50)
	else:
		iq_threshold = (executor_intelligence - target_intelligence + 50) & 0xffff_ffff
	if _draw_percent(cursor) > iq_threshold:
		return _finish(kind, false, cursor, player_issuer)

	if kind != "induce" and _draw_percent(cursor) < target_loyalty:
		return _finish(kind, false, cursor, player_issuer)

	var character: int = target_character if target_character >= 0 else 0
	var thresholds: Array = CHARACTER_THRESHOLDS[kind]
	var character_threshold: int = int(thresholds[character]) if character < thresholds.size() else int(thresholds[0])
	if _draw_percent(cursor) > character_threshold:
		return _finish(kind, false, cursor, player_issuer)

	var recruited_loyalty: Variant = null
	if kind == "canvass":
		var loyalty_draw: Dictionary = CoreLcg.next_random(int(cursor["seed"]))
		cursor["seed"] = int(loyalty_draw["seed"])
		recruited_loyalty = 40 + int(floor(float(loyalty_draw["value"]) * 40.0))
	return _finish(kind, true, cursor, player_issuer, recruited_loyalty)


static func _finish(
		kind: String,
		success: bool,
		cursor: Dictionary,
		player_issuer: bool,
		recruited_loyalty: Variant = null,
) -> Dictionary:
	var presentation_draws: int = 0
	if kind == "canvass":
		presentation_draws = 1
	elif kind == "counterespionage":
		presentation_draws = 2 if success else 1
	elif kind == "induce" and player_issuer:
		presentation_draws = 1
	for _index: int in range(presentation_draws):
		_draw_percent(cursor)
	var result: Dictionary = {
		"ok": true,
		"error": "",
		"success": success,
		"seed": int(cursor["seed"]),
	}
	if recruited_loyalty != null:
		result["recruitedLoyalty"] = int(recruited_loyalty)
	return result


static func _draw_percent(cursor: Dictionary) -> int:
	var draw: Dictionary = CoreLcg.next_random(int(cursor["seed"]))
	cursor["seed"] = int(draw["seed"])
	return int(floor(float(draw["value"]) * 100.0))


static func _to_uint8(value: int) -> int:
	return ((value % 0x100) + 0x100) % 0x100
