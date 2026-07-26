import type { City, StrategicOrder } from './types';

export type StrategicCargo = StrategicOrder['cargo'];

export function canCreditStrategicCargo(city: City, cargo: StrategicCargo): boolean {
  return Number.isSafeInteger(city.money + cargo.money)
    && Number.isSafeInteger(city.food + cargo.food)
    && Number.isSafeInteger(city.reserveTroops + cargo.reserveTroops);
}

export function creditStrategicCargo(city: City, cargo: StrategicCargo): City {
  if (!canCreditStrategicCargo(city, cargo)) {
    throw new Error(`城市 ${city.name} 无法安全接收运输资源`);
  }
  return {
    ...city,
    money: city.money + cargo.money,
    food: city.food + cargo.food,
    reserveTroops: city.reserveTroops + cargo.reserveTroops,
  };
}

export function creditStrategicCargoAcrossCities(
  cities: Record<string, City>,
  candidates: City[],
  cargo: StrategicCargo,
): string[] {
  const candidateIds = candidates
    .map((city) => city.id)
    .filter((cityId, index, ids) => ids.indexOf(cityId) === index);
  const destinationIds: string[] = [];
  for (const field of ['money', 'food', 'reserveTroops'] as const) {
    const amount = cargo[field];
    if (amount === 0) continue;
    const destinationId = candidateIds.find((cityId) =>
      Number.isSafeInteger(cities[cityId][field] + amount));
    if (!destinationId) throw new Error(`没有城市可以安全接收运输资源：${field}`);
    cities[destinationId] = {
      ...cities[destinationId],
      [field]: cities[destinationId][field] + amount,
    };
    destinationIds.push(destinationId);
  }
  return destinationIds.filter((cityId, index, ids) => ids.indexOf(cityId) === index);
}

export function formatStrategicCargo(cargo: StrategicCargo): string {
  return [
    cargo.money > 0 ? `${cargo.money} 金` : '',
    cargo.food > 0 ? `${cargo.food} 粮` : '',
    cargo.reserveTroops > 0 ? `${cargo.reserveTroops} 后备兵` : '',
  ].filter(Boolean).join('、');
}
