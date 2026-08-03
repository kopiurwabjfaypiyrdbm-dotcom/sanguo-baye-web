class_name CampaignSessionContext
extends RefCounted

const GameSession = preload("res://src/application/game_session/game_session.gd")

## Application-owned session hand-off used while switching between strategic and
## tactical presentation scenes. It never enters the scene tree.
static var _session: GameSession


static func store(session: GameSession) -> void:
	_session = session


static func take() -> GameSession:
	var result := _session
	_session = null
	return result


static func clear() -> void:
	_session = null
