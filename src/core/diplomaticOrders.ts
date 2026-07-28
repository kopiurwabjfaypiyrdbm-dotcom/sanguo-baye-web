import { rollBayeDiplomacy } from '../compat/baye/diplomacy';
import { releaseLandlessFactionOfficers, updateCitySatraps } from './administration';
import { appendLogs } from './logs';
import { getEffectiveOfficerAttributes } from './equipment';
import type {
  DiplomaticOrder,
  DiplomaticOrderKind,
  Faction,
  GameState,
  Officer,
} from './types';
import { assertValidGameState } from './validation';
import { getCampaignCommandCost } from './rulesets';

export const DIPLOMACY_STAMINA_COST = 4;
/** The runtime stamina and money tables are not vendored; both costs are provisional. */
export const DIPLOMACY_MONEY_COST = 50;
/** Original Make functions write TimeCount=10; this modern month loop resolves after one month. */
export const DIPLOMACY_DURATION_MONTHS = 1;

export type DiplomaticOrderInput = {
  kind: DiplomaticOrderKind;
  sourceCityId: string;
  officerId: string;
  targetOfficerId: string;
};

export type DiplomaticAvailability =
  | { allowed: true; targetCityId: string; targetFactionId: string }
  | { allowed: false; reason: string };

const KIND_LABELS: Record<DiplomaticOrderKind, string> = {
  alienate: '离间',
  canvass: '招揽',
  counterespionage: '策反',
  induce: '劝降',
};

export function getOfficerDiplomaticOrder(state: GameState, officerId: string): DiplomaticOrder | undefined {
  return Object.values(state.diplomaticOrders).find((order) => order.officerId === officerId);
}

export function getFactionDiplomaticOrders(state: GameState, factionId: string): DiplomaticOrder[] {
  return Object.values(state.diplomaticOrders)
    .filter((order) => order.factionId === factionId)
    .sort(compareDiplomaticOrders);
}

export function hasActiveCampaignOrder(state: GameState, officerId: string): boolean {
  return Object.values(state.strategicOrders).some((order) => order.officerId === officerId)
    || Object.values(state.diplomaticOrders).some((order) => order.officerId === officerId);
}

export function getDiplomacyTargets(
  state: GameState,
  kind: DiplomaticOrderKind,
  factionId = state.activeFactionId,
): Officer[] {
  return Object.values(state.officers)
    .filter((target) => isLegalTarget(state, kind, factionId, target, true))
    // The player-facing target list must not reveal hidden loyalty or IQ
    // through its ordering. AI preference is applied separately in ai.ts.
    .sort((left, right) =>
      (state.cities[left.cityId!]?.sourceIndex ?? Number.MAX_SAFE_INTEGER)
        - (state.cities[right.cityId!]?.sourceIndex ?? Number.MAX_SAFE_INTEGER)
      || (left.sourceId ?? Number.MAX_SAFE_INTEGER) - (right.sourceId ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id));
}

