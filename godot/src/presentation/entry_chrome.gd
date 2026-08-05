extends RefCounted
## Shared Web-aligned chrome for the title / campaign-setup entry flow.
## Plaque buttons mirror `.entry-primary` / `.entry-secondary` in `src/styles.css`:
## dark fill, outer gold rim, dark inset gap, inner gold ring, soft drop shadow.
##
## IMPORTANT: Button.flat must stay false — flat suppresses the normal StyleBox draw,
## which left only the inner-ring stroke (wireframe look against the title plate).

const PRIMARY_TEXT := Color(0.945, 0.847, 0.576, 1.0) # #f1d893
const SECONDARY_TEXT := Color(0.914, 0.867, 0.741, 1.0) # #e9ddbd
const HOVER_TEXT := Color(0.988, 0.902, 0.631, 1.0)
const DISABLED_TEXT := Color(0.498, 0.502, 0.435, 1.0) # #7f806f
const FILL := Color(0.059, 0.106, 0.09, 0.86) # slightly denser than Web .78 for busy plates
const OUTER_GOLD := Color(0.78, 0.647, 0.31, 1.0) # #c7a54f
const INNER_GOLD := Color(0.776, 0.639, 0.275, 0.85)
const DISABLED_BORDER := Color(0.463, 0.427, 0.298, 1.0) # #766d4c
const INNER_RING_NAME := "PlaqueInnerRing"
## Web `.entry-primary span` uses weight 800 → Noto Serif SC ExtraBold (OFL).
const PLAQUE_FONT_PATH := "res://font/Noto_Serif_SC/static/NotoSerifSC-ExtraBold.ttf"
const SERIF_REGULAR_PATH := "res://font/Noto_Serif_SC/static/NotoSerifSC-Regular.ttf"
const SERIF_BOLD_PATH := "res://font/Noto_Serif_SC/static/NotoSerifSC-Bold.ttf"
## Web `.scenario-screen .setup-heading h1` / `.scenario-card strong`
const SCENARIO_HEADING := Color(0.659, 0.51, 0.239, 1.0) # #a8823d
const SCENARIO_TITLE := Color(1.0, 0.941, 0.788, 1.0) # #fff0c9
const SCENARIO_YEAR := Color(0.941, 0.824, 0.549, 1.0) # #f0d28c
const SCENARIO_BODY := Color(0.945, 0.918, 0.859, 1.0) # #f1eadb
const SCENARIO_META := Color(0.871, 0.839, 0.757, 1.0) # #ded6c1

static var _plaque_font: Font = null
static var _serif_regular: Font = null
static var _serif_bold: Font = null


static func apply_plaque_button(button: Button, primary: bool = true) -> void:
	_style_plaque_outer(button, not button.disabled)
	_ensure_inner_ring(button, not button.disabled)
	_apply_plaque_type(button, primary)


static func set_plaque_minimum_size(button: Button, minimum: Vector2) -> void:
	button.custom_minimum_size = minimum


static func set_plaque_min_height(button: Button, height: float) -> void:
	button.custom_minimum_size.y = height


static func plaque_min_height(button: Button) -> float:
	return button.custom_minimum_size.y


static func sync_plaque_disabled(button: Button, primary: bool = false) -> void:
	_style_plaque_outer(button, not button.disabled)
	_ensure_inner_ring(button, not button.disabled)
	button.add_theme_color_override("font_color", PRIMARY_TEXT if primary else SECONDARY_TEXT)
	button.add_theme_color_override("font_disabled_color", DISABLED_TEXT)


static func period_texture_path(period_id: int) -> String:
	match period_id:
		1:
			return "res://assets/production/entry/period-1-dong-zhuo.webp"
		2:
			return "res://assets/production/entry/period-2-cao-cao.webp"
		3:
			return "res://assets/production/entry/period-3-red-cliffs.webp"
		4:
			return "res://assets/production/entry/period-4-three-kingdoms.webp"
		_:
			return ""


static func load_texture(path: String) -> Texture2D:
	if path.is_empty() or not ResourceLoader.exists(path):
		return null
	return load(path) as Texture2D


static func serif_extrabold() -> Font:
	return _load_plaque_font()


static func serif_regular() -> Font:
	if _serif_regular != null:
		return _serif_regular
	if ResourceLoader.exists(SERIF_REGULAR_PATH):
		_serif_regular = load(SERIF_REGULAR_PATH) as Font
		return _serif_regular
	return serif_extrabold()


static func serif_bold() -> Font:
	if _serif_bold != null:
		return _serif_bold
	if ResourceLoader.exists(SERIF_BOLD_PATH):
		_serif_bold = load(SERIF_BOLD_PATH) as Font
		return _serif_bold
	return serif_extrabold()


static func apply_scenario_heading(label: Label, font_size: int) -> void:
	## Web `.scenario-screen .setup-heading h1`
	var font := serif_extrabold()
	if font != null:
		label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", SCENARIO_HEADING)
	label.add_theme_constant_override("outline_size", 1)
	label.add_theme_color_override("font_outline_color", Color(0.878, 0.761, 0.482, 1.0)) # #e0c27b
	label.add_theme_color_override("font_shadow_color", Color(0.42, 0.306, 0.137, 0.9)) # #6b4e23
	label.add_theme_constant_override("shadow_offset_x", 2)
	label.add_theme_constant_override("shadow_offset_y", 2)


