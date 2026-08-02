## Keeps HUD content inside the platform safe area while preserving a small desktop gutter.
class_name SafeAreaMargin
extends MarginContainer

const MIN_GUTTER := 12

var _safe_rect := Rect2()


func _ready() -> void:
	get_viewport().size_changed.connect(_apply_safe_area)
	_apply_safe_area()


func get_safe_rect() -> Rect2:
	return _safe_rect


func _apply_safe_area() -> void:
	var viewport_size := get_viewport_rect().size
	var left := float(MIN_GUTTER)
	var top := float(MIN_GUTTER)
	var right := float(MIN_GUTTER)
	var bottom := float(MIN_GUTTER)

	# Desktop safe areas are expressed in absolute monitor/work-area coordinates.
	# Treating those coordinates as viewport insets moves the HUD on multi-monitor
	# setups, so only mobile builds consume the platform cutout information.
	var display_safe := DisplayServer.get_display_safe_area()
	var screen_size := DisplayServer.screen_get_size()
	if OS.has_feature("mobile") and display_safe.size.x > 0 and display_safe.size.y > 0 and screen_size.x > 0 and screen_size.y > 0:
		var scale := Vector2(viewport_size.x / float(screen_size.x), viewport_size.y / float(screen_size.y))
		left = maxf(left, float(display_safe.position.x) * scale.x)
		top = maxf(top, float(display_safe.position.y) * scale.y)
		right = maxf(right, float(screen_size.x - display_safe.end.x) * scale.x)
		bottom = maxf(bottom, float(screen_size.y - display_safe.end.y) * scale.y)

	add_theme_constant_override("margin_left", roundi(left))
	add_theme_constant_override("margin_top", roundi(top))
	add_theme_constant_override("margin_right", roundi(right))
	add_theme_constant_override("margin_bottom", roundi(bottom))
	_safe_rect = Rect2(
		Vector2(left, top),
		Vector2(maxf(0.0, viewport_size.x - left - right), maxf(0.0, viewport_size.y - top - bottom))
	)
