import { BAYE_TERRAINS, type BayeTerrain } from '../compat/baye/tacticalBattle';

export type TacticalTerrainArtSheet = {
  key: string;
  source: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
};

export const TACTICAL_TERRAIN_ART: TacticalTerrainArtSheet = {
  key: 'tactical-terrain-atlas-v1',
  source: new URL('../../assets/production/tactical/terrain/terrain-atlas-v1.png', import.meta.url).href,
  frameWidth: 68,
  frameHeight: 68,
  frameCount: 8,
};

export function getTacticalTerrainFrame(terrain: BayeTerrain): number {
  return Number.isInteger(terrain) && terrain >= 0 && terrain < BAYE_TERRAINS.length ? terrain : 0;
}
