import { describe, expect, it } from 'vitest';
import { getTacticalUnitArt } from './tacticalUnitArt';

describe('getTacticalUnitArt', () => {
  it('maps every numeric tactical arms type to a stable production asset', () => {
    expect(getTacticalUnitArt(0)).toEqual({ key: 'tactical-unit-cavalry', source: expect.stringContaining('cavalry-v1.png') });
    expect(getTacticalUnitArt(1)).toEqual({ key: 'tactical-unit-infantry', source: expect.stringContaining('infantry-v1.png') });
    expect(getTacticalUnitArt(2)).toEqual({ key: 'tactical-unit-archer', source: expect.stringContaining('archer-v1.png') });
    expect(getTacticalUnitArt(3)).toEqual({ key: 'tactical-unit-navy', source: expect.stringContaining('navy-v1.png') });
    expect(getTacticalUnitArt(4)).toEqual({ key: 'tactical-unit-elite-cavalry', source: expect.stringContaining('elite-cavalry-v1.png') });
    expect(getTacticalUnitArt(5)).toEqual({ key: 'tactical-unit-mystic-strategist', source: expect.stringContaining('mystic-strategist-v1.png') });
  });
});
