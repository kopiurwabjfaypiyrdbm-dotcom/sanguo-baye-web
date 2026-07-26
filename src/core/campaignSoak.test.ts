import { describe, expect, it } from 'vitest';
import { createBundledScenario, getScenarioRulers, type BundledPeriodId } from '../data/bundledScenarios';
import { parseSave, serializeSave } from './saveGame';
import { advanceTurn } from './turn';
import type { GameState } from './types';
import { validateGameState } from './validation';

function runCampaign(state: GameState, months: number): GameState {
  let next = state;
  for (let month = 0; month < months && next.phase !== 'ended'; month += 1) {
    if (month > 0 && month % 6 === 0) {
      next = parseSave(serializeSave(next, `长期回归第 ${month} 月`)).state;
    }
    next = advanceTurn(next);
    expect(validateGameState(next)).toEqual([]);
  }
  return next;
}

function strongestRuler(period: BundledPeriodId) {
  return [...getScenarioRulers(period)]
    .sort((a, b) => b.cityCount - a.cityCount || a.sourceIndex - b.sourceIndex)[0];
}

describe('long campaign soak', () => {
  it.each([1, 2, 3, 4] as const)('keeps bundled period %s valid for up to 36 months', (period) => {
    const ruler = strongestRuler(period);
    const state = runCampaign(createBundledScenario(period, ruler.sourceIndex), 36);

    expect(state.phase === 'ended' || state.turn === 37).toBe(true);
    if (state.phase === 'ended') expect(['victory', 'defeat']).toContain(state.outcome);
    else expect(state.activeFactionId).toBe(state.playerFactionId);
  });

  it('keeps a one-city weak ruler deterministic through an extended campaign', () => {
    const period = 1 as const;
    const ruler = [...getScenarioRulers(period)]
      .sort((a, b) => a.cityCount - b.cityCount || a.sourceIndex - b.sourceIndex)[0];
    const create = () => createBundledScenario(period, ruler.sourceIndex);

    const first = runCampaign(create(), 36);
    const second = runCampaign(create(), 36);

    expect(first).toEqual(second);
    expect(first.phase === 'ended' || first.turn === 37).toBe(true);
  });
});
