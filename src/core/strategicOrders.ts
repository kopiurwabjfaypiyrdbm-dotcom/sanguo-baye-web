import { updateCitySatraps } from './administration';
import { appendLogs } from './logs';
import { nextRandom } from './random';
import {
  canCreditStrategicCargo,
  creditStrategicCargo,
  creditStrategicCargoAcrossCities,
  formatStrategicCargo,
} from './strategicOrderCargo';
import type { City, GameState, StrategicOrder } from './types';
import { assertValidGameState } from './validation';
import { hasActiveCampaignOrder } from './diplomaticOrders';
import { getCampaignCommandCost } from './rulesets';

export const MOVE_STAMINA_COST = 4;
export const TRANSPORT_STAMINA_COST = 4;

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

export type TransportOrderInput = MoveOrderInput & {
  cargo: StrategicOrder['cargo'];
};

export type StrategicOrderAvailability =
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

export function getMoveAvailability(state: GameState, input: MoveOrderInput): StrategicOrderAvailability {
  return getRoadOrderAvailability(state, input, getCampaignCommandCost(state.rulesetId, 'move').stamina, '调动');
}

export function getTransportAvailability(
  state: GameState,
  input: TransportOrderInput,
): StrategicOrderAvailability {
  const availability = getRoadOrderAvailability(
    state,
    input,
    getCampaignCommandCost(state.rulesetId, 'transport').stamina,
    '输送',
  );
  if (!availability.allowed) return availability;
  const cargoEntries = Object.entries(input.cargo) as Array<[keyof StrategicOrder['cargo'], number]>;
  if (cargoEntries.some(([, amount]) => !Number.isSafeInteger(amount) || amount < 0)) {
    return { allowed: false, reason: '输送数量必须是非负整数' };
  }
  if (cargoEntries.every(([, amount]) => amount === 0)) {
    return { allowed: false, reason: '请至少输送一种资源' };
  }
  const source = state.cities[input.sourceCityId];
  if (input.cargo.money > source.money) return { allowed: false, reason: '出发城金钱不足' };
  if (input.cargo.food > source.food) return { allowed: false, reason: '出发城粮草不足' };
  if (input.cargo.reserveTroops > source.reserveTroops) return { allowed: false, reason: '出发城后备兵不足' };
  const target = state.cities[input.targetCityId];
  if (!canCreditStrategicCargo(target, input.cargo)) {
    return { allowed: false, reason: '目标城资源过多，无法安全接收本批物资' };
  }
  return availability;
}

function getRoadOrderAvailability(
  state: GameState,
  input: MoveOrderInput,
  staminaCost: number,
  actionName: '调动' | '输送',
): StrategicOrderAvailability {
  if (state.phase === 'ended') return { allowed: false, reason: '战役已经结束' };
  if (state.pendingSuccession) return { allowed: false, reason: '必须先拥立新君' };
  const source = state.cities[input.sourceCityId];
  const target = state.cities[input.targetCityId];
  if (!source || !target) return { allowed: false, reason: `${actionName}的出发城或目标城不存在` };
  if (source.id === target.id) return { allowed: false, reason: '目标城市不能与出发城市相同' };
  if (source.ownerId !== state.activeFactionId || target.ownerId !== state.activeFactionId) {
    return { allowed: false, reason: '只能在己方城池之间调动武将' };
  }
  const officer = state.officers[input.officerId];
  if (!officer || officer.status !== 'serving'
    || officer.factionId !== state.activeFactionId || officer.cityId !== source.id) {
    return { allowed: false, reason: `执行${actionName}的武将不在出发城` };
  }
  if (hasActiveCampaignOrder(state, officer.id)) return { allowed: false, reason: '该武将已有执行中的命令' };
  if (state.actedOfficerIds.includes(officer.id)) return { allowed: false, reason: '该武将本月已经执行过命令' };
  if (officer.stamina < staminaCost) {
    return { allowed: false, reason: `武将体力不足，需要 ${staminaCost}` };
  }
  const routeCityIds = findOwnedCityRoute(state, state.activeFactionId, source.id, target.id);
  if (!routeCityIds) return { allowed: false, reason: '两座城市之间没有连通的己方道路' };
  return { allowed: true, routeCityIds, durationMonths: Math.max(1, routeCityIds.length - 1) };
}

