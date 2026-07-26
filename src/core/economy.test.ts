import { describe, expect, it } from 'vitest';
import { MONTHLY_STAMINA_RECOVERY, applyMonthlyGrowth, calculateCityGrowth } from './economy';
import { createSampleState } from './sampleState';
import { issueMoveOrder } from './strategicOrders';

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

  it('keeps captives at zero stamina during monthly recovery', () => {
    const state = createSampleState();
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'captive',
      cityId: 'luoyang',
      captorFactionId: 'cao-cao',
      formerFactionId: 'liu-bei',
      troops: 0,
      stamina: 0,
    };

    const next = applyMonthlyGrowth(state);

    expect(next.officers['chen-gong'].stamina).toBe(0);
  });

  it('charges and applies shortages to troops supported from an order source city', () => {
    const state = issueMoveOrder(createSampleState(), {
      sourceCityId: 'chenliu',
      targetCityId: 'chang-an',
      officerId: 'zhang-liao',
    });
    state.cities.chenliu.food = 0;

    const next = applyMonthlyGrowth(state);

    expect(next.officers['zhang-liao'].cityId).toBeUndefined();
    expect(next.officers['zhang-liao'].troops).toBe(Math.floor(state.officers['zhang-liao'].troops / 2));
    expect(next.logs.at(-1)?.message).toContain('在途部队兵力减半');
  });

  it('does not truncate transport-created resources above the normal production cap', () => {
    const state = createSampleState();
    state.calendar.month = 2;
    state.cities.luoyang.money = 40_000;
    state.cities.luoyang.food = 40_000;

    const next = applyMonthlyGrowth(state);

    expect(next.cities.luoyang.money).toBe(40_000);
    expect(next.cities.luoyang.food).toBeGreaterThan(30_000);
    expect(next.cities.luoyang.food).toBeLessThan(40_000);
  });
});
