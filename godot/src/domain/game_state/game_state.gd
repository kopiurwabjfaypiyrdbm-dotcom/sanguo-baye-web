extends RefCounted

## Scene-independent authoritative campaign state.
##
## The wrapper owns a deep copy and never exposes its mutable Dictionary. Domain
## commands build and validate a replacement GameState, then the application
## session swaps the reference atomically.

var _data: Dictionary


func _init(initial_data: Dictionary = {}) -> void:
	_data = initial_data.duplicate(true)


func snapshot() -> Dictionary:
	return _data.duplicate(true)


func is_empty() -> bool:
	return _data.is_empty()
