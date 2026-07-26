import { describe, expect, it } from 'vitest';
import {
  advanceDiplomaticOrders,
  getDiplomacyTargets,
  getFactionDiplomaticOrders,
  getDiplomaticOrderAvailability,
  issueDiplomaticOrder,
} from './diplomaticOrders';
import { createSampleState } from './sampleState';
import { parseSave, serializeSave } from './saveGame';
import type { GameState } from './types';
import { validateGameState } from './validation';
import { issueMoveOrder } from './strategicOrders';
import { updateCitySatraps } from './administration';

describe('diplomatic orders', () => {
  it('does not leak hidden loyalty through the player target ordering', () => {
    const state = createSampleState();
    state.officers['zhuge-liang'].cityId = 'jiangzhou';
    revealCity(state, 'jiangzhou');
    const original = getDiplomacyTargets(state, 'alienate').map((officer) => officer.id);
    expect(original).toHaveLength(2);
    state.officers['zhuge-liang'].loyalty = 0;
    state.officers['zhang-fei'].loyalty = 100;

    expect(getDiplomacyTargets(state, 'alienate').map((officer) => officer.id)).toEqual(original);
  });

  it('sorts active faction missions by numeric serial and disables an exhausted serial', () => {
    const state = createSampleState();
    state.diplomaticOrders = {
      'diplomatic-order-10': createPendingOrder('diplomatic-order-10', 'cao-cao'),
      'diplomatic-order-9': createPendingOrder('diplomatic-order-9', 'xun-yu'),
    };
    state.nextDiplomaticOrderSerial = Number.MAX_SAFE_INTEGER;
    state.officers['cao-cao'].cityId = undefined;
    state.officers['xun-yu'].cityId = undefined;

    expect(getFactionDiplomaticOrders(state, 'cao-cao').map((order) => order.id)).toEqual([
      'diplomatic-order-9',
      'diplomatic-order-10',
    ]);
    expect(getDiplomaticOrderAvailability(state, {
      kind: 'alienate',
      sourceCityId: 'luoyang',
      officerId: 'xiahou-dun',
      targetOfficerId: 'zhang-fei',
    })).toEqual({ allowed: false, reason: '谋略命令序号已经耗尽' });
  });

  it('requires current player intelligence and resolves alienate after one month', () => {
    const state = createSampleState();
    state.rngSeed = 1;
    state.officers['zhang-fei'].loyalty = 4;
    state.officers['zhang-fei'].character = 0;
    const input = {
      kind: 'alienate' as const,
      sourceCityId: 'xuchang',
      officerId: 'xun-yu',
      targetOfficerId: 'zhang-fei',
    };

    expect(getDiplomaticOrderAvailability(state, input)).toMatchObject({ allowed: false });
    revealCity(state, 'jiangzhou');
    const issued = issueDiplomaticOrder(state, input);

    expect(issued.cities.xuchang.money).toBe(state.cities.xuchang.money - 50);
    expect(issued.officers['xun-yu']).toMatchObject({ cityId: undefined, stamina: 96 });
    expect(parseSave(serializeSave(issued)).state).toEqual(issued);

    const settled = nextMonth(issued);
    expect(settled.officers['zhang-fei'].loyalty).toBe(0);
    expect(settled.officers['xun-yu'].cityId).toBe('xuchang');
    expect(settled.rngSeed).toBe(2165703038);
    expect(validateGameState(settled)).toEqual([]);
  });

  it('canvasses an ordinary enemy officer into the source city', () => {
    const state = createSampleState();
    state.rngSeed = 2;
    state.officers['zhang-fei'].loyalty = 0;
    state.officers['zhang-fei'].character = 1;
    revealCity(state, 'jiangzhou');

    const settled = nextMonth(issueDiplomaticOrder(state, {
      kind: 'canvass',
      sourceCityId: 'xuchang',
      officerId: 'xun-yu',
      targetOfficerId: 'zhang-fei',
    }));

    expect(settled.officers['zhang-fei']).toMatchObject({
      factionId: 'cao-cao',
      cityId: 'xuchang',
      loyalty: 69,
    });
    expect(settled.rngSeed).toBe(3079534013);
  });

  it('lets an enemy non-ruler satrap establish a legal new faction', () => {
    const state = createSampleState();
    state.rngSeed = 1;
    state.officers['zhang-fei'].loyalty = 0;
    state.officers['zhang-fei'].character = 3;
    revealCity(state, 'jiangzhou');

    const settled = nextMonth(issueDiplomaticOrder(state, {
      kind: 'counterespionage',
      sourceCityId: 'xuchang',
      officerId: 'xun-yu',
      targetOfficerId: 'zhang-fei',
    }));

    expect(settled.cities.jiangzhou.ownerId).toBe('rebel-zhang-fei');
    expect(settled.factions['rebel-zhang-fei']).toMatchObject({
      rulerOfficerId: 'zhang-fei',
      isPlayer: false,
    });
    expect(settled.officers['zhang-fei'].factionId).toBe('rebel-zhang-fei');
    expect(settled.factionOrder).toContain('rebel-zhang-fei');
    expect(settled.logs.at(-1)?.message).toContain('策反成功');
    expect(validateGameState(settled)).toEqual([]);
  });

  it('liberates captives of a reused rebel faction when counterespionage succeeds again', () => {
    const state = createSampleState();
    state.rngSeed = 1;
    state.factions['rebel-zhang-fei'] = {
      id: 'rebel-zhang-fei',
      name: '张飞军',
      rulerOfficerId: 'zhang-fei',
      color: '#123456',
      isPlayer: false,
      aiProfile: 'balanced',
    };
    state.factionOrder.push('rebel-zhang-fei');
    state.officers['zhang-fei'].loyalty = 0;
    state.officers['zhang-fei'].character = 3;
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'captive',
      factionId: 'neutral',
      cityId: 'jiangzhou',
      captorFactionId: 'liu-bei',
      formerFactionId: 'rebel-zhang-fei',
      troops: 0,
      stamina: 0,
    };
    revealCity(state, 'jiangzhou');

    const settled = nextMonth(issueDiplomaticOrder(state, {
      kind: 'counterespionage',
      sourceCityId: 'xuchang',
      officerId: 'xun-yu',
      targetOfficerId: 'zhang-fei',
    }));

    expect(settled.officers['chen-gong']).toMatchObject({
      status: 'serving',
      factionId: 'rebel-zhang-fei',
      cityId: 'jiangzhou',
      captorFactionId: undefined,
      formerFactionId: undefined,
    });
    expect(validateGameState(settled)).toEqual([]);
  });

  it('does not offer counterespionage when the old ruler shares the satrap city', () => {
    const state = createSampleState();
    state.officers['zhuge-liang'].cityId = 'chengdu';
    state.cities.chengdu.satrapOfficerId = 'zhuge-liang';
    revealCity(state, 'chengdu');

    expect(getDiplomacyTargets(state, 'counterespionage')).toEqual([]);
    expect(getDiplomaticOrderAvailability(state, {
      kind: 'counterespionage',
      sourceCityId: 'xuchang',
      officerId: 'xun-yu',
      targetOfficerId: 'zhuge-liang',
    })).toMatchObject({ allowed: false });
  });

  it('absorbs a dominated enemy faction without leaving orphan officers', () => {
    let state = createSampleState();
    state.rngSeed = 8;
    state.phase = 'ai';
    state.activeFactionId = 'sun-quan';
    state = issueMoveOrder(state, {
      sourceCityId: 'wuchang',
      targetCityId: 'jianye',
      officerId: 'zhou-yu',
    });
    const sunMove = Object.values(state.strategicOrders)[0];
    sunMove.routeCityIds = ['wuchang', 'shouchun', 'jianye'];
    sunMove.durationMonths = 2;
    sunMove.remainingMonths = 2;
    state.phase = 'player';
    state.activeFactionId = 'cao-cao';
    for (const cityId of ['jiangling', 'shouchun', 'wuchang']) {
      state.cities[cityId].ownerId = 'cao-cao';
    }
    for (const officerId of ['lu-xun', 'taishi-ci']) {
      state.officers[officerId].cityId = 'jianye';
    }
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'captive',
      factionId: 'neutral',
      cityId: 'jianye',
      captorFactionId: 'sun-quan',
      formerFactionId: 'cao-cao',
      troops: 0,
      stamina: 0,
    };
    state = updateCitySatraps(state);
    revealCity(state, 'jianye');

    const settled = nextMonth(issueDiplomaticOrder(state, {
      kind: 'induce',
      sourceCityId: 'xuchang',
      officerId: 'xun-yu',
      targetOfficerId: 'sun-quan',
    }));

    expect(settled.cities.jianye.ownerId).toBe('cao-cao');
    expect(['sun-quan', 'lu-xun', 'taishi-ci'].every(
      (officerId) => settled.officers[officerId].factionId === 'cao-cao',
    )).toBe(true);
    expect(settled.officers['zhou-yu']).toMatchObject({ status: 'free', factionId: 'neutral' });
    expect(settled.officers['chen-gong']).toMatchObject({
      status: 'serving',
      factionId: 'cao-cao',
      cityId: 'jianye',
      captorFactionId: undefined,
      formerFactionId: undefined,
    });
    expect(settled.strategicOrders).toEqual({});
    expect(Object.values(settled.cities).some((city) => city.ownerId === 'sun-quan')).toBe(false);
    expect(validateGameState(settled)).toEqual([]);
  });

  it('returns safely without consuming randomness when the target changes faction', () => {
    const state = createSampleState();
    state.rngSeed = 1234;
    revealCity(state, 'jiangzhou');
    const issued = issueDiplomaticOrder(state, {
      kind: 'alienate',
      sourceCityId: 'xuchang',
      officerId: 'xun-yu',
      targetOfficerId: 'zhang-fei',
    });
    issued.officers['zhang-fei'] = {
      ...issued.officers['zhang-fei'],
      factionId: 'cao-cao',
      cityId: 'xuchang',
    };

    const settled = nextMonth(issued);

    expect(settled.rngSeed).toBe(1234);
    expect(settled.officers['xun-yu'].cityId).toBe('xuchang');
    expect(settled.logs.at(-1)?.message).toContain('目标已经失效');
  });

  it('invalidates a stale mission when the observed target moves to another city', () => {
    const state = createSampleState();
    state.rngSeed = 1234;
    revealCity(state, 'jiangzhou');
    const issued = issueDiplomaticOrder(state, {
      kind: 'alienate',
      sourceCityId: 'xuchang',
      officerId: 'xun-yu',
      targetOfficerId: 'zhang-fei',
    });
    issued.officers['zhang-fei'] = { ...issued.officers['zhang-fei'], cityId: 'hanzhong' };

    const settled = nextMonth(issued);

    expect(settled.rngSeed).toBe(1234);
    expect(settled.officers['zhang-fei'].loyalty).toBe(state.officers['zhang-fei'].loyalty);
    expect(settled.logs.at(-1)?.message).toContain('目标已经失效');
  });

  it('records a failed attempt deterministically and replays identically after reload', () => {
    const state = createSampleState();
    state.rngSeed = 1;
    state.officers['zhang-fei'].loyalty = 100;
    revealCity(state, 'jiangzhou');
    const issued = issueDiplomaticOrder(state, {
      kind: 'alienate',
      sourceCityId: 'xuchang',
      officerId: 'xun-yu',
      targetOfficerId: 'zhang-fei',
    });

    const uninterrupted = nextMonth(issued);
    const reloaded = nextMonth(parseSave(serializeSave(issued)).state);

    expect(reloaded).toEqual(uninterrupted);
    expect(uninterrupted.officers['zhang-fei'].loyalty).toBe(100);
    expect(uninterrupted.rngSeed).toBe(1586005467);
    expect(uninterrupted.logs.at(-1)?.message).toContain('失败');
  });

  it('resolves serial 9 before serial 10 and lets equipment intelligence affect the roll', () => {
    let state = createSampleState();
    state.nextDiplomaticOrderSerial = 9;
    state.rngSeed = 1;
    state.items['sunzi-manual'].intelligenceBonus = 50;
    state.cities.luoyang.itemIds = [];
    state.officers['xun-yu'] = {
      ...state.officers['xun-yu'],
      intelligence: 30,
      equipmentItemIds: ['sunzi-manual'],
    };
    state.officers['zhang-fei'] = {
      ...state.officers['zhang-fei'],
      intelligence: 80,
      loyalty: 4,
      character: 0,
    };
    state.officers['zhuge-liang'] = {
      ...state.officers['zhuge-liang'],
      cityId: 'jiangzhou',
      loyalty: 100,
    };
    revealCity(state, 'jiangzhou');
    state = issueDiplomaticOrder(state, {
      kind: 'alienate',
      sourceCityId: 'xuchang',
      officerId: 'xun-yu',
      targetOfficerId: 'zhang-fei',
    });
    state = issueDiplomaticOrder(state, {
      kind: 'alienate',
      sourceCityId: 'luoyang',
      officerId: 'cao-cao',
      targetOfficerId: 'zhuge-liang',
    });

    const settled = nextMonth(state);
    const resultMessages = settled.logs.slice(-2).map((log) => log.message);

    expect(Object.keys(state.diplomaticOrders)).toEqual(['diplomatic-order-9', 'diplomatic-order-10']);
    expect(resultMessages[0]).toContain('张飞');
    expect(resultMessages[1]).toContain('诸葛亮');
    expect(settled.officers['zhang-fei'].loyalty).toBe(0);
  });
});

