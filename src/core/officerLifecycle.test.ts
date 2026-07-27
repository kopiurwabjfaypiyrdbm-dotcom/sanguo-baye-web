import { describe, expect, it } from 'vitest';
import { createSampleState } from './sampleState';
import {
  banishOfficer,
  confiscateOfficerEquipment,
  executeCaptive,
  killOfficer,
  resolveSuccession,
  settleCaptiveEscapes,
  settleNaturalDeaths,
} from './officerLifecycle';
import { validateGameState } from './validation';
import { parseSave, serializeSave } from './saveGame';
import { beginAiPhase, continueTurnUntilPlayerDefense } from './turn';

describe('officer lifecycle', () => {
  it('executes a captive atomically and recovers all equipment into the prison city', () => {
    const state = createSampleState();
    state.cities.luoyang.itemIds = [];
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'captive',
      factionId: 'neutral',
      captorFactionId: 'cao-cao',
      formerFactionId: 'liu-bei',
      cityId: 'luoyang',
      troops: 0,
      stamina: 0,
      equipmentItemIds: ['sunzi-manual'],
    };

    const next = executeCaptive(state, { cityId: 'luoyang', captiveOfficerId: 'chen-gong' });

    expect(next.officers['chen-gong']).toMatchObject({
      status: 'dead',
      factionId: 'neutral',
      cityId: undefined,
      equipmentItemIds: [],
      death: {
        cause: 'execution',
        cityId: 'luoyang',
        responsibleFactionId: 'cao-cao',
      },
    });
    expect(next.cities.luoyang.itemIds).toContain('sunzi-manual');
    expect(next.rngSeed).not.toBe(state.rngSeed);
    expect(validateGameState(next)).toEqual([]);
  });

  it('banishes a local officer to a deterministic city but protects the ruler', () => {
    const state = createSampleState();
    state.rngSeed = 1;

    expect(() => banishOfficer(state, { cityId: 'luoyang', officerId: 'cao-cao' }))
      .toThrow('不能流放当前君主');

    const next = banishOfficer(state, { cityId: 'luoyang', officerId: 'xiahou-dun' });
    expect(next.officers['xiahou-dun']).toMatchObject({
      status: 'free',
      factionId: 'neutral',
      cityId: 'chenliu',
      troops: 0,
      stamina: 0,
    });
    expect(next.discoveredOfficerIds).toContain('xiahou-dun');
    expect(validateGameState(next)).toEqual([]);
  });

  it('confiscates one item and applies the fixed loyalty penalty without consuming an action', () => {
    const state = createSampleState();
    state.cities.luoyang.itemIds = [];
    state.officers['xiahou-dun'].equipmentItemIds = ['sunzi-manual'];

    const next = confiscateOfficerEquipment(state, {
      cityId: 'luoyang',
      officerId: 'xiahou-dun',
      itemId: 'sunzi-manual',
    });

    expect(next.officers['xiahou-dun'].equipmentItemIds).toEqual([]);
    expect(next.officers['xiahou-dun'].loyalty).toBe(74);
    expect(next.cities.luoyang.itemIds).toEqual(['sunzi-manual']);
    expect(next.actedOfficerIds).toEqual([]);
    expect(validateGameState(next)).toEqual([]);
  });

  it('persists a player succession decision and resumes after the chosen heir is installed', () => {
    const state = createSampleState();
    const pending = killOfficer(state, {
      officerId: 'cao-cao',
      cause: 'natural-death',
      cityId: 'luoyang',
    });

    expect(pending.phase).toBe('succession');
    expect(pending.pendingSuccession?.candidateOfficerIds).toContain('xun-yu');
    expect(validateGameState(pending)).toEqual([]);
    expect(parseSave(serializeSave(pending)).state).toEqual(pending);

    const resolved = resolveSuccession(pending, 'xun-yu');
    expect(resolved.phase).toBe('player');
    expect(resolved.pendingSuccession).toBeUndefined();
    expect(resolved.factions['cao-cao'].rulerOfficerId).toBe('xun-yu');
    expect(resolved.officers['xun-yu'].loyalty).toBe(100);
    expect(validateGameState(resolved)).toEqual([]);
  });

  it('freezes player commands and AI continuation while succession is unresolved', () => {
    const state = createSampleState();
    const pending = killOfficer({ ...state, phase: 'ai', activeFactionId: 'liu-bei' }, {
      officerId: 'cao-cao',
      cause: 'battle-death',
      cityId: 'luoyang',
      responsibleFactionId: 'liu-bei',
    });

    expect(pending.phase).toBe('succession');
    expect(pending.pendingSuccession).toMatchObject({
      resumePhase: 'ai',
      resumeActiveFactionId: 'liu-bei',
      resumeAiFactionIndex: 2,
    });
    expect(() => beginAiPhase(pending)).toThrow('必须先拥立新君');
    expect(continueTurnUntilPlayerDefense(pending, 0)).toEqual({
      state: pending,
      completed: true,
    });
  });

  it('dissolves a faction with cities when no living successor remains', () => {
    const state = createSampleState();
    for (const officerId of ['guan-yu', 'zhuge-liang', 'zhang-fei']) {
      state.officers[officerId] = {
        ...state.officers[officerId],
        status: 'dead',
        factionId: 'neutral',
        cityId: undefined,
        troops: 0,
        stamina: 0,
        equipmentItemIds: [],
        death: { cause: 'natural-death', turn: 1, year: 190, month: 1 },
      };
    }

    const next = killOfficer(state, {
      officerId: 'liu-bei',
      cause: 'natural-death',
      cityId: 'chengdu',
    });

    expect(Object.values(next.cities).filter((city) => city.ownerId === 'liu-bei')).toHaveLength(0);
    expect(next.logs.at(-1)?.message).toContain('无人可继');
    expect(validateGameState(next)).toEqual([]);
  });

  it('settles opt-in captive escape and natural death with saved deterministic RNG', () => {
    const escapeState = createSampleState();
    escapeState.lifecyclePolicy.captiveEscape = 'modern-monthly';
    escapeState.rngSeed = 1972;
    escapeState.officers['chen-gong'] = {
      ...escapeState.officers['chen-gong'],
      status: 'captive',
      factionId: 'neutral',
      captorFactionId: 'cao-cao',
      formerFactionId: 'liu-bei',
      cityId: 'luoyang',
      troops: 0,
      stamina: 0,
    };
    const escaped = settleCaptiveEscapes(escapeState);
    expect(escaped.officers['chen-gong']).toMatchObject({
      status: 'serving',
      factionId: 'liu-bei',
      captorFactionId: undefined,
      formerFactionId: undefined,
    });

    const deathState = createSampleState();
    deathState.lifecyclePolicy.naturalDeath = 'age-90-coinflip';
    deathState.rngSeed = 1972;
    deathState.officers['xiahou-dun'].age = 90;
    const dead = settleNaturalDeaths(deathState);
    expect(dead.officers['xiahou-dun'].status).toBe('dead');
    expect(validateGameState(dead)).toEqual([]);
  });

  it('checks opt-in natural death only during the January annual settlement', () => {
    const state = createSampleState();
    state.lifecyclePolicy.naturalDeath = 'age-90-coinflip';
    state.calendar.month = 2;
    state.rngSeed = 1972;
    state.officers['xiahou-dun'].age = 90;

    const next = settleNaturalDeaths(state);

    expect(next).toBe(state);
    expect(next.rngSeed).toBe(1972);
    expect(next.officers['xiahou-dun'].status).toBe('serving');
  });

  it('uses effective intelligence when an AI faction chooses its successor', () => {
    const state = createSampleState();
    state.cities.luoyang.itemIds = [];
    state.items['sunzi-manual'] = {
      ...state.items['sunzi-manual'],
      intelligenceBonus: 50,
    };
    state.officers['guan-yu'].equipmentItemIds = ['sunzi-manual'];

    const next = killOfficer(state, {
      officerId: 'liu-bei',
      cause: 'natural-death',
      cityId: 'chengdu',
    });

    expect(next.factions['liu-bei'].rulerOfficerId).toBe('guan-yu');
    expect(next.officers['guan-yu'].loyalty).toBe(100);
    expect(validateGameState(next)).toEqual([]);
  });
});
