import { describe, expect, it } from 'vitest';
import { evaluateOutcome } from './outcome';
import { createSampleState } from './sampleState';
import { validateGameState } from './validation';
import { issueMoveOrder, issueTransportOrder } from './strategicOrders';
import { issueDiplomaticOrder } from './diplomaticOrders';
import { reconnoitreCity } from './reconnaissance';

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

  it('refunds escrowed transport cargo before ending a victorious campaign', () => {
    const initial = createSampleState();
    const sourceBefore = structuredClone(initial.cities.chenliu);
    const state = issueTransportOrder(initial, {
      sourceCityId: 'chenliu',
      targetCityId: 'luoyang',
      officerId: 'zhang-liao',
      cargo: { money: 40, food: 80, reserveTroops: 120 },
    });
    for (const city of Object.values(state.cities)) {
      city.ownerId = state.playerFactionId;
      city.satrapOfficerId = undefined;
    }

    const next = evaluateOutcome(state);

    expect(next.outcome).toBe('victory');
    expect(next.strategicOrders).toEqual({});
    expect(next.officers['zhang-liao'].cityId).toBe('chenliu');
    expect(next.cities.chenliu).toMatchObject({
      money: sourceBefore.money,
      food: sourceBefore.food,
      reserveTroops: sourceBefore.reserveTroops,
    });
    expect(validateGameState(next)).toEqual([]);
  });

  it('logs the termination of a player diplomacy order before victory', () => {
    let state = reconnoitreCity(createSampleState(), {
      sourceCityId: 'luoyang',
      targetCityId: 'jiangzhou',
      officerId: 'cao-cao',
    });
    state = issueDiplomaticOrder(state, {
      kind: 'alienate',
      sourceCityId: 'luoyang',
      officerId: 'xiahou-dun',
      targetOfficerId: 'zhang-fei',
    });
    for (const city of Object.values(state.cities)) {
      city.ownerId = state.playerFactionId;
      city.satrapOfficerId = undefined;
    }

    const next = evaluateOutcome(state);

    expect(next.outcome).toBe('victory');
    expect(next.diplomaticOrders).toEqual({});
    expect(next.officers['xiahou-dun'].cityId).toBe('luoyang');
    expect(next.logs.some((log) => log.message === '夏侯惇对张飞的离间因战役结束而中止。')).toBe(true);
    expect(next.logs.at(-1)?.message).toContain('战役胜利');
    expect(validateGameState(next)).toEqual([]);
  });
});
