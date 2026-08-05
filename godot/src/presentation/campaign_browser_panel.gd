## Dock / city-section list content for MobileSheet. Builds entries from snapshot
## dictionaries; emits selection intents only.
class_name CampaignBrowserPanel
extends Control

const TouchMetrics = preload("res://src/presentation/touch_metrics.gd")
const CityCommandCatalog = preload("res://src/presentation/city_command_catalog.gd")

signal city_selected(city_id: String)
signal officer_selected(officer_id: String, city_id: String)
signal action_selected(action_id: String)
signal close_requested

@onready var filter_row: HBoxContainer = %FilterRow
@onready var filter_owned: Button = %FilterOwned
@onready var filter_intel: Button = %FilterIntel
@onready var filter_all: Button = %FilterAll
@onready var intro_label: Label = %IntroLabel
@onready var list_scroll: ScrollContainer = %ListScroll
@onready var list_box: VBoxContainer = %ListBox
@onready var empty_label: Label = %EmptyLabel
@onready var actions_box: VBoxContainer = %ActionsBox

var _view := ""
var _filter := "owned"
var _snapshot: Dictionary = {}
var _city_id := ""
var _section := ""
var _touch_size := 48.0
var _font_size := 15


func _ready() -> void:
	filter_owned.pressed.connect(func() -> void: _set_filter("owned"))
	filter_intel.pressed.connect(func() -> void: _set_filter("intel"))
	filter_all.pressed.connect(func() -> void: _set_filter("all"))
	hide()


func show_cities(snapshot: Dictionary) -> void:
	_view = "cities"
	_snapshot = snapshot
	_city_id = ""
	filter_row.visible = true
	actions_box.visible = false
	intro_label.text = tr("点选城池后打开情境面板；未侦察城池只显示公开归属。")
	_set_filter("owned")
	show()


func show_officers(snapshot: Dictionary) -> void:
	_view = "officers"
	_snapshot = snapshot
	_city_id = ""
	filter_row.visible = false
	actions_box.visible = false
	intro_label.text = tr("本势力在职、已发现人才与俘虏。点选后定位其城池。")
	_rebuild()
	show()


func show_treasures(snapshot: Dictionary) -> void:
	_view = "treasures"
	_snapshot = snapshot
	_city_id = ""
	filter_row.visible = false
	actions_box.visible = false
	intro_label.text = tr("汇总本势力已发现宝物。赏赐与没收请进入所在城池人事。")
	_rebuild()
	show()


func show_delegation(snapshot: Dictionary) -> void:
	_view = "delegation"
	_snapshot = snapshot
	_city_id = ""
	filter_row.visible = false
	actions_box.visible = false
	intro_label.text = tr("委任用于多城时期的内政与运输方针；正式自动规则后续接入。")
	_rebuild()
	show()


func show_city_context(snapshot: Dictionary, city_id: String) -> void:
	_view = "city_context"
	_snapshot = snapshot
	_city_id = city_id
	filter_row.visible = false
	actions_box.visible = true
	_rebuild_city_context()
	show()


func show_section(snapshot: Dictionary, city_id: String, section: String) -> void:
	_view = "section"
	_section = section
	_snapshot = snapshot
	_city_id = city_id
	filter_row.visible = false
	actions_box.visible = true
	intro_label.text = _section_intro(section)
	_clear_list()
	_clear_actions()
	for entry: Variant in CityCommandCatalog.commands_for(section):
		if not entry is Dictionary:
			continue
		var command: Dictionary = entry
		var command_id := str(command.get("id", ""))
		var label := str(command.get("label", command_id))
		var enabled := true
		var subtitle := str(command.get("glyph", ""))
		if command_id == "attack":
			enabled = false
			subtitle = tr("正式出征编辑器待补齐；可用顶栏临战样片")
		elif command_id == "appoint":
			subtitle = tr("现代 · 任命太守")
		elif bool(command.get("dangerous", false)):
			subtitle = tr("危险操作")
		_add_action_button(command_id, label, enabled, subtitle)
	empty_label.visible = actions_box.get_child_count() == 0
	show()


func show_military_menu(snapshot: Dictionary, city_id: String) -> void:
	show_section(snapshot, city_id, "military")


func show_personnel_tabs(snapshot: Dictionary, city_id: String) -> void:
	show_section(snapshot, city_id, "personnel")


func section_action_labels() -> PackedStringArray:
	var labels := PackedStringArray()
	for child: Node in actions_box.get_children():
		if child is Button:
			var text := (child as Button).text
			var first_line := text.split("\n")[0] if "\n" in text else text
			labels.append(first_line)
	return labels


