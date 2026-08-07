import type { City, Faction, GameState, Officer } from '../types';
import { validateGameState } from '../validation';
import {
  createBundledScenario,
  getScenarioOptions,
  getScenarioRulers,
  type BundledPeriodId,
} from '../../data/bundledScenarios';
import { canonicalSha256 } from './canonicalJson';
import bundledData from '../../data/generated/baye-periods.json';

export const PRODUCTION_DATA_CONTRACT_VERSION = 2 as const;
export const PRODUCTION_CATALOG_VERSION = 1 as const;
export const PRODUCTION_RULESET_ID = 'baye-classic-v1' as const;
export const PRODUCTION_PERIOD_IDS = [1, 2, 3, 4] as const;

const CLOSED_KEYS = {
  usage: ['scope', 'redistributionReview', 'notice'],
  provenance: ['generatedBy', 'scenarioFactory', 'bundledSource', 'source'],
  source: ['repository', 'commit', 'archiveSha256', 'note'],
  scenario: ['periodId', 'title', 'description', 'year', 'rulesetId', 'defaultRulerSourceIndex', 'playerCandidates'],
  candidate: ['sourceIndex', 'name', 'cityCount', 'officerCount', 'factionId', 'rulerOfficerId'],
  facts: ['cityCount', 'roadCount', 'directedNeighborReferenceCount', 'factionCount', 'officerCount', 'itemCount', 'armsTypeCount'],
  state: [
    'dataContractVersion', 'cityOrder', 'officerOrder', 'itemOrder', 'armsTypeOrder', 'graph',
    'schemaVersion', 'rulesetId', 'scenario', 'calendar', 'turn', 'rngSeed', 'campaignStarted',
    'phase', 'playerFactionId', 'activeFactionId', 'factionOrder', 'factions', 'cities',
    'officers', 'items', 'armsTypes', 'actedOfficerIds', 'discoveredOfficerIds',
    'strategicOrders', 'diplomaticOrders', 'intelReports', 'nextStrategicOrderSerial',
    'nextDiplomaticOrderSerial', 'lifecyclePolicy', 'logs',
  ],
  stateScenario: ['id', 'period', 'source'],
  calendar: ['year', 'month'],
  lifecyclePolicy: ['version', 'ageGrowth', 'naturalDeath', 'battleDeath', 'captiveEscape'],
  graph: ['cityCount', 'roadCount', 'directedNeighborReferenceCount', 'roads'],
  faction: ['id', 'name', 'color', 'rulerOfficerId', 'isPlayer', 'isNeutral', 'aiProfile'],
  city: [
    'id', 'sourceIndex', 'name', 'type', 'region', 'x', 'y', 'neighbors', 'ownerId',
    'satrapOfficerId', 'farming', 'farmingLimit', 'commerce', 'commerceLimit', 'population',
    'populationLimit', 'publicLoyalty', 'disasterPrevention', 'defense', 'money', 'food',
    'reserveTroops', 'itemIds', 'hiddenItemIds',
  ],
  officer: [
    'id', 'sourceId', 'name', 'age', 'force', 'intelligence', 'leadership', 'character',
    'factionId', 'cityId', 'status', 'loyalty', 'stamina', 'level', 'experience', 'troops',
    'armsTypeId', 'equipmentItemIds', 'appearanceYear', 'appearanceCityId',
  ],
  item: ['id', 'sourceId', 'name', 'forceBonus', 'intelligenceBonus', 'moveBonus', 'armsTypeOverride'],
  armsType: ['id', 'name', 'attackModifier', 'defenseModifier', 'mobility'],
  log: ['id', 'turn', 'kind', 'message'],
} as const;

const usage = {
  scope: 'internal-production-migration-data',
  redistributionReview: 'pending',
  notice: 'Generated from the repository bundled scenario source; no original binary archive or media is included.',
} as const;

export type ProductionEnvelope = ReturnType<typeof buildProductionEnvelope>;
export type ProductionCatalog = ReturnType<typeof buildProductionCatalog>;

export function buildProductionDataBundle(): {
  catalog: ProductionCatalog;
  envelopes: ProductionEnvelope[];
} {
  const envelopes = PRODUCTION_PERIOD_IDS.map(buildProductionEnvelope);
  return { catalog: buildProductionCatalog(envelopes), envelopes };
}

