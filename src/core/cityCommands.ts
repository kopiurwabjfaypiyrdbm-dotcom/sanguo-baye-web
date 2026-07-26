import { appendLogs } from './logs';
import { getEffectiveOfficerAttributes } from './equipment';
import { nextRandom } from './random';
import type { City, GameState, Officer } from './types';
import { assertValidGameState } from './validation';

export const DEVELOP_STAMINA_COST = 8;
export const DEVELOP_MONEY_COST = 50;
export const GOVERN_STAMINA_COST = 4;
export const GOVERN_MONEY_COST = 50;
export const INSPECT_STAMINA_COST = 4;
export const INSPECT_MONEY_COST = 50;
export const RECRUIT_STAMINA_COST = 12;
export const ARMS_PER_DEVOTION = 20;
export const ARMS_PER_MONEY = 10;
export const DEFAULT_RECRUIT_AMOUNT = 500;
/** Product pacing rule: one distribution command cannot multiply a fresh 100-troop unit in a single click/month. */
export const MAX_DISTRIBUTION_INCREASE = 400;

export type CityCommandOrder = {
  cityId: string;
  officerId: string;
};

export type RecruitOrder = CityCommandOrder & {
  amount?: number;
};

export type DistributionOrder = CityCommandOrder & {
  targetTroops: number;
};

export type CityCommandAvailability =
  | { allowed: true }
  | { allowed: false; reason: string };

export function calculateFarmingGain(officer: Pick<Officer, 'intelligence'>, randomValue: number): number {
  if (randomValue < 0 || randomValue >= 1) throw new RangeError('randomValue must be from 0 up to 1');
  const randomFactor = Math.floor(randomValue * 4) + 2;
  return Math.floor(officer.intelligence / 10) * randomFactor + (officer.intelligence >>> 1);
}

export const calculateCommerceGain = calculateFarmingGain;

export function calculateRecruitCapacity(city: City): number {
  const loyalty = city.publicLoyalty ?? 70;
  return Math.max(0, Math.min(loyalty * ARMS_PER_DEVOTION, city.money * ARMS_PER_MONEY, 0xfffe));
}

export function calculateOfficerTroopCapacity(officer: Officer): number {
  const originalCapacity = (officer.level ?? 10) * 100 + officer.force * 10 + officer.intelligence * 10;
  return Math.min(0xfffe, Math.max(officer.troops, originalCapacity));
}

export function developFarming(state: GameState, order: CityCommandOrder): GameState {
  const availability = getDevelopFarmingAvailability(state, order);
  if (!availability.allowed) throw new Error(availability.reason);
  const { city, officer } = validateCityCommand(state, order, DEVELOP_STAMINA_COST);
  const available = city.farmingLimit === undefined
    ? Number.MAX_SAFE_INTEGER - city.farming
    : Math.max(0, city.farmingLimit - city.farming);

  const random = nextRandom(state.rngSeed);
  const effective = getEffectiveOfficerAttributes(state, officer);
  const gain = Math.min(available, calculateFarmingGain(effective, random.value));
  const next = updateCityAndOfficer(
    { ...state, rngSeed: random.seed },
    { ...city, farming: city.farming + gain, money: city.money - DEVELOP_MONEY_COST },
    { ...officer, stamina: officer.stamina - DEVELOP_STAMINA_COST },
    true,
  );
  return appendLogs(next, 'map', [
    `${officer.name}在${city.name}主持开垦，农业提高 ${gain}，消耗金钱 ${DEVELOP_MONEY_COST}、体力 ${DEVELOP_STAMINA_COST}。`,
  ]);
}

export function getDevelopFarmingAvailability(
  state: GameState,
  order: CityCommandOrder,
): CityCommandAvailability {
  const base = getCityCommandAvailability(state, order, DEVELOP_STAMINA_COST, DEVELOP_MONEY_COST);
  if (!base.allowed) return base;
  const city = state.cities[order.cityId];
  if (city.farmingLimit !== undefined && city.farming >= city.farmingLimit) {
    return { allowed: false, reason: '该城农业已经达到上限' };
  }
  if (city.farmingLimit === undefined && city.farming >= Number.MAX_SAFE_INTEGER) {
    return { allowed: false, reason: '该城农业已经达到安全上限' };
  }
  return { allowed: true };
}

export function getDevelopCommerceAvailability(
  state: GameState,
  order: CityCommandOrder,
): CityCommandAvailability {
  const base = getCityCommandAvailability(state, order, DEVELOP_STAMINA_COST, DEVELOP_MONEY_COST);
  if (!base.allowed) return base;
  const city = state.cities[order.cityId];
  if (city.commerceLimit !== undefined && city.commerce >= city.commerceLimit) {
    return { allowed: false, reason: '该城商业已经达到上限' };
  }
  if (city.commerceLimit === undefined && city.commerce >= Number.MAX_SAFE_INTEGER) {
    return { allowed: false, reason: '该城商业已经达到安全上限' };
  }
  return { allowed: true };
}

