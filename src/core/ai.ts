import { estimateBattle, executeAttack, type AttackOrder } from './battle';
import {
  DEVELOP_MONEY_COST,
  DEVELOP_STAMINA_COST,
  GOVERN_MONEY_COST,
  GOVERN_STAMINA_COST,
  INSPECT_MONEY_COST,
  INSPECT_STAMINA_COST,
  RECRUIT_STAMINA_COST,
  BUY_FOOD_PRICE,
  TRADE_MONEY_SOFT_CAP,
  TRADE_STAMINA_COST,
  MAX_DISTRIBUTION_INCREASE,
  calculateOfficerTroopCapacity,
  calculateRecruitCapacity,
  developCommerce,
  developFarming,
  distributeTroops,
  getDevelopCommerceAvailability,
  getDevelopFarmingAvailability,
  getTradeAvailability,
  governCity,
  inspectCity,
  recruitTroops,
  tradeFood,
} from './cityCommands';
import { calculateCityGrowth, getSupportedOfficerIdsByCity } from './economy';
import { appendLogs } from './logs';
import {
  SEARCH_STAMINA_COST,
  getGiveItemAvailability,
  giveItemToOfficer,
  moveOfficer,
  searchCity,
} from './personnelCommands';
import type { AiProfile, GameState } from './types';
import { recruitCaptive, SURRENDER_STAMINA_COST } from './captiveCommands';
import {
  MOVE_STAMINA_COST,
  TRANSPORT_STAMINA_COST,
  findOwnedCityRoute,
  issueTransportOrder,
} from './strategicOrders';
import {
  DIPLOMACY_MONEY_COST,
  getDiplomacyTargets,
  getDiplomaticOrderAvailability,
  issueDiplomaticOrder,
} from './diplomaticOrders';
import type { DiplomaticOrderKind } from './types';

export const AI_MAX_ACTIONS = 5;
const AI_MIN_ATTACK_PROVISIONS = 200;
const OPENING_ATTACK_THRESHOLD = 4;

export type AiDecision = {
  action: 'attack' | 'skip';
  factionId: string;
  order?: AttackOrder;
  scoreRatio?: number;
  reason: string;
};

export type InteractiveAiFactionTurn = {
  state: GameState;
  pendingPlayerDefense?: AttackOrder;
};

const attackThresholds: Record<AiProfile, number> = {
  aggressive: 0.9,
  balanced: 1.05,
  defensive: 1.2,
};

export function planAiAction(state: GameState, factionId = state.activeFactionId): AiDecision {
  if (state.phase !== 'ai') throw new Error('AI can only plan during the AI phase');
  if (state.activeFactionId !== factionId) throw new Error('AI faction is not active');
  const faction = state.factions[factionId];
  if (!faction) throw new Error(`Unknown AI faction: ${factionId}`);
  if (faction.isPlayer) throw new Error('Player faction cannot use AI planning');

  const candidates: Array<{ order: AttackOrder; ratio: number }> = [];
  const sourceCities = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const source of sourceCities) {
    const officerIds = Object.values(state.officers)
      .filter(
        (officer) =>
          officer.status === 'serving' &&
          officer.factionId === factionId &&
          officer.cityId === source.id &&
          officer.troops > 0 &&
          officer.stamina > 0 &&
          !state.actedOfficerIds.includes(officer.id),
      )
      .sort((a, b) => b.leadership - a.leadership || a.id.localeCompare(b.id))
      .map((officer) => officer.id);
    if (officerIds.length === 0 || source.food < AI_MIN_ATTACK_PROVISIONS) continue;

    for (const targetId of [...source.neighbors].sort()) {
      const target = state.cities[targetId];
      if (!target || target.ownerId === factionId) continue;
      const order = {
        sourceCityId: source.id,
        targetCityId: target.id,
        officerIds: officerIds.slice(0, 10),
        provisions: Math.max(1, Math.min(source.food, 500)),
      };
      const estimate = estimateBattle(state, order);
      candidates.push({ order, ratio: estimate.defender === 0 ? Number.POSITIVE_INFINITY : estimate.attacker / estimate.defender });
    }
  }

  if (candidates.length === 0) {
    return { action: 'skip', factionId, reason: '没有具备出征条件的边境部队。' };
  }

  candidates.sort(
    (a, b) =>
      b.ratio - a.ratio ||
      a.order.sourceCityId.localeCompare(b.order.sourceCityId) ||
      a.order.targetCityId.localeCompare(b.order.targetCityId),
  );
  const best = candidates[0];
  const threshold = state.turn === 1
    ? Math.max(attackThresholds[faction.aiProfile], OPENING_ATTACK_THRESHOLD)
    : attackThresholds[faction.aiProfile];
  if (best.ratio < threshold) {
    return {
      action: 'skip',
      factionId,
      scoreRatio: best.ratio,
      reason: `最优战力比 ${best.ratio.toFixed(2)}，低于${faction.aiProfile}策略阈值 ${threshold.toFixed(2)}。`,
    };
  }

  return {
    action: 'attack',
    factionId,
    order: best.order,
    scoreRatio: best.ratio,
    reason: `选择战力比 ${best.ratio.toFixed(2)} 的最优相邻目标。`,
  };
}

