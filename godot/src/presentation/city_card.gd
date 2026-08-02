## Lightweight city inspector and application-command launcher.
## It only reads snapshots and emits intent; GameSession remains owned by the screen presenter.
class_name CityCard
extends PanelContainer

signal develop_requested(city_id: String, officer_id: String)
signal close_requested

@onready var title_label: Label = %TitleLabel
@onready var ownership_label: Label = %OwnershipLabel
@onready var stats_label: Label = %StatsLabel
@onready var executor_label: Label = %ExecutorLabel
@onready var executor_option: OptionButton = %ExecutorOption
@onready var develop_button: Button = %DevelopButton
@onready var close_button: Button = %CloseButton

var _city_id := ""
var _base_action_enabled := false
var _busy := false

const DEFAULT_CARD_MINIMUM := Vector2(334.0, 254.0)
const DEFAULT_CLOSE_MINIMUM := Vector2(52.0, 48.0)
const DEFAULT_EXECUTOR_MINIMUM := Vector2(0.0, 52.0)
const DEFAULT_DEVELOP_MINIMUM := Vector2(132.0, 54.0)


func _ready() -> void:
	close_button.pressed.connect(func() -> void: close_requested.emit())
	develop_button.pressed.connect(_on_develop_pressed)
	close_button.text = tr("关闭")
	develop_button.text = tr("开垦")
	executor_label.text = tr("执行武将")
	hide()


func show_city(snapshot: Dictionary, city_id: String, default_executor_id: String = "") -> void:
	var cities := _as_dictionary(snapshot.get("cities", {}))
	var city := _as_dictionary(cities.get(city_id, {}))
	if city.is_empty():
		hide()
		return

	_city_id = city_id
	title_label.text = str(city.get("name", city_id))
	var owner_id := str(city.get("ownerId", ""))
	var factions := _as_dictionary(snapshot.get("factions", {}))
	var owner := _as_dictionary(factions.get(owner_id, {}))
	ownership_label.text = tr("势力：%s") % str(owner.get("name", tr("无主")))
	stats_label.text = "%s  %s\n%s  %s\n%s  %s" % [
		tr("人口：%s") % _format_number(int(city.get("population", 0))),
		tr("民忠：%d") % int(city.get("publicLoyalty", 0)),
		tr("农业：%d / %d") % [int(city.get("farming", 0)), int(city.get("farmingLimit", 0))],
		tr("商业：%d / %d") % [int(city.get("commerce", 0)), int(city.get("commerceLimit", 0))],
		tr("金：%d") % int(city.get("money", 0)),
		tr("粮：%d") % int(city.get("food", 0)),
	]
	var active_faction_id := str(snapshot.get("activeFactionId", snapshot.get("playerFactionId", "")))
	var can_issue_order := not owner_id.is_empty() and owner_id == active_faction_id and not default_executor_id.is_empty()
	_populate_executors(snapshot, city_id, owner_id, default_executor_id, can_issue_order)
	show()


func set_busy(value: bool) -> void:
	_busy = value
	executor_option.disabled = value or not _base_action_enabled
	develop_button.disabled = value or not _base_action_enabled


func apply_responsive_layout(compact: bool, canvas_scale: float, physical_size: Vector2i) -> void:
	var scale := maxf(canvas_scale, 0.01)
	if compact:
		var touch_size := ceilf(48.0 / scale)
		var target_width_px := minf(360.0, maxf(320.0, float(physical_size.x) - 48.0))
		custom_minimum_size = Vector2(ceilf(target_width_px / scale), DEFAULT_CARD_MINIMUM.y)
		close_button.custom_minimum_size = Vector2(touch_size, touch_size)
		executor_option.custom_minimum_size = Vector2(0.0, touch_size)
		develop_button.custom_minimum_size = Vector2(ceilf(112.0 / scale), touch_size)
		var body_font_size := ceili(16.0 / scale)
		var action_font_size := ceili(17.0 / scale)
		title_label.add_theme_font_size_override("font_size", ceili(20.0 / scale))
		for label: Label in [ownership_label, stats_label, executor_label]:
			label.add_theme_font_size_override("font_size", body_font_size)
		for control: Control in [close_button, executor_option, develop_button]:
			control.add_theme_font_size_override("font_size", action_font_size)
	else:
		custom_minimum_size = DEFAULT_CARD_MINIMUM
		close_button.custom_minimum_size = DEFAULT_CLOSE_MINIMUM
		executor_option.custom_minimum_size = DEFAULT_EXECUTOR_MINIMUM
		develop_button.custom_minimum_size = DEFAULT_DEVELOP_MINIMUM
		title_label.add_theme_font_size_override("font_size", 24)
		for label: Label in [ownership_label, stats_label, executor_label]:
			label.add_theme_font_size_override("font_size", 18)
		for control: Control in [close_button, executor_option, develop_button]:
			control.add_theme_font_size_override("font_size", 18)


