import type { GameState } from './types';
import { parseSave, serializeSave, type SaveEnvelope } from './saveGame';
import type { AttackOrder } from './battle';
import {
  deleteBattleRecovery,
  loadBattleRecovery,
  savePendingBattleRecovery,
} from './battleRecovery';

export const SAVE_SLOT_IDS = ['auto', '1', '2', '3'] as const;
export type SaveSlotId = typeof SAVE_SLOT_IDS[number];

export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY_PREFIX = 'sanguo-baye-web:save:';
export type BattleCheckpoint = {
  state: GameState;
  order: AttackOrder;
  nextFactionIndex: number;
  label?: string;
};

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

/**
 * Player-directed battles do not persist their tactical session. Always replace
 * the automatic slot with the exact pre-battle strategic state so a refresh can
 * safely roll back even when the state came from an untouched manual save.
 */
export function savePlayerBattleRollback(
  storage: SaveStorage,
  state: GameState,
  label?: string,
  savedAt?: string,
): SaveEnvelope {
  return saveToSlot(storage, 'auto', state, label, savedAt);
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

export function saveBattleCheckpoint(
  storage: SaveStorage,
  state: GameState,
  order: AttackOrder,
  nextFactionIndex: number,
  label?: string,
): BattleCheckpoint {
  savePendingBattleRecovery(storage, state, order, { kind: 'ai-phase', nextFactionIndex }, label);
  return { state: structuredClone(state), order: { ...order, officerIds: [...order.officerIds] }, nextFactionIndex, label };
}

export function loadBattleCheckpoint(storage: SaveStorage): BattleCheckpoint | undefined {
  const recovery = loadBattleRecovery(storage);
  if (!recovery || recovery.status !== 'pending' || recovery.resume.kind !== 'ai-phase') return undefined;
  return {
    state: recovery.state,
    order: recovery.order,
    nextFactionIndex: recovery.resume.nextFactionIndex,
    label: recovery.label,
  };
}

export function deleteBattleCheckpoint(storage: SaveStorage): void {
  deleteBattleRecovery(storage);
}