export function runAiFactionTurn(state: GameState): GameState {
  const prepared = prepareAiFactionTurn(state);
  return prepared.order ? executeAttack(prepared.state, prepared.order) : prepared.state;
}

export function runAiFactionTurnUntilPlayerDefense(state: GameState): InteractiveAiFactionTurn {
  const prepared = prepareAiFactionTurn(state);
  if (!prepared.order) return { state: prepared.state };
  const target = prepared.state.cities[prepared.order.targetCityId];
  if (target.ownerId === prepared.state.playerFactionId) {
    return { state: prepared.state, pendingPlayerDefense: prepared.order };
  }
  return { state: executeAttack(prepared.state, prepared.order) };
}

function prepareAiFactionTurn(state: GameState): { state: GameState; order?: AttackOrder } {
  const faction = state.factions[state.activeFactionId];
  let next = state;
  let actionCount = 0;

  for (const operation of [
    stabilizeFood,
    recruitLocalCaptive,
    useDiplomaticOpportunity,
    useCityItem,
    balanceTroops,
    recruitReserves,
    improveCity,
    searchLocalTalent,
    supplyFrontier,
    reinforceFrontier,
  ]) {
    if (actionCount >= AI_MAX_ACTIONS - 1 || next.phase === 'ended') break;
    const operated = operation(next, faction.id);
    if (operated) {
      next = operated;
      actionCount += 1;
    }
  }

  if (next.phase === 'ended' || actionCount >= AI_MAX_ACTIONS) return { state: next };
  const decision = planAiAction(next, faction.id);
  if (decision.action === 'skip' || !decision.order) {
    return { state: appendLogs(next, 'ai', [`${faction.name}完成 ${actionCount} 项经营行动，未出征：${decision.reason}`]) };
  }

  const source = next.cities[decision.order.sourceCityId];
  const target = next.cities[decision.order.targetCityId];
  const announced = appendLogs(next, 'ai', [
    `${faction.name}完成 ${actionCount} 项经营行动后，决定从${source.name}进攻${target.name}：${decision.reason}`,
  ]);
  return { state: announced, order: decision.order };
}

export function useDiplomaticOpportunity(state: GameState, factionId: string): GameState | undefined {
  const ownedCities = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId && city.money >= DIPLOMACY_MONEY_COST)
    .sort((left, right) => left.id.localeCompare(right.id));
  const candidates: Array<{ kind: DiplomaticOrderKind; maximumLoyalty: number }> = [
    { kind: 'induce', maximumLoyalty: 100 },
    { kind: 'counterespionage', maximumLoyalty: 30 },
    { kind: 'canvass', maximumLoyalty: 25 },
    { kind: 'alienate', maximumLoyalty: 65 },
  ];

  for (const { kind, maximumLoyalty } of candidates) {
    const targets = getDiplomacyTargets(state, kind, factionId)
      .filter((target) => target.loyalty <= maximumLoyalty)
      .sort((left, right) =>
        left.loyalty - right.loyalty
        || right.intelligence - left.intelligence
        || left.id.localeCompare(right.id));
    for (const target of targets) {
      for (const city of ownedCities) {
        const executors = availableOfficers(state, factionId, city.id, 4)
          .filter((officer) =>
            officer.id !== state.factions[factionId].rulerOfficerId
            && (!isExposedSoleGarrison(state, city.id, factionId) || officer.id !== city.satrapOfficerId))
          .sort((left, right) => right.intelligence - left.intelligence || left.id.localeCompare(right.id));
        for (const executor of executors) {
          const input = {
            kind,
            sourceCityId: city.id,
            officerId: executor.id,
            targetOfficerId: target.id,
          };
          if (!getDiplomaticOrderAvailability(state, input).allowed) continue;
          return issueDiplomaticOrder(state, input);
        }
      }
    }
  }
  return undefined;
}

