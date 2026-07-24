import { appendLogs } from './logs';
import { nextRandom } from './random';
import type { City, GameState, Officer } from './types';
import { assertValidGameState } from './validation';

export const DEVELOP_STAMINA_COST = 8;
export const DEVELOP_MONEY_COST = 50;
export const RECRUIT_STAMINA_COST = 12;
export const ARMS_PER_DEVOTION = 20;
export const ARMS_PER_MONEY = 10;
export const DEFAULT_RECRUIT_AMOUNT = 500;

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

export function calculateFarmingGain(officer: Officer, randomValue: number): number {
  if (randomValue < 0 || randomValue >= 1) throw new RangeError('randomValue must be from 0 up to 1');
  const randomFactor = Math.floor(randomValue * 4) + 2;
  return Math.floor(officer.intelligence / 10) * randomFactor + (officer.intelligence >>> 1);
}

export function calculateRecruitCapacity(city: City): number {
  const loyalty = city.publicLoyalty ?? 70;
  return Math.max(0, Math.min(loyalty * ARMS_PER_DEVOTION, city.money * ARMS_PER_MONEY, 0xfffe));
}

export function calculateOfficerTroopCapacity(officer: Officer): number {
  const originalCapacity = (officer.level ?? 10) * 100 + officer.force * 10 + officer.intelligence * 10;
  return Math.min(0xfffe, Math.max(officer.troops, originalCapacity));
}

export function developFarming(state: GameState, order: CityCommandOrder): GameState {
  const { city, officer } = validateCityCommand(state, order, DEVELOP_STAMINA_COST);
  if (city.money < DEVELOP_MONEY_COST) throw new Error(`城中金钱不足，需要 ${DEVELOP_MONEY_COST}`);
  const available = city.farmingLimit === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, city.farmingLimit - city.farming);
  if (available === 0) throw new Error('该城农业已经达到上限');

  const random = nextRandom(state.rngSeed);
  const gain = Math.min(available, calculateFarmingGain(officer, random.value));
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

  const next = updateCityAndOfficer(
    state,
    { ...city, reserveTroops: city.reserveTroops - delta },
    { ...officer, troops: order.targetTroops },
    false,
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

function validateDistribution(state: GameState, order: CityCommandOrder): { city: City; officer: Officer } {
  return validateActiveCityOfficer(state, order);
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
