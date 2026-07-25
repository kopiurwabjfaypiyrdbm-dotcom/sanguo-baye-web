import type { GameState } from './types';

export type ValidationIssue = {
  path: string;
  message: string;
};

export function validateGameState(state: GameState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  if (state.schemaVersion !== 2) add('schemaVersion', 'must be 2');
  if (typeof state.campaignStarted !== 'boolean') add('campaignStarted', 'must be a boolean');
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
  if (state.phase === 'ended' && !state.outcome) add('outcome', 'is required when the game has ended');
  if (state.phase !== 'ended' && state.outcome) add('outcome', 'is only allowed when the game has ended');

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
    if (!ruler) add(`factions.${key}.rulerOfficerId`, `unknown officer: ${faction.rulerOfficerId}`);
    else if (!faction.isNeutral && factionOwnsCity && ruler.factionId !== faction.id) {
      add(`factions.${key}.rulerOfficerId`, 'ruler belongs to another faction');
    }
    else if (!faction.isNeutral && factionOwnsCity && ruler.status !== 'serving') {
      add(`factions.${key}.rulerOfficerId`, 'non-neutral ruler must be serving');
    }
  }
  if (playerFlags !== 1) add('factions', 'must contain exactly one player faction');

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
    if (!['serving', 'free', 'hidden'].includes(officer.status)) add(`${path}.status`, `unknown status: ${officer.status}`);
    if (!state.factions[officer.factionId]) add(`${path}.factionId`, `unknown faction: ${officer.factionId}`);
    if (officer.status === 'hidden') {
      if (officer.cityId !== undefined) add(`${path}.cityId`, 'hidden officer must not be assigned to a city');
      if (!state.factions[officer.factionId]?.isNeutral) add(`${path}.factionId`, 'hidden officer must be neutral');
    } else {
      if (!officer.cityId || !state.cities[officer.cityId]) add(`${path}.cityId`, `unknown city: ${officer.cityId}`);
    }
    if (officer.status === 'free' && !state.factions[officer.factionId]?.isNeutral) {
      add(`${path}.factionId`, 'free officer must belong to the neutral faction');
    }
    if (officer.status === 'serving' && state.factions[officer.factionId]?.isNeutral) {
      add(`${path}.factionId`, 'serving officer must belong to a playable faction');
    }
    if (officer.status === 'serving' && officer.cityId && state.cities[officer.cityId]?.ownerId !== officer.factionId) {
      add(`${path}.cityId`, 'serving officer must be stationed in a city owned by their faction');
    }
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
      ...(officer.level === undefined ? {} : { level: officer.level }),
      ...(officer.character === undefined ? {} : { character: officer.character }),
      ...(officer.experience === undefined ? {} : { experience: officer.experience }),
    })) {
      if (!Number.isFinite(value)) add(`${path}.${field}`, 'must be a finite number');
      else if (!Number.isInteger(value)) add(`${path}.${field}`, 'must be an integer');
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
