import { describe, expect, it } from 'vitest';
import { createBundledScenario, getScenarioRulers, type BundledPeriodId } from '../data/bundledScenarios';
import { parseSave, serializeSave } from './saveGame';
import { advanceTurn, finishTurn } from './turn';
import type { GameState } from './types';
import { validateGameState } from './validation';
import { createSampleState } from './sampleState';
import { updateCitySatraps } from './administration';

function runCampaign(state: GameState, months: number, reloadEverySixMonths = true): GameState {
  let next = state;
  for (let month = 0; month < months && next.phase !== 'ended'; month += 1) {
    if (reloadEverySixMonths && month > 0 && month % 6 === 0) {
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

function runSettlementCampaign(state: GameState, months: number, reloadEverySixMonths: boolean): GameState {
  let next = state;
  const aiFactionId = next.factionOrder.find((factionId) => factionId !== next.playerFactionId)!;
  for (let month = 0; month < months; month += 1) {
    if (reloadEverySixMonths && month > 0 && month % 6 === 0) {
      next = parseSave(serializeSave(next, `结算回归第 ${month} 月`)).state;
    }
    next = finishTurn({
      ...next,
      campaignStarted: true,
      phase: 'ai',
      activeFactionId: aiFactionId,
    });
    expect(validateGameState(next)).toEqual([]);
  }
  return next;
}

describe('long campaign soak', () => {
  it.each([1, 2, 3, 4] as const)('settles all 48 months for period %s identically across reloads', (period) => {
    const ruler = strongestRuler(period);
    const create = () => createBundledScenario(period, ruler.sourceIndex);

    const uninterrupted = runSettlementCampaign(create(), 48, false);
    const reloaded = runSettlementCampaign(create(), 48, true);

    expect(reloaded).toEqual(uninterrupted);
    expect(reloaded.turn).toBe(49);
    expect(reloaded.phase).toBe('player');
    expect(reloaded.logs.filter((log) => log.message.startsWith('年度更新：'))).toHaveLength(4);
  });

  it.each([1, 2, 3, 4] as const)('keeps bundled period %s valid for up to 48 months', (period) => {
    const ruler = strongestRuler(period);
    const state = runCampaign(createBundledScenario(period, ruler.sourceIndex), 48);

    expect(state.phase === 'ended' || state.turn === 49).toBe(true);
    if (state.phase === 'ended') expect(['victory', 'defeat']).toContain(state.outcome);
    else {
      expect(state.activeFactionId).toBe(state.playerFactionId);
      expect(state.logs.some((log) => log.message.startsWith('年度更新：'))).toBe(true);
    }
  });

  it('keeps a one-city weak ruler deterministic through an extended campaign', () => {
    const period = 1 as const;
    const ruler = [...getScenarioRulers(period)]
      .sort((a, b) => a.cityCount - b.cityCount || a.sourceIndex - b.sourceIndex)[0];
    const create = () => createBundledScenario(period, ruler.sourceIndex);

    const first = runCampaign(create(), 48);
    const second = runCampaign(create(), 48);

    expect(first).toEqual(second);
    expect(first.phase === 'ended' || first.turn === 49).toBe(true);
  });

  it('keeps a full AI diplomacy campaign identical across periodic reloads', () => {
    const create = () => {
      const state = createSampleState();
      state.officers['xiahou-dun'].loyalty = 0;
      state.officers['zhuge-liang'].cityId = 'chengdu';
      return updateCitySatraps(state);
    };

    const uninterrupted = runCampaign(create(), 24, false);
    const reloaded = runCampaign(create(), 24, true);

    expect(reloaded).toEqual(uninterrupted);
    expect(reloaded.logs.some((log) =>
      ['离间', '招揽', '策反', '劝降'].some((keyword) => log.message.includes(keyword)))).toBe(true);
    expect(validateGameState(reloaded)).toEqual([]);
  });
});
