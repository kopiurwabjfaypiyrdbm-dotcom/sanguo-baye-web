import { describe, expect, it } from 'vitest';
import { executeAttack } from './battle';
import { createSampleState } from './sampleState';
import { advanceTurn } from './turn';
import type { GameState } from './types';
import { validateGameState } from './validation';

function createPreparedState(): GameState {
  const state = createSampleState();
  state.officers['xun-yu'].troops = 100_000;
  state.cities.xiangyang.reserveTroops = 0;
  state.officers['zhuge-liang'].troops = 1;
  return state;
}

function playOneRound(): GameState {
  const afterAttack = executeAttack(createPreparedState(), {
    sourceCityId: 'xuchang',
    targetCityId: 'xiangyang',
    officerIds: ['xun-yu'],
  });
  return advanceTurn(afterAttack);
}

describe('core game loop', () => {
  it('runs player battle, AI round, economy, and calendar as one deterministic loop', () => {
    const first = playOneRound();
    const second = playOneRound();

    expect(first).toEqual(second);
    expect(first.cities.xiangyang.ownerId).toBe('cao-cao');
    expect(first.turn).toBe(2);
    expect(first.calendar).toEqual({ year: 190, month: 2 });
    expect(first.phase).toBe('player');
    expect(first.activeFactionId).toBe('cao-cao');
    expect(first.logs.some((log) => log.kind === 'battle')).toBe(true);
    expect(first.logs.some((log) => log.kind === 'ai')).toBe(true);
    expect(first.logs.some((log) => log.kind === 'turn' && log.turn === 2)).toBe(true);
    expect(validateGameState(first)).toEqual([]);
  });

  it('preserves state invariants over several unattended turns', () => {
    let state = createSampleState();
    for (let index = 0; index < 6; index += 1) {
      state = advanceTurn(state);
      expect(validateGameState(state)).toEqual([]);
    }

    expect(state.turn).toBe(7);
    for (const city of Object.values(state.cities)) {
      expect(Number.isFinite(city.money)).toBe(true);
      expect(Number.isFinite(city.food)).toBe(true);
      expect(Number.isFinite(city.reserveTroops)).toBe(true);
      expect(city.money).toBeGreaterThanOrEqual(0);
      expect(city.food).toBeGreaterThanOrEqual(0);
      expect(city.reserveTroops).toBeGreaterThanOrEqual(0);
    }
  });
});