export function getDiplomaticOrderAvailability(
  state: GameState,
  input: DiplomaticOrderInput,
): DiplomaticAvailability {
  const cost = getCampaignCommandCost(state.rulesetId, input.kind);
  if (state.phase === 'ended') return { allowed: false, reason: '战役已经结束' };
  if (state.pendingSuccession) return { allowed: false, reason: '必须先拥立新君' };
  if (!Number.isSafeInteger(state.nextDiplomaticOrderSerial)
    || state.nextDiplomaticOrderSerial >= Number.MAX_SAFE_INTEGER) {
    return { allowed: false, reason: '谋略命令序号已经耗尽' };
  }
  const label = KIND_LABELS[input.kind];
  const source = state.cities[input.sourceCityId];
  if (!source || source.ownerId !== state.activeFactionId) {
    return { allowed: false, reason: `只能从己方城池执行${label}` };
  }
  const executor = state.officers[input.officerId];
  if (!executor || executor.status !== 'serving'
    || executor.factionId !== state.activeFactionId || executor.cityId !== source.id) {
    return { allowed: false, reason: `执行${label}的武将不在出发城` };
  }
  if (hasActiveCampaignOrder(state, executor.id)) return { allowed: false, reason: '该武将已有执行中的命令' };
  if (state.actedOfficerIds.includes(executor.id)) return { allowed: false, reason: '该武将本月已经执行过命令' };
  if (executor.stamina < cost.stamina) {
    return { allowed: false, reason: `${label}需要至少 ${cost.stamina} 点体力` };
  }
  if (source.money < cost.money) {
    return { allowed: false, reason: `${label}需要 ${cost.money} 金` };
  }
  const target = state.officers[input.targetOfficerId];
  if (!target || !isLegalTarget(state, input.kind, state.activeFactionId, target, true)) {
    return { allowed: false, reason: `${label}目标无效或情报已经过期` };
  }
  if (input.kind === 'induce' && !hasInduceDominance(state, state.activeFactionId, target.factionId)) {
    return { allowed: false, reason: '我方城池数尚未达到目标势力的两倍' };
  }
  return { allowed: true, targetCityId: target.cityId!, targetFactionId: target.factionId };
}

export function issueDiplomaticOrder(state: GameState, input: DiplomaticOrderInput): GameState {
  const cost = getCampaignCommandCost(state.rulesetId, input.kind);
  const availability = getDiplomaticOrderAvailability(state, input);
  if (!availability.allowed) throw new Error(availability.reason);
  const source = state.cities[input.sourceCityId];
  const executor = state.officers[input.officerId];
  const target = state.officers[input.targetOfficerId];
  let serial = state.nextDiplomaticOrderSerial;
  while (state.diplomaticOrders[`diplomatic-order-${serial}`]) serial += 1;
  const id = `diplomatic-order-${serial}`;
  const order: DiplomaticOrder = {
    id,
    kind: input.kind,
    factionId: state.activeFactionId,
    officerId: executor.id,
    sourceCityId: source.id,
    targetOfficerId: target.id,
    targetFactionId: availability.targetFactionId,
    targetCityId: availability.targetCityId,
    createdTurn: state.turn,
    createdYear: state.calendar.year,
    createdMonth: state.calendar.month,
    durationMonths: DIPLOMACY_DURATION_MONTHS,
    remainingMonths: DIPLOMACY_DURATION_MONTHS,
    moneyCost: cost.money,
  };
  let next = updateCitySatraps({
    ...state,
    campaignStarted: true,
    diplomaticOrders: { ...state.diplomaticOrders, [id]: order },
    nextDiplomaticOrderSerial: serial + 1,
    cities: { ...state.cities, [source.id]: { ...source, money: source.money - cost.money } },
    officers: {
      ...state.officers,
      [executor.id]: {
        ...executor,
        cityId: undefined,
        stamina: executor.stamina - cost.stamina,
      },
    },
    actedOfficerIds: [...state.actedOfficerIds, executor.id],
  });
  next = appendLogs(next, visibleLogKind(next, order), [
    visibleOrderMessage(next, order, `${executor.name}奉命对${target.name}执行${KIND_LABELS[order.kind]}，预计下月回报。`),
  ]);
  assertValidGameState(next);
  return next;
}

