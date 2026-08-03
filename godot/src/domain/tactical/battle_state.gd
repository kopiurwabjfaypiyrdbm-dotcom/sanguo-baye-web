class_name TacticalBattleState
extends RefCounted

## Scene-independent tactical battle snapshot.
##
## This is deliberately a small, versioned boundary for MB13.  Terrain,
## movement paths, damage and skills are owned by later missions; the battle
## state still carries stable slots and turn bookkeeping so those missions can
## extend it without putting authority on a Node.

const CONTRACT_VERSION: int = 1

var _data: Dictionary


func _init(initial_data: Dictionary = {}) -> void:
	_data = initial_data.duplicate(true)


func snapshot() -> Dictionary:
	return _data.duplicate(true)


func digest() -> String:
	var canonical := preload("res://src/domain/validation/canonical_json.gd")
	var result: Dictionary = canonical.try_sha256(_data)
	return String(result.get("value", "")) if result.get("ok", false) else ""
