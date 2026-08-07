class_name TacticalLaunchContext
extends RefCounted

## Application-owned hand-off from the strategic GameSession to the tactical
## presentation. The scene tree never owns this state; it is consumed once.
static var _pending: Dictionary = {}


static func store(battle: Dictionary, order: Dictionary, parent_state_sha256: String, campaign: Dictionary) -> void:
	_pending = {
		"battle": battle.duplicate(true),
		"order": order.duplicate(true),
		"parentStateSha256": parent_state_sha256,
		"campaign": campaign.duplicate(true),
	}


static func take() -> Dictionary:
	var result := _pending.duplicate(true)
	_pending.clear()
	return result


static func has_pending() -> bool:
	return not _pending.is_empty()


static func clear() -> void:
	_pending.clear()
