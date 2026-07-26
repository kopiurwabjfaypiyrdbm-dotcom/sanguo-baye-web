import { appendLogs } from './logs';
import { nextRandom } from './random';
import type { GameState } from './types';

export const PERSON_APPEAR_AGE = 16;

export function settleAnnualProgression(
  state: GameState,
  previousCalendar: GameState['calendar'],
): GameState {
  if (state.calendar.month !== 1 || state.calendar.year !== previousCalendar.year + 1) return state;

  let seed = state.rngSeed;
  let appearedOfficerCount = 0;
  let appearedItemCount = 0;
  const cities = Object.fromEntries(
    Object.entries(state.cities).map(([cityId, city]) => [
      cityId,
      {
        ...city,
        itemIds: [...(city.itemIds ?? [])],
        hiddenItemIds: [...(city.hiddenItemIds ?? [])],
      },
    ]),
  );
  const orderedCities = Object.values(cities).sort(
    (left, right) => (left.sourceIndex ?? Number.MAX_SAFE_INTEGER) - (right.sourceIndex ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id),
  );

  const placedItemIds = new Set(
    Object.values(cities).flatMap((city) => [...(city.itemIds ?? []), ...(city.hiddenItemIds ?? [])]),
  );
  for (const officer of Object.values(state.officers)) {
    for (const itemId of officer.equipmentItemIds ?? []) placedItemIds.add(itemId);
  }
  for (const item of Object.values(state.items).sort(bySourceIdThenId)) {
    if (item.appearanceYear !== state.calendar.year || placedItemIds.has(item.id)) continue;
    const targetCity = item.appearanceCityId ? cities[item.appearanceCityId] : undefined;
    if (!targetCity) continue;
    targetCity.hiddenItemIds = [...(targetCity.hiddenItemIds ?? []), item.id];
    placedItemIds.add(item.id);
    appearedItemCount += 1;
  }

  const officers = Object.fromEntries(
    Object.entries(state.officers).map(([officerId, officer]) => [
      officerId,
      {
        ...officer,
        age: state.lifecyclePolicy.ageGrowth === 'enabled' && officer.status !== 'dead'
          ? officer.age + 1
          : officer.age,
      },
    ]),
  );
  for (const officer of Object.values(officers).sort(bySourceIdThenId)) {
    if (officer.status !== 'hidden' || officer.appearanceYear !== state.calendar.year) continue;
    let targetCityId = officer.appearanceCityId;
    if (!targetCityId) {
      const random = nextRandom(seed);
      seed = random.seed;
      targetCityId = orderedCities[Math.floor(random.value * orderedCities.length)]?.id;
    }
    if (!targetCityId || !cities[targetCityId]) continue;
    officers[officer.id] = {
      ...officer,
      status: 'free',
      factionId: neutralFactionId(state),
      cityId: targetCityId,
      age: state.lifecyclePolicy.ageGrowth === 'enabled' ? PERSON_APPEAR_AGE : officer.age,
      troops: 0,
    };
    appearedOfficerCount += 1;
  }

  return appendLogs(
    { ...state, rngSeed: seed, cities, officers },
    'turn',
    [
      `年度更新：${state.lifecyclePolicy.ageGrowth === 'enabled' ? '人物年龄增长 1 岁' : '人物年龄按战役规则保持不变'}`
        + (appearedOfficerCount > 0 ? '；各地传来新人才出仕前的活动消息' : '')
        + (appearedItemCount > 0 ? '；有新道具进入各地隐藏库存' : '')
        + '。',
    ],
  );
}

function neutralFactionId(state: GameState): string {
  return Object.values(state.factions).find((faction) => faction.isNeutral)?.id ?? 'neutral';
}

function bySourceIdThenId(
  left: { id: string; sourceId?: number },
  right: { id: string; sourceId?: number },
): number {
  return (left.sourceId ?? Number.MAX_SAFE_INTEGER) - (right.sourceId ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id);
}
