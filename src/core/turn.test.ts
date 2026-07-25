import { describe, expect, it } from 'vitest';
import { createSampleState } from './sampleState';
import { advanceCalendar, beginAiPhase, finishTurn } from './turn';
import { validateGameState } from './validation';

describe('turn progression', () => {
  it('rolls December into January of the next year', () => {
    expect(advanceCalendar({ year: 190, month: 12 })).toEqual({ year: 191, month: 1 });
  });

  it('moves from player phase to the first AI faction', () => {
    const next = beginAiPhase(createSampleState());

    expect(next.phase).toBe('ai');
    expect(next.activeFactionId).toBe('liu-bei');
  });

  it('settles resources and returns to a new player turn', () => {
    const state = createSampleState();
    state.calendar = { year: 190, month: 12 };
    const aiState = beginAiPhase(state);
    const next = finishTurn(aiState);

    expect(next.turn).toBe(2);
    expect(next.calendar).toEqual({ year: 191, month: 1 });
    expect(next.phase).toBe('player');
    expect(next.activeFactionId).toBe('cao-cao');
    expect(next.cities.luoyang.population).toBeGreaterThan(state.cities.luoyang.population);
    expect(next.actedOfficerIds).toEqual([]);
    expect(validateGameState(next)).toEqual([]);
  });
});
