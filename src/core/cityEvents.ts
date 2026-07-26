import { appendLogs } from './logs';
import { nextRandom } from './random';
import type { City, CityCondition, GameState } from './types';
import { assertValidGameState } from './validation';

export const CITY_CONDITION_LABELS: Record<CityCondition, string> = {
  normal: '正常',
  famine: '饥荒',
  drought: '旱灾',
  flood: '水灾',
  rebellion: '暴动',
};

function reduceByFraction(value: number, divisor: number): number {
  return value - Math.floor(value / divisor);
}

export function applyCityConditionEffect(city: City): City {
  const condition = city.condition ?? 'normal';
  if (condition === 'normal') return { ...city, condition: 'normal' };
  const common = { ...city, condition, farming: reduceByFraction(city.farming, 20) };
  switch (condition) {
    case 'famine':
      return {
        ...common,
        commerce: reduceByFraction(city.commerce, 20),
        publicLoyalty: reduceByFraction(city.publicLoyalty ?? 70, 20),
        reserveTroops: Math.floor(city.reserveTroops / 2),
        population: reduceByFraction(city.population, 4),
      };
    case 'drought':
      return {
        ...common,
        food: reduceByFraction(city.food, 20),
        reserveTroops: reduceByFraction(city.reserveTroops, 4),
        population: reduceByFraction(city.population, 4),
      };
    case 'flood':
      return {
        ...common,
        food: reduceByFraction(city.food, 20),
        commerce: reduceByFraction(city.commerce, 10),
        money: reduceByFraction(city.money, 10),
        reserveTroops: reduceByFraction(city.reserveTroops, 4),
        population: reduceByFraction(city.population, 4),
      };
    case 'rebellion':
      return {
        ...common,
        food: reduceByFraction(city.food, 20),
        commerce: reduceByFraction(city.commerce, 20),
        money: reduceByFraction(city.money, 20),
        publicLoyalty: reduceByFraction(city.publicLoyalty ?? 70, 10),
        reserveTroops: Math.floor(city.reserveTroops / 2),
      };
  }
}

export function resolveCityCondition(
  city: City,
  primaryRoll: number,
  kindRoll?: number,
  rebellionRoll?: number,
): CityCondition {
  const previous = city.condition ?? 'normal';
  if (previous === 'normal') {
    if (primaryRoll <= (city.disasterPrevention ?? 0)) return 'normal';
    if (kindRoll === 0) return 'drought';
    if (kindRoll === 1) return 'flood';
    if (kindRoll === 2 && rebellionRoll !== undefined
      && rebellionRoll > (city.publicLoyalty ?? 70)) return 'rebellion';
    return 'normal';
  }
  if (previous === 'famine') return city.food > 0 ? 'normal' : 'famine';
  if (previous === 'drought' || previous === 'flood') {
    return primaryRoll < (city.disasterPrevention ?? 0) ? 'normal' : previous;
  }
  return primaryRoll < (city.publicLoyalty ?? 70) ? 'normal' : 'rebellion';
}

export function settleCityEvents(state: GameState): GameState {
  let rngSeed = state.rngSeed;
  const messages: string[] = [];
  const cities = Object.fromEntries(Object.values(state.cities).map((sourceCity) => {
    const faction = state.factions[sourceCity.ownerId];
    if (!faction || faction.isNeutral) return [sourceCity.id, { ...sourceCity }];
    const previous = sourceCity.condition ?? 'normal';
    const affected = applyCityConditionEffect(sourceCity);
    const first = nextRandom(rngSeed);
    rngSeed = first.seed;
    const roll100 = Math.floor(first.value * 100);
    let kind: number | undefined;
    let rebellion: number | undefined;
    if (previous === 'normal' && roll100 > (affected.disasterPrevention ?? 0)) {
      const kindRandom = nextRandom(rngSeed);
      rngSeed = kindRandom.seed;
      kind = Math.floor(kindRandom.value * 5);
      if (kind === 2) {
        const rebellionRandom = nextRandom(rngSeed);
        rngSeed = rebellionRandom.seed;
        rebellion = Math.floor(rebellionRandom.value * 100);
      }
    }
    const condition = resolveCityCondition(affected, roll100, kind, rebellion);

    if (condition !== previous && sourceCity.ownerId === state.playerFactionId) {
      messages.push(condition === 'normal'
        ? `${sourceCity.name}已从${CITY_CONDITION_LABELS[previous]}中恢复。`
        : `${sourceCity.name}发生${CITY_CONDITION_LABELS[condition]}。`);
    }
    return [sourceCity.id, { ...affected, condition }];
  }));
  let next: GameState = { ...state, cities, rngSeed };
  if (messages.length > 0) next = appendLogs(next, 'turn', messages);
  assertValidGameState(next);
  return next;
}
