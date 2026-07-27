import { MAX_CITY_RESOURCE } from './economy';
import { appendLogs } from './logs';
import { nextRandom } from './random';
import { getCityFreeOfficers } from './selectors';
import type { City, GameState, Officer } from './types';
import { assertValidGameState } from './validation';
import { issueMoveOrder } from './strategicOrders';
import {
  OFFICER_EQUIPMENT_LIMIT,
  getEffectiveOfficerAttributes,
  getOfficerEquipmentIds,
} from './equipment';

export const SEARCH_STAMINA_COST = 8;
export const RECRUIT_OFFICER_STAMINA_COST = 8;
export const REWARD_MONEY_COST = 100;
export const REWARD_LOYALTY_GAIN = 8;

export type SearchOrder = {
  cityId: string;
  officerId: string;
};

export type MoveOfficerOrder = {
  sourceCityId: string;
  targetCityId: string;
  officerId: string;
};

export type RecruitOfficerOrder = {
  cityId: string;
  executorOfficerId: string;
  targetOfficerId: string;
};

export type RewardOfficerOrder = {
  cityId: string;
  officerId: string;
};

export type GiveItemOrder = {
  cityId: string;
  officerId: string;
  itemId: string;
};

export type CommandAvailability =
  | { allowed: true }
  | { allowed: false; reason: string };

export type UnequipItemOrder = {
  cityId: string;
  officerId: string;
  itemId: string;
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
  const discoveredOfficerIds = new Set(state.discoveredOfficerIds);
  let nextCity = city;
  let message = `${officer.name}在${city.name}四处查访，没有得到有用的消息。`;
  const resultType = draw(4);

  if (resultType === 1) {
    const intelligenceRoll = draw(150);
    if (intelligenceRoll < officer.intelligence) {
      if (intelligenceRoll % 2 === 0) {
        const candidates = getCityFreeOfficers(state, city.id);
        if (candidates.length > 0) {
          const candidate = candidates[draw(candidates.length)];
          if (draw(110) < officer.intelligence) {
            const loyalty = 70 + draw(30);
            officers[candidate.id] = {
              ...candidate,
              status: 'serving',
              factionId: state.activeFactionId,
              loyalty,
            };
            discoveredOfficerIds.delete(candidate.id);
            message = `${officer.name}在${city.name}访得${candidate.name}，成功请其出仕，忠诚为 ${loyalty}。`;
          } else {
            if (state.activeFactionId === state.playerFactionId) discoveredOfficerIds.add(candidate.id);
            message = `${officer.name}在${city.name}听闻${candidate.name}之名，但未能请其出仕。`;
          }
        }
      } else {
        const candidates = city.hiddenItemIds ?? [];
        if (candidates.length > 0) {
          const foundItemId = candidates[draw(candidates.length)];
          const foundItem = state.items[foundItemId];
          nextCity = {
            ...city,
            itemIds: [...(city.itemIds ?? []), foundItemId],
            hiddenItemIds: candidates.filter((_, index) => index !== candidates.indexOf(foundItemId)),
          };
          message = `${officer.name}在${city.name}搜得${foundItem.name}。`;
        }
      }
    }
  } else if (resultType === 2) {
    const amount = 10 + draw(Math.max(1, officer.intelligence * 2));
    nextCity = {
      ...city,
      money: city.money >= MAX_CITY_RESOURCE ? city.money : Math.min(MAX_CITY_RESOURCE, city.money + amount),
    };
    message = `${officer.name}在${city.name}搜得金钱 ${amount}。`;
  } else if (resultType === 3) {
    const amount = 10 + draw(Math.max(1, officer.intelligence * 2));
    nextCity = {
      ...city,
      food: city.food >= MAX_CITY_RESOURCE ? city.food : Math.min(MAX_CITY_RESOURCE, city.food + amount),
    };
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
    discoveredOfficerIds: [...discoveredOfficerIds],
  }, 'map', [message]);
  assertValidGameState(next);
  return next;
}

