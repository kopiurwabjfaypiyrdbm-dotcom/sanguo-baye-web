import type { BayeArmsType } from '../compat/baye/tacticalBattle';

export type TacticalUnitAnimationState = 'idle' | 'move' | 'attack' | 'hit';

export type TacticalUnitAnimationSheet = {
  key: string;
  source: string;
  frameWidth: 64;
  frameHeight: 64;
  frameCount: 18;
};

export const TACTICAL_UNIT_ANIMATION_STATES: Record<TacticalUnitAnimationState, {
  startFrame: number;
  endFrame: number;
  frameRate: number;
  repeat: number;
}> = {
  idle: { startFrame: 0, endFrame: 3, frameRate: 6, repeat: -1 },
  move: { startFrame: 4, endFrame: 9, frameRate: 10, repeat: -1 },
  attack: { startFrame: 10, endFrame: 14, frameRate: 12, repeat: 0 },
  hit: { startFrame: 15, endFrame: 17, frameRate: 8, repeat: 0 },
};

export const TACTICAL_UNIT_ANIMATIONS: Record<BayeArmsType, TacticalUnitAnimationSheet> = {
  0: {
    key: 'tactical-cavalry-actions',
    source: new URL('../../assets/production/tactical/units/cavalry-actions-v2.png', import.meta.url).href,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 18,
  },
  1: {
    key: 'tactical-unit-infantry-actions',
    source: new URL('../../assets/production/tactical/units/infantry-actions-v2.png', import.meta.url).href,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 18,
  },
  2: {
    key: 'tactical-unit-archer-actions',
    source: new URL('../../assets/production/tactical/units/archer-actions-v2.png', import.meta.url).href,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 18,
  },
  3: {
    key: 'tactical-unit-navy-actions',
    source: new URL('../../assets/production/tactical/units/navy-actions-v2.png', import.meta.url).href,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 18,
  },
  4: {
    key: 'tactical-unit-elite-cavalry-actions',
    source: new URL('../../assets/production/tactical/units/elite-cavalry-actions-v2.png', import.meta.url).href,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 18,
  },
  5: {
    key: 'tactical-unit-mystic-strategist-actions',
    source: new URL('../../assets/production/tactical/units/mystic-strategist-actions-v2.png', import.meta.url).href,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 18,
  },
};

export function getTacticalUnitAnimationKey(
  armsType: BayeArmsType,
  state: TacticalUnitAnimationState,
): string {
  return `${TACTICAL_UNIT_ANIMATIONS[armsType].key}-${state}`;
}
