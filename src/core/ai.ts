import { estimateBattle, executeAttack, type AttackOrder } from './battle';
import { appendLogs } from './logs';
import type { AiProfile, GameState } from './types';

export type AiDecision = {
  action: 'attack' | 'skip';
  factionId: string;
  order?: AttackOrder;
  scoreRatio?: number;
  reason: string;
};

const attackThresholds: Record<AiProfile, number> = {
  aggressive: 0.9,
  balanced: 1.05,
  defensive: 1.2,
};

export function planAiAction(state: GameState, factionId = state.activeFactionId): AiDecision {
  if (state.phase !== 'ai') throw new Error('AI can only plan during the AI phase');
  if (state.activeFactionId !== factionId) throw new Error('AI faction is not active');
  const faction = state.factions[factionId];
  if (!faction) throw new Error(`Unknown AI faction: ${factionId}`);
  if (faction.isPlayer) throw new Error('Player faction cannot use AI planning');

  const candidates: Array<{ order: AttackOrder; ratio: number }> = [];
  const sourceCities = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const source of sourceCities) {
    const officerIds = Object.values(state.officers)
      .filter(
        (officer) =>
          officer.status === 'serving' &&
          officer.factionId === factionId &&
          officer.cityId === source.id &&
          officer.troops > 0 &&
          officer.stamina > 0 &&
          !state.actedOfficerIds.includes(officer.id),
      )
      .sort((a, b) => b.leadership - a.leadership || a.id.localeCompare(b.id))
      .map((officer) => officer.id);
    if (officerIds.length === 0 || source.food <= 0) continue;

    for (const targetId of [...source.neighbors].sort()) {
      const target = state.cities[targetId];
      if (!target || target.ownerId === factionId) continue;
      const order = {
        sourceCityId: source.id,
        targetCityId: target.id,
        officerIds: officerIds.slice(0, 10),
        provisions: Math.max(1, Math.min(source.food, 500)),
      };
      const estimate = estimateBattle(state, order);
      candidates.push({ order, ratio: estimate.defender === 0 ? Number.POSITIVE_INFINITY : estimate.attacker / estimate.defender });
    }
  }

  if (candidates.length === 0) {
    return { action: 'skip', factionId, reason: '没有具备出征条件的边境部队。' };
  }

  candidates.sort(
    (a, b) =>
      b.ratio - a.ratio ||
      a.order.sourceCityId.localeCompare(b.order.sourceCityId) ||
      a.order.targetCityId.localeCompare(b.order.targetCityId),
  );
  const best = candidates[0];
  const threshold = attackThresholds[faction.aiProfile];
  if (best.ratio < threshold) {
    return {
      action: 'skip',
      factionId,
      scoreRatio: best.ratio,
      reason: `最优战力比 ${best.ratio.toFixed(2)}，低于${faction.aiProfile}策略阈值 ${threshold.toFixed(2)}。`,
    };
  }

  return {
    action: 'attack',
    factionId,
    order: best.order,
    scoreRatio: best.ratio,
    reason: `选择战力比 ${best.ratio.toFixed(2)} 的最优相邻目标。`,
  };
}

export function runAiFactionTurn(state: GameState): GameState {
  const decision = planAiAction(state);
  const faction = state.factions[decision.factionId];
  if (decision.action === 'skip' || !decision.order) {
    return appendLogs(state, 'ai', [`${faction.name}跳过军事行动：${decision.reason}`]);
  }

  const source = state.cities[decision.order.sourceCityId];
  const target = state.cities[decision.order.targetCityId];
  const announced = appendLogs(state, 'ai', [
    `${faction.name}决定从${source.name}进攻${target.name}：${decision.reason}`,
  ]);
  return executeAttack(announced, decision.order);
}

export function runAiRound(state: GameState): GameState {
  if (state.phase !== 'ai') throw new Error('AI round requires the AI phase');
  let next = state;
  for (const factionId of state.factionOrder) {
    if (next.phase === 'ended') break;
    if (factionId === state.playerFactionId) continue;
    next = { ...next, activeFactionId: factionId };
    next = runAiFactionTurn(next);
  }
  return next;
}
