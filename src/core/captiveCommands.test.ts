import { describe, expect, it } from 'vitest';
import { recruitCaptive, releaseCaptive, SURRENDER_STAMINA_COST } from './captiveCommands';
import { createSampleState } from './sampleState';
import { validateGameState } from './validation';

function captiveFixture(loyalty = 50) {
  const state = createSampleState();
  state.officers['cao-cao'].intelligence = 255;
  state.officers['chen-gong'] = {
    ...state.officers['chen-gong'],
    status: 'captive',
    factionId: 'neutral',
    cityId: 'luoyang',
    captorFactionId: 'cao-cao',
    formerFactionId: 'liu-bei',
    loyalty,
    troops: 0,
    stamina: 0,
  };
  return state;
}

describe('captive commands', () => {
  it('recruits a captive deterministically and consumes the executor action', () => {
    const state = captiveFixture(0);
    const order = { cityId: 'luoyang', executorOfficerId: 'cao-cao', captiveOfficerId: 'chen-gong' };

    const next = recruitCaptive(state, order);

    expect(next).toEqual(recruitCaptive(structuredClone(state), order));
    expect(next.officers['chen-gong']).toMatchObject({
      status: 'serving', factionId: 'cao-cao', cityId: 'luoyang', troops: 0,
    });
    expect(next.officers['chen-gong'].captorFactionId).toBeUndefined();
    expect(next.officers['cao-cao'].stamina).toBe(100 - SURRENDER_STAMINA_COST);
    expect(next.actedOfficerIds).toContain('cao-cao');
    expect(validateGameState(next)).toEqual([]);
  });

  it('reduces loyalty after a failed attempt and can release the captive as a free officer', () => {
    const state = captiveFixture(90);
    const failed = recruitCaptive(state, {
      cityId: 'luoyang', executorOfficerId: 'cao-cao', captiveOfficerId: 'chen-gong',
    });

    expect(failed.officers['chen-gong']).toMatchObject({ status: 'captive', loyalty: 81 });
    const released = releaseCaptive(failed, { cityId: 'luoyang', captiveOfficerId: 'chen-gong' });
    expect(released.officers['chen-gong']).toMatchObject({
      status: 'free', factionId: 'neutral', cityId: 'luoyang', troops: 0,
    });
    expect(released.discoveredOfficerIds).toContain('chen-gong');
    expect(validateGameState(released)).toEqual([]);
  });

  it('does not reduce loyalty when the executor fails the intelligence gate', () => {
    const state = captiveFixture(50);
    state.officers['cao-cao'].intelligence = 0;
    state.officers['chen-gong'].intelligence = 255;

    const failed = recruitCaptive(state, {
      cityId: 'luoyang', executorOfficerId: 'cao-cao', captiveOfficerId: 'chen-gong',
    });

    expect(failed.officers['chen-gong']).toMatchObject({ status: 'captive', loyalty: 50 });
    expect(failed.logs.at(-1)?.message).toContain('未能动摇其忠诚');
  });

  it('uses equipped intelligence bonuses for the surrender check', () => {
    const state = captiveFixture(0);
    state.officers['cao-cao'].intelligence = 0;
    state.officers['chen-gong'].intelligence = 100;
    state.items['test-manual'] = {
      id: 'test-manual', name: '测试兵书', forceBonus: 0, intelligenceBonus: 200, moveBonus: 0,
    };
    state.officers['cao-cao'].equipmentItemIds = ['test-manual'];

    const next = recruitCaptive(state, {
      cityId: 'luoyang', executorOfficerId: 'cao-cao', captiveOfficerId: 'chen-gong',
    });

    expect(next.officers['chen-gong'].status).toBe('serving');
  });
});
