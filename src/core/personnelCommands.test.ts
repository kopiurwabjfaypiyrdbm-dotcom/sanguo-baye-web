import { describe, expect, it } from 'vitest';
import { createSampleState } from './sampleState';
import {
  RECRUIT_OFFICER_STAMINA_COST,
  REWARD_LOYALTY_GAIN,
  REWARD_MONEY_COST,
  SEARCH_STAMINA_COST,
  appointSatrap,
  giveItemToOfficer,
  moveOfficer,
  recruitFreeOfficer,
  rewardOfficer,
  searchCity,
  unequipOfficerItem,
} from './personnelCommands';
import { getCityFreeOfficers, getCityOfficers } from './selectors';
import { validateGameState } from './validation';
import { beginAiPhase, finishTurn } from './turn';

describe('personnel commands', () => {
  it('keeps free officers out of the serving roster', () => {
    const state = createSampleState();

    expect(getCityOfficers(state, 'chenliu').map((officer) => officer.name)).toEqual(['张辽']);
    expect(getCityFreeOfficers(state, 'chenliu').map((officer) => officer.name)).toEqual(['陈宫']);
  });

  it('uses an original-shaped search result and can recruit a free officer', () => {
    const state = createSampleState();
    state.rngSeed = 43;
    const next = searchCity(state, { cityId: 'chenliu', officerId: 'zhang-liao' });

    expect(next.officers['chen-gong']).toMatchObject({
      status: 'serving',
      factionId: 'cao-cao',
      cityId: 'chenliu',
    });
    expect(next.officers['zhang-liao'].stamina).toBe(100 - SEARCH_STAMINA_COST);
    expect(next.actedOfficerIds).toContain('zhang-liao');
    expect(next.logs.at(-1)?.message).toContain('成功请其出仕');
    expect(validateGameState(next)).toEqual([]);
  });

  it('can find city resources and rejects an officer that already acted', () => {
    const state = createSampleState();
    state.rngSeed = 682;
    const searched = searchCity(state, { cityId: 'chenliu', officerId: 'zhang-liao' });

    expect(searched.cities.chenliu.money + searched.cities.chenliu.food)
      .toBeGreaterThan(state.cities.chenliu.money + state.cities.chenliu.food);
    expect(() => searchCity(searched, { cityId: 'chenliu', officerId: 'zhang-liao' }))
      .toThrow('本月已经执行过命令');
  });

  it('does not truncate transport-created stockpiles above the soft resource cap', () => {
    const state = createSampleState();
    state.rngSeed = 682;
    state.cities.chenliu.money = 40_000;
    state.cities.chenliu.food = 40_000;

    const searched = searchCity(state, { cityId: 'chenliu', officerId: 'zhang-liao' });

    expect(searched.cities.chenliu.money).toBe(40_000);
    expect(searched.cities.chenliu.food).toBe(40_000);
    expect(validateGameState(searched)).toEqual([]);
  });

  it('reveals a hidden city item through the original-shaped odd search branch', () => {
    const state = createSampleState();
    state.rngSeed = 42;
    const next = searchCity(state, { cityId: 'chenliu', officerId: 'zhang-liao' });

    expect(next.cities.chenliu.hiddenItemIds).toEqual([]);
    expect(next.cities.chenliu.itemIds).toContain('red-hare');
    expect(next.logs.at(-1)?.message).toContain('搜得赤兔');
    expect(validateGameState(next)).toEqual([]);
  });

  it('recruits a previously discovered free officer with deterministic random state', () => {
    const state = createSampleState();
    state.discoveredOfficerIds = ['chen-gong'];
    state.rngSeed = 43;
    const next = recruitFreeOfficer(state, {
      cityId: 'chenliu',
      executorOfficerId: 'zhang-liao',
      targetOfficerId: 'chen-gong',
    });

    expect(next.officers['chen-gong'].status).toBe('serving');
    expect(next.officers['zhang-liao'].stamina).toBe(100 - RECRUIT_OFFICER_STAMINA_COST);
    expect(next.discoveredOfficerIds).toEqual([]);
    expect(next.actedOfficerIds).toContain('zhang-liao');
    expect(validateGameState(next)).toEqual([]);
  });

  it('rewards a stationed officer with the documented temporary money rule', () => {
    const state = createSampleState();
    const before = state.officers['xiahou-dun'].loyalty;
    const next = rewardOfficer(state, { cityId: 'luoyang', officerId: 'xiahou-dun' });

    expect(next.cities.luoyang.money).toBe(state.cities.luoyang.money - REWARD_MONEY_COST);
    expect(next.officers['xiahou-dun'].loyalty).toBe(Math.min(100, before + REWARD_LOYALTY_GAIN));
    expect(next.actedOfficerIds).toEqual([]);
    expect(() => rewardOfficer(next, { cityId: 'luoyang', officerId: 'xiahou-dun' }))
      .toThrow('忠诚已经达到上限');
  });

  it('gives and removes equipment through city inventory without consuming a monthly action', () => {
    const state = createSampleState();
    const rewarded = giveItemToOfficer(state, {
      cityId: 'luoyang',
      officerId: 'xiahou-dun',
      itemId: 'sunzi-manual',
    });

    expect(rewarded.cities.luoyang.itemIds).toEqual([]);
    expect(rewarded.officers['xiahou-dun'].equipmentItemIds).toEqual(['sunzi-manual']);
    expect(rewarded.officers['xiahou-dun'].loyalty).toBe(100);
    expect(rewarded.actedOfficerIds).toEqual([]);

    const unequipped = unequipOfficerItem(rewarded, {
      cityId: 'luoyang',
      officerId: 'xiahou-dun',
      itemId: 'sunzi-manual',
    });
    expect(unequipped.officers['xiahou-dun'].equipmentItemIds).toEqual([]);
    expect(unequipped.cities.luoyang.itemIds).toEqual(['sunzi-manual']);
    expect(validateGameState(unequipped)).toEqual([]);
  });

  it('uses effective equipped attributes for兵符 and enforces the original two-slot capacity', () => {
    const state = createSampleState();
    state.items['training-spear'] = {
      id: 'training-spear', name: '试验枪', forceBonus: 10, intelligenceBonus: 0, moveBonus: 0,
    };
    state.items['elite-token'] = {
      id: 'elite-token', name: '铁骑兵符', forceBonus: 0, intelligenceBonus: 0, moveBonus: 0,
      armsTypeOverride: 'elite',
    };
    state.officers['xiahou-dun'].force = 100;
    state.officers['xiahou-dun'].equipmentItemIds = ['training-spear'];
    state.cities.luoyang.itemIds = ['elite-token'];

    const promoted = giveItemToOfficer(state, {
      cityId: 'luoyang', officerId: 'xiahou-dun', itemId: 'elite-token',
    });
    expect(promoted.officers['xiahou-dun'].armsTypeId).toBe('elite');
    expect(promoted.officers['xiahou-dun'].equipmentItemIds).toEqual(['training-spear']);

    const full = structuredClone(state);
    full.items['second-item'] = {
      id: 'second-item', name: '副装备', forceBonus: 0, intelligenceBonus: 0, moveBonus: 1,
    };
    full.officers['xiahou-dun'].equipmentItemIds = ['training-spear', 'second-item'];
    expect(() => giveItemToOfficer(full, {
      cityId: 'luoyang', officerId: 'xiahou-dun', itemId: 'elite-token',
    })).toThrow('2 个装备位置已经占满');
  });

  it('queues an officer move, repairs the source satrap, and arrives after one month', () => {
    const state = createSampleState();
    const next = moveOfficer(state, {
      sourceCityId: 'luoyang',
      targetCityId: 'chang-an',
      officerId: 'cao-cao',
    });

    expect(next.officers['cao-cao'].cityId).toBeUndefined();
    expect(next.cities.luoyang.satrapOfficerId).toBe('xiahou-dun');
    expect(Object.values(next.strategicOrders)).toMatchObject([{
      officerId: 'cao-cao',
      sourceCityId: 'luoyang',
      targetCityId: 'chang-an',
      durationMonths: 1,
      remainingMonths: 1,
    }]);
    expect(next.actedOfficerIds).toContain('cao-cao');
    expect(validateGameState(next)).toEqual([]);

    const arrived = finishTurn(beginAiPhase(next));
    expect(arrived.officers['cao-cao'].cityId).toBe('chang-an');
    expect(arrived.cities['chang-an'].satrapOfficerId).toBe('cao-cao');
    expect(arrived.strategicOrders).toEqual({});
    expect(validateGameState(arrived)).toEqual([]);

    expect(() => moveOfficer(state, {
      sourceCityId: 'chenliu',
      targetCityId: 'chengdu',
      officerId: 'zhang-liao',
    })).toThrow('己方城池之间');
  });

  it('appoints a stationed officer without consuming their monthly action', () => {
    const state = createSampleState();
    const next = appointSatrap(state, { cityId: 'luoyang', officerId: 'xiahou-dun' });

    expect(next.cities.luoyang.satrapOfficerId).toBe('xiahou-dun');
    expect(next.actedOfficerIds).toEqual([]);
    expect(() => moveOfficer(next, {
      sourceCityId: 'luoyang',
      targetCityId: 'chengdu',
      officerId: 'xiahou-dun',
    })).toThrow('己方城池之间');
  });
});
