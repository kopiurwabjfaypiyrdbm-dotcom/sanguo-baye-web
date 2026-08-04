## Web-aligned lightweight city shortcut menu.
## Detail / section actions emit intent; GameSession stays owned by the strategy screen.
class_name CityContextMenu
extends PanelContainer

const TouchMetrics = preload("res://src/presentation/touch_metrics.gd")

signal detail_requested(city_id: String)
signal section_requested(city_id: String, section: String)
signal close_requested

@onready var title_label: Label = %TitleLabel
@onready var subtitle_label: Label = %SubtitleLabel
@onready var metrics_label: Label = %MetricsLabel
@onready var actions_row: HBoxContainer = %ActionsRow
@onready var detail_button: Button = %DetailButton
@onready var internal_button: Button = %InternalButton
@onready var personnel_button: Button = %PersonnelButton
@onready var military_button: Button = %MilitaryButton
@onready var intrigue_button: Button = %IntrigueButton
@onready var hostile_hint: Label = %HostileHint
@onready var close_button: Button = %CloseButton

var _city_id := ""
var _is_owned := false


func _ready() -> void:
	close_button.pressed.connect(func() -> void: close_requested.emit())
	detail_button.pressed.connect(func() -> void: detail_requested.emit(_city_id))
	internal_button.pressed.connect(func() -> void: section_requested.emit(_city_id, "internal"))
	personnel_button.pressed.connect(func() -> void: section_requested.emit(_city_id, "personnel"))
	military_button.pressed.connect(func() -> void: section_requested.emit(_city_id, "military"))
	intrigue_button.pressed.connect(func() -> void: section_requested.emit(_city_id, "intrigue"))
	hide()


func show_city(snapshot: Dictionary, city_id: String) -> void:
	var cities := _as_dictionary(snapshot.get("cities", {}))
	var city := _as_dictionary(cities.get(city_id, {}))
	if city.is_empty():
		hide()
		return
	_city_id = city_id
	var owner_id := str(city.get("ownerId", ""))
	var player_faction_id := str(snapshot.get("playerFactionId", ""))
	_is_owned = owner_id == player_faction_id and not player_faction_id.is_empty()
	var factions := _as_dictionary(snapshot.get("factions", {}))
	var faction := _as_dictionary(factions.get(owner_id, {}))
	var officers := _as_dictionary(snapshot.get("officers", {}))
	var officer_count := 0
	var troops := int(city.get("reserveTroops", 0))
	for officer_id: Variant in officers.keys():
		var officer := _as_dictionary(officers[officer_id])
		if str(officer.get("status", "")) != "serving":
			continue
		if str(officer.get("cityId", "")) != city_id:
			continue
		if str(officer.get("factionId", "")) != owner_id:
			continue
		officer_count += 1
		troops += int(officer.get("troops", 0))
	title_label.text = str(city.get("name", city_id))
	if _is_owned:
		subtitle_label.text = tr("%s · %d 将") % [str(faction.get("name", "未知势力")), officer_count]
		metrics_label.text = tr("金 %d · 粮 %d · 兵 %d") % [
			int(city.get("money", 0)), int(city.get("food", 0)), troops
		]
		detail_button.text = tr("详情")
		internal_button.visible = true
		personnel_button.visible = true
		military_button.visible = true
		intrigue_button.visible = true
		hostile_hint.visible = false
	else:
		subtitle_label.text = tr("%s · 情报未知或需侦察") % str(faction.get("name", "未知势力"))
		metrics_label.text = tr("金 — · 粮 — · 兵 —")
		detail_button.text = tr("情报")
		internal_button.visible = false
		personnel_button.visible = false
		military_button.visible = false
		intrigue_button.visible = false
		hostile_hint.visible = true
		hostile_hint.text = tr("侦察与出征需从相邻的己方城池发起")
	show()


func place_near(anchor: Vector2, usable: Rect2) -> void:
	reset_size()
	var size := get_combined_minimum_size()
	if size.x < 1.0:
		size = custom_minimum_size
	var opens_below := anchor.y < usable.position.y + usable.size.y * 0.58
	var left := clampf(anchor.x - size.x * 0.5, usable.position.x + 8.0, usable.end.x - size.x - 8.0)
	var top := anchor.y + 28.0 if opens_below else anchor.y - size.y - 28.0
	top = clampf(top, usable.position.y + 8.0, usable.end.y - size.y - 8.0)
	position = Vector2(left, top)
	self.size = size


func apply_responsive_layout(compact: bool, canvas_scale: float, _physical_size: Vector2i) -> void:
	var touch_mode := compact or TouchMetrics.uses_density_scaled_targets()
	var touch_size := TouchMetrics.target_size(canvas_scale) if touch_mode else 48.0
	custom_minimum_size = Vector2(ceilf(320.0 / maxf(canvas_scale, 0.85)) if touch_mode else 360.0, 0.0)
	for button: Button in [detail_button, internal_button, personnel_button, military_button, intrigue_button, close_button]:
		button.custom_minimum_size = Vector2(touch_size if touch_mode else 56.0, touch_size if touch_mode else 48.0)
		button.add_theme_font_size_override("font_size", ceili(15.0 / maxf(canvas_scale, 0.01)) if touch_mode else 15)


func _as_dictionary(value: Variant) -> Dictionary:
	return value if value is Dictionary else {}
