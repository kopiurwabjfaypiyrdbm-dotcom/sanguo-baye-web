import { appendLogs } from './logs';
import { nextRandom } from './random';
import { updateCitySatraps } from './administration';
import { creditStrategicCargoAcrossCities, formatStrategicCargo } from './strategicOrderCargo';
import { getEffectiveOfficerAttributes, getOfficerEquipmentIds } from './equipment';
import type {
  GameState,
  LifecyclePolicy,
  Officer,
  OfficerDeathCause,
  PendingSuccession,
  StrategicOrder,
} from './types';
import { assertValidGameState } from './validation';
import {
  applyBayeConfiscationLoyalty,
  rollBayeBanishDestination,
} from '../compat/baye/officerLifecycle';
import { evaluateOutcome } from './outcome';

export type OfficerDeathInput = {
  officerId: string;
  cause: OfficerDeathCause;
  cityId?: string;
  responsibleFactionId?: string;
};

export type BanishOfficerInput = {
  cityId: string;
  officerId: string;
};

export type ConfiscateEquipmentInput = {
  cityId: string;
  officerId: string;
  itemId: string;
};

export type CaptureOfficerInput = {
  officerId: string;
  captorFactionId: string;
  cityId: string;
};

export const SAFE_LIFECYCLE_POLICY: LifecyclePolicy = {
  version: 1,
  ageGrowth: 'enabled',
  naturalDeath: 'disabled',
  battleDeath: 'disabled',
  captiveEscape: 'disabled',
};

export function configureLifecyclePolicy(state: GameState, policy: LifecyclePolicy): GameState {
  if (state.campaignStarted) throw new Error('战役开始后不能更改人物生命周期规则');
  const next = { ...state, lifecyclePolicy: { ...policy } };
  assertValidGameState(next);
  return next;
}

export function executeCaptive(
  state: GameState,
  input: { cityId: string; captiveOfficerId: string },
): GameState {
  if (state.phase === 'ended') throw new Error('战役已经结束');
  if (state.pendingSuccession) throw new Error('必须先拥立新君');
  const city = state.cities[input.cityId];
  const captive = state.officers[input.captiveOfficerId];
  if (!city || city.ownerId !== state.activeFactionId) throw new Error('只能处置己方城池中的俘虏');
  if (!captive || captive.status !== 'captive' || captive.cityId !== city.id
    || captive.captorFactionId !== state.activeFactionId) {
    throw new Error('目标不是该城俘虏');
  }

  const random = nextRandom(state.rngSeed);
  const next = killOfficer({ ...state, rngSeed: random.seed }, {
    officerId: captive.id,
    cause: 'execution',
    cityId: city.id,
    responsibleFactionId: state.activeFactionId,
  });
  return finalizeLifecycle(next, [`处斩${captive.name}；其装备由${city.name}收存。`]);
}

export function captureOfficer(state: GameState, input: CaptureOfficerInput): GameState {
  const officer = state.officers[input.officerId];
  const city = state.cities[input.cityId];
  if (!officer || officer.status !== 'serving') throw new Error('只有在职人物可以被俘');
  if (!city || city.ownerId !== input.captorFactionId) throw new Error('俘虏必须关押在俘获方城池');
  if (officer.factionId === input.captorFactionId) throw new Error('不能俘虏己方人物');
  const formerFactionId = officer.factionId;
  let next = cancelOfficerOrders(state, officer.id);
  next = {
    ...next,
    actedOfficerIds: next.actedOfficerIds.filter((officerId) => officerId !== officer.id),
    discoveredOfficerIds: next.discoveredOfficerIds.filter((officerId) => officerId !== officer.id),
    officers: {
      ...next.officers,
      [officer.id]: {
        ...next.officers[officer.id],
        status: 'captive',
        factionId: getNeutralFactionId(next),
        captorFactionId: input.captorFactionId,
        formerFactionId,
        cityId: city.id,
        troops: 0,
        stamina: 0,
        death: undefined,
      },
    },
  };
  if (state.factions[formerFactionId]?.rulerOfficerId === officer.id) {
    next = handleRulerLoss(next, formerFactionId, officer.id, 'capture');
  }
  return updateCitySatraps(next);
}

