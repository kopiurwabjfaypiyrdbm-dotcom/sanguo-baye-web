import { describe, expect, it } from 'vitest';
import { advanceTurn } from '../core/turn';
import { validateGameState } from '../core/validation';
import { createBundledScenario, getScenarioOptions, getScenarioRulers } from './bundledScenarios';
import { DEFAULT_STARTING_TROOPS } from './legacyScenario';

describe('bundled original scenarios', () => {
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
