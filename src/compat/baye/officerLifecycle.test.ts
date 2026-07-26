import { describe, expect, it } from 'vitest';
import {
  applyBayeConfiscationLoyalty,
  rollBayeBanishDestination,
  rollBayeDefeatedOfficerOutcome,
} from './officerLifecycle';

describe('Baye officer lifecycle rules', () => {
  it('captures immediately after a failed IQ comparison', () => {
    expect(rollBayeDefeatedOfficerOutcome(0, 3, 1, 'baye-rare')).toEqual({
      kind: 'captured',
      seed: 1015568748,
      roll: 23,
    });
  });

  it('spends a second draw only when an escape city exists', () => {
    expect(rollBayeDefeatedOfficerOutcome(100, 3, 1, 'baye-rare')).toEqual({
      kind: 'escaped',
      seed: 1586005467,
      roll: 23,
      destinationIndex: 1,
    });
    expect(rollBayeDefeatedOfficerOutcome(100, 0, 1, 'disabled')).toEqual({
      kind: 'captured',
      seed: 1015568748,
      roll: 23,
    });
  });

  it('keeps the rare no-escape death policy explicit', () => {
    expect(rollBayeDefeatedOfficerOutcome(100, 0, 1972, 'baye-rare').kind).toBe('dead');
    expect(rollBayeDefeatedOfficerOutcome(100, 0, 1972, 'disabled').kind).toBe('captured');
  });

  it('uses one draw for banishment and exempts only the player ruler from loyalty loss', () => {
    expect(rollBayeBanishDestination(1, 38)).toEqual({
      seed: 1015568748,
      destinationIndex: 8,
    });
    expect(applyBayeConfiscationLoyalty(15, false)).toBe(0);
    expect(applyBayeConfiscationLoyalty(80, false)).toBe(60);
    expect(applyBayeConfiscationLoyalty(80, true)).toBe(80);
  });
});