function stabilizeFood(state: GameState, factionId: string): GameState | undefined {
  const supportedOfficerIdsByCity = getSupportedOfficerIdsByCity(state);
  const candidates = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId)
    .map((city) => {
      const supportedTroops = (supportedOfficerIdsByCity.get(city.id) ?? [])
        .map((officerId) => state.officers[officerId])
        .filter((officer) => officer?.factionId === factionId)
        .reduce((sum, officer) => sum + officer.troops, 0);
      const upkeep = calculateCityGrowth(city, state.calendar, supportedTroops).upkeep;
      return { city, upkeep, targetFood: upkeep * 2 + 1 };
    })
    .filter(({ city, upkeep, targetFood }) =>
      upkeep > 0 && city.food < targetFood && city.money >= BUY_FOOD_PRICE)
    .sort((a, b) =>
      (a.city.food / a.targetFood) - (b.city.food / b.targetFood)
      || a.city.id.localeCompare(b.city.id));
  for (const { city, targetFood } of candidates) {
    const officer = availableOfficers(state, factionId, city.id, TRADE_STAMINA_COST)[0];
    if (!officer) continue;
    const amount = Math.min(
      targetFood - city.food,
      Math.floor(city.money / BUY_FOOD_PRICE),
      Math.max(0, TRADE_MONEY_SOFT_CAP - city.food),
    );
    if (amount <= 0) continue;
    const order = { cityId: city.id, officerId: officer.id, direction: 'buy' as const, amount };
    if (getTradeAvailability(state, order).allowed) return tradeFood(state, order);
  }
  return undefined;
}

function recruitLocalCaptive(state: GameState, factionId: string): GameState | undefined {
  const candidates = Object.values(state.officers)
    .filter((officer) => officer.status === 'captive' && officer.captorFactionId === factionId && officer.cityId)
    .sort((a, b) => a.loyalty - b.loyalty || b.intelligence - a.intelligence || a.id.localeCompare(b.id));
  for (const captive of candidates) {
    const executor = Object.values(state.officers)
      .filter((officer) => officer.status === 'serving' && officer.factionId === factionId && officer.cityId === captive.cityId)
      .filter((officer) => officer.stamina >= SURRENDER_STAMINA_COST && !state.actedOfficerIds.includes(officer.id))
      .sort((a, b) => b.intelligence - a.intelligence || a.id.localeCompare(b.id))[0];
    if (executor) return recruitCaptive(state, {
      cityId: captive.cityId!,
      executorOfficerId: executor.id,
      captiveOfficerId: captive.id,
    });
  }
  return undefined;
}

function useCityItem(state: GameState, factionId: string): GameState | undefined {
  const cities = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId && (city.itemIds?.length ?? 0) > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const city of cities) {
    for (const itemId of city.itemIds ?? []) {
      const item = state.items[itemId];
      if (!item) continue;
      const candidates = Object.values(state.officers)
        .filter((officer) => officer.status === 'serving' && officer.factionId === factionId && officer.cityId === city.id)
        .filter((officer) => officer.armsTypeId !== item.armsTypeOverride)
        .filter((officer) => getGiveItemAvailability(state, {
          cityId: city.id,
          officerId: officer.id,
          itemId,
        }).allowed)
        .sort((a, b) => item.intelligenceBonus > item.forceBonus
          ? b.intelligence - a.intelligence || a.id.localeCompare(b.id)
          : b.force - a.force || a.id.localeCompare(b.id));
      if (candidates[0]) return giveItemToOfficer(state, { cityId: city.id, officerId: candidates[0].id, itemId });
    }
  }
  return undefined;
}

