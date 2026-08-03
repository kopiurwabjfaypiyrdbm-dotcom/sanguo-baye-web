class_name TacticalBattleDemoFactory
extends RefCounted

## MB18 application-owned demo composition.  Presentation consumes the
## validated snapshot; it does not manufacture a tactical contract.

const Battlefield = preload("res://src/domain/tactical/battlefield.gd")


static func create_snapshot() -> Dictionary:
	var attacker_id := "officer:demo-attacker"
	var defender_id := "officer:demo-defender"
	return {
		"contractVersion": 1, "id": "mb18-demo", "strategicTurn": 1, "seedBefore": 48641, "rngSeed": 48641,
		"sourceCityId": "city-12", "targetCityId": "city-11", "attackerFactionId": "ruler-1", "defenderFactionId": "ruler-10",
		"attackerOfficerIds": ["demo-attacker"], "defenderOfficerIds": ["demo-defender"], "provisionsCommitted": 20,
		"attackerFood": 240, "defenderFood": 320, "width": 12, "height": 8, "day": 1, "maxDays": 30,
		"weather": "fine", "phase": "battle", "activeSide": "attacker", "status": "ongoing", "outcome": "",
		"approach": "west", "battlefieldVersion": 1, "battlefieldKey": "1:mb18:city-12:city-11", "battlefieldTemplate": "open-plain",
		"deployment": {"attacker": [{"unitId": attacker_id, "slotX": 8, "slotY": 4}], "defender": [{"unitId": defender_id, "slotX": 2, "slotY": 4}]},
		"units": {
			attacker_id: _demo_unit(attacker_id, "demo-attacker", "曹操", "ruler-1", "attacker", 0, 8, 4, 100),
			defender_id: _demo_unit(defender_id, "demo-defender", "守军主将", "ruler-10", "defender", 1, 2, 4, 100),
		},
		"actedUnitIds": [], "commanderUnitIds": {"attacker": attacker_id, "defender": defender_id}, "experienceGains": {},
		"logs": ["进入 MB18 原生战场样片。"], "guard": {"version": 2, "strategicFingerprint": "mb18", "sourceCityId": "city-12", "targetCityId": "city-11", "sourceFood": 240, "targetFood": 320, "targetDefense": 0, "targetReserveTroops": 0, "participants": [{"officerId": "demo-attacker", "equipmentKey": "", "equipmentKeyEncoding": "pipe-v1"}, {"officerId": "demo-defender", "equipmentKey": "", "equipmentKeyEncoding": "pipe-v1"}]},
		"terrainContractVersion": 1, "tiles": Battlefield.create_tiles(12, 8, "west", "open-plain"),
	}


static func _demo_unit(unit_id: String, officer_id: String, name: String, faction: String, side: String, arms_type: int, x: int, y: int, troops: int) -> Dictionary:
	return {"id": unit_id, "name": name, "officerId": officer_id, "factionId": faction, "side": side, "force": 84 if side == "attacker" else 54, "intelligence": 90 if side == "attacker" else 80, "level": 1, "armsType": arms_type, "mobility": 5 if side == "attacker" else 4, "skillPoints": 0, "maxSkillPoints": 12, "originalTroops": troops, "troops": troops, "status": "normal", "statusTurns": 0, "moved": false, "acted": false, "deployed": true, "slotX": x, "slotY": y}