function nextMonth(state: GameState): GameState {
  return advanceDiplomaticOrders({
    ...state,
    turn: state.turn + 1,
    calendar: { year: state.calendar.year, month: state.calendar.month + 1 },
    actedOfficerIds: [],
  });
}

function revealCity(state: GameState, cityId: string): void {
  const city = state.cities[cityId];
  const stationed = Object.values(state.officers).filter(
    (officer) => officer.status === 'serving' && officer.cityId === city.id,
  );
  state.intelReports[cityId] = {
    cityId,
    observedTurn: state.turn,
    observedYear: state.calendar.year,
    observedMonth: state.calendar.month,
    population: city.population,
    money: city.money,
    food: city.food,
    reserveTroops: city.reserveTroops,
    farming: city.farming,
    commerce: city.commerce,
    defense: city.defense,
    publicLoyalty: city.publicLoyalty,
    satrapName: city.satrapOfficerId ? state.officers[city.satrapOfficerId]?.name : undefined,
    officerIds: stationed.map((officer) => officer.id).sort((left, right) => left.localeCompare(right)),
    officerCount: stationed.length,
    totalTroops: stationed.reduce((sum, officer) => sum + officer.troops, 0),
  };
}

function createPendingOrder(id: string, officerId: string): GameState['diplomaticOrders'][string] {
  return {
    id,
    kind: 'alienate',
    factionId: 'cao-cao',
    officerId,
    sourceCityId: officerId === 'cao-cao' ? 'luoyang' : 'xuchang',
    targetOfficerId: 'zhang-fei',
    targetFactionId: 'liu-bei',
    targetCityId: 'jiangzhou',
    createdTurn: 1,
    createdYear: 190,
    createdMonth: 1,
    durationMonths: 1,
    remainingMonths: 1,
    moneyCost: 50,
  };
}
