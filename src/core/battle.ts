import { appendLogs } from './logs';
import { nextRandom } from './random';
import type { GameState, Officer } from './types';
import { assertValidGameState } from './validation';
import { updateCitySatraps } from './administration';
import { evaluateOutcome } from './outcome';

export type AttackOrder = {
  sourceCityId: string;
  targetCityId: string;
  officerIds: string[];
  provisions: number;
};

export type BattleConfig = {
  troopWeight: number;
  forceWeight: number;
  intelligenceWeight: number;
  leadershipWeight: number;
  defenseWeight: number;
  reserveTroopWeight: number;
  moveBonusWeight: number;
  randomRange: number;
};

export type BattleEstimate = {
  attacker: number;
  defender: number;
  defenderOfficerIds: string[];
};

export type BattleResult = {
  turn: number;
  seedBefore: number;
  nextRngSeed: number;
  sourceCityId: string;
  targetCityId: string;
  attackerFactionId: string;
  defenderFactionId: string;
  attackerOfficerIds: string[];
  defenderOfficerIds: string[];
  provisions: number;
  winner: 'attacker' | 'defender';
  attackerScore: number;
  defenderScore: number;
  casualties: Record<string, number>;
  defenderReserveLosses: number;
  cityCaptured: boolean;
  logs: string[];
};

export const battleConfig: BattleConfig = {
  troopWeight: 1,
  forceWeight: 8,
  intelligenceWeight: 4,
  leadershipWeight: 10,
  defenseWeight: 0.4,
  reserveTroopWeight: 0.8,
  moveBonusWeight: 10,
  randomRange: 0.12,
};

export function estimateBattle(state: GameState, order: AttackOrder, config = battleConfig): BattleEstimate {
  const context = validateAttackOrder(state, order);
  return {
    attacker: scoreOfficers(state, context.attackers, 'attacker', config),
    defender:
      scoreOfficers(state, context.defenders, 'defender', config) +
      context.target.reserveTroops * config.reserveTroopWeight +
      context.target.defense * config.defenseWeight,
    defenderOfficerIds: context.defenders.map((officer) => officer.id),
  };
}

export function resolveBattle(state: GameState, order: AttackOrder, config = battleConfig): BattleResult {
  const context = validateAttackOrder(state, order);
  const estimate = estimateBattle(state, order, config);
  const attackerRandom = nextRandom(state.rngSeed);
  const defenderRandom = nextRandom(attackerRandom.seed);
  const attackerScore = estimate.attacker * randomMultiplier(attackerRandom.value, config.randomRange);
  const defenderScore = estimate.defender * randomMultiplier(defenderRandom.value, config.randomRange);
  const winner = attackerScore > defenderScore ? 'attacker' : 'defender';
  const attackerLossRate = lossRate(winner === 'attacker', defenderScore, attackerScore);
  const defenderLossRate = lossRate(winner === 'defender', attackerScore, defenderScore);
  const casualties: Record<string, number> = {};

  for (const officer of context.attackers) casualties[officer.id] = casualtiesFor(officer, attackerLossRate);
  for (const officer of context.defenders) casualties[officer.id] = casualtiesFor(officer, defenderLossRate);

  const defenderReserveLosses = Math.min(
    context.target.reserveTroops,
    Math.round(context.target.reserveTroops * defenderLossRate),
  );
  const cityCaptured = winner === 'attacker';
  const ratio = defenderScore === 0 ? '∞' : (attackerScore / defenderScore).toFixed(2);
  const logs = [
    `${context.source.name}向${context.target.name}发起进攻。`,
    `攻方战力 ${Math.round(attackerScore)}，守方战力 ${Math.round(defenderScore)}，战力比 ${ratio}。`,
    cityCaptured ? `${context.target.name}被${state.factions[context.source.ownerId].name}占领。` : `${context.target.name}守军击退了进攻。`,
  ];

  return {
    turn: state.turn,
    seedBefore: state.rngSeed,
    nextRngSeed: defenderRandom.seed,
    sourceCityId: context.source.id,
    targetCityId: context.target.id,
    attackerFactionId: context.source.ownerId,
    defenderFactionId: context.target.ownerId,
    attackerOfficerIds: context.attackers.map((officer) => officer.id),
    defenderOfficerIds: context.defenders.map((officer) => officer.id),
    provisions: order.provisions,
    winner,
    attackerScore,
    defenderScore,
    casualties,
    defenderReserveLosses,
    cityCaptured,
    logs,
  };
}

export function applyBattleResult(state: GameState, result: BattleResult): GameState {
  if (state.turn !== result.turn || state.rngSeed !== result.seedBefore) {
    throw new Error('Battle result does not match the current state');
  }
  const source = state.cities[result.sourceCityId];
  const target = state.cities[result.targetCityId];
  if (!source || !target || source.ownerId !== result.attackerFactionId || target.ownerId !== result.defenderFactionId) {
    throw new Error('Battle result references stale city ownership');
  }

  const officers = { ...state.officers };
  for (const [officerId, losses] of Object.entries(result.casualties)) {
    const officer = officers[officerId];
    if (!officer) throw new Error(`Unknown battle officer: ${officerId}`);
    officers[officerId] = { ...officer, troops: Math.max(0, officer.troops - losses), stamina: 0 };
  }

  const cities = {
    ...state.cities,
    [source.id]: {
      ...source,
      food: source.food - result.provisions,
    },
    [target.id]: {
      ...target,
      reserveTroops: Math.max(0, target.reserveTroops - result.defenderReserveLosses),
    },
  };

  if (result.cityCaptured) {
    cities[target.id] = { ...cities[target.id], ownerId: result.attackerFactionId };
    for (const officerId of result.attackerOfficerIds) {
      officers[officerId] = { ...officers[officerId], cityId: target.id };
    }

    const retreatCity = findRetreatCity(state, target.id, result.defenderFactionId);
    for (const officerId of result.defenderOfficerIds) {
      officers[officerId] = retreatCity
        ? { ...officers[officerId], cityId: retreatCity }
        : { ...officers[officerId], troops: 0, stamina: 0 };
    }
  }

  let next: GameState = {
    ...state,
    campaignStarted: true,
    cities,
    officers,
    rngSeed: result.nextRngSeed,
    actedOfficerIds: [...state.actedOfficerIds, ...result.attackerOfficerIds],
  };
  next = updateCitySatraps(next);
  next = appendLogs(next, 'battle', result.logs);
  next = evaluateOutcome(next);
  assertValidGameState(next);
  return next;
}

