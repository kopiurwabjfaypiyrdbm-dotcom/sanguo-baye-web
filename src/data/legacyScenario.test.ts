import { describe, expect, it } from 'vitest';
import type { BayeLegacyPeriod } from '../compat/baye/legacyScenario';
import { createGameStateFromLegacyPeriod, selectPlayerFaction } from './legacyScenario';

describe('legacy scenario game-state bridge', () => {
  it('creates playable and neutral factions while preserving city data', () => {
    const state = createGameStateFromLegacyPeriod(createPeriod());

    expect(state.calendar).toEqual({ year: 190, month: 1 });
    expect(state.cities['city-0']).toMatchObject({
      name: '西凉',
      ownerId: 'ruler-0',
      satrapOfficerId: 'officer-0',
      farmingLimit: 5000,
    });
    expect(state.officers['officer-0']).toMatchObject({ status: 'serving', factionId: 'ruler-0', cityId: 'city-0' });
    expect(state.officers['officer-1']).toMatchObject({ status: 'free', factionId: 'neutral', cityId: 'city-0' });
    expect(state.officers['officer-1'].troops).toBe(800);
    expect(state.cities['city-0'].food).toBe(900);
    expect(state.factions.neutral.isNeutral).toBe(true);
  });

  it('changes the player marker without mutating the source state', () => {
    const period = createPeriod();
    period.cities.push({
      ...period.cities[0],
      sourceIndex: 1,
      name: '洛阳',
      rulerIndex: 2,
      satrapIndex: 2,
      personIndexes: [2],
      neighborIndexes: [0],
      mapX: 4,
    });
    period.cities[0].neighborIndexes = [1];
    period.persons.push(person(2, '董卓', 2));
    period.rulerIndexes.push(2);

    const original = createGameStateFromLegacyPeriod(period, 0);
    const selected = selectPlayerFaction(original, 'ruler-2');
    expect(original.playerFactionId).toBe('ruler-0');
    expect(selected.playerFactionId).toBe('ruler-2');
    expect(selected.factions['ruler-2'].isPlayer).toBe(true);
    expect(selected.factions['ruler-0'].isPlayer).toBe(false);
    expect(selected.officers['officer-2'].troops).toBe(100);
    expect(selected.officers['officer-0'].troops).toBe(800);
    expect(selected.cities['city-0'].food).toBe(original.cities['city-0'].food + 1000);
  });

  it('preserves people outside city queues as hidden records', () => {
    const period = createPeriod();
    period.persons.push(person(2, '未登场武将', null));
    const state = createGameStateFromLegacyPeriod(period);

    expect(state.officers['officer-2']).toMatchObject({ status: 'hidden', factionId: 'neutral' });
    expect(state.officers['officer-2'].cityId).toBeUndefined();
  });

  it('does not allow ruler switching after a command has committed the campaign', () => {
    const period = createPeriod();
    period.cities.push({
      ...period.cities[0],
      sourceIndex: 1,
      name: '洛阳',
      rulerIndex: 2,
      satrapIndex: 2,
      personIndexes: [2],
      neighborIndexes: [0],
      mapX: 4,
    });
    period.cities[0].neighborIndexes = [1];
    period.persons.push(person(2, '董卓', 2));
    const state = createGameStateFromLegacyPeriod(period, 0);
    state.campaignStarted = true;

    expect(() => selectPlayerFaction(state, 'ruler-2')).toThrow('战役开始后不能切换君主');
  });
});

function createPeriod(): BayeLegacyPeriod {
  return {
    period: 1,
    year: 190,
    rulerIndexes: [0],
    persons: [person(0, '马腾', 0), person(1, '在野武将', null)],
    cities: [
      {
        sourceIndex: 0,
        name: '西凉',
        rulerIndex: 0,
        satrapIndex: 0,
        farmingLimit: 5000,
        farming: 1000,
        commerceLimit: 4000,
        commerce: 900,
        publicLoyalty: 70,
        disasterPrevention: 30,
        populationLimit: 800_000,
        population: 300_000,
        money: 500,
        food: 900,
        reserveTroops: 100,
        personQueueOffset: 0,
        personCount: 2,
        goodsQueueOffset: 0,
        goodsCount: 0,
        mapX: 1,
        mapY: 0,
        neighborIndexes: [],
        personIndexes: [0, 1],
        goodsIndexes: [],
      },
    ],
  };
}

function person(sourceIndex: number, name: string, rulerIndex: number | null) {
  return {
    sourceIndex,
    legacyIndexMarker: sourceIndex,
    name,
    rulerIndex,
    level: 1,
    force: 70,
    intelligence: 60,
    loyalty: 100,
    character: 3,
    experience: 0,
    stamina: 0,
    armsType: 0,
    troops: 0,
    equipmentIndexes: [null, null] as const,
    age: 35,
  };
}
