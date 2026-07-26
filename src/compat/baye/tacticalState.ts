import type { BayeArmsType, BayeTerrain } from './tacticalBattle';

/**
 * Stable Web names for fight.h STATE_ZC through STATE_QZ. STATE_SW is
 * represented by a tactical unit with zero troops rather than a selectable
 * status.
 */
export const BAYE_TACTICAL_STATUSES = [
  'normal',
  'confused',
  'silenced',
  'rooted',
  'qimen',
  'dunjia',
  'stone-array',
  'hidden',
] as const;

export type BayeTacticalStatus = typeof BAYE_TACTICAL_STATUSES[number];

export const BAYE_TACTICAL_STATUS_LABELS: Record<BayeTacticalStatus, string> = {
  normal: '正常',
  confused: '混乱',
  silenced: '禁咒',
  rooted: '定身',
  qimen: '奇门',
  dunjia: '遁甲',
  'stone-array': '石阵',
  hidden: '潜踪',
};

/**
 * fight.h and FgtCount.c prove the six base movement values. The per-terrain
 * resistance resource is not redistributable, so this table is a versioned
 * modern substitute rather than an original-compatible claim.
 */
export const MODERN_TERRAIN_MOVE_COSTS: ReadonlyArray<ReadonlyArray<number>> = [
  [1, 1, 3, 2, 1, 1, 1, Number.POSITIVE_INFINITY],
  [1, 1, 2, 1, 1, 1, 1, 3],
  [1, 1, 2, 1, 1, 1, 1, 3],
  [2, 2, 2, 2, 2, 2, 2, 1],
  [1, 1, 2, 1, 1, 1, 1, 2],
  [1, 1, 2, 1, 1, 1, 1, 3],
];

/**
 * The original attack range is resource-driven. This modern table keeps the
 * six arms structurally distinct until a licensed oracle is available.
 */
export const MODERN_ATTACK_RANGES: readonly number[] = [1, 1, 2, 1, 1, 2];

export function getModernTerrainMoveCost(armsType: BayeArmsType, terrain: BayeTerrain): number {
  return MODERN_TERRAIN_MOVE_COSTS[armsType]?.[terrain] ?? Number.POSITIVE_INFINITY;
}

export function getModernAttackRange(armsType: BayeArmsType): number {
  return MODERN_ATTACK_RANGES[armsType] ?? 1;
}

/** fight.h/FgtPkAi.c: confused and stone-array units cannot receive commands. */
export function bayeStatusSkipsAction(status: BayeTacticalStatus): boolean {
  return status === 'confused' || status === 'stone-array';
}

/** Fight.c blocks tactical skills while STATE_JZ is active. */
export function bayeStatusAllowsSkill(status: BayeTacticalStatus): boolean {
  return status !== 'silenced' && !bayeStatusSkipsAction(status);
}

/** FgtCount.c fixes STATE_DS movement to one. */
export function getBayeStatusMobility(status: BayeTacticalStatus, baseMobility: number): number {
  return status === 'rooted' ? 1 : baseMobility;
}

/**
 * Fight.c:FgtDrvState recovery polarity. `roll` is the already reduced
 * gam_rand() % 60 value, making the rule independently repeatable.
 */
export function shouldRecoverBayeStatus(
  status: BayeTacticalStatus,
  intelligence: number,
  roll: number,
): boolean {
  if (status === 'normal' || status === 'dunjia') return false;
  const recoveredByIntelligence = roll < (intelligence >> 1);
  return status === 'qimen' || status === 'hidden'
    ? !recoveredByIntelligence
    : recoveredByIntelligence;
}

/** Fight.c:FgtDrvState applies one eighth troop loss before stone recovery. */
export function getBayeStoneArrayLoss(troops: number): number {
  return Math.max(0, Math.floor(troops / 8));
}