export function advanceDiplomaticOrders(
  state: GameState,
  options: { deferValidation?: boolean } = {},
): GameState {
  if (Object.keys(state.diplomaticOrders).length === 0) return state;
  let next = {
    ...state,
    diplomaticOrders: { ...state.diplomaticOrders },
    cities: { ...state.cities },
    officers: { ...state.officers },
    factions: { ...state.factions },
    factionOrder: [...state.factionOrder],
  };
  const messages: Array<{ order: DiplomaticOrder; message: string }> = [];

  for (const order of Object.values(state.diplomaticOrders).sort(compareDiplomaticOrders)) {
    if (order.remainingMonths > 1) {
      next.diplomaticOrders[order.id] = { ...order, remainingMonths: order.remainingMonths - 1 };
      continue;
    }
    delete next.diplomaticOrders[order.id];
    const executor = next.officers[order.officerId];
    if (!executor || executor.status !== 'serving' || executor.factionId !== order.factionId) {
      messages.push({ order, message: `${order.id}因执行武将状态变化而失效。` });
      continue;
    }

    const returnCity = preferredReturnCity(next, order);
    if (!returnCity) {
      next = releaseExecutor(next, executor, order);
      messages.push({ order, message: `${executor.name}因所属势力失去全部城池，${KIND_LABELS[order.kind]}中止并转为在野。` });
      continue;
    }
    next.officers[executor.id] = { ...executor, cityId: returnCity.id };

    const target = next.officers[order.targetOfficerId];
    if (!target || !isLegalTarget(next, order.kind, order.factionId, target, false)
      || target.factionId !== order.targetFactionId || target.cityId !== order.targetCityId) {
      messages.push({ order, message: `${executor.name}返回${returnCity.name}：${KIND_LABELS[order.kind]}目标已经失效。` });
      continue;
    }
    if (order.kind === 'induce' && !hasInduceDominance(next, order.factionId, order.targetFactionId)) {
      messages.push({ order, message: `${executor.name}返回${returnCity.name}：势力差距不足，劝降未能展开。` });
      continue;
    }

    const roll = rollBayeDiplomacy(
      order.kind,
      { intelligence: getEffectiveOfficerAttributes(next, executor).intelligence },
      {
        intelligence: getEffectiveOfficerAttributes(next, target).intelligence,
        loyalty: target.loyalty,
        character: target.character,
      },
      next.rngSeed,
      { playerIssuer: order.factionId === next.playerFactionId },
    );
    next.rngSeed = roll.seed;
    if (!roll.success) {
      messages.push({ order, message: `${executor.name}返回${returnCity.name}：对${target.name}的${KIND_LABELS[order.kind]}失败。` });
      continue;
    }

    if (order.kind === 'alienate') {
      next.officers[target.id] = { ...target, loyalty: Math.max(0, target.loyalty - 4) };
      messages.push({
        order,
        message: `${executor.name}成功离间${target.name}，其忠诚由 ${target.loyalty} 降至 ${Math.max(0, target.loyalty - 4)}。`,
      });
    } else if (order.kind === 'canvass') {
      next.officers[target.id] = {
        ...target,
        factionId: order.factionId,
        cityId: returnCity.id,
        loyalty: roll.recruitedLoyalty ?? 40,
      };
      next = updateCitySatraps(next);
      messages.push({ order, message: `${target.name}接受${executor.name}招揽，转投${next.factions[order.factionId].name}。` });
    } else if (order.kind === 'counterespionage') {
      next = establishRebelFaction(next, target, order.targetFactionId);
      messages.push({ order, message: `策反成功：${target.name}在${next.cities[target.cityId!].name}起兵自立，脱离${state.factions[order.targetFactionId].name}。` });
    } else {
      next = absorbFaction(next, order.factionId, order.targetFactionId, target.id);
      messages.push({
        order,
        message: `${target.name}接受劝降，${state.factions[order.targetFactionId].name}所属城池并入${next.factions[order.factionId].name}。`,
      });
    }
  }

  next = updateCitySatraps(releaseLandlessFactionOfficers(next));
  if (messages.length > 0) {
    for (const entry of messages) {
      next = appendLogs(next, visibleLogKind(next, entry.order), [
        visibleOrderMessage(next, entry.order, entry.message),
      ]);
    }
  }
  if (!options.deferValidation) assertValidGameState(next);
  return next;
}

