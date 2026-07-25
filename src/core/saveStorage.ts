import type { GameState } from './types';
import { parseSave, serializeSave, type SaveEnvelope } from './saveGame';

export const SAVE_SLOT_IDS = ['auto', '1', '2', '3'] as const;
export type SaveSlotId = typeof SAVE_SLOT_IDS[number];

export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY_PREFIX = 'sanguo-baye-web:save:';

export function saveToSlot(
  storage: SaveStorage,
  slotId: SaveSlotId,
  state: GameState,
  label?: string,
  savedAt?: string,
): SaveEnvelope {
  const serialized = serializeSave(state, label, savedAt);
  storage.setItem(slotKey(slotId), serialized);
  return parseSave(serialized);
}

export function loadFromSlot(storage: SaveStorage, slotId: SaveSlotId): SaveEnvelope | undefined {
  const serialized = storage.getItem(slotKey(slotId));
  return serialized === null ? undefined : parseSave(serialized);
}

export function deleteSlot(storage: SaveStorage, slotId: SaveSlotId): void {
  storage.removeItem(slotKey(slotId));
}

export function slotKey(slotId: SaveSlotId): string {
  return `${KEY_PREFIX}${slotId}`;
}