func section_action_count() -> int:
	return actions_box.get_child_count()


func _section_intro(section: String) -> String:
	match section:
		"internal":
			return tr("选择内政命令。列表仅来自产品命令目录。")
		"personnel":
			return tr("选择人事命令。调动与输送由此进入后勤。")
		"military":
			return tr("选择军事命令。未实装项会标明原因。")
		"intrigue":
			return tr("选择谋略行动。子计策在外交面板内配置。")
		_:
			return tr("选择命令。")


func apply_responsive_layout(compact: bool, canvas_scale: float, _physical_size: Vector2i) -> void:
	var touch_mode := compact or TouchMetrics.uses_density_scaled_targets()
	_touch_size = TouchMetrics.target_size(canvas_scale) if touch_mode else 48.0
	_font_size = ceili(15.0 / maxf(canvas_scale, 0.01)) if touch_mode else 15
	for button: Button in [filter_owned, filter_intel, filter_all]:
		button.custom_minimum_size.y = _touch_size
		button.add_theme_font_size_override("font_size", _font_size)
	intro_label.add_theme_font_size_override("font_size", maxi(12, _font_size - 1))
	empty_label.add_theme_font_size_override("font_size", _font_size)
	for child: Node in list_box.get_children():
		if child is Button:
			(child as Button).custom_minimum_size.y = _touch_size
			(child as Button).add_theme_font_size_override("font_size", _font_size)
	for child: Node in actions_box.get_children():
		if child is Button:
			(child as Button).custom_minimum_size.y = _touch_size
			(child as Button).add_theme_font_size_override("font_size", _font_size)


func place_in(usable: Rect2) -> void:
	if not visible:
		return
	global_position = usable.position
	size = usable.size


func _set_filter(filter_id: String) -> void:
	_filter = filter_id
	filter_owned.button_pressed = filter_id == "owned"
	filter_intel.button_pressed = filter_id == "intel"
	filter_all.button_pressed = filter_id == "all"
	_rebuild()


func _rebuild() -> void:
	_clear_list()
	_clear_actions()
	match _view:
		"cities":
			_rebuild_cities()
		"officers":
			_rebuild_officers()
		"treasures":
			_rebuild_treasures()
		"delegation":
			_rebuild_delegation()
		"city_context":
			_rebuild_city_context()
		_:
			pass


func _rebuild_cities() -> void:
	var entries := _build_city_entries()
	var visible_count := 0
	for entry: Dictionary in entries:
		var knowledge := str(entry.get("knowledge", "public"))
		if _filter == "owned" and not bool(entry.get("isOwned", false)):
			continue
		if _filter == "intel" and knowledge != "report":
			continue
		visible_count += 1
		var line := str(entry.get("name", ""))
		var stats := str(entry.get("ownerName", ""))
		if bool(entry.get("isOwned", false)):
			stats = tr("%s · %d 将 · 金%d 粮%d") % [
				stats, int(entry.get("officerCount", 0)), int(entry.get("money", 0)), int(entry.get("food", 0))
			]
		elif knowledge == "report":
			stats = tr("%s · %s") % [stats, str(entry.get("observedLabel", tr("已侦察")))]
		else:
			stats = tr("%s · 未侦察") % stats
		_add_list_button(str(entry.get("id", "")), "%s\n%s" % [line, stats], "city")
	empty_label.visible = visible_count == 0
	empty_label.text = tr("没有符合筛选的城池。")


func _rebuild_officers() -> void:
	var entries := _build_officer_entries()
	for entry: Dictionary in entries:
		var stats := tr("%s · %s") % [str(entry.get("statusLabel", "")), str(entry.get("cityName", ""))]
		if entry.has("stamina"):
			stats += tr(" · 体 %d") % int(entry.get("stamina", 0))
		_add_list_button(str(entry.get("id", "")), "%s\n%s" % [str(entry.get("name", "")), stats], "officer", str(entry.get("cityId", "")))
	empty_label.visible = entries.is_empty()
	empty_label.text = tr("没有符合当前筛选的已知人物。")


