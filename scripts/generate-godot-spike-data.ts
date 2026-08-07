import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { developFarming } from '../src/core/cityCommands';
import { buildMigrationReplaySuite } from '../src/core/migration/replayFixture';
import type { City, Faction, GameState, Officer } from '../src/core/types';
import { createBundledScenario } from '../src/data/bundledScenarios';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PERIOD_OUTPUT_PATH = resolve(PROJECT_ROOT, 'godot/data/period-1.json');
const FIXTURE_OUTPUT_PATH = resolve(PROJECT_ROOT, 'godot/data/fixtures/develop-farming-v1.json');
const REPLAY_SUITE_OUTPUT_PATH = resolve(PROJECT_ROOT, 'godot/data/fixtures/migration-replay-suite-v1.json');
const BUNDLED_PERIODS_PATH = resolve(PROJECT_ROOT, 'src/data/generated/baye-periods.json');

const PERIOD_ID = 1 as const;
const PLAYER_RULER_SOURCE_INDEX = 1;
const RULESET_ID = 'baye-classic-v1' as const;
const EXPECTED_CITY_COUNT = 38;
const EXPECTED_ROAD_COUNT = 54;
const EXPECTED_DIRECTED_NEIGHBOR_REFERENCES = 108;
const DEVELOP_CITY_ID = 'city-12';
const DEVELOP_OFFICER_ID = 'officer-1';
const EXPECTED_INPUT_SEED = 48_641;
const EXPECTED_OUTPUT_SEED = 373_686_124;
const EXPECTED_FARMING_GAIN = 63;

const technicalSpikeUsage = {
  scope: 'internal-technical-spike',
  redistributionReview: 'pending',
  notice: 'Internal technical-spike data only. Redistribution review is pending; this export makes no new license claim.',
} as const;

type BundledPeriodsEnvelope = {
  schemaVersion: number;
  source: {
    repository: string;
    commit: string;
    archiveSha256: string;
    note: string;
  };
};

type OrderedSpikeState = GameState & {
  dataContractVersion: 1;
  usage: typeof technicalSpikeUsage;
  provenance: {
    generatedBy: string;
    scenarioFactory: {
      path: string;
      symbol: string;
      arguments: {
        periodId: 1;
        rulerSourceIndex: 1;
        rulesetId: typeof RULESET_ID;
      };
    };
    bundledScenario: {
      path: string;
      schemaVersion: number;
      source: BundledPeriodsEnvelope['source'];
    };
  };
  graph: {
    cityCount: number;
    roadCount: number;
    directedNeighborReferenceCount: number;
    roads: [string, string][];
  };
  cityOrder: string[];
  officerOrder: string[];
  itemOrder: string[];
  armsTypeOrder: string[];
};

export type DevelopFarmingSpikeFixture = ReturnType<typeof buildDevelopFarmingFixture>;

