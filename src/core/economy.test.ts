import { describe, expect, it } from 'vitest';
import { applyMonthlyGrowth, calculateCityGrowth } from './economy';
import { createSampleState } from './sampleState';

describe('monthly economy', () => {
  it('calculates non-negative growth from city attributes', () => {
    const city = createSampleState().cities.luoyang;
    const growth = calculateCityGrowth(city);

    expect(growth.money).toBeGreaterThan(0);
    expect(growth.food).toBeGreaterThan(0);
    expect(growth.reserveTroops).toBeGreaterThan(0);
  });

  it('grows resources and restores stamina immutably', () => {
    const state = createSampleState();
    state.officers['cao-cao'].stamina = 0;
    const snapshot = structuredClone(state);
    const next = applyMonthlyGrowth(state);

    expect(next.cities.luoyang.money).toBeGreaterThan(state.cities.luoyang.money);
    expect(next.cities.luoyang.food).toBeGreaterThan(state.cities.luoyang.food);
    expect(next.officers['cao-cao'].stamina).toBe(25);
    expect(state).toEqual(snapshot);
  });
});