export function issueMoveOrder(state: GameState, input: MoveOrderInput): GameState {
  const availability = getMoveAvailability(state, input);
  if (!availability.allowed) throw new Error(availability.reason);
  return issueRoadOrder(
    state,
    input,
    availability,
    'move',
    { money: 0, food: 0, reserveTroops: 0 },
    getCampaignCommandCost(state.rulesetId, 'move').stamina,
  );
}

export function issueTransportOrder(state: GameState, input: TransportOrderInput): GameState {
  const availability = getTransportAvailability(state, input);
  if (!availability.allowed) throw new Error(availability.reason);
  return issueRoadOrder(
    state,
    input,
    availability,
    'transport',
    input.cargo,
    getCampaignCommandCost(state.rulesetId, 'transport').stamina,
  );
}

function issueRoadOrder(
  state: GameState,
  input: MoveOrderInput,
  availability: Extract<StrategicOrderAvailability, { allowed: true }>,
  kind: StrategicOrder['kind'],
  cargo: StrategicOrder['cargo'],
  staminaCost: number,
): GameState {
  const source = state.cities[input.sourceCityId];
  const target = state.cities[input.targetCityId];
  const officer = state.officers[input.officerId];
  let serial = state.nextStrategicOrderSerial;
  while (state.strategicOrders[`strategic-order-${serial}`]) serial += 1;
  const id = `strategic-order-${serial}`;
  const order: StrategicOrder = {
    id,
    kind,
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
    cargo: { ...cargo },
  };
  let next = updateCitySatraps({
    ...state,
    campaignStarted: true,
    strategicOrders: { ...state.strategicOrders, [order.id]: order },
    nextStrategicOrderSerial: serial + 1,
    cities: kind === 'transport'
      ? {
        ...state.cities,
        [source.id]: {
          ...source,
          money: source.money - cargo.money,
          food: source.food - cargo.food,
          reserveTroops: source.reserveTroops - cargo.reserveTroops,
        },
      }
      : state.cities,
    officers: {
      ...state.officers,
      [officer.id]: { ...officer, cityId: undefined, stamina: officer.stamina - staminaCost },
    },
    actedOfficerIds: [...state.actedOfficerIds, officer.id],
  });
  const description = kind === 'move'
    ? `${officer.name}从${source.name}启程前往${target.name}，预计 ${order.durationMonths} 个月抵达。`
    : `${officer.name}从${source.name}向${target.name}输送${formatStrategicCargo(cargo)}，预计 ${order.durationMonths} 个月完成。`;
  next = appendLogs(next, 'map', [description]);
  assertValidGameState(next);
  return next;
}

