import { describe, expect, it } from 'vitest';
import { searchCity } from './personnelCommands';
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
