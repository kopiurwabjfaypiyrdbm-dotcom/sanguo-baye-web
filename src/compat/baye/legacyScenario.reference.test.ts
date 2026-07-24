// @ts-expect-error Node built-in is available to Vitest at runtime.
import { readFileSync } from 'node:fs';
// @ts-expect-error Node built-in is available to Vitest at runtime.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLegacyPeriodGameState } from '../../data/legacyScenario';
import { executeAttack } from '../../core/battle';
import {
  calculateOfficerTroopCapacity,
  developFarming,
  distributeTroops,
  recruitTroops,
} from '../../core/cityCommands';
import { advanceTurn } from '../../core/turn';
import { validateGameState } from '../../core/validation';
import { parseBayeLegacyPeriod } from './legacyScenario';

const sourceRoot = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  ?.BAYE_REFERENCE_SOURCE;

describe.skipIf(!sourceRoot)('local Baye period 1 reference', () => {
  it('loads the original period into a validated playable state', () => {
    const bytes = readFileSync(resolve(sourceRoot!, 'baye_c/src/dat.lib.orig'));
    const period = parseBayeLegacyPeriod(bytes, 1);

    expect(period.year).toBe(190);
    expect(period.cities).toHaveLength(38);
    expect(period.persons).toHaveLength(200);
    expect(period.rulerIndexes).toHaveLength(19);
    expect(period.cities[0]).toMatchObject({ name: '西凉', mapX: 1, mapY: 0 });
    expect(period.persons[0].name).toBe('董卓');
    expect(period.persons[1].name).toBe('曹操');

    const state = createLegacyPeriodGameState(bytes, 1);
    expect(Object.keys(state.cities)).toHaveLength(38);
    expect(Object.keys(state.officers)).toHaveLength(200);
    expect(Object.values(state.officers).filter((officer) => officer.status !== 'hidden')).toHaveLength(157);
    expect(Object.values(state.officers).filter((officer) => officer.status === 'hidden')).toHaveLength(43);
    expect(Object.values(state.officers).some((officer) => officer.status === 'free')).toBe(true);
    expect(state.factions[state.playerFactionId].name).toBe('曹操军');
    expect(state.cities['city-0'].neighbors).toContain('city-3');
  });

  it('keeps the original period valid through the playable strategy loop', () => {
    const bytes = readFileSync(resolve(sourceRoot!, 'baye_c/src/dat.lib.orig'));
    const state = createLegacyPeriodGameState(bytes, 1);
    const source = Object.values(state.cities).find((city) => {
      if (city.ownerId !== state.playerFactionId) return false;
      const hasOfficer = Object.values(state.officers).some(
        (officer) => officer.factionId === state.playerFactionId && officer.cityId === city.id,
      );
      const hasHostileNeighbor = city.neighbors.some(
        (neighborId) => state.cities[neighborId]?.ownerId !== state.playerFactionId,
      );
      return hasOfficer && hasHostileNeighbor;
    });
    expect(source).toBeDefined();

    const officers = Object.values(state.officers).filter(
      (candidate) => candidate.factionId === state.playerFactionId && candidate.cityId === source!.id,
    );
    expect(officers.length).toBeGreaterThanOrEqual(3);
    const targetId = source!.neighbors.find(
      (neighborId) => state.cities[neighborId]?.ownerId !== state.playerFactionId,
    )!;
    const developed = developFarming(state, { cityId: source!.id, officerId: officers[0].id });
    const recruited = recruitTroops(developed, { cityId: source!.id, officerId: officers[1].id, amount: 500 });
    const attackerTroops = Math.min(
      officers[2].troops + 500,
      calculateOfficerTroopCapacity(recruited.officers[officers[2].id]),
    );
    const distributed = distributeTroops(recruited, {
      cityId: source!.id,
      officerId: officers[2].id,
      targetTroops: attackerTroops,
    });
    const afterBattle = executeAttack(distributed, {
      sourceCityId: source!.id,
      targetCityId: targetId,
      officerIds: [officers[2].id],
      provisions: 100,
    });
    const nextMonth = advanceTurn(afterBattle);

    expect(nextMonth.calendar.month).toBe(2);
    expect(nextMonth.phase).toBe('player');
    expect(validateGameState(nextMonth)).toEqual([]);
  });
});
