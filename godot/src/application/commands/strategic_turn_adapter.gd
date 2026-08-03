class_name StrategicTurnAdapter
extends RefCounted

const GameState = preload("res://src/domain/game_state/game_state.gd")
const StrategicTurn = preload("res://src/domain/progression/strategic_turn.gd")


static func validate_parameters(parameters: Dictionary) -> Dictionary:
	if not parameters.is_empty():
		return {"ok": false, "error": "advance_turn_month 不接受参数"}
	return {"ok": true, "error": ""}


static func execute(state: GameState, parameters: Dictionary) -> Dictionary:
	var before := state.snapshot()
	if before.get("phase", "") == "ended":
		return {"ok": true, "error": "", "next_state": GameState.new(before), "receipt": {"kind": "advance_turn", "skipped": "campaign-ended"}}
	if before.get("phase", "") == "succession":
		return {"ok": false, "error": "必须先拥立新君", "next_state": null, "receipt": {}}
	return StrategicTurn.advance(state)
