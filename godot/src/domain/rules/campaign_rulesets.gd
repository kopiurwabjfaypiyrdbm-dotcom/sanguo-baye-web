extends RefCounted

const SUPPORTED_RULESET_IDS: Array[String] = [
	"baye-classic-v1",
	"modern-balanced-v1",
]

const COMMAND_COSTS: Dictionary = {
	"baye-classic-v1": {
		"develop": {"stamina": 8, "money": 50},
		"govern": {"stamina": 8, "money": 50},
		"inspect": {"stamina": 8, "money": 50},
		"trade": {"stamina": 12, "money": 0},
		"banquet": {"stamina": 0, "money": 100},
		"plunder": {"stamina": 20, "money": 0},
		"surrender": {"stamina": 15, "money": 100},
		"move": {"stamina": 0, "money": 0},
		"transport": {"stamina": 8, "money": 0},
	},
	"modern-balanced-v1": {
		"develop": {"stamina": 8, "money": 50},
		"govern": {"stamina": 4, "money": 50},
		"inspect": {"stamina": 4, "money": 50},
		"trade": {"stamina": 4, "money": 0},
		"banquet": {"stamina": 0, "money": 50},
		"plunder": {"stamina": 4, "money": 0},
		"surrender": {"stamina": 4, "money": 0},
		"move": {"stamina": 4, "money": 0},
		"transport": {"stamina": 4, "money": 0},
	},
}


static func is_supported(ruleset_id: String) -> bool:
	return SUPPORTED_RULESET_IDS.has(ruleset_id)


static func get_develop_cost(ruleset_id: String) -> Dictionary:
	return get_command_cost(ruleset_id, "develop")


static func get_command_cost(ruleset_id: String, command: String) -> Dictionary:
	var raw_ruleset: Variant = COMMAND_COSTS.get(ruleset_id)
	if typeof(raw_ruleset) != TYPE_DICTIONARY:
		return {}
	var raw_cost: Variant = (raw_ruleset as Dictionary).get(command)
	if typeof(raw_cost) != TYPE_DICTIONARY:
		return {}
	var cost: Dictionary = raw_cost
	return cost.duplicate(true)
