import { describe, expect, it } from 'vitest';
import { TACTICAL_CAVALRY_PREVIEW_FRAMES } from './tacticalCavalryPreview';

describe('TACTICAL_CAVALRY_PREVIEW_FRAMES', () => {
  it('keeps the preview actions in gameplay order', () => {
    expect(TACTICAL_CAVALRY_PREVIEW_FRAMES).toEqual([
      { key: 'idle', label: '待机' },
      { key: 'move', label: '移动' },
      { key: 'attack', label: '攻击' },
      { key: 'hit', label: '受击' },
    ]);
  });
});