export function buildProductionEnvelope(periodId: BundledPeriodId) {
  const option = getScenarioOptions().find((candidate) => candidate.period === periodId);
  if (!option) throw new Error(`Missing scenario option for period ${periodId}`);
  const rulers = [...getScenarioRulers(periodId)].sort((left, right) => left.sourceIndex - right.sourceIndex);
  const defaultRuler = rulers[0];
  if (!defaultRuler) throw new Error(`Period ${periodId} has no playable ruler`);
  const state = orderProductionState(
    createBundledScenario(periodId, defaultRuler.sourceIndex, PRODUCTION_RULESET_ID),
  );
  const candidates = rulers.map((ruler) => {
    const faction = Object.values(state.factions).find((candidate) => {
      const officer = state.officers[candidate.rulerOfficerId];
      return officer?.sourceId === ruler.sourceIndex;
    });
    if (!faction) throw new Error(`Period ${periodId} ruler ${ruler.sourceIndex} has no faction`);
    return { ...structuredClone(ruler), factionId: faction.id, rulerOfficerId: faction.rulerOfficerId };
  });

  return {
    productionDataContractVersion: PRODUCTION_DATA_CONTRACT_VERSION,
    id: `baye-period-${periodId}`,
    usage,
    provenance: {
      generatedBy: 'src/core/migration/productionDataContract.ts',
      scenarioFactory: 'src/data/bundledScenarios.ts:createBundledScenario',
      bundledSource: 'src/data/generated/baye-periods.json',
      source: structuredClone(bundledData.source),
    },
    scenario: {
      periodId,
      title: option.title,
      description: option.description,
      year: option.year,
      rulesetId: PRODUCTION_RULESET_ID,
      defaultRulerSourceIndex: defaultRuler.sourceIndex,
      playerCandidates: candidates,
    },
    facts: {
      cityCount: state.cityOrder.length,
      roadCount: state.graph.roadCount,
      directedNeighborReferenceCount: state.graph.directedNeighborReferenceCount,
      factionCount: Object.values(state.factions).filter((faction) => !faction.isNeutral).length,
      officerCount: state.officerOrder.length,
      itemCount: state.itemOrder.length,
      armsTypeCount: state.armsTypeOrder.length,
    },
    stateSha256: canonicalSha256(state),
    state,
  };
}

export function buildProductionCatalog(envelopes: ProductionEnvelope[]) {
  const ordered = [...envelopes].sort((left, right) => left.scenario.periodId - right.scenario.periodId);
  return {
    productionCatalogVersion: PRODUCTION_CATALOG_VERSION,
    productionDataContractVersion: PRODUCTION_DATA_CONTRACT_VERSION,
    id: 'baye-production-campaign-catalog-v1',
    usage,
    periods: ordered.map((envelope) => ({
      periodId: envelope.scenario.periodId,
      path: `godot/data/campaigns/period-${envelope.scenario.periodId}.json`,
      envelopeSha256: canonicalSha256(envelope),
      stateSha256: envelope.stateSha256,
      facts: structuredClone(envelope.facts),
    })),
  };
}