export function terminateAllDiplomaticOrders(state: GameState): GameState {
  if (Object.keys(state.diplomaticOrders).length === 0) return state;
  let next = { ...state, diplomaticOrders: {}, officers: { ...state.officers } };
  const orders = Object.values(state.diplomaticOrders).sort(compareDiplomaticOrders);
  for (const order of orders) {
    const officer = next.officers[order.officerId];
    if (!officer || officer.status !== 'serving' || officer.cityId) continue;
    const destination = preferredReturnCity(next, order);
    next = destination
      ? { ...next, officers: { ...next.officers, [officer.id]: { ...officer, cityId: destination.id } } }
      : releaseExecutor(next, officer, order);
  }
  next = updateCitySatraps(next);
  for (const order of orders) {
    const executor = state.officers[order.officerId];
    const target = state.officers[order.targetOfficerId];
    const detailed = `${executor?.name ?? order.officerId}对${target?.name ?? order.targetOfficerId}的${KIND_LABELS[order.kind]}因战役结束而中止。`;
    const message = order.factionId === state.playerFactionId || order.targetFactionId === state.playerFactionId
      ? detailed
      : `${state.factions[order.factionId]?.name ?? '某势力'}的一项谋略因战役结束而中止。`;
    next = appendLogs(next, visibleLogKind(state, order), [message]);
  }
  return next;
}

function isLegalTarget(
  state: GameState,
  kind: DiplomaticOrderKind,
  factionId: string,
  target: Officer,
  enforcePlayerIntel: boolean,
): boolean {
  if (target.status !== 'serving' || !target.cityId || target.factionId === factionId) return false;
  const targetFaction = state.factions[target.factionId];
  if (!targetFaction || targetFaction.isNeutral) return false;
  if (!Object.values(state.cities).some((city) => city.ownerId === targetFaction.id)) return false;
  if (enforcePlayerIntel && factionId === state.playerFactionId) {
    const report = state.intelReports[target.cityId];
    if (!report || report.observedTurn !== state.turn || !report.officerIds?.includes(target.id)) return false;
  }
  const isRuler = targetFaction.rulerOfficerId === target.id;
  if (kind === 'induce') return isRuler && target.factionId !== state.playerFactionId;
  if (isRuler) return false;
  if (kind === 'counterespionage') {
    const ruler = state.officers[targetFaction.rulerOfficerId];
    // The fixed implementation transfers every stationed officer. When a
    // manually appointed satrap shares a city with the old ruler, doing that
    // would orphan a still-landed faction in the normalized Web model.
    return state.cities[target.cityId].satrapOfficerId === target.id
      && ruler?.cityId !== target.cityId;
  }
  return true;
}

function hasInduceDominance(state: GameState, sourceFactionId: string, targetFactionId: string): boolean {
  const sourceCities = Object.values(state.cities).filter((city) => city.ownerId === sourceFactionId).length;
  const targetCities = Object.values(state.cities).filter((city) => city.ownerId === targetFactionId).length;
  return targetCities > 0 && sourceCities >= targetCities * 2;
}

function preferredReturnCity(state: GameState, order: DiplomaticOrder) {
  const source = state.cities[order.sourceCityId];
  if (source?.ownerId === order.factionId) return source;
  return Object.values(state.cities)
    .filter((city) => city.ownerId === order.factionId)
    .sort((left, right) => left.id.localeCompare(right.id))[0];
}

function releaseExecutor(state: GameState, officer: Officer, order: DiplomaticOrder): GameState {
  const neutralFactionId = Object.values(state.factions).find((faction) => faction.isNeutral)?.id;
  const settlement = state.cities[order.targetCityId] ?? state.cities[order.sourceCityId]
    ?? Object.values(state.cities).sort((left, right) => left.id.localeCompare(right.id))[0];
  if (!neutralFactionId || !settlement) throw new Error('外交命令无法安置失地执行武将');
  return {
    ...state,
    officers: {
      ...state.officers,
      [officer.id]: {
        ...officer,
        status: 'free',
        factionId: neutralFactionId,
        cityId: settlement.id,
        troops: 0,
        stamina: 0,
      },
    },
  };
}