export function banishOfficer(state: GameState, input: BanishOfficerInput): GameState {
  if (state.phase === 'ended') throw new Error('战役已经结束');
  if (state.pendingSuccession) throw new Error('必须先拥立新君');
  const city = state.cities[input.cityId];
  const officer = state.officers[input.officerId];
  if (!city || city.ownerId !== state.activeFactionId) throw new Error('只能从己方城池流放人物');
  const isLocalServing = officer?.status === 'serving'
    && officer.factionId === state.activeFactionId
    && officer.cityId === city.id;
  const isLocalCaptive = officer?.status === 'captive'
    && officer.captorFactionId === state.activeFactionId
    && officer.cityId === city.id;
  if (!officer || (!isLocalServing && !isLocalCaptive)) throw new Error('目标不在该城或身份不允许流放');
  if (isLocalServing && state.factions[state.activeFactionId].rulerOfficerId === officer.id) {
    throw new Error('不能流放当前君主');
  }

  const neutralFactionId = getNeutralFactionId(state);
  const orderedCities = Object.values(state.cities).sort(compareCity);
  const random = rollBayeBanishDestination(state.rngSeed, orderedCities.length);
  const destination = orderedCities[random.destinationIndex];
  if (!destination) throw new Error('没有可供流放的城市');

  let next = cancelOfficerOrders({ ...state, rngSeed: random.seed }, officer.id);
  next = {
    ...next,
    campaignStarted: true,
    actedOfficerIds: next.actedOfficerIds.filter((officerId) => officerId !== officer.id),
    discoveredOfficerIds: next.discoveredOfficerIds.includes(officer.id)
      ? next.discoveredOfficerIds
      : [...next.discoveredOfficerIds, officer.id],
    officers: {
      ...next.officers,
      [officer.id]: {
        ...next.officers[officer.id],
        status: 'free',
        factionId: neutralFactionId,
        captorFactionId: undefined,
        formerFactionId: undefined,
        cityId: destination.id,
        troops: 0,
        stamina: 0,
        death: undefined,
      },
    },
  };
  return finalizeLifecycle(next, [`流放${officer.name}，其流落至${destination.name}。`]);
}

export function confiscateOfficerEquipment(state: GameState, input: ConfiscateEquipmentInput): GameState {
  if (state.phase === 'ended') throw new Error('战役已经结束');
  if (state.pendingSuccession) throw new Error('必须先拥立新君');
  const city = state.cities[input.cityId];
  const officer = state.officers[input.officerId];
  if (!city || city.ownerId !== state.activeFactionId) throw new Error('只能在己方城池没收装备');
  if (!officer || officer.status !== 'serving' || officer.factionId !== state.activeFactionId
    || officer.cityId !== city.id) {
    throw new Error('待没收装备的武将不在该城');
  }
  const equipmentItemIds = getOfficerEquipmentIds(officer);
  if (!equipmentItemIds.includes(input.itemId)) throw new Error('该武将没有指定装备');
  const item = state.items[input.itemId];
  if (!item) throw new Error('指定装备不存在');

  const isPlayerRuler = officer.id === state.factions[state.playerFactionId].rulerOfficerId;
  const random = isPlayerRuler ? undefined : nextRandom(state.rngSeed);
  const next = {
    ...state,
    campaignStarted: true,
    rngSeed: random?.seed ?? state.rngSeed,
    cities: {
      ...state.cities,
      [city.id]: {
        ...city,
        itemIds: [...(city.itemIds ?? []), input.itemId],
      },
    },
    officers: {
      ...state.officers,
      [officer.id]: {
        ...officer,
        loyalty: applyBayeConfiscationLoyalty(officer.loyalty, isPlayerRuler),
        equipmentItemIds: equipmentItemIds.filter((itemId) => itemId !== input.itemId),
      },
    },
  };
  return finalizeLifecycle(next, [
    `没收${officer.name}的${item.name}，装备收入${city.name}`
      + `${isPlayerRuler ? '。' : `；忠诚降至 ${next.officers[officer.id].loyalty}。`}`,
  ]);
}

