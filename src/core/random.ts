export type RandomStep = {
  seed: number;
  value: number;
};

export function nextRandom(seed: number): RandomStep {
  const nextSeed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
  return {
    seed: nextSeed,
    value: nextSeed / 0x1_0000_0000,
  };
}
