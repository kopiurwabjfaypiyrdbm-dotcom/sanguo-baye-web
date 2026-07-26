import { describe, expect, it } from 'vitest';
import { createSampleState } from './sampleState';
import { applyCityConditionEffect, resolveCityCondition, settleCityEvents } from './cityEvents';
import { parseSave, serializeSave } from './saveGame';
import { validateGameState } from './validation';
import { nextRandom } from './random';

describe('city events', () => {
  it('applies the fixed flood losses with integer truncation', () => {
    const state = createSampleState();
    const city = {
      ...state.cities.luoyang,
      condition: 'flood' as const,
      farming: 101,
      commerce: 101,
      money: 101,
      food: 101,
      reserveTroops: 101,
      population: 101,
    };

    expect(applyCityConditionEffect(city)).toMatchObject({
      condition: 'flood',
      farming: 96,
      commerce: 91,
      money: 91,
      food: 96,
      reserveTroops: 76,
      population: 76,
    });
  });

  it('applies famine, drought, and rebellion loss bands', () => {
    const state = createSampleState();
    const base = {
      ...state.cities.luoyang,
      farming: 100,
      commerce: 100,
      money: 100,
      food: 100,
      reserveTroops: 100,
      population: 100,
      publicLoyalty: 100,
    };
    expect(applyCityConditionEffect({ ...base, condition: 'famine' })).toMatchObject({
      farming: 95, commerce: 95, reserveTroops: 50, population: 75, publicLoyalty: 95,
    });
    expect(applyCityConditionEffect({ ...base, condition: 'drought' })).toMatchObject({
      farming: 95, food: 95, reserveTroops: 75, population: 75,
    });
    expect(applyCityConditionEffect({ ...base, condition: 'rebellion' })).toMatchObject({
      farming: 95, food: 95, commerce: 95, money: 95, reserveTroops: 50, publicLoyalty: 90,
    });
  });

  it('keeps event transitions deterministic and saveable', () => {
    const state = createSampleState();
    for (const city of Object.values(state.cities)) {
      if (city.ownerId === state.playerFactionId) {
        city.disasterPrevention = 0;
        city.publicLoyalty = 0;
      }
    }
    const first = settleCityEvents(structuredClone(state));
    const second = settleCityEvents(structuredClone(state));

    expect(first).toEqual(second);
    expect(first.rngSeed).not.toBe(state.rngSeed);
    expect(parseSave(serializeSave(first)).state).toEqual(first);
    expect(validateGameState(first)).toEqual([]);
  });

  it('locks strict event and recovery comparison boundaries', () => {
    const city = {
      ...createSampleState().cities.luoyang,
      condition: 'normal' as const,
      disasterPrevention: 50,
      publicLoyalty: 50,
    };
    expect(resolveCityCondition(city, 50, 0)).toBe('normal');
    expect(resolveCityCondition(city, 51, 0)).toBe('drought');
    expect(resolveCityCondition(city, 51, 1)).toBe('flood');
    expect(resolveCityCondition(city, 51, 2, 50)).toBe('normal');
    expect(resolveCityCondition(city, 51, 2, 51)).toBe('rebellion');
    expect(resolveCityCondition({ ...city, condition: 'flood' }, 50)).toBe('flood');
    expect(resolveCityCondition({ ...city, condition: 'flood' }, 49)).toBe('normal');
    expect(resolveCityCondition({ ...city, condition: 'rebellion' }, 50)).toBe('rebellion');
    expect(resolveCityCondition({ ...city, condition: 'rebellion' }, 49)).toBe('normal');
  });

  it('does not apply disaster losses until the month after a new event is generated', () => {
    const city = {
      ...createSampleState().cities.luoyang,
      condition: 'normal' as const,
      disasterPrevention: 0,
      farming: 100,
    };
    const generated = resolveCityCondition(city, 1, 0);
    expect(generated).toBe('drought');
    expect(applyCityConditionEffect(city).farming).toBe(100);
    expect(applyCityConditionEffect({ ...city, condition: generated }).farming).toBe(95);
  });

  it('locks settle orchestration to two or three event RNG calls and applies new losses next month', () => {
    const build = () => {
      const state = createSampleState();
      for (const city of Object.values(state.cities)) {
        city.condition = 'normal';
        city.disasterPrevention = 100;
        city.publicLoyalty = 100;
      }
      const activeCities = Object.values(state.cities)
        .filter((city) => !state.factions[city.ownerId]?.isNeutral);
      const target = activeCities[0];
      target.disasterPrevention = 0;
      target.publicLoyalty = 0;
      target.farming = 100;
      return { state, target, activeCount: activeCities.length };
    };
    const findSeed = (kind: number) => {
      for (let seed = 1; seed < 100_000; seed += 1) {
        const primary = nextRandom(seed);
        const kindRandom = nextRandom(primary.seed);
        const rebellion = nextRandom(kindRandom.seed);
        if (Math.floor(primary.value * 100) > 0
          && Math.floor(kindRandom.value * 5) === kind
          && (kind !== 2 || Math.floor(rebellion.value * 100) > 0)) return seed;
      }
      throw new Error(`missing deterministic seed for event kind ${kind}`);
    };

    for (const [kind, expectedCondition, extraCalls] of [
      [0, 'drought', 1],
      [2, 'rebellion', 2],
    ] as const) {
      const { state, target, activeCount } = build();
      state.rngSeed = findSeed(kind);
      let expectedSeed = state.rngSeed;
      for (let call = 0; call < activeCount + extraCalls; call += 1) {
        expectedSeed = nextRandom(expectedSeed).seed;
      }
      const next = settleCityEvents(state);

      expect(next.cities[target.id].condition).toBe(expectedCondition);
      expect(next.cities[target.id].farming).toBe(100);
      expect(next.rngSeed).toBe(expectedSeed);
    }
  });

  it('recovers famine after food is restored and logs a player recovery', () => {
    const state = createSampleState();
    state.cities.luoyang.condition = 'famine';
    state.cities.luoyang.food = 100;
    const next = settleCityEvents(state);

    expect(next.cities.luoyang.condition).toBe('normal');
    expect(next.logs.some((log) => log.message.includes('洛阳已从饥荒中恢复'))).toBe(true);
  });
});
