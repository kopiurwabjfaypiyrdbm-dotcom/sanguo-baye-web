class_name CampaignLaunchContext
extends RefCounted

## Application-owned launch intent. It contains no GameState and is consumed once
## by the strategic presentation when the native setup flow enters a campaign.
static var _pending: Dictionary = {}


static func request_campaign(period_id: int, ruler_source_index: int) -> void:
	_pending = {
		"mode": "campaign",
		"periodId": period_id,
		"rulerSourceIndex": ruler_source_index,
	}


static func request_load() -> void:
	_pending = {"mode": "load"}


static func take() -> Dictionary:
	var result := _pending.duplicate(true)
	_pending.clear()
	return result


static func clear() -> void:
	_pending.clear()