func _rebuild_treasures() -> void:
	var entries := _build_treasure_entries()
	for entry: Dictionary in entries:
		var holder := str(entry.get("holder", ""))
		var location := str(entry.get("location", ""))
		var where := tr("%s持有 · %s") % [holder, location] if not holder.is_empty() else tr("收藏于%s") % location
		var bonuses: PackedStringArray = PackedStringArray()
		var force := int(entry.get("forceBonus", 0))
		var intel := int(entry.get("intelligenceBonus", 0))
		var move := int(entry.get("moveBonus", 0))
		if force != 0:
			bonuses.append(tr("武 %+d") % force)
		if intel != 0:
			bonuses.append(tr("智 %+d") % intel)
		if move != 0:
			bonuses.append(tr("移 %+d") % move)
		var bonus_text := " · ".join(bonuses) if not bonuses.is_empty() else tr("无属性加成")
		_add_list_button(str(entry.get("itemId", "")), "%s\n%s · %s" % [str(entry.get("name", "")), where, bonus_text], "noop")
	empty_label.visible = entries.is_empty()
	empty_label.text = tr("本势力尚未发现宝物，可通过城池搜寻获得线索。")


func _rebuild_delegation() -> void:
	var player_faction_id := str(_snapshot.get("playerFactionId", ""))
	var cities := _as_dictionary(_snapshot.get("cities", {}))
	var officers := _as_dictionary(_snapshot.get("officers", {}))
	var owned: Array[Dictionary] = []
	for city_id: Variant in cities.keys():
		var city := _as_dictionary(cities[city_id])
		if str(city.get("ownerId", "")) != player_faction_id:
			continue
		owned.append({"id": str(city_id), "city": city})
	owned.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return str(a["city"].get("name", "")) < str(b["city"].get("name", ""))
	)
	var unlocked := owned.size() >= 6
	intro_label.text = tr("%s（%d / 6 城）") % [
		tr("委任规划已开放") if unlocked else tr("扩张至 6 城后开放委任"),
		owned.size(),
	]
	for entry: Dictionary in owned:
		var city: Dictionary = entry["city"]
		var city_id := str(entry.get("id", ""))
		var officer_count := 0
		for officer_id: Variant in officers.keys():
			var officer := _as_dictionary(officers[officer_id])
			if str(officer.get("status", "")) != "serving":
				continue
			if str(officer.get("cityId", "")) != city_id:
				continue
			if str(officer.get("factionId", "")) != player_faction_id:
				continue
			officer_count += 1
		var satrap_id := str(city.get("satrapOfficerId", ""))
		var satrap_name := str(_as_dictionary(officers.get(satrap_id, {})).get("name", tr("太守空缺")))
		var warnings: PackedStringArray = PackedStringArray()
		if satrap_id.is_empty():
			warnings.append(tr("太守空缺"))
		if officer_count == 0:
			warnings.append(tr("无人驻守"))
		if int(city.get("food", 0)) < 200:
			warnings.append(tr("粮草偏低"))
		if str(city.get("condition", "normal")) != "normal":
			warnings.append(tr("灾情未解"))
		var status := " · ".join(warnings) if not warnings.is_empty() else tr("运转正常")
		_add_list_button(city_id, "%s\n%s · %d 将 · %s" % [str(city.get("name", city_id)), satrap_name, officer_count, status], "city")
	empty_label.visible = owned.is_empty()
	empty_label.text = tr("当前没有己方城池。")


func _rebuild_city_context() -> void:
	_clear_list()
	_clear_actions()
	var cities := _as_dictionary(_snapshot.get("cities", {}))
	var city := _as_dictionary(cities.get(_city_id, {}))
	if city.is_empty():
		intro_label.text = tr("城池不可用")
		empty_label.visible = true
		return
	var owner_id := str(city.get("ownerId", ""))
	var player_faction_id := str(_snapshot.get("playerFactionId", ""))
	var owned := owner_id == player_faction_id and not player_faction_id.is_empty()
	var factions := _as_dictionary(_snapshot.get("factions", {}))
	var faction := _as_dictionary(factions.get(owner_id, {}))
	if owned:
		var officer_count := 0
		var troops := int(city.get("reserveTroops", 0))
		var officers := _as_dictionary(_snapshot.get("officers", {}))
		for officer_id: Variant in officers.keys():
			var officer := _as_dictionary(officers[officer_id])
			if str(officer.get("status", "")) != "serving":
				continue
			if str(officer.get("cityId", "")) != _city_id:
				continue
			if str(officer.get("factionId", "")) != owner_id:
				continue
			officer_count += 1
			troops += int(officer.get("troops", 0))
		intro_label.text = tr("%s · %d 将\n金 %d · 粮 %d · 兵 %d") % [
			str(faction.get("name", tr("未知势力"))), officer_count,
			int(city.get("money", 0)), int(city.get("food", 0)), troops,
		]
		_add_action_button("detail", tr("详情"), true, tr("城池摘要与情报"))
		_add_action_button("internal", tr("内政"), true, tr("开垦、招商、征兵等经营命令"))
		_add_action_button("personnel", tr("人事"), true, tr("人物、装备、人才与俘虏"))
		_add_action_button("military", tr("军事"), true, tr("侦察、调动与出征入口"))
		_add_action_button("intrigue", tr("谋略"), true, tr("外交与计策"))
	else:
		intro_label.text = tr("%s · 情报未知或需侦察\n侦察与出征需从相邻的己方城池发起") % str(faction.get("name", tr("未知势力")))
		_add_action_button("detail", tr("情报"), true, tr("公开与已侦察情报"))
	empty_label.visible = false


