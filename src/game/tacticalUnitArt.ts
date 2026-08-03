import type { BayeArmsType } from '../compat/baye/tacticalBattle';

export type TacticalUnitArt = {
  key: string;
  source: string;
};

export const TACTICAL_UNIT_ART: Record<BayeArmsType, TacticalUnitArt> = {
  0: {
    key: 'tactical-unit-cavalry',
    source: new URL('../../assets/production/tactical/units/cavalry-v1.png', import.meta.url).href,
  },
  1: {
    key: 'tactical-unit-infantry',
    source: new URL('../../assets/production/tactical/units/infantry-v1.png', import.meta.url).href,
  },
  2: {
    key: 'tactical-unit-archer',
    source: new URL('../../assets/production/tactical/units/archer-v1.png', import.meta.url).href,
  },
  3: {
    key: 'tactical-unit-navy',
    source: new URL('../../assets/production/tactical/units/navy-v1.png', import.meta.url).href,
  },
  4: {
    key: 'tactical-unit-elite-cavalry',
    source: new URL('../../assets/production/tactical/units/elite-cavalry-v1.png', import.meta.url).href,
  },
  5: {
    key: 'tactical-unit-mystic-strategist',
    source: new URL('../../assets/production/tactical/units/mystic-strategist-v1.png', import.meta.url).href,
  },
};

export function getTacticalUnitArt(armsType: BayeArmsType): TacticalUnitArt {
  return TACTICAL_UNIT_ART[armsType];
}
