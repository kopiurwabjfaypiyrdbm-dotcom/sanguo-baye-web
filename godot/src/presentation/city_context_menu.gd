## CoC-style radial city context (L2). Petals sit around the city marker;
## choosing a petal emits section/detail and the host opens L3.
class_name CityContextMenu
extends Control

const TouchMetrics = preload("res://src/presentation/touch_metrics.gd")

signal detail_requested(city_id: String)
signal section_requested(city_id: String, section: String)
signal close_requested

@onready var backdrop: ColorRect = %Backdrop
@onready var title_label: Label = %TitleLabel
@onready var metrics_label: Label = %MetricsLabel
@onready var detail_button: Button = %DetailButton
@onready var internal_button: Button = %InternalButton
@onready var personnel_button: Button = %PersonnelButton
@onready var military_button: Button = %MilitaryButton
@onready var intrigue_button: Button = %IntrigueButton

var _city_id := ""
var _is_owned := false
var _anchor := Vector2.ZERO
var _usable := Rect2()
var _petal_size := 56.0
var _radius := 78.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	backdrop.gui_input.connect(_on_backdrop_gui_input)
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
		metrics_label.text = tr("%s · %d将 · 金%d 粮%d 兵%d") % [
			str(faction.get("name", tr("未知"))), officer_count,
			int(city.get("money", 0)), int(city.get("food", 0)), troops,
		]
		detail_button.text = tr("详情")
		internal_button.visible = true
		personnel_button.visible = true
		military_button.visible = true
		intrigue_button.visible = true
	else:
		metrics_label.text = tr("%s · 点详情查看情报") % str(faction.get("name", tr("未知")))
		detail_button.text = tr("情报")
		internal_button.visible = false
		personnel_button.visible = false
		military_button.visible = false
		intrigue_button.visible = false
	show()
	move_to_front()
	_layout_petals()


func place_near(anchor: Vector2, usable: Rect2) -> void:
	_anchor = anchor
	_usable = usable
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_layout_petals()


func apply_responsive_layout(compact: bool, canvas_scale: float, _physical_size: Vector2i) -> void:
	var touch_mode := compact or TouchMetrics.uses_density_scaled_targets()
	_petal_size = TouchMetrics.target_size(canvas_scale) if touch_mode else 56.0
	_radius = maxf(_petal_size * 1.35, 72.0)
	var font := ceili(13.0 / maxf(canvas_scale, 0.01)) if touch_mode else 14
	for button: Button in _petals():
		button.custom_minimum_size = Vector2(_petal_size, _petal_size)
		button.add_theme_font_size_override("font_size", font)
	title_label.add_theme_font_size_override("font_size", ceili(15.0 / maxf(canvas_scale, 0.01)) if touch_mode else 16)
	metrics_label.add_theme_font_size_override("font_size", maxi(11, font - 1))
	if visible:
		_layout_petals()


func _layout_petals() -> void:
	var petals: Array[Button] = []
	for button: Button in _petals():
		if button.visible:
			petals.append(button)
	if petals.is_empty():
		return
	var center := _anchor
	if _usable.size.x > 1.0 and _usable.size.y > 1.0:
		var pad := _radius + _petal_size * 0.5 + 8.0
		center.x = clampf(center.x, _usable.position.x + pad, _usable.end.x - pad)
		center.y = clampf(center.y, _usable.position.y + pad, _usable.end.y - pad)
	# Caption sits above the ring.
	var caption_pos := Vector2(center.x - 90.0, center.y - _radius - _petal_size * 0.85)
	title_label.position = caption_pos
	title_label.size = Vector2(180.0, 22.0)
	metrics_label.position = Vector2(caption_pos.x, caption_pos.y + 20.0)
	metrics_label.size = Vector2(180.0, 36.0)
	var count := petals.size()
	# Start from top and go clockwise so 5 petals feel like a clover.
	var start_angle := -PI * 0.5
	for index: int in range(count):
		var angle := start_angle + TAU * float(index) / float(count)
		var petal: Button = petals[index]
		var pos := center + Vector2(cos(angle), sin(angle)) * _radius - Vector2(_petal_size, _petal_size) * 0.5
		petal.position = pos
		petal.size = Vector2(_petal_size, _petal_size)


func _petals() -> Array[Button]:
	return [detail_button, internal_button, personnel_button, military_button, intrigue_button]


func _on_backdrop_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		close_requested.emit()
		accept_event()
	elif event is InputEventScreenTouch and event.pressed:
		close_requested.emit()
		accept_event()


func _as_dictionary(value: Variant) -> Dictionary:
	return value if value is Dictionary else {}
