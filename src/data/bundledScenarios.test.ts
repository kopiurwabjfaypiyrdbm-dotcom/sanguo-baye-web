import { describe, expect, it } from 'vitest';
import { advanceTurn } from '../core/turn';
import { settleAnnualProgression } from '../core/annualProgression';
import { validateGameState } from '../core/validation';
import { createBundledScenario, getScenarioOptions, getScenarioRulers } from './bundledScenarios';
import { DEFAULT_STARTING_TROOPS } from './legacyScenario';
import bundledData from './generated/baye-periods.json';

describe('bundled original scenarios', () => {
  it('loads the complete item catalog, hidden city inventories, and original equipment', () => {
    const state = createBundledScenario(1, getScenarioRulers(1)[0].sourceIndex);
    expect(Object.keys(state.items)).toHaveLength(33);
    expect(Object.values(state.cities).flatMap((city) => city.hiddenItemIds ?? []).length).toBe(22);
    expect(Object.values(state.officers).some((officer) => (officer.equipmentItemIds?.length ?? 0) > 0)).toBe(true);
    expect(validateGameState(state)).toEqual([]);
  });

  it.each([
    [1, 30, 30],
    [2, 15, 8],
    [3, 16, 10],
    [4, 8, 3],
  ] as const)('retains period %s sparse conditions without rescheduling queued people', (
    period,
    expectedSparseCount,
    expectedHiddenCount,
  ) => {
    const state = createBundledScenario(period, getScenarioRulers(period)[0].sourceIndex);
    const scheduled = Object.values(state.officers).filter((officer) => officer.appearanceYear !== undefined);
    const generatedPeriod = bundledData.periods.find((candidate) => candidate.period === period)!;

    expect(generatedPeriod.persons.filter((person) => person.appearanceYear !== undefined))
      .toHaveLength(expectedSparseCount);
    expect(generatedPeriod.itemAppearances).toEqual([]);
    expect(scheduled).toHaveLength(expectedHiddenCount);
    expect(scheduled.every(
      (officer) => officer.status === 'hidden' && officer.appearanceYear! > state.calendar.year,
    )).toBe(true);
    expect(Object.values(state.items).filter((item) => item.appearanceYear !== undefined)).toHaveLength(0);
  });

  it('places a due bundled officer in the fixed original city at age 16', () => {
    const state = createBundledScenario(1, getScenarioRulers(1)[0].sourceIndex);
    expect(state.officers['officer-54']).toMatchObject({
      name: '孙策',
      appearanceYear: 191,
      appearanceCityId: 'city-33',
    });

    state.calendar = { year: 191, month: 1 };
    const january = settleAnnualProgression(state, { year: 190, month: 12 });
    expect(january.officers['officer-54']).toMatchObject({
      status: 'free',
      cityId: 'city-33',
      age: 16,
    });
  });
  it('offers all four original periods without a local file dependency', () => {
    const options = getScenarioOptions();

    expect(options.map((option) => option.title)).toEqual(['董卓弄权', '曹操崛起', '赤壁之战', '三国鼎立']);
    expect(new Set(options.map((option) => option.year)).size).toBe(4);
    expect(options.every((option) => option.rulerCount > 0)).toBe(true);
  });

  it.each([1, 2, 3, 4] as const)('creates a validated 38-city state for period %s', (period) => {
    const rulers = getScenarioRulers(period);
    const state = createBundledScenario(period, rulers[0].sourceIndex);

    expect(Object.keys(state.cities)).toHaveLength(38);
    expect(Object.keys(state.officers)).toHaveLength(200);
    expect(state.scenario).toMatchObject({ source: 'baye-legacy', period });
    expect(state.factionOrder).toHaveLength(rulers.length);
    expect(new Set(Object.values(state.officers)
      .filter((officer) => officer.status === 'serving')
      .map((officer) => officer.troops))).toEqual(new Set([DEFAULT_STARTING_TROOPS]));
    expect(validateGameState(state)).toEqual([]);
  });

  it.each([1, 2, 3, 4] as const)('advances bundled period %s through a complete month', (period) => {
    const rulers = getScenarioRulers(period);
    const strongest = [...rulers].sort((a, b) => b.cityCount - a.cityCount || a.sourceIndex - b.sourceIndex)[0];
    const next = advanceTurn(createBundledScenario(period, strongest.sourceIndex));

    expect(next.turn).toBe(2);
    expect(next.phase).toBe('player');
    expect(validateGameState(next)).toEqual([]);
  });

  it.each([1, 2, 3, 4] as const)('keeps bundled period %s valid through six campaign months', (period) => {
    const rulers = getScenarioRulers(period);
    const strongest = [...rulers].sort((a, b) => b.cityCount - a.cityCount || a.sourceIndex - b.sourceIndex)[0];
    let state = createBundledScenario(period, strongest.sourceIndex);
    for (let month = 0; month < 6 && state.phase !== 'ended'; month += 1) state = advanceTurn(state);

    expect(state.turn).toBe(7);
    expect(state.phase).toBe('player');
    expect(validateGameState(state)).toEqual([]);
  });
});