func place_near(anchor_position: Vector2, usable_rect: Rect2) -> void:
	if not visible:
		return
	var card_size := size
	if card_size.x <= 1.0 or card_size.y <= 1.0:
		card_size = get_combined_minimum_size()
	var horizontal_gap := 34.0
	var desired := anchor_position + Vector2(horizontal_gap, -card_size.y * 0.42)
	if desired.x + card_size.x > usable_rect.end.x:
		desired.x = anchor_position.x - card_size.x - horizontal_gap
	desired.x = clampf(desired.x, usable_rect.position.x, maxf(usable_rect.position.x, usable_rect.end.x - card_size.x))
	desired.y = clampf(desired.y, usable_rect.position.y, maxf(usable_rect.position.y, usable_rect.end.y - card_size.y))
	position = desired.round()


func _populate_executors(
	snapshot: Dictionary,
	city_id: String,
	owner_id: String,
	preferred_id: String,
	can_issue_order: bool
) -> void:
	executor_option.clear()
	var officers := _as_dictionary(snapshot.get("officers", {}))
	var officer_ids := _ordered_keys(snapshot.get("officerOrder", []), officers)
	var acted_officer_ids: Array[String] = []
	var acted_value: Variant = snapshot.get("actedOfficerIds", [])
	if acted_value is Array:
		for raw_id in acted_value:
			acted_officer_ids.append(str(raw_id))
	var selected_index := -1
	for officer_id in officer_ids:
		var officer := _as_dictionary(officers.get(officer_id, {}))
		if (
			str(officer.get("cityId", "")) != city_id
			or str(officer.get("factionId", "")) != owner_id
			or str(officer.get("status", "")) != "serving"
			or acted_officer_ids.has(officer_id)
		):
			continue
		executor_option.add_item("%s · %s %d" % [
			str(officer.get("name", officer_id)),
			tr("体"),
			int(officer.get("stamina", 0)),
		])
		var index := executor_option.item_count - 1
		executor_option.set_item_metadata(index, officer_id)
		if officer_id == preferred_id:
			selected_index = index

	_base_action_enabled = can_issue_order and executor_option.item_count > 0
	if executor_option.item_count == 0:
		executor_option.add_item(tr("无可用在职武将"))
	else:
		executor_option.select(selected_index if selected_index >= 0 else 0)
	set_busy(_busy)


func _on_develop_pressed() -> void:
	if executor_option.disabled or executor_option.selected < 0:
		return
	var officer_id := str(executor_option.get_item_metadata(executor_option.selected))
	if officer_id.is_empty():
		return
	develop_requested.emit(_city_id, officer_id)


func _ordered_keys(declared_order: Variant, records: Dictionary) -> Array[String]:
	var result: Array[String] = []
	var seen := {}
	if declared_order is Array:
		for raw_id in declared_order:
			var record_id := str(raw_id)
			if records.has(record_id) and not seen.has(record_id):
				result.append(record_id)
				seen[record_id] = true
	var fallback: Array[String] = []
	for raw_id in records.keys():
		var record_id := str(raw_id)
		if not seen.has(record_id):
			fallback.append(record_id)
	fallback.sort()
	result.append_array(fallback)
	return result


func _format_number(value: int) -> String:
	var raw := str(absi(value))
	var parts: Array[String] = []
	while raw.length() > 3:
		parts.push_front(raw.right(3))
		raw = raw.left(raw.length() - 3)
	parts.push_front(raw)
	var result := ",".join(parts)
	return "-%s" % result if value < 0 else result


func _as_dictionary(value: Variant) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
