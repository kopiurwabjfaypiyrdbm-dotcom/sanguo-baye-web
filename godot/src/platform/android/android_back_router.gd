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
		NOTIFICATION_WM_CLOSE_REQUEST:
			# auto-accept is disabled so Android Back can be routed without
			# terminating the process. Desktop title-bar close/Alt+F4 must still
			# retain the normal quit contract.
			get_tree().quit()
		NOTIFICATION_APPLICATION_PAUSED:
			is_application_paused = true
			application_paused.emit()
			_notify_scene("_on_application_paused")
		NOTIFICATION_APPLICATION_RESUMED:
			is_application_paused = false
			application_resumed.emit()
			_notify_scene("_on_application_resumed")


func _input(event: InputEvent) -> void:
	# Preserve the desktop Escape equivalent without consuming the generic
	# ui_cancel action before a scene can close its own modal/settings surface.
	if event is InputEventKey and event.is_pressed() and not event.is_echo() and event.keycode == KEY_ESCAPE:
		_route_back()
		get_viewport().set_input_as_handled()


func _route_back() -> void:
	var scene := get_tree().current_scene
	if not is_instance_valid(scene):
		return
	if scene.has_method("_handle_system_back"):
		var handled: Variant = scene.call("_handle_system_back")
		if handled is bool and bool(handled):
			return
	if scene.has_method("_return_to_strategy"):
		scene.call("_return_to_strategy")
	elif scene.has_method("_return_to_menu"):
		scene.call("_return_to_menu")
	else:
		get_tree().quit()


func _notify_scene(method: StringName) -> void:
	var scene := get_tree().current_scene
	if is_instance_valid(scene) and scene.has_method(method):
		scene.call(method)
