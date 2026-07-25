import { describe, expect, it } from 'vitest';
import { giveItemToOfficer, searchCity } from './personnelCommands';
import { createSampleState } from './sampleState';
import { parseSave, serializeSave } from './saveGame';
import {
  deleteBattleCheckpoint,
  loadBattleCheckpoint,
  loadFromSlot,
  saveBattleCheckpoint,
  savePlayerBattleRollback,
  saveToSlot,
  slotKey,
  type SaveStorage,
} from './saveStorage';
import { beginAiPhase } from './turn';
import { createBundledScenario, getScenarioRulers } from '../data/bundledScenarios';
import { getEffectiveOfficerAttributes } from './equipment';

describe('versioned saves', () => {
  it('round-trips the complete state and deterministic random sequence', () => {
    const state = createSampleState();
    state.rngSeed = 682;
    const loaded = parseSave(serializeSave(state, '测试存档', '2026-07-25T00:00:00.000Z'));

    expect(loaded.label).toBe('测试存档');
    expect(loaded.state).toEqual(state);
    expect(searchCity(loaded.state, { cityId: 'chenliu', officerId: 'zhang-liao' }))
      .toEqual(searchCity(state, { cityId: 'chenliu', officerId: 'zhang-liao' }));
  });

  it('migrates a raw schema-one state exported by an early build', () => {
    const state = createSampleState();
    const legacy = structuredClone(state) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 1;
    delete legacy.discoveredOfficerIds;

    const loaded = parseSave(legacy);
    expect(loaded.state.schemaVersion).toBe(2);
    expect(loaded.state.discoveredOfficerIds).toEqual([]);
  });

  it('repairs landless serving officers produced by older schema-two battles', () => {
    const legacy = createSampleState();
    for (const city of Object.values(legacy.cities)) {
      if (city.ownerId === 'liu-bei') city.ownerId = 'cao-cao';
      city.satrapOfficerId = undefined;
    }

    const loaded = parseSave(legacy);
    const formerLiuOfficers = Object.values(loaded.state.officers).filter((officer) =>
      ['liu-bei', 'guan-yu', 'zhuge-liang', 'zhang-fei'].includes(officer.id),
    );
    expect(formerLiuOfficers.every((officer) =>
      officer.status === 'free' && officer.factionId === 'neutral' && officer.troops === 0,
    )).toBe(true);
  });

  it('adds empty item inventories when loading a pre-inventory schema-two save', () => {
    const legacy = createSampleState();
    for (const city of Object.values(legacy.cities)) {
      delete city.itemIds;
      delete city.hiddenItemIds;
    }

    const loaded = parseSave(legacy);
    expect(loaded.state.cities.luoyang.itemIds).toEqual(['sunzi-manual']);
    expect(loaded.state.cities.chenliu.hiddenItemIds).toEqual(['red-hare']);
    expect(Object.values(loaded.state.cities).every((city) =>
      Array.isArray(city.itemIds) && Array.isArray(city.hiddenItemIds),
    )).toBe(true);
  });

  it('preserves discovered inventories and equipped items after a command round-trip', () => {
    const state = createSampleState();
    const equipped = giveItemToOfficer(state, {
      cityId: 'luoyang',
      officerId: 'xiahou-dun',
      itemId: 'sunzi-manual',
    });

    const loaded = parseSave(serializeSave(equipped)).state;

    expect(loaded.cities.luoyang.itemIds).toEqual([]);
    expect(loaded.officers['xiahou-dun'].equipmentItemIds).toEqual(['sunzi-manual']);
    expect(loaded.rngSeed).toBe(equipped.rngSeed);
    expect(loaded.actedOfficerIds).toEqual(equipped.actedOfficerIds);
  });

  it('preserves captive ownership metadata through a save round-trip', () => {
    const state = createSampleState();
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'captive',
      cityId: 'luoyang',
      captorFactionId: 'cao-cao',
      formerFactionId: 'liu-bei',
      troops: 0,
      stamina: 0,
    };

    const loaded = parseSave(serializeSave(state)).state;

    expect(loaded.officers['chen-gong']).toMatchObject({
      status: 'captive', captorFactionId: 'cao-cao', formerFactionId: 'liu-bei', cityId: 'luoyang',
    });
  });

  it('migrates early named equipment slots into the ordered two-slot model', () => {
    const legacy = createSampleState();
    delete legacy.officers['guan-yu'].equipmentItemIds;
    legacy.officers['guan-yu'].weaponItemId = 'qinglong-blade';
    legacy.officers['guan-yu'].mountItemId = 'red-hare';

    const loaded = parseSave(legacy).state;

    expect(loaded.officers['guan-yu'].equipmentItemIds).toEqual(['qinglong-blade', 'red-hare']);
    expect(loaded.officers['guan-yu'].weaponItemId).toBeUndefined();
    expect(loaded.officers['guan-yu'].mountItemId).toBeUndefined();
  });

  it('returns a third early named-slot item to the officer city during migration', () => {
    const legacy = createSampleState();
    delete legacy.officers['cao-cao'].equipmentItemIds;
    legacy.officers['cao-cao'].weaponItemId = 'qinglong-blade';
    legacy.officers['cao-cao'].intelligenceItemId = 'sunzi-manual';
    legacy.officers['cao-cao'].mountItemId = 'red-hare';
    legacy.cities.luoyang.itemIds = [];
    legacy.cities.chenliu.hiddenItemIds = [];

    const loaded = parseSave(legacy).state;

    expect(loaded.officers['cao-cao'].equipmentItemIds).toEqual(['qinglong-blade', 'sunzi-manual']);
    expect(loaded.cities.luoyang.itemIds).toEqual(['red-hare']);
  });

  it('restores the untouched item layer in pre-item bundled campaign saves', () => {
    const legacy = createBundledScenario(4, getScenarioRulers(4)[0].sourceIndex);
    for (const officer of Object.values(legacy.officers)) {
      const effective = getEffectiveOfficerAttributes(legacy, officer);
      officer.force = effective.force;
      officer.intelligence = effective.intelligence;
      delete officer.equipmentItemIds;
    }
    legacy.items = {};
    for (const city of Object.values(legacy.cities)) {
      delete city.itemIds;
      delete city.hiddenItemIds;
    }

    const loaded = parseSave(legacy).state;
    const zhaoYun = Object.values(loaded.officers).find((officer) => officer.name === '赵云')!;

    expect(Object.keys(loaded.items)).toHaveLength(33);
    expect(zhaoYun.equipmentItemIds).toEqual(['item-9', 'item-8']);
    expect(getEffectiveOfficerAttributes(loaded, zhaoYun).force).toBe(109);
  });

  it('rejects unknown envelopes and invalid state references', () => {
    expect(() => parseSave('{bad json')).toThrow('有效的 JSON');
    expect(() => parseSave({ format: 'elsewhere', version: 1 })).toThrow('无法识别');

    const state = createSampleState();
    state.officers['cao-cao'].cityId = 'missing';
    expect(() => serializeSave(state)).toThrow('Invalid game state');
  });

  it('stores independent automatic and manual slots', () => {
    const values = new Map<string, string>();
    const storage: SaveStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    };
    const state = createSampleState();

    saveToSlot(storage, 'auto', state, '自动存档', '2026-07-25T00:00:00.000Z');
    state.calendar.month = 2;
    saveToSlot(storage, '1', state, '槽位 1', '2026-07-25T01:00:00.000Z');

    expect(values.has(slotKey('auto'))).toBe(true);
    expect(loadFromSlot(storage, 'auto')?.state.calendar.month).toBe(1);
    expect(loadFromSlot(storage, '1')?.state.calendar.month).toBe(2);
  });

  it('replaces a different campaign auto save before an untouched manual-save battle', () => {
    const values = new Map<string, string>();
    const storage: SaveStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    };
    const previousCampaign = createSampleState();
    previousCampaign.calendar.month = 8;
    previousCampaign.campaignStarted = true;
    const loadedManualCampaign = createSampleState();
    loadedManualCampaign.calendar.month = 2;
    loadedManualCampaign.campaignStarted = false;

    saveToSlot(storage, 'auto', previousCampaign, '上一局自动存档');
    savePlayerBattleRollback(
      storage,
      loadedManualCampaign,
      '手动载入战役 · 战前自动存档',
      '2026-07-26T00:00:00.000Z',
    );

    const restored = loadFromSlot(storage, 'auto');
    expect(restored?.label).toBe('手动载入战役 · 战前自动存档');
    expect(restored?.state).toEqual(loadedManualCampaign);
    expect(restored?.state.campaignStarted).toBe(false);
  });

  it('round-trips and clears a resumable player-defense checkpoint', () => {
    const values = new Map<string, string>();
    const storage: SaveStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    };
    const state = beginAiPhase(createSampleState());
    state.activeFactionId = 'liu-bei';
    const order = {
      sourceCityId: 'hanzhong',
      targetCityId: 'chang-an',
      officerIds: ['guan-yu'],
      provisions: 100,
    };

    saveBattleCheckpoint(storage, state, order, 2, '连续守城检查点');
    expect(loadBattleCheckpoint(storage)).toEqual({ state, order, nextFactionIndex: 2, label: '连续守城检查点' });

    const checkpointKey = [...values.keys()].find((key) => key.includes('battle-checkpoint'))!;
    const damaged = JSON.parse(values.get(checkpointKey)!) as { nextFactionIndex: number };
    damaged.nextFactionIndex = 0;
    values.set(checkpointKey, JSON.stringify(damaged));
    expect(() => loadBattleCheckpoint(storage)).toThrow('AI 恢复位置无效');

    deleteBattleCheckpoint(storage);
    expect(loadBattleCheckpoint(storage)).toBeUndefined();
  });
});
