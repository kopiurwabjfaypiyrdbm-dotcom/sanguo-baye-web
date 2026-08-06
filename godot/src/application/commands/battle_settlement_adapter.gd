class_name BattleSettlementAdapter
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const Settlement = preload("res://src/domain/tactical/battle_settlement.gd")


static func validate_parameters(kind: String, parameters: Dictionary) -> Dictionary:
	if kind != "settle_tactical_battle": return {"ok": false, "error": "unsupported battle settlement command"}
	for raw_key: Variant in parameters.keys():
		if String(raw_key) != "battleResult": return {"ok": false, "error": "unknown battle settlement parameter: %s" % String(raw_key)}
	if typeof(parameters.get("battleResult")) != TYPE_DICTIONARY: return {"ok": false, "error": "battleResult must be an object"}
	return {"ok": true, "error": ""}


static func execute(kind: String, state: RefCounted, parameters: Dictionary) -> Dictionary:
	if kind != "settle_tactical_battle" or not state is GameState: return {"ok": false, "error": "invalid battle settlement adapter state"}
	return Settlement.apply(state as GameState, parameters["battleResult"])
