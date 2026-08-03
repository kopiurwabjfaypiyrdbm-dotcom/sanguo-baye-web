## Visual-only city marker. It receives immutable snapshot records from the map presenter.
class_name CityMarker
extends Node2D

const PLAYER_FILL := Color("#294e46")
const OTHER_FILL := Color("#533e35")
const NEUTRAL_FILL := Color("#424a48")
const INK := Color("#e8edda")
const GOLD := Color("#f2c85c")

var city_id := ""
var city_name := ""
var is_player_city := false
var has_owner := false
var owner_color := OTHER_FILL
var condition := "normal"
var _selected := false
var _pulse_tween: Tween
var _font: SystemFont

var pulse_phase := 0.0:
	set(value):
		pulse_phase = value
		queue_redraw()


func _ready() -> void:
	_font = SystemFont.new()
	_font.font_names = PackedStringArray([
		"Noto Sans CJK SC",
		"Microsoft YaHei UI",
		"PingFang SC",
		"WenQuanYi Micro Hei",
		"sans-serif",
	])
	queue_redraw()


func configure(city: Dictionary, faction: Dictionary, player_faction_id: String) -> void:
	city_id = str(city.get("id", ""))
	city_name = str(city.get("name", city_id))
	var owner_id := str(city.get("ownerId", ""))
	has_owner = not owner_id.is_empty()
	is_player_city = has_owner and owner_id == player_faction_id
	# Enemy event state is live intelligence and remains hidden until a future
	# report contract carries it. Owned cities get an explicit non-color badge.
	condition = str(city.get("condition", "normal")) if is_player_city else "normal"
	owner_color = Color(str(faction.get("color", "#73594b"))) if not faction.is_empty() else NEUTRAL_FILL
	queue_redraw()


func set_selected(value: bool) -> void:
	if _selected == value:
		return
	_selected = value
	if _pulse_tween and _pulse_tween.is_valid():
		_pulse_tween.kill()
	_pulse_tween = null
	pulse_phase = 0.0
	if _selected:
		_pulse_tween = create_tween().set_loops()
		_pulse_tween.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		_pulse_tween.tween_property(self, "pulse_phase", 1.0, 0.85).from(0.0)
	queue_redraw()


func _draw() -> void:
	draw_circle(Vector2(2.0, 3.0), 22.0, Color(0, 0, 0, 0.36))
	if is_player_city:
		_draw_player_fort()
	elif has_owner:
		_draw_other_city()
	else:
		_draw_neutral_city()

	if _selected:
		var pulse_radius := 29.0 + pulse_phase * 9.0
		draw_arc(Vector2.ZERO, pulse_radius, 0.0, TAU, 48, Color(GOLD, 0.86 * (1.0 - pulse_phase)), 3.0, true)
		var chevron := PackedVector2Array([Vector2(-8, -35), Vector2(0, -43), Vector2(8, -35)])
		draw_polyline(chevron, GOLD, 3.0, true)

	if condition != "normal":
		var condition_colors := {
			"famine": Color("#d5a94c"), "drought": Color("#e47b3f"),
			"flood": Color("#4fa8d8"), "rebellion": Color("#dc5b58"),
		}
		var condition_text := {"famine": "荒", "drought": "旱", "flood": "水", "rebellion": "乱"}
		var badge_color: Color = condition_colors.get(condition, Color("#d5a94c"))
		draw_circle(Vector2(22, -22), 12.0, Color("#172124"))
		draw_circle(Vector2(22, -22), 10.0, badge_color)
		if _font:
			draw_string(_font, Vector2(12, -16), str(condition_text.get(condition, "灾")), HORIZONTAL_ALIGNMENT_CENTER, 20.0, 15, Color("#fff8df"))

	if _font:
		draw_string(
			_font,
			Vector2(-62.0, 43.0),
			city_name,
			HORIZONTAL_ALIGNMENT_CENTER,
			124.0,
			18,
			Color("#f2f0df")
		)


func _draw_player_fort() -> void:
	var points := PackedVector2Array([
		Vector2(-19, -10), Vector2(-10, -20), Vector2(10, -20),
		Vector2(19, -10), Vector2(19, 12), Vector2(0, 23),
		Vector2(-19, 12),
	])
	draw_colored_polygon(points, PLAYER_FILL.lerp(owner_color, 0.34))
	var outline := points.duplicate()
	outline.append(points[0])
	draw_polyline(outline, INK, 3.0, true)
	# A flag silhouette makes player ownership readable without relying on hue.
	draw_line(Vector2(-7, 10), Vector2(-7, -12), GOLD, 2.5, true)
	draw_colored_polygon(PackedVector2Array([Vector2(-6, -12), Vector2(9, -8), Vector2(-6, -3)]), GOLD)


func _draw_other_city() -> void:
	draw_circle(Vector2.ZERO, 20.0, OTHER_FILL.lerp(owner_color, 0.42))
	draw_arc(Vector2.ZERO, 20.0, 0.0, TAU, 40, Color(owner_color, 1.0), 4.0, true)
	draw_line(Vector2(-8, 0), Vector2(8, 0), INK, 2.5, true)
	draw_line(Vector2(0, -8), Vector2(0, 8), INK, 2.5, true)


func _draw_neutral_city() -> void:
	var rect := Rect2(Vector2(-17, -17), Vector2(34, 34))
	draw_rect(rect, NEUTRAL_FILL, true)
	draw_rect(rect, INK, false, 3.0)
	draw_circle(Vector2.ZERO, 4.0, INK)
