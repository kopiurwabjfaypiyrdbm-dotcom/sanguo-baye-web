import { appendLogs } from './logs';
import { nextRandom } from './random';
import type { GameState, Officer } from './types';
import { assertValidGameState } from './validation';
import { releaseLandlessFactionOfficers, updateCitySatraps } from './administration';
import { evaluateOutcome } from './outcome';
import { getEffectiveOfficerAttributes, getOfficerEquipment, getOfficerEquipmentIds } from './equipment';
import { applyBayeExperience, calculateBayeBattleExperience } from '../compat/baye/tacticalGrowth';
import { rollBayeDefeatedOfficerOutcome } from '../compat/baye/officerLifecycle';
import { captureOfficer, killOfficer } from './officerLifecycle';

export type AttackOrder = {
  sourceCityId: string;
  targetCityId: string;
  officerIds: string[];
  provisions: number;
};

export const BATTLE_SIDE_LIMIT = 10;

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

export type BattleParticipantSnapshot = {
  officerId: string;
  cityId?: string;
  factionId: string;
  status: Officer['status'];
  troops: number;
  stamina: number;
  force: number;
  intelligence: number;
  leadership: number;
  level: number;
  experience: number;
  armsTypeId: string;
  equipmentKey: string;
  armsAttackModifier: number;
  armsDefenseModifier: number;
  armsMobility: number;
  itemForceBonus: number;
  itemIntelligenceBonus: number;
  itemMoveBonus: number;
};

export type BattleStateGuard = {
  version: 2;
  strategicFingerprint: string;
  sourceCityId: string;
  targetCityId: string;
  sourceFood: number;
  targetFood: number;
  targetDefense: number;
  targetReserveTroops: number;
  participants: BattleParticipantSnapshot[];
};

export type AttackContext = {
  source: GameState['cities'][string];
  target: GameState['cities'][string];
  attackers: Officer[];
  defenders: Officer[];
};

export type BattleResult = {
  battleId: string;
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
  experienceGains?: Record<string, number>;
  experienceGainOrder?: string[];
  defenderReserveLosses: number;
  cityCaptured: boolean;
  guard: BattleStateGuard;
  targetFoodAfter?: number;
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
  const defenders = context.defenders.slice(0, BATTLE_SIDE_LIMIT);
  return {
    attacker: scoreOfficers(state, context.attackers, 'attacker', config),
    defender:
      scoreOfficers(state, defenders, 'defender', config) +
      context.target.reserveTroops * config.reserveTroopWeight +
      context.target.defense * config.defenseWeight,
    defenderOfficerIds: defenders.map((officer) => officer.id),
  };
}

export function resolveBattle(state: GameState, order: AttackOrder, config = battleConfig): BattleResult {
  const context = validateAttackOrder(state, order);
  const defenders = context.defenders.slice(0, BATTLE_SIDE_LIMIT);
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
  for (const officer of defenders) casualties[officer.id] = casualtiesFor(officer, defenderLossRate);

  const defenderReserveLosses = Math.min(
    context.target.reserveTroops,
    Math.round(context.target.reserveTroops * defenderLossRate),
  );
  const cityCaptured = winner === 'attacker';
  const attackerDamage = defenders.reduce((sum, officer) => sum + (casualties[officer.id] ?? 0), 0)
    + defenderReserveLosses;
  const defenderDamage = context.attackers.reduce((sum, officer) => sum + (casualties[officer.id] ?? 0), 0);
  const experienceGains: Record<string, number> = {};
  const experienceGainOrder: string[] = [];
  const defenderLevel = defenders[0]?.level ?? 1;
  const attackerLevel = context.attackers[0]?.level ?? 1;
  for (const officer of context.attackers) {
    experienceGainOrder.push(officer.id);
    experienceGains[officer.id] = calculateBayeBattleExperience(
      Math.floor(attackerDamage / Math.max(1, context.attackers.length)),
      officer.level ?? 1,
      defenderLevel,
    );
  }
  for (const officer of defenders) {
    experienceGainOrder.push(officer.id);
    experienceGains[officer.id] = calculateBayeBattleExperience(
      Math.floor(defenderDamage / Math.max(1, defenders.length)),
      officer.level ?? 1,
      attackerLevel,
    );
  }
  const ratio = defenderScore === 0 ? '∞' : (attackerScore / defenderScore).toFixed(2);
  const logs = [
    `${context.source.name}向${context.target.name}发起进攻。`,
    `攻方战力 ${Math.round(attackerScore)}，守方战力 ${Math.round(defenderScore)}，战力比 ${ratio}。`,
    cityCaptured ? `${context.target.name}被${state.factions[context.source.ownerId].name}占领。` : `${context.target.name}守军击退了进攻。`,
  ];

  return {
    battleId: createBattleId(state, order),
    turn: state.turn,
    seedBefore: state.rngSeed,
    nextRngSeed: defenderRandom.seed,
    sourceCityId: context.source.id,
    targetCityId: context.target.id,
    attackerFactionId: context.source.ownerId,
    defenderFactionId: context.target.ownerId,
    attackerOfficerIds: context.attackers.map((officer) => officer.id),
    defenderOfficerIds: defenders.map((officer) => officer.id),
    provisions: order.provisions,
    winner,
    attackerScore,
    defenderScore,
    casualties,
    experienceGains,
    experienceGainOrder,
    defenderReserveLosses,
    cityCaptured,
    guard: createBattleStateGuard(state, context),
    logs,
  };
}

