import { describe, expect, it } from 'vitest';
import { TACTICAL_UNIT_ART, getTacticalUnitArt } from './tacticalUnitArt';

describe('getTacticalUnitArt', () => {
  it('maps every numeric tactical arms type to a stable production asset', () => {
    expect(getTacticalUnitArt(0)).toEqual({ key: 'tactical-unit-cavalry', source: expect.stringContaining('cavalry-v2.png') });
    expect(getTacticalUnitArt(1)).toEqual({ key: 'tactical-unit-infantry', source: expect.stringContaining('infantry-v2.png') });
    expect(getTacticalUnitArt(2)).toEqual({ key: 'tactical-unit-archer', source: expect.stringContaining('archer-v2.png') });
    expect(getTacticalUnitArt(3)).toEqual({ key: 'tactical-unit-navy', source: expect.stringContaining('navy-v2.png') });
    expect(getTacticalUnitArt(4)).toEqual({ key: 'tactical-unit-elite-cavalry', source: expect.stringContaining('elite-cavalry-v2.png') });
    expect(getTacticalUnitArt(5)).toEqual({ key: 'tactical-unit-mystic-strategist', source: expect.stringContaining('mystic-strategist-v2.png') });
  });

  it('keeps all unit texture keys and production paths distinct', () => {
    const art = Object.values(TACTICAL_UNIT_ART);
    expect(new Set(art.map((entry) => entry.key)).size).toBe(6);
    expect(art.every((entry) => entry.source.includes('/assets/production/tactical/units/'))).toBe(true);
  });
});
