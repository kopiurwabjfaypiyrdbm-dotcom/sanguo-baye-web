import { nextRandom } from '../../core/random';
import type { LifecyclePolicy } from '../../core/types';

export type BayeDefeatedOfficerOutcome =
  | { kind: 'captured'; seed: number; roll: number }
  | { kind: 'escaped'; seed: number; roll: number; destinationIndex: number }
  | { kind: 'dead'; seed: number; roll: number };

/**
 * Reproduces citycmdd.c:TheLoserDeal/LostEscape random-call order.
 * The first roll checks IQ. A successful escape consumes a second draw only
 * when the old faction still owns a city. With no escape city, the vendored
 * source permits death only for roll zero and when the policy enables it.
 */
export function rollBayeDefeatedOfficerOutcome(
  intelligence: number,
  escapeCityCount: number,
  seed: number,
  battleDeath: LifecyclePolicy['battleDeath'],
): BayeDefeatedOfficerOutcome {
  const first = nextRandom(seed);
  const roll = Math.floor(first.value * 100);
  if (roll > intelligence) return { kind: 'captured', seed: first.seed, roll };
  if (escapeCityCount > 0) {
    const destination = nextRandom(first.seed);
    return {
      kind: 'escaped',
      seed: destination.seed,
      roll,
      destinationIndex: Math.floor(destination.value * escapeCityCount),
    };
  }
  if (roll === 0 && battleDeath === 'baye-rare') return { kind: 'dead', seed: first.seed, roll };
  return { kind: 'captured', seed: first.seed, roll };
}

export function rollBayeBanishDestination(seed: number, cityCount: number): {
  seed: number;
  destinationIndex: number;
} {
  if (!Number.isInteger(cityCount) || cityCount <= 0) throw new Error('流放目的地数量必须为正整数');
  const random = nextRandom(seed);
  return {
    seed: random.seed,
    destinationIndex: Math.floor(random.value * cityCount),
  };
}

export function applyBayeConfiscationLoyalty(
  loyalty: number,
  isPlayerRuler: boolean,
): number {
  return isPlayerRuler ? loyalty : Math.max(0, loyalty - 20);
}
