extends Node

## Platform-only lifecycle and back dispatcher. It never owns campaign or
## battle state; it forwards system events to the active presentation scene.

signal application_paused
signal application_resumed

var is_application_paused := false


func _ready() -> void:
	# Keep Android's built-in quit fallback from terminating the process after
	# this dispatcher has routed Back to a presentation scene.
	get_tree().set_auto_accept_quit(false)


func _notification(what: int) -> void:
	match what:
		NOTIFICATION_WM_GO_BACK_REQUEST:
			_route_back()
		NOTIFICATION_APPLICATION_PAUSED:
			is_application_paused = true
			application_paused.emit()
		NOTIFICATION_APPLICATION_RESUMED:
			is_application_paused = false
			application_resumed.emit()


func _input(event: InputEvent) -> void:
	if not event.is_pressed() or event.is_echo():
		return
	if event.is_action_pressed("ui_cancel") or (event is InputEventKey and event.keycode == KEY_ESCAPE):
		_route_back()
		get_viewport().set_input_as_handled()


func _route_back() -> void:
	var scene := get_tree().current_scene
	if not is_instance_valid(scene):
		return
	if scene.has_method("_return_to_strategy"):
		scene.call("_return_to_strategy")
	elif scene.has_method("_return_to_menu"):
		scene.call("_return_to_menu")
	else:
		get_tree().quit()