export function applyBattleResult(state: GameState, result: BattleResult): GameState {
  assertBattleResultConsistency(result);
  if (state.turn !== result.turn || state.rngSeed !== result.seedBefore) {
    throw new Error('Battle result does not match the current state');
  }
  if (result.battleId !== createBattleId(state, {
    sourceCityId: result.sourceCityId,
    targetCityId: result.targetCityId,
    officerIds: result.attackerOfficerIds,
    provisions: result.provisions,
  })) {
    throw new Error('Battle result identity does not match the current campaign');
  }
  const source = state.cities[result.sourceCityId];
  const target = state.cities[result.targetCityId];
  if (!source || !target || source.ownerId !== result.attackerFactionId || target.ownerId !== result.defenderFactionId) {
    throw new Error('Battle result references stale city ownership');
  }
  assertBattleStateGuard(state, result.guard);

  const officers = { ...state.officers };
  for (const [officerId, losses] of Object.entries(result.casualties)) {
    const officer = officers[officerId];
    if (!officer) throw new Error(`Unknown battle officer: ${officerId}`);
    officers[officerId] = { ...officer, troops: Math.max(0, officer.troops - losses), stamina: 0 };
  }
  const growthLogs: string[] = [];
  const experienceGainOrder = result.experienceGainOrder ?? Object.keys(result.experienceGains ?? {}).sort();
  for (const officerId of experienceGainOrder) {
    const gained = result.experienceGains?.[officerId] ?? 0;
    const officer = officers[officerId];
    if (!officer || gained <= 0) continue;
    const growth = applyBayeExperience(officer.level ?? 1, officer.experience ?? 0, gained);
    officers[officerId] = { ...officer, level: growth.level, experience: growth.experience };
    growthLogs.push(`${officer.name}获得 ${gained} 点经验${growth.levelsGained > 0 ? `，升至 ${growth.level} 级` : ''}。`);
  }

  const cities = {
    ...state.cities,
    [source.id]: {
      ...source,
      food: source.food - result.provisions,
    },
    [target.id]: {
      ...target,
      farming: target.farming - Math.floor(target.farming / 20),
      commerce: target.commerce - Math.floor(target.commerce / 20),
      money: target.money - Math.floor(target.money / 20),
      publicLoyalty: target.publicLoyalty === undefined
        ? undefined
        : target.publicLoyalty - Math.floor(target.publicLoyalty / 10),
      reserveTroops: Math.max(0, target.reserveTroops - result.defenderReserveLosses),
      food: result.targetFoodAfter ?? target.food,
    },
  };

  const additionalLogs: string[] = [
    ...growthLogs,
    `${target.name}经此战农业、商业与金钱各损耗二十分之一，民忠损耗十分之一。`,
  ];
  const neutralFactionId = Object.values(state.factions).find((faction) => faction.isNeutral)?.id;
  let captureSeed = result.nextRngSeed;
  const lifecycleResults: Array<{
    kind: 'captured' | 'dead';
    officerId: string;
    formerFactionId: string;
    captorFactionId: string;
  }> = [];
  const decideDefeatedOfficer = (
    officer: Officer,
    captorFactionId: string,
    escapeCityIds: string[],
  ) => {
    const outcome = rollBayeDefeatedOfficerOutcome(
      getEffectiveOfficerAttributes({ ...state, cities, officers }, officer).intelligence,
      escapeCityIds.length,
      captureSeed,
      state.lifecyclePolicy.battleDeath,
    );
    captureSeed = outcome.seed;
    if (outcome.kind === 'escaped') {
      officers[officer.id] = { ...officer, cityId: escapeCityIds[outcome.destinationIndex] };
      additionalLogs.push(`${officer.name}突围退往${cities[escapeCityIds[outcome.destinationIndex]].name}。`);
      return;
    }
    lifecycleResults.push({
      kind: outcome.kind,
      officerId: officer.id,
      formerFactionId: officer.factionId,
      captorFactionId,
    });
  };
  if (result.cityCaptured) {
    cities[target.id] = { ...cities[target.id], ownerId: result.attackerFactionId };
    for (const [officerId, officer] of Object.entries(officers)) {
      if (officer.status !== 'captive' || officer.cityId !== target.id) continue;
      if (officer.formerFactionId === result.attackerFactionId) {
        officers[officerId] = {
          ...officer,
          status: 'serving',
          factionId: result.attackerFactionId,
          captorFactionId: undefined,
          formerFactionId: undefined,
          cityId: target.id,
          troops: 0,
          stamina: 0,
        };
        additionalLogs.push(`${officer.name}随${target.name}被收复，重归${state.factions[result.attackerFactionId].name}。`);
      } else {
        officers[officerId] = { ...officer, captorFactionId: result.attackerFactionId };
        additionalLogs.push(`${officer.name}随${target.name}易手，改由${state.factions[result.attackerFactionId].name}羁押。`);
      }
    }
    for (const officerId of result.attackerOfficerIds) {
      officers[officerId] = { ...officers[officerId], cityId: target.id };
    }

    const escapeCityIds = Object.values(cities)
      .filter((city) => city.ownerId === result.defenderFactionId)
      .sort(compareBattleCities)
      .map((city) => city.id);
    const participantIds = new Set(result.defenderOfficerIds);
    const stationedOfficerIds = Object.values(officers)
      .filter((officer) => officer.status === 'serving'
        && officer.factionId === result.defenderFactionId
        && officer.cityId === target.id)
      .map((officer) => officer.id);
    const stationedOfficerIdSet = new Set(stationedOfficerIds);
    // TheLoserDeal consumes random draws in the battle queue order, not in
    // global person-record order.
    for (const officerId of result.defenderOfficerIds) {
      if (!stationedOfficerIdSet.has(officerId)) continue;
      const officer = officers[officerId];
      decideDefeatedOfficer(officer, result.attackerFactionId, escapeCityIds);
    }
    for (const officerId of stationedOfficerIds.filter((candidate) => !participantIds.has(candidate))) {
      const officer = officers[officerId];
      if (state.factions[result.defenderFactionId].rulerOfficerId === officer.id) {
        lifecycleResults.push({
          kind: 'captured',
          officerId: officer.id,
          formerFactionId: officer.factionId,
          captorFactionId: result.attackerFactionId,
        });
      } else {
        if (!neutralFactionId) throw new Error('A fallen city requires a neutral faction');
        officers[officerId] = {
          ...officer,
          status: 'free',
          factionId: neutralFactionId,
          cityId: target.id,
          troops: 0,
          stamina: 0,
        };
        additionalLogs.push(`${officer.name}在${target.name}陷落后成为在野人物。`);
      }
    }
  } else {
    const defenderCanHoldCaptives = !state.factions[result.defenderFactionId].isNeutral;
    if (defenderCanHoldCaptives) {
      const escapeCityIds = Object.values(cities)
        .filter((city) => city.ownerId === result.attackerFactionId)
        .sort(compareBattleCities)
        .map((city) => city.id);
      for (const officerId of result.attackerOfficerIds) {
        const officer = officers[officerId];
        decideDefeatedOfficer(officer, result.defenderFactionId, escapeCityIds);
      }
    }
  }

  let next: GameState = {
    ...state,
    campaignStarted: true,
    cities,
    officers,
    rngSeed: captureSeed,
    actedOfficerIds: [...state.actedOfficerIds, ...result.attackerOfficerIds],
  };
  lifecycleResults.sort((left, right) => {
    const leftIsRuler = state.factions[left.formerFactionId]?.rulerOfficerId === left.officerId;
    const rightIsRuler = state.factions[right.formerFactionId]?.rulerOfficerId === right.officerId;
    return Number(leftIsRuler) - Number(rightIsRuler)
      || left.officerId.localeCompare(right.officerId);
  });
  for (const lifecycle of lifecycleResults) {
    const officer = next.officers[lifecycle.officerId];
    if (!officer || officer.status !== 'serving') continue;
    if (lifecycle.kind === 'dead') {
      next = killOfficer(next, {
        officerId: officer.id,
        cause: 'battle-death',
        cityId: target.id,
        responsibleFactionId: lifecycle.captorFactionId,
      });
      additionalLogs.push(`${officer.name}兵败战死，遗留装备由${target.name}收存。`);
    } else {
      next = captureOfficer(next, {
        officerId: officer.id,
        captorFactionId: lifecycle.captorFactionId,
        cityId: target.id,
      });
      additionalLogs.push(`${officer.name}兵败被俘，暂押于${target.name}。`);
    }
  }
  const defenderEliminated = result.cityCaptured
    && !Object.values(next.cities).some((city) => city.ownerId === result.defenderFactionId);
  if (defenderEliminated) {
    next = releaseLandlessFactionOfficers(next);
    additionalLogs.push(`${state.factions[result.defenderFactionId].name}失去最后一座城池，所属武将转为在野。`);
  }
  next = updateCitySatraps(next);
  next = appendLogs(next, 'battle', [...result.logs, ...additionalLogs]);
  next = evaluateOutcome(next);
  assertValidGameState(next);
  return next;
}

