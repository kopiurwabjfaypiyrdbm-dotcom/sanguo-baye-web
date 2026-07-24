import { describe, expect, it } from 'vitest';
import { searchCity } from './personnelCommands';
import { createSampleState } from './sampleState';
import { parseSave, serializeSave } from './saveGame';
import { loadFromSlot, saveToSlot, slotKey, type SaveStorage } from './saveStorage';

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
});
