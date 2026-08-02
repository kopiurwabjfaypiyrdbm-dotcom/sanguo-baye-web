extends RefCounted

const SUPPORTED_RULESET_IDS: Array[String] = [
	"baye-classic-v1",
	"modern-balanced-v1",
]

const DEVELOP_COSTS: Dictionary = {
	"baye-classic-v1": {"stamina": 8, "money": 50},
	"modern-balanced-v1": {"stamina": 8, "money": 50},
}


static func is_supported(ruleset_id: String) -> bool:
	return SUPPORTED_RULESET_IDS.has(ruleset_id)


static func get_develop_cost(ruleset_id: String) -> Dictionary:
	var raw_cost: Variant = DEVELOP_COSTS.get(ruleset_id)
	if typeof(raw_cost) != TYPE_DICTIONARY:
		return {}
	var cost: Dictionary = raw_cost
	return cost.duplicate(true)
