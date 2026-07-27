import type { GameState } from './types';
import { OFFICER_EQUIPMENT_LIMIT, getOfficerEquipmentIds } from './equipment';

export type ValidationIssue = {
  path: string;
  message: string;
};

export function validateGameState(state: GameState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  if (state.schemaVersion !== 5) add('schemaVersion', 'must be 5');
  if (typeof state.campaignStarted !== 'boolean') add('campaignStarted', 'must be a boolean');
  if (!Number.isInteger(state.turn) || state.turn < 1) add('turn', 'must be a positive integer');
  if (!Number.isInteger(state.rngSeed) || state.rngSeed < 0) add('rngSeed', 'must be a non-negative integer');
  if (!Number.isInteger(state.calendar.year) || state.calendar.year < 1) add('calendar.year', 'must be a positive integer');
  if (!Number.isInteger(state.calendar.month) || state.calendar.month < 1 || state.calendar.month > 12) {
    add('calendar.month', 'must be an integer from 1 to 12');
  }

  if (!state.factions[state.playerFactionId]) add('playerFactionId', `unknown faction: ${state.playerFactionId}`);
  if (!state.factions[state.activeFactionId]) add('activeFactionId', `unknown faction: ${state.activeFactionId}`);
  if ((state.phase === 'player' || state.phase === 'succession')
    && state.activeFactionId !== state.playerFactionId) {
    add('activeFactionId', 'must be the player faction during the player phase');
  }
  if (state.phase === 'succession' && !state.pendingSuccession) {
    add('pendingSuccession', 'is required during the succession phase');
  }
  if (state.phase !== 'succession' && state.pendingSuccession) {
    add('pendingSuccession', 'is only allowed during the succession phase');
  }
  if (state.phase === 'ended' && !state.outcome) add('outcome', 'is required when the game has ended');
  if (state.phase !== 'ended' && state.outcome) add('outcome', 'is only allowed when the game has ended');
  const rawLifecyclePolicy = (state as { lifecyclePolicy?: unknown }).lifecyclePolicy;
  if (!isRecord(rawLifecyclePolicy)) {
    add('lifecyclePolicy', 'must be an object');
  } else {
    if (rawLifecyclePolicy.version !== 1) add('lifecyclePolicy.version', 'must be 1');
    if (!['enabled', 'disabled'].includes(String(rawLifecyclePolicy.ageGrowth))) {
      add('lifecyclePolicy.ageGrowth', 'must be enabled or disabled');
    }
    if (!['disabled', 'age-90-coinflip'].includes(String(rawLifecyclePolicy.naturalDeath))) {
      add('lifecyclePolicy.naturalDeath', 'must be a supported policy');
    }
    if (!['disabled', 'baye-rare'].includes(String(rawLifecyclePolicy.battleDeath))) {
      add('lifecyclePolicy.battleDeath', 'must be a supported policy');
    }
    if (!['disabled', 'modern-monthly'].includes(String(rawLifecyclePolicy.captiveEscape))) {
      add('lifecyclePolicy.captiveEscape', 'must be a supported policy');
    }
  }

  const actedOfficerIds = new Set(state.actedOfficerIds);
  if (actedOfficerIds.size !== state.actedOfficerIds.length) add('actedOfficerIds', 'contains duplicate officer ids');
  for (const officerId of state.actedOfficerIds) {
    if (!state.officers[officerId]) add('actedOfficerIds', `unknown officer: ${officerId}`);
  }

  const discoveredOfficerIds = new Set(state.discoveredOfficerIds);
  if (discoveredOfficerIds.size !== state.discoveredOfficerIds.length) {
    add('discoveredOfficerIds', 'contains duplicate officer ids');
  }
  for (const officerId of state.discoveredOfficerIds) {
    const officer = state.officers[officerId];
    if (!officer) add('discoveredOfficerIds', `unknown officer: ${officerId}`);
    else if (officer.status !== 'free') add('discoveredOfficerIds', `officer is not free: ${officerId}`);
  }

  const activeOrderByOfficerId = new Map<string, string>();
  let maxStrategicOrderSerial = 0;
  const rawStrategicOrders = (state as { strategicOrders?: unknown }).strategicOrders;
  if (!isRecord(rawStrategicOrders)) {
    add('strategicOrders', 'must be a record');
  } else {
    for (const [key, rawOrder] of Object.entries(rawStrategicOrders)) {
      const path = `strategicOrders.${key}`;
      if (!isRecord(rawOrder)) {
        add(path, 'must be an object');
        continue;
      }
      if (rawOrder.id !== key) add(`${path}.id`, 'must match record key');
      const idMatch = /^strategic-order-([1-9]\d*)$/.exec(key);
      if (!idMatch) add(`${path}.id`, 'must use the strategic-order-N format');
      else maxStrategicOrderSerial = Math.max(maxStrategicOrderSerial, Number(idMatch[1]));
      if (!['move', 'transport'].includes(String(rawOrder.kind))) add(`${path}.kind`, 'must be move or transport');
      if (typeof rawOrder.factionId !== 'string' || !state.factions[rawOrder.factionId]) {
        add(`${path}.factionId`, `unknown faction: ${String(rawOrder.factionId)}`);
      }
      if (typeof rawOrder.officerId !== 'string' || !state.officers[rawOrder.officerId]) {
        add(`${path}.officerId`, `unknown officer: ${String(rawOrder.officerId)}`);
      } else {
        const previousOrderId = activeOrderByOfficerId.get(rawOrder.officerId);
        if (previousOrderId) add(`${path}.officerId`, `officer already has active order: ${previousOrderId}`);
        activeOrderByOfficerId.set(rawOrder.officerId, key);
      }
      for (const field of ['sourceCityId', 'targetCityId'] as const) {
        const cityId = rawOrder[field];
        if (typeof cityId !== 'string' || !state.cities[cityId]) {
          add(`${path}.${field}`, `unknown city: ${String(cityId)}`);
        }
      }
      if (rawOrder.sourceCityId === rawOrder.targetCityId) add(`${path}.targetCityId`, 'must differ from sourceCityId');

      if (!Array.isArray(rawOrder.routeCityIds) || rawOrder.routeCityIds.length < 2) {
        add(`${path}.routeCityIds`, 'must contain at least source and target cities');
      } else {
        if (new Set(rawOrder.routeCityIds).size !== rawOrder.routeCityIds.length) {
          add(`${path}.routeCityIds`, 'must not contain repeated cities');
        }
        if (rawOrder.routeCityIds[0] !== rawOrder.sourceCityId) add(`${path}.routeCityIds`, 'must start at sourceCityId');
        if (rawOrder.routeCityIds.at(-1) !== rawOrder.targetCityId) add(`${path}.routeCityIds`, 'must end at targetCityId');
        for (let index = 0; index < rawOrder.routeCityIds.length; index += 1) {
          const cityId = rawOrder.routeCityIds[index];
          if (typeof cityId !== 'string' || !state.cities[cityId]) {
            add(`${path}.routeCityIds.${index}`, `unknown city: ${String(cityId)}`);
            continue;
          }
          const nextCityId = rawOrder.routeCityIds[index + 1];
          if (nextCityId !== undefined && !state.cities[cityId].neighbors.includes(nextCityId)) {
            add(`${path}.routeCityIds.${index + 1}`, `not connected to previous city: ${String(nextCityId)}`);
          }
        }
      }
      for (const field of ['createdTurn', 'createdYear', 'createdMonth', 'durationMonths', 'remainingMonths'] as const) {
        const value = rawOrder[field];
        if (!Number.isInteger(value) || (value as number) < 1) add(`${path}.${field}`, 'must be a positive integer');
      }
      if (Number.isInteger(rawOrder.createdMonth)
        && ((rawOrder.createdMonth as number) < 1 || (rawOrder.createdMonth as number) > 12)) {
        add(`${path}.createdMonth`, 'must be from 1 to 12');
      }
      if (Number.isInteger(rawOrder.remainingMonths) && Number.isInteger(rawOrder.durationMonths)
        && (rawOrder.remainingMonths as number) > (rawOrder.durationMonths as number)) {
        add(`${path}.remainingMonths`, 'must not exceed durationMonths');
      }
      if (['move', 'transport'].includes(String(rawOrder.kind)) && Array.isArray(rawOrder.routeCityIds)
        && Number.isInteger(rawOrder.durationMonths)
        && rawOrder.durationMonths !== rawOrder.routeCityIds.length - 1) {
        add(`${path}.durationMonths`, 'must equal the number of road segments for move orders');
      }
      if (Number.isInteger(rawOrder.createdTurn) && (rawOrder.createdTurn as number) > state.turn) {
        add(`${path}.createdTurn`, 'must not be later than the current turn');
      }
      if (Number.isInteger(rawOrder.createdYear) && Number.isInteger(rawOrder.createdMonth)
        && (rawOrder.createdYear as number) * 12 + (rawOrder.createdMonth as number)
          > state.calendar.year * 12 + state.calendar.month) {
        add(`${path}.createdYear`, 'creation date must not be later than the current calendar');
      }
      if (Number.isInteger(rawOrder.createdTurn) && Number.isInteger(rawOrder.durationMonths)
        && Number.isInteger(rawOrder.remainingMonths)) {
        const elapsedTurns = state.turn - (rawOrder.createdTurn as number);
        if ((rawOrder.remainingMonths as number) !== (rawOrder.durationMonths as number) - elapsedTurns) {
          add(`${path}.remainingMonths`, 'must agree with durationMonths and elapsed campaign turns');
        }
        if (Number.isInteger(rawOrder.createdYear) && Number.isInteger(rawOrder.createdMonth)) {
          const createdCalendarIndex = (rawOrder.createdYear as number) * 12 + (rawOrder.createdMonth as number) - 1;
          const currentCalendarIndex = state.calendar.year * 12 + state.calendar.month - 1;
          if (currentCalendarIndex - createdCalendarIndex !== elapsedTurns) {
            add(`${path}.createdYear`, 'creation date must agree with createdTurn and the current calendar');
          }
        }
      }
      if (!isRecord(rawOrder.cargo)) {
        add(`${path}.cargo`, 'must be an object');
      } else {
        let cargoTotal = 0;
        for (const field of ['money', 'food', 'reserveTroops'] as const) {
          const value = rawOrder.cargo[field];
          if (!Number.isSafeInteger(value) || (value as number) < 0) {
            add(`${path}.cargo.${field}`, 'must be a non-negative safe integer');
          }
          else cargoTotal += value as number;
          if (rawOrder.kind === 'move' && value !== 0) add(`${path}.cargo.${field}`, 'move orders cannot carry cargo');
        }
        if (rawOrder.kind === 'transport' && cargoTotal === 0) {
          add(`${path}.cargo`, 'transport orders must carry at least one resource');
        }
      }
    }
  }
  if (!Number.isInteger(state.nextStrategicOrderSerial) || state.nextStrategicOrderSerial < 1) {
    add('nextStrategicOrderSerial', 'must be a positive integer');
  } else if (state.nextStrategicOrderSerial <= maxStrategicOrderSerial) {
    add('nextStrategicOrderSerial', 'must be greater than every existing strategic order serial');
  }
  let maxDiplomaticOrderSerial = 0;
  const rawDiplomaticOrders = (state as { diplomaticOrders?: unknown }).diplomaticOrders;
  if (!isRecord(rawDiplomaticOrders)) {
    add('diplomaticOrders', 'must be a record');
  } else {
    for (const [key, rawOrder] of Object.entries(rawDiplomaticOrders)) {
      const path = `diplomaticOrders.${key}`;
      if (!isRecord(rawOrder)) {
        add(path, 'must be an object');
        continue;
      }
      if (rawOrder.id !== key) add(`${path}.id`, 'must match record key');
      const idMatch = /^diplomatic-order-([1-9]\d*)$/.exec(key);
      if (!idMatch) add(`${path}.id`, 'must use the diplomatic-order-N format');
      else {
        const serial = Number(idMatch[1]);
        if (!Number.isSafeInteger(serial)) add(`${path}.id`, 'serial must be a safe integer');
        else maxDiplomaticOrderSerial = Math.max(maxDiplomaticOrderSerial, serial);
      }
      if (!['alienate', 'canvass', 'counterespionage', 'induce'].includes(String(rawOrder.kind))) {
        add(`${path}.kind`, 'must be a supported diplomatic order');
      }
      if (typeof rawOrder.factionId !== 'string' || !state.factions[rawOrder.factionId]) {
        add(`${path}.factionId`, `unknown faction: ${String(rawOrder.factionId)}`);
      }
      if (typeof rawOrder.targetFactionId !== 'string' || !state.factions[rawOrder.targetFactionId]) {
        add(`${path}.targetFactionId`, `unknown faction: ${String(rawOrder.targetFactionId)}`);
      } else if (rawOrder.targetFactionId === rawOrder.factionId) {
        add(`${path}.targetFactionId`, 'must differ from the issuing faction');
      }
      if (typeof rawOrder.officerId !== 'string' || !state.officers[rawOrder.officerId]) {
        add(`${path}.officerId`, `unknown officer: ${String(rawOrder.officerId)}`);
      } else {
        const previousOrderId = activeOrderByOfficerId.get(rawOrder.officerId);
        if (previousOrderId) add(`${path}.officerId`, `officer already has active order: ${previousOrderId}`);
        activeOrderByOfficerId.set(rawOrder.officerId, key);
      }
      if (typeof rawOrder.targetOfficerId !== 'string' || !state.officers[rawOrder.targetOfficerId]) {
        add(`${path}.targetOfficerId`, `unknown officer: ${String(rawOrder.targetOfficerId)}`);
      } else if (rawOrder.targetOfficerId === rawOrder.officerId) {
        add(`${path}.targetOfficerId`, 'must differ from the executing officer');
      }
      for (const field of ['sourceCityId', 'targetCityId'] as const) {
        const cityId = rawOrder[field];
        if (typeof cityId !== 'string' || !state.cities[cityId]) {
          add(`${path}.${field}`, `unknown city: ${String(cityId)}`);
        }
      }
      for (const field of ['createdTurn', 'createdYear', 'createdMonth', 'durationMonths', 'remainingMonths'] as const) {
        const value = rawOrder[field];
        if (!Number.isInteger(value) || (value as number) < 1) add(`${path}.${field}`, 'must be a positive integer');
      }
      if (Number.isInteger(rawOrder.createdMonth)
        && ((rawOrder.createdMonth as number) < 1 || (rawOrder.createdMonth as number) > 12)) {
        add(`${path}.createdMonth`, 'must be from 1 to 12');
      }
      if (Number.isInteger(rawOrder.remainingMonths) && Number.isInteger(rawOrder.durationMonths)
        && (rawOrder.remainingMonths as number) > (rawOrder.durationMonths as number)) {
        add(`${path}.remainingMonths`, 'must not exceed durationMonths');
      }
      if (!Number.isSafeInteger(rawOrder.moneyCost) || (rawOrder.moneyCost as number) < 0) {
        add(`${path}.moneyCost`, 'must be a non-negative safe integer');
      }
      if (Number.isInteger(rawOrder.createdTurn) && (rawOrder.createdTurn as number) > state.turn) {
        add(`${path}.createdTurn`, 'must not be later than the current turn');
      }
      if (Number.isInteger(rawOrder.createdYear) && Number.isInteger(rawOrder.createdMonth)
        && (rawOrder.createdYear as number) * 12 + (rawOrder.createdMonth as number)
          > state.calendar.year * 12 + state.calendar.month) {
        add(`${path}.createdYear`, 'creation date must not be later than the current calendar');
      }
      if (Number.isInteger(rawOrder.createdTurn) && Number.isInteger(rawOrder.durationMonths)
        && Number.isInteger(rawOrder.remainingMonths)) {
        const elapsedTurns = state.turn - (rawOrder.createdTurn as number);
        if ((rawOrder.remainingMonths as number) !== (rawOrder.durationMonths as number) - elapsedTurns) {
          add(`${path}.remainingMonths`, 'must agree with durationMonths and elapsed campaign turns');
        }
        if (Number.isInteger(rawOrder.createdYear) && Number.isInteger(rawOrder.createdMonth)) {
          const createdCalendarIndex = (rawOrder.createdYear as number) * 12 + (rawOrder.createdMonth as number) - 1;
          const currentCalendarIndex = state.calendar.year * 12 + state.calendar.month - 1;
          if (currentCalendarIndex - createdCalendarIndex !== elapsedTurns) {
            add(`${path}.createdYear`, 'creation date must agree with createdTurn and the current calendar');
          }
        }
      }
    }
  }
  if (!Number.isSafeInteger(state.nextDiplomaticOrderSerial) || state.nextDiplomaticOrderSerial < 1) {
    add('nextDiplomaticOrderSerial', 'must be a positive safe integer');
  } else if (state.nextDiplomaticOrderSerial <= maxDiplomaticOrderSerial) {
    add('nextDiplomaticOrderSerial', 'must be greater than every existing diplomatic order serial');
  }
  if (state.phase === 'ended' && activeOrderByOfficerId.size > 0) {
    add('strategicOrders', 'all active campaign orders must be empty when the campaign has ended');
  }

  const rawIntelReports = (state as { intelReports?: unknown }).intelReports;
  if (!isRecord(rawIntelReports)) {
    add('intelReports', 'must be a record');
  } else {
    for (const [cityId, rawReport] of Object.entries(rawIntelReports)) {
      const path = `intelReports.${cityId}`;
      if (!isRecord(rawReport)) {
        add(path, 'must be an object');
        continue;
      }
      if (rawReport.cityId !== cityId) add(`${path}.cityId`, 'must match record key');
      if (!state.cities[cityId]) add(`${path}.cityId`, `unknown city: ${cityId}`);
      for (const field of [
        'observedTurn', 'observedYear', 'observedMonth', 'population', 'money', 'food', 'reserveTroops',
        'farming', 'commerce', 'defense', 'officerCount', 'totalTroops',
      ] as const) {
        const value = rawReport[field];
        if (!Number.isInteger(value) || (value as number) < 0) add(`${path}.${field}`, 'must be a non-negative integer');
      }
      if (Number.isInteger(rawReport.observedTurn) && (rawReport.observedTurn as number) > state.turn) {
        add(`${path}.observedTurn`, 'must not be later than the current turn');
      }
      if (rawReport.observedTurn === 0) add(`${path}.observedTurn`, 'must be a positive integer');
      if (rawReport.observedYear === 0) add(`${path}.observedYear`, 'must be a positive integer');
      if (Number.isInteger(rawReport.observedMonth)
        && ((rawReport.observedMonth as number) < 1 || (rawReport.observedMonth as number) > 12)) {
        add(`${path}.observedMonth`, 'must be from 1 to 12');
      }
      if (Number.isInteger(rawReport.observedYear) && Number.isInteger(rawReport.observedMonth)
        && (rawReport.observedYear as number) * 12 + (rawReport.observedMonth as number)
          > state.calendar.year * 12 + state.calendar.month) {
        add(`${path}.observedYear`, 'observation date must not be later than the current calendar');
      }
      if (rawReport.publicLoyalty !== undefined
        && (!Number.isInteger(rawReport.publicLoyalty) || (rawReport.publicLoyalty as number) < 0)) {
        add(`${path}.publicLoyalty`, 'must be a non-negative integer when present');
      }
      if (rawReport.satrapName !== undefined && typeof rawReport.satrapName !== 'string') {
        add(`${path}.satrapName`, 'must be a string when present');
      }
      if (rawReport.officerIds !== undefined) {
        if (!Array.isArray(rawReport.officerIds)) {
          add(`${path}.officerIds`, 'must be an array when present');
        } else {
          const officerIds = rawReport.officerIds.filter((officerId): officerId is string => typeof officerId === 'string');
          if (officerIds.length !== rawReport.officerIds.length) add(`${path}.officerIds`, 'must contain only strings');
          if (new Set(officerIds).size !== officerIds.length) add(`${path}.officerIds`, 'contains duplicate officer ids');
          for (const officerId of officerIds) {
            if (!state.officers[officerId]) add(`${path}.officerIds`, `unknown officer: ${officerId}`);
          }
          if (Number.isInteger(rawReport.officerCount) && officerIds.length !== rawReport.officerCount) {
            add(`${path}.officerIds`, 'must agree with officerCount');
          }
        }
      }
    }
  }

  const orderSet = new Set(state.factionOrder);
  if (orderSet.size !== state.factionOrder.length) add('factionOrder', 'contains duplicate faction ids');
  for (const faction of Object.values(state.factions)) {
    if (!faction.isNeutral && !orderSet.has(faction.id)) add('factionOrder', `missing faction: ${faction.id}`);
  }
  for (const factionId of state.factionOrder) {
    if (!state.factions[factionId]) add('factionOrder', `unknown faction: ${factionId}`);
  }

  let playerFlags = 0;
  for (const [key, faction] of Object.entries(state.factions)) {
    if (key !== faction.id) add(`factions.${key}.id`, `must match record key: ${key}`);
    if (faction.isPlayer) playerFlags += 1;
    if (faction.isNeutral && faction.isPlayer) add(`factions.${key}.isPlayer`, 'neutral faction cannot be the player');
    if (faction.isPlayer !== (faction.id === state.playerFactionId)) {
      add(`factions.${key}.isPlayer`, 'must agree with playerFactionId');
    }
    const ruler = state.officers[faction.rulerOfficerId];
    const factionOwnsCity = Object.values(state.cities).some((city) => city.ownerId === faction.id);
    const awaitingSuccession = state.pendingSuccession?.factionId === faction.id
      && state.pendingSuccession.formerRulerOfficerId === faction.rulerOfficerId;
    if (!ruler) add(`factions.${key}.rulerOfficerId`, `unknown officer: ${faction.rulerOfficerId}`);
    else if (!awaitingSuccession && !faction.isNeutral && factionOwnsCity && ruler.factionId !== faction.id) {
      add(`factions.${key}.rulerOfficerId`, 'ruler belongs to another faction');
    }
    else if (!awaitingSuccession && !faction.isNeutral && factionOwnsCity && ruler.status !== 'serving') {
      add(`factions.${key}.rulerOfficerId`, 'non-neutral ruler must be serving');
    }
  }
  if (playerFlags !== 1) add('factions', 'must contain exactly one player faction');

  const placedItemIds = new Set<string>();
  const itemLocationById = new Map<string, string>();
  const placeItem = (itemId: string, path: string) => {
    const previous = itemLocationById.get(itemId);
    if (previous) add(path, `item is already placed at ${previous}: ${itemId}`);
    else itemLocationById.set(itemId, path);
    placedItemIds.add(itemId);
  };
  for (const [key, city] of Object.entries(state.cities)) {
    const path = `cities.${key}`;
    if (key !== city.id) add(`${path}.id`, `must match record key: ${key}`);
    if (!state.factions[city.ownerId]) add(`${path}.ownerId`, `unknown faction: ${city.ownerId}`);
    if (city.satrapOfficerId && !state.officers[city.satrapOfficerId]) {
      add(`${path}.satrapOfficerId`, `unknown officer: ${city.satrapOfficerId}`);
    } else if (city.satrapOfficerId) {
      const satrap = state.officers[city.satrapOfficerId];
      if (satrap.status !== 'serving' || satrap.cityId !== city.id || satrap.factionId !== city.ownerId) {
        add(`${path}.satrapOfficerId`, 'satrap must be a stationed officer of the owning faction');
      }
    }
    if (city.name.trim() === '') add(`${path}.name`, 'must not be blank');
    for (const [field, value] of Object.entries({
      x: city.x,
      y: city.y,
      population: city.population,
      farming: city.farming,
      commerce: city.commerce,
      defense: city.defense,
      money: city.money,
      food: city.food,
      reserveTroops: city.reserveTroops,
    })) {
      if (!Number.isFinite(value)) add(`${path}.${field}`, 'must be a finite number');
      else if (!['x', 'y'].includes(field) && !Number.isSafeInteger(value)) add(`${path}.${field}`, 'must be a safe integer');
      else if (!['x', 'y'].includes(field) && value < 0) add(`${path}.${field}`, 'must not be negative');
    }
    for (const [field, value] of Object.entries({
      ...(city.farmingLimit === undefined ? {} : { farmingLimit: city.farmingLimit }),
      ...(city.commerceLimit === undefined ? {} : { commerceLimit: city.commerceLimit }),
      ...(city.populationLimit === undefined ? {} : { populationLimit: city.populationLimit }),
      ...(city.publicLoyalty === undefined ? {} : { publicLoyalty: city.publicLoyalty }),
      ...(city.disasterPrevention === undefined ? {} : { disasterPrevention: city.disasterPrevention }),
    })) {
      if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 0) {
        add(`${path}.${field}`, 'must be a non-negative integer');
      }
    }
    for (const field of ['publicLoyalty', 'disasterPrevention'] as const) {
      const value = city[field];
      if (value !== undefined && value > 100) add(`${path}.${field}`, 'must not exceed 100');
    }
    if (city.condition !== undefined
      && !['normal', 'famine', 'drought', 'flood', 'rebellion'].includes(city.condition)) {
      add(`${path}.condition`, 'must be a known city condition');
    }
    for (const field of ['itemIds', 'hiddenItemIds'] as const) {
      const itemIds = city[field];
      if (itemIds !== undefined && !Array.isArray(itemIds)) {
        add(`${path}.${field}`, 'must be an array');
        continue;
      }
      for (const itemId of itemIds ?? []) {
        if (!state.items[itemId]) add(`${path}.${field}`, `unknown item: ${itemId}`);
        placeItem(itemId, `${path}.${field}`);
      }
    }
    const neighbors = new Set<string>();
    for (const neighborId of city.neighbors) {
      if (neighborId === city.id) add(`${path}.neighbors`, 'must not contain the city itself');
      if (neighbors.has(neighborId)) add(`${path}.neighbors`, `duplicate neighbor: ${neighborId}`);
      neighbors.add(neighborId);
      const neighbor = state.cities[neighborId];
      if (!neighbor) add(`${path}.neighbors`, `unknown city: ${neighborId}`);
      else if (!neighbor.neighbors.includes(city.id)) add(`${path}.neighbors`, `road is not reciprocal: ${neighborId}`);
    }
  }

  for (const [key, officer] of Object.entries(state.officers)) {
    const path = `officers.${key}`;
    const activeOrderId = activeOrderByOfficerId.get(officer.id);
    if (key !== officer.id) add(`${path}.id`, `must match record key: ${key}`);
    if (!['serving', 'free', 'hidden', 'captive', 'dead'].includes(officer.status)) {
      add(`${path}.status`, `unknown status: ${officer.status}`);
    }
    if (!state.factions[officer.factionId]) add(`${path}.factionId`, `unknown faction: ${officer.factionId}`);
    if (officer.status === 'hidden') {
      if (officer.cityId !== undefined) add(`${path}.cityId`, 'hidden officer must not be assigned to a city');
      if (!state.factions[officer.factionId]?.isNeutral) add(`${path}.factionId`, 'hidden officer must be neutral');
      if (activeOrderId) add(`${path}.cityId`, 'hidden officer cannot have an active strategic order');
    } else if (officer.status === 'dead') {
      if (officer.cityId !== undefined) add(`${path}.cityId`, 'dead officer must not be assigned to a city');
      if (!state.factions[officer.factionId]?.isNeutral) add(`${path}.factionId`, 'dead officer must be neutral');
      if (activeOrderId) add(`${path}.cityId`, 'dead officer cannot have an active campaign order');
    } else if (officer.status !== 'serving' || !activeOrderId) {
      if (!officer.cityId || !state.cities[officer.cityId]) add(`${path}.cityId`, `unknown city: ${officer.cityId}`);
    }
    if (officer.status === 'free' && !state.factions[officer.factionId]?.isNeutral) {
      add(`${path}.factionId`, 'free officer must belong to the neutral faction');
    }
    if (officer.status === 'captive') {
      if (!state.factions[officer.factionId]?.isNeutral) add(`${path}.factionId`, 'captive officer must be neutral');
      if (officer.troops !== 0) add(`${path}.troops`, 'captive officer must have zero troops');
      if (officer.stamina !== 0) add(`${path}.stamina`, 'captive officer must have zero stamina');
      if (!officer.cityId || !state.cities[officer.cityId]) add(`${path}.cityId`, 'captive officer must be held in a city');
      if (!officer.captorFactionId || state.factions[officer.captorFactionId]?.isNeutral) {
        add(`${path}.captorFactionId`, 'captive officer must name a playable captor faction');
      } else if (officer.cityId && state.cities[officer.cityId]?.ownerId !== officer.captorFactionId) {
        add(`${path}.cityId`, 'captive officer must be held in a city owned by the captor');
      }
      if (!officer.formerFactionId || !state.factions[officer.formerFactionId]
        || state.factions[officer.formerFactionId]?.isNeutral) {
        add(`${path}.formerFactionId`, 'captive officer must retain a known playable former faction');
      } else if (officer.formerFactionId === officer.captorFactionId) {
        add(`${path}.formerFactionId`, 'captive officer cannot be held by their former faction');
      }
    } else if (officer.captorFactionId || officer.formerFactionId) {
      add(`${path}.captorFactionId`, 'capture metadata is only valid for captive officers');
    }
    if (officer.status === 'serving' && state.factions[officer.factionId]?.isNeutral) {
      add(`${path}.factionId`, 'serving officer must belong to a playable faction');
    }
    if (officer.status === 'serving' && Boolean(officer.cityId) === Boolean(activeOrderId)) {
      add(`${path}.cityId`, 'serving officer must be either stationed or assigned exactly one active strategic order');
    }
    if (officer.status === 'dead') {
      if (officer.troops !== 0) add(`${path}.troops`, 'dead officer must have zero troops');
      if (officer.stamina !== 0) add(`${path}.stamina`, 'dead officer must have zero stamina');
      if (state.actedOfficerIds.includes(officer.id)) add(`${path}.status`, 'dead officer cannot be marked as acted');
      if (state.discoveredOfficerIds.includes(officer.id)) add(`${path}.status`, 'dead officer cannot be discovered as free');
      if (!officer.death) {
        add(`${path}.death`, 'dead officer must retain a death record');
      } else {
        if (!['battle-death', 'natural-death', 'execution'].includes(officer.death.cause)) {
          add(`${path}.death.cause`, 'must be a supported death cause');
        }
        if (!Number.isInteger(officer.death.turn) || officer.death.turn < 1 || officer.death.turn > state.turn) {
          add(`${path}.death.turn`, 'must be within the current campaign');
        }
        if (!Number.isInteger(officer.death.year) || officer.death.year < 1
          || officer.death.year * 12 + officer.death.month > state.calendar.year * 12 + state.calendar.month) {
          add(`${path}.death.year`, 'must not be later than the current calendar');
        }
        if (!Number.isInteger(officer.death.month) || officer.death.month < 1 || officer.death.month > 12) {
          add(`${path}.death.month`, 'must be from 1 to 12');
        }
        if (officer.death.cityId !== undefined && !state.cities[officer.death.cityId]) {
          add(`${path}.death.cityId`, `unknown city: ${officer.death.cityId}`);
        }
        if (officer.death.responsibleFactionId !== undefined
          && !state.factions[officer.death.responsibleFactionId]) {
          add(`${path}.death.responsibleFactionId`, `unknown faction: ${officer.death.responsibleFactionId}`);
        }
      }
    } else if (officer.death) {
      add(`${path}.death`, 'only dead officers may retain a death record');
    }
    if (activeOrderId) {
      const strategicOrder = isRecord(rawStrategicOrders) ? rawStrategicOrders[activeOrderId] : undefined;
      const diplomaticOrder = isRecord(rawDiplomaticOrders) ? rawDiplomaticOrders[activeOrderId] : undefined;
      const order = strategicOrder ?? diplomaticOrder;
      if (officer.status !== 'serving') add(`${path}.status`, 'only serving officers may have active campaign orders');
      if (isRecord(order) && order.factionId !== officer.factionId) {
        add(`${path}.factionId`, 'must match the active campaign order faction');
      }
    }
    if (officer.status === 'serving' && officer.cityId && state.cities[officer.cityId]?.ownerId !== officer.factionId) {
      add(`${path}.cityId`, 'serving officer must be stationed in a city owned by their faction');
    }
    if (!state.armsTypes[officer.armsTypeId]) add(`${path}.armsTypeId`, `unknown arms type: ${officer.armsTypeId}`);
    const rawEquipment = (officer as { equipmentItemIds?: unknown }).equipmentItemIds;
    if (rawEquipment !== undefined && !Array.isArray(rawEquipment)) {
      add(`${path}.equipmentItemIds`, 'must be an array');
    } else {
      const equipmentItemIds = getOfficerEquipmentIds(officer);
      if (equipmentItemIds.length > OFFICER_EQUIPMENT_LIMIT) {
        add(`${path}.equipmentItemIds`, `must contain at most ${OFFICER_EQUIPMENT_LIMIT} items`);
      }
      for (const itemId of equipmentItemIds) {
        if (!state.items[itemId]) add(`${path}.equipmentItemIds`, `unknown item: ${itemId}`);
        placeItem(itemId, `${path}.equipmentItemIds`);
      }
      if (officer.status === 'dead' && equipmentItemIds.length > 0) {
        add(`${path}.equipmentItemIds`, 'dead officer cannot retain equipment');
      }
    }
    for (const [field, value] of Object.entries({
      force: officer.force,
      intelligence: officer.intelligence,
      leadership: officer.leadership,
      troops: officer.troops,
      loyalty: officer.loyalty,
      age: officer.age,
      stamina: officer.stamina,
      ...(officer.level === undefined ? {} : { level: officer.level }),
      ...(officer.character === undefined ? {} : { character: officer.character }),
      ...(officer.experience === undefined ? {} : { experience: officer.experience }),
    })) {
      if (!Number.isFinite(value)) add(`${path}.${field}`, 'must be a finite number');
      else if (!Number.isInteger(value)) add(`${path}.${field}`, 'must be an integer');
      else if (value < 0) add(`${path}.${field}`, 'must not be negative');
    }
    if ((officer.level ?? 1) > 20) add(`${path}.level`, 'must not exceed 20');
    if ((officer.experience ?? 0) >= 100) add(`${path}.experience`, 'must be below 100');
    if (officer.loyalty > 100) add(`${path}.loyalty`, 'must not exceed 100');
    if (officer.stamina > 100) add(`${path}.stamina`, 'must not exceed 100');
    if (officer.appearanceYear !== undefined
      && (!Number.isSafeInteger(officer.appearanceYear) || officer.appearanceYear < 1)) {
      add(`${path}.appearanceYear`, 'must be a positive safe integer');
    }
    if (officer.appearanceCityId !== undefined && !state.cities[officer.appearanceCityId]) {
      add(`${path}.appearanceCityId`, `unknown city: ${officer.appearanceCityId}`);
    }
    if (officer.appearanceCityId !== undefined && officer.appearanceYear === undefined) {
      add(`${path}.appearanceCityId`, 'requires appearanceYear');
    }
    if (officer.appearanceYear !== undefined
      && officer.appearanceYear > state.calendar.year
      && officer.status !== 'hidden'
      && officer.status !== 'dead') {
      add(`${path}.status`, 'officer cannot appear before appearanceYear');
    }
    if (officer.appearanceYear !== undefined
      && officer.appearanceYear <= state.calendar.year
      && officer.status === 'hidden') {
      add(`${path}.status`, 'hidden officer is overdue for appearance');
    }
  }

  if (state.pendingSuccession) {
    const pending = state.pendingSuccession;
    const path = 'pendingSuccession';
    if (pending.version !== 1) add(`${path}.version`, 'must be 1');
    if (!state.factions[pending.factionId] || state.factions[pending.factionId]?.isNeutral) {
      add(`${path}.factionId`, `unknown playable faction: ${pending.factionId}`);
    }
    if (pending.factionId !== state.playerFactionId) add(`${path}.factionId`, 'only player succession may remain pending');
    if (!Object.values(state.cities).some((city) => city.ownerId === pending.factionId)) {
      add(`${path}.factionId`, 'pending succession faction must still own a city');
    }
    const formerRuler = state.officers[pending.formerRulerOfficerId];
    const expectedFormerStatus = pending.reason === 'capture' ? 'captive' : 'dead';
    if (!formerRuler || formerRuler.status !== expectedFormerStatus) {
      add(`${path}.formerRulerOfficerId`, `former ruler must be ${expectedFormerStatus}`);
    }
    if (state.factions[pending.factionId]?.rulerOfficerId !== pending.formerRulerOfficerId) {
      add(`${path}.formerRulerOfficerId`, 'must match the faction ruler awaiting replacement');
    }
    if (!['battle-death', 'natural-death', 'execution', 'capture'].includes(pending.reason)) {
      add(`${path}.reason`, 'must be a supported succession reason');
    }
    if (!Array.isArray(pending.candidateOfficerIds) || pending.candidateOfficerIds.length === 0) {
      add(`${path}.candidateOfficerIds`, 'must contain at least one candidate');
    } else {
      if (new Set(pending.candidateOfficerIds).size !== pending.candidateOfficerIds.length) {
        add(`${path}.candidateOfficerIds`, 'contains duplicate officer ids');
      }
      for (const officerId of pending.candidateOfficerIds) {
        const candidate = state.officers[officerId];
        if (!candidate || candidate.status !== 'serving' || candidate.factionId !== pending.factionId) {
          add(`${path}.candidateOfficerIds`, `invalid successor candidate: ${officerId}`);
        }
      }
    }
    if (!['player', 'ai'].includes(pending.resumePhase)) add(`${path}.resumePhase`, 'must be player or ai');
    if (!state.factions[pending.resumeActiveFactionId]) {
      add(`${path}.resumeActiveFactionId`, `unknown faction: ${pending.resumeActiveFactionId}`);
    }
    if (pending.resumePhase === 'player') {
      if (pending.resumeActiveFactionId !== state.playerFactionId) {
        add(`${path}.resumeActiveFactionId`, 'must be the player faction for player-phase recovery');
      }
      if (pending.resumeAiFactionIndex !== undefined) {
        add(`${path}.resumeAiFactionIndex`, 'must be absent for player-phase recovery');
      }
    } else {
      const expectedCursor = state.factionOrder.indexOf(pending.resumeActiveFactionId) + 1;
      if (pending.resumeActiveFactionId === state.playerFactionId) {
        add(`${path}.resumeActiveFactionId`, 'must identify the active AI faction');
      }
      if (!Number.isInteger(pending.resumeAiFactionIndex)
        || pending.resumeAiFactionIndex !== expectedCursor
        || expectedCursor <= 0
        || expectedCursor > state.factionOrder.length) {
        add(`${path}.resumeAiFactionIndex`, 'must resume after the active AI faction');
      }
    }
    if (!Number.isInteger(pending.createdTurn) || pending.createdTurn < 1 || pending.createdTurn > state.turn) {
      add(`${path}.createdTurn`, 'must be within the current campaign');
    }
    if (!Number.isInteger(pending.createdMonth) || pending.createdMonth < 1 || pending.createdMonth > 12) {
      add(`${path}.createdMonth`, 'must be from 1 to 12');
    }
    if (!Number.isInteger(pending.createdYear) || pending.createdYear < 1
      || pending.createdYear * 12 + pending.createdMonth > state.calendar.year * 12 + state.calendar.month) {
      add(`${path}.createdYear`, 'must not be later than the current calendar');
    }
  }

  for (const [key, item] of Object.entries(state.items)) {
    if (key !== item.id) add(`items.${key}.id`, `must match record key: ${key}`);
    for (const [field, value] of Object.entries({
      forceBonus: item.forceBonus,
      intelligenceBonus: item.intelligenceBonus,
      moveBonus: item.moveBonus,
      ...(item.sourceId === undefined ? {} : { sourceId: item.sourceId }),
    })) {
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
        add(`items.${key}.${field}`, 'must be a non-negative integer');
      }
    }
    if (item.armsTypeOverride && !state.armsTypes[item.armsTypeOverride]) {
      add(`items.${key}.armsTypeOverride`, `unknown arms type: ${item.armsTypeOverride}`);
    }
    if (item.appearanceYear !== undefined
      && (!Number.isSafeInteger(item.appearanceYear) || item.appearanceYear < 1)) {
      add(`items.${key}.appearanceYear`, 'must be a positive safe integer');
    }
    if (item.appearanceCityId !== undefined && !state.cities[item.appearanceCityId]) {
      add(`items.${key}.appearanceCityId`, `unknown city: ${item.appearanceCityId}`);
    }
    if (item.appearanceYear !== undefined && item.appearanceCityId === undefined) {
      add(`items.${key}.appearanceCityId`, 'is required for annual appearance');
    }
    if (item.appearanceCityId !== undefined && item.appearanceYear === undefined) {
      add(`items.${key}.appearanceCityId`, 'requires appearanceYear');
    }
    if (item.appearanceYear !== undefined && item.appearanceYear > state.calendar.year && placedItemIds.has(item.id)) {
      add(`items.${key}.appearanceYear`, 'item cannot be placed before appearanceYear');
    }
  }
  for (const [key, armsType] of Object.entries(state.armsTypes)) {
    if (key !== armsType.id) add(`armsTypes.${key}.id`, `must match record key: ${key}`);
  }

  const logIds = new Set<string>();
  for (const [index, log] of state.logs.entries()) {
    if (logIds.has(log.id)) add(`logs.${index}.id`, `duplicate log id: ${log.id}`);
    logIds.add(log.id);
    if (!Number.isInteger(log.turn) || log.turn < 1) add(`logs.${index}.turn`, 'must be a positive integer');
  }

  return issues;
}

export function assertValidGameState(state: GameState): void {
  const issues = validateGameState(state);
  if (issues.length > 0) {
    const issue = issues[0];
    throw new Error(`Invalid game state at ${issue.path}: ${issue.message}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
