import { describe, expect, it } from 'vitest';
import { evaluateOutcome } from './outcome';
import { createSampleState } from './sampleState';
import { validateGameState } from './validation';
import { issueMoveOrder } from './strategicOrders';

describe('campaign outcome', () => {
  it('ends in defeat when the player owns no city', () => {
    const state = issueMoveOrder(createSampleState(), {
      sourceCityId: 'luoyang',
      targetCityId: 'chang-an',
      officerId: 'cao-cao',
    });
    for (const city of Object.values(state.cities)) {
      if (city.ownerId === state.playerFactionId) city.ownerId = 'liu-bei';
      city.satrapOfficerId = undefined;
    }
    const next = evaluateOutcome(state);

    expect(next.phase).toBe('ended');
    expect(next.outcome).toBe('defeat');
    expect(next.logs.at(-1)?.message).toContain('战役失败');
    expect(next.strategicOrders).toEqual({});
    expect(next.officers['cao-cao']).toMatchObject({ status: 'free', factionId: 'neutral' });
    expect(validateGameState(next)).toEqual([]);
  });

  it('ends in victory when no non-neutral enemy owns a city', () => {
    const state = issueMoveOrder(createSampleState(), {
      sourceCityId: 'luoyang',
      targetCityId: 'chang-an',
      officerId: 'cao-cao',
    });
    for (const city of Object.values(state.cities)) {
      city.ownerId = state.playerFactionId;
      city.satrapOfficerId = undefined;
    }
    const next = evaluateOutcome(state);

    expect(next.phase).toBe('ended');
    expect(next.outcome).toBe('victory');
    expect(next.logs.at(-1)?.message).toContain('战役胜利');
    expect(next.strategicOrders).toEqual({});
    expect(next.officers['cao-cao'].cityId).toBe('chang-an');
    expect(validateGameState(next)).toEqual([]);
  });
});
