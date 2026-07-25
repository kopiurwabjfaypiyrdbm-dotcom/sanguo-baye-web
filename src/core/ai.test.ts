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

    expect(next.logs.some((log) => log.kind === 'battle')).toBe(false);
    expect(next.logs.at(-1)?.message).toContain('未出征');
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

  it('recruits reserves before considering an attack', () => {
    const state = beginAiPhase(createSampleState());
    for (const city of Object.values(state.cities)) {
      if (city.ownerId === 'liu-bei') city.reserveTroops = 0;
    }
    const next = runAiFactionTurn(state);

    expect(next.logs.some((log) => log.message.includes('征募 500 名后备兵'))).toBe(true);
    expect(validateGameState(next)).toEqual([]);
  });

  it('reinforces an adjacent frontier without emptying the source city', () => {
    const state = beginAiPhase(createSampleState());
    state.officers['zhang-fei'].cityId = 'chengdu';
    state.cities.jiangzhou.satrapOfficerId = undefined;
    const next = runAiFactionTurn(state);

    expect(next.officers['zhang-fei'].cityId).toBe('jiangzhou');
    expect(Object.values(next.officers).filter((officer) => officer.cityId === 'chengdu' && officer.factionId === 'liu-bei'))
      .toHaveLength(1);
    expect(validateGameState(next)).toEqual([]);
  });

  it('makes the same decisions from the same state', () => {
    const state = beginAiPhase(createSampleState());
    expect(runAiFactionTurn(structuredClone(state))).toEqual(runAiFactionTurn(structuredClone(state)));
  });

  it('does not launch a token-provision attack from a food-starved city', () => {
    const state = beginAiPhase(createSampleState());
    state.officers['guan-yu'].troops = 100_000;
    state.cities.hanzhong.food = 1;
    state.cities['chang-an'].reserveTroops = 0;

    expect(planAiAction(state).action).toBe('skip');
  });

  it('searches for a local free officer when an eligible officer is available', () => {
    const state = beginAiPhase(createSampleState());
    state.officers['chen-gong'].cityId = 'hanzhong';
    for (const city of Object.values(state.cities)) {
      if (city.ownerId === 'liu-bei') city.farmingLimit = city.farming;
    }
    const next = runAiFactionTurn(state);

    expect(next.actedOfficerIds).toContain('guan-yu');
    expect(next.logs.some((log) => log.message.includes('关羽在汉中'))).toBe(true);
    expect(validateGameState(next)).toEqual([]);
  });
});
