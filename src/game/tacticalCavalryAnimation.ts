import {
  getTacticalUnitAnimationKey,
  TACTICAL_UNIT_ANIMATIONS,
  TACTICAL_UNIT_ANIMATION_STATES,
  type TacticalUnitAnimationState,
} from './tacticalUnitAnimation';

export const TACTICAL_CAVALRY_ANIMATION = TACTICAL_UNIT_ANIMATIONS[0];
export type TacticalCavalryAnimationState = TacticalUnitAnimationState;
export const TACTICAL_CAVALRY_ANIMATION_STATES = TACTICAL_UNIT_ANIMATION_STATES;

export function getTacticalCavalryAnimationKey(state: TacticalCavalryAnimationState): string {
  return getTacticalUnitAnimationKey(0, state);
}