export function killOfficer(state: GameState, input: OfficerDeathInput): GameState {
  const officer = state.officers[input.officerId];
  if (!officer || officer.status === 'dead') throw new Error('目标人物不存在或已经死亡');
  const neutralFactionId = getNeutralFactionId(state);
  const formerFactionId = officer.status === 'captive' ? officer.formerFactionId : officer.factionId;
  const recoveryCity = selectRecoveryCity(state, officer, input.cityId);
  let next = cancelOfficerOrders(state, officer.id);
  const equipmentItemIds = getOfficerEquipmentIds(next.officers[officer.id]);
  const cities = { ...next.cities };
  if (equipmentItemIds.length > 0) {
    if (!recoveryCity) throw new Error(`无法安置${officer.name}遗留的装备`);
    cities[recoveryCity.id] = {
      ...cities[recoveryCity.id],
      itemIds: [...(cities[recoveryCity.id].itemIds ?? []), ...equipmentItemIds],
    };
  }
  next = {
    ...next,
    campaignStarted: true,
    cities,
    actedOfficerIds: next.actedOfficerIds.filter((officerId) => officerId !== officer.id),
    discoveredOfficerIds: next.discoveredOfficerIds.filter((officerId) => officerId !== officer.id),
    officers: {
      ...next.officers,
      [officer.id]: {
        ...next.officers[officer.id],
        status: 'dead',
        factionId: neutralFactionId,
        captorFactionId: undefined,
        formerFactionId: undefined,
        cityId: undefined,
        troops: 0,
        stamina: 0,
        equipmentItemIds: [],
        death: {
          cause: input.cause,
          turn: state.turn,
          year: state.calendar.year,
          month: state.calendar.month,
          cityId: recoveryCity?.id,
          responsibleFactionId: input.responsibleFactionId,
        },
      },
    },
  };

  if (formerFactionId && state.factions[formerFactionId]?.rulerOfficerId === officer.id) {
    next = handleRulerLoss(next, formerFactionId, officer.id, input.cause);
  }
  return updateCitySatraps(next);
}

export function resolveSuccession(state: GameState, successorOfficerId: string): GameState {
  const pending = state.pendingSuccession;
  if (!pending || state.phase !== 'succession') throw new Error('当前没有待处理的君主继承');
  if (!pending.candidateOfficerIds.includes(successorOfficerId)) throw new Error('所选人物不是合法继承候选');
  const successor = state.officers[successorOfficerId];
  if (!successor || successor.status !== 'serving' || successor.factionId !== pending.factionId) {
    throw new Error('继承候选的状态已经失效');
  }
  const faction = state.factions[pending.factionId];
  const next = evaluateOutcome(updateCitySatraps(appendLogs({
    ...state,
    phase: pending.resumePhase,
    activeFactionId: pending.resumeActiveFactionId,
    pendingSuccession: undefined,
    factions: {
      ...state.factions,
      [faction.id]: { ...faction, rulerOfficerId: successor.id },
    },
    officers: {
      ...state.officers,
      [successor.id]: { ...successor, loyalty: 100 },
    },
  }, 'system', [`${successor.name}被拥立为${faction.name}新君。`])));
  assertValidGameState(next);
  return next;
}

