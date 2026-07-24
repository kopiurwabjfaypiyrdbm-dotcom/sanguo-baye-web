import { describe, expect, it } from 'vitest';
import { applyBattleResult, estimateBattle, resolveBattle } from './battle';
import { createSampleState } from './sampleState';
import { validateGameState } from './validation';

describe('automatic battle', () => {
  it('rejects attacks against non-adjacent cities', () => {
    const state = createSampleState();

    expect(() =>
      resolveBattle(state, { sourceCityId: 'luoyang', targetCityId: 'chengdu', officerIds: ['cao-cao'] }),
    ).toThrow('Cities are not adjacent');
  });

  it('is deterministic and does not mutate the source state', () => {
    const state = createSampleState();
    const snapshot = structuredClone(state);
    const order = { sourceCityId: 'chang-an', targetCityId: 'hanzhong', officerIds: ['cao-cao'] };
    state.officers['cao-cao'].cityId = 'chang-an';
    const preparedSnapshot = structuredClone(state);

    expect(resolveBattle(state, order)).toEqual(resolveBattle(state, order));
    expect(state).toEqual(preparedSnapshot);
    expect(snapshot.cities).toEqual(state.cities);
  });

  it('rewards leadership and city defense monotonically', () => {
    const state = createSampleState();
    state.officers['cao-cao'].cityId = 'chang-an';
    const order = { sourceCityId: 'chang-an', targetCityId: 'hanzhong', officerIds: ['cao-cao'] };
    const baseline = estimateBattle(state, order);
    state.officers['cao-cao'].leadership += 10;
    const betterLeader = estimateBattle(state, order);
    state.cities.hanzhong.defense += 100;
    const strongerDefense = estimateBattle(state, order);

    expect(betterLeader.attacker).toBeGreaterThan(baseline.attacker);
    expect(strongerDefense.defender).toBeGreaterThan(betterLeader.defender);
  });

  it('applies casualties, advances the seed, and captures a defeated city', () => {
    const state = createSampleState();
    state.officers['cao-cao'].cityId = 'chang-an';
    state.officers['cao-cao'].troops = 100_000;
    state.cities.hanzhong.reserveTroops = 0;
    state.officers['guan-yu'].troops = 1;
    const result = resolveBattle(state, {
      sourceCityId: 'chang-an',
      targetCityId: 'hanzhong',
      officerIds: ['cao-cao'],
    });
    const next = applyBattleResult(state, result);

    expect(result.winner).toBe('attacker');
    expect(next.cities.hanzhong.ownerId).toBe('cao-cao');
    expect(next.officers['cao-cao'].cityId).toBe('hanzhong');
    expect(next.officers['guan-yu'].cityId).toBe('chengdu');
    expect(next.officers['cao-cao'].troops).toBeLessThan(100_000);
    expect(next.rngSeed).toBe(result.nextRngSeed);
    expect(next.logs.at(-1)?.kind).toBe('battle');
    expect(validateGameState(next)).toEqual([]);
  });

  it('rejects applying the same battle result twice', () => {
    const state = createSampleState();
    state.officers['cao-cao'].cityId = 'chang-an';
    const result = resolveBattle(state, {
      sourceCityId: 'chang-an',
      targetCityId: 'hanzhong',
      officerIds: ['cao-cao'],
    });
    const next = applyBattleResult(state, result);

    expect(() => applyBattleResult(next, result)).toThrow('Battle result does not match the current state');
  });
});