export function buildGodotSpikeData(): OrderedSpikeState {
  const state = createBundledScenario(PERIOD_ID, PLAYER_RULER_SOURCE_INDEX, RULESET_ID);
  const bundledPeriods = JSON.parse(readFileSync(BUNDLED_PERIODS_PATH, 'utf8')) as BundledPeriodsEnvelope;

  const cityOrder = sortEntityIds(state.cities);
  const officerOrder = sortEntityIds(state.officers);
  const itemOrder = sortEntityIds(state.items);
  const armsTypeOrder = Object.keys(state.armsTypes).sort(compareText);
  const cityRank = new Map(cityOrder.map((id, index) => [id, index]));
  const itemRank = new Map(itemOrder.map((id, index) => [id, index]));
  const officerRank = new Map(officerOrder.map((id, index) => [id, index]));

  const cities = orderedRecord(cityOrder, state.cities, (city) => ({
    ...structuredClone(city),
    neighbors: [...city.neighbors].sort(compareByRank(cityRank)),
    itemIds: [...(city.itemIds ?? [])].sort(compareByRank(itemRank)),
    hiddenItemIds: [...(city.hiddenItemIds ?? [])].sort(compareByRank(itemRank)),
  }));
  const officers = orderedRecord(officerOrder, state.officers, (officer) => ({
    ...structuredClone(officer),
    // Equipment slots are semantic and intentionally retain their source order.
    equipmentItemIds: [...(officer.equipmentItemIds ?? [])],
  }));
  const items = orderedRecord(itemOrder, state.items, (item) => structuredClone(item));
  const factionDictionaryOrder = Object.values(state.factions)
    .sort((left, right) => compareFactions(left, right, state.officers))
    .map((faction) => faction.id);
  const factions = orderedRecord(factionDictionaryOrder, state.factions, (faction) => structuredClone(faction));
  const armsTypes = orderedRecord(armsTypeOrder, state.armsTypes, (armsType) => structuredClone(armsType));
  const graph = buildGraph(cities, cityOrder, cityRank);

  assertEqual(cityOrder.length, EXPECTED_CITY_COUNT, 'period-1 city count');
  assertEqual(graph.roadCount, EXPECTED_ROAD_COUNT, 'period-1 reciprocal road count');
  assertEqual(
    graph.directedNeighborReferenceCount,
    EXPECTED_DIRECTED_NEIGHBOR_REFERENCES,
    'period-1 directed neighbor reference count',
  );
  assertEqual(state.rngSeed, EXPECTED_INPUT_SEED, 'period-1 initial RNG seed');
  assertEqual(state.cities[DEVELOP_CITY_ID]?.ownerId, state.playerFactionId, 'fixture city owner');
  assertEqual(state.officers[DEVELOP_OFFICER_ID]?.cityId, DEVELOP_CITY_ID, 'fixture officer city');

  return {
    dataContractVersion: 1,
    usage: technicalSpikeUsage,
    provenance: {
      generatedBy: 'scripts/generate-godot-spike-data.ts',
      scenarioFactory: {
        path: 'src/data/bundledScenarios.ts',
        symbol: 'createBundledScenario',
        arguments: {
          periodId: PERIOD_ID,
          rulerSourceIndex: PLAYER_RULER_SOURCE_INDEX,
          rulesetId: RULESET_ID,
        },
      },
      bundledScenario: {
        path: 'src/data/generated/baye-periods.json',
        schemaVersion: bundledPeriods.schemaVersion,
        source: structuredClone(bundledPeriods.source),
      },
    },
    graph,
    cityOrder,
    officerOrder,
    itemOrder,
    armsTypeOrder,
    schemaVersion: state.schemaVersion,
    rulesetId: state.rulesetId,
    scenario: structuredClone(state.scenario),
    turn: state.turn,
    phase: state.phase,
    activeFactionId: state.activeFactionId,
    factionOrder: [...state.factionOrder],
    rngSeed: state.rngSeed,
    calendar: structuredClone(state.calendar),
    campaignStarted: state.campaignStarted,
    lifecyclePolicy: structuredClone(state.lifecyclePolicy),
    playerFactionId: state.playerFactionId,
    actedOfficerIds: [...state.actedOfficerIds].sort(compareByRank(officerRank)),
    strategicOrders: orderedRecord(
      Object.keys(state.strategicOrders).sort(compareText),
      state.strategicOrders,
      (order) => structuredClone(order),
    ),
    nextStrategicOrderSerial: state.nextStrategicOrderSerial,
    diplomaticOrders: orderedRecord(
      Object.keys(state.diplomaticOrders).sort(compareText),
      state.diplomaticOrders,
      (order) => structuredClone(order),
    ),
    nextDiplomaticOrderSerial: state.nextDiplomaticOrderSerial,
    discoveredOfficerIds: [...state.discoveredOfficerIds].sort(compareByRank(officerRank)),
    intelReports: orderedRecord(
      Object.keys(state.intelReports).sort(compareText),
      state.intelReports,
      (report) => structuredClone(report),
    ),
    factions,
    cities,
    officers,
    items,
    armsTypes,
    logs: structuredClone(state.logs),
  };
}

export function buildDevelopFarmingFixture() {
  const state = createBundledScenario(PERIOD_ID, PLAYER_RULER_SOURCE_INDEX, RULESET_ID);
  const city = state.cities[DEVELOP_CITY_ID];
  const officer = state.officers[DEVELOP_OFFICER_ID];
  if (!city || !officer) throw new Error('Develop-farming fixture input is missing');

  const next = developFarming(state, { cityId: city.id, officerId: officer.id });
  const nextCity = next.cities[city.id];
  const nextOfficer = next.officers[officer.id];
  const gain = nextCity.farming - city.farming;
  const appendedLog = next.logs.at(-1);
  if (!appendedLog) throw new Error('Develop-farming oracle did not append a log');

  assertEqual(state.rngSeed, EXPECTED_INPUT_SEED, 'develop-farming input seed');
  assertEqual(next.rngSeed, EXPECTED_OUTPUT_SEED, 'develop-farming output seed');
  assertEqual(gain, EXPECTED_FARMING_GAIN, 'develop-farming gain');

  return {
    fixtureVersion: 1,
    id: 'develop-farming-v1',
    usage: technicalSpikeUsage,
    provenance: {
      scenarioDataPath: 'godot/data/period-1.json',
      oracle: {
        path: 'src/core/cityCommands.ts',
        symbol: 'developFarming',
      },
      rng: {
        path: 'src/core/random.ts',
        symbol: 'nextRandom',
      },
      ruleset: {
        path: 'src/core/rulesets.ts',
        id: RULESET_ID,
      },
    },
    input: {
      command: {
        kind: 'developFarming',
        cityId: city.id,
        officerId: officer.id,
      },
      state: {
        turn: state.turn,
        rngSeed: state.rngSeed,
        campaignStarted: state.campaignStarted,
        actedOfficerIds: [...state.actedOfficerIds],
        logCount: state.logs.length,
      },
      city: {
        id: city.id,
        name: city.name,
        ownerId: city.ownerId,
        farmingLimit: city.farmingLimit,
        resources: {
          farming: city.farming,
          money: city.money,
        },
      },
      officer: {
        id: officer.id,
        name: officer.name,
        factionId: officer.factionId,
        cityId: officer.cityId,
        intelligence: officer.intelligence,
        equipmentItemIds: [...(officer.equipmentItemIds ?? [])],
        stamina: officer.stamina,
      },
    },
    expected: {
      gain,
      costs: {
        money: city.money - nextCity.money,
        stamina: officer.stamina - nextOfficer.stamina,
      },
      state: {
        turn: next.turn,
        rngSeed: next.rngSeed,
        campaignStarted: next.campaignStarted,
        actedOfficerIds: [...next.actedOfficerIds],
        logCount: next.logs.length,
      },
      city: {
        id: nextCity.id,
        resources: {
          farming: nextCity.farming,
          money: nextCity.money,
        },
      },
      officer: {
        id: nextOfficer.id,
        stamina: nextOfficer.stamina,
      },
      appendedLog: structuredClone(appendedLog),
    },
  };
}