export function advanceStrategicOrders(
  state: GameState,
  options: { deferValidation?: boolean } = {},
): GameState {
  if (Object.keys(state.strategicOrders).length === 0) return state;
  const strategicOrders = { ...state.strategicOrders };
  const officers = { ...state.officers };
  const cities = { ...state.cities };
  let rngSeed = state.rngSeed;
  const messages: string[] = [];

  for (const order of Object.values(state.strategicOrders).sort((a, b) => a.id.localeCompare(b.id))) {
    const officer = officers[order.officerId];
    if (!officer || officer.status !== 'serving' || officer.factionId !== order.factionId) {
      delete strategicOrders[order.id];
      if (order.kind === 'transport') {
        settleInvalidTransportCargo(cities, order, messages, '执行武将状态变化');
      }
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
    if (order.kind === 'transport') {
      const returnCity = source?.ownerId === order.factionId
        ? source
        : target?.ownerId === order.factionId
          ? target
          : fallback;
      if (!returnCity) {
        settleInvalidTransportCargo(cities, order, messages, '所属势力已经失去全部城池');
        releaseOfficerWithoutLand(state, officers, officer, target, source, messages);
        continue;
      }
      officers[officer.id] = { ...officer, cityId: returnCity.id };
      if (target?.ownerId !== order.factionId) {
        if (canCreditStrategicCargo(cities[returnCity.id], order.cargo)) {
          cities[returnCity.id] = creditStrategicCargo(cities[returnCity.id], order.cargo);
          messages.push(`${officer.name}因输送目标易主，携${formatStrategicCargo(order.cargo)}返回${returnCity.name}。`);
        } else {
          settleInvalidTransportCargo(cities, order, messages, '输送目标易主且返程城市库存已满');
          messages.push(`${officer.name}返回${returnCity.name}。`);
        }
        continue;
      }
      if (!canCreditStrategicCargo(cities[target.id], order.cargo)) {
        settleInvalidTransportCargo(cities, order, messages, `${target.name}库存已满`);
        messages.push(`${officer.name}返回${returnCity.name}。`);
        continue;
      }
      const roll = nextRandom(rngSeed);
      rngSeed = roll.seed;
      if (Math.floor(roll.value * 100) > 20) {
        cities[target.id] = creditStrategicCargo(cities[target.id], order.cargo);
        messages.push(`${officer.name}完成对${target.name}的输送，${formatStrategicCargo(order.cargo)}入库，并返回${returnCity.name}。`);
      } else {
        messages.push(`${officer.name}的输送途中受损，${formatStrategicCargo(order.cargo)}全部损失，人员返回${returnCity.name}。`);
      }
      continue;
    }

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

    releaseOfficerWithoutLand(state, officers, officer, target, source, messages);
  }

  let next = updateCitySatraps({ ...state, strategicOrders, officers, cities, rngSeed });
  if (messages.length > 0) next = appendLogs(next, 'turn', messages);
  if (!options.deferValidation) assertValidGameState(next);
  return next;
}

function settleInvalidTransportCargo(
  cities: GameState['cities'],
  order: StrategicOrder,
  messages: string[],
  reason: string,
): void {
  const source = cities[order.sourceCityId];
  const target = cities[order.targetCityId];
  const ownCities = Object.values(cities)
    .filter((city) => city.ownerId === order.factionId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const refundCandidates = [source, target, ...ownCities]
    .filter((city): city is City => city !== undefined && city.ownerId === order.factionId);
  const salvageCandidates = [source, target, ...Object.values(cities).sort((a, b) => a.id.localeCompare(b.id))]
    .filter((city): city is City => city !== undefined);
  const candidates = [...refundCandidates, ...salvageCandidates]
    .filter((city, index, all) => all.findIndex((candidate) => candidate.id === city.id) === index);
  const destinationIds = creditStrategicCargoAcrossCities(cities, candidates, order.cargo);
  const destinations = destinationIds.map((cityId) => cities[cityId]);
  const refunded = destinations.every((city) => city.ownerId === order.factionId);
  const destinationNames = destinations.map((city) => city.name).join('、');
  messages.push(refunded
    ? `${order.id}因${reason}失效，${formatStrategicCargo(order.cargo)}退回${destinationNames}。`
    : `${order.id}因${reason}失效，${formatStrategicCargo(order.cargo)}由${destinationNames}接收。`);
}

function releaseOfficerWithoutLand(
  state: GameState,
  officers: GameState['officers'],
  officer: GameState['officers'][string],
  target: City | undefined,
  source: City | undefined,
  messages: string[],
): void {
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

function reconstructRoute(previous: Map<string, string | undefined>, targetCityId: string): string[] {
  const route: string[] = [];
  let cityId: string | undefined = targetCityId;
  while (cityId !== undefined) {
    route.push(cityId);
    cityId = previous.get(cityId);
  }
  return route.reverse();
}
