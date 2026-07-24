import { describe, expect, it } from 'vitest';
import fixture from '../../../references/fixtures/rng-web-wasm.json';
import { nextBayeWebRandom } from './rng';

describe('Baye Web rand_r compatibility', () => {
  it('matches sequences captured from the supplied WebAssembly runtime', () => {
    expect(fixture.authority.snapshotCommitVerified).toBe(false);
    expect(fixture.sequences.length).toBeGreaterThanOrEqual(5);

    for (const sequence of fixture.sequences) {
      let seed = sequence.seed;
      for (const expected of sequence.draws) {
        const actual = nextBayeWebRandom(seed);
        expect(actual).toEqual({ value: expected.value, seed: expected.seedAfter });
        seed = actual.seed;
      }
    }
  });

  it('exposes call-order drift through both the value and internal seed', () => {
    const first = nextBayeWebRandom(12_345);
    const second = nextBayeWebRandom(first.seed);

    expect(first).toEqual({ value: 798_103_066, seed: 3_554_416_254 });
    expect(second).toEqual({ value: 662_333_491, seed: 2_802_067_423 });
    expect(second).not.toEqual(nextBayeWebRandom(12_345));
  });
});
