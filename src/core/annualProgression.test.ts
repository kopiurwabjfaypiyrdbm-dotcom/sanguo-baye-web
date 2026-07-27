import { describe, expect, it } from 'vitest';
import { createSampleState } from './sampleState';
import { nextRandom } from './random';
import { giveItemToOfficer } from './personnelCommands';
import { parseSave, serializeSave } from './saveGame';
import { PERSON_APPEAR_AGE, settleAnnualProgression } from './annualProgression';
import { validateGameState } from './validation';

describe('annual progression', () => {
  it('ages everyone, reveals scheduled people and items, and survives save reload', () => {
    const state = createSampleState();
    state.calendar = { year: 191, month: 1 };
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'hidden',
      cityId: undefined,
      age: 45,
      appearanceYear: 191,
      appearanceCityId: 'xuchang',
    };
    state.items['annual-scroll'] = {
      id: 'annual-scroll',
      name: '年度测试书',
      forceBonus: 0,
      intelligenceBonus: 1,
      moveBonus: 0,
      appearanceYear: 191,
      appearanceCityId: 'luoyang',
    };

    const next = settleAnnualProgression(state, { year: 190, month: 12 });

    expect(next.officers['cao-cao'].age).toBe(state.officers['cao-cao'].age + 1);
    expect(next.officers['chen-gong']).toMatchObject({
      status: 'free',
      factionId: 'neutral',
      cityId: 'xuchang',
      age: PERSON_APPEAR_AGE,
      troops: 0,
      loyalty: state.officers['chen-gong'].loyalty,
    });
    expect(next.cities.luoyang.hiddenItemIds).toContain('annual-scroll');
    expect(next.logs.at(-1)?.message).toBe(
      '年度更新：人物年龄增长 1 岁；各地传来新人才出仕前的活动消息；有新道具进入各地隐藏库存。',
    );
    expect(parseSave(serializeSave(next)).state).toEqual(next);
    expect(validateGameState(next)).toEqual([]);
  });

  it('uses one deterministic random draw for each due officer without a fixed city', () => {
    const state = createSampleState();
    state.calendar = { year: 191, month: 1 };
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'hidden',
      cityId: undefined,
      appearanceYear: 191,
      appearanceCityId: undefined,
    };
    const expectedRandom = nextRandom(state.rngSeed);
    const orderedCityIds = Object.values(state.cities)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((city) => city.id);

    const next = settleAnnualProgression(state, { year: 190, month: 12 });

    expect(next.rngSeed).toBe(expectedRandom.seed);
    expect(next.officers['chen-gong'].cityId).toBe(
      orderedCityIds[Math.floor(expectedRandom.value * orderedCityIds.length)],
    );
  });

  it('does nothing outside a genuine year rollover and never duplicates placed items', () => {
    const state = createSampleState();
    state.calendar = { year: 191, month: 1 };
    state.items['sunzi-manual'] = {
      ...state.items['sunzi-manual'],
      appearanceYear: 191,
      appearanceCityId: 'luoyang',
    };
    state.cities.luoyang.hiddenItemIds = ['sunzi-manual'];

    expect(settleAnnualProgression(state, { year: 191, month: 1 })).toBe(state);
    const settled = settleAnnualProgression(state, { year: 190, month: 12 });
    expect(settled.cities.luoyang.hiddenItemIds).toEqual(['sunzi-manual']);
  });

  it('keeps a consumed due item legal after its type leaves every inventory', () => {
    const state = createSampleState();
    state.calendar = { year: 191, month: 1 };
    state.items['annual-token'] = {
      id: 'annual-token',
      name: '年度兵符',
      forceBonus: 0,
      intelligenceBonus: 0,
      moveBonus: 0,
      armsTypeOverride: 'navy',
      appearanceYear: 191,
      appearanceCityId: 'luoyang',
    };
    state.cities.luoyang.itemIds = [...(state.cities.luoyang.itemIds ?? []), 'annual-token'];

    const consumed = giveItemToOfficer(state, {
      cityId: 'luoyang',
      officerId: 'cao-cao',
      itemId: 'annual-token',
    });

    expect(consumed.cities.luoyang.itemIds).not.toContain('annual-token');
    expect(Object.values(consumed.officers).flatMap(
      (officer) => officer.equipmentItemIds ?? [],
    )).not.toContain('annual-token');
    expect(validateGameState(consumed)).toEqual([]);
  });
});