export function createBattleId(state: GameState, order: AttackOrder): string {
  return [
    state.turn,
    state.rngSeed,
    order.sourceCityId,
    order.targetCityId,
    [...order.officerIds].join(','),
    order.provisions,
  ].join(':');
}

export function executeAttack(state: GameState, order: AttackOrder, config = battleConfig): GameState {
  return applyBattleResult(state, resolveBattle(state, order, config));
}

export function validateAttackOrder(state: GameState, order: AttackOrder): AttackContext {
  if (state.phase === 'ended') throw new Error('The game has ended');
  if (state.pendingSuccession) throw new Error('必须先拥立新君');
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
  if (order.officerIds.length > BATTLE_SIDE_LIMIT) throw new Error(`At most ${BATTLE_SIDE_LIMIT} attacking officers are allowed`);
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
    .sort((a, b) => b.troops - a.troops || b.leadership - a.leadership || a.id.localeCompare(b.id));

  return { source, target, attackers, defenders };
}

export function createBattleStateGuard(state: GameState, context: AttackContext): BattleStateGuard {
  const guardedOfficers = Object.values(state.officers).filter(
    (officer) => officer.status === 'serving'
      && (officer.cityId === context.source.id || officer.cityId === context.target.id),
  );
  return {
    version: 2,
    strategicFingerprint: createBattleStrategicFingerprint(state),
    sourceCityId: context.source.id,
    targetCityId: context.target.id,
    sourceFood: context.source.food,
    targetFood: context.target.food,
    targetDefense: context.target.defense,
    targetReserveTroops: context.target.reserveTroops,
    participants: guardedOfficers
      .map((officer) => createParticipantSnapshot(state, officer))
      .sort((a, b) => a.officerId.localeCompare(b.officerId)),
  };
}

