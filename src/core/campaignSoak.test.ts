import { describe, expect, it } from 'vitest';
import { createBundledScenario, getScenarioRulers, type BundledPeriodId } from '../data/bundledScenarios';
import { parseSave, serializeSave } from './saveGame';
import { advanceTurn, continueAiTurn, finishTurn } from './turn';
import type { GameState } from './types';
import { validateGameState } from './validation';
import { createSampleState } from './sampleState';
import { updateCitySatraps } from './administration';
import { resolveSuccession } from './officerLifecycle';
import { applyBattleResult, executeAttack, type AttackOrder } from './battle';
import {
  createTacticalBattle,
  createTacticalBattleResult,
  runBasicTacticalAi,
} from './tacticalBattle';

function resolvePendingPlayerSuccession(state: GameState): GameState {
  let next = state;
  while (next.pendingSuccession) {
    const pending = next.pendingSuccession;
    next = resolveSuccession(next, pending.candidateOfficerIds[0]);
    if (pending.resumePhase === 'ai') {
      next = continueAiTurn(next, pending.resumeAiFactionIndex!);
    }
  }
  return next;
}

function runCampaign(state: GameState, months: number, reloadEverySixMonths = true): GameState {
  let next = state;
  for (let month = 0; month < months && next.phase !== 'ended'; month += 1) {
    if (reloadEverySixMonths && month > 0 && month % 6 === 0) {
      next = parseSave(serializeSave(next, `长期回归第 ${month} 月`)).state;
    }
    next = resolvePendingPlayerSuccession(advanceTurn(next));
    expect(validateGameState(next)).toEqual([]);
  }
  return next;
}

function strongestRuler(period: BundledPeriodId) {
  return [...getScenarioRulers(period)]
    .sort((a, b) => b.cityCount - a.cityCount || a.sourceIndex - b.sourceIndex)[0];
}

function findPlayerAttack(state: GameState): AttackOrder {
  for (const source of Object.values(state.cities)
    .filter((city) => city.ownerId === state.playerFactionId)
    .sort((a, b) => (a.sourceIndex ?? 999) - (b.sourceIndex ?? 999))) {
    const officer = Object.values(state.officers)
      .filter((candidate) => candidate.status === 'serving'
        && candidate.factionId === state.playerFactionId
        && candidate.cityId === source.id
        && candidate.troops > 0
        && candidate.stamina > 0)
      .sort((a, b) => b.troops - a.troops || a.id.localeCompare(b.id))[0];
    const target = source.neighbors
      .map((cityId) => state.cities[cityId])
      .find((candidate) => candidate.ownerId !== source.ownerId);
    if (officer && target && source.food > 0) {
      return {
        sourceCityId: source.id,
        targetCityId: target.id,
        officerIds: [officer.id],
        provisions: Math.min(source.food, Math.max(1, Math.ceil(officer.troops / 100))),
      };
    }
  }
  throw new Error('scenario has no legal player border attack');
}

function resolveManualBattle(state: GameState, order: AttackOrder): GameState {
  let battle = createTacticalBattle(state, order);
  let steps = 0;
  while (battle.status === 'ongoing' && steps < 100) {
    battle = runBasicTacticalAi(battle);
    steps += 1;
  }
  if (battle.status === 'ongoing') throw new Error('manual tactical AI exceeded its step limit');
  return applyBattleResult(state, createTacticalBattleResult(battle));
}

function runSettlementCampaign(state: GameState, months: number, reloadEverySixMonths: boolean): GameState {
  let next = state;
  const aiFactionId = next.factionOrder.find((factionId) => factionId !== next.playerFactionId)!;
  for (let month = 0; month < months && next.phase !== 'ended'; month += 1) {
    if (reloadEverySixMonths && month > 0 && month % 6 === 0) {
      next = parseSave(serializeSave(next, `结算回归第 ${month} 月`)).state;
    }
    next = resolvePendingPlayerSuccession(finishTurn({
      ...next,
      campaignStarted: true,
      phase: 'ai',
      activeFactionId: aiFactionId,
    }));
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

  it('keeps opt-in aging, succession, and faction dissolution deterministic across all periods', () => {
    let deathCount = 0;
    let dissolutionCount = 0;
    for (const period of [1, 2, 3, 4] as const) {
      const ruler = strongestRuler(period);
      const create = () => {
        const state = createBundledScenario(period, ruler.sourceIndex);
        state.lifecyclePolicy.naturalDeath = 'age-90-coinflip';
        for (const officer of Object.values(state.officers)) {
          if (officer.status !== 'hidden' && officer.status !== 'dead') officer.age = Math.max(89, officer.age);
        }
        return state;
      };

      const uninterrupted = runSettlementCampaign(create(), 60, false);
      const reloaded = runSettlementCampaign(create(), 60, true);

      expect(reloaded).toEqual(uninterrupted);
      expect(validateGameState(reloaded)).toEqual([]);
      deathCount += reloaded.logs.filter((log) =>
        log.message.includes('年迈病逝')).length;
      dissolutionCount += reloaded.logs.filter((log) =>
        log.message.includes('无人可继') || log.message.includes('势力瓦解')).length;
    }

    expect(deathCount).toBeGreaterThan(0);
    expect(dissolutionCount).toBeGreaterThan(1);
  });

  it.each([1, 2, 3, 4] as const)(
    'keeps period %s valid after both quick and manual battles, reload, and twelve settlements',
    (period) => {
      const ruler = strongestRuler(period);
      const create = () => createBundledScenario(period, ruler.sourceIndex);
      const quickStart = create();
      const manualStart = create();
      const order = findPlayerAttack(quickStart);

      const quick = runSettlementCampaign(
        parseSave(serializeSave(resolvePendingPlayerSuccession(executeAttack(quickStart, order)))).state,
        12,
        true,
      );
      const manual = runSettlementCampaign(
        parseSave(serializeSave(resolvePendingPlayerSuccession(resolveManualBattle(manualStart, order)))).state,
        12,
        true,
      );

      expect(validateGameState(quick)).toEqual([]);
      expect(validateGameState(manual)).toEqual([]);
      expect(quick.phase === 'ended' || quick.turn >= 13).toBe(true);
      expect(manual.phase === 'ended' || manual.turn >= 13).toBe(true);
    },
  );
});