export function writeGodotSpikeData(): void {
  const period = buildGodotSpikeData();
  writeJson(PERIOD_OUTPUT_PATH, period);
  writeJson(FIXTURE_OUTPUT_PATH, buildDevelopFarmingFixture());
  writeJson(REPLAY_SUITE_OUTPUT_PATH, buildMigrationReplaySuite(period));
  process.stdout.write(
    `Generated ${relativeOutput(PERIOD_OUTPUT_PATH)}, ${relativeOutput(FIXTURE_OUTPUT_PATH)}, and ${relativeOutput(REPLAY_SUITE_OUTPUT_PATH)}.\n`,
  );
}

function buildGraph(
  cities: Record<string, City>,
  cityOrder: string[],
  cityRank: ReadonlyMap<string, number>,
): OrderedSpikeState['graph'] {
  const roads: [string, string][] = [];
  let directedNeighborReferenceCount = 0;

  for (const cityId of cityOrder) {
    const city = cities[cityId];
    for (const neighborId of city.neighbors) {
      const neighbor = cities[neighborId];
      if (!neighbor) throw new Error(`${cityId} references missing neighbor ${neighborId}`);
      if (!neighbor.neighbors.includes(cityId)) {
        throw new Error(`Period-1 road is not reciprocal: ${cityId} -> ${neighborId}`);
      }
      directedNeighborReferenceCount += 1;
      if ((cityRank.get(cityId) ?? -1) < (cityRank.get(neighborId) ?? -1)) {
        roads.push([cityId, neighborId]);
      }
    }
  }

  return {
    cityCount: cityOrder.length,
    roadCount: roads.length,
    directedNeighborReferenceCount,
    roads,
  };
}

function sortEntityIds<T extends { id: string; sourceId?: number; sourceIndex?: number }>(
  record: Record<string, T>,
): string[] {
  return Object.values(record).sort(compareSourceThenId).map((entity) => entity.id);
}

function orderedRecord<T, U>(
  order: string[],
  source: Record<string, T>,
  project: (value: T) => U,
): Record<string, U> {
  return Object.fromEntries(order.map((id) => {
    const value = source[id];
    if (value === undefined) throw new Error(`Ordered record references missing id: ${id}`);
    return [id, project(value)];
  }));
}

function compareSourceThenId(
  left: { id: string; sourceId?: number; sourceIndex?: number },
  right: { id: string; sourceId?: number; sourceIndex?: number },
): number {
  return (left.sourceId ?? left.sourceIndex ?? Number.MAX_SAFE_INTEGER)
    - (right.sourceId ?? right.sourceIndex ?? Number.MAX_SAFE_INTEGER)
    || compareText(left.id, right.id);
}

function compareFactions(
  left: Faction,
  right: Faction,
  officers: Record<string, Officer>,
): number {
  const leftSource = officers[left.rulerOfficerId]?.sourceId ?? Number.MAX_SAFE_INTEGER;
  const rightSource = officers[right.rulerOfficerId]?.sourceId ?? Number.MAX_SAFE_INTEGER;
  return leftSource - rightSource || compareText(left.id, right.id);
}

function compareByRank(rank: ReadonlyMap<string, number>): (left: string, right: string) => number {
  return (left, right) => (rank.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (rank.get(right) ?? Number.MAX_SAFE_INTEGER)
    || compareText(left, right);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function relativeOutput(path: string): string {
  return path.slice(PROJECT_ROOT.length + 1).replaceAll('\\', '/');
}

const modulePath = fileURLToPath(import.meta.url).toLowerCase();
const invokedDirectly = process.argv.slice(1).some((argument) => resolve(argument).toLowerCase() === modulePath);
if (invokedDirectly || process.env.npm_lifecycle_event === 'godot:spike-data') {
  writeGodotSpikeData();
}