export function recruitFreeOfficer(state: GameState, order: RecruitOfficerOrder): GameState {
  const city = state.cities[order.cityId];
  if (state.phase !== 'player' || state.activeFactionId !== state.playerFactionId) {
    throw new Error('只能在玩家阶段登用人才');
  }
  if (!city || city.ownerId !== state.playerFactionId) throw new Error('只能在己方城池登用人才');

  const executor = state.officers[order.executorOfficerId];
  if (!executor || executor.status !== 'serving' || executor.factionId !== state.playerFactionId || executor.cityId !== city.id) {
    throw new Error('登用执行者不在该城');
  }
  if (state.actedOfficerIds.includes(executor.id)) throw new Error('该武将本月已经执行过命令');
  if (executor.stamina < RECRUIT_OFFICER_STAMINA_COST) {
    throw new Error(`武将体力不足，需要 ${RECRUIT_OFFICER_STAMINA_COST}`);
  }

  const target = state.officers[order.targetOfficerId];
  if (!target || target.status !== 'free' || target.cityId !== city.id || !state.discoveredOfficerIds.includes(target.id)) {
    throw new Error('该人才尚未在本城被发现');
  }

  const roll = nextRandom(state.rngSeed);
  let seed = roll.seed;
  const success = Math.floor(roll.value * 110) < executor.intelligence;
  const officers = { ...state.officers };
  let discoveredOfficerIds = state.discoveredOfficerIds;
  let message: string;

  if (success) {
    const loyaltyRoll = nextRandom(seed);
    seed = loyaltyRoll.seed;
    const loyalty = 70 + Math.floor(loyaltyRoll.value * 30);
    officers[target.id] = {
      ...target,
      status: 'serving',
      factionId: state.playerFactionId,
      loyalty,
    };
    discoveredOfficerIds = state.discoveredOfficerIds.filter((officerId) => officerId !== target.id);
    message = `${executor.name}成功说服${target.name}在${city.name}出仕，忠诚为 ${loyalty}。`;
  } else {
    message = `${executor.name}劝说${target.name}出仕，但对方暂未应允。`;
  }

  officers[executor.id] = { ...executor, stamina: executor.stamina - RECRUIT_OFFICER_STAMINA_COST };
  const next = appendLogs({
    ...state,
    campaignStarted: true,
    rngSeed: seed,
    officers,
    actedOfficerIds: [...state.actedOfficerIds, executor.id],
    discoveredOfficerIds,
  }, 'map', [message]);
  assertValidGameState(next);
  return next;
}

export function rewardOfficer(state: GameState, order: RewardOfficerOrder): GameState {
  if (state.phase !== 'player' || state.activeFactionId !== state.playerFactionId) {
    throw new Error('只能在玩家阶段奖赏武将');
  }
  const city = state.cities[order.cityId];
  if (!city || city.ownerId !== state.playerFactionId) throw new Error('只能在己方城池奖赏武将');
  if (city.money < REWARD_MONEY_COST) throw new Error(`城中金钱不足，需要 ${REWARD_MONEY_COST}`);
  const officer = state.officers[order.officerId];
  if (!officer || officer.status !== 'serving' || officer.factionId !== state.playerFactionId || officer.cityId !== city.id) {
    throw new Error('受赏武将不在该城');
  }
  if (officer.id === state.factions[state.playerFactionId].rulerOfficerId) throw new Error('君主不需要奖赏忠诚');
  if (officer.loyalty >= 100) throw new Error('该武将忠诚已经达到上限');

  const loyalty = Math.min(100, officer.loyalty + REWARD_LOYALTY_GAIN);
  const next = appendLogs({
    ...state,
    campaignStarted: true,
    cities: { ...state.cities, [city.id]: { ...city, money: city.money - REWARD_MONEY_COST } },
    officers: { ...state.officers, [officer.id]: { ...officer, loyalty } },
  }, 'map', [`奖赏${officer.name}金钱 ${REWARD_MONEY_COST}，忠诚由 ${officer.loyalty} 提高至 ${loyalty}。`]);
  assertValidGameState(next);
  return next;
}

export function getGiveItemAvailability(state: GameState, order: GiveItemOrder): CommandAvailability {
  if (state.phase === 'ended') return { allowed: false, reason: '战役已经结束' };
  if (state.pendingSuccession) return { allowed: false, reason: '必须先拥立新君' };
  const city = state.cities[order.cityId];
  if (!city || city.ownerId !== state.activeFactionId) return { allowed: false, reason: '只能使用己方城池中的道具' };
  if (!(city.itemIds ?? []).includes(order.itemId)) return { allowed: false, reason: '该道具不在城中或尚未发现' };
  const item = state.items[order.itemId];
  if (!item) return { allowed: false, reason: `未知道具：${order.itemId}` };
  const officer = state.officers[order.officerId];
  if (!officer || officer.status !== 'serving' || officer.factionId !== state.activeFactionId || officer.cityId !== city.id) {
    return { allowed: false, reason: '受赏武将不在该城' };
  }

  if (getOfficerEquipmentIds(officer).length >= OFFICER_EQUIPMENT_LIMIT) {
    return { allowed: false, reason: `该武将的 ${OFFICER_EQUIPMENT_LIMIT} 个装备位置已经占满` };
  }
  const effective = getEffectiveOfficerAttributes(state, officer);
  if (item.armsTypeOverride === 'elite' && effective.force <= 105) {
    return { allowed: false, reason: '武力超过 105 才能使用铁骑兵符' };
  }
  if (item.armsTypeOverride === 'mystic' && effective.intelligence <= 105) {
    return { allowed: false, reason: '智力超过 105 才能使用太玄兵符' };
  }
  return { allowed: true };
}

