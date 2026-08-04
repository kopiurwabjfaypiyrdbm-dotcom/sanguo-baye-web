extends RefCounted
## Shared Web-aligned chrome for the title / campaign-setup entry flow.


static func apply_plaque_button(button: Button, primary: bool = true) -> void:
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(0.059, 0.106, 0.09, 0.78)
	normal.border_color = Color(0.78, 0.647, 0.31, 1.0) if primary else Color(0.78, 0.647, 0.31, 0.92)
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(0)
	normal.content_margin_left = 16
	normal.content_margin_top = 10
	normal.content_margin_right = 16
	normal.content_margin_bottom = 10
	normal.shadow_color = Color(0, 0, 0, 0.2)
	normal.shadow_size = 8
	var hover := normal.duplicate()
	hover.border_color = Color(0.941, 0.804, 0.447, 1.0)
	hover.bg_color = Color(0.07, 0.13, 0.11, 0.86)
	var pressed := hover.duplicate()
	pressed.bg_color = Color(0.09, 0.16, 0.14, 0.92)
	var disabled := normal.duplicate()
	disabled.bg_color = Color(0.059, 0.106, 0.09, 0.78)
	disabled.border_color = Color(0.463, 0.427, 0.298, 1.0)
	var focus := hover.duplicate()
	focus.set_border_width_all(2)
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	button.add_theme_stylebox_override("disabled", disabled)
	button.add_theme_stylebox_override("focus", focus)
	button.add_theme_color_override("font_color", Color(0.945, 0.847, 0.576, 1.0) if primary else Color(0.914, 0.867, 0.741, 1.0))
	button.add_theme_color_override("font_hover_color", Color(0.988, 0.902, 0.631, 1.0))
	button.add_theme_color_override("font_pressed_color", Color(0.988, 0.902, 0.631, 1.0))
	button.add_theme_color_override("font_disabled_color", Color(0.498, 0.502, 0.435, 1.0))
	button.add_theme_color_override("font_focus_color", Color(0.988, 0.902, 0.631, 1.0))


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