export function settleNaturalDeaths(state: GameState): GameState {
  if (state.lifecyclePolicy.naturalDeath === 'disabled' || state.calendar.month !== 1) return state;
  let seed = state.rngSeed;
  const selected = new Set<string>();
  for (const officer of Object.values(state.officers).sort(compareOfficer)) {
    if (!['serving', 'free', 'captive'].includes(officer.status) || officer.age < 90) continue;
    const random = nextRandom(seed);
    seed = random.seed;
    if (Math.floor(random.value * 100) < 50) selected.add(officer.id);
  }
  if (selected.size === 0) return { ...state, rngSeed: seed };

  const rulerIds = new Set(Object.values(state.factions).map((faction) => faction.rulerOfficerId));
  const orderedDeaths = [...selected].sort((left, right) =>
    Number(rulerIds.has(left)) - Number(rulerIds.has(right))
      || compareOfficer(state.officers[left], state.officers[right]));
  let next = { ...state, rngSeed: seed };
  const messages: string[] = [];
  for (const officerId of orderedDeaths) {
    const officer = next.officers[officerId];
    if (!officer || officer.status === 'dead') continue;
    next = killOfficer(next, {
      officerId,
      cause: 'natural-death',
      cityId: officer.cityId,
    });
    messages.push(`${officer.name}年迈病逝。`);
  }
  return appendLogs(next, 'turn', messages);
}

export function settleCaptiveEscapes(state: GameState): GameState {
  if (state.lifecyclePolicy.captiveEscape === 'disabled') return state;
  let seed = state.rngSeed;
  let officers = { ...state.officers };
  const messages: string[] = [];
  for (const captive of Object.values(state.officers).filter(
    (officer) => officer.status === 'captive',
  ).sort(compareOfficer)) {
    const chance = Math.min(25, 5 + Math.floor(captive.intelligence / 10));
    const escapeRoll = nextRandom(seed);
    seed = escapeRoll.seed;
    if (Math.floor(escapeRoll.value * 100) >= chance) continue;
    const formerCities = Object.values(state.cities)
      .filter((city) => city.ownerId === captive.formerFactionId)
      .sort(compareCity);
    if (formerCities.length > 0 && captive.formerFactionId) {
      const destinationRoll = nextRandom(seed);
      seed = destinationRoll.seed;
      const destination = formerCities[Math.floor(destinationRoll.value * formerCities.length)];
      officers[captive.id] = {
        ...captive,
        status: 'serving',
        factionId: captive.formerFactionId,
        captorFactionId: undefined,
        formerFactionId: undefined,
        cityId: destination.id,
        troops: 0,
        stamina: 0,
      };
      messages.push(`${captive.name}逃离囚禁，返回${destination.name}。`);
    } else {
      officers[captive.id] = {
        ...captive,
        status: 'free',
        factionId: getNeutralFactionId(state),
        captorFactionId: undefined,
        formerFactionId: undefined,
        troops: 0,
        stamina: 0,
      };
      messages.push(`${captive.name}逃离囚禁，暂在${state.cities[captive.cityId!].name}隐居。`);
    }
  }
  const next = { ...state, rngSeed: seed, officers };
  return messages.length > 0 ? appendLogs(next, 'turn', messages) : next;
}