function balanceTroops(state: GameState, factionId: string): GameState | undefined {
  const candidates = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId && city.reserveTroops > 0)
    .flatMap((city) => Object.values(state.officers)
      .filter((officer) => officer.status === 'serving' && officer.factionId === factionId && officer.cityId === city.id)
      .map((officer) => ({ city, officer, capacity: calculateOfficerTroopCapacity(officer) })))
    .filter(({ officer, capacity }) => officer.troops < capacity && !state.actedOfficerIds.includes(officer.id))
    .sort((a, b) =>
      (a.officer.troops / a.capacity) - (b.officer.troops / b.capacity)
      || b.officer.leadership - a.officer.leadership
      || a.officer.id.localeCompare(b.officer.id));
  const candidate = candidates[0];
  if (!candidate) return undefined;
  return distributeTroops(state, {
    cityId: candidate.city.id,
    officerId: candidate.officer.id,
    targetTroops: Math.min(
      candidate.capacity,
      candidate.officer.troops + candidate.city.reserveTroops,
      candidate.officer.troops + MAX_DISTRIBUTION_INCREASE,
    ),
  });
}

function recruitReserves(state: GameState, factionId: string): GameState | undefined {
  const candidates = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId && city.reserveTroops < 1_000 && city.food >= 200)
    .filter((city) => calculateRecruitCapacity(city) > 0)
    .sort((a, b) => a.reserveTroops - b.reserveTroops || a.id.localeCompare(b.id));
  for (const city of candidates) {
    const officer = availableOfficers(state, factionId, city.id, RECRUIT_STAMINA_COST)[0];
    if (officer) return recruitTroops(state, { cityId: city.id, officerId: officer.id, amount: 500 });
  }
  return undefined;
}

function improveCity(state: GameState, factionId: string): GameState | undefined {
  const troubledCities = Object.values(state.cities)
    .filter((city) =>
      city.ownerId === factionId
      && (city.condition ?? 'normal') !== 'normal'
      && !isExposedSoleGarrison(state, city.id, factionId)
      && city.money >= GOVERN_MONEY_COST)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const city of troubledCities) {
    const officer = availableOfficers(state, factionId, city.id, GOVERN_STAMINA_COST)
      .sort((a, b) => b.intelligence - a.intelligence || a.id.localeCompare(b.id))[0];
    if (officer) return governCity(state, { cityId: city.id, officerId: officer.id });
  }

  const inspectionCandidates = Object.values(state.cities)
    .filter((city) =>
      city.ownerId === factionId
      && !isExposedSoleGarrison(state, city.id, factionId)
      && city.publicLoyalty !== undefined
      && city.publicLoyalty < 60
      && city.money >= INSPECT_MONEY_COST)
    .sort((a, b) =>
      (a.publicLoyalty ?? 0) - (b.publicLoyalty ?? 0)
      || a.id.localeCompare(b.id));
  for (const city of inspectionCandidates) {
    const officer = availableOfficers(state, factionId, city.id, INSPECT_STAMINA_COST)
      .sort((a, b) => b.intelligence - a.intelligence || a.id.localeCompare(b.id))[0];
    if (officer) return inspectCity(state, { cityId: city.id, officerId: officer.id });
  }

  const candidates = Object.values(state.cities)
    .filter((city) =>
      city.ownerId === factionId
      && !isExposedSoleGarrison(state, city.id, factionId)
      && city.money >= DEVELOP_MONEY_COST)
    .map((city) => ({
      city,
      farmingRatio: farmingRatio(city.farming, city.farmingLimit),
      commerceRatio: farmingRatio(city.commerce, city.commerceLimit),
    }))
    .filter(({ city }) => {
      const officer = availableOfficers(state, factionId, city.id, DEVELOP_STAMINA_COST)[0];
      if (!officer) return false;
      const order = { cityId: city.id, officerId: officer.id };
      return getDevelopFarmingAvailability(state, order).allowed
        || getDevelopCommerceAvailability(state, order).allowed;
    })
    .sort((a, b) =>
      Math.min(a.farmingRatio, a.commerceRatio) - Math.min(b.farmingRatio, b.commerceRatio)
      || a.city.id.localeCompare(b.city.id));
  for (const candidate of candidates) {
    const { city } = candidate;
    const officer = availableOfficers(state, factionId, city.id, DEVELOP_STAMINA_COST)
      .sort((a, b) => b.intelligence - a.intelligence || a.id.localeCompare(b.id))[0];
    if (!officer) continue;
    const order = { cityId: city.id, officerId: officer.id };
    const canDevelopFarming = getDevelopFarmingAvailability(state, order).allowed;
    const canDevelopCommerce = getDevelopCommerceAvailability(state, order).allowed;
    if (canDevelopCommerce && (!canDevelopFarming || candidate.commerceRatio < candidate.farmingRatio)) {
      return developCommerce(state, order);
    }
    if (canDevelopFarming) return developFarming(state, order);
  }

  // Disaster events arrive in v0.5. Until then, governance is a fallback
  // investment after loyalty and revenue-producing improvements are exhausted.
  const governanceCandidates = Object.values(state.cities)
    .filter((city) =>
      city.ownerId === factionId
      && !isExposedSoleGarrison(state, city.id, factionId)
      && city.disasterPrevention !== undefined
      && city.disasterPrevention < 40
      && city.money >= GOVERN_MONEY_COST)
    .sort((a, b) =>
      (a.disasterPrevention ?? 0) - (b.disasterPrevention ?? 0)
      || a.id.localeCompare(b.id));
  for (const city of governanceCandidates) {
    const officer = availableOfficers(state, factionId, city.id, GOVERN_STAMINA_COST)
      .sort((a, b) => b.intelligence - a.intelligence || a.id.localeCompare(b.id))[0];
    if (officer) return governCity(state, { cityId: city.id, officerId: officer.id });
  }
  return undefined;
}

