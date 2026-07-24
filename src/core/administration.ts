import type { GameState, Officer } from './types';

export function updateCitySatraps(state: GameState): GameState {
  const cities = Object.fromEntries(
    Object.values(state.cities).map((city) => {
      const faction = state.factions[city.ownerId];
      if (!faction || faction.isNeutral) {
        return [city.id, { ...city, satrapOfficerId: undefined }];
      }

      const stationed = Object.values(state.officers)
        .filter((officer) => officer.factionId === city.ownerId && officer.cityId === city.id)
        .sort(compareSatrapCandidates);
      const ruler = stationed.find((officer) => officer.id === faction.rulerOfficerId);
      return [city.id, { ...city, satrapOfficerId: ruler?.id ?? stationed[0]?.id }];
    }),
  );
  return { ...state, cities };
}

function compareSatrapCandidates(a: Officer, b: Officer): number {
  return b.intelligence - a.intelligence || b.force - a.force || a.id.localeCompare(b.id);
}