export function executeAttack(state: GameState, order: AttackOrder, config = battleConfig): GameState {
  return applyBattleResult(state, resolveBattle(state, order, config));
}

function validateAttackOrder(state: GameState, order: AttackOrder) {
  if (state.phase === 'ended') throw new Error('The game has ended');
  const source = state.cities[order.sourceCityId];
  const target = state.cities[order.targetCityId];
  if (!source) throw new Error(`Unknown source city: ${order.sourceCityId}`);
  if (!target) throw new Error(`Unknown target city: ${order.targetCityId}`);
  if (source.ownerId !== state.activeFactionId) throw new Error('Source city is not owned by the active faction');
  if (target.ownerId === source.ownerId) throw new Error('Target city is not hostile');
  if (!source.neighbors.includes(target.id) || !target.neighbors.includes(source.id)) {
    throw new Error('Cities are not adjacent');
  }
  if (order.officerIds.length === 0) throw new Error('At least one attacking officer is required');
  if (new Set(order.officerIds).size !== order.officerIds.length) throw new Error('Attacking officers must be unique');
  if (!Number.isInteger(order.provisions) || order.provisions <= 0) throw new Error('Campaign provisions must be a positive integer');
  if (source.food < order.provisions) throw new Error('Source city does not have enough provisions');

  const attackers = order.officerIds.map((officerId) => {
    const officer = state.officers[officerId];
    if (!officer) throw new Error(`Unknown attacking officer: ${officerId}`);
    if (officer.status !== 'serving' || officer.factionId !== source.ownerId || officer.cityId !== source.id) {
      throw new Error(`Officer is not stationed in the source city: ${officerId}`);
    }
    if (officer.troops <= 0) throw new Error(`Officer has no troops: ${officerId}`);
    if (officer.stamina <= 0) throw new Error(`Officer has no stamina: ${officerId}`);
    if (state.actedOfficerIds.includes(officerId)) throw new Error(`Officer has already acted this month: ${officerId}`);
    return officer;
  });
  const defenders = Object.values(state.officers)
    .filter((officer) => officer.status === 'serving' && officer.factionId === target.ownerId && officer.cityId === target.id && officer.troops > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  return { source, target, attackers, defenders };
}

function scoreOfficers(
  state: GameState,
  officers: Officer[],
  side: 'attacker' | 'defender',
  config: BattleConfig,
): number {
  return officers.reduce((total, officer) => {
    const armsType = state.armsTypes[officer.armsTypeId];
    if (!armsType) throw new Error(`Unknown arms type: ${officer.armsTypeId}`);
    const items = [officer.weaponItemId, officer.intelligenceItemId, officer.mountItemId]
      .filter((itemId): itemId is string => Boolean(itemId))
      .map((itemId) => state.items[itemId]);
    const forceBonus = items.reduce((sum, item) => sum + (item?.forceBonus ?? 0), 0);
    const intelligenceBonus = items.reduce((sum, item) => sum + (item?.intelligenceBonus ?? 0), 0);
    const moveBonus = items.reduce((sum, item) => sum + (item?.moveBonus ?? 0), 0);
    const armsModifier = side === 'attacker' ? armsType.attackModifier : armsType.defenseModifier;
    return (
      total +
      officer.troops * config.troopWeight * armsModifier +
      (officer.force + forceBonus) * config.forceWeight +
      (officer.intelligence + intelligenceBonus) * config.intelligenceWeight +
      officer.leadership * config.leadershipWeight +
      moveBonus * config.moveBonusWeight
    );
  }, 0);
}

function randomMultiplier(value: number, range: number): number {
  return 1 + (value * 2 - 1) * range;
}

function lossRate(sideWon: boolean, opposingScore: number, ownScore: number): number {
  const pressure = ownScore <= 0 ? 1 : opposingScore / ownScore;
  return sideWon ? clamp(0.08 + pressure * 0.2, 0.08, 0.4) : clamp(0.5 + pressure * 0.15, 0.5, 0.9);
}

function casualtiesFor(officer: Officer, rate: number): number {
  return Math.min(officer.troops, Math.max(1, Math.round(officer.troops * rate)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findRetreatCity(state: GameState, capturedCityId: string, factionId: string): string | undefined {
  const capturedCity = state.cities[capturedCityId];
  const neighboringRetreat = capturedCity.neighbors
    .map((cityId) => state.cities[cityId])
    .filter((city) => city?.ownerId === factionId)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (neighboringRetreat) return neighboringRetreat.id;

  return Object.values(state.cities)
    .filter((city) => city.id !== capturedCityId && city.ownerId === factionId)
    .sort((a, b) => a.id.localeCompare(b.id))[0]?.id;
}