export function assertBattleStateGuard(state: GameState, guard: BattleStateGuard): void {
  const currentParticipantIds = Object.values(state.officers)
    .filter((officer) => officer.status === 'serving'
      && (officer.cityId === guard.sourceCityId || officer.cityId === guard.targetCityId))
    .map((officer) => officer.id)
    .sort();
  const guardedParticipantIds = guard.participants.map((participant) => participant.officerId);
  const participantsAreCurrent = guard.participants.every((snapshot) => {
    const officer = state.officers[snapshot.officerId];
    return officer && participantSnapshotsMatch(createParticipantSnapshot(state, officer), snapshot);
  });
  if (!participantsAreCurrent || currentParticipantIds.join('\0') !== guardedParticipantIds.join('\0')) {
    throw new Error('Battle result references stale participant state');
  }

  const source = state.cities[guard.sourceCityId];
  if (!source || source.food !== guard.sourceFood) {
    throw new Error('Battle result references stale source resources');
  }

  const target = state.cities[guard.targetCityId];
  if (
    !target
    || target.food !== guard.targetFood
    || target.defense !== guard.targetDefense
    || target.reserveTroops !== guard.targetReserveTroops
  ) {
    throw new Error('Battle result references stale target resources');
  }
  if (guard.version !== 2 || guard.strategicFingerprint !== createBattleStrategicFingerprint(state)) {
    throw new Error('Battle result references stale strategic state');
  }
}