function handleRulerLoss(
  state: GameState,
  factionId: string,
  formerRulerOfficerId: string,
  reason: PendingSuccession['reason'],
): GameState {
  const ownsCity = Object.values(state.cities).some((city) => city.ownerId === factionId);
  if (!ownsCity) return state;
  const candidates = Object.values(state.officers)
    .filter((officer) => officer.status === 'serving' && officer.factionId === factionId)
    .sort((left, right) => compareSuccessionCandidates(state, left, right));
  if (candidates.length === 0) return dissolveFaction(state, factionId, formerRulerOfficerId);

  if (factionId === state.playerFactionId) {
    return {
      ...state,
      phase: 'succession',
      activeFactionId: state.playerFactionId,
      pendingSuccession: {
        version: 1,
        factionId,
        formerRulerOfficerId,
        candidateOfficerIds: candidates.map((candidate) => candidate.id),
        reason,
        createdTurn: state.turn,
        createdYear: state.calendar.year,
        createdMonth: state.calendar.month,
        resumePhase: state.phase === 'ai' ? 'ai' : 'player',
        resumeActiveFactionId: state.activeFactionId,
        resumeAiFactionIndex: state.phase === 'ai'
          ? state.factionOrder.indexOf(state.activeFactionId) + 1
          : undefined,
      },
    };
  }

  const successor = candidates[0];
  return appendLogs({
    ...state,
    factions: {
      ...state.factions,
      [factionId]: { ...state.factions[factionId], rulerOfficerId: successor.id },
    },
    officers: {
      ...state.officers,
      [successor.id]: { ...successor, loyalty: 100 },
    },
  }, 'turn', [`${successor.name}继任${state.factions[factionId].name}君主。`]);
}

function dissolveFaction(state: GameState, factionId: string, formerRulerOfficerId: string): GameState {
  const neutralFactionId = getNeutralFactionId(state);
  let next = cancelFactionOrders(state, factionId);
  const cities = Object.fromEntries(Object.values(next.cities).map((city) => [
    city.id,
    city.ownerId === factionId
      ? { ...city, ownerId: neutralFactionId, satrapOfficerId: undefined }
      : city,
  ]));
  const officers = Object.fromEntries(Object.values(next.officers).map((officer) => {
    if (officer.status === 'serving' && officer.factionId === factionId) {
      return [officer.id, {
        ...officer,
        status: 'free' as const,
        factionId: neutralFactionId,
        troops: 0,
        stamina: 0,
      }];
    }
    if (officer.status === 'captive' && officer.captorFactionId === factionId) {
      return [officer.id, {
        ...officer,
        status: 'free' as const,
        factionId: neutralFactionId,
        captorFactionId: undefined,
        formerFactionId: undefined,
        troops: 0,
        stamina: 0,
      }];
    }
    return [officer.id, officer];
  }));
  next = appendLogs({
    ...next,
    cities,
    officers,
    pendingSuccession: next.pendingSuccession?.factionId === factionId ? undefined : next.pendingSuccession,
    ...(factionId === next.playerFactionId
      ? { phase: 'ended' as const, activeFactionId: next.playerFactionId, outcome: 'defeat' as const }
      : {}),
  }, 'system', [
    `${state.factions[factionId].name}在${state.officers[formerRulerOfficerId].name}失效后无人可继，势力瓦解。`,
  ]);
  return updateCitySatraps(next);
}

export function cancelOfficerOrders(state: GameState, officerId: string): GameState {
  const cities = { ...state.cities };
  const officers = { ...state.officers };
  const messages: string[] = [];
  const strategicOrders: GameState['strategicOrders'] = {};
  for (const order of Object.values(state.strategicOrders)) {
    if (order.officerId !== officerId) {
      strategicOrders[order.id] = order;
      continue;
    }
    if (order.kind === 'transport') {
      const destinations = settleTransportCargo(cities, state, order);
      messages.push(`${order.id}因执行者失效而终止，${formatStrategicCargo(order.cargo)}由${destinations.join('、')}接收。`);
    } else {
      messages.push(`${order.id}因执行者失效而终止。`);
    }
    const executor = officers[order.officerId];
    const destination = state.cities[order.sourceCityId]?.ownerId === order.factionId
      ? state.cities[order.sourceCityId]
      : state.cities[order.targetCityId]?.ownerId === order.factionId
        ? state.cities[order.targetCityId]
        : Object.values(state.cities).filter((city) => city.ownerId === order.factionId).sort(compareCity)[0];
    if (executor?.status === 'serving' && !executor.cityId && destination) {
      officers[executor.id] = { ...executor, cityId: destination.id };
    }
  }

  const diplomaticOrders: GameState['diplomaticOrders'] = {};
  for (const order of Object.values(state.diplomaticOrders)) {
    if (order.officerId === officerId) {
      messages.push(`${order.id}因执行者失效而终止。`);
      continue;
    }
    if (order.targetOfficerId !== officerId) {
      diplomaticOrders[order.id] = order;
      continue;
    }
    const executor = officers[order.officerId];
    const destination = state.cities[order.sourceCityId]?.ownerId === order.factionId
      ? state.cities[order.sourceCityId]
      : Object.values(state.cities).filter((city) => city.ownerId === order.factionId).sort(compareCity)[0];
    if (executor?.status === 'serving' && !executor.cityId && destination) {
      officers[executor.id] = { ...executor, cityId: destination.id };
    }
    messages.push(`${order.id}因目标失效而终止。`);
  }
  const next = { ...state, cities, officers, strategicOrders, diplomaticOrders };
  return messages.length > 0 ? appendLogs(next, 'turn', messages) : next;
}

