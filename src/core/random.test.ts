import { describe, expect, it } from 'vitest';
import { nextRandom } from './random';

describe('seeded random', () => {
  it('is deterministic and advances the seed', () => {
    expect(nextRandom(12345)).toEqual(nextRandom(12345));
    expect(nextRandom(12345).seed).not.toBe(12345);
    expect(nextRandom(12345).value).toBeGreaterThanOrEqual(0);
    expect(nextRandom(12345).value).toBeLessThan(1);
  });
});
