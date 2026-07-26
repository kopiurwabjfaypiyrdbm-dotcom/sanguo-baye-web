import { describe, expect, it } from 'vitest';
import {
  BANQUET_MONEY_COST,
  BANQUET_STAMINA_RECOVERY,
  BUY_FOOD_PRICE,
  DEVELOP_MONEY_COST,
  DEVELOP_STAMINA_COST,
  GOVERN_MONEY_COST,
  GOVERN_STAMINA_COST,
  INSPECT_MONEY_COST,
  INSPECT_STAMINA_COST,
  RECRUIT_STAMINA_COST,
  MAX_DISTRIBUTION_INCREASE,
  PLUNDER_STAMINA_COST,
  SELL_FOOD_PRICE,
  TRADE_MONEY_SOFT_CAP,
  TRADE_STAMINA_COST,
  banquetOfficer,
  calculateCommerceGain,
  calculateFarmingGain,
  calculateOfficerTroopCapacity,
  developCommerce,
  developFarming,
  distributeTroops,
  getDevelopCommerceAvailability,
  getDevelopFarmingAvailability,
  getGovernAvailability,
  getInspectAvailability,
  getBanquetAvailability,
  getTradeAvailability,
  governCity,
  inspectCity,
  plunderCity,
  recruitTroops,
  tradeFood,
} from './cityCommands';
import { createSampleState } from './sampleState';
import { parseSave, serializeSave } from './saveGame';
import { validateGameState } from './validation';