export function developCommerce(state: GameState, order: CityCommandOrder): GameState {
  const availability = getDevelopCommerceAvailability(state, order);
  if (!availability.allowed) throw new Error(availability.reason);
  const { city, officer } = validateCityCommand(state, order, DEVELOP_STAMINA_COST);
  const available = city.commerceLimit === undefined
    ? Number.MAX_SAFE_INTEGER - city.commerce
    : Math.max(0, city.commerceLimit - city.commerce);
  const random = nextRandom(state.rngSeed);
  const effective = getEffectiveOfficerAttributes(state, officer);
  const gain = Math.min(available, calculateCommerceGain(effective, random.value));
  const next = updateCityAndOfficer(
    { ...state, rngSeed: random.seed },
    { ...city, commerce: city.commerce + gain, money: city.money - DEVELOP_MONEY_COST },
    { ...officer, stamina: officer.stamina - DEVELOP_STAMINA_COST },
    true,
  );
  return appendLogs(next, 'map', [
    `${officer.name}在${city.name}主持招商，商业提高 ${gain}，消耗金钱 ${DEVELOP_MONEY_COST}、体力 ${DEVELOP_STAMINA_COST}。`,
  ]);
}

export function getGovernAvailability(
  state: GameState,
  order: CityCommandOrder,
): CityCommandAvailability {
  const base = getCityCommandAvailability(state, order, GOVERN_STAMINA_COST, GOVERN_MONEY_COST);
  if (!base.allowed) return base;
  if ((state.cities[order.cityId].disasterPrevention ?? 0) >= 100) {
    return { allowed: false, reason: '该城防灾已经达到上限' };
  }
  return { allowed: true };
}

export function governCity(state: GameState, order: CityCommandOrder): GameState {
  const availability = getGovernAvailability(state, order);
  if (!availability.allowed) throw new Error(availability.reason);
  const { city, officer } = validateCityCommand(state, order, GOVERN_STAMINA_COST);
  const random = nextRandom(state.rngSeed);
  const gain = Math.min(100 - (city.disasterPrevention ?? 0), Math.floor(random.value * 4) + 1);
  const next = updateCityAndOfficer(
    { ...state, rngSeed: random.seed },
    {
      ...city,
      disasterPrevention: (city.disasterPrevention ?? 0) + gain,
      money: city.money - GOVERN_MONEY_COST,
    },
    { ...officer, stamina: officer.stamina - GOVERN_STAMINA_COST },
    true,
  );
  return appendLogs(next, 'map', [
    `${officer.name}治理${city.name}，防灾提高 ${gain}，消耗金钱 ${GOVERN_MONEY_COST}、体力 ${GOVERN_STAMINA_COST}。`,
  ]);
}

export function getInspectAvailability(
  state: GameState,
  order: CityCommandOrder,
): CityCommandAvailability {
  const base = getCityCommandAvailability(state, order, INSPECT_STAMINA_COST, INSPECT_MONEY_COST);
  if (!base.allowed) return base;
  const city = state.cities[order.cityId];
  const loyaltyFull = (city.publicLoyalty ?? 70) >= 100;
  const populationFull = city.population >= (city.populationLimit ?? Number.MAX_SAFE_INTEGER);
  if (loyaltyFull && populationFull) return { allowed: false, reason: '该城民忠和人口已经达到上限' };
  return { allowed: true };
}

export function inspectCity(state: GameState, order: CityCommandOrder): GameState {
  const availability = getInspectAvailability(state, order);
  if (!availability.allowed) throw new Error(availability.reason);
  const { city, officer } = validateCityCommand(state, order, INSPECT_STAMINA_COST);
  const random = nextRandom(state.rngSeed);
  const loyaltyGain = Math.max(
    0,
    Math.min(100 - (city.publicLoyalty ?? 70), Math.floor(random.value * 4) + 1),
  );
  const populationGain = Math.min(
    100,
    Math.max(0, (city.populationLimit ?? Number.MAX_SAFE_INTEGER) - city.population),
  );
  const next = updateCityAndOfficer(
    { ...state, rngSeed: random.seed },
    {
      ...city,
      publicLoyalty: (city.publicLoyalty ?? 70) + loyaltyGain,
      population: city.population + populationGain,
      money: city.money - INSPECT_MONEY_COST,
    },
    { ...officer, stamina: officer.stamina - INSPECT_STAMINA_COST },
    true,
  );
  return appendLogs(next, 'map', [
    `${officer.name}出巡${city.name}，民忠提高 ${loyaltyGain}、人口增加 ${populationGain}，消耗金钱 ${INSPECT_MONEY_COST}、体力 ${INSPECT_STAMINA_COST}。`,
  ]);
}

