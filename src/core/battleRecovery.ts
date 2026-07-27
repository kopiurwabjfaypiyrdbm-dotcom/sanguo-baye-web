import {
  createBattleId,
  createBattleStrategicFingerprint,
  validateAttackOrder,
  type AttackOrder,
} from './battle';
import { parseSave, serializeSave } from './saveGame';
import type { SaveStorage } from './saveStorage';
import type { GameState } from './types';

export const BATTLE_RECOVERY_KEY = 'sanguo-baye-web:battle-checkpoint';

export type BattleRecoveryResume =
  | { kind: 'player-phase' }
  | { kind: 'ai-phase'; nextFactionIndex: number };

export type PendingBattleRecovery = {
  status: 'pending';
  mode: 'player-attack' | 'ai-defense';
  battleId: string;
  state: GameState;
  order: AttackOrder;
  resume: BattleRecoveryResume;
  label?: string;
};

export type CommittedBattleRecovery = {
  status: 'committed';
  battleId: string;
  state: GameState;
  label?: string;
};

export type BattleRecovery = PendingBattleRecovery | CommittedBattleRecovery;

export function savePendingBattleRecovery(
  storage: SaveStorage,
  state: GameState,
  order: AttackOrder,
  resume: BattleRecoveryResume,
  label?: string,
): PendingBattleRecovery {
  validatePending(state, order, resume);
  const battleId = createBattleId(state, order);
  storage.setItem(BATTLE_RECOVERY_KEY, JSON.stringify({
    format: 'sanguo-baye-web:battle-recovery',
    version: 2,
    status: 'pending',
    mode: resume.kind === 'player-phase' ? 'player-attack' : 'ai-defense',
    battleId,
    strategicFingerprint: createBattleStrategicFingerprint(state),
    strategicSave: JSON.parse(serializeSave(state, label)) as unknown,
    order,
    resume,
  }));
  return {
    status: 'pending',
    mode: resume.kind === 'player-phase' ? 'player-attack' : 'ai-defense',
    battleId,
    state: structuredClone(state),
    order: cloneOrder(order),
    resume: { ...resume },
    label,
  };
}

export function saveCommittedBattleRecovery(
  storage: SaveStorage,
  battleId: string,
  state: GameState,
  label?: string,
): CommittedBattleRecovery {
  if (!battleId) throw new Error('战斗恢复记录缺少战斗标识');
  storage.setItem(BATTLE_RECOVERY_KEY, JSON.stringify({
    format: 'sanguo-baye-web:battle-recovery',
    version: 2,
    status: 'committed',
    battleId,
    strategicSave: JSON.parse(serializeSave(state, label)) as unknown,
  }));
  return { status: 'committed', battleId, state: structuredClone(state), label };
}

export function loadBattleRecovery(storage: SaveStorage): BattleRecovery | undefined {
  const serialized = storage.getItem(BATTLE_RECOVERY_KEY);
  if (serialized === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('战斗恢复记录不是有效的 JSON');
  }
  if (
    !isRecord(parsed)
    || parsed.format !== 'sanguo-baye-web:battle-recovery'
    || parsed.version !== 2
    || typeof parsed.battleId !== 'string'
  ) {
    throw new Error('无法识别战斗恢复记录');
  }
  const envelope = parseSave(parsed.strategicSave);
  if (parsed.status === 'committed') {
    return {
      status: 'committed',
      battleId: parsed.battleId,
      state: envelope.state,
      label: envelope.label,
    };
  }
  if (
    parsed.status !== 'pending'
    || (parsed.mode !== 'player-attack' && parsed.mode !== 'ai-defense')
    || !isAttackOrder(parsed.order)
    || !isResume(parsed.resume)
    || typeof parsed.strategicFingerprint !== 'string'
  ) {
    throw new Error('待处理战斗恢复记录无效');
  }
  validatePending(envelope.state, parsed.order, parsed.resume);
  if (
    parsed.battleId !== createBattleId(envelope.state, parsed.order)
    || parsed.strategicFingerprint !== createBattleStrategicFingerprint(envelope.state)
    || parsed.mode !== (parsed.resume.kind === 'player-phase' ? 'player-attack' : 'ai-defense')
  ) {
    throw new Error('战斗恢复记录与战略状态不匹配');
  }
  return {
    status: 'pending',
    mode: parsed.mode,
    battleId: parsed.battleId,
    state: envelope.state,
    order: cloneOrder(parsed.order),
    resume: { ...parsed.resume },
    label: envelope.label,
  };
}

export function deleteBattleRecovery(storage: SaveStorage): void {
  storage.removeItem(BATTLE_RECOVERY_KEY);
}

function validatePending(state: GameState, order: AttackOrder, resume: BattleRecoveryResume): void {
  validateAttackOrder(state, order);
  if (resume.kind === 'player-phase') {
    if (state.phase !== 'player' || state.activeFactionId !== state.playerFactionId) {
      throw new Error('玩家进攻恢复记录必须位于玩家阶段');
    }
    if (state.cities[order.sourceCityId].ownerId !== state.playerFactionId) {
      throw new Error('玩家进攻恢复记录的出发城无效');
    }
    return;
  }
  if (state.phase !== 'ai') throw new Error('守城恢复记录必须位于 AI 阶段');
  const expectedNextFactionIndex = state.factionOrder.indexOf(state.activeFactionId) + 1;
  if (
    expectedNextFactionIndex <= 0
    || resume.nextFactionIndex !== expectedNextFactionIndex
    || resume.nextFactionIndex > state.factionOrder.length
  ) {
    throw new Error('战斗恢复记录的 AI 恢复位置无效');
  }
  if (state.cities[order.targetCityId].ownerId !== state.playerFactionId) {
    throw new Error('守城恢复记录的目标不是玩家城池');
  }
}

function cloneOrder(order: AttackOrder): AttackOrder {
  return { ...order, officerIds: [...order.officerIds] };
}

function isAttackOrder(value: unknown): value is AttackOrder {
  return isRecord(value)
    && typeof value.sourceCityId === 'string'
    && typeof value.targetCityId === 'string'
    && Array.isArray(value.officerIds)
    && value.officerIds.every((officerId) => typeof officerId === 'string')
    && typeof value.provisions === 'number';
}

function isResume(value: unknown): value is BattleRecoveryResume {
  return isRecord(value) && (
    value.kind === 'player-phase'
    || (value.kind === 'ai-phase' && Number.isInteger(value.nextFactionIndex))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
