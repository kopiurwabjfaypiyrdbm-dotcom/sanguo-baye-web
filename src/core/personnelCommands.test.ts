import { describe, expect, it } from 'vitest';
import { createSampleState } from './sampleState';
import { SEARCH_STAMINA_COST, appointSatrap, moveOfficer, searchCity } from './personnelCommands';
import { getCityFreeOfficers, getCityOfficers } from './selectors';
import { validateGameState } from './validation';

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

  it('moves an officer to an adjacent friendly city and repairs the satrap', () => {
    const state = createSampleState();
    const next = moveOfficer(state, {
      sourceCityId: 'luoyang',
      targetCityId: 'chang-an',
      officerId: 'cao-cao',
    });

    expect(next.officers['cao-cao'].cityId).toBe('chang-an');
    expect(next.cities.luoyang.satrapOfficerId).toBe('xiahou-dun');
    expect(next.cities['chang-an'].satrapOfficerId).toBe('cao-cao');
    expect(next.actedOfficerIds).toContain('cao-cao');
    expect(validateGameState(next)).toEqual([]);
    expect(() => moveOfficer(state, {
      sourceCityId: 'chenliu',
      targetCityId: 'chang-an',
      officerId: 'zhang-liao',
    })).toThrow('相邻己方城池');
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
