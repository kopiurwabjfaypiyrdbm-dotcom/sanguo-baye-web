import { describe, expect, it } from 'vitest';
import { createSampleState } from './sampleState';
import { parseSave, serializeSave } from './saveGame';
import {
  findOwnedCityRoute,
  getStrategicDestinations,
  issueMoveOrder,
} from './strategicOrders';
import { validateGameState } from './validation';
import { beginAiPhase, finishTurn } from './turn';

describe('strategic road orders', () => {
  it('uses a deterministic shortest route across connected friendly cities', () => {
    const state = createSampleState();

    expect(findOwnedCityRoute(state, 'cao-cao', 'chenliu', 'chang-an'))
      .toEqual(['chenliu', 'luoyang', 'chang-an']);
    expect(getStrategicDestinations(state, 'chenliu', 'cao-cao').map((destination) => [
      destination.city.id,
      destination.durationMonths,
    ])).toEqual([
      ['luoyang', 1],
      ['xuchang', 1],
      ['chang-an', 2],
    ]);
  });

  it('keeps an officer in transit for each road segment and survives save/load', () => {
    const state = issueMoveOrder(createSampleState(), {
      sourceCityId: 'chenliu',
      targetCityId: 'chang-an',
      officerId: 'zhang-liao',
    });

    expect(state.officers['zhang-liao'].cityId).toBeUndefined();
    expect(Object.values(state.strategicOrders)[0].remainingMonths).toBe(2);

    const reloaded = parseSave(serializeSave(state)).state;
    const afterOneMonth = finishTurn(beginAiPhase(reloaded));
    expect(afterOneMonth.officers['zhang-liao'].cityId).toBeUndefined();
    expect(Object.values(afterOneMonth.strategicOrders)[0].remainingMonths).toBe(1);

    const arrived = finishTurn(beginAiPhase(afterOneMonth));
    expect(arrived.officers['zhang-liao'].cityId).toBe('chang-an');
    expect(arrived.strategicOrders).toEqual({});
    expect(validateGameState(arrived)).toEqual([]);
  });

  it('returns an officer to the source when the destination changes hands', () => {
    const moving = issueMoveOrder(createSampleState(), {
      sourceCityId: 'luoyang',
      targetCityId: 'chang-an',
      officerId: 'cao-cao',
    });
    const targetLost = structuredClone(moving);
    targetLost.cities['chang-an'].ownerId = 'liu-bei';
    targetLost.cities['chang-an'].satrapOfficerId = undefined;

    const resolved = finishTurn(beginAiPhase(targetLost));

    expect(resolved.officers['cao-cao'].cityId).toBe('luoyang');
    expect(resolved.strategicOrders).toEqual({});
    expect(validateGameState(resolved)).toEqual([]);
  });

  it('rejects malformed transit state and duplicate orders', () => {
    const state = issueMoveOrder(createSampleState(), {
      sourceCityId: 'luoyang',
      targetCityId: 'chang-an',
      officerId: 'cao-cao',
    });
    state.strategicOrders.duplicate = {
      ...Object.values(state.strategicOrders)[0],
      id: 'duplicate',
    };

    expect(validateGameState(state).some((issue) =>
      issue.path === 'strategicOrders.duplicate.officerId'
      && issue.message.includes('already has active order'),
    )).toBe(true);
  });

  it('repairs a stale serial without overwriting an existing order', () => {
    const moving = issueMoveOrder(createSampleState(), {
      sourceCityId: 'luoyang',
      targetCityId: 'chang-an',
      officerId: 'cao-cao',
    });
    moving.nextStrategicOrderSerial = 1;

    const next = issueMoveOrder(moving, {
      sourceCityId: 'xuchang',
      targetCityId: 'chenliu',
      officerId: 'xun-yu',
    });

    expect(Object.keys(next.strategicOrders).sort()).toEqual(['strategic-order-1', 'strategic-order-2']);
    expect(next.nextStrategicOrderSerial).toBe(3);
    expect(validateGameState(next)).toEqual([]);
  });

  it('rejects an order clock that disagrees with the campaign turn', () => {
    const state = issueMoveOrder(createSampleState(), {
      sourceCityId: 'chenliu',
      targetCityId: 'chang-an',
      officerId: 'zhang-liao',
    });
    state.turn = 2;
    state.calendar = { year: 190, month: 2 };

    expect(validateGameState(state)).toContainEqual({
      path: 'strategicOrders.strategic-order-1.remainingMonths',
      message: 'must agree with durationMonths and elapsed campaign turns',
    });
  });
});
