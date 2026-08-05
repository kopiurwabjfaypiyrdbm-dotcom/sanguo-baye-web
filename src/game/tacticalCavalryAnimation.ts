export const TACTICAL_CAVALRY_ANIMATION = {
  key: 'tactical-cavalry-actions',
  source: new URL('../../assets/production/tactical/units/cavalry-actions-v2.png', import.meta.url).href,
  frameWidth: 64,
  frameHeight: 64,
  frameCount: 18,
} as const;

export type TacticalCavalryAnimationState = 'idle' | 'move' | 'attack' | 'hit';

export const TACTICAL_CAVALRY_ANIMATION_STATES: Record<TacticalCavalryAnimationState, {
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

export function getTacticalCavalryAnimationKey(state: TacticalCavalryAnimationState): string {
  return `${TACTICAL_CAVALRY_ANIMATION.key}-${state}`;
}
