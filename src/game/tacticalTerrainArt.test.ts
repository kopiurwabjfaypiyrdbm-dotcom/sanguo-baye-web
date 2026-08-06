import { describe, expect, it } from 'vitest';
import { BAYE_TERRAINS, type BayeTerrain } from '../compat/baye/tacticalBattle';
import { getTacticalTerrainFrame, TACTICAL_TERRAIN_ART } from './tacticalTerrainArt';

describe('tactical terrain art configuration', () => {
  it('maps every terrain id to its matching atlas frame', () => {
    expect(BAYE_TERRAINS).toHaveLength(8);
    expect(BAYE_TERRAINS.map((_, index) => getTacticalTerrainFrame(index as BayeTerrain))).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7],
    );
  });

  it('describes the production atlas dimensions and falls back safely', () => {
    expect(TACTICAL_TERRAIN_ART).toMatchObject({
      frameWidth: 68,
      frameHeight: 68,
      frameCount: 8,
    });
    expect(getTacticalTerrainFrame(99 as BayeTerrain)).toBe(0);
  });
});
