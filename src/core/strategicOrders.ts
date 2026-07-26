import { updateCitySatraps } from './administration';
import { appendLogs } from './logs';
import type { City, GameState, StrategicOrder } from './types';
import { assertValidGameState } from './validation';

export const MOVE_STAMINA_COST = 4;

export type StrategicDestination = {
  city: City;
  routeCityIds: string[];
  durationMonths: number;
};

export type MoveOrderInput = {
  sourceCityId: string;
  targetCityId: string;
  officerId: string;
};

export type MoveAvailability =
  | { allowed: true; routeCityIds: string[]; durationMonths: number }
  | { allowed: false; reason: string };

export function getOfficerStrategicOrder(state: GameState, officerId: string): StrategicOrder | undefined {
  return Object.values(state.strategicOrders).find((order) => order.officerId === officerId);
}

export function getFactionStrategicOrders(state: GameState, factionId: string): StrategicOrder[] {
  return Object.values(state.strategicOrders)
    .filter((order) => order.factionId === factionId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getStrategicDestinations(
  state: GameState,
  sourceCityId: string,
  factionId = state.activeFactionId,
): StrategicDestination[] {
  return Object.values(state.cities)
    .filter((city) => city.id !== sourceCityId && city.ownerId === factionId)
    .map((city) => {
      const routeCityIds = findOwnedCityRoute(state, factionId, sourceCityId, city.id);
      return routeCityIds
        ? { city, routeCityIds, durationMonths: routeCityIds.length - 1 }
        : undefined;
    })
    .filter((destination): destination is StrategicDestination => destination !== undefined)
    .sort((a, b) => a.durationMonths - b.durationMonths || a.city.id.localeCompare(b.city.id));
}

export function findOwnedCityRoute(
  state: GameState,
  factionId: string,
  sourceCityId: string,
  targetCityId: string,
): string[] | undefined {
  const source = state.cities[sourceCityId];
  const target = state.cities[targetCityId];
  if (!source || !target || source.ownerId !== factionId || target.ownerId !== factionId) return undefined;
  if (source.id === target.id) return [source.id];

  const queue: string[] = [source.id];
  const previous = new Map<string, string | undefined>([[source.id, undefined]]);
  for (let index = 0; index < queue.length; index += 1) {
    const cityId = queue[index];
    const neighbors = [...state.cities[cityId].neighbors].sort((a, b) => a.localeCompare(b));
    for (const neighborId of neighbors) {
      if (previous.has(neighborId)) continue;
      const neighbor = state.cities[neighborId];
      if (!neighbor || neighbor.ownerId !== factionId) continue;
      previous.set(neighborId, cityId);
      if (neighborId === target.id) return reconstructRoute(previous, target.id);
      queue.push(neighborId);
    }
  }
  return undefined;
}

export function getMoveAvailability(state: GameState, input: MoveOrderInput): MoveAvailability {
  if (state.phase === 'ended') return { allowed: false, reason: '战役已经结束' };
  const source = state.cities[input.sourceCityId];
  const target = state.cities[input.targetCityId];
  if (!source || !target) return { allowed: false, reason: '调动的出发城或目标城不存在' };
  if (source.id === target.id) return { allowed: false, reason: '目标城市不能与出发城市相同' };
  if (source.ownerId !== state.activeFactionId || target.ownerId !== state.activeFactionId) {
    return { allowed: false, reason: '只能在己方城池之间调动武将' };
  }
  const officer = state.officers[input.officerId];
  if (!officer || officer.status !== 'serving'
    || officer.factionId !== state.activeFactionId || officer.cityId !== source.id) {
    return { allowed: false, reason: '待调武将不在出发城' };
  }
  if (getOfficerStrategicOrder(state, officer.id)) return { allowed: false, reason: '该武将已有执行中的战略命令' };
  if (state.actedOfficerIds.includes(officer.id)) return { allowed: false, reason: '该武将本月已经执行过命令' };
  if (officer.stamina < MOVE_STAMINA_COST) {
    return { allowed: false, reason: `武将体力不足，需要 ${MOVE_STAMINA_COST}` };
  }
  const routeCityIds = findOwnedCityRoute(state, state.activeFactionId, source.id, target.id);
  if (!routeCityIds) return { allowed: false, reason: '两座城市之间没有连通的己方道路' };
  return { allowed: true, routeCityIds, durationMonths: Math.max(1, routeCityIds.length - 1) };
}

export function issueMoveOrder(state: GameState, input: MoveOrderInput): GameState {
  const availability = getMoveAvailability(state, input);
  if (!availability.allowed) throw new Error(availability.reason);
  const source = state.cities[input.sourceCityId];
  const target = state.cities[input.targetCityId];
  const officer = state.officers[input.officerId];
  let serial = state.nextStrategicOrderSerial;
  while (state.strategicOrders[`strategic-order-${serial}`]) serial += 1;
  const id = `strategic-order-${serial}`;
  const order: StrategicOrder = {
    id,
    kind: 'move',
    factionId: state.activeFactionId,
    officerId: officer.id,
    sourceCityId: source.id,
    targetCityId: target.id,
    routeCityIds: availability.routeCityIds,
    createdTurn: state.turn,
    createdYear: state.calendar.year,
    createdMonth: state.calendar.month,
    durationMonths: availability.durationMonths,
    remainingMonths: availability.durationMonths,
    cargo: { money: 0, food: 0, reserveTroops: 0 },
  };
  let next = updateCitySatraps({
    ...state,
    campaignStarted: true,
    strategicOrders: { ...state.strategicOrders, [order.id]: order },
    nextStrategicOrderSerial: serial + 1,
    officers: {
      ...state.officers,
      [officer.id]: { ...officer, cityId: undefined, stamina: officer.stamina - MOVE_STAMINA_COST },
    },
    actedOfficerIds: [...state.actedOfficerIds, officer.id],
  });
  next = appendLogs(next, 'map', [
    `${officer.name}从${source.name}启程前往${target.name}，预计 ${order.durationMonths} 个月抵达。`,
  ]);
  assertValidGameState(next);
  return next;
}

export function advanceStrategicOrders(state: GameState): GameState {
  if (Object.keys(state.strategicOrders).length === 0) return state;
  const strategicOrders = { ...state.strategicOrders };
  const officers = { ...state.officers };
  const messages: string[] = [];

  for (const order of Object.values(state.strategicOrders).sort((a, b) => a.id.localeCompare(b.id))) {
    const officer = officers[order.officerId];
    if (!officer || officer.status !== 'serving' || officer.factionId !== order.factionId) {
      delete strategicOrders[order.id];
      messages.push(`${order.id}因执行武将状态变化而失效。`);
      continue;
    }
    if (order.remainingMonths > 1) {
      strategicOrders[order.id] = { ...order, remainingMonths: order.remainingMonths - 1 };
      continue;
    }

    delete strategicOrders[order.id];
    const target = state.cities[order.targetCityId];
    const source = state.cities[order.sourceCityId];
    const fallback = Object.values(state.cities)
      .filter((city) => city.ownerId === order.factionId)
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    const destination = target?.ownerId === order.factionId
      ? target
      : source?.ownerId === order.factionId
        ? source
        : fallback;
    if (destination) {
      officers[officer.id] = { ...officer, cityId: destination.id };
      messages.push(destination.id === target?.id
        ? `${officer.name}抵达${destination.name}。`
        : `${officer.name}因目标易主，返回${destination.name}。`);
      continue;
    }

    const neutralFactionId = Object.values(state.factions).find((faction) => faction.isNeutral)?.id;
    const settlement = target ?? source ?? Object.values(state.cities).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!neutralFactionId || !settlement) throw new Error('无法安置失去势力的在途武将');
    officers[officer.id] = {
      ...officer,
      status: 'free',
      factionId: neutralFactionId,
      cityId: settlement.id,
      troops: 0,
      stamina: 0,
    };
    messages.push(`${officer.name}所属势力已无城可归，流落至${settlement.name}。`);
  }

  let next = updateCitySatraps({ ...state, strategicOrders, officers });
  if (messages.length > 0) next = appendLogs(next, 'turn', messages);
  assertValidGameState(next);
  return next;
}

function reconstructRoute(previous: Map<string, string | undefined>, targetCityId: string): string[] {
  const route: string[] = [];
  let cityId: string | undefined = targetCityId;
  while (cityId !== undefined) {
    route.push(cityId);
    cityId = previous.get(cityId);
  }
  return route.reverse();
}
