import { describe, expect, it } from 'vitest';
import { applyBattleResult, estimateBattle, resolveBattle } from './battle';
import { updateCitySatraps } from './administration';
import { createSampleState } from './sampleState';
import { validateGameState } from './validation';

describe('automatic battle', () => {
  it('rejects attacks against non-adjacent cities', () => {
    const state = createSampleState();

    expect(() =>
      resolveBattle(state, { sourceCityId: 'luoyang', targetCityId: 'chengdu', officerIds: ['cao-cao'], provisions: 100 }),
    ).toThrow('Cities are not adjacent');
  });

  it('enforces the ten-officer battle limit in the core', () => {
    const state = createSampleState();
    state.officers['cao-cao'].cityId = 'chang-an';
    const attackerIds: string[] = [];
    for (let index = 0; index < 11; index += 1) {
      const id = `attacker-${index}`;
      attackerIds.push(id);
      state.officers[id] = { ...state.officers['cao-cao'], id, name: id };
    }

    expect(() => resolveBattle(state, {
      sourceCityId: 'chang-an', targetCityId: 'hanzhong', officerIds: attackerIds, provisions: 100,
    })).toThrow('At most 10 attacking officers');

    for (let index = 0; index < 11; index += 1) {
      const id = `defender-${index}`;
      state.officers[id] = { ...state.officers['guan-yu'], id, name: id, cityId: 'hanzhong' };
    }
    const result = resolveBattle(state, {
      sourceCityId: 'chang-an', targetCityId: 'hanzhong', officerIds: ['cao-cao'], provisions: 100,
    });
    expect(result.defenderOfficerIds).toHaveLength(10);
  });

  it('does not create captives for a neutral city that repels an attack', () => {
    let state = createSampleState();
    for (const officer of Object.values(state.officers)) {
      if (officer.cityId === 'hanzhong') officer.cityId = 'chengdu';
    }
    state.cities.hanzhong.ownerId = 'neutral';
    state.cities.hanzhong.reserveTroops = 1_000_000;
    state.officers['xiahou-dun'].cityId = 'chang-an';
    state.officers['xiahou-dun'].troops = 1;
    state = updateCitySatraps(state);

    const result = resolveBattle(state, {
      sourceCityId: 'chang-an', targetCityId: 'hanzhong', officerIds: ['xiahou-dun'], provisions: 100,
    });
    const next = applyBattleResult(state, result);

    expect(result.cityCaptured).toBe(false);
    expect(next.officers['xiahou-dun']).toMatchObject({
      status: 'serving', factionId: 'cao-cao', cityId: 'chang-an',
    });
    expect(validateGameState(next)).toEqual([]);
  });

  it('is deterministic and does not mutate the source state', () => {
    const state = createSampleState();
    const snapshot = structuredClone(state);
    const order = { sourceCityId: 'chang-an', targetCityId: 'hanzhong', officerIds: ['cao-cao'], provisions: 100 };
    state.officers['cao-cao'].cityId = 'chang-an';
    const preparedSnapshot = structuredClone(state);

    expect(resolveBattle(state, order)).toEqual(resolveBattle(state, order));
    expect(state).toEqual(preparedSnapshot);
    expect(snapshot.cities).toEqual(state.cities);
  });

  it('rewards leadership and city defense monotonically', () => {
    const state = createSampleState();
    state.officers['cao-cao'].cityId = 'chang-an';
    const order = { sourceCityId: 'chang-an', targetCityId: 'hanzhong', officerIds: ['cao-cao'], provisions: 100 };
    const baseline = estimateBattle(state, order);
    state.officers['cao-cao'].leadership += 10;
    const betterLeader = estimateBattle(state, order);
    state.cities.hanzhong.defense += 100;
    const strongerDefense = estimateBattle(state, order);

    expect(betterLeader.attacker).toBeGreaterThan(baseline.attacker);
    expect(strongerDefense.defender).toBeGreaterThan(betterLeader.defender);
  });

  it('applies casualties, advances the seed, and captures a defeated city', () => {
    const state = createSampleState();
    state.officers['cao-cao'].cityId = 'chang-an';
    state.officers['cao-cao'].troops = 100_000;
    state.cities.hanzhong.reserveTroops = 0;
    state.officers['guan-yu'].troops = 1;
    const result = resolveBattle(state, {
      sourceCityId: 'chang-an',
      targetCityId: 'hanzhong',
      officerIds: ['cao-cao'],
      provisions: 100,
    });
    const next = applyBattleResult(state, result);

    expect(result.winner).toBe('attacker');
    expect(next.cities.hanzhong.ownerId).toBe('cao-cao');
    expect(next.officers['cao-cao'].cityId).toBe('hanzhong');
    expect(next.officers['guan-yu'].cityId).toBe('chengdu');
    expect(next.cities.hanzhong.satrapOfficerId).toBe('cao-cao');
    expect(next.officers['cao-cao'].troops).toBeLessThan(100_000);
    expect(next.cities['chang-an'].food).toBe(state.cities['chang-an'].food - 100);
    expect(next.actedOfficerIds).toContain('cao-cao');
    expect(next.rngSeed).not.toBe(result.nextRngSeed);
    expect(next).toEqual(applyBattleResult(structuredClone(state), result));
    expect(next.logs.at(-1)?.kind).toBe('battle');
    expect(validateGameState(next)).toEqual([]);
  });

  it('retreats zero-troop stationed officers even though they did not join automatic combat', () => {
    const state = createSampleState();
    state.officers['cao-cao'].cityId = 'chang-an';
    state.officers['cao-cao'].troops = 100_000;
    state.officers['liu-bei'].cityId = 'hanzhong';
    state.officers['liu-bei'].troops = 0;
    state.officers['guan-yu'].troops = 1;
    state.cities.hanzhong.reserveTroops = 0;
    const result = resolveBattle(state, {
      sourceCityId: 'chang-an',
      targetCityId: 'hanzhong',
      officerIds: ['cao-cao'],
      provisions: 100,
    });
    const next = applyBattleResult(state, result);

    expect(result.defenderOfficerIds).not.toContain('liu-bei');
    expect(next.officers['liu-bei'].cityId).toBe('chengdu');
    expect(next.officers['liu-bei'].status).toBe('serving');
    expect(validateGameState(next)).toEqual([]);
  });

  it('rejects applying the same battle result twice', () => {
    const state = createSampleState();
    state.officers['cao-cao'].cityId = 'chang-an';
    const result = resolveBattle(state, {
      sourceCityId: 'chang-an',
      targetCityId: 'hanzhong',
      officerIds: ['cao-cao'],
      provisions: 100,
    });
    const next = applyBattleResult(state, result);

    expect(() => applyBattleResult(next, result)).toThrow('Battle result does not match the current state');
  });

  it('can hold a defeated non-ruler attacker captive in the defending city', () => {
    const state = createSampleState();
    state.officers['xiahou-dun'].cityId = 'chang-an';
    state.officers['xiahou-dun'].troops = 1;
    state.officers['xiahou-dun'].intelligence = 0;
    state.cities.hanzhong.reserveTroops = 100_000;
    const result = resolveBattle(state, {
      sourceCityId: 'chang-an', targetCityId: 'hanzhong', officerIds: ['xiahou-dun'], provisions: 100,
    });
    const next = applyBattleResult(state, result);

    expect(result.winner).toBe('defender');
    expect(next.officers['xiahou-dun']).toMatchObject({
      status: 'captive',
      factionId: 'neutral',
      captorFactionId: 'liu-bei',
      formerFactionId: 'cao-cao',
      cityId: 'hanzhong',
      troops: 0,
    });
    expect(validateGameState(next)).toEqual([]);
  });

  it('rescues a faction former officer when their prison city is recaptured', () => {
    const state = createSampleState();
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'captive',
      factionId: 'neutral',
      cityId: 'hanzhong',
      captorFactionId: 'liu-bei',
      formerFactionId: 'cao-cao',
      troops: 0,
      stamina: 0,
    };
    state.officers['cao-cao'].cityId = 'chang-an';
    state.officers['cao-cao'].troops = 100_000;
    state.cities.hanzhong.reserveTroops = 0;
    state.officers['guan-yu'].troops = 1;
    const next = applyBattleResult(state, resolveBattle(state, {
      sourceCityId: 'chang-an', targetCityId: 'hanzhong', officerIds: ['cao-cao'], provisions: 100,
    }));

    expect(next.cities.hanzhong.ownerId).toBe('cao-cao');
    expect(next.officers['chen-gong']).toMatchObject({
      status: 'serving', factionId: 'cao-cao', cityId: 'hanzhong', troops: 0,
    });
    expect(next.officers['chen-gong'].captorFactionId).toBeUndefined();
    expect(next.logs.some((log) => log.message.includes('重归'))).toBe(true);
    expect(validateGameState(next)).toEqual([]);
  });

  it('transfers a third-faction captive when their prison city changes hands', () => {
    const state = createSampleState();
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'captive',
      factionId: 'neutral',
      cityId: 'hanzhong',
      captorFactionId: 'liu-bei',
      formerFactionId: 'sun-quan',
      troops: 0,
      stamina: 0,
    };
    state.officers['cao-cao'].cityId = 'chang-an';
    state.officers['cao-cao'].troops = 100_000;
    state.cities.hanzhong.reserveTroops = 0;
    state.officers['guan-yu'].troops = 1;

    const next = applyBattleResult(state, resolveBattle(state, {
      sourceCityId: 'chang-an', targetCityId: 'hanzhong', officerIds: ['cao-cao'], provisions: 100,
    }));

    expect(next.officers['chen-gong']).toMatchObject({
      status: 'captive', captorFactionId: 'cao-cao', formerFactionId: 'sun-quan', cityId: 'hanzhong',
    });
    expect(validateGameState(next)).toEqual([]);
  });

  it('turns all serving officers free when their faction loses its last city', () => {
    let state = createSampleState();
    for (const city of Object.values(state.cities)) {
      if (city.ownerId === 'liu-bei' && city.id !== 'hanzhong') city.ownerId = 'neutral';
    }
    for (const officer of Object.values(state.officers)) {
      if (officer.factionId === 'liu-bei') officer.cityId = 'hanzhong';
    }
    state.officers['cao-cao'].cityId = 'chang-an';
    state.officers['cao-cao'].troops = 100_000;
    state.cities.hanzhong.reserveTroops = 0;
    for (const officer of Object.values(state.officers)) {
      if (officer.factionId === 'liu-bei') officer.troops = 1;
    }
    state = updateCitySatraps(state);

    const result = resolveBattle(state, {
      sourceCityId: 'chang-an',
      targetCityId: 'hanzhong',
      officerIds: ['cao-cao'],
      provisions: 100,
    });
    const next = applyBattleResult(state, result);
    const formerLiuOfficers = Object.values(next.officers).filter((officer) =>
      ['liu-bei', 'guan-yu', 'zhuge-liang', 'zhang-fei'].includes(officer.id),
    );

    expect(result.cityCaptured).toBe(true);
    expect(formerLiuOfficers).toHaveLength(4);
    expect(formerLiuOfficers.every((officer) =>
      ['free', 'captive'].includes(officer.status) && officer.factionId === 'neutral' && officer.troops === 0,
    )).toBe(true);
    expect(formerLiuOfficers.some((officer) =>
      officer.status === 'captive' && officer.captorFactionId === 'cao-cao' && officer.cityId === 'hanzhong',
    )).toBe(true);
    expect(next.logs.some((log) => log.message.includes('失去最后一座城池'))).toBe(true);
    expect(validateGameState(next)).toEqual([]);
  });
});
