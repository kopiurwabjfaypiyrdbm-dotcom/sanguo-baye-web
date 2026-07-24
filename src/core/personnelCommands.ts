import { MAX_CITY_RESOURCE } from './economy';
import { appendLogs } from './logs';
import { nextRandom } from './random';
import { getCityFreeOfficers } from './selectors';
import { updateCitySatraps } from './administration';
import type { City, GameState, Officer } from './types';
import { assertValidGameState } from './validation';

export const SEARCH_STAMINA_COST = 8;

export type SearchOrder = {
  cityId: string;
  officerId: string;
};

export type MoveOfficerOrder = {
  sourceCityId: string;
  targetCityId: string;
  officerId: string;
};

export type AppointSatrapOrder = {
  cityId: string;
  officerId: string;
};

export function searchCity(state: GameState, order: SearchOrder): GameState {
  const { city, officer } = validateSearch(state, order);
  let seed = state.rngSeed;
  const draw = (maximum: number) => {
    const random = nextRandom(seed);
    seed = random.seed;
    return Math.floor(random.value * maximum);
  };

  const officers = { ...state.officers };
  let nextCity = city;
  let message = `${officer.name}在${city.name}四处查访，没有得到有用的消息。`;
  const resultType = draw(4);

  if (resultType === 1) {
    const intelligenceRoll = draw(150);
    if (intelligenceRoll < officer.intelligence && intelligenceRoll % 2 === 0) {
      const candidates = getCityFreeOfficers(state, city.id);
      if (candidates.length > 0) {
        const candidate = candidates[draw(candidates.length)];
        if (draw(110) < officer.intelligence) {
          const loyalty = 70 + draw(30);
          officers[candidate.id] = {
            ...candidate,
            status: 'serving',
            factionId: state.playerFactionId,
            loyalty,
          };
          message = `${officer.name}在${city.name}访得${candidate.name}，成功请其出仕，忠诚为 ${loyalty}。`;
        } else {
          message = `${officer.name}在${city.name}听闻${candidate.name}之名，但未能请其出仕。`;
        }
      }
    }
  } else if (resultType === 2) {
    const amount = 10 + draw(Math.max(1, officer.intelligence * 2));
    nextCity = { ...city, money: Math.min(MAX_CITY_RESOURCE, city.money + amount) };
    message = `${officer.name}在${city.name}搜得金钱 ${amount}。`;
  } else if (resultType === 3) {
    const amount = 10 + draw(Math.max(1, officer.intelligence * 2));
    nextCity = { ...city, food: Math.min(MAX_CITY_RESOURCE, city.food + amount) };
    message = `${officer.name}在${city.name}搜得粮草 ${amount}。`;
  }

  officers[officer.id] = { ...officer, stamina: officer.stamina - SEARCH_STAMINA_COST };
  const next: GameState = appendLogs({
    ...state,
    campaignStarted: true,
    rngSeed: seed,
    cities: { ...state.cities, [city.id]: nextCity },
    officers,
    actedOfficerIds: [...state.actedOfficerIds, officer.id],
  }, 'map', [message]);
  assertValidGameState(next);
  return next;
}

export function moveOfficer(state: GameState, order: MoveOfficerOrder): GameState {
  const source = state.cities[order.sourceCityId];
  const target = state.cities[order.targetCityId];
  if (state.phase !== 'player' || state.activeFactionId !== state.playerFactionId) {
    throw new Error('只能在玩家阶段调动武将');
  }
  if (!source || !target) throw new Error('调动的出发城或目标城不存在');
  if (source.ownerId !== state.playerFactionId || target.ownerId !== state.playerFactionId) {
    throw new Error('只能在己方城池之间调动武将');
  }
  if (!source.neighbors.includes(target.id) || !target.neighbors.includes(source.id)) {
    throw new Error('当前只能调动到相邻己方城池');
  }
  const officer = state.officers[order.officerId];
  if (!officer || officer.status !== 'serving' || officer.factionId !== state.playerFactionId || officer.cityId !== source.id) {
    throw new Error('待调武将不在出发城');
  }
  if (state.actedOfficerIds.includes(officer.id)) throw new Error('该武将本月已经执行过命令');

  let next = updateCitySatraps({
    ...state,
    campaignStarted: true,
    officers: { ...state.officers, [officer.id]: { ...officer, cityId: target.id } },
    actedOfficerIds: [...state.actedOfficerIds, officer.id],
  });
  next = appendLogs(next, 'map', [`${officer.name}从${source.name}调动至${target.name}。`]);
  assertValidGameState(next);
  return next;
}

export function appointSatrap(state: GameState, order: AppointSatrapOrder): GameState {
  if (state.phase !== 'player' || state.activeFactionId !== state.playerFactionId) {
    throw new Error('只能在玩家阶段任命太守');
  }
  const city = state.cities[order.cityId];
  if (!city) throw new Error(`未知城池：${order.cityId}`);
  if (city.ownerId !== state.playerFactionId) throw new Error('只能任命己方城池的太守');
  const officer = state.officers[order.officerId];
  if (!officer || officer.status !== 'serving' || officer.factionId !== state.playerFactionId || officer.cityId !== city.id) {
    throw new Error('太守人选不在该城');
  }
  if (city.satrapOfficerId === officer.id) throw new Error('该武将已经是本城太守');

  const next = appendLogs({
    ...state,
    campaignStarted: true,
    cities: { ...state.cities, [city.id]: { ...city, satrapOfficerId: officer.id } },
  }, 'map', [`任命${officer.name}为${city.name}太守。`]);
  assertValidGameState(next);
  return next;
}

function validateSearch(state: GameState, order: SearchOrder): { city: City; officer: Officer } {
  if (state.phase !== 'player' || state.activeFactionId !== state.playerFactionId) {
    throw new Error('只能在玩家阶段执行搜寻');
  }
  const city = state.cities[order.cityId];
  if (!city) throw new Error(`未知城池：${order.cityId}`);
  if (city.ownerId !== state.playerFactionId) throw new Error('只能在己方城池执行搜寻');
  const officer = state.officers[order.officerId];
  if (!officer) throw new Error(`未知武将：${order.officerId}`);
  if (officer.status !== 'serving' || officer.factionId !== state.playerFactionId || officer.cityId !== city.id) {
    throw new Error('执行武将不在该城');
  }
  if (state.actedOfficerIds.includes(officer.id)) throw new Error('该武将本月已经执行过命令');
  if (officer.stamina < SEARCH_STAMINA_COST) throw new Error(`武将体力不足，需要 ${SEARCH_STAMINA_COST}`);
  return { city, officer };
}
