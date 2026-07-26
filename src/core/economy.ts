import { appendLogs } from './logs';
import type { City, GameState } from './types';

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

export function applyMonthlyGrowth(state: GameState): GameState {
  const officers = Object.fromEntries(
    Object.values(state.officers).map((officer) => [officer.id, { ...officer }]),
  );
  const transitOfficersBySupportCity = new Map<string, string[]>();
  for (const order of Object.values(state.strategicOrders)) {
    const officer = officers[order.officerId];
    if (!officer || officer.status !== 'serving' || officer.cityId) continue;
    const supportCity = [state.cities[order.sourceCityId], state.cities[order.targetCityId]]
      .find((city) => city?.ownerId === order.factionId)
      ?? Object.values(state.cities)
        .filter((city) => city.ownerId === order.factionId)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!supportCity) continue;
    transitOfficersBySupportCity.set(supportCity.id, [
      ...(transitOfficersBySupportCity.get(supportCity.id) ?? []),
      officer.id,
    ]);
  }
  const shortageCities: string[] = [];
  const cities = Object.fromEntries(
    Object.values(state.cities).map((city) => {
      const faction = state.factions[city.ownerId];
      if (!faction || faction.isNeutral) return [city.id, { ...city }];
      const stationed = Object.values(officers).filter(
        (officer) => officer.status === 'serving' && officer.cityId === city.id && officer.factionId === city.ownerId,
      );
      const supportedTransit = (transitOfficersBySupportCity.get(city.id) ?? [])
        .map((officerId) => officers[officerId]);
      const supportedTroops = [...stationed, ...supportedTransit].reduce((sum, officer) => sum + officer.troops, 0);
      const growth = calculateCityGrowth(city, state.calendar, supportedTroops);
      const availableFood = city.food + growth.food;
      const hasShortage = availableFood <= growth.upkeep;
      if (hasShortage) {
        shortageCities.push(city.name);
        for (const officer of [...stationed, ...supportedTransit]) {
          officers[officer.id] = { ...officers[officer.id], troops: Math.floor(officer.troops / 2) };
        }
      }
      return [
        city.id,
        {
          ...city,
          money: Math.min(MAX_CITY_RESOURCE, city.money + growth.money),
          food: hasShortage ? 0 : Math.min(MAX_CITY_RESOURCE, availableFood - growth.upkeep),
          population: city.population + growth.population,
        },
      ];
    }),
  );

  for (const officer of Object.values(officers)) {
    officers[officer.id] = {
      ...officer,
      stamina: officer.status === 'captive'
        ? 0
        : Math.min(100, officer.stamina + MONTHLY_STAMINA_RECOVERY),
    };
  }
  let next: GameState = { ...state, cities, officers };
  const seasonal = state.calendar.month % 3 === 0 || state.calendar.month === 6 || state.calendar.month === 10
    ? '本月包含季节性税收或粮食收获。'
    : '本月没有季节性税收或粮食收获。';
  next = appendLogs(next, 'turn', [`各城完成军粮、人口和体力结算。${seasonal}`]);
  if (shortageCities.length > 0) {
    next = appendLogs(next, 'turn', [`${shortageCities.join('、')}粮草不足，所属驻军与在途部队兵力减半。`]);
  }
  return next;
}
