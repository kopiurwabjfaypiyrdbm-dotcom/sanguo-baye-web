## Procedural, asset-free tap feedback anchored in map space.
class_name TouchRipple
extends Node2D

var radius := 0.0:
	set(value):
		radius = value
		queue_redraw()

var opacity := 0.9:
	set(value):
		opacity = value
		queue_redraw()


func play(max_radius: float = 46.0) -> void:
	var tween := create_tween().set_parallel(true)
	tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(self, "radius", max_radius, 0.42).from(5.0)
	tween.tween_property(self, "opacity", 0.0, 0.42).from(0.9)
	tween.chain().tween_callback(queue_free)


func _draw() -> void:
	var accent := Color(0.96, 0.79, 0.36, opacity)
	draw_arc(Vector2.ZERO, radius, 0.0, TAU, 48, accent, 3.0, true)
	draw_circle(Vector2.ZERO, maxf(1.0, radius * 0.12), Color(1.0, 0.9, 0.55, opacity * 0.45))
