import { describe, expect, it } from 'vitest';
import {
  getTacticalCavalryAnimationKey,
  TACTICAL_CAVALRY_ANIMATION_STATES,
} from './tacticalCavalryAnimation';

describe('tactical cavalry animation states', () => {
  it('keeps each action in its own contiguous frame range', () => {
    expect(TACTICAL_CAVALRY_ANIMATION_STATES).toEqual({
      idle: { startFrame: 0, endFrame: 3, frameRate: 6, repeat: -1 },
      move: { startFrame: 4, endFrame: 9, frameRate: 10, repeat: -1 },
      attack: { startFrame: 10, endFrame: 14, frameRate: 12, repeat: 0 },
      hit: { startFrame: 15, endFrame: 17, frameRate: 8, repeat: 0 },
    });
  });

  it('uses distinct Phaser animation keys for every state', () => {
    expect(Object.keys(TACTICAL_CAVALRY_ANIMATION_STATES).map((state) =>
      getTacticalCavalryAnimationKey(state as keyof typeof TACTICAL_CAVALRY_ANIMATION_STATES),
    )).toEqual([
      'tactical-cavalry-actions-idle',
      'tactical-cavalry-actions-move',
      'tactical-cavalry-actions-attack',
      'tactical-cavalry-actions-hit',
    ]);
  });
});
