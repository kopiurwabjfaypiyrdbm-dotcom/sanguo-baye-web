import { describe, expect, it } from 'vitest';
import { TACTICAL_CAVALRY_ANIMATION } from './tacticalCavalryAnimation';

describe('TACTICAL_CAVALRY_ANIMATION', () => {
  it('describes the four square action frames for the preview loop', () => {
    expect(TACTICAL_CAVALRY_ANIMATION).toMatchObject({
      key: 'tactical-cavalry-actions-preview',
      frameWidth: 64,
      frameHeight: 64,
      startFrame: 0,
      endFrame: 3,
      frameRate: 2,
      repeat: -1,
    });
    expect(TACTICAL_CAVALRY_ANIMATION.source).toContain('cavalry-actions-v1.png');
  });
});
