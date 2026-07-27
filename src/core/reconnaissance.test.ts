import { describe, expect, it } from 'vitest';
import { parseSave, serializeSave } from './saveGame';
import { createSampleState } from './sampleState';
import {
  RECON_MONEY_COST,
  RECON_STAMINA_COST,
  getReconAvailability,
  reconnoitreCity,
} from './reconnaissance';
import { validateGameState } from './validation';

const order = {
  sourceCityId: 'luoyang',
  targetCityId: 'hanzhong',
  officerId: 'cao-cao',
};

describe('strategic reconnaissance', () => {
  it('records an immutable enemy-city snapshot with the documented provisional costs', () => {
    const state = createSampleState();
    const sourceMoney = state.cities.luoyang.money;
    const stamina = state.officers['cao-cao'].stamina;
    const snapshot = structuredClone(state);

    const next = reconnoitreCity(state, order);
    const report = next.intelReports.hanzhong;

    expect(state).toEqual(snapshot);
    expect(report).toMatchObject({
      cityId: 'hanzhong',
      observedTurn: 1,
      observedYear: 190,
      observedMonth: 1,
      money: state.cities.hanzhong.money,
      food: state.cities.hanzhong.food,
      reserveTroops: state.cities.hanzhong.reserveTroops,
    });
    expect(report.officerCount).toBeGreaterThan(0);
    expect(report.officerIds).toContain('guan-yu');
    expect(report.totalTroops).toBeGreaterThan(0);
    expect(next.cities.luoyang.money).toBe(sourceMoney - RECON_MONEY_COST);
    expect(next.officers['cao-cao'].stamina).toBe(stamina - RECON_STAMINA_COST);
    expect(next.actedOfficerIds).toContain('cao-cao');
    expect(next.rngSeed).toBe(state.rngSeed);
    expect(next.logs.at(-1)?.message).toContain('侦察汉中');
    expect(validateGameState(next)).toEqual([]);
  });

  it('preserves reports through save/load while enemy state can change independently', () => {
    const scouted = reconnoitreCity(createSampleState(), order);
    const observedFood = scouted.intelReports.hanzhong.food;
    scouted.cities.hanzhong.food += 999;

    const loaded = parseSave(serializeSave(scouted)).state;

    expect(loaded.intelReports.hanzhong.food).toBe(observedFood);
    expect(loaded.cities.hanzhong.food).toBe(observedFood + 999);
  });

  it('rejects friendly targets, spent officers, and insufficient city funds with reasons', () => {
    const state = createSampleState();
    expect(getReconAvailability(state, { ...order, targetCityId: 'chenliu' })).toEqual({
      allowed: false,
      reason: '请选择非己方目标城池',
    });

    state.actedOfficerIds.push('cao-cao');
    expect(getReconAvailability(state, order)).toEqual({ allowed: false, reason: '曹操本月已经行动' });
    state.actedOfficerIds = [];
    state.cities.luoyang.money = RECON_MONEY_COST - 1;
    expect(getReconAvailability(state, order)).toEqual({
      allowed: false,
      reason: `洛阳金钱不足，需要 ${RECON_MONEY_COST}`,
    });
  });
});
