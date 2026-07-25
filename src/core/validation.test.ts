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
});
