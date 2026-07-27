import { appendLogs } from './logs';
import { getCityOfficers } from './selectors';
import type { CityIntelReport, GameState, Officer } from './types';
import { assertValidGameState } from './validation';
import { getCampaignCommandCost } from './rulesets';

/** Provisional alignment with order.h; runtime ConsumeThew resources are not vendored. */
export const RECON_STAMINA_COST = 4;
/** Provisional product cost until the original ConsumeMoney[RECONNOITRE] entry is verified. */
export const RECON_MONEY_COST = 50;

export type ReconOrder = {
  sourceCityId: string;
  targetCityId: string;
  officerId: string;
};

export type ReconAvailability =
  | { allowed: true }
  | { allowed: false; reason: string };

export function getReconTargets(state: GameState, sourceCityId: string) {
  const source = state.cities[sourceCityId];
  if (!source) return [];
  return Object.values(state.cities)
    .filter((city) => city.id !== source.id && city.ownerId !== source.ownerId)
    .sort((a, b) => (a.sourceIndex ?? Number.MAX_SAFE_INTEGER) - (b.sourceIndex ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id));
}

export function getReconAvailability(state: GameState, order: ReconOrder): ReconAvailability {
  const cost = getCampaignCommandCost(state.rulesetId, 'reconnoitre');
  if (state.phase !== 'player' || state.activeFactionId !== state.playerFactionId) {
    return { allowed: false, reason: '只能在玩家阶段执行侦察' };
  }
  const source = state.cities[order.sourceCityId];
  if (!source || source.ownerId !== state.playerFactionId) {
    return { allowed: false, reason: '只能从己方城池派出侦察' };
  }
  const target = state.cities[order.targetCityId];
  if (!target || target.ownerId === source.ownerId || target.id === source.id) {
    return { allowed: false, reason: '请选择非己方目标城池' };
  }
  const officer = state.officers[order.officerId];
  if (!isStationedPlayerOfficer(state, officer, source.id)) {
    return { allowed: false, reason: '执行武将不在出发城' };
  }
  if (state.actedOfficerIds.includes(officer.id)) {
    return { allowed: false, reason: `${officer.name}本月已经行动` };
  }
  if (officer.stamina < cost.stamina) {
    return { allowed: false, reason: `${officer.name}体力不足，需要 ${cost.stamina} 点` };
  }
  if (source.money < cost.money) {
    return { allowed: false, reason: `${source.name}金钱不足，需要 ${cost.money}` };
  }
  return { allowed: true };
}

export function reconnoitreCity(state: GameState, order: ReconOrder): GameState {
  const cost = getCampaignCommandCost(state.rulesetId, 'reconnoitre');
  const availability = getReconAvailability(state, order);
  if (!availability.allowed) throw new Error(availability.reason);
  const source = state.cities[order.sourceCityId];
  const target = state.cities[order.targetCityId];
  const officer = state.officers[order.officerId];
  const report = createCityIntelReport(state, target.id);
  const next = appendLogs({
    ...state,
    campaignStarted: true,
    cities: {
      ...state.cities,
      [source.id]: { ...source, money: source.money - cost.money },
    },
    officers: {
      ...state.officers,
      [officer.id]: { ...officer, stamina: officer.stamina - cost.stamina },
    },
    actedOfficerIds: [...state.actedOfficerIds, officer.id],
    intelReports: { ...state.intelReports, [target.id]: report },
  }, 'map', [
    `${officer.name}从${source.name}侦察${target.name}：守军 ${report.officerCount} 将、${report.totalTroops} 兵，后备兵 ${report.reserveTroops}。`,
  ]);
  assertValidGameState(next);
  return next;
}

export function createCityIntelReport(state: GameState, cityId: string): CityIntelReport {
  const city = state.cities[cityId];
  if (!city) throw new Error(`未知城池：${cityId}`);
  const officers = getCityOfficers(state, city.id).filter((officer) => officer.status === 'serving');
  const satrap = city.satrapOfficerId ? state.officers[city.satrapOfficerId] : undefined;
  return {
    cityId: city.id,
    observedTurn: state.turn,
    observedYear: state.calendar.year,
    observedMonth: state.calendar.month,
    population: city.population,
    money: city.money,
    food: city.food,
    reserveTroops: city.reserveTroops,
    farming: city.farming,
    commerce: city.commerce,
    defense: city.defense,
    publicLoyalty: city.publicLoyalty,
    satrapName: satrap?.name,
    officerIds: officers.map((candidate) => candidate.id).sort((left, right) => left.localeCompare(right)),
    officerCount: officers.length,
    totalTroops: officers.reduce((sum, candidate) => sum + candidate.troops, 0),
  };
}

function isStationedPlayerOfficer(state: GameState, officer: Officer | undefined, cityId: string): officer is Officer {
  return Boolean(officer
    && officer.status === 'serving'
    && officer.factionId === state.playerFactionId
    && officer.cityId === cityId);
}
