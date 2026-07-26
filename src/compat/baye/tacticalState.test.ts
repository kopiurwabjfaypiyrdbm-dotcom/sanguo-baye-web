import { describe, expect, it } from 'vitest';
import {
  BAYE_TACTICAL_STATUSES,
  bayeStatusAllowsSkill,
  bayeStatusSkipsAction,
  getBayeStatusMobility,
  getBayeStoneArrayLoss,
  getModernAttackRange,
  getModernTerrainMoveCost,
  shouldRecoverBayeStatus,
} from './tacticalState';

describe('Baye tactical state compatibility boundary', () => {
  it('keeps the eight live fight.h states in source order', () => {
    expect(BAYE_TACTICAL_STATUSES).toEqual([
      'normal', 'confused', 'silenced', 'rooted', 'qimen', 'dunjia', 'stone-array', 'hidden',
    ]);
  });

  it('matches the source-backed command and movement restrictions', () => {
    expect(bayeStatusSkipsAction('confused')).toBe(true);
    expect(bayeStatusSkipsAction('stone-array')).toBe(true);
    expect(bayeStatusAllowsSkill('silenced')).toBe(false);
    expect(getBayeStatusMobility('rooted', 8)).toBe(1);
    expect(getBayeStoneArrayLoss(81)).toBe(10);
  });

  it('uses the source recovery polarity for ordinary and beneficial states', () => {
    expect(shouldRecoverBayeStatus('confused', 80, 20)).toBe(true);
    expect(shouldRecoverBayeStatus('confused', 80, 50)).toBe(false);
    expect(shouldRecoverBayeStatus('qimen', 80, 20)).toBe(false);
    expect(shouldRecoverBayeStatus('qimen', 80, 50)).toBe(true);
    expect(shouldRecoverBayeStatus('dunjia', 1, 59)).toBe(false);
  });

  it('exposes complete modern substitute tables for six arms and eight terrains', () => {
    for (let arms = 0; arms < 6; arms += 1) {
      expect(getModernAttackRange(arms as 0 | 1 | 2 | 3 | 4 | 5)).toBeGreaterThan(0);
      for (let terrain = 0; terrain < 8; terrain += 1) {
        const cost = getModernTerrainMoveCost(
          arms as 0 | 1 | 2 | 3 | 4 | 5,
          terrain as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
        );
        expect(cost > 0).toBe(true);
      }
    }
  });
});