export function recruitTroops(state: GameState, order: RecruitOrder): GameState {
  const { city, officer } = validateCityCommand(state, order, RECRUIT_STAMINA_COST);
  const capacity = Math.min(calculateRecruitCapacity(city), 0xffff - city.reserveTroops);
  if (capacity <= 0) throw new Error('该城没有足够的金钱、民忠或后备兵容量');
  const requested = order.amount ?? DEFAULT_RECRUIT_AMOUNT;
  if (!Number.isInteger(requested) || requested <= 0) throw new Error('征兵数量必须是正整数');
  const gain = Math.min(requested, capacity);
  const moneyCost = Math.floor(gain / ARMS_PER_MONEY);

  const next = updateCityAndOfficer(
    state,
    {
      ...city,
      money: city.money - moneyCost,
      reserveTroops: city.reserveTroops + gain,
    },
    { ...officer, stamina: officer.stamina - RECRUIT_STAMINA_COST },
    true,
  );
  return appendLogs(next, 'map', [
    `${officer.name}在${city.name}征募 ${gain} 名后备兵，消耗金钱 ${moneyCost}、体力 ${RECRUIT_STAMINA_COST}。`,
  ]);
}

export function distributeTroops(state: GameState, order: DistributionOrder): GameState {
  const { city, officer } = validateDistribution(state, order);
  if (!Number.isInteger(order.targetTroops) || order.targetTroops < 0) {
    throw new Error('目标兵力必须是非负整数');
  }
  const maximum = calculateOfficerTroopCapacity(officer);
  if (order.targetTroops > maximum) throw new Error(`该武将最多统率 ${maximum} 兵力`);
  const delta = order.targetTroops - officer.troops;
  if (delta > city.reserveTroops) throw new Error('城中后备兵不足');
  if (delta > MAX_DISTRIBUTION_INCREASE) {
    throw new Error(`单次最多可为武将增补 ${MAX_DISTRIBUTION_INCREASE} 兵力`);
  }

  const next = updateCityAndOfficer(
    state,
    { ...city, reserveTroops: city.reserveTroops - delta },
    { ...officer, troops: order.targetTroops },
    true,
  );
  return appendLogs(next, 'map', [
    `${city.name}完成兵力分配：${officer.name}现统率 ${order.targetTroops} 人，城中后备兵 ${next.cities[city.id].reserveTroops}。`,
  ]);
}

function validateCityCommand(
  state: GameState,
  order: CityCommandOrder,
  staminaCost: number,
): { city: City; officer: Officer } {
  const result = validateActiveCityOfficer(state, order);
  if (state.actedOfficerIds.includes(result.officer.id)) throw new Error('该武将本月已经执行过命令');
  if (result.officer.stamina < staminaCost) throw new Error(`武将体力不足，需要 ${staminaCost}`);
  return result;
}

function getCityCommandAvailability(
  state: GameState,
  order: CityCommandOrder,
  staminaCost: number,
  moneyCost: number,
): CityCommandAvailability {
  if (state.phase === 'ended') return { allowed: false, reason: '战役已经结束' };
  const city = state.cities[order.cityId];
  if (!city || city.ownerId !== state.activeFactionId) return { allowed: false, reason: '只能在己方城池执行命令' };
  const officer = state.officers[order.officerId];
  if (!officer || officer.status !== 'serving'
    || officer.factionId !== state.activeFactionId || officer.cityId !== city.id) {
    return { allowed: false, reason: '执行武将不在该城' };
  }
  if (state.actedOfficerIds.includes(officer.id)) return { allowed: false, reason: '该武将本月已经执行过命令' };
  if (officer.stamina < staminaCost) return { allowed: false, reason: `武将体力不足，需要 ${staminaCost}` };
  if (city.money < moneyCost) return { allowed: false, reason: `城中金钱不足，需要 ${moneyCost}` };
  return { allowed: true };
}

function validateDistribution(state: GameState, order: CityCommandOrder): { city: City; officer: Officer } {
  const result = validateActiveCityOfficer(state, order);
  if (state.actedOfficerIds.includes(result.officer.id)) throw new Error('该武将本月已经执行过命令');
  return result;
}

function validateActiveCityOfficer(
  state: GameState,
  order: CityCommandOrder,
): { city: City; officer: Officer } {
  if (state.phase === 'ended') throw new Error('战役已经结束');
  const city = state.cities[order.cityId];
  if (!city) throw new Error(`未知城池：${order.cityId}`);
  if (city.ownerId !== state.activeFactionId) throw new Error('只能在己方城池执行命令');

  const officer = state.officers[order.officerId];
  if (!officer) throw new Error(`未知武将：${order.officerId}`);
  if (officer.status !== 'serving' || officer.factionId !== state.activeFactionId || officer.cityId !== city.id) {
    throw new Error('执行武将不在该城');
  }
  return { city, officer };
}

function updateCityAndOfficer(
  state: GameState,
  city: City,
  officer: Officer,
  markActed: boolean,
): GameState {
  const next: GameState = {
    ...state,
    campaignStarted: true,
    cities: { ...state.cities, [city.id]: city },
    officers: { ...state.officers, [officer.id]: officer },
    actedOfficerIds: markActed ? [...state.actedOfficerIds, officer.id] : state.actedOfficerIds,
  };
  assertValidGameState(next);
  return next;
}