export function giveItemToOfficer(state: GameState, order: GiveItemOrder): GameState {
  const availability = getGiveItemAvailability(state, order);
  if (!availability.allowed) throw new Error(availability.reason);
  const city = state.cities[order.cityId];
  const itemIndex = (city.itemIds ?? []).indexOf(order.itemId);
  const item = state.items[order.itemId];
  const officer = state.officers[order.officerId];

  let updatedOfficer: Officer;
  let usage: string;
  if (item.armsTypeOverride) {
    updatedOfficer = { ...officer, armsTypeId: item.armsTypeOverride };
    usage = `使用${item.name}，兵种变为${state.armsTypes[item.armsTypeOverride].name}`;
  } else {
    updatedOfficer = { ...officer, equipmentItemIds: [...getOfficerEquipmentIds(officer), item.id] };
    usage = `装备${item.name}`;
  }

  const rulerId = state.factions[state.activeFactionId].rulerOfficerId;
  if (officer.id !== rulerId) updatedOfficer = {
    ...updatedOfficer,
    loyalty: Math.min(100, officer.loyalty + REWARD_LOYALTY_GAIN),
  };
  const itemIds = [...(city.itemIds ?? [])];
  itemIds.splice(itemIndex, 1);
  const loyaltyText = officer.id === rulerId ? '' : `，忠诚提高至 ${updatedOfficer.loyalty}`;
  const next = appendLogs({
    ...state,
    campaignStarted: true,
    cities: { ...state.cities, [city.id]: { ...city, itemIds } },
    officers: { ...state.officers, [officer.id]: updatedOfficer },
  }, 'map', [`赏赐${officer.name}${item.name}：${usage}${loyaltyText}。`]);
  assertValidGameState(next);
  return next;
}

export function unequipOfficerItem(state: GameState, order: UnequipItemOrder): GameState {
  if (state.phase === 'ended') throw new Error('战役已经结束');
  if (state.pendingSuccession) throw new Error('必须先拥立新君');
  const city = state.cities[order.cityId];
  if (!city || city.ownerId !== state.activeFactionId) throw new Error('只能管理己方城池中的装备');
  const officer = state.officers[order.officerId];
  if (!officer || officer.status !== 'serving' || officer.factionId !== state.activeFactionId || officer.cityId !== city.id) {
    throw new Error('待卸下装备的武将不在该城');
  }
  const equipmentItemIds = getOfficerEquipmentIds(officer);
  const itemIndex = equipmentItemIds.indexOf(order.itemId);
  if (itemIndex < 0) throw new Error('该武将没有装备指定道具');
  const item = state.items[order.itemId];
  equipmentItemIds.splice(itemIndex, 1);
  const next = appendLogs({
    ...state,
    campaignStarted: true,
    cities: {
      ...state.cities,
      [city.id]: { ...city, itemIds: [...(city.itemIds ?? []), order.itemId] },
    },
    officers: { ...state.officers, [officer.id]: { ...officer, equipmentItemIds } },
  }, 'map', [`${officer.name}卸下${item.name}，道具返回${city.name}库存。`]);
  assertValidGameState(next);
  return next;
}

export function moveOfficer(state: GameState, order: MoveOfficerOrder): GameState {
  return issueMoveOrder(state, order);
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
  if (state.phase === 'ended') throw new Error('战役已经结束');
  if (state.pendingSuccession) throw new Error('必须先拥立新君');
  const city = state.cities[order.cityId];
  if (!city) throw new Error(`未知城池：${order.cityId}`);
  if (city.ownerId !== state.activeFactionId) throw new Error('只能在己方城池执行搜寻');
  const officer = state.officers[order.officerId];
  if (!officer) throw new Error(`未知武将：${order.officerId}`);
  if (officer.status !== 'serving' || officer.factionId !== state.activeFactionId || officer.cityId !== city.id) {
    throw new Error('执行武将不在该城');
  }
  if (state.actedOfficerIds.includes(officer.id)) throw new Error('该武将本月已经执行过命令');
  if (officer.stamina < SEARCH_STAMINA_COST) throw new Error(`武将体力不足，需要 ${SEARCH_STAMINA_COST}`);
  return { city, officer };
}
