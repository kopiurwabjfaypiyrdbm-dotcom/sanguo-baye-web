import { describe, expect, it } from 'vitest';
import { createSampleState } from './sampleState';
import { releaseLandlessFactionOfficers } from './administration';
import { parseSave, serializeSave } from './saveGame';
import {
  advanceStrategicOrders,
  findOwnedCityRoute,
  getStrategicDestinations,
  getTransportAvailability,
  issueMoveOrder,
  issueTransportOrder,
} from './strategicOrders';
import { validateGameState } from './validation';
import { beginAiPhase, finishTurn } from './turn';

describe('strategic road orders', () => {
  it('uses a deterministic shortest route across connected friendly cities', () => {
    const state = createSampleState();

    expect(findOwnedCityRoute(state, 'cao-cao', 'chenliu', 'chang-an'))
      .toEqual(['chenliu', 'luoyang', 'chang-an']);
    expect(getStrategicDestinations(state, 'chenliu', 'cao-cao').map((destination) => [
      destination.city.id,
      destination.durationMonths,
    ])).toEqual([
      ['luoyang', 1],
      ['xuchang', 1],
      ['chang-an', 2],
    ]);
  });

  it('keeps an officer in transit for each road segment and survives save/load', () => {
    const state = issueMoveOrder(createSampleState(), {
      sourceCityId: 'chenliu',
      targetCityId: 'chang-an',
      officerId: 'zhang-liao',
    });

    expect(state.officers['zhang-liao'].cityId).toBeUndefined();
    expect(Object.values(state.strategicOrders)[0].remainingMonths).toBe(2);

    const reloaded = parseSave(serializeSave(state)).state;
    const afterOneMonth = finishTurn(beginAiPhase(reloaded));
    expect(afterOneMonth.officers['zhang-liao'].cityId).toBeUndefined();
    expect(Object.values(afterOneMonth.strategicOrders)[0].remainingMonths).toBe(1);

    const arrived = finishTurn(beginAiPhase(afterOneMonth));
    expect(arrived.officers['zhang-liao'].cityId).toBe('chang-an');
    expect(arrived.strategicOrders).toEqual({});
    expect(validateGameState(arrived)).toEqual([]);
  });

  it('returns an officer to the source when the destination changes hands', () => {
    const moving = issueMoveOrder(createSampleState(), {
      sourceCityId: 'luoyang',
      targetCityId: 'chang-an',
      officerId: 'cao-cao',
    });
    const targetLost = structuredClone(moving);
    targetLost.cities['chang-an'].ownerId = 'liu-bei';
    targetLost.cities['chang-an'].satrapOfficerId = undefined;

    const resolved = finishTurn(beginAiPhase(targetLost));

    expect(resolved.officers['cao-cao'].cityId).toBe('luoyang');
    expect(resolved.strategicOrders).toEqual({});
    expect(validateGameState(resolved)).toEqual([]);
  });

  it('rejects malformed transit state and duplicate orders', () => {
    const state = issueMoveOrder(createSampleState(), {
      sourceCityId: 'luoyang',
      targetCityId: 'chang-an',
      officerId: 'cao-cao',
    });
    state.strategicOrders.duplicate = {
      ...Object.values(state.strategicOrders)[0],
      id: 'duplicate',
    };

    expect(validateGameState(state).some((issue) =>
      issue.path === 'strategicOrders.duplicate.officerId'
      && issue.message.includes('already has active order'),
    )).toBe(true);
  });

  it('repairs a stale serial without overwriting an existing order', () => {
    const moving = issueMoveOrder(createSampleState(), {
      sourceCityId: 'luoyang',
      targetCityId: 'chang-an',
      officerId: 'cao-cao',
    });
    moving.nextStrategicOrderSerial = 1;

    const next = issueMoveOrder(moving, {
      sourceCityId: 'xuchang',
      targetCityId: 'chenliu',
      officerId: 'xun-yu',
    });

    expect(Object.keys(next.strategicOrders).sort()).toEqual(['strategic-order-1', 'strategic-order-2']);
    expect(next.nextStrategicOrderSerial).toBe(3);
    expect(validateGameState(next)).toEqual([]);
  });

  it('rejects an order clock that disagrees with the campaign turn', () => {
    const state = issueMoveOrder(createSampleState(), {
      sourceCityId: 'chenliu',
      targetCityId: 'chang-an',
      officerId: 'zhang-liao',
    });
    state.turn = 2;
    state.calendar = { year: 190, month: 2 };

    expect(validateGameState(state)).toContainEqual({
      path: 'strategicOrders.strategic-order-1.remainingMonths',
      message: 'must agree with durationMonths and elapsed campaign turns',
    });
  });

  it('escrows cargo and delivers it deterministically while the officer returns', () => {
    const state = createSampleState();
    state.rngSeed = 0;
    const sourceBefore = structuredClone(state.cities.chenliu);
    const targetBefore = structuredClone(state.cities.luoyang);
    const moving = issueTransportOrder(state, {
      sourceCityId: 'chenliu',
      targetCityId: 'luoyang',
      officerId: 'zhang-liao',
      cargo: { money: 40, food: 80, reserveTroops: 120 },
    });

    expect(moving.cities.chenliu).toMatchObject({
      money: sourceBefore.money - 40,
      food: sourceBefore.food - 80,
      reserveTroops: sourceBefore.reserveTroops - 120,
    });
    expect(moving.officers['zhang-liao'].cityId).toBeUndefined();
    expect(parseSave(serializeSave(moving)).state).toEqual(moving);

    const resolved = advanceStrategicOrders({
      ...moving,
      turn: moving.turn + 1,
      calendar: { year: 190, month: 2 },
    });

    expect(resolved.officers['zhang-liao'].cityId).toBe('chenliu');
    expect(resolved.cities.luoyang).toMatchObject({
      money: targetBefore.money + 40,
      food: targetBefore.food + 80,
      reserveTroops: targetBefore.reserveTroops + 120,
    });
    expect(resolved.rngSeed).not.toBe(moving.rngSeed);
    expect(resolved.strategicOrders).toEqual({});
    expect(validateGameState(resolved)).toEqual([]);
  });

  it('loses cargo on the original 21-percent failure band but returns the officer', () => {
    const state = createSampleState();
    state.rngSeed = 1972;
    const targetBefore = structuredClone(state.cities.luoyang);
    const moving = issueTransportOrder(state, {
      sourceCityId: 'chenliu',
      targetCityId: 'luoyang',
      officerId: 'zhang-liao',
      cargo: { money: 40, food: 80, reserveTroops: 120 },
    });

    const resolved = advanceStrategicOrders({
      ...moving,
      turn: moving.turn + 1,
      calendar: { year: 190, month: 2 },
    });

    expect(resolved.officers['zhang-liao'].cityId).toBe('chenliu');
    expect(resolved.cities.luoyang).toEqual(targetBefore);
    expect(resolved.logs.at(-1)?.message).toContain('全部损失');
    expect(validateGameState(resolved)).toEqual([]);
  });

  it('refunds escrow without a random roll when the transport target changes hands', () => {
    const state = createSampleState();
    const sourceBefore = structuredClone(state.cities.xuchang);
    const moving = issueTransportOrder(state, {
      sourceCityId: 'xuchang',
      targetCityId: 'chenliu',
      officerId: 'xun-yu',
      cargo: { money: 40, food: 80, reserveTroops: 120 },
    });
    moving.cities.chenliu.ownerId = 'liu-bei';
    moving.cities.chenliu.satrapOfficerId = undefined;
    moving.officers['zhang-liao'].cityId = 'luoyang';

    const resolved = advanceStrategicOrders({
      ...moving,
      turn: moving.turn + 1,
      calendar: { year: 190, month: 2 },
    });

    expect(resolved.cities.xuchang).toMatchObject({
      money: sourceBefore.money,
      food: sourceBefore.food,
      reserveTroops: sourceBefore.reserveTroops,
    });
    expect(resolved.rngSeed).toBe(moving.rngSeed);
    expect(resolved.logs.at(-1)?.message).toContain('输送目标易主');
    expect(validateGameState(resolved)).toEqual([]);
  });

  it('rejects empty, malformed, excessive, and unsafe transport cargo', () => {
    const state = createSampleState();
    const input = {
      sourceCityId: 'chenliu',
      targetCityId: 'luoyang',
      officerId: 'zhang-liao',
    };

    expect(getTransportAvailability(state, {
      ...input,
      cargo: { money: 0, food: 0, reserveTroops: 0 },
    })).toMatchObject({ allowed: false, reason: '请至少输送一种资源' });
    expect(getTransportAvailability(state, {
      ...input,
      cargo: { money: -1, food: 0, reserveTroops: 0 },
    })).toMatchObject({ allowed: false, reason: '输送数量必须是非负整数' });
    expect(getTransportAvailability(state, {
      ...input,
      cargo: { money: 0.5, food: 0, reserveTroops: 0 },
    })).toMatchObject({ allowed: false, reason: '输送数量必须是非负整数' });
    expect(getTransportAvailability(state, {
      ...input,
      cargo: { money: state.cities.chenliu.money + 1, food: 0, reserveTroops: 0 },
    })).toMatchObject({ allowed: false, reason: '出发城金钱不足' });

    state.cities.luoyang.money = Number.MAX_SAFE_INTEGER - 5;
    expect(getTransportAvailability(state, {
      ...input,
      cargo: { money: 10, food: 0, reserveTroops: 0 },
    })).toMatchObject({ allowed: false, reason: '目标城资源过多，无法安全接收本批物资' });
  });

  it('keeps a long transport deterministic across a mid-route save and reload', () => {
    const state = createSampleState();
    state.rngSeed = 0;
    const moving = issueTransportOrder(state, {
      sourceCityId: 'chenliu',
      targetCityId: 'chang-an',
      officerId: 'zhang-liao',
      cargo: { money: 40, food: 80, reserveTroops: 120 },
    });
    const afterOneMonth = advanceStrategicOrders({
      ...moving,
      turn: moving.turn + 1,
      calendar: { year: 190, month: 2 },
    });
    expect(Object.values(afterOneMonth.strategicOrders)[0].remainingMonths).toBe(1);

    const uninterrupted = advanceStrategicOrders({
      ...afterOneMonth,
      turn: afterOneMonth.turn + 1,
      calendar: { year: 190, month: 3 },
    });
    const reloaded = parseSave(serializeSave(afterOneMonth)).state;
    const resumed = advanceStrategicOrders({
      ...reloaded,
      turn: reloaded.turn + 1,
      calendar: { year: 190, month: 3 },
    });

    expect(resumed).toEqual(uninterrupted);
    expect(validateGameState(resumed)).toEqual([]);
  });

  it('settles multiple transports in stable order and accumulates their cargo', () => {
    const state = createSampleState();
    state.rngSeed = 0;
    const targetBefore = structuredClone(state.cities.luoyang);
    const first = issueTransportOrder(state, {
      sourceCityId: 'chenliu',
      targetCityId: 'luoyang',
      officerId: 'zhang-liao',
      cargo: { money: 40, food: 80, reserveTroops: 120 },
    });
    const moving = issueTransportOrder(first, {
      sourceCityId: 'xuchang',
      targetCityId: 'luoyang',
      officerId: 'xun-yu',
      cargo: { money: 20, food: 30, reserveTroops: 40 },
    });

    const resolved = advanceStrategicOrders({
      ...moving,
      turn: moving.turn + 1,
      calendar: { year: 190, month: 2 },
    });

    expect(resolved.cities.luoyang).toMatchObject({
      money: targetBefore.money + 60,
      food: targetBefore.food + 110,
      reserveTroops: targetBefore.reserveTroops + 160,
    });
    expect(resolved.logs.at(-2)?.message).toContain('张辽完成');
    expect(resolved.logs.at(-1)?.message).toContain('荀彧完成');
    expect(validateGameState(resolved)).toEqual([]);
  });

  it('refunds escrow when an executing officer changes status', () => {
    const initial = createSampleState();
    const sourceBefore = structuredClone(initial.cities.chenliu);
    const moving = issueTransportOrder(initial, {
      sourceCityId: 'chenliu',
      targetCityId: 'luoyang',
      officerId: 'zhang-liao',
      cargo: { money: 40, food: 80, reserveTroops: 120 },
    });
    moving.officers['zhang-liao'] = {
      ...moving.officers['zhang-liao'],
      status: 'free',
      factionId: 'neutral',
      cityId: 'chenliu',
      troops: 0,
      stamina: 0,
    };

    const resolved = advanceStrategicOrders({
      ...moving,
      turn: moving.turn + 1,
      calendar: { year: 190, month: 2 },
    });

    expect(resolved.cities.chenliu).toMatchObject({
      money: sourceBefore.money,
      food: sourceBefore.food,
      reserveTroops: sourceBefore.reserveTroops,
    });
    expect(resolved.strategicOrders).toEqual({});
    expect(resolved.logs.some((log) => log.message.includes('执行武将状态变化失效'))).toBe(true);
    expect(validateGameState(resolved)).toEqual([]);
  });

  it('conserves escrow as spoils when a transport faction loses its last city', () => {
    const initial = createSampleState();
    const sourceBefore = structuredClone(initial.cities.chenliu);
    const moving = issueTransportOrder(initial, {
      sourceCityId: 'chenliu',
      targetCityId: 'luoyang',
      officerId: 'zhang-liao',
      cargo: { money: 40, food: 80, reserveTroops: 120 },
    });
    for (const city of Object.values(moving.cities)) {
      if (city.ownerId !== 'cao-cao') continue;
      city.ownerId = 'liu-bei';
      city.satrapOfficerId = undefined;
    }

    const resolved = releaseLandlessFactionOfficers(moving);

    expect(resolved.cities.chenliu).toMatchObject({
      money: sourceBefore.money,
      food: sourceBefore.food,
      reserveTroops: sourceBefore.reserveTroops,
    });
    expect(resolved.strategicOrders).toEqual({});
    expect(resolved.officers['zhang-liao']).toMatchObject({ status: 'free', factionId: 'neutral' });
    expect(resolved.logs.at(-1)?.message).toContain('由陈留接收');
    expect(validateGameState(resolved)).toEqual([]);
  });

  it('splits invalidated cargo deterministically when no single city has safe capacity', () => {
    const moving = issueTransportOrder(createSampleState(), {
      sourceCityId: 'chenliu',
      targetCityId: 'luoyang',
      officerId: 'zhang-liao',
      cargo: { money: 40, food: 80, reserveTroops: 120 },
    });
    for (const city of Object.values(moving.cities)) {
      if (city.ownerId !== 'cao-cao') continue;
      city.money = Number.MAX_SAFE_INTEGER;
      city.food = Number.MAX_SAFE_INTEGER;
      city.reserveTroops = Number.MAX_SAFE_INTEGER;
    }
    moving.cities.chenliu.food = 0;
    moving.cities.luoyang.money = 0;
    moving.cities.xuchang.reserveTroops = 0;
    moving.officers['zhang-liao'] = {
      ...moving.officers['zhang-liao'],
      status: 'free',
      factionId: 'neutral',
      cityId: 'chenliu',
      troops: 0,
      stamina: 0,
    };

    const resolved = advanceStrategicOrders({
      ...moving,
      turn: moving.turn + 1,
      calendar: { year: 190, month: 2 },
    });

    expect(resolved.cities.chenliu.food).toBe(80);
    expect(resolved.cities.luoyang.money).toBe(40);
    expect(resolved.cities.xuchang.reserveTroops).toBe(120);
    expect(resolved.strategicOrders).toEqual({});
    expect(validateGameState(resolved)).toEqual([]);
  });
});
