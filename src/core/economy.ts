import { appendLogs } from './logs';
import type { City, GameState } from './types';
import { nextRandom } from './random';

export const MONTHLY_STAMINA_RECOVERY = 4;
export const MAX_CITY_RESOURCE = 30_000;

export type CityGrowth = {
  money: number;
  food: number;
  reserveTroops: number;
  population: number;
  upkeep: number;
};

export function calculateCityGrowth(
  city: City,
  calendar: GameState['calendar'],
  stationedTroops = 0,
): CityGrowth {
  const money = calendar.month % 3 === 0 ? Math.floor(city.commerce / 2) : 0;
  const food = calendar.month === 6 || calendar.month === 10 ? Math.floor(city.farming / 4) : 0;
  const upkeep = Math.floor((city.reserveTroops + stationedTroops) / 50);
  const populationLimit = city.populationLimit ?? Number.POSITIVE_INFINITY;
  return {
    money,
    food,
    reserveTroops: 0,
    population: Math.min(50, Math.max(0, populationLimit - city.population)),
    upkeep,
  };
}

export function getSupportedOfficerIdsByCity(state: GameState): Map<string, string[]> {
  const supported = new Map<string, string[]>();
  for (const officer of Object.values(state.officers)) {
    if (officer.status !== 'serving' || !officer.cityId) continue;
    supported.set(officer.cityId, [...(supported.get(officer.cityId) ?? []), officer.id]);
  }
  for (const order of Object.values(state.strategicOrders)) {
    const officer = state.officers[order.officerId];
    if (!officer || officer.status !== 'serving' || officer.cityId) continue;
    const supportCity = [state.cities[order.sourceCityId], state.cities[order.targetCityId]]
      .find((city) => city?.ownerId === order.factionId)
      ?? Object.values(state.cities)
        .filter((city) => city.ownerId === order.factionId)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!supportCity) continue;
    supported.set(supportCity.id, [...(supported.get(supportCity.id) ?? []), officer.id]);
  }
  return supported;
}

export function applyMonthlyGrowth(state: GameState): GameState {
  const officers = Object.fromEntries(
    Object.values(state.officers).map((officer) => [officer.id, { ...officer }]),
  );
  const supportedOfficerIdsByCity = getSupportedOfficerIdsByCity(state);
  const shortageCities: string[] = [];
  let rngSeed = state.rngSeed;
  const cities = Object.fromEntries(
    Object.values(state.cities).map((city) => {
      const faction = state.factions[city.ownerId];
      if (!faction || faction.isNeutral) return [city.id, { ...city }];
      let disasterPrevention = city.disasterPrevention ?? 0;
      if (state.calendar.month % 3 === 0) {
        const decayRoll = nextRandom(rngSeed);
        rngSeed = decayRoll.seed;
        const decay = Math.floor(decayRoll.value * 4) + 1;
        if (disasterPrevention > decay) disasterPrevention -= decay;
      }
      const workingCity = { ...city, disasterPrevention };
      const supportedOfficers = (supportedOfficerIdsByCity.get(city.id) ?? [])
        .map((officerId) => officers[officerId])
        .filter((officer) => officer?.factionId === city.ownerId);
      for (const officer of supportedOfficers) {
        if (officer.cityId !== city.id) continue;
        if (city.condition === 'drought' || city.condition === 'flood') {
          officers[officer.id] = { ...officer, troops: officer.troops - Math.floor(officer.troops / 4) };
        } else if (city.condition === 'rebellion') {
          officers[officer.id] = { ...officer, troops: Math.floor(officer.troops / 2) };
        }
      }
      const adjustedSupportedOfficers = (supportedOfficerIdsByCity.get(city.id) ?? [])
        .map((officerId) => officers[officerId])
        .filter((officer) => officer?.factionId === city.ownerId);
      const supportedTroops = adjustedSupportedOfficers.reduce((sum, officer) => sum + officer.troops, 0);
      const growth = calculateCityGrowth(workingCity, state.calendar, supportedTroops);
      const availableFood = city.food + (city.food >= MAX_CITY_RESOURCE ? 0 : growth.food);
      const hasShortage = availableFood <= growth.upkeep;
      if (hasShortage) {
        shortageCities.push(city.name);
        for (const officer of adjustedSupportedOfficers) {
          officers[officer.id] = { ...officers[officer.id], troops: Math.floor(officer.troops / 2) };
        }
      }
      return [
        city.id,
        {
          ...workingCity,
          money: city.money >= MAX_CITY_RESOURCE
            ? city.money
            : Math.min(MAX_CITY_RESOURCE, city.money + growth.money),
          food: hasShortage
            ? 0
            : city.food >= MAX_CITY_RESOURCE
              ? availableFood - growth.upkeep
              : Math.min(MAX_CITY_RESOURCE, availableFood - growth.upkeep),
          population: city.population + growth.population,
          condition: hasShortage ? 'famine' : city.condition,
        },
      ];
    }),
  );

  for (const officer of Object.values(officers)) {
    officers[officer.id] = {
      ...officer,
      stamina: officer.status === 'captive' || officer.status === 'dead'
        ? 0
        : Math.min(100, officer.stamina + MONTHLY_STAMINA_RECOVERY),
    };
  }
  let next: GameState = { ...state, cities, officers, rngSeed };
  const seasonal = state.calendar.month % 3 === 0 || state.calendar.month === 6 || state.calendar.month === 10
    ? '本月包含季节性税收或粮食收获。'
    : '本月没有季节性税收或粮食收获。';
  next = appendLogs(next, 'turn', [`各城完成军粮、人口和体力结算。${seasonal}`]);
  if (shortageCities.length > 0) {
    next = appendLogs(next, 'turn', [`${shortageCities.join('、')}粮草不足，所属驻军与在途部队兵力减半。`]);
  }
  return next;
}
