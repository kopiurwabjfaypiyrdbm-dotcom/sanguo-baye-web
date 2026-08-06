extends RefCounted

const DEFAULT_RULESET_ID: String = "baye-classic-v1"

const SUPPORTED_RULESET_IDS: Array[String] = [
	"baye-classic-v1",
	"modern-balanced-v1",
]

const RULESET_LABELS: Dictionary = {
	"baye-classic-v1": "经典校准",
	"modern-balanced-v1": "现代平衡",
}

const RULESET_DESCRIPTIONS: Dictionary = {
	"baye-classic-v1": "采用固定版 C 源码已确认的开局兵力、命令消耗与自动太守规则。",
	"modern-balanced-v1": "保留 v0.8 及更早存档使用的宽松行动消耗和手动太守规则。",
}

const STARTING_TROOPS: Dictionary = {
	"baye-classic-v1": 100,
	"modern-balanced-v1": 400,
}

const COMMAND_COSTS: Dictionary = {
	"baye-classic-v1": {
		"develop": {"stamina": 8, "money": 50},
		"govern": {"stamina": 8, "money": 50},
		"inspect": {"stamina": 8, "money": 50},
		"trade": {"stamina": 12, "money": 0},
		"banquet": {"stamina": 0, "money": 100},
		"plunder": {"stamina": 20, "money": 0},
		"recruit-troops": {"stamina": 12, "money": 0},
		"surrender": {"stamina": 15, "money": 100},
		"move": {"stamina": 0, "money": 0},
		"transport": {"stamina": 8, "money": 0},
		"reconnoitre": {"stamina": 10, "money": 20},
		"alienate": {"stamina": 20, "money": 50},
		"canvass": {"stamina": 20, "money": 50},
		"counterespionage": {"stamina": 20, "money": 50},
		"induce": {"stamina": 10, "money": 50},
	},
	"modern-balanced-v1": {
		"develop": {"stamina": 8, "money": 50},
		"govern": {"stamina": 4, "money": 50},
		"inspect": {"stamina": 4, "money": 50},
		"trade": {"stamina": 4, "money": 0},
		"banquet": {"stamina": 0, "money": 50},
		"plunder": {"stamina": 4, "money": 0},
		"recruit-troops": {"stamina": 12, "money": 0},
		"surrender": {"stamina": 4, "money": 0},
		"move": {"stamina": 4, "money": 0},
		"transport": {"stamina": 4, "money": 0},
		"reconnoitre": {"stamina": 4, "money": 50},
		"alienate": {"stamina": 4, "money": 50},
		"canvass": {"stamina": 4, "money": 50},
		"counterespionage": {"stamina": 4, "money": 50},
		"induce": {"stamina": 4, "money": 50},
	},
}


static func is_supported(ruleset_id: String) -> bool:
	return SUPPORTED_RULESET_IDS.has(ruleset_id)


static func label_for(ruleset_id: String) -> String:
	return str(RULESET_LABELS.get(ruleset_id, ruleset_id))


static func description_for(ruleset_id: String) -> String:
	return str(RULESET_DESCRIPTIONS.get(ruleset_id, ""))


static func starting_troops_for(ruleset_id: String) -> int:
	return int(STARTING_TROOPS.get(ruleset_id, STARTING_TROOPS[DEFAULT_RULESET_ID]))


static func default_lifecycle_policy() -> Dictionary:
	return {
		"version": 1,
		"ageGrowth": "enabled",
		"naturalDeath": "disabled",
		"battleDeath": "disabled",
		"captiveEscape": "disabled",
	}


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
