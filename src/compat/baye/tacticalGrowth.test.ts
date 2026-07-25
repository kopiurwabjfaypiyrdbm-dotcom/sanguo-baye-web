import { describe, expect, it } from 'vitest';
import { applyBayeExperience, calculateBayeBattleExperience, calculateBayeSkillPoints } from './tacticalGrowth';

describe('Baye tactical growth compatibility', () => {
  it('uses integer square-root damage and rewards fighting above level', () => {
    expect(calculateBayeBattleExperience(64, 5, 5)).toBe(4);
    expect(calculateBayeBattleExperience(64, 3, 5)).toBeGreaterThan(4);
    expect(calculateBayeBattleExperience(64, 7, 5)).toBe(2);
    expect(calculateBayeBattleExperience(1, 1, 20)).toBe(21);
  });

  it('carries experience through multiple levels and respects the level cap', () => {
    expect(applyBayeExperience(3, 95, 210)).toEqual({ level: 6, experience: 5, levelsGained: 3 });
    expect(applyBayeExperience(20, 90, 50)).toEqual({ level: 20, experience: 40, levelsGained: 0 });
  });

  it('preserves the original integer truncation order for skill points', () => {
    expect(calculateBayeSkillPoints(1, 0, 1, 99)).toBe(0);
    expect(calculateBayeSkillPoints(90, 81, 8, 75)).toBe(63);
  });
});