function establishRebelFaction(state: GameState, target: Officer, formerFactionId: string): GameState {
  const city = state.cities[target.cityId!];
  const factionId = `rebel-${target.id}`;
  const existing = state.factions[factionId];
  const faction: Faction = existing ?? {
    id: factionId,
    name: `${target.name}军`,
    rulerOfficerId: target.id,
    color: colorForOfficer(target.id),
    isPlayer: false,
    aiProfile: target.character === 0 ? 'aggressive' : target.character === 4 ? 'defensive' : 'balanced',
  };
  const officers = Object.fromEntries(Object.values(state.officers).map((officer) => {
    if (officer.status === 'serving' && officer.factionId === formerFactionId && officer.cityId === city.id) {
      return [officer.id, { ...officer, factionId }];
    }
    if (officer.status === 'captive' && officer.cityId === city.id && officer.captorFactionId === formerFactionId) {
      if (officer.formerFactionId === factionId) {
        return [officer.id, {
          ...officer,
          status: 'serving' as const,
          factionId,
          captorFactionId: undefined,
          formerFactionId: undefined,
        }];
      }
      return [officer.id, { ...officer, captorFactionId: factionId }];
    }
    return [officer.id, officer];
  }));
  const next = {
    ...state,
    factions: { ...state.factions, [factionId]: faction },
    factionOrder: state.factionOrder.includes(factionId)
      ? state.factionOrder
      : [...state.factionOrder, factionId],
    cities: { ...state.cities, [city.id]: { ...city, ownerId: factionId, satrapOfficerId: target.id } },
    officers,
  };
  return updateCitySatraps(releaseLandlessFactionOfficers(next));
}

function absorbFaction(
  state: GameState,
  receivingFactionId: string,
  targetFactionId: string,
  targetRulerId: string,
): GameState {
  const convertedCityIds = Object.values(state.cities)
    .filter((city) => city.ownerId === targetFactionId)
    .map((city) => city.id);
  const convertedCitySet = new Set(convertedCityIds);
  const destinationId = state.officers[targetRulerId].cityId ?? convertedCityIds.sort()[0];
  const cities = Object.fromEntries(Object.values(state.cities).map((city) => [
    city.id,
    convertedCitySet.has(city.id) ? { ...city, ownerId: receivingFactionId } : city,
  ]));
  const officers = Object.fromEntries(Object.values(state.officers).map((officer) => {
    if (officer.status === 'serving' && officer.factionId === targetFactionId
      && officer.cityId && convertedCitySet.has(officer.cityId)) {
      return [officer.id, { ...officer, factionId: receivingFactionId }];
    }
    if (officer.id === targetRulerId) {
      return [officer.id, { ...officer, factionId: receivingFactionId, cityId: destinationId }];
    }
    if (officer.status === 'captive' && officer.cityId && convertedCitySet.has(officer.cityId)
      && officer.captorFactionId === targetFactionId) {
      if (officer.formerFactionId === receivingFactionId) {
        return [officer.id, {
          ...officer,
          status: 'serving' as const,
          factionId: receivingFactionId,
          captorFactionId: undefined,
          formerFactionId: undefined,
        }];
      }
      return [officer.id, { ...officer, captorFactionId: receivingFactionId }];
    }
    return [officer.id, officer];
  }));
  return updateCitySatraps(releaseLandlessFactionOfficers({ ...state, cities, officers }));
}

function visibleLogKind(state: GameState, order: DiplomaticOrder): 'map' | 'ai' {
  return order.factionId === state.playerFactionId || order.targetFactionId === state.playerFactionId ? 'map' : 'ai';
}

function visibleOrderMessage(state: GameState, order: DiplomaticOrder, detailed: string): string {
  return order.factionId === state.playerFactionId || order.targetFactionId === state.playerFactionId
    ? detailed
    : `${state.factions[order.factionId]?.name ?? '某势力'}完成了一项谋略行动。`;
}

function colorForOfficer(officerId: string): string {
  let hash = 0;
  for (const character of officerId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `#${((hash >>> 0) & 0x00ffffff).toString(16).padStart(6, '0')}`;
}

function compareDiplomaticOrders(left: DiplomaticOrder, right: DiplomaticOrder): number {
  return diplomaticOrderSerial(left.id) - diplomaticOrderSerial(right.id);
}

function diplomaticOrderSerial(id: string): number {
  return Number(id.slice('diplomatic-order-'.length));
}
