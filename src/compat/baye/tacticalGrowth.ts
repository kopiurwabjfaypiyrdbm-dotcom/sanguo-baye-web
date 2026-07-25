/** Original-compatible constants from fight.h / Fight.c. */
export const BAYE_EXPERIENCE_PER_LEVEL = 100;
export const BAYE_MAX_LEVEL = 20;

/**
 * Safe rewrite of FightSub.c:FgtGetExp.
 * PlcExtract is an integer square root; the explicit branches preserve the
 * original reward direction without depending on unsigned level-difference wrap.
 */
export function calculateBayeBattleExperience(
  damage: number,
  attackerLevel: number,
  defenderLevel: number,
): number {
  const base = Math.floor(Math.sqrt(Math.max(0, Math.floor(damage)))) >> 2;
  const levelDifference = attackerLevel - defenderLevel;
  const adjusted = levelDifference < 0
    ? base + Math.abs(levelDifference)
    : Math.max(0, base - levelDifference);
  return adjusted + 2;
}

/** Integer-step rewrite of FgtCount.c:CountBaseAttr's skill-point calculation. */
export function calculateBayeSkillPoints(
  intelligence: number,
  force: number,
  level: number,
  stamina: number,
): number {
  const intelligenceTerm = Math.floor(Math.max(0, Math.floor(intelligence)) * 80 / 100);
  const forceTerm = Math.floor(Math.sqrt(Math.max(0, Math.floor(force)))) >> 1;
  const base = intelligenceTerm + forceTerm + Math.max(0, Math.floor(level));
  return Math.floor(base * Math.max(0, Math.floor(stamina)) / 100);
}

export function applyBayeExperience(
  level: number,
  experience: number,
  gained: number,
): { level: number; experience: number; levelsGained: number } {
  let nextLevel = Math.max(0, Math.floor(level));
  let nextExperience = Math.max(0, Math.floor(experience)) + Math.max(0, Math.floor(gained));
  let levelsGained = 0;
  while (nextExperience >= BAYE_EXPERIENCE_PER_LEVEL && nextLevel < BAYE_MAX_LEVEL) {
    nextExperience -= BAYE_EXPERIENCE_PER_LEVEL;
    nextLevel += 1;
    levelsGained += 1;
  }
  if (nextLevel >= BAYE_MAX_LEVEL) nextExperience %= BAYE_EXPERIENCE_PER_LEVEL;
  return { level: nextLevel, experience: nextExperience, levelsGained };
}
