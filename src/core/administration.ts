import type { GameState, Officer } from './types';

export function updateCitySatraps(state: GameState): GameState {
  const cities = Object.fromEntries(
    Object.values(state.cities).map((city) => {
      const faction = state.factions[city.ownerId];
      if (!faction || faction.isNeutral) {
        return [city.id, { ...city, satrapOfficerId: undefined }];
      }

      const stationed = Object.values(state.officers)
        .filter((officer) => officer.status === 'serving' && officer.factionId === city.ownerId && officer.cityId === city.id)
        .sort(compareSatrapCandidates);
      const current = city.satrapOfficerId
        ? stationed.find((officer) => officer.id === city.satrapOfficerId)
        : undefined;
      if (current) return [city.id, { ...city, satrapOfficerId: current.id }];
      const ruler = stationed.find((officer) => officer.id === faction.rulerOfficerId);
      return [city.id, { ...city, satrapOfficerId: ruler?.id ?? stationed[0]?.id }];
    }),
  );
  return { ...state, cities };
}

/**
 * Repairs the pre-v0.2 state shape where a faction could lose every city while
 * its officers remained marked as serving. This is also safe to run after any
 * ownership change before validating or loading a campaign.
 */
export function releaseLandlessFactionOfficers(state: GameState): GameState {
  const landholdingFactionIds = new Set(Object.values(state.cities).map((city) => city.ownerId));
  const neutralFactionId = Object.values(state.factions).find((faction) => faction.isNeutral)?.id;
  const hasLandlessServingOfficer = Object.values(state.officers).some((officer) =>
    officer.status === 'serving' && !landholdingFactionIds.has(officer.factionId),
  );
  if (!hasLandlessServingOfficer) return state;
  if (!neutralFactionId) throw new Error('Landless factions cannot release officers without a neutral faction');

  const officers = Object.fromEntries(Object.values(state.officers).map((officer) => [
    officer.id,
    officer.status === 'serving' && !landholdingFactionIds.has(officer.factionId)
      ? { ...officer, status: 'free' as const, factionId: neutralFactionId, troops: 0, stamina: 0 }
      : officer,
  ]));
  return { ...state, officers };
}

function compareSatrapCandidates(a: Officer, b: Officer): number {
  return b.intelligence - a.intelligence || b.force - a.force || a.id.localeCompare(b.id);
}
