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

/**
 * Older states used catalog ids as if every tool were globally unique, while
 * original periods can contain multiple copies of one tool type. Assign a
 * stable derived id to each additional copy so transfers remain atomic and
 * validation can reject accidental duplication afterwards.
 */
export function normalizeUniqueItemPlacements(state: GameState): GameState {
  const items = { ...state.items };
  const seenCounts = new Map<string, number>();
  const assign = (itemId: string): string => {
    const definition = state.items[itemId] ?? items[itemId];
    if (!definition) return itemId;
    const count = (seenCounts.get(itemId) ?? 0) + 1;
    seenCounts.set(itemId, count);
    if (count === 1) return itemId;
    let derivedId = `${itemId}~${count}`;
    while (items[derivedId]) derivedId = `${derivedId}~`;
    const {
      appearanceYear: _appearanceYear,
      appearanceCityId: _appearanceCityId,
      ...copyDefinition
    } = definition;
    items[derivedId] = { ...copyDefinition, id: derivedId };
    return derivedId;
  };

  const officers = { ...state.officers };
  for (const officer of Object.values(state.officers).sort(compareSourceThenId)) {
    officers[officer.id] = {
      ...officer,
      equipmentItemIds: getOfficerEquipmentIds(officer).map(assign),
    };
  }
  const cities = { ...state.cities };
  for (const city of Object.values(state.cities).sort(compareSourceThenId)) {
    cities[city.id] = {
      ...city,
      itemIds: (city.itemIds ?? []).map(assign),
      hiddenItemIds: (city.hiddenItemIds ?? []).map(assign),
    };
  }
  return { ...state, items, officers, cities };
}

function compareSourceThenId(
  left: { id: string; sourceId?: number; sourceIndex?: number },
  right: { id: string; sourceId?: number; sourceIndex?: number },
): number {
  return (left.sourceId ?? left.sourceIndex ?? Number.MAX_SAFE_INTEGER)
    - (right.sourceId ?? right.sourceIndex ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id);
}
