import { describe, expect, it } from 'vitest';
import { MONTHLY_STAMINA_RECOVERY, applyMonthlyGrowth, calculateCityGrowth } from './economy';
import { createSampleState } from './sampleState';

describe('monthly economy', () => {
  it('uses quarterly taxes, seasonal harvests, and troop upkeep', () => {
    const city = createSampleState().cities.luoyang;
    const february = calculateCityGrowth(city, { year: 190, month: 2 }, 5_000);
    const june = calculateCityGrowth(city, { year: 190, month: 6 }, 5_000);

    expect(february.money).toBe(0);
    expect(february.food).toBe(0);
    expect(february.upkeep).toBe(160);
    expect(june.money).toBe(Math.floor(city.commerce / 2));
    expect(june.food).toBe(Math.floor(city.farming / 4));
  });

  it('settles food, population, and stamina immutably', () => {
    const state = createSampleState();
    state.calendar.month = 2;
    state.officers['cao-cao'].stamina = 0;
    const snapshot = structuredClone(state);
    const next = applyMonthlyGrowth(state);

    expect(next.cities.luoyang.money).toBe(state.cities.luoyang.money);
    expect(next.cities.luoyang.food).toBeLessThan(state.cities.luoyang.food);
    expect(next.cities.luoyang.population).toBe(state.cities.luoyang.population + 50);
    expect(next.officers['cao-cao'].stamina).toBe(MONTHLY_STAMINA_RECOVERY);
    expect(state).toEqual(snapshot);
  });

  it('halves stationed troops when the city cannot pay food upkeep', () => {
    const state = createSampleState();
    state.calendar.month = 2;
    state.cities.luoyang.food = 0;
    const next = applyMonthlyGrowth(state);

    expect(next.cities.luoyang.food).toBe(0);
    expect(next.officers['cao-cao'].troops).toBe(Math.floor(state.officers['cao-cao'].troops / 2));
    expect(next.logs.at(-1)?.message).toContain('粮草不足');
  });
});
