export type BayeRandomStep = {
  seed: number;
  value: number;
};

/**
 * Reproduces the rand_r implementation used by the pinned Baye Web/WASM port.
 *
 * This is intentionally separate from src/core/random.ts: the BBK device build
 * calls SysRand, whose implementation is not present in the reference source.
 */
export function nextBayeWebRandom(seed: number): BayeRandomStep {
  const nextSeed = (Math.imul(seed >>> 0, 1_103_515_245) + 12_345) >>> 0;
  let tempered = nextSeed;
  tempered = (tempered ^ (tempered >>> 11)) >>> 0;
  tempered = (tempered ^ ((tempered << 7) & 0x9d2c_5680)) >>> 0;
  tempered = (tempered ^ ((tempered << 15) & 0xefc6_0000)) >>> 0;
  tempered = (tempered ^ (tempered >>> 18)) >>> 0;

  return {
    seed: nextSeed,
    value: tempered >>> 1,
  };
}
