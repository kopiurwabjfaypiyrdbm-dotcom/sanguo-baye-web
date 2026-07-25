import type { GameState } from './types';
import { parseSave, serializeSave, type SaveEnvelope } from './saveGame';
import { validateAttackOrder, type AttackOrder } from './battle';

export const SAVE_SLOT_IDS = ['auto', '1', '2', '3'] as const;
export type SaveSlotId = typeof SAVE_SLOT_IDS[number];

export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY_PREFIX = 'sanguo-baye-web:save:';
const BATTLE_CHECKPOINT_KEY = 'sanguo-baye-web:battle-checkpoint';

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
  validateBattleCheckpoint(state, order, nextFactionIndex);
  const strategicSave = JSON.parse(serializeSave(state, label)) as unknown;
  storage.setItem(BATTLE_CHECKPOINT_KEY, JSON.stringify({
    format: 'sanguo-baye-web:battle-checkpoint',
    version: 1,
    strategicSave,
    order,
    nextFactionIndex,
  }));
  return { state: structuredClone(state), order: { ...order, officerIds: [...order.officerIds] }, nextFactionIndex, label };
}

export function loadBattleCheckpoint(storage: SaveStorage): BattleCheckpoint | undefined {
  const serialized = storage.getItem(BATTLE_CHECKPOINT_KEY);
  if (serialized === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('战前检查点不是有效的 JSON');
  }
  if (!isRecord(parsed)
    || parsed.format !== 'sanguo-baye-web:battle-checkpoint'
    || parsed.version !== 1
    || !isAttackOrder(parsed.order)
    || !Number.isInteger(parsed.nextFactionIndex)) {
    throw new Error('无法识别战前检查点');
  }
  const envelope = parseSave(parsed.strategicSave);
  const nextFactionIndex = parsed.nextFactionIndex as number;
  validateBattleCheckpoint(envelope.state, parsed.order, nextFactionIndex);
  return {
    state: envelope.state,
    order: parsed.order,
    nextFactionIndex,
    label: envelope.label,
  };
}

export function deleteBattleCheckpoint(storage: SaveStorage): void {
  storage.removeItem(BATTLE_CHECKPOINT_KEY);
}

function validateBattleCheckpoint(state: GameState, order: AttackOrder, nextFactionIndex: number): void {
  if (state.phase !== 'ai') throw new Error('战前检查点必须位于 AI 阶段');
  const expectedNextFactionIndex = state.factionOrder.indexOf(state.activeFactionId) + 1;
  if (
    expectedNextFactionIndex <= 0
    || nextFactionIndex !== expectedNextFactionIndex
    || nextFactionIndex > state.factionOrder.length
  ) {
    throw new Error('战前检查点的 AI 恢复位置无效');
  }
  validateAttackOrder(state, order);
  if (state.cities[order.targetCityId].ownerId !== state.playerFactionId) {
    throw new Error('战前检查点不是玩家守城战');
  }
}

function isAttackOrder(value: unknown): value is AttackOrder {
  return isRecord(value)
    && typeof value.sourceCityId === 'string'
    && typeof value.targetCityId === 'string'
    && Array.isArray(value.officerIds)
    && value.officerIds.every((officerId) => typeof officerId === 'string')
    && typeof value.provisions === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
