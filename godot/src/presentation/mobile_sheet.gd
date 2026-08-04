## Phone-first edge/bottom sheet shell. Content panels keep domain logic;
## this Control only owns chrome, geometry, and a pinned footer CTA.
class_name MobileSheet
extends Control

const TouchMetrics = preload("res://src/presentation/touch_metrics.gd")

signal close_requested
signal footer_pressed

@onready var backdrop: ColorRect = %Backdrop
@onready var frame: PanelContainer = %Frame
@onready var title_label: Label = %TitleLabel
@onready var close_button: Button = %CloseButton
@onready var body_host: Control = %BodyHost
@onready var footer_row: HBoxContainer = %FooterRow
@onready var footer_button: Button = %FooterButton

var _mode := "right"
var _compact := false
var _canvas_scale := 1.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	backdrop.gui_input.connect(_on_backdrop_gui_input)
	close_button.pressed.connect(func() -> void: close_requested.emit())
	footer_button.pressed.connect(func() -> void: footer_pressed.emit())
	hide()
	set_footer("", false)


func is_open() -> bool:
	return visible


func open(title: String) -> void:
	title_label.text = title
	show()
	move_to_front()
	apply_layout(_compact, _canvas_scale, DisplayServer.window_get_size())


func close() -> void:
	hide()
	set_footer("", false)


func set_footer(text: String, enabled: bool = true) -> void:
	var has_text := not text.is_empty()
	footer_row.visible = has_text
	footer_button.visible = has_text
	footer_button.text = text
	footer_button.disabled = not enabled


func get_body_rect() -> Rect2:
	return Rect2(body_host.global_position, body_host.size)


func apply_layout(compact: bool, canvas_scale: float, physical_size: Vector2i) -> void:
	_compact = compact
	_canvas_scale = canvas_scale
	var viewport := get_viewport_rect().size
	var touch_mode := compact or TouchMetrics.uses_density_scaled_targets()
	var touch_size := TouchMetrics.target_size(canvas_scale) if touch_mode else 48.0
	var use_right := viewport.x >= 740.0 and viewport.x >= viewport.y
	_mode = "right" if use_right else "bottom"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if _mode == "right":
		var width := minf(viewport.x * 0.38, 420.0)
		frame.set_anchors_preset(Control.PRESET_RIGHT_WIDE)
		frame.offset_left = -width
		frame.offset_top = 0.0
		frame.offset_right = 0.0
		frame.offset_bottom = 0.0
	else:
		var height := clampf(viewport.y * 0.55, 220.0, viewport.y * 0.72)
		frame.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
		frame.offset_left = 0.0
		frame.offset_top = -height
		frame.offset_right = 0.0
		frame.offset_bottom = 0.0
	close_button.custom_minimum_size = Vector2(touch_size, touch_size)
	footer_button.custom_minimum_size = Vector2(0.0, touch_size if touch_mode else 52.0)
	title_label.add_theme_font_size_override("font_size", ceili(18.0 / maxf(canvas_scale, 0.01)) if touch_mode else 20)
	close_button.add_theme_font_size_override("font_size", ceili(16.0 / maxf(canvas_scale, 0.01)) if touch_mode else 16)
	footer_button.add_theme_font_size_override("font_size", ceili(17.0 / maxf(canvas_scale, 0.01)) if touch_mode else 18)
	# physical_size retained for callers that mirror other panels' signatures.
	if physical_size.x <= 0:
		pass


func _on_backdrop_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		close_requested.emit()
		accept_event()
	elif event is InputEventScreenTouch and event.pressed:
		close_requested.emit()
		accept_event()
