import { appendLogs } from './logs';
import type { City, GameState } from './types';

export type CityGrowth = {
  money: number;
  food: number;
  reserveTroops: number;
};

export function calculateCityGrowth(city: City): CityGrowth {
  return {
    money: Math.max(0, Math.floor(city.commerce * 0.75 + city.population / 5_000)),
    food: Math.max(0, Math.floor(city.farming * 1.2 + city.population / 2_500)),
    reserveTroops: Math.max(0, Math.floor(city.population / 20_000 + city.defense / 50)),
  };
}

export function applyMonthlyGrowth(state: GameState): GameState {
  const cities = Object.fromEntries(
    Object.values(state.cities).map((city) => {
      const growth = calculateCityGrowth(city);
      return [
        city.id,
        {
          ...city,
          money: city.money + growth.money,
          food: city.food + growth.food,
          reserveTroops: city.reserveTroops + growth.reserveTroops,
        },
      ];
    }),
  );
  const officers = Object.fromEntries(
    Object.values(state.officers).map((officer) => [
      officer.id,
      { ...officer, stamina: Math.min(100, officer.stamina + 25) },
    ]),
  );
  const next: GameState = { ...state, cities, officers };
  return appendLogs(next, 'turn', ['各城完成本月资源与预备兵结算。']);
}