func _build_city_entries() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var cities := _as_dictionary(_snapshot.get("cities", {}))
	var factions := _as_dictionary(_snapshot.get("factions", {}))
	var officers := _as_dictionary(_snapshot.get("officers", {}))
	var reports := _as_dictionary(_snapshot.get("intelReports", {}))
	var player_faction_id := str(_snapshot.get("playerFactionId", ""))
	var order: Array = _snapshot.get("cityOrder", []) if _snapshot.get("cityOrder") is Array else cities.keys()
	for raw_id: Variant in order:
		var city_id := str(raw_id)
		var city := _as_dictionary(cities.get(city_id, {}))
		if city.is_empty():
			continue
		var owner_id := str(city.get("ownerId", ""))
		var owner_name := str(_as_dictionary(factions.get(owner_id, {})).get("name", tr("未知势力")))
		if owner_id == player_faction_id and not player_faction_id.is_empty():
			var officer_count := 0
			for officer_id: Variant in officers.keys():
				var officer := _as_dictionary(officers[officer_id])
				if str(officer.get("status", "")) != "serving":
					continue
				if str(officer.get("cityId", "")) != city_id:
					continue
				if str(officer.get("factionId", "")) != player_faction_id:
					continue
				officer_count += 1
			result.append({
				"id": city_id,
				"name": str(city.get("name", city_id)),
				"ownerName": owner_name,
				"isOwned": true,
				"knowledge": "current",
				"officerCount": officer_count,
				"money": int(city.get("money", 0)),
				"food": int(city.get("food", 0)),
				"reserveTroops": int(city.get("reserveTroops", 0)),
			})
			continue
		var report := _as_dictionary(reports.get(city_id, {}))
		if not report.is_empty():
			result.append({
				"id": city_id,
				"name": str(city.get("name", city_id)),
				"ownerName": owner_name,
				"isOwned": false,
				"knowledge": "report",
				"officerCount": int(report.get("officerCount", 0)),
				"money": int(report.get("money", 0)),
				"food": int(report.get("food", 0)),
				"reserveTroops": int(report.get("reserveTroops", 0)),
				"observedLabel": tr("%d 年 %d 月情报") % [int(report.get("observedYear", 0)), int(report.get("observedMonth", 0))],
			})
		else:
			result.append({
				"id": city_id,
				"name": str(city.get("name", city_id)),
				"ownerName": owner_name,
				"isOwned": false,
				"knowledge": "public",
			})
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if bool(a.get("isOwned", false)) != bool(b.get("isOwned", false)):
			return bool(a.get("isOwned", false))
		return str(a.get("name", "")) < str(b.get("name", ""))
	)
	return result


func _build_officer_entries() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var officers := _as_dictionary(_snapshot.get("officers", {}))
	var cities := _as_dictionary(_snapshot.get("cities", {}))
	var player_faction_id := str(_snapshot.get("playerFactionId", ""))
	var discovered: Array = _snapshot.get("discoveredOfficerIds", []) if _snapshot.get("discoveredOfficerIds") is Array else []
	var acted: Array = _snapshot.get("actedOfficerIds", []) if _snapshot.get("actedOfficerIds") is Array else []
	for officer_id: Variant in officers.keys():
		var officer := _as_dictionary(officers[officer_id])
		var status := str(officer.get("status", ""))
		var city_id := str(officer.get("cityId", ""))
		var city_name := str(_as_dictionary(cities.get(city_id, {})).get("name", tr("未知城市"))) if not city_id.is_empty() else tr("在途")
		if status == "serving" and str(officer.get("factionId", "")) == player_faction_id:
			result.append({
				"id": str(officer_id),
				"name": str(officer.get("name", officer_id)),
				"group": "serving",
				"statusLabel": tr("在职") if not city_id.is_empty() else tr("在途"),
				"cityId": city_id,
				"cityName": city_name,
				"acted": acted.has(str(officer_id)),
				"stamina": int(officer.get("stamina", 0)),
				"troops": int(officer.get("troops", 0)),
			})
		elif status == "free" and discovered.has(str(officer_id)):
			result.append({
				"id": str(officer_id),
				"name": str(officer.get("name", officer_id)),
				"group": "free",
				"statusLabel": tr("已发现人才"),
				"cityId": city_id,
				"cityName": city_name if not city_id.is_empty() else tr("行踪不明"),
			})
		elif status == "captive" and str(officer.get("captorFactionId", "")) == player_faction_id:
			result.append({
				"id": str(officer_id),
				"name": str(officer.get("name", officer_id)),
				"group": "captive",
				"statusLabel": tr("本方俘虏"),
				"cityId": city_id,
				"cityName": city_name if not city_id.is_empty() else tr("押送中"),
				"stamina": int(officer.get("stamina", 0)),
			})
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return str(a.get("name", "")) < str(b.get("name", ""))
	)
	return result


