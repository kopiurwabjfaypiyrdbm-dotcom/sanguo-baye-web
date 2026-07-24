import { describe, expect, it } from 'vitest';
import { planAiAction, runAiFactionTurn } from './ai';
import { createSampleState } from './sampleState';
import { beginAiPhase } from './turn';
import { validateGameState } from './validation';

describe('basic AI', () => {
  it('skips when no stationed officer can attack', () => {
    const state = beginAiPhase(createSampleState());
    for (const officer of Object.values(state.officers)) {
      if (officer.factionId === 'liu-bei') officer.troops = 0;
    }
    const next = runAiFactionTurn(state);

    expect(next.rngSeed).toBe(state.rngSeed);
    expect(next.logs.at(-1)?.message).toContain('没有具备出征条件的边境部队');
  });

  it('chooses only an adjacent hostile city when the advantage passes its threshold', () => {
    const state = beginAiPhase(createSampleState());
    state.officers['guan-yu'].troops = 100_000;
    state.cities['chang-an'].reserveTroops = 0;
    const decision = planAiAction(state);

    expect(decision.action).toBe('attack');
    expect(decision.order).toBeDefined();
    expect(state.cities[decision.order!.sourceCityId].neighbors).toContain(decision.order!.targetCityId);
    expect(state.cities[decision.order!.targetCityId].ownerId).not.toBe('liu-bei');
  });

  it('skips when the best legal attack is below the profile threshold', () => {
    const state = beginAiPhase(createSampleState());
    for (const officer of Object.values(state.officers)) {
      if (officer.factionId === 'liu-bei') officer.troops = 1;
    }
    const decision = planAiAction(state);

    expect(decision.action).toBe('skip');
    expect(decision.reason).toContain('低于defensive策略阈值');
  });

  it('executes at most one battle for the active faction', () => {
    const state = beginAiPhase(createSampleState());
    state.officers['guan-yu'].troops = 100_000;
    state.cities['chang-an'].reserveTroops = 0;
    const next = runAiFactionTurn(state);
    const battleStarts = next.logs.filter(
      (log) => log.turn === state.turn && log.kind === 'battle' && log.message.includes('发起进攻'),
    );

    expect(battleStarts).toHaveLength(1);
    expect(next.rngSeed).not.toBe(state.rngSeed);
    expect(validateGameState(next)).toEqual([]);
  });
});
