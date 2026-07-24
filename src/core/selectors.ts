import type { City, Faction, GameState, Officer } from './types';

export function getCityOfficers(state: GameState, cityId: string): Officer[] {
  return Object.values(state.officers)
    .filter((officer) => officer.cityId === cityId && officer.status === 'serving')
    .sort((a, b) => b.leadership - a.leadership || b.force - a.force || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

export function getCityFreeOfficers(state: GameState, cityId: string): Officer[] {
  return Object.values(state.officers)
    .filter((officer) => officer.cityId === cityId && officer.status === 'free')
    .sort((a, b) => b.intelligence - a.intelligence || b.force - a.force || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

export function getNeighborCities(state: GameState, cityId: string): City[] {
  const city = state.cities[cityId];
  if (!city) return [];

  return city.neighbors
    .map((neighborId) => state.cities[neighborId])
    .filter((neighbor): neighbor is City => Boolean(neighbor));
}

export function getPlayerFaction(state: GameState): Faction {
  const faction = state.factions[state.playerFactionId];
  if (!faction) {
    throw new Error(`Unknown player faction: ${state.playerFactionId}`);
  }

  return faction;
}
