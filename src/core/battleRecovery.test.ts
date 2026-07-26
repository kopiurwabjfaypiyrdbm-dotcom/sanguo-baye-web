import { describe, expect, it } from 'vitest';
import {
  deleteBattleRecovery,
  loadBattleRecovery,
  saveCommittedBattleRecovery,
  savePendingBattleRecovery,
} from './battleRecovery';
import { createSampleState } from './sampleState';
import type { SaveStorage } from './saveStorage';
import { createTacticalBattle } from './tacticalBattle';
import { beginAiPhase } from './turn';

function memoryStorage() {
  const values = new Map<string, string>();
  const storage: SaveStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  return { storage, values };
}

describe('versioned battle recovery journal', () => {
  it('rebuilds a player attack from an exact deterministic pre-battle checkpoint', () => {
    const { storage } = memoryStorage();
    const state = createSampleState();
    state.officers['cao-cao'].cityId = 'chang-an';
    state.cities.luoyang.satrapOfficerId = 'xiahou-dun';
    const order = {
      sourceCityId: 'chang-an',
      targetCityId: 'hanzhong',
      officerIds: ['cao-cao'],
      provisions: 100,
    };
    const expected = createTacticalBattle(state, order);

    savePendingBattleRecovery(storage, state, order, { kind: 'player-phase' }, '进攻检查点');
    const recovered = loadBattleRecovery(storage);

    expect(recovered).toMatchObject({
      status: 'pending',
      mode: 'player-attack',
      order,
      resume: { kind: 'player-phase' },
      label: '进攻检查点',
    });
    if (!recovered || recovered.status !== 'pending') throw new Error('missing pending recovery');
    expect(createTacticalBattle(recovered.state, recovered.order)).toEqual(expected);
  });

  it('round-trips the exact AI cursor for a player-defense checkpoint', () => {
    const { storage } = memoryStorage();
    const state = beginAiPhase(createSampleState());
    state.activeFactionId = 'liu-bei';
    const order = {
      sourceCityId: 'hanzhong',
      targetCityId: 'chang-an',
      officerIds: ['guan-yu'],
      provisions: 100,
    };

    savePendingBattleRecovery(storage, state, order, { kind: 'ai-phase', nextFactionIndex: 2 });
    expect(loadBattleRecovery(storage)).toMatchObject({
      status: 'pending',
      mode: 'ai-defense',
      resume: { kind: 'ai-phase', nextFactionIndex: 2 },
    });
  });

  it('uses committed state as the only authoritative post-battle result', () => {
    const { storage } = memoryStorage();
    const state = createSampleState();
    state.calendar.month = 8;

    saveCommittedBattleRecovery(storage, 'battle:one', state, '战后提交');
    expect(loadBattleRecovery(storage)).toMatchObject({
      status: 'committed',
      battleId: 'battle:one',
      state: { calendar: { month: 8 } },
      label: '战后提交',
    });
    deleteBattleRecovery(storage);
    expect(loadBattleRecovery(storage)).toBeUndefined();
  });

  it('rejects a damaged strategic fingerprint, command, or AI cursor', () => {
    const { storage, values } = memoryStorage();
    const state = beginAiPhase(createSampleState());
    state.activeFactionId = 'liu-bei';
    const order = {
      sourceCityId: 'hanzhong',
      targetCityId: 'chang-an',
      officerIds: ['guan-yu'],
      provisions: 100,
    };
    savePendingBattleRecovery(storage, state, order, { kind: 'ai-phase', nextFactionIndex: 2 });
    const key = [...values.keys()][0];
    const parsed = JSON.parse(values.get(key)!) as {
      strategicFingerprint: string;
      resume: { nextFactionIndex: number };
    };
    parsed.strategicFingerprint = 'damaged';
    values.set(key, JSON.stringify(parsed));
    expect(() => loadBattleRecovery(storage)).toThrow('不匹配');

    savePendingBattleRecovery(storage, state, order, { kind: 'ai-phase', nextFactionIndex: 2 });
    const damagedCursor = JSON.parse(values.get(key)!) as { resume: { nextFactionIndex: number } };
    damagedCursor.resume.nextFactionIndex = 0;
    values.set(key, JSON.stringify(damagedCursor));
    expect(() => loadBattleRecovery(storage)).toThrow('AI 恢复位置无效');
  });

  it('propagates recovery cleanup failures so committed state cannot be mistaken for cleared', () => {
    const storage: SaveStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => { throw new Error('quota locked'); },
    };
    expect(() => deleteBattleRecovery(storage)).toThrow('quota locked');
  });
});