describe('city commands', () => {
  it('develops farming with the original IQ shape and marks the officer as acted', () => {
    const state = createSampleState();
    const next = developFarming(state, { cityId: 'luoyang', officerId: 'cao-cao' });

    expect(next.cities.luoyang.farming).toBeGreaterThan(state.cities.luoyang.farming);
    expect(next.cities.luoyang.farming - state.cities.luoyang.farming).toBeGreaterThanOrEqual(
      calculateFarmingGain(state.officers['cao-cao'], 0),
    );
    expect(next.cities.luoyang.money).toBe(state.cities.luoyang.money - DEVELOP_MONEY_COST);
    expect(next.officers['cao-cao'].stamina).toBe(100 - DEVELOP_STAMINA_COST);
    expect(next.actedOfficerIds).toContain('cao-cao');
    expect(next.rngSeed).not.toBe(state.rngSeed);
    expect(state.cities.luoyang.farming).toBe(560);
    expect(validateGameState(next)).toEqual([]);
  });

  it('caps farming at the original city limit', () => {
    const state = createSampleState();
    state.cities.luoyang.farmingLimit = state.cities.luoyang.farming + 2;
    const next = developFarming(state, { cityId: 'luoyang', officerId: 'cao-cao' });

    expect(next.cities.luoyang.farming).toBe(state.cities.luoyang.farmingLimit);
  });

  it('develops commerce with the original IQ-shaped gain and city limit', () => {
    const state = createSampleState();
    state.cities.luoyang.commerceLimit = state.cities.luoyang.commerce + 3;
    const next = developCommerce(state, { cityId: 'luoyang', officerId: 'cao-cao' });

    expect(calculateCommerceGain(state.officers['cao-cao'], 0)).toBe(
      calculateFarmingGain(state.officers['cao-cao'], 0),
    );
    expect(next.cities.luoyang.commerce).toBe(state.cities.luoyang.commerceLimit);
    expect(next.cities.luoyang.money).toBe(state.cities.luoyang.money - DEVELOP_MONEY_COST);
    expect(next.officers['cao-cao'].stamina).toBe(100 - DEVELOP_STAMINA_COST);
    expect(next.actedOfficerIds).toContain('cao-cao');
    expect(next.rngSeed).not.toBe(state.rngSeed);
    expect(validateGameState(next)).toEqual([]);
  });

  it('uses equipment-adjusted intelligence for farming and commerce gains', () => {
    const plain = createSampleState();
    const equipped = createSampleState();
    equipped.officers['cao-cao'].equipmentItemIds = ['sunzi-manual'];
    equipped.cities.luoyang.itemIds = [];

    const plainCommerce = developCommerce(plain, { cityId: 'luoyang', officerId: 'cao-cao' });
    const equippedCommerce = developCommerce(equipped, { cityId: 'luoyang', officerId: 'cao-cao' });

    expect(equippedCommerce.cities.luoyang.commerce - equipped.cities.luoyang.commerce)
      .toBeGreaterThan(plainCommerce.cities.luoyang.commerce - plain.cities.luoyang.commerce);
  });

  it('keeps commerce and population growth inside the safe integer range', () => {
    const commerceState = createSampleState();
    commerceState.cities.luoyang.commerce = Number.MAX_SAFE_INTEGER - 1;
    const developed = developCommerce(commerceState, { cityId: 'luoyang', officerId: 'cao-cao' });
    expect(developed.cities.luoyang.commerce).toBe(Number.MAX_SAFE_INTEGER);
    developed.actedOfficerIds = [];
    expect(getDevelopCommerceAvailability(developed, { cityId: 'luoyang', officerId: 'cao-cao' }))
      .toMatchObject({ allowed: false, reason: '该城商业已经达到安全上限' });

    const inspectionState = createSampleState();
    inspectionState.cities.luoyang.population = Number.MAX_SAFE_INTEGER;
    inspectionState.cities.luoyang.publicLoyalty = 99;
    const inspected = inspectCity(inspectionState, { cityId: 'luoyang', officerId: 'cao-cao' });
    expect(inspected.cities.luoyang.population).toBe(Number.MAX_SAFE_INTEGER);
    expect(inspected.cities.luoyang.publicLoyalty).toBe(100);
    expect(validateGameState(inspected)).toEqual([]);
  });

  it('governs disaster prevention with the original 1-to-4 gain band', () => {
    const state = createSampleState();
    state.cities.luoyang.disasterPrevention = 98;
    state.cities.luoyang.condition = 'flood';
    const next = governCity(state, { cityId: 'luoyang', officerId: 'cao-cao' });

    expect(next.cities.luoyang.disasterPrevention).toBeGreaterThanOrEqual(99);
    expect(next.cities.luoyang.disasterPrevention).toBeLessThanOrEqual(100);
    expect(next.cities.luoyang.condition).toBe('normal');
    expect(next.cities.luoyang.money).toBe(state.cities.luoyang.money - GOVERN_MONEY_COST);
    expect(next.officers['cao-cao'].stamina).toBe(100 - GOVERN_STAMINA_COST);
    expect(validateGameState(next)).toEqual([]);

    next.actedOfficerIds = [];
    next.cities.luoyang.disasterPrevention = 100;
    expect(getGovernAvailability(next, { cityId: 'luoyang', officerId: 'cao-cao' }))
      .toMatchObject({ allowed: false, reason: '该城防灾已经达到上限' });
  });

  it('inspects a city to raise loyalty and population without crossing limits', () => {
    const state = createSampleState();
    state.cities.luoyang.publicLoyalty = 99;
    state.cities.luoyang.populationLimit = state.cities.luoyang.population + 40;
    const next = inspectCity(state, { cityId: 'luoyang', officerId: 'cao-cao' });

    expect(next.cities.luoyang.publicLoyalty).toBe(100);
    expect(next.cities.luoyang.population).toBe(state.cities.luoyang.populationLimit);
    expect(next.cities.luoyang.money).toBe(state.cities.luoyang.money - INSPECT_MONEY_COST);
    expect(next.officers['cao-cao'].stamina).toBe(100 - INSPECT_STAMINA_COST);
    expect(validateGameState(next)).toEqual([]);

    next.actedOfficerIds = [];
    expect(getInspectAvailability(next, { cityId: 'luoyang', officerId: 'cao-cao' }))
      .toMatchObject({ allowed: false, reason: '该城民忠和人口已经达到上限' });
  });

  it('reports civic command availability from core rules', () => {
    const state = createSampleState();
    state.cities.luoyang.money = DEVELOP_MONEY_COST - 1;
    expect(getDevelopCommerceAvailability(state, { cityId: 'luoyang', officerId: 'cao-cao' }))
      .toMatchObject({ allowed: false, reason: `城中金钱不足，需要 ${DEVELOP_MONEY_COST}` });

    state.cities.luoyang.money = 800;
    state.actedOfficerIds = ['cao-cao'];
    expect(getGovernAvailability(state, { cityId: 'luoyang', officerId: 'cao-cao' }))
      .toMatchObject({ allowed: false, reason: '该武将本月已经执行过命令' });

    state.actedOfficerIds = [];
    state.cities.luoyang.farming = Number.MAX_SAFE_INTEGER;
    state.cities.luoyang.farmingLimit = undefined;
    expect(getDevelopFarmingAvailability(state, { cityId: 'luoyang', officerId: 'cao-cao' }))
      .toMatchObject({ allowed: false, reason: '该城农业已经达到安全上限' });
  });

  it('buys and sells food at the fixed exchange rates without hidden cap loss', () => {
    const buyState = createSampleState();
    const bought = tradeFood(buyState, {
      cityId: 'luoyang',
      officerId: 'cao-cao',
      direction: 'buy',
      amount: 10,
    });
    expect(bought.cities.luoyang.food).toBe(buyState.cities.luoyang.food + 10);
    expect(bought.cities.luoyang.money).toBe(buyState.cities.luoyang.money - 10 * BUY_FOOD_PRICE);
    expect(bought.officers['cao-cao'].stamina).toBe(100 - TRADE_STAMINA_COST);
    expect(bought.actedOfficerIds).toContain('cao-cao');

    const sellState = createSampleState();
    sellState.cities.luoyang.money = TRADE_MONEY_SOFT_CAP - 20;
    const sold = tradeFood(sellState, {
      cityId: 'luoyang',
      officerId: 'cao-cao',
      direction: 'sell',
      amount: 10,
    });
    expect(sold.cities.luoyang.food).toBe(sellState.cities.luoyang.food - 10);
    expect(sold.cities.luoyang.money).toBe(TRADE_MONEY_SOFT_CAP);
    expect(sold.cities.luoyang.money - sellState.cities.luoyang.money).toBe(10 * SELL_FOOD_PRICE);

    sellState.actedOfficerIds = [];
    expect(getTradeAvailability(sellState, {
      cityId: 'luoyang',
      officerId: 'cao-cao',
      direction: 'sell',
      amount: 11,
    })).toMatchObject({ allowed: false, reason: '最多可卖出 10 粮，避免超过交易金钱上限' });
    expect(validateGameState(sold)).toEqual([]);
  });

  it('rejects invalid exchange amounts and resource overdraw', () => {
    const state = createSampleState();
    expect(getTradeAvailability(state, {
      cityId: 'luoyang', officerId: 'cao-cao', direction: 'buy', amount: 0,
    }).allowed).toBe(false);
    expect(getTradeAvailability(state, {
      cityId: 'luoyang', officerId: 'cao-cao', direction: 'buy', amount: 1.5,
    }).allowed).toBe(false);
    expect(getTradeAvailability(state, {
      cityId: 'luoyang', officerId: 'cao-cao', direction: 'buy', amount: Number.MAX_SAFE_INTEGER,
    }).allowed).toBe(false);
    expect(getTradeAvailability(state, {
      cityId: 'luoyang', officerId: 'cao-cao', direction: 'sell', amount: state.cities.luoyang.food + 1,
    }).allowed).toBe(false);
    state.cities.luoyang.food = TRADE_MONEY_SOFT_CAP;
    expect(getTradeAvailability(state, {
      cityId: 'luoyang', officerId: 'cao-cao', direction: 'buy', amount: 1,
    })).toMatchObject({ allowed: false, reason: `城中粮草已达到交易上限 ${TRADE_MONEY_SOFT_CAP}` });
  });

  it('banquets an officer without consuming or resetting the monthly action', () => {
    const state = createSampleState();
    state.officers['cao-cao'].stamina = 30;
    state.officers['cao-cao'].loyalty = 70;
    state.actedOfficerIds = ['cao-cao'];
    const next = banquetOfficer(state, { cityId: 'luoyang', targetOfficerId: 'cao-cao' });

    expect(next.officers['cao-cao'].stamina).toBe(30 + BANQUET_STAMINA_RECOVERY);
    expect(next.officers['cao-cao'].loyalty).toBe(70);
    expect(next.actedOfficerIds).toEqual(['cao-cao']);
    expect(next.cities.luoyang.money).toBe(state.cities.luoyang.money - BANQUET_MONEY_COST);

    next.officers['cao-cao'].stamina = 100;
    expect(getBanquetAvailability(next, { cityId: 'luoyang', targetOfficerId: 'cao-cao' }).allowed).toBe(false);
    expect(validateGameState(next)).toEqual([]);
  });

  it('raises non-ruler loyalty at a banquet and caps both benefits', () => {
    const state = createSampleState();
    state.officers['xun-yu'].stamina = 75;
    state.officers['xun-yu'].loyalty = 99;
    const next = banquetOfficer(state, { cityId: 'xuchang', targetOfficerId: 'xun-yu' });
    expect(next.officers['xun-yu'].stamina).toBe(100);
    expect(next.officers['xun-yu'].loyalty).toBe(100);
  });

  it('plunders with equipment-adjusted attributes and floors civic values', () => {
    const state = createSampleState();
    state.officers['cao-cao'].equipmentItemIds = ['sunzi-manual'];
    state.cities.luoyang.itemIds = [];
    state.cities.luoyang.publicLoyalty = 81;
    state.cities.luoyang.farming = 561;
    state.cities.luoyang.commerce = 701;
    const strength = state.officers['cao-cao'].force + state.officers['cao-cao'].intelligence
      + state.items['sunzi-manual'].forceBonus + state.items['sunzi-manual'].intelligenceBonus;
    const next = plunderCity(state, { cityId: 'luoyang', officerId: 'cao-cao' });

    expect(next.cities.luoyang.publicLoyalty).toBe(40);
    expect(next.cities.luoyang.farming).toBe(280);
    expect(next.cities.luoyang.commerce).toBe(350);
    expect(next.cities.luoyang.food - state.cities.luoyang.food).toBe(strength * 5);
    expect(next.cities.luoyang.money - state.cities.luoyang.money).toBe(strength * 2);
    expect(next.officers['cao-cao'].stamina).toBe(100 - PLUNDER_STAMINA_COST);
    expect(next.actedOfficerIds).toContain('cao-cao');
    expect(validateGameState(next)).toEqual([]);
  });

  it('uses default loyalty and preserves resources already above the plunder soft cap', () => {
    const state = createSampleState();
    state.cities.luoyang.publicLoyalty = undefined;
    state.cities.luoyang.money = TRADE_MONEY_SOFT_CAP + 1;
    state.cities.luoyang.food = TRADE_MONEY_SOFT_CAP + 2;
    const next = plunderCity(state, { cityId: 'luoyang', officerId: 'cao-cao' });

    expect(next.cities.luoyang.publicLoyalty).toBe(35);
    expect(next.cities.luoyang.money).toBe(TRADE_MONEY_SOFT_CAP + 1);
    expect(next.cities.luoyang.food).toBe(TRADE_MONEY_SOFT_CAP + 2);
    expect(validateGameState(next)).toEqual([]);
  });

  it('round-trips a deterministic sequence of trade, banquet, and plunder', () => {
    const initial = createSampleState();
    initial.officers['xun-yu'].stamina = 40;
    const traded = tradeFood(initial, {
      cityId: 'luoyang', officerId: 'cao-cao', direction: 'buy', amount: 10,
    });
    const banqueted = banquetOfficer(traded, { cityId: 'xuchang', targetOfficerId: 'xun-yu' });
    const plundered = plunderCity(banqueted, { cityId: 'xuchang', officerId: 'xun-yu' });
    const loaded = parseSave(serializeSave(plundered)).state;

    expect(loaded).toEqual(plundered);
    expect(loaded.rngSeed).toBe(initial.rngSeed);
    expect(validateGameState(loaded)).toEqual([]);
  });

  it('recruits into city reserves and then distributes troops to an officer', () => {
    const state = createSampleState();
    state.cities.xuchang.reserveTroops = 0;
    state.officers['xun-yu'].troops = 100;
    const recruited = recruitTroops(state, { cityId: 'xuchang', officerId: 'xun-yu', amount: 500 });
    const distributionState = structuredClone(state);
    distributionState.cities.xuchang.reserveTroops = 500;
    const targetTroops = 500;
    const distributed = distributeTroops(distributionState, {
      cityId: 'xuchang',
      officerId: 'xun-yu',
      targetTroops,
    });

    expect(recruited.cities.xuchang.reserveTroops).toBe(500);
    expect(recruited.officers['xun-yu'].troops).toBe(state.officers['xun-yu'].troops);
    expect(recruited.officers['xun-yu'].stamina).toBe(100 - RECRUIT_STAMINA_COST);
    expect(distributed.officers['xun-yu'].troops).toBe(targetTroops);
    expect(distributed.cities.xuchang.reserveTroops).toBe(100);
    expect(distributed.actedOfficerIds).toContain('xun-yu');
    expect(distributed.campaignStarted).toBe(true);
    expect(validateGameState(distributed)).toEqual([]);
  });

  it('allows returning troops to reserve but enforces command and capacity limits', () => {
    const state = createSampleState();
    const returned = distributeTroops(state, {
      cityId: 'luoyang',
      officerId: 'cao-cao',
      targetTroops: 5_000,
    });
    expect(returned.cities.luoyang.reserveTroops).toBe(4_200);

    const acted = developFarming(state, { cityId: 'luoyang', officerId: 'cao-cao' });
    expect(() => recruitTroops(acted, { cityId: 'luoyang', officerId: 'cao-cao' })).toThrow('本月已经执行过命令');
    expect(() => distributeTroops(state, {
      cityId: 'luoyang',
      officerId: 'cao-cao',
      targetTroops: calculateOfficerTroopCapacity(state.officers['cao-cao']) + 1,
    })).toThrow('最多统率');

    state.officers['cao-cao'].troops = 100;
    expect(() => distributeTroops(state, {
      cityId: 'luoyang',
      officerId: 'cao-cao',
      targetTroops: 100 + MAX_DISTRIBUTION_INCREASE + 1,
    })).toThrow('单次最多');

    const once = distributeTroops(state, {
      cityId: 'luoyang',
      officerId: 'cao-cao',
      targetTroops: state.officers['cao-cao'].troops - 1,
    });
    expect(() => distributeTroops(once, {
      cityId: 'luoyang',
      officerId: 'cao-cao',
      targetTroops: once.officers['cao-cao'].troops - 1,
    })).toThrow('本月已经执行过命令');
  });

  it('rejects enemy cities, absent officers, insufficient stamina, and insufficient money', () => {
    const state = createSampleState();
    expect(() => developFarming(state, { cityId: 'chengdu', officerId: 'liu-bei' })).toThrow('己方城池');
    expect(() => recruitTroops(state, { cityId: 'luoyang', officerId: 'xun-yu' })).toThrow('不在该城');

    state.officers['cao-cao'].stamina = RECRUIT_STAMINA_COST - 1;
    expect(() => recruitTroops(state, { cityId: 'luoyang', officerId: 'cao-cao' })).toThrow('体力不足');

    state.officers['cao-cao'].stamina = 100;
    state.cities.luoyang.money = DEVELOP_MONEY_COST - 1;
    expect(() => developFarming(state, { cityId: 'luoyang', officerId: 'cao-cao' })).toThrow('金钱不足');
  });
});
