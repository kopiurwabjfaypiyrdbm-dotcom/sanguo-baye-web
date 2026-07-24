import { estimateBattle, executeAttack, type AttackOrder } from './battle';
import {
  DEVELOP_MONEY_COST,
  DEVELOP_STAMINA_COST,
  RECRUIT_STAMINA_COST,
  calculateOfficerTroopCapacity,
  calculateRecruitCapacity,
  developFarming,
  distributeTroops,
  recruitTroops,
} from './cityCommands';
import { appendLogs } from './logs';
import { SEARCH_STAMINA_COST, moveOfficer, searchCity } from './personnelCommands';
import type { AiProfile, GameState } from './types';

export const AI_MAX_ACTIONS = 5;
const AI_MIN_ATTACK_PROVISIONS = 200;

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
    if (officerIds.length === 0 || source.food < AI_MIN_ATTACK_PROVISIONS) continue;

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
  const faction = state.factions[state.activeFactionId];
  let next = state;
  let actionCount = 0;

  for (const operation of [balanceTroops, recruitReserves, developWeakCity, searchLocalTalent, reinforceFrontier]) {
    if (actionCount >= AI_MAX_ACTIONS - 1 || next.phase === 'ended') break;
    const operated = operation(next, faction.id);
    if (operated) {
      next = operated;
      actionCount += 1;
    }
  }

  if (next.phase === 'ended' || actionCount >= AI_MAX_ACTIONS) return next;
  const decision = planAiAction(next, faction.id);
  if (decision.action === 'skip' || !decision.order) {
    return appendLogs(next, 'ai', [`${faction.name}完成 ${actionCount} 项经营行动，未出征：${decision.reason}`]);
  }

  const source = next.cities[decision.order.sourceCityId];
  const target = next.cities[decision.order.targetCityId];
  const announced = appendLogs(next, 'ai', [
    `${faction.name}完成 ${actionCount} 项经营行动后，决定从${source.name}进攻${target.name}：${decision.reason}`,
  ]);
  return executeAttack(announced, decision.order);
}

function balanceTroops(state: GameState, factionId: string): GameState | undefined {
  const candidates = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId && city.reserveTroops > 0)
    .flatMap((city) => Object.values(state.officers)
      .filter((officer) => officer.status === 'serving' && officer.factionId === factionId && officer.cityId === city.id)
      .map((officer) => ({ city, officer, capacity: calculateOfficerTroopCapacity(officer) })))
    .filter(({ officer, capacity }) => officer.troops < capacity)
    .sort((a, b) =>
      (a.officer.troops / a.capacity) - (b.officer.troops / b.capacity)
      || b.officer.leadership - a.officer.leadership
      || a.officer.id.localeCompare(b.officer.id));
  const candidate = candidates[0];
  if (!candidate) return undefined;
  return distributeTroops(state, {
    cityId: candidate.city.id,
    officerId: candidate.officer.id,
    targetTroops: Math.min(candidate.capacity, candidate.officer.troops + candidate.city.reserveTroops),
  });
}

function recruitReserves(state: GameState, factionId: string): GameState | undefined {
  const candidates = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId && city.reserveTroops < 1_000 && city.food >= 200)
    .filter((city) => calculateRecruitCapacity(city) > 0)
    .sort((a, b) => a.reserveTroops - b.reserveTroops || a.id.localeCompare(b.id));
  for (const city of candidates) {
    const officer = availableOfficers(state, factionId, city.id, RECRUIT_STAMINA_COST)[0];
    if (officer) return recruitTroops(state, { cityId: city.id, officerId: officer.id, amount: 500 });
  }
  return undefined;
}

function developWeakCity(state: GameState, factionId: string): GameState | undefined {
  const candidates = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId && city.money >= DEVELOP_MONEY_COST)
    .filter((city) => city.farmingLimit === undefined || city.farming < city.farmingLimit)
    .sort((a, b) =>
      farmingRatio(a.farming, a.farmingLimit) - farmingRatio(b.farming, b.farmingLimit)
      || a.id.localeCompare(b.id));
  for (const city of candidates) {
    const officer = availableOfficers(state, factionId, city.id, DEVELOP_STAMINA_COST)
      .sort((a, b) => b.intelligence - a.intelligence || a.id.localeCompare(b.id))[0];
    if (officer) return developFarming(state, { cityId: city.id, officerId: officer.id });
  }
  return undefined;
}

function reinforceFrontier(state: GameState, factionId: string): GameState | undefined {
  const borderCities = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId && city.neighbors.some((id) => state.cities[id]?.ownerId !== factionId))
    .sort((a, b) => stationedCount(state, a.id, factionId) - stationedCount(state, b.id, factionId) || a.id.localeCompare(b.id));
  for (const target of borderCities) {
    const sources = target.neighbors
      .map((id) => state.cities[id])
      .filter((city) => city?.ownerId === factionId && stationedCount(state, city.id, factionId) > 1)
      .sort((a, b) => stationedCount(state, b.id, factionId) - stationedCount(state, a.id, factionId) || a.id.localeCompare(b.id));
    for (const source of sources) {
      const faction = state.factions[factionId];
      const officer = availableOfficers(state, factionId, source.id, 0)
        .filter((candidate) => candidate.id !== faction.rulerOfficerId && candidate.id !== source.satrapOfficerId)
        .sort((a, b) => b.leadership - a.leadership || a.id.localeCompare(b.id))[0];
      if (officer) return moveOfficer(state, { sourceCityId: source.id, targetCityId: target.id, officerId: officer.id });
    }
  }
  return undefined;
}

function searchLocalTalent(state: GameState, factionId: string): GameState | undefined {
  const candidates = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId)
    .filter((city) => Object.values(state.officers).some((officer) => officer.status === 'free' && officer.cityId === city.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const city of candidates) {
    const officer = availableOfficers(state, factionId, city.id, SEARCH_STAMINA_COST)
      .sort((a, b) => b.intelligence - a.intelligence || a.id.localeCompare(b.id))[0];
    if (officer) return searchCity(state, { cityId: city.id, officerId: officer.id });
  }
  return undefined;
}

function availableOfficers(state: GameState, factionId: string, cityId: string, stamina: number) {
  return Object.values(state.officers)
    .filter((officer) =>
      officer.status === 'serving'
      && officer.factionId === factionId
      && officer.cityId === cityId
      && officer.stamina >= stamina
      && !state.actedOfficerIds.includes(officer.id))
    .sort((a, b) => b.leadership - a.leadership || a.id.localeCompare(b.id));
}

function stationedCount(state: GameState, cityId: string, factionId: string): number {
  return Object.values(state.officers).filter(
    (officer) => officer.status === 'serving' && officer.factionId === factionId && officer.cityId === cityId,
  ).length;
}

function farmingRatio(farming: number, limit?: number): number {
  return limit && limit > 0 ? farming / limit : farming / 1_000;
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
