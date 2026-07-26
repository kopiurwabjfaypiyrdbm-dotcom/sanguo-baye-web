import { describe, expect, it } from 'vitest';
import { planAiAction, runAiFactionTurn } from './ai';
import { createSampleState } from './sampleState';
import { beginAiPhase } from './turn';
import { validateGameState } from './validation';
import { MOVE_STAMINA_COST, TRANSPORT_STAMINA_COST, issueTransportOrder } from './strategicOrders';

describe('basic AI', () => {
  it('skips when no stationed officer can attack', () => {
    const state = beginAiPhase(createSampleState());
    for (const officer of Object.values(state.officers)) {
      if (officer.factionId === 'liu-bei') officer.troops = 0;
    }
    const next = runAiFactionTurn(state);

    expect(next.logs.some((log) => log.kind === 'battle')).toBe(false);
    expect(next.logs.at(-1)?.message).toContain('未出征');
    expect(next.logs.at(-1)?.message).toMatch(/没有具备出征条件|低于.*策略阈值/);
  });

  it('chooses only an adjacent hostile city when the advantage passes its threshold', () => {
    const state = beginAiPhase(createSampleState());
    state.officers['guan-yu'].troops = 100_000;
    state.cities['chang-an'].reserveTroops = 0;
    const decision = planAiAction(state);

    expect(decision.action).toBe('attack');
    expect(decision.order).toBeDefined();
    expect(state.cities[decision.order!.sourceCityId].neighbors).toContain(decision.order!.targetCityId);
    expect(state.cities[decision.order!.targetCityId].ownerId).not.toBe('liu-bei');
  });

  it('skips when the best legal attack is below the profile threshold', () => {
    const state = beginAiPhase(createSampleState());
    for (const officer of Object.values(state.officers)) {
      if (officer.factionId === 'liu-bei') officer.troops = 1;
    }
    const decision = planAiAction(state);

    expect(decision.action).toBe('skip');
    expect(decision.reason).toContain('低于defensive策略阈值');
  });

  it('uses a higher attack threshold in the opening month', () => {
    const state = beginAiPhase(createSampleState());
    const decision = planAiAction(state);

    expect(decision.action).toBe('skip');
    expect(decision.reason).toContain('4.00');
  });

  it('executes at most one battle for the active faction', () => {
    const state = beginAiPhase(createSampleState());
    state.officers['guan-yu'].troops = 100_000;
    state.cities['chang-an'].reserveTroops = 0;
    const next = runAiFactionTurn(state);
    const battleStarts = next.logs.filter(
      (log) => log.turn === state.turn && log.kind === 'battle' && log.message.includes('发起进攻'),
    );

    expect(battleStarts).toHaveLength(1);
    expect(next.rngSeed).not.toBe(state.rngSeed);
    expect(validateGameState(next)).toEqual([]);
  });

  it('recruits reserves before considering an attack', () => {
    const state = beginAiPhase(createSampleState());
    for (const city of Object.values(state.cities)) {
      if (city.ownerId === 'liu-bei') city.reserveTroops = 0;
    }
    const next = runAiFactionTurn(state);

    expect(next.logs.some((log) => log.message.includes('征募 500 名后备兵'))).toBe(true);
    expect(validateGameState(next)).toEqual([]);
  });

  it('queues an adjacent frontier reinforcement without emptying the source city', () => {
    const state = beginAiPhase(createSampleState());
    state.officers['zhang-fei'].cityId = 'chengdu';
    state.cities.jiangzhou.satrapOfficerId = undefined;
    const next = runAiFactionTurn(state);

    expect(next.officers['zhang-fei'].cityId).toBeUndefined();
    expect(Object.values(next.strategicOrders)).toMatchObject([{
      officerId: 'zhang-fei',
      sourceCityId: 'chengdu',
      targetCityId: 'jiangzhou',
      remainingMonths: 1,
    }]);
    expect(next.officers['zhang-fei'].stamina).toBe(100 - MOVE_STAMINA_COST);
    expect(next.actedOfficerIds).toContain('zhang-fei');
    expect(Object.values(next.officers).filter((officer) => officer.cityId === 'chengdu' && officer.factionId === 'liu-bei'))
      .toHaveLength(1);
    expect(validateGameState(next)).toEqual([]);
  });

  it('sends deterministic food transport to a depleted frontier', () => {
    const state = beginAiPhase(createSampleState());
    for (const city of Object.values(state.cities)) {
      if (city.ownerId !== 'liu-bei') continue;
      city.food = 500;
      city.money = 0;
      city.reserveTroops = 0;
      city.farmingLimit = city.farming;
      city.itemIds = [];
      city.hiddenItemIds = [];
    }
    state.cities.chengdu.food = 2_000;
    state.cities.hanzhong.food = 100;
    state.officers['zhang-fei'].cityId = 'chengdu';
    state.cities.jiangzhou.satrapOfficerId = undefined;

    const next = runAiFactionTurn(state);
    const transport = Object.values(next.strategicOrders).find((order) => order.kind === 'transport');

    expect(transport).toMatchObject({
      officerId: 'zhang-fei',
      sourceCityId: 'chengdu',
      targetCityId: 'hanzhong',
      cargo: { money: 0, food: 400, reserveTroops: 0 },
    });
    expect(next.officers['zhang-fei'].stamina).toBe(100 - TRANSPORT_STAMINA_COST);
    expect(next.officers['zhang-fei'].cityId).toBeUndefined();
    expect(next.cities.chengdu.food).toBe(1_600);
    expect(validateGameState(next)).toEqual([]);
  });

  it('does not queue duplicate supply while enough cargo is already inbound', () => {
    const state = beginAiPhase(createSampleState());
    for (const city of Object.values(state.cities)) {
      if (city.ownerId !== 'liu-bei') continue;
      city.food = 500;
      city.money = 200;
      city.reserveTroops = 300;
      city.farmingLimit = city.farming;
      city.itemIds = [];
      city.hiddenItemIds = [];
    }
    state.cities.chengdu.food = 2_000;
    state.cities.hanzhong.food = 100;
    state.officers['zhang-fei'].cityId = 'chengdu';
    state.cities.jiangzhou.satrapOfficerId = undefined;
    const withInbound = issueTransportOrder(state, {
      sourceCityId: 'chengdu',
      targetCityId: 'hanzhong',
      officerId: 'zhang-fei',
      cargo: { money: 0, food: 400, reserveTroops: 0 },
    });

    const next = runAiFactionTurn(withInbound);
    const transports = Object.values(next.strategicOrders)
      .filter((order) => order.kind === 'transport' && order.targetCityId === 'hanzhong');

    expect(transports).toHaveLength(1);
    expect(transports[0].officerId).toBe('zhang-fei');
    expect(validateGameState(next)).toEqual([]);
  });

  it('makes the same decisions from the same state', () => {
    const state = beginAiPhase(createSampleState());
    expect(runAiFactionTurn(structuredClone(state))).toEqual(runAiFactionTurn(structuredClone(state)));
  });

  it('does not launch a token-provision attack from a food-starved city', () => {
    const state = beginAiPhase(createSampleState());
    state.officers['guan-yu'].troops = 100_000;
    state.cities.hanzhong.food = 1;
    state.cities['chang-an'].reserveTroops = 0;

    expect(planAiAction(state).action).toBe('skip');
  });

  it('searches for a local free officer when an eligible officer is available', () => {
    const state = beginAiPhase(createSampleState());
    state.officers['chen-gong'].cityId = 'hanzhong';
    for (const city of Object.values(state.cities)) {
      if (city.ownerId === 'liu-bei') city.farmingLimit = city.farming;
    }
    const next = runAiFactionTurn(state);

    expect(next.actedOfficerIds).toContain('guan-yu');
    expect(next.logs.some((log) => log.message.includes('关羽在汉中'))).toBe(true);
    expect(validateGameState(next)).toEqual([]);
  });

  it('uses a discovered city item before routine development', () => {
    const state = beginAiPhase(createSampleState());
    state.cities.hanzhong.itemIds = ['sunzi-manual'];
    const next = runAiFactionTurn(state);

    expect(next.officers['guan-yu'].equipmentItemIds).toContain('sunzi-manual');
    expect(next.cities.hanzhong.itemIds).toEqual([]);
    expect(next.logs.some((log) => log.message.includes('赏赐关羽孙子兵法'))).toBe(true);
    expect(validateGameState(next)).toEqual([]);
  });

  it('does not consume a兵符 on officers already using its target arms type', () => {
    const state = beginAiPhase(createSampleState());
    state.items['navy-token'] = {
      id: 'navy-token', name: '水战兵符', forceBonus: 0, intelligenceBonus: 0, moveBonus: 0,
      armsTypeOverride: 'navy',
    };
    state.cities.hanzhong.itemIds = ['navy-token'];
    for (const officer of Object.values(state.officers)) {
      if (officer.factionId === 'liu-bei' && officer.cityId === 'hanzhong') officer.armsTypeId = 'navy';
    }

    const next = runAiFactionTurn(state);

    expect(next.cities.hanzhong.itemIds).toEqual(['navy-token']);
  });

  it('attempts to recruit a local captive before routine development', () => {
    const state = beginAiPhase(createSampleState());
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'captive',
      factionId: 'neutral',
      cityId: 'hanzhong',
      captorFactionId: 'liu-bei',
      formerFactionId: 'cao-cao',
      loyalty: 0,
      troops: 0,
    };

    const next = runAiFactionTurn(state);

    expect(next.officers['chen-gong']).toMatchObject({ status: 'serving', factionId: 'liu-bei', cityId: 'hanzhong' });
    expect(next.logs.some((log) => log.message.includes('说服陈宫归顺'))).toBe(true);
  });
});