function reinforceFrontier(state: GameState, factionId: string): GameState | undefined {
  const borderCities = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId && city.neighbors.some((id) => state.cities[id]?.ownerId !== factionId))
    .sort((a, b) => stationedCount(state, a.id, factionId) - stationedCount(state, b.id, factionId) || a.id.localeCompare(b.id));
  for (const target of borderCities) {
    const sources = target.neighbors
      .map((id) => state.cities[id])
      .filter((city) => city?.ownerId === factionId && stationedCount(state, city.id, factionId) > 1)
      .sort((a, b) => stationedCount(state, b.id, factionId) - stationedCount(state, a.id, factionId) || a.id.localeCompare(b.id));
    for (const source of sources) {
      const faction = state.factions[factionId];
      const officer = availableOfficers(state, factionId, source.id, MOVE_STAMINA_COST)
        .filter((candidate) => candidate.id !== faction.rulerOfficerId && candidate.id !== source.satrapOfficerId)
        .sort((a, b) => b.leadership - a.leadership || a.id.localeCompare(b.id))[0];
      if (officer) return moveOfficer(state, { sourceCityId: source.id, targetCityId: target.id, officerId: officer.id });
    }
  }
  return undefined;
}

function supplyFrontier(state: GameState, factionId: string): GameState | undefined {
  const projected = new Map(Object.values(state.cities)
    .filter((city) => city.ownerId === factionId)
    .map((city) => {
      const inbound = Object.values(state.strategicOrders)
        .filter((order) =>
          order.kind === 'transport'
          && order.factionId === factionId
          && order.targetCityId === city.id)
        .reduce((cargo, order) => ({
          money: cargo.money + order.cargo.money,
          food: cargo.food + order.cargo.food,
          reserveTroops: cargo.reserveTroops + order.cargo.reserveTroops,
        }), { money: 0, food: 0, reserveTroops: 0 });
      return [city.id, {
        money: city.money + inbound.money,
        food: city.food + inbound.food,
        reserveTroops: city.reserveTroops + inbound.reserveTroops,
      }];
    }));
  const targets = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId)
    .filter((city) => city.neighbors.some((id) => state.cities[id]?.ownerId !== factionId))
    .filter((city) => {
      const supply = projected.get(city.id) ?? city;
      return supply.food < 400 || supply.reserveTroops < 300 || supply.money < 100;
    })
    .sort((a, b) => {
      const aSupply = projected.get(a.id) ?? a;
      const bSupply = projected.get(b.id) ?? b;
      return aSupply.food - bSupply.food
      || aSupply.reserveTroops - bSupply.reserveTroops
      || aSupply.money - bSupply.money
      || a.id.localeCompare(b.id);
    });
  for (const target of targets) {
    const targetSupply = projected.get(target.id) ?? target;
    const sources = Object.values(state.cities)
      .filter((city) => city.ownerId === factionId && city.id !== target.id)
      .map((city) => ({ city, route: findOwnedCityRoute(state, factionId, city.id, target.id) }))
      .filter((candidate) => candidate.route !== undefined)
      .filter(({ city }) => city.food > 900 || city.reserveTroops > 700 || city.money > 300)
      .sort((a, b) =>
        a.route!.length - b.route!.length
        || b.city.food - a.city.food
        || a.city.id.localeCompare(b.city.id));
    for (const { city: source } of sources) {
      const faction = state.factions[factionId];
      const officer = availableOfficers(state, factionId, source.id, TRANSPORT_STAMINA_COST)
        .filter((candidate) => candidate.id !== faction.rulerOfficerId && candidate.id !== source.satrapOfficerId)
        .sort((a, b) => b.intelligence - a.intelligence || a.id.localeCompare(b.id))[0];
      if (!officer) continue;
      const cargo = {
        money: targetSupply.money < 100 ? Math.min(100, Math.max(0, source.money - 200)) : 0,
        food: targetSupply.food < 400 ? Math.min(400, Math.max(0, source.food - 600)) : 0,
        reserveTroops: targetSupply.reserveTroops < 300
          ? Math.min(300, Math.max(0, source.reserveTroops - 500))
          : 0,
      };
      if (cargo.money + cargo.food + cargo.reserveTroops === 0) continue;
      return issueTransportOrder(state, {
        sourceCityId: source.id,
        targetCityId: target.id,
        officerId: officer.id,
        cargo,
      });
    }
  }
  return undefined;
}

