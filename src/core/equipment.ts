import type { GameState, Item, Officer } from './types';

export const OFFICER_EQUIPMENT_LIMIT = 2;

/** Reads the canonical two ordered slots, with a fallback for early schema-two saves. */
export function getOfficerEquipmentIds(officer: Officer): string[] {
  if (Array.isArray(officer.equipmentItemIds)) return [...officer.equipmentItemIds];
  return [officer.weaponItemId, officer.intelligenceItemId, officer.mountItemId]
    .filter((itemId): itemId is string => Boolean(itemId));
}

export function getOfficerEquipment(state: GameState, officer: Officer): Item[] {
  return getOfficerEquipmentIds(officer)
    .map((itemId) => state.items[itemId])
    .filter((item): item is Item => Boolean(item));
}

export function getEffectiveOfficerAttributes(state: GameState, officer: Officer): {
  force: number;
  intelligence: number;
  moveBonus: number;
} {
  return getOfficerEquipment(state, officer).reduce((attributes, item) => ({
    force: attributes.force + item.forceBonus,
    intelligence: attributes.intelligence + item.intelligenceBonus,
    moveBonus: attributes.moveBonus + item.moveBonus,
  }), { force: officer.force, intelligence: officer.intelligence, moveBonus: 0 });
}
