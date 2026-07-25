import { describe, expect, it } from 'vitest';
import { createSampleState } from './sampleState';
import { assertValidGameState, validateGameState } from './validation';

describe('game state validation', () => {
  it('accepts the starter scenario', () => {
    expect(validateGameState(createSampleState())).toEqual([]);
  });

  it('reports dangling and asymmetric roads', () => {
    const state = createSampleState();
    state.cities.chenliu.neighbors.push('missing-city');
    state.cities.luoyang.neighbors = state.cities.luoyang.neighbors.filter((id) => id !== 'chenliu');

    expect(validateGameState(state)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'cities.chenliu.neighbors', message: 'unknown city: missing-city' }),
        expect.objectContaining({ path: 'cities.chenliu.neighbors', message: 'road is not reciprocal: luoyang' }),
      ]),
    );
  });

  it('throws a concise error for an invalid reference', () => {
    const state = createSampleState();
    state.officers['cao-cao'].armsTypeId = 'unknown';

    expect(() => assertValidGameState(state)).toThrow(
      'Invalid game state at officers.cao-cao.armsTypeId: unknown arms type: unknown',
    );
  });

  it('rejects fractional combat values and serving officers stationed in enemy cities', () => {
    const fractional = createSampleState();
    fractional.officers['cao-cao'].troops = 100.5;
    expect(validateGameState(fractional)).toContainEqual(expect.objectContaining({
      path: 'officers.cao-cao.troops',
      message: 'must be an integer',
    }));

    const enemyCity = createSampleState();
    enemyCity.officers['cao-cao'].cityId = 'hanzhong';
    expect(validateGameState(enemyCity)).toContainEqual(expect.objectContaining({
      path: 'officers.cao-cao.cityId',
      message: 'serving officer must be stationed in a city owned by their faction',
    }));
  });

  it('rejects unknown or over-capacity equipment references', () => {
    const unknown = createSampleState();
    unknown.officers['cao-cao'].equipmentItemIds = ['missing-item'];
    expect(validateGameState(unknown)).toContainEqual(expect.objectContaining({
      path: 'officers.cao-cao.equipmentItemIds',
      message: 'unknown item: missing-item',
    }));

    const overCapacity = createSampleState();
    overCapacity.officers['cao-cao'].equipmentItemIds = ['qinglong-blade', 'sunzi-manual', 'red-hare'];
    expect(validateGameState(overCapacity)).toContainEqual(expect.objectContaining({
      path: 'officers.cao-cao.equipmentItemIds',
      message: 'must contain at most 2 items',
    }));
  });

  it('rejects armed captives and captives held by their former faction', () => {
    const state = createSampleState();
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'captive',
      cityId: 'luoyang',
      captorFactionId: 'cao-cao',
      formerFactionId: 'cao-cao',
      troops: 100,
      stamina: 5,
    };

    expect(validateGameState(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'officers.chen-gong.troops', message: 'captive officer must have zero troops' }),
      expect.objectContaining({ path: 'officers.chen-gong.stamina', message: 'captive officer must have zero stamina' }),
      expect.objectContaining({
        path: 'officers.chen-gong.formerFactionId', message: 'captive officer cannot be held by their former faction',
      }),
    ]));
  });
});
