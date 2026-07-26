import { appendLogs } from './logs';
import {
  canCreditStrategicCargo,
  creditStrategicCargo,
  creditStrategicCargoAcrossCities,
  formatStrategicCargo,
} from './strategicOrderCargo';
import type { City, DiplomaticOrder, GameState, Officer, StrategicOrder } from './types';

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
  const diplomaticOrders = state.diplomaticOrders ?? {};
  const hasLandlessServingOfficer = Object.values(state.officers).some((officer) =>
    officer.status === 'serving' && !landholdingFactionIds.has(officer.factionId),
  );
  const orderByOfficerId = new Map<string, StrategicOrder | DiplomaticOrder>([
    ...Object.values(state.strategicOrders).map((order) => [order.officerId, order] as const),
    ...Object.values(diplomaticOrders).map((order) => [order.officerId, order] as const),
  ]);
  const landlessOrderIds = new Set(Object.values(state.strategicOrders)
    .filter((order) => !landholdingFactionIds.has(order.factionId))
    .map((order) => order.id));
  const landlessDiplomaticOrderIds = new Set(Object.values(diplomaticOrders)
    .filter((order) => !landholdingFactionIds.has(order.factionId))
    .map((order) => order.id));
  if (!hasLandlessServingOfficer && landlessOrderIds.size === 0 && landlessDiplomaticOrderIds.size === 0) return state;
  if (!neutralFactionId) throw new Error('Landless factions cannot release officers without a neutral faction');

  const cities = { ...state.cities };
  const messages: string[] = [];
  for (const order of Object.values(state.strategicOrders)
    .filter((candidate) => landlessOrderIds.has(candidate.id) && candidate.kind === 'transport')) {
    const destinationIds = settleCargoAcrossCities(cities, order);
    const destinationNames = destinationIds.map((cityId) => cities[cityId].name).join('、');
    messages.push(`${order.id}随所属势力灭亡而失效，${formatStrategicCargo(order.cargo)}由${destinationNames}接收。`);
  }
  const strategicOrders = Object.fromEntries(Object.values(state.strategicOrders)
    .filter((order) => !landlessOrderIds.has(order.id))
    .map((order) => [order.id, order]));
  const remainingDiplomaticOrders = Object.fromEntries(Object.values(diplomaticOrders)
    .filter((order) => !landlessDiplomaticOrderIds.has(order.id))
    .map((order) => [order.id, order]));
  for (const order of Object.values(diplomaticOrders).filter(
    (candidate) => landlessDiplomaticOrderIds.has(candidate.id),
  )) {
    messages.push(`${order.id}随所属势力灭亡而失效。`);
  }
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
  const next = {
    ...state,
    cities,
    officers,
    strategicOrders,
    diplomaticOrders: remainingDiplomaticOrders,
  };
  return messages.length > 0 ? appendLogs(next, 'turn', messages) : next;
}

export function terminateAllStrategicOrders(state: GameState): GameState {
  if (Object.keys(state.strategicOrders).length === 0) return state;
  const neutralFactionId = Object.values(state.factions).find((faction) => faction.isNeutral)?.id;
  const officers = { ...state.officers };
  const cities = { ...state.cities };

  for (const order of Object.values(state.strategicOrders)) {
    const officer = officers[order.officerId];
    const preferredCities = order.kind === 'transport'
      ? [state.cities[order.sourceCityId], state.cities[order.targetCityId]]
      : [state.cities[order.targetCityId], state.cities[order.sourceCityId]];
    const destination = preferredCities
      .find((city) => city?.ownerId === order.factionId)
      ?? Object.values(state.cities)
        .filter((city) => city.ownerId === order.factionId)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (order.kind === 'transport') {
      if (destination && canCreditStrategicCargo(cities[destination.id], order.cargo)) {
        cities[destination.id] = creditStrategicCargo(cities[destination.id], order.cargo);
      } else {
        settleCargoAcrossCities(cities, order);
      }
    }
    if (!officer || officer.status !== 'serving' || officer.cityId) continue;
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

  return updateCitySatraps({ ...state, cities, officers, strategicOrders: {} });
}

function settleCargoAcrossCities(
  cities: GameState['cities'],
  order: StrategicOrder,
): string[] {
  const source = cities[order.sourceCityId];
  const target = cities[order.targetCityId];
  const ownCities = Object.values(cities)
    .filter((city) => city.ownerId === order.factionId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const candidates = [source, target, ...ownCities, ...Object.values(cities).sort((a, b) => a.id.localeCompare(b.id))]
    .filter((city): city is City => city !== undefined);
  return creditStrategicCargoAcrossCities(cities, candidates, order.cargo);
}

function compareSatrapCandidates(a: Officer, b: Officer): number {
  return b.intelligence - a.intelligence || b.force - a.force || a.id.localeCompare(b.id);
}