func _build_treasure_entries() -> Array[Dictionary]:
	var visible: Dictionary = {}
	var cities := _as_dictionary(_snapshot.get("cities", {}))
	var officers := _as_dictionary(_snapshot.get("officers", {}))
	var items := _as_dictionary(_snapshot.get("items", {}))
	var player_faction_id := str(_snapshot.get("playerFactionId", ""))
	for city_id: Variant in cities.keys():
		var city := _as_dictionary(cities[city_id])
		if str(city.get("ownerId", "")) != player_faction_id:
			continue
		var item_ids: Array = city.get("itemIds", []) if city.get("itemIds") is Array else []
		for item_id: Variant in item_ids:
			visible[str(item_id)] = {"itemId": str(item_id), "location": str(city.get("name", city_id)), "holder": ""}
	for officer_id: Variant in officers.keys():
		var officer := _as_dictionary(officers[officer_id])
		if str(officer.get("factionId", "")) != player_faction_id:
			continue
		if str(officer.get("status", "")) == "dead":
			continue
		var equipment: Array = []
		if officer.get("equipmentIds") is Array:
			equipment = officer.get("equipmentIds")
		elif officer.get("equippedItemIds") is Array:
			equipment = officer.get("equippedItemIds")
		elif not str(officer.get("weaponItemId", "")).is_empty():
			equipment = [officer.get("weaponItemId"), officer.get("armorItemId"), officer.get("mountItemId"), officer.get("accessoryItemId")]
		var city_id := str(officer.get("cityId", ""))
		var location := str(_as_dictionary(cities.get(city_id, {})).get("name", tr("在途"))) if not city_id.is_empty() else tr("在途")
		for raw_item: Variant in equipment:
			var item_id := str(raw_item)
			if item_id.is_empty():
				continue
			visible[item_id] = {"itemId": item_id, "location": location, "holder": str(officer.get("name", ""))}
	var result: Array[Dictionary] = []
	for item_id: Variant in visible.keys():
		var item := _as_dictionary(items.get(str(item_id), {}))
		if item.is_empty():
			continue
		var entry: Dictionary = visible[item_id]
		result.append({
			"itemId": str(item_id),
			"name": str(item.get("name", item_id)),
			"location": str(entry.get("location", "")),
			"holder": str(entry.get("holder", "")),
			"forceBonus": int(item.get("forceBonus", 0)),
			"intelligenceBonus": int(item.get("intelligenceBonus", 0)),
			"moveBonus": int(item.get("moveBonus", 0)),
		})
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return str(a.get("name", "")) < str(b.get("name", ""))
	)
	return result


func _add_list_button(id: String, text: String, kind: String, city_id: String = "") -> void:
	var button := Button.new()
	button.text = text
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.custom_minimum_size = Vector2(0, _touch_size)
	button.add_theme_font_size_override("font_size", _font_size)
	button.pressed.connect(func() -> void:
		match kind:
			"city":
				city_selected.emit(id)
			"officer":
				officer_selected.emit(id, city_id)
			_:
				pass
	)
	list_box.add_child(button)


func _add_action_button(action_id: String, title: String, enabled: bool, subtitle: String) -> void:
	var button := Button.new()
	button.text = "%s\n%s" % [title, subtitle]
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.disabled = not enabled
	button.custom_minimum_size = Vector2(0, _touch_size)
	button.add_theme_font_size_override("font_size", _font_size)
	button.pressed.connect(func() -> void: action_selected.emit(action_id))
	actions_box.add_child(button)


func _clear_list() -> void:
	for child: Node in list_box.get_children():
		list_box.remove_child(child)
		child.free()


func _clear_actions() -> void:
	for child: Node in actions_box.get_children():
		actions_box.remove_child(child)
		child.free()


func _as_dictionary(value: Variant) -> Dictionary:
	return value if value is Dictionary else {}
