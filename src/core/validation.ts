import type { GameState } from './types';

export type ValidationIssue = {
  path: string;
  message: string;
};

export function validateGameState(state: GameState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  if (state.schemaVersion !== 1) add('schemaVersion', 'must be 1');
  if (!Number.isInteger(state.turn) || state.turn < 1) add('turn', 'must be a positive integer');
  if (!Number.isInteger(state.rngSeed) || state.rngSeed < 0) add('rngSeed', 'must be a non-negative integer');
  if (!Number.isInteger(state.calendar.year) || state.calendar.year < 1) add('calendar.year', 'must be a positive integer');
  if (!Number.isInteger(state.calendar.month) || state.calendar.month < 1 || state.calendar.month > 12) {
    add('calendar.month', 'must be an integer from 1 to 12');
  }

  if (!state.factions[state.playerFactionId]) add('playerFactionId', `unknown faction: ${state.playerFactionId}`);
  if (!state.factions[state.activeFactionId]) add('activeFactionId', `unknown faction: ${state.activeFactionId}`);
  if (state.phase === 'player' && state.activeFactionId !== state.playerFactionId) {
    add('activeFactionId', 'must be the player faction during the player phase');
  }

  const orderSet = new Set(state.factionOrder);
  if (orderSet.size !== state.factionOrder.length) add('factionOrder', 'contains duplicate faction ids');
  for (const factionId of Object.keys(state.factions)) {
    if (!orderSet.has(factionId)) add('factionOrder', `missing faction: ${factionId}`);
  }
  for (const factionId of state.factionOrder) {
    if (!state.factions[factionId]) add('factionOrder', `unknown faction: ${factionId}`);
  }

  let playerFlags = 0;
  for (const [key, faction] of Object.entries(state.factions)) {
    if (key !== faction.id) add(`factions.${key}.id`, `must match record key: ${key}`);
    if (faction.isPlayer) playerFlags += 1;
    if (faction.isPlayer !== (faction.id === state.playerFactionId)) {
      add(`factions.${key}.isPlayer`, 'must agree with playerFactionId');
    }
    const ruler = state.officers[faction.rulerOfficerId];
    if (!ruler) add(`factions.${key}.rulerOfficerId`, `unknown officer: ${faction.rulerOfficerId}`);
    else if (ruler.factionId !== faction.id) add(`factions.${key}.rulerOfficerId`, 'ruler belongs to another faction');
  }
  if (playerFlags !== 1) add('factions', 'must contain exactly one player faction');

  for (const [key, city] of Object.entries(state.cities)) {
    const path = `cities.${key}`;
    if (key !== city.id) add(`${path}.id`, `must match record key: ${key}`);
    if (!state.factions[city.ownerId]) add(`${path}.ownerId`, `unknown faction: ${city.ownerId}`);
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
      else if (!['x', 'y'].includes(field) && value < 0) add(`${path}.${field}`, 'must not be negative');
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
    if (key !== officer.id) add(`${path}.id`, `must match record key: ${key}`);
    if (!state.factions[officer.factionId]) add(`${path}.factionId`, `unknown faction: ${officer.factionId}`);
    if (!state.cities[officer.cityId]) add(`${path}.cityId`, `unknown city: ${officer.cityId}`);
    if (!state.armsTypes[officer.armsTypeId]) add(`${path}.armsTypeId`, `unknown arms type: ${officer.armsTypeId}`);
    for (const field of ['weaponItemId', 'intelligenceItemId', 'mountItemId'] as const) {
      const itemId = officer[field];
      if (itemId && !state.items[itemId]) add(`${path}.${field}`, `unknown item: ${itemId}`);
    }
    for (const [field, value] of Object.entries({
      force: officer.force,
      intelligence: officer.intelligence,
      leadership: officer.leadership,
      troops: officer.troops,
      loyalty: officer.loyalty,
      age: officer.age,
      stamina: officer.stamina,
    })) {
      if (!Number.isFinite(value)) add(`${path}.${field}`, 'must be a finite number');
      else if (value < 0) add(`${path}.${field}`, 'must not be negative');
    }
  }

  for (const [key, item] of Object.entries(state.items)) {
    if (key !== item.id) add(`items.${key}.id`, `must match record key: ${key}`);
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
