import { describe, expect, it } from 'vitest';
import {
  getTacticalUnitAnimationKey,
  TACTICAL_UNIT_ANIMATIONS,
  TACTICAL_UNIT_ANIMATION_STATES,
} from './tacticalUnitAnimation';

describe('tactical unit animation configuration', () => {
  it('uses the same 18-frame timing contract for all six arms types', () => {
    expect(Object.keys(TACTICAL_UNIT_ANIMATIONS)).toHaveLength(6);
    expect(Object.values(TACTICAL_UNIT_ANIMATIONS).every((sheet) =>
      sheet.frameWidth === 64 && sheet.frameHeight === 64 && sheet.frameCount === 18,
    )).toBe(true);
    expect(TACTICAL_UNIT_ANIMATION_STATES).toMatchObject({
      idle: { startFrame: 0, endFrame: 3, repeat: -1 },
      move: { startFrame: 4, endFrame: 9, repeat: -1 },
      attack: { startFrame: 10, endFrame: 14, repeat: 0 },
      hit: { startFrame: 15, endFrame: 17, repeat: 0 },
    });
  });

  it('keeps animation keys unique across unit and state', () => {
    const keys = Object.keys(TACTICAL_UNIT_ANIMATIONS).flatMap((armsType) =>
      Object.keys(TACTICAL_UNIT_ANIMATION_STATES).map((state) =>
        getTacticalUnitAnimationKey(Number(armsType) as 0 | 1 | 2 | 3 | 4 | 5, state as keyof typeof TACTICAL_UNIT_ANIMATION_STATES),
      ),
    );
    expect(new Set(keys).size).toBe(
      Object.keys(TACTICAL_UNIT_ANIMATIONS).length * Object.keys(TACTICAL_UNIT_ANIMATION_STATES).length,
    );
  });
});
