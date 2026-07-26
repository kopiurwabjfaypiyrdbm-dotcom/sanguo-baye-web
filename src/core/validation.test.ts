import { describe, expect, it } from 'vitest';
import { createSampleState } from './sampleState';
import { assertValidGameState, validateGameState } from './validation';

describe('game state validation', () => {
  it('accepts the starter scenario', () => {
    expect(validateGameState(createSampleState())).toEqual([]);
  });

  it('reports dangling and asymmetric roads', () => {
    const state = createSampleState();
    state.cities.chenliu.neighbors.push('missing-city');
    state.cities.luoyang.neighbors = state.cities.luoyang.neighbors.filter((id) => id !== 'chenliu');

    expect(validateGameState(state)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'cities.chenliu.neighbors', message: 'unknown city: missing-city' }),
        expect.objectContaining({ path: 'cities.chenliu.neighbors', message: 'road is not reciprocal: luoyang' }),
      ]),
    );
  });

  it('throws a concise error for an invalid reference', () => {
    const state = createSampleState();
    state.officers['cao-cao'].armsTypeId = 'unknown';

    expect(() => assertValidGameState(state)).toThrow(
      'Invalid game state at officers.cao-cao.armsTypeId: unknown arms type: unknown',
    );
  });

  it('rejects fractional combat values and serving officers stationed in enemy cities', () => {
    const fractional = createSampleState();
    fractional.officers['cao-cao'].troops = 100.5;
    expect(validateGameState(fractional)).toContainEqual(expect.objectContaining({
      path: 'officers.cao-cao.troops',
      message: 'must be an integer',
    }));

    const enemyCity = createSampleState();
    enemyCity.officers['cao-cao'].cityId = 'hanzhong';
    expect(validateGameState(enemyCity)).toContainEqual(expect.objectContaining({
      path: 'officers.cao-cao.cityId',
      message: 'serving officer must be stationed in a city owned by their faction',
    }));
  });

  it('rejects fractional strategic resources before they can enter intelligence snapshots', () => {
    const state = createSampleState();
    state.cities.hanzhong.food = 10.5;
    state.cities.hanzhong.publicLoyalty = 20.5;

    expect(validateGameState(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'cities.hanzhong.food', message: 'must be a safe integer' }),
      expect.objectContaining({ path: 'cities.hanzhong.publicLoyalty', message: 'must be a non-negative integer' }),
    ]));
  });

  it('rejects strategic resources beyond the safe integer range', () => {
    const state = createSampleState();
    state.cities.hanzhong.money = Number.MAX_SAFE_INTEGER + 1;

    expect(validateGameState(state)).toContainEqual(expect.objectContaining({
      path: 'cities.hanzhong.money',
      message: 'must be a safe integer',
    }));
  });

  it('rejects loyalty and disaster prevention above 100', () => {
    const state = createSampleState();
    state.cities.hanzhong.publicLoyalty = 101;
    state.cities.hanzhong.disasterPrevention = 101;

    expect(validateGameState(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'cities.hanzhong.publicLoyalty', message: 'must not exceed 100' }),
      expect.objectContaining({ path: 'cities.hanzhong.disasterPrevention', message: 'must not exceed 100' }),
    ]));
  });

  it('rejects officer loyalty and stamina above 100', () => {
    const state = createSampleState();
    state.officers['cao-cao'].loyalty = 101;
    state.officers['xun-yu'].stamina = 101;

    expect(validateGameState(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'officers.cao-cao.loyalty', message: 'must not exceed 100' }),
      expect.objectContaining({ path: 'officers.xun-yu.stamina', message: 'must not exceed 100' }),
    ]));
  });

  it('rejects an unknown city condition', () => {
    const state = createSampleState();
    (state.cities.luoyang as { condition?: string }).condition = 'earthquake';
    expect(validateGameState(state)).toContainEqual(expect.objectContaining({
      path: 'cities.luoyang.condition',
      message: 'must be a known city condition',
    }));
  });

  it('rejects premature or overdue annual appearance states', () => {
    const futureOfficer = createSampleState();
    futureOfficer.officers['chen-gong'].appearanceYear = 191;
    expect(validateGameState(futureOfficer)).toContainEqual(expect.objectContaining({
      path: 'officers.chen-gong.status',
      message: 'officer cannot appear before appearanceYear',
    }));

    const overdueOfficer = createSampleState();
    overdueOfficer.officers['chen-gong'] = {
      ...overdueOfficer.officers['chen-gong'],
      status: 'hidden',
      cityId: undefined,
      appearanceYear: 190,
    };
    expect(validateGameState(overdueOfficer)).toContainEqual(expect.objectContaining({
      path: 'officers.chen-gong.status',
      message: 'hidden officer is overdue for appearance',
    }));

    const prematureItem = createSampleState();
    prematureItem.items['sunzi-manual'].appearanceYear = 191;
    prematureItem.items['sunzi-manual'].appearanceCityId = 'luoyang';
    expect(validateGameState(prematureItem)).toContainEqual(expect.objectContaining({
      path: 'items.sunzi-manual.appearanceYear',
      message: 'item cannot be placed before appearanceYear',
    }));
  });

  it('rejects unknown or over-capacity equipment references', () => {
    const unknown = createSampleState();
    unknown.officers['cao-cao'].equipmentItemIds = ['missing-item'];
    expect(validateGameState(unknown)).toContainEqual(expect.objectContaining({
      path: 'officers.cao-cao.equipmentItemIds',
      message: 'unknown item: missing-item',
    }));

    const overCapacity = createSampleState();
    overCapacity.officers['cao-cao'].equipmentItemIds = ['qinglong-blade', 'sunzi-manual', 'red-hare'];
    expect(validateGameState(overCapacity)).toContainEqual(expect.objectContaining({
      path: 'officers.cao-cao.equipmentItemIds',
      message: 'must contain at most 2 items',
    }));
  });

  it('rejects duplicate item ownership across cities and officers', () => {
    const state = createSampleState();
    state.officers['xiahou-dun'].equipmentItemIds = ['sunzi-manual'];

    expect(validateGameState(state)).toContainEqual({
      path: 'officers.xiahou-dun.equipmentItemIds',
      message: 'item is already placed at cities.luoyang.itemIds: sunzi-manual',
    });
  });

  it('rejects malformed dead officers and succession decisions', () => {
    const state = createSampleState();
    state.officers['cao-cao'] = {
      ...state.officers['cao-cao'],
      status: 'dead',
      factionId: 'neutral',
      cityId: undefined,
      troops: 0,
      stamina: 0,
      equipmentItemIds: [],
      death: { cause: 'natural-death', turn: 1, year: 190, month: 1 },
    };
    state.phase = 'succession';
    state.pendingSuccession = {
      version: 1,
      factionId: 'cao-cao',
      formerRulerOfficerId: 'cao-cao',
      candidateOfficerIds: ['missing-officer'],
      reason: 'natural-death',
      createdTurn: 1,
      createdYear: 190,
      createdMonth: 1,
      resumePhase: 'player',
      resumeActiveFactionId: 'cao-cao',
    };

    expect(validateGameState(state)).toContainEqual({
      path: 'pendingSuccession.candidateOfficerIds',
      message: 'invalid successor candidate: missing-officer',
    });
  });

  it('rejects armed captives and captives held by their former faction', () => {
    const state = createSampleState();
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'captive',
      cityId: 'luoyang',
      captorFactionId: 'cao-cao',
      formerFactionId: 'cao-cao',
      troops: 100,
      stamina: 5,
    };

    expect(validateGameState(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'officers.chen-gong.troops', message: 'captive officer must have zero troops' }),
      expect.objectContaining({ path: 'officers.chen-gong.stamina', message: 'captive officer must have zero stamina' }),
      expect.objectContaining({
        path: 'officers.chen-gong.formerFactionId', message: 'captive officer cannot be held by their former faction',
      }),
    ]));
  });

  it('rejects out-of-range level and experience values', () => {
    const state = createSampleState();
    state.officers['cao-cao'].level = 21;
    state.officers['cao-cao'].experience = 100;

    expect(validateGameState(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'officers.cao-cao.level', message: 'must not exceed 20' }),
      expect.objectContaining({ path: 'officers.cao-cao.experience', message: 'must be below 100' }),
    ]));
  });

  it('rejects intelligence reports with unknown cities or future observation turns', () => {
    const state = createSampleState();
    state.intelReports.missing = {
      cityId: 'missing',
      observedTurn: state.turn + 1,
      observedYear: 191,
      observedMonth: 1,
      population: 1,
      money: 1,
      food: 1,
      reserveTroops: 1,
      farming: 1,
      commerce: 1,
      defense: 1,
      officerCount: 1,
      totalTroops: 1,
    };

    expect(validateGameState(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'intelReports.missing.cityId', message: 'unknown city: missing' }),
      expect.objectContaining({
        path: 'intelReports.missing.observedTurn', message: 'must not be later than the current turn',
      }),
      expect.objectContaining({
        path: 'intelReports.missing.observedYear',
        message: 'observation date must not be later than the current calendar',
      }),
    ]));
  });

  it('rejects corrupt diplomacy executors and intelligence officer snapshots', () => {
    const state = createSampleState();
    state.diplomaticOrders['diplomatic-order-1'] = {
      id: 'diplomatic-order-1',
      kind: 'alienate',
      factionId: 'cao-cao',
      officerId: 'xun-yu',
      sourceCityId: 'xuchang',
      targetOfficerId: 'zhang-fei',
      targetFactionId: 'liu-bei',
      targetCityId: 'jiangzhou',
      createdTurn: state.turn,
      createdYear: state.calendar.year,
      createdMonth: state.calendar.month,
      durationMonths: 1,
      remainingMonths: 1,
      moneyCost: 50,
    };
    state.nextDiplomaticOrderSerial = 2;
    state.officers['xun-yu'] = {
      ...state.officers['xun-yu'],
      factionId: 'liu-bei',
      cityId: undefined,
    };
    state.intelReports.jiangzhou = {
      cityId: 'jiangzhou',
      observedTurn: state.turn,
      observedYear: state.calendar.year,
      observedMonth: state.calendar.month,
      population: 1,
      money: 1,
      food: 1,
      reserveTroops: 1,
      farming: 1,
      commerce: 1,
      defense: 1,
      officerIds: ['zhang-fei', 'missing-officer'],
      officerCount: 1,
      totalTroops: 1,
    };

    expect(validateGameState(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'officers.xun-yu.factionId',
        message: 'must match the active campaign order faction',
      }),
      expect.objectContaining({
        path: 'intelReports.jiangzhou.officerIds',
        message: 'unknown officer: missing-officer',
      }),
      expect.objectContaining({
        path: 'intelReports.jiangzhou.officerIds',
        message: 'must agree with officerCount',
      }),
    ]));
  });

  it('rejects diplomatic serials outside the safe integer range', () => {
    const state = createSampleState();
    state.nextDiplomaticOrderSerial = Number.MAX_SAFE_INTEGER + 1;

    expect(validateGameState(state)).toContainEqual(expect.objectContaining({
      path: 'nextDiplomaticOrderSerial',
      message: 'must be a positive safe integer',
    }));
  });
});