function searchLocalTalent(state: GameState, factionId: string): GameState | undefined {
  const candidates = Object.values(state.cities)
    .filter((city) => city.ownerId === factionId)
    .filter((city) => (city.hiddenItemIds?.length ?? 0) > 0
      || Object.values(state.officers).some((officer) => officer.status === 'free' && officer.cityId === city.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const city of candidates) {
    const officer = availableOfficers(state, factionId, city.id, SEARCH_STAMINA_COST)
      .sort((a, b) => b.intelligence - a.intelligence || a.id.localeCompare(b.id))[0];
    if (officer) return searchCity(state, { cityId: city.id, officerId: officer.id });
  }
  return undefined;
}

function availableOfficers(state: GameState, factionId: string, cityId: string, stamina: number) {
  return Object.values(state.officers)
    .filter((officer) =>
      officer.status === 'serving'
      && officer.factionId === factionId
      && officer.cityId === cityId
      && officer.stamina >= stamina
      && !state.actedOfficerIds.includes(officer.id))
    .sort((a, b) => b.leadership - a.leadership || a.id.localeCompare(b.id));
}

function stationedCount(state: GameState, cityId: string, factionId: string): number {
  return Object.values(state.officers).filter(
    (officer) => officer.status === 'serving' && officer.factionId === factionId && officer.cityId === cityId,
  ).length;
}

function isExposedSoleGarrison(state: GameState, cityId: string, factionId: string): boolean {
  const city = state.cities[cityId];
  return city.neighbors.some((neighborId) => state.cities[neighborId]?.ownerId !== factionId)
    && stationedCount(state, cityId, factionId) <= 1;
}

function farmingRatio(farming: number, limit?: number): number {
  return limit && limit > 0 ? farming / limit : farming / 1_000;
}

export function runAiRound(state: GameState): GameState {
  if (state.phase !== 'ai') throw new Error('AI round requires the AI phase');
  let next = state;
  for (const factionId of state.factionOrder) {
    if (next.phase === 'ended') break;
    if (factionId === state.playerFactionId) continue;
    next = { ...next, activeFactionId: factionId };
    next = runAiFactionTurn(next);
  }
  return next;
}