function cancelFactionOrders(state: GameState, factionId: string): GameState {
  let next = state;
  const officerIds = new Set([
    ...Object.values(state.officers)
      .filter((officer) =>
        (officer.status === 'serving' && officer.factionId === factionId)
        || (officer.status === 'captive' && officer.captorFactionId === factionId))
      .map((officer) => officer.id),
    ...Object.values(state.strategicOrders).filter((order) => order.factionId === factionId).map((order) => order.officerId),
    ...Object.values(state.diplomaticOrders).filter((order) => order.factionId === factionId).map((order) => order.officerId),
  ]);
  for (const officerId of officerIds) next = cancelOfficerOrders(next, officerId);
  return next;
}

function settleTransportCargo(
  cities: GameState['cities'],
  state: GameState,
  order: StrategicOrder,
): string[] {
  const candidates = [
    state.cities[order.sourceCityId],
    state.cities[order.targetCityId],
    ...Object.values(state.cities).filter((city) => city.ownerId === order.factionId).sort(compareCity),
    ...Object.values(state.cities).sort(compareCity),
  ].filter((city): city is GameState['cities'][string] => Boolean(city));
  return creditStrategicCargoAcrossCities(cities, candidates, order.cargo)
    .map((cityId) => cities[cityId].name);
}

function selectRecoveryCity(state: GameState, officer: Officer, preferredCityId?: string) {
  if (preferredCityId && state.cities[preferredCityId]) return state.cities[preferredCityId];
  if (officer.cityId && state.cities[officer.cityId]) return state.cities[officer.cityId];
  return Object.values(state.cities)
    .filter((city) => city.ownerId === officer.factionId || city.ownerId === officer.captorFactionId)
    .sort(compareCity)[0]
    ?? Object.values(state.cities).sort(compareCity)[0];
}

function getNeutralFactionId(state: GameState): string {
  const neutral = Object.values(state.factions).find((faction) => faction.isNeutral);
  if (!neutral) throw new Error('人物生命周期需要无所属势力');
  return neutral.id;
}

function finalizeLifecycle(state: GameState, messages: string[]): GameState {
  const next = appendLogs(updateCitySatraps(state), 'map', messages);
  assertValidGameState(next);
  return next;
}

function compareOfficer(left: Officer, right: Officer): number {
  return (left.sourceId ?? Number.MAX_SAFE_INTEGER) - (right.sourceId ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id);
}

function compareSuccessionCandidates(state: GameState, left: Officer, right: Officer): number {
  return getEffectiveOfficerAttributes(state, right).intelligence
    - getEffectiveOfficerAttributes(state, left).intelligence
    || right.loyalty - left.loyalty
    || right.leadership - left.leadership
    || compareOfficer(left, right);
}

function compareCity(
  left: GameState['cities'][string],
  right: GameState['cities'][string],
): number {
  return (left.sourceIndex ?? Number.MAX_SAFE_INTEGER) - (right.sourceIndex ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id);
}