export function createBattleStrategicFingerprint(state: GameState): string {
  // A tactical session freezes the strategic layer. Hashing the complete
  // canonical state except presentation-only logs closes gaps around captives,
  // rulers, equipment, policies and in-flight orders without maintaining an
  // error-prone second allowlist.
  const { logs: _logs, ...guardedState } = state;
  return fnv1a(stableSerialize(guardedState));
}

function createParticipantSnapshot(state: GameState, officer: Officer): BattleParticipantSnapshot {
  const armsType = state.armsTypes[officer.armsTypeId];
  if (!armsType) throw new Error(`Unknown arms type: ${officer.armsTypeId}`);
  const items = getOfficerEquipment(state, officer);
  return {
    officerId: officer.id,
    cityId: officer.cityId,
    factionId: officer.factionId,
    status: officer.status,
    troops: officer.troops,
    stamina: officer.stamina,
    force: officer.force,
    intelligence: officer.intelligence,
    leadership: officer.leadership,
    level: officer.level ?? 1,
    experience: officer.experience ?? 0,
    armsTypeId: officer.armsTypeId,
    equipmentKey: getOfficerEquipmentIds(officer).join('\0'),
    armsAttackModifier: armsType.attackModifier,
    armsDefenseModifier: armsType.defenseModifier,
    armsMobility: armsType.mobility,
    itemForceBonus: items.reduce((sum, item) => sum + (item?.forceBonus ?? 0), 0),
    itemIntelligenceBonus: items.reduce((sum, item) => sum + (item?.intelligenceBonus ?? 0), 0),
    itemMoveBonus: items.reduce((sum, item) => sum + (item?.moveBonus ?? 0), 0),
  };
}

function participantSnapshotsMatch(
  current: BattleParticipantSnapshot,
  guarded: BattleParticipantSnapshot,
): boolean {
  return Object.keys(guarded).every((key) => (
    current[key as keyof BattleParticipantSnapshot] === guarded[key as keyof BattleParticipantSnapshot]
  ));
}

function assertBattleResultConsistency(result: BattleResult): void {
  if (result.battleId.length === 0) throw new Error('Battle result is missing its identity');
  if (result.cityCaptured !== (result.winner === 'attacker')) {
    throw new Error('Battle result winner and city ownership disagree');
  }
  if (!Number.isSafeInteger(result.provisions) || result.provisions <= 0) {
    throw new Error('Battle result provisions are invalid');
  }
  if (
    !Number.isSafeInteger(result.defenderReserveLosses)
    || result.defenderReserveLosses < 0
    || result.defenderReserveLosses > result.guard.targetReserveTroops
  ) {
    throw new Error('Battle result reserve losses are invalid');
  }
  const participantIds = new Set([
    ...result.attackerOfficerIds,
    ...result.defenderOfficerIds,
  ]);
  if (
    new Set(result.attackerOfficerIds).size !== result.attackerOfficerIds.length
    || new Set(result.defenderOfficerIds).size !== result.defenderOfficerIds.length
  ) {
    throw new Error('Battle result contains duplicate participants');
  }
  for (const officerId of participantIds) {
    const losses = result.casualties[officerId];
    const snapshot = result.guard.participants.find((participant) => participant.officerId === officerId);
    if (!snapshot || !Number.isSafeInteger(losses) || losses < 0 || losses > snapshot.troops) {
      throw new Error(`Battle result casualties are invalid for ${officerId}`);
    }
  }
  for (const officerId of Object.keys(result.casualties)) {
    if (!participantIds.has(officerId)) throw new Error(`Battle result contains an unknown casualty: ${officerId}`);
  }
  if (result.experienceGainOrder !== undefined) {
    const gainIds = Object.keys(result.experienceGains ?? {});
    if (
      new Set(result.experienceGainOrder).size !== result.experienceGainOrder.length
      || result.experienceGainOrder.some((officerId) => !gainIds.includes(officerId))
      || gainIds.some((officerId) => !result.experienceGainOrder!.includes(officerId))
    ) {
      throw new Error('Battle result experience order is invalid');
    }
  }
  if (
    result.targetFoodAfter !== undefined
    && (!Number.isSafeInteger(result.targetFoodAfter) || result.targetFoodAfter < 0)
  ) {
    throw new Error('Battle result target food is invalid');
  }
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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
    const items = getOfficerEquipment(state, officer);
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

function compareBattleCities(
  left: GameState['cities'][string],
  right: GameState['cities'][string],
): number {
  return (left.sourceIndex ?? Number.MAX_SAFE_INTEGER) - (right.sourceIndex ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id);
}
