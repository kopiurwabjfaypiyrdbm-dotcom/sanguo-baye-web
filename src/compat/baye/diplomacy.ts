import { nextRandom } from '../../core/random';
import type { DiplomaticOrderKind, Officer } from '../../core/types';

const CHARACTER_THRESHOLDS: Record<DiplomaticOrderKind, readonly number[]> = {
  alienate: [50, 30, 40, 30, 5],
  canvass: [15, 40, 30, 20, 5],
  counterespionage: [30, 10, 20, 60, 5],
  induce: [10, 1, 20, 5, 15],
};

export type BayeDiplomacyRoll = {
  success: boolean;
  seed: number;
  /** Successful recruitment uses the original 40 + rand % 40 devotion reset. */
  recruitedLoyalty?: number;
};

export type BayeDiplomacyRollOptions = {
  /** Induce consumes a report-dialog draw only when the issuing faction is the player. */
  playerIssuer?: boolean;
};

/**
 * Reproduces the fixed C comparison order and integer widths in citycmd.c.
 * The unsigned IQ subtraction is intentionally not clamped: it is part of the
 * pinned implementation, including its counter-intuitive underflow behavior.
 */
export function rollBayeDiplomacy(
  kind: DiplomaticOrderKind,
  executor: Pick<Officer, 'intelligence'>,
  target: Pick<Officer, 'intelligence' | 'loyalty' | 'character'>,
  seed: number,
  options: BayeDiplomacyRollOptions = {},
): BayeDiplomacyRoll {
  let currentSeed = seed;
  const draw = () => {
    const random = nextRandom(currentSeed);
    currentSeed = random.seed;
    return Math.floor(random.value * 100);
  };
  const finish = (success: boolean, recruitedLoyalty?: number): BayeDiplomacyRoll => {
    // The fixed driver spends RNG on dialogue selection after the rule result.
    // The Web does not copy those dialogs, but must preserve their calls so the
    // shared campaign seed continues at the same position.
    const presentationDraws = kind === 'canvass'
      ? 1
      : kind === 'counterespionage'
        ? success ? 2 : 1
        : kind === 'induce' && options.playerIssuer
          ? 1
          : 0;
    for (let index = 0; index < presentationDraws; index += 1) draw();
    return {
      success,
      seed: currentSeed,
      ...(recruitedLoyalty === undefined ? {} : { recruitedLoyalty }),
    };
  };

  const iqThreshold = kind === 'canvass'
    ? toUint8(executor.intelligence - target.intelligence)
    : kind === 'alienate'
      ? toUint8(executor.intelligence - target.intelligence + 50)
      : (executor.intelligence - target.intelligence + 50) >>> 0;
  if (draw() > iqThreshold) return finish(false);

  if (kind !== 'induce' && draw() < target.loyalty) {
    return finish(false);
  }

  const character = Number.isInteger(target.character) && (target.character ?? 0) >= 0
    ? target.character ?? 0
    : 0;
  const characterThreshold = CHARACTER_THRESHOLDS[kind][character] ?? CHARACTER_THRESHOLDS[kind][0];
  if (draw() > characterThreshold) return finish(false);

  if (kind === 'canvass') {
    const loyalty = nextRandomLoyalty(currentSeed);
    currentSeed = loyalty.seed;
    return finish(true, loyalty.loyalty);
  }
  return finish(true);
}

function nextRandomLoyalty(seed: number): { seed: number; loyalty: number } {
  const random = nextRandom(seed);
  return { seed: random.seed, loyalty: 40 + Math.floor(random.value * 40) };
}

function toUint8(value: number): number {
  return ((value % 0x100) + 0x100) % 0x100;
}