export function validateProductionEnvelope(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ['envelope: expected object'];
  validateExactKeys(value, [
    'productionDataContractVersion', 'id', 'usage', 'provenance', 'scenario', 'facts', 'stateSha256', 'state',
  ], 'envelope', issues);
  if (value.productionDataContractVersion !== PRODUCTION_DATA_CONTRACT_VERSION) {
    issues.push('productionDataContractVersion: must be 2');
    return issues;
  }
  if (!isRecord(value.scenario)) issues.push('scenario: expected object');
  if (!isRecord(value.facts)) issues.push('facts: expected object');
  if (!isRecord(value.state)) issues.push('state: expected object');
  if (issues.length > 0) return issues;

  const scenario = value.scenario as Record<string, unknown>;
  const facts = value.facts as Record<string, unknown>;
  const state = value.state as Record<string, unknown>;
  validateClosedProductionShape(value, scenario, facts, state, issues);
  validateMetadataTypes(value, scenario, issues);
  validateProductionFieldTypes(state, issues);
  if (issues.length > 0) return issues.sort(compareText);
  if (!PRODUCTION_PERIOD_IDS.includes(scenario.periodId as BundledPeriodId)) issues.push('scenario.periodId: must be 1..4');
  if (scenario.rulesetId !== PRODUCTION_RULESET_ID) issues.push('scenario.rulesetId: unsupported ruleset');
  if (value.id !== `baye-period-${String(scenario.periodId)}`) issues.push('id: must match scenario.periodId');
  if (!isRecord(value.usage)) issues.push('usage: expected object');
  if (!isRecord(value.provenance) || !isRecord(value.provenance.source)
    || typeof value.provenance.source.commit !== 'string') issues.push('provenance.source: missing pinned source evidence');
  if (state.dataContractVersion !== PRODUCTION_DATA_CONTRACT_VERSION) issues.push('state.dataContractVersion: must be 2');
  if (state.rulesetId !== scenario.rulesetId) issues.push('state.rulesetId: must match scenario.rulesetId');
  if (!isRecord(state.scenario) || state.scenario.period !== scenario.periodId) {
    issues.push('state.scenario.period: must match scenario.periodId');
  } else if (state.scenario.id !== value.id || state.scenario.source !== 'baye-legacy') {
    issues.push('state.scenario: id/source must match the production scenario');
  }
  if (!isRecord(state.calendar) || state.calendar.year !== scenario.year || state.calendar.month !== 1) {
    issues.push('state.calendar: must match the period start at month 1');
  }
  validateCandidateContract(scenario, state, issues);
  validateInitialStateContract(state, issues);
  validateOrder('cityOrder', state, state.cities, 'sourceIndex', issues);
  validateOrder('officerOrder', state, state.officers, 'sourceId', issues);
  validateOrder('itemOrder', state, state.items, 'sourceId', issues);
  validateOrder('armsTypeOrder', state, state.armsTypes, null, issues);
  validateNestedOrders(state, issues);
  validateFacts(facts, state, issues);
  validateGraph(state, issues);
  try {
    for (const issue of validateGameState(state as unknown as GameState)) {
      issues.push(`state.${issue.path}: ${issue.message}`);
    }
  } catch (error) {
    issues.push(`state: validation failed safely: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const digest = canonicalSha256(state);
    if (value.stateSha256 !== digest) issues.push(`stateSha256: expected ${digest}`);
  } catch (error) {
    issues.push(`stateSha256: ${error instanceof Error ? error.message : String(error)}`);
  }
  return issues.sort(compareText);
}

export function validateProductionCatalog(value: unknown, envelopes: ProductionEnvelope[]): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ['catalog: expected object'];
  validateExactKeys(value, [
    'productionCatalogVersion', 'productionDataContractVersion', 'id', 'usage', 'periods',
  ], 'catalog', issues);
  if (value.productionCatalogVersion !== 1) issues.push('productionCatalogVersion: must be 1');
  if (value.productionDataContractVersion !== 2) issues.push('productionDataContractVersion: must be 2');
  if (value.id !== 'baye-production-campaign-catalog-v1') issues.push('id: unsupported catalog id');
  if (!isRecord(value.usage)) {
    issues.push('usage: expected object');
  } else {
    validateExactKeys(value.usage, CLOSED_KEYS.usage, 'usage', issues);
    for (const field of CLOSED_KEYS.usage) {
      if (typeof value.usage[field] !== 'string' || (value.usage[field] as string).length === 0) {
        issues.push(`usage.${field}: must be a non-empty string`);
      }
    }
  }
  if (!Array.isArray(value.periods)) return [...issues, 'periods: expected array'];
  if (value.periods.length !== 4) issues.push('periods: must contain four entries');
  const envelopeByPeriod = new Map<number, ProductionEnvelope>(
    envelopes.map((envelope) => [envelope.scenario.periodId, envelope]),
  );
  let priorPeriod = 0;
  const seen = new Set<number>();
  value.periods.forEach((rawEntry, index) => {
    const path = `periods[${index}]`;
    if (!isRecord(rawEntry)) { issues.push(`${path}: expected object`); return; }
    validateExactKeys(rawEntry, [
      'periodId', 'path', 'envelopeSha256', 'stateSha256', 'facts',
    ], path, issues);
    const periodId = rawEntry.periodId;
    if (typeof periodId !== 'number' || !Number.isInteger(periodId) || seen.has(periodId)) {
      issues.push(`${path}.periodId: must be a unique integer`);
      return;
    }
    if (periodId <= priorPeriod) issues.push(`${path}.periodId: must be strictly ascending`);
    priorPeriod = periodId;
    seen.add(periodId);
    const envelope = envelopeByPeriod.get(periodId);
    if (!envelope) { issues.push(`${path}.periodId: unknown period ${periodId}`); return; }
    if (rawEntry.path !== `godot/data/campaigns/period-${periodId}.json`) issues.push(`${path}.path: unsupported path`);
    if (rawEntry.envelopeSha256 !== canonicalSha256(envelope)) issues.push(`${path}.envelopeSha256: mismatch`);
    if (rawEntry.stateSha256 !== envelope.stateSha256) issues.push(`${path}.stateSha256: mismatch`);
    if (canonicalSha256(rawEntry.facts) !== canonicalSha256(envelope.facts)) issues.push(`${path}.facts: mismatch`);
  });
  return issues;
}

function orderProductionState(source: GameState) {
  const state = jsonClone(source);
  const cityOrder = sortEntityIds(state.cities);
  const officerOrder = sortEntityIds(state.officers);
  const itemOrder = sortEntityIds(state.items);
  const armsTypeOrder = Object.keys(state.armsTypes).sort(compareText);
  const cityRank = new Map(cityOrder.map((id, index) => [id, index]));
  const officerRank = new Map(officerOrder.map((id, index) => [id, index]));
  const itemRank = new Map(itemOrder.map((id, index) => [id, index]));
  const cities = orderedRecord(cityOrder, state.cities, (city) => ({
    ...city,
    neighbors: [...city.neighbors].sort(compareByRank(cityRank)),
    itemIds: [...(city.itemIds ?? [])].sort(compareByRank(itemRank)),
    hiddenItemIds: [...(city.hiddenItemIds ?? [])].sort(compareByRank(itemRank)),
  }));
  const officers = orderedRecord(officerOrder, state.officers, (officer) => ({
    ...officer, equipmentItemIds: [...(officer.equipmentItemIds ?? [])],
  }));
  const items = orderedRecord(itemOrder, state.items, (item) => structuredClone(item));
  const armsTypes = orderedRecord(armsTypeOrder, state.armsTypes, (arms) => structuredClone(arms));
  const factionOrderForRecord = Object.values(state.factions)
    .sort((left, right) => compareFactions(left, right, state.officers))
    .map((faction) => faction.id);
  const factions = orderedRecord(factionOrderForRecord, state.factions, (faction) => structuredClone(faction));
  const graph = buildGraph(cities, cityOrder, cityRank);
  return {
    dataContractVersion: PRODUCTION_DATA_CONTRACT_VERSION,
    cityOrder,
    officerOrder,
    itemOrder,
    armsTypeOrder,
    graph,
    ...state,
    actedOfficerIds: [...state.actedOfficerIds].sort(compareByRank(officerRank)),
    discoveredOfficerIds: [...state.discoveredOfficerIds].sort(compareByRank(officerRank)),
    strategicOrders: orderedRecord(Object.keys(state.strategicOrders).sort(compareText), state.strategicOrders, structuredClone),
    diplomaticOrders: orderedRecord(Object.keys(state.diplomaticOrders).sort(compareText), state.diplomaticOrders, structuredClone),
    intelReports: orderedRecord(Object.keys(state.intelReports).sort(compareText), state.intelReports, structuredClone),
    factions, cities, officers, items, armsTypes,
  };
}

function buildGraph(cities: Record<string, City>, order: string[], rank: ReadonlyMap<string, number>) {
  const roads: [string, string][] = [];
  let directedNeighborReferenceCount = 0;
  for (const cityId of order) {
    for (const neighborId of cities[cityId].neighbors) {
      directedNeighborReferenceCount += 1;
      if ((rank.get(cityId) ?? -1) < (rank.get(neighborId) ?? -1)) roads.push([cityId, neighborId]);
    }
  }
  return { cityCount: order.length, roadCount: roads.length, directedNeighborReferenceCount, roads };
}

function validateCandidateContract(scenario: Record<string, unknown>, state: Record<string, unknown>, issues: string[]): void {
  if (!Array.isArray(scenario.playerCandidates) || scenario.playerCandidates.length === 0) {
    issues.push('scenario.playerCandidates: must be a non-empty array');
    return;
  }
  let prior = -1;
  const seen = new Set<number>();
  for (const [index, raw] of scenario.playerCandidates.entries()) {
    if (!isRecord(raw) || !Number.isInteger(raw.sourceIndex) || typeof raw.factionId !== 'string'
      || typeof raw.rulerOfficerId !== 'string' || typeof raw.name !== 'string'
      || !Number.isInteger(raw.cityCount) || (raw.cityCount as number) < 0
      || !Number.isInteger(raw.officerCount) || (raw.officerCount as number) < 0) {
      issues.push(`scenario.playerCandidates[${index}]: invalid candidate`);
      continue;
    }
    const sourceIndex = raw.sourceIndex as number;
    if (sourceIndex <= prior || seen.has(sourceIndex)) issues.push(`scenario.playerCandidates[${index}].sourceIndex: must be unique and ascending`);
    prior = sourceIndex;
    seen.add(sourceIndex);
    const factions = isRecord(state.factions) ? state.factions : {};
    const officers = isRecord(state.officers) ? state.officers : {};
    const faction = factions[raw.factionId];
    const officer = officers[raw.rulerOfficerId];
    if (!isRecord(faction) || faction.rulerOfficerId !== raw.rulerOfficerId || !isRecord(officer)
      || officer.sourceId !== sourceIndex) issues.push(`scenario.playerCandidates[${index}]: dangling ruler/faction reference`);
  }
  if (!seen.has(scenario.defaultRulerSourceIndex as number)) {
    issues.push('scenario.defaultRulerSourceIndex: must name a candidate');
  } else {
    const defaultCandidate = scenario.playerCandidates.find((raw) =>
      isRecord(raw) && raw.sourceIndex === scenario.defaultRulerSourceIndex);
    if (!isRecord(defaultCandidate) || state.playerFactionId !== defaultCandidate.factionId
      || state.activeFactionId !== defaultCandidate.factionId) {
      issues.push('scenario.defaultRulerSourceIndex: must match the initial player and active faction');
    }
  }
}

function validateMetadataTypes(
  envelope: Record<string, unknown>, scenario: Record<string, unknown>, issues: string[],
): void {
  for (const [path, raw, fields] of [
    ['usage', envelope.usage, CLOSED_KEYS.usage],
    ['provenance', envelope.provenance, ['generatedBy', 'scenarioFactory', 'bundledSource'] as const],
    ['provenance.source', isRecord(envelope.provenance) ? envelope.provenance.source : null, CLOSED_KEYS.source],
  ] as const) {
    if (!isRecord(raw)) continue;
    for (const field of fields) {
      if (typeof raw[field] !== 'string' || (raw[field] as string).length === 0) {
        issues.push(`${path}.${field}: must be a non-empty string`);
      }
    }
  }
  for (const field of ['title', 'description'] as const) {
    if (typeof scenario[field] !== 'string') issues.push(`scenario.${field}: must be a string`);
  }
  if (!Number.isInteger(scenario.year) || (scenario.year as number) <= 0) {
    issues.push('scenario.year: must be a positive integer');
  }
  if (!Number.isInteger(scenario.defaultRulerSourceIndex)) {
    issues.push('scenario.defaultRulerSourceIndex: must be an integer');
  }
}

function validateInitialStateContract(state: Record<string, unknown>, issues: string[]): void {
  if (state.turn !== 1) issues.push('state.turn: must remain 1 in the initial-state contract');
  if (!Number.isInteger(state.rngSeed) || (state.rngSeed as number) < 0 || (state.rngSeed as number) > 0xffff_ffff) {
    issues.push('state.rngSeed: must be an unsigned 32-bit integer');
  }
  if (state.phase !== 'player') issues.push('state.phase: must remain player in the initial-state contract');
  for (const field of ['strategicOrders', 'diplomaticOrders', 'intelReports'] as const) {
    if (!isRecord(state[field]) || Object.keys(state[field]).length !== 0) {
      issues.push(`state.${field}: must remain empty in the initial-state contract`);
    }
  }
  if (!Array.isArray(state.discoveredOfficerIds) || state.discoveredOfficerIds.length !== 0) {
    issues.push('state.discoveredOfficerIds: must remain empty in the initial-state contract');
  }
  if (state.nextStrategicOrderSerial !== 1) issues.push('state.nextStrategicOrderSerial: must remain 1 in the initial-state contract');
  if (state.nextDiplomaticOrderSerial !== 1) issues.push('state.nextDiplomaticOrderSerial: must remain 1 in the initial-state contract');
  const policy = state.lifecyclePolicy;
  if (!isRecord(policy) || policy.version !== 1 || policy.ageGrowth !== 'enabled'
    || policy.naturalDeath !== 'disabled' || policy.battleDeath !== 'disabled'
    || policy.captiveEscape !== 'disabled') {
    issues.push('state.lifecyclePolicy: must remain at the supported initial-state defaults');
  }
}

function validateProductionFieldTypes(state: Record<string, unknown>, issues: string[]): void {
  requireIntegerFields(state, ['dataContractVersion', 'schemaVersion', 'turn', 'rngSeed', 'nextStrategicOrderSerial', 'nextDiplomaticOrderSerial'], 'state', issues);
  requireStringFields(state, ['rulesetId', 'phase', 'playerFactionId', 'activeFactionId'], 'state', issues);
  requireNonEmptyStringFields(state, ['rulesetId', 'phase', 'playerFactionId', 'activeFactionId'], 'state', issues);
  requireBooleanFields(state, ['campaignStarted'], 'state', issues);
  requireStringArrays(state, ['cityOrder', 'officerOrder', 'itemOrder', 'armsTypeOrder', 'factionOrder', 'actedOfficerIds', 'discoveredOfficerIds'], 'state', issues);
  requireRecordFields(state, ['factions', 'cities', 'officers', 'items', 'armsTypes', 'strategicOrders', 'diplomaticOrders', 'intelReports'], 'state', issues);
  if (!Array.isArray(state.logs)) issues.push('state.logs: must be an array');

  if (isRecord(state.scenario)) {
    requireStringFields(state.scenario, ['id', 'source'], 'state.scenario', issues);
    requireNonEmptyStringFields(state.scenario, ['id', 'source'], 'state.scenario', issues);
    requireIntegerFields(state.scenario, ['period'], 'state.scenario', issues);
  }
  if (isRecord(state.calendar)) requireIntegerFields(state.calendar, ['year', 'month'], 'state.calendar', issues);
  if (isRecord(state.graph)) {
    requireIntegerFields(state.graph, ['cityCount', 'roadCount', 'directedNeighborReferenceCount'], 'state.graph', issues);
    if (!Array.isArray(state.graph.roads)) issues.push('state.graph.roads: must be an array');
    else state.graph.roads.forEach((pair, index) => {
      if (!Array.isArray(pair) || pair.length !== 2 || pair.some((id) => typeof id !== 'string')) {
        issues.push(`state.graph.roads[${index}]: must contain two city ids`);
      }
    });
  }
  validateTypedRecord(state.factions, 'state.factions', (record, path) => {
    requireStringFields(record, ['id', 'name', 'color', 'rulerOfficerId'], path, issues);
    requireNonEmptyStringFields(record, ['id', 'name', 'color', 'rulerOfficerId'], path, issues);
    requireBooleanFields(record, ['isPlayer'], path, issues);
    if ('isNeutral' in record && typeof record.isNeutral !== 'boolean') issues.push(`${path}.isNeutral: must be a boolean`);
    if (!['balanced', 'aggressive', 'defensive'].includes(String(record.aiProfile))) issues.push(`${path}.aiProfile: unsupported value`);
  });
  validateTypedRecord(state.cities, 'state.cities', (record, path) => {
    requireStringFields(record, ['id', 'name', 'region', 'ownerId'], path, issues);
    requireNonEmptyStringFields(record, ['id', 'name', 'region', 'ownerId'], path, issues);
    if (!['capital', 'city', 'frontier'].includes(String(record.type))) issues.push(`${path}.type: unsupported value`);
    requireIntegerFields(record, [
      'sourceIndex', 'x', 'y', 'farming', 'farmingLimit', 'commerce', 'commerceLimit',
      'population', 'populationLimit', 'publicLoyalty', 'disasterPrevention', 'defense',
      'money', 'food', 'reserveTroops',
    ], path, issues);
    requireStringArrays(record, ['neighbors', 'itemIds', 'hiddenItemIds'], path, issues);
    if ('satrapOfficerId' in record && (typeof record.satrapOfficerId !== 'string' || record.satrapOfficerId.length === 0)) {
      issues.push(`${path}.satrapOfficerId: must be a non-empty string`);
    }
  });
  validateTypedRecord(state.officers, 'state.officers', (record, path) => {
    requireStringFields(record, ['id', 'name', 'factionId', 'status', 'armsTypeId'], path, issues);
    requireNonEmptyStringFields(record, ['id', 'factionId', 'status', 'armsTypeId'], path, issues);
    requireIntegerFields(record, [
      'sourceId', 'age', 'force', 'intelligence', 'leadership', 'character', 'loyalty', 'stamina', 'level',
      'experience', 'troops',
    ], path, issues);
    requireStringArrays(record, ['equipmentItemIds'], path, issues);
    for (const field of ['cityId', 'appearanceCityId'] as const) {
      if (field in record && (typeof record[field] !== 'string' || record[field].length === 0)) {
        issues.push(`${path}.${field}: must be a non-empty string`);
      }
    }
    if ('appearanceYear' in record && !Number.isInteger(record.appearanceYear)) issues.push(`${path}.appearanceYear: must be an integer`);
  });
  validateTypedRecord(state.items, 'state.items', (record, path) => {
    requireStringFields(record, ['id', 'name'], path, issues);
    requireNonEmptyStringFields(record, ['id', 'name'], path, issues);
    requireIntegerFields(record, ['sourceId', 'forceBonus', 'intelligenceBonus', 'moveBonus'], path, issues);
    if ('armsTypeOverride' in record && (typeof record.armsTypeOverride !== 'string' || record.armsTypeOverride.length === 0)) {
      issues.push(`${path}.armsTypeOverride: must be a non-empty string`);
    }
  });
  validateTypedRecord(state.armsTypes, 'state.armsTypes', (record, path) => {
    requireStringFields(record, ['id', 'name'], path, issues);
    requireNonEmptyStringFields(record, ['id', 'name'], path, issues);
    requireFiniteNumberFields(record, ['attackModifier', 'defenseModifier', 'mobility'], path, issues);
  });
  if (Array.isArray(state.logs)) state.logs.forEach((raw, index) => {
    if (!isRecord(raw)) { issues.push(`state.logs[${index}]: expected object`); return; }
    requireStringFields(raw, ['id', 'kind', 'message'], `state.logs[${index}]`, issues);
    requireNonEmptyStringFields(raw, ['id', 'kind', 'message'], `state.logs[${index}]`, issues);
    requireIntegerFields(raw, ['turn'], `state.logs[${index}]`, issues);
    if (!['system', 'turn', 'battle', 'ai', 'map'].includes(String(raw.kind))) {
      issues.push(`state.logs[${index}].kind: unsupported value`);
    }
  });
}

function validateTypedRecord(
  raw: unknown, path: string,
  validate: (record: Record<string, unknown>, entryPath: string) => void,
): void {
  if (!isRecord(raw)) return;
  for (const key of Object.keys(raw).sort(compareText)) {
    const entry = raw[key];
    if (isRecord(entry)) validate(entry, `${path}.${key}`);
  }
}

function requireStringFields(record: Record<string, unknown>, fields: readonly string[], path: string, issues: string[]): void {
  for (const field of fields) if (typeof record[field] !== 'string') issues.push(`${path}.${field}: must be a string`);
}

function requireNonEmptyStringFields(record: Record<string, unknown>, fields: readonly string[], path: string, issues: string[]): void {
  for (const field of fields) if (typeof record[field] === 'string' && record[field].length === 0) {
    issues.push(`${path}.${field}: must be a non-empty string`);
  }
}

function requireBooleanFields(record: Record<string, unknown>, fields: readonly string[], path: string, issues: string[]): void {
  for (const field of fields) if (typeof record[field] !== 'boolean') issues.push(`${path}.${field}: must be a boolean`);
}

function requireIntegerFields(record: Record<string, unknown>, fields: readonly string[], path: string, issues: string[]): void {
  for (const field of fields) if (!Number.isInteger(record[field])) issues.push(`${path}.${field}: must be an integer`);
}

function requireFiniteNumberFields(record: Record<string, unknown>, fields: readonly string[], path: string, issues: string[]): void {
  for (const field of fields) if (typeof record[field] !== 'number' || !Number.isFinite(record[field])) issues.push(`${path}.${field}: must be a finite number`);
}

function requireRecordFields(record: Record<string, unknown>, fields: readonly string[], path: string, issues: string[]): void {
  for (const field of fields) if (!isRecord(record[field])) issues.push(`${path}.${field}: expected object`);
}

function requireStringArrays(record: Record<string, unknown>, fields: readonly string[], path: string, issues: string[]): void {
  for (const field of fields) {
    if (!Array.isArray(record[field]) || (record[field] as unknown[]).some((value) => typeof value !== 'string')) {
      issues.push(`${path}.${field}: must be an array of strings`);
    }
  }
}

function validateClosedProductionShape(
  envelope: Record<string, unknown>,
  scenario: Record<string, unknown>,
  facts: Record<string, unknown>,
  state: Record<string, unknown>,
  issues: string[],
): void {
  validateObjectAt(envelope.usage, CLOSED_KEYS.usage, 'usage', issues);
  validateObjectAt(envelope.provenance, CLOSED_KEYS.provenance, 'provenance', issues);
  if (isRecord(envelope.provenance)) {
    validateObjectAt(envelope.provenance.source, CLOSED_KEYS.source, 'provenance.source', issues);
  }
  validateExactKeys(scenario, CLOSED_KEYS.scenario, 'scenario', issues);
  if (Array.isArray(scenario.playerCandidates)) {
    scenario.playerCandidates.forEach((candidate, index) =>
      validateObjectAt(candidate, CLOSED_KEYS.candidate, `scenario.playerCandidates[${index}]`, issues));
  }
  validateExactKeys(facts, CLOSED_KEYS.facts, 'facts', issues);
  validateExactKeys(state, CLOSED_KEYS.state, 'state', issues);
  validateObjectAt(state.scenario, CLOSED_KEYS.stateScenario, 'state.scenario', issues);
  validateObjectAt(state.calendar, CLOSED_KEYS.calendar, 'state.calendar', issues);
  validateObjectAt(state.lifecyclePolicy, CLOSED_KEYS.lifecyclePolicy, 'state.lifecyclePolicy', issues);
  validateObjectAt(state.graph, CLOSED_KEYS.graph, 'state.graph', issues);
  validateRecordValues(state.factions, CLOSED_KEYS.faction, ['isNeutral'], 'state.factions', issues);
  validateRecordValues(state.cities, CLOSED_KEYS.city, ['satrapOfficerId'], 'state.cities', issues);
  validateRecordValues(
    state.officers, CLOSED_KEYS.officer, ['cityId', 'appearanceYear', 'appearanceCityId'], 'state.officers', issues,
  );
  validateRecordValues(state.items, CLOSED_KEYS.item, ['armsTypeOverride'], 'state.items', issues);
  validateRecordValues(state.armsTypes, CLOSED_KEYS.armsType, [], 'state.armsTypes', issues);
  if (Array.isArray(state.logs)) {
    state.logs.forEach((entry, index) => validateObjectAt(entry, CLOSED_KEYS.log, `state.logs[${index}]`, issues));
  }
}

function validateRecordValues(
  raw: unknown, allowed: readonly string[], optional: readonly string[], path: string, issues: string[],
): void {
  if (!isRecord(raw)) return;
  for (const key of Object.keys(raw).sort(compareText)) {
    validateObjectAt(raw[key], allowed, `${path}.${key}`, issues, optional);
  }
}

function validateObjectAt(
  raw: unknown, allowed: readonly string[], path: string, issues: string[], optional: readonly string[] = [],
): void {
  if (!isRecord(raw)) {
    issues.push(`${path}: expected object`);
    return;
  }
  validateExactKeys(raw, allowed, path, issues, optional);
}

function validateOrder(
  path: string,
  state: Record<string, unknown>,
  rawRecord: unknown,
  sourceField: 'sourceIndex' | 'sourceId' | null,
  issues: string[],
): void {
  const order = state[path];
  if (!Array.isArray(order) || !isRecord(rawRecord)) { issues.push(`state.${path}: invalid order or record`); return; }
  if (new Set(order).size !== order.length) issues.push(`state.${path}: contains duplicate ids`);
  if (order.length !== Object.keys(rawRecord).length || order.some((id) => typeof id !== 'string' || !(id in rawRecord))) {
    issues.push(`state.${path}: must cover its record exactly`);
  }
  const expected = Object.keys(rawRecord).sort((leftId, rightId) => {
    if (sourceField) {
      const left = rawRecord[leftId]; const right = rawRecord[rightId];
      const leftSource = isRecord(left) && typeof left[sourceField] === 'number' ? left[sourceField] as number : Number.MAX_SAFE_INTEGER;
      const rightSource = isRecord(right) && typeof right[sourceField] === 'number' ? right[sourceField] as number : Number.MAX_SAFE_INTEGER;
      if (leftSource !== rightSource) return leftSource - rightSource;
    }
    return compareText(leftId, rightId);
  });
  if (canonicalSha256(order) !== canonicalSha256(expected)) issues.push(`state.${path}: must follow the production semantic order`);
}

function validateNestedOrders(state: Record<string, unknown>, issues: string[]): void {
  if (!Array.isArray(state.cityOrder) || !Array.isArray(state.itemOrder) || !isRecord(state.cities)) return;
  const cityRank = new Map(state.cityOrder.map((id, index) => [id, index]));
  const itemRank = new Map(state.itemOrder.map((id, index) => [id, index]));
  for (const cityId of state.cityOrder) {
    const city = typeof cityId === 'string' ? state.cities[cityId] : undefined;
    if (!isRecord(city)) continue;
    for (const field of ['neighbors', 'itemIds', 'hiddenItemIds'] as const) {
      if (!Array.isArray(city[field])) continue;
      const rank = field === 'neighbors' ? cityRank : itemRank;
      const expected = [...city[field]].sort((left, right) =>
        (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER)
        || compareText(String(left), String(right)));
      if (canonicalSha256(city[field]) !== canonicalSha256(expected)) {
        issues.push(`state.cities.${cityId}.${field}: must follow the production semantic order`);
      }
    }
  }
}

function validateFacts(facts: Record<string, unknown>, state: Record<string, unknown>, issues: string[]): void {
  const expected: Record<string, number> = {
    cityCount: arrayLength(state.cityOrder),
    roadCount: isRecord(state.graph) && typeof state.graph.roadCount === 'number' ? state.graph.roadCount : -1,
    directedNeighborReferenceCount: isRecord(state.graph) && typeof state.graph.directedNeighborReferenceCount === 'number' ? state.graph.directedNeighborReferenceCount : -1,
    factionCount: isRecord(state.factions) ? Object.values(state.factions).filter((f) => isRecord(f) && !f.isNeutral).length : -1,
    officerCount: arrayLength(state.officerOrder), itemCount: arrayLength(state.itemOrder), armsTypeCount: arrayLength(state.armsTypeOrder),
  };
  for (const [field, count] of Object.entries(expected)) if (facts[field] !== count) issues.push(`facts.${field}: must equal ${count}`);
}

function validateGraph(state: Record<string, unknown>, issues: string[]): void {
  if (!isRecord(state.cities) || !isRecord(state.graph)) return;
  const expectedRoads: [string, string][] = [];
  let directedReferences = 0;
  const cityOrder = Array.isArray(state.cityOrder)
    ? state.cityOrder.filter((id): id is string => typeof id === 'string')
    : Object.keys(state.cities).sort(compareText);
  const cityRank = new Map(cityOrder.map((id, index) => [id, index]));
  for (const cityId of cityOrder) {
    const city = state.cities[cityId];
    if (!isRecord(city) || !Array.isArray(city.neighbors)) continue;
    for (const neighborId of city.neighbors) {
      directedReferences += 1;
      const neighbor = typeof neighborId === 'string' ? state.cities[neighborId] : undefined;
      if (!isRecord(neighbor) || !Array.isArray(neighbor.neighbors) || !neighbor.neighbors.includes(cityId)) {
        issues.push(`state.cities.${cityId}.neighbors: road is not reciprocal: ${String(neighborId)}`);
      }
      if (typeof neighborId === 'string'
        && (cityRank.get(cityId) ?? Number.MAX_SAFE_INTEGER) < (cityRank.get(neighborId) ?? -1)) {
        expectedRoads.push([cityId, neighborId]);
      }
    }
  }
  if (state.graph.cityCount !== Object.keys(state.cities).length) issues.push('state.graph.cityCount: mismatch');
  if (state.graph.roadCount !== expectedRoads.length) issues.push('state.graph.roadCount: mismatch');
  if (state.graph.directedNeighborReferenceCount !== directedReferences) {
    issues.push('state.graph.directedNeighborReferenceCount: mismatch');
  }
  if (!Array.isArray(state.graph.roads)
    || canonicalSha256(state.graph.roads) !== canonicalSha256(expectedRoads)) {
    issues.push('state.graph.roads: must exactly match reciprocal city neighbors in semantic order');
  }
}

function validateExactKeys(
  record: Record<string, unknown>, allowed: readonly string[], path: string, issues: string[], optional: readonly string[] = [],
): void {
  const allowedSet = new Set(allowed);
  const optionalSet = new Set(optional);
  for (const key of Object.keys(record).sort(compareText)) if (!allowedSet.has(key)) issues.push(`${path}.${key}: unknown field`);
  for (const key of allowed) if (!optionalSet.has(key) && !(key in record)) issues.push(`${path}.${key}: missing field`);
}

function sortEntityIds<T extends { id: string; sourceId?: number; sourceIndex?: number }>(record: Record<string, T>): string[] {
  return Object.values(record).sort((left, right) =>
    (left.sourceId ?? left.sourceIndex ?? Number.MAX_SAFE_INTEGER) - (right.sourceId ?? right.sourceIndex ?? Number.MAX_SAFE_INTEGER)
    || compareText(left.id, right.id)).map((entity) => entity.id);
}

function orderedRecord<T, U>(order: string[], source: Record<string, T>, project: (value: T) => U): Record<string, U> {
  return Object.fromEntries(order.map((id) => [id, project(source[id])]));
}

function compareFactions(left: Faction, right: Faction, officers: Record<string, Officer>): number {
  return (officers[left.rulerOfficerId]?.sourceId ?? Number.MAX_SAFE_INTEGER)
    - (officers[right.rulerOfficerId]?.sourceId ?? Number.MAX_SAFE_INTEGER) || compareText(left.id, right.id);
}

function compareByRank(rank: ReadonlyMap<string, number>): (left: string, right: string) => number {
  return (left, right) => (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER) || compareText(left, right);
}

function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function arrayLength(value: unknown): number { return Array.isArray(value) ? value.length : -1; }
function jsonClone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