static func apply_scenario_card_title(label: Label, font_size: int) -> void:
	var font := serif_extrabold()
	if font != null:
		label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", SCENARIO_TITLE)
	label.add_theme_constant_override("outline_size", 4)
	label.add_theme_color_override("font_outline_color", Color(0.02, 0.04, 0.03, 0.88))
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.92))
	label.add_theme_constant_override("shadow_offset_x", 0)
	label.add_theme_constant_override("shadow_offset_y", 2)


static func apply_scenario_card_year(label: Label, font_size: int) -> void:
	var font := serif_bold()
	if font != null:
		label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", SCENARIO_YEAR)
	label.add_theme_constant_override("outline_size", 3)
	label.add_theme_color_override("font_outline_color", Color(0.02, 0.04, 0.03, 0.88))
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	label.add_theme_constant_override("shadow_offset_x", 0)
	label.add_theme_constant_override("shadow_offset_y", 1)


static func apply_scenario_card_body(label: Label, font_size: int, muted: bool = false) -> void:
	var font := serif_regular()
	if font != null:
		label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", font_size)
	# Brighter body + thick outline ≈ Web `text-shadow: 0 2px 10px rgba(0,0,0,.92)`.
	label.add_theme_color_override(
		"font_color",
		Color(0.95, 0.92, 0.86, 1.0) if muted else Color(0.99, 0.97, 0.93, 1.0)
	)
	label.add_theme_constant_override("outline_size", 6)
	label.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.95))
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.95))
	label.add_theme_constant_override("shadow_offset_x", 0)
	label.add_theme_constant_override("shadow_offset_y", 2)


static func _make_plaque_style(enabled_gold: bool, bg: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = OUTER_GOLD if enabled_gold else DISABLED_BORDER
	style.set_border_width_all(1)
	style.set_corner_radius_all(0)
	# Inset for the child gold ring (≈ Web inset 3px dark + 2px gold).
	style.content_margin_left = 18
	style.content_margin_top = 12
	style.content_margin_right = 18
	style.content_margin_bottom = 12
	style.shadow_color = Color(0, 0, 0, 0.32)
	style.shadow_size = 16
	style.shadow_offset = Vector2(0, 6)
	return style


static func _style_plaque_outer(button: Button, enabled_gold: bool) -> void:
	var normal := _make_plaque_style(enabled_gold, FILL)
	var hover := _make_plaque_style(enabled_gold, Color(0.07, 0.13, 0.11, 0.92))
	hover.border_color = Color(0.941, 0.804, 0.447, 1.0) if enabled_gold else DISABLED_BORDER
	var pressed := _make_plaque_style(enabled_gold, Color(0.09, 0.16, 0.14, 0.95))
	pressed.border_color = hover.border_color
	var disabled := _make_plaque_style(false, FILL)
	var focus := hover.duplicate() as StyleBoxFlat
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	button.add_theme_stylebox_override("disabled", disabled)
	button.add_theme_stylebox_override("focus", focus)
	# flat=true skips drawing the normal StyleBox — never use it for plaques.
	button.flat = false


static func _ensure_inner_ring(button: Button, enabled_gold: bool) -> void:
	var ring := button.get_node_or_null(INNER_RING_NAME) as Panel
	if ring == null:
		ring = Panel.new()
		ring.name = INNER_RING_NAME
		ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
		button.add_child(ring)
		button.move_child(ring, 0)
	ring.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ring.offset_left = 3.0
	ring.offset_top = 3.0
	ring.offset_right = -3.0
	ring.offset_bottom = -3.0
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0, 0, 0, 0)
	style.border_color = INNER_GOLD if enabled_gold else DISABLED_BORDER
	style.set_border_width_all(2)
	style.set_corner_radius_all(0)
	ring.add_theme_stylebox_override("panel", style)
	ring.visible = true
	ring.z_index = 0


static func _apply_plaque_type(button: Button, primary: bool) -> void:
	button.add_theme_color_override("font_color", PRIMARY_TEXT if primary else SECONDARY_TEXT)
	button.add_theme_color_override("font_hover_color", HOVER_TEXT)
	button.add_theme_color_override("font_pressed_color", HOVER_TEXT)
	button.add_theme_color_override("font_disabled_color", DISABLED_TEXT)
	button.add_theme_color_override("font_focus_color", HOVER_TEXT)
	button.add_theme_constant_override("outline_size", 2)
	button.add_theme_color_override("font_outline_color", Color(0.04, 0.07, 0.05, 0.72))
	button.add_theme_font_size_override("font_size", 19)
	var font := _load_plaque_font()
	if font != null:
		button.add_theme_font_override("font", font)


static func _load_plaque_font() -> Font:
	if _plaque_font != null:
		return _plaque_font
	if ResourceLoader.exists(PLAQUE_FONT_PATH):
		_plaque_font = load(PLAQUE_FONT_PATH) as Font
		return _plaque_font
	# Fallback when the vendored face is missing (CI without font assets).
	var serif := SystemFont.new()
	serif.font_names = PackedStringArray([
		"Noto Serif SC",
		"Noto Serif CJK SC",
		"Source Han Serif SC",
		"Songti SC",
		"STSong",
		"SimSun",
		"serif",
	])
	serif.font_weight = 800
	_plaque_font = serif
	return _plaque_font
