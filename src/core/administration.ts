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
  const orderByOfficerId = new Map(Object.values(state.strategicOrders).map((order) => [order.officerId, order]));
  const landlessOrderIds = new Set(Object.values(state.strategicOrders)
    .filter((order) => !landholdingFactionIds.has(order.factionId))
    .map((order) => order.id));
  if (!hasLandlessServingOfficer && landlessOrderIds.size === 0) return state;
  if (!neutralFactionId) throw new Error('Landless factions cannot release officers without a neutral faction');

  const strategicOrders = Object.fromEntries(Object.values(state.strategicOrders)
    .filter((order) => !landlessOrderIds.has(order.id))
    .map((order) => [order.id, order]));
  const officers = Object.fromEntries(Object.values(state.officers).map((officer) => [
    officer.id,
    (() => {
      if (officer.status !== 'serving' || landholdingFactionIds.has(officer.factionId)) return officer;
      const activeOrder = orderByOfficerId.get(officer.id);
      const settlement = (activeOrder && (
        state.cities[activeOrder.targetCityId] ?? state.cities[activeOrder.sourceCityId]
      )) ?? (officer.cityId ? state.cities[officer.cityId] : undefined)
        ?? Object.values(state.cities).sort((a, b) => a.id.localeCompare(b.id))[0];
      if (!settlement) throw new Error(`Cannot release landless officer without a settlement: ${officer.id}`);
      return {
        ...officer,
        status: 'free' as const,
        factionId: neutralFactionId,
        cityId: settlement.id,
        troops: 0,
        stamina: 0,
      };
    })(),
  ]));
  return { ...state, officers, strategicOrders };
}

export function terminateAllStrategicOrders(state: GameState): GameState {
  if (Object.keys(state.strategicOrders).length === 0) return state;
  const neutralFactionId = Object.values(state.factions).find((faction) => faction.isNeutral)?.id;
  const officers = { ...state.officers };

  for (const order of Object.values(state.strategicOrders)) {
    const officer = officers[order.officerId];
    if (!officer || officer.status !== 'serving' || officer.cityId) continue;
    const destination = [state.cities[order.targetCityId], state.cities[order.sourceCityId]]
      .find((city) => city?.ownerId === officer.factionId)
      ?? Object.values(state.cities)
        .filter((city) => city.ownerId === officer.factionId)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (destination) {
      officers[officer.id] = { ...officer, cityId: destination.id };
      continue;
    }
    const settlement = state.cities[order.targetCityId] ?? state.cities[order.sourceCityId]
      ?? Object.values(state.cities).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!neutralFactionId || !settlement) throw new Error('Cannot terminate strategic orders without a settlement');
    officers[officer.id] = {
      ...officer,
      status: 'free',
      factionId: neutralFactionId,
      cityId: settlement.id,
      troops: 0,
      stamina: 0,
    };
  }

  return updateCitySatraps({ ...state, officers, strategicOrders: {} });
}

function compareSatrapCandidates(a: Officer, b: Officer): number {
  return b.intelligence - a.intelligence || b.force - a.force || a.id.localeCompare(b.id);
}
