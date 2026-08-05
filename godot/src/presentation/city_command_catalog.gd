## Read-only city command catalog mirrored from
## `src/ui/cityCommandCatalog.ts` `CITY_COMMAND_GROUPS`.
## Do not invent commands here; keep fields byte-aligned with the TS source.
class_name CityCommandCatalog
extends RefCounted

const GROUPS: Dictionary = {
	"internal": [
		{"id": "develop", "label": "开垦", "glyph": "垦", "section": "internal", "editorSize": "quick"},
		{"id": "commerce", "label": "招商", "glyph": "商", "section": "internal", "editorSize": "quick"},
		{"id": "govern", "label": "治理", "glyph": "治", "section": "internal", "editorSize": "quick"},
		{"id": "inspect", "label": "出巡", "glyph": "巡", "section": "internal", "editorSize": "quick"},
		{"id": "trade", "label": "交易", "glyph": "易", "section": "internal", "editorSize": "expanded"},
		{"id": "banquet", "label": "宴请", "glyph": "宴", "section": "internal", "editorSize": "quick"},
		{"id": "plunder", "label": "掠夺", "glyph": "掠", "section": "internal", "editorSize": "quick", "dangerous": true},
	],
	"personnel": [
		{"id": "search", "label": "搜寻", "glyph": "寻", "section": "personnel", "editorSize": "quick"},
		{"id": "recruit-officer", "label": "登用", "glyph": "登", "section": "personnel", "editorSize": "quick"},
		{"id": "reward", "label": "奖赏", "glyph": "赏", "section": "personnel", "editorSize": "quick"},
		{"id": "move", "label": "调动", "glyph": "调", "section": "personnel", "editorSize": "quick"},
		{"id": "transport", "label": "输送", "glyph": "输", "section": "personnel", "editorSize": "expanded"},
		{"id": "appoint", "label": "太守", "glyph": "守", "section": "personnel", "editorSize": "quick"},
		{"id": "item", "label": "道具", "glyph": "宝", "section": "personnel", "editorSize": "expanded"},
		{"id": "captive", "label": "俘虏", "glyph": "俘", "section": "personnel", "editorSize": "expanded"},
		{"id": "banish", "label": "流放", "glyph": "逐", "section": "personnel", "editorSize": "quick", "dangerous": true},
	],
	"military": [
		{"id": "recruit-troops", "label": "征兵", "glyph": "征", "section": "military", "editorSize": "quick"},
		{"id": "distribute", "label": "调兵", "glyph": "兵", "section": "military", "editorSize": "quick"},
		{"id": "recon", "label": "侦察", "glyph": "察", "section": "military", "editorSize": "quick"},
		{"id": "attack", "label": "出征", "glyph": "战", "section": "military", "editorSize": "expanded"},
	],
	"intrigue": [
		{"id": "diplomacy", "label": "谋略行动", "glyph": "谋", "section": "intrigue", "editorSize": "expanded"},
	],
}

## Catalog id → domain command kind used by CityCard / adapters.
const DOMAIN_KIND_BY_ID: Dictionary = {
	"develop": "develop_farming",
	"commerce": "develop_commerce",
	"govern": "govern_city",
	"inspect": "inspect_city",
	"trade": "trade_food",
	"banquet": "banquet_officer",
	"plunder": "plunder_city",
	"recruit-troops": "recruit_troops",
	"distribute": "distribute_troops",
}

const SECTION_TITLES: Dictionary = {
	"internal": "内政",
	"personnel": "人事",
	"military": "军事",
	"intrigue": "谋略",
}


static func commands_for(section: String) -> Array:
	var raw: Variant = GROUPS.get(section, [])
	return raw if raw is Array else []


static func domain_kind(command_id: String) -> String:
	return str(DOMAIN_KIND_BY_ID.get(command_id, ""))


static func section_title(section: String) -> String:
	return str(SECTION_TITLES.get(section, section))


static func labels_for(section: String) -> PackedStringArray:
	var labels := PackedStringArray()
	for entry: Variant in commands_for(section):
		if entry is Dictionary:
			labels.append(str((entry as Dictionary).get("label", "")))
	return labels
