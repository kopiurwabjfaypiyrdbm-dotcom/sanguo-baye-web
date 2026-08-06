import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDevelopFarmingFixture,
  buildGodotSpikeData,
} from '../../scripts/generate-godot-spike-data';
import { createBundledScenario } from '../data/bundledScenarios';
import { developFarming } from './cityCommands';
import type { GameState } from './types';

type SpikeData = ReturnType<typeof buildGodotSpikeData>;
type DevelopFixture = ReturnType<typeof buildDevelopFarmingFixture>;

const periodData = readJson<SpikeData>('godot/data/period-1.json');
const developFixture = readJson<DevelopFixture>('godot/data/fixtures/develop-farming-v1.json');

describe('Godot technical-spike TypeScript oracle contract', () => {
  it('keeps the checked-in period-1 dataset reproducible, ordered, and reciprocal', () => {
    expect(periodData).toEqual(jsonValue(buildGodotSpikeData()));
    expect(periodData.provenance.scenarioFactory.arguments).toEqual({
      periodId: 1,
      rulerSourceIndex: 1,
      rulesetId: 'baye-classic-v1',
    });
    expect(periodData.usage).toMatchObject({
      scope: 'internal-technical-spike',
      redistributionReview: 'pending',
    });

    expect(Object.keys(periodData.cities)).toEqual(periodData.cityOrder);
    expect(Object.keys(periodData.officers)).toEqual(periodData.officerOrder);
    expect(Object.keys(periodData.items)).toEqual(periodData.itemOrder);
    expect(periodData.cityOrder).toHaveLength(38);
    expect(periodData.officerOrder).toHaveLength(200);
    expect(periodData.graph).toMatchObject({
      cityCount: 38,
      roadCount: 54,
      directedNeighborReferenceCount: 108,
    });
    expect(periodData.graph.roads).toHaveLength(54);

    let directedReferences = 0;
    for (const cityId of periodData.cityOrder) {
      const city = periodData.cities[cityId];
      directedReferences += city.neighbors.length;
      for (const neighborId of city.neighbors) {
        expect(periodData.cities[neighborId]?.neighbors).toContain(cityId);
      }
    }
    expect(directedReferences).toBe(108);

    const live = createBundledScenario(1, 1, 'baye-classic-v1');
    expect(periodData.cityOrder).toEqual(sortedEntityIds(live.cities));
    expect(periodData.officerOrder).toEqual(sortedEntityIds(live.officers));
    expect(periodData.itemOrder).toEqual(sortedEntityIds(live.items));
    expect(periodData.factions).toEqual(jsonValue(buildGodotSpikeData()).factions);
  });

  it('matches the developFarming input and full observable output for seed 48641', () => {
    expect(developFixture).toEqual(jsonValue(buildDevelopFarmingFixture()));
    expect(developFixture.usage).toMatchObject({
      scope: 'internal-technical-spike',
      redistributionReview: 'pending',
    });

    const command = developFixture.input.command;
    const dataState = structuredClone(periodData) as GameState;
    const liveState = createBundledScenario(1, 1, 'baye-classic-v1');

    expect(projectInput(dataState, command)).toEqual(developFixture.input);
    expect(projectInput(liveState, command)).toEqual(developFixture.input);

    const fromData = developFarming(dataState, command);
    const fromLive = developFarming(liveState, command);
    expect(projectOutput(dataState, fromData, command)).toEqual(developFixture.expected);
    expect(projectOutput(liveState, fromLive, command)).toEqual(developFixture.expected);

    expect(developFixture.expected).toMatchObject({
      gain: 63,
      costs: { money: 50, stamina: 8 },
      state: {
        rngSeed: 373_686_124,
        campaignStarted: true,
        actedOfficerIds: ['officer-1'],
      },
      city: {
        id: 'city-12',
        resources: { farming: 1301, money: 85 },
      },
      officer: { id: 'officer-1', stamina: 92 },
      appendedLog: {
        id: 'log-1-002',
        kind: 'map',
        message: '曹操在濮阳主持开垦，农业提高 63，消耗金钱 50、体力 8。',
        turn: 1,
      },
    });
  });
});

function projectInput(
  state: GameState,
  command: DevelopFixture['input']['command'],
): DevelopFixture['input'] {
  const city = state.cities[command.cityId];
  const officer = state.officers[command.officerId];
  return {
    command: structuredClone(command),
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
  };
}

function projectOutput(
  before: GameState,
  after: GameState,
  command: DevelopFixture['input']['command'],
): DevelopFixture['expected'] {
  const beforeCity = before.cities[command.cityId];
  const afterCity = after.cities[command.cityId];
  const beforeOfficer = before.officers[command.officerId];
  const afterOfficer = after.officers[command.officerId];
  const appendedLog = after.logs.at(-1);
  if (!appendedLog) throw new Error('Expected developFarming to append one log');

  return {
    gain: afterCity.farming - beforeCity.farming,
    costs: {
      money: beforeCity.money - afterCity.money,
      stamina: beforeOfficer.stamina - afterOfficer.stamina,
    },
    state: {
      turn: after.turn,
      rngSeed: after.rngSeed,
      campaignStarted: after.campaignStarted,
      actedOfficerIds: [...after.actedOfficerIds],
      logCount: after.logs.length,
    },
    city: {
      id: afterCity.id,
      resources: {
        farming: afterCity.farming,
        money: afterCity.money,
      },
    },
    officer: {
      id: afterOfficer.id,
      stamina: afterOfficer.stamina,
    },
    appendedLog: structuredClone(appendedLog),
  };
}

function sortedEntityIds<T extends { id: string; sourceId?: number; sourceIndex?: number }>(
  record: Record<string, T>,
): string[] {
  return Object.values(record)
    .sort((left, right) => (left.sourceId ?? left.sourceIndex ?? Number.MAX_SAFE_INTEGER)
      - (right.sourceId ?? right.sourceIndex ?? Number.MAX_SAFE_INTEGER)
      || compareText(left.id, right.id))
    .map((entity) => entity.id);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function jsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as T;
}
