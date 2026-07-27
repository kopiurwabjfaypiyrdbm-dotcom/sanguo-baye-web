import { describe, expect, it } from 'vitest';
import { updateCitySatraps } from './administration';
import { applyBattleResult } from './battle';
import { createSampleState } from './sampleState';
import {
  advanceCalendar,
  advanceTurnUntilPlayerDefense,
  beginAiPhase,
  continueTurnUntilPlayerDefense,
  finishTurn,
} from './turn';
import {
  attackTacticalUnit,
  createTacticalBattle,
  createTacticalBattleResult,
  endTacticalSide,
} from './tacticalBattle';
import { validateGameState } from './validation';
import { issueMoveOrder, issueTransportOrder } from './strategicOrders';
import { parseSave, serializeSave } from './saveGame';
import { nextRandom } from './random';

describe('turn progression', () => {
  it('rolls December into January of the next year', () => {
    expect(advanceCalendar({ year: 190, month: 12 })).toEqual({ year: 191, month: 1 });
  });

  it('moves from player phase to the first AI faction', () => {
    const next = beginAiPhase(createSampleState());

    expect(next.phase).toBe('ai');
    expect(next.activeFactionId).toBe('liu-bei');
  });

  it('settles resources and returns to a new player turn', () => {
    const state = createSampleState();
    state.calendar = { year: 190, month: 12 };
    const previousAges = Object.fromEntries(
      Object.values(state.officers).map((officer) => [officer.id, officer.age]),
    );
    const aiState = beginAiPhase(state);
    const next = finishTurn(aiState);

    expect(next.turn).toBe(2);
    expect(next.calendar).toEqual({ year: 191, month: 1 });
    expect(next.phase).toBe('player');
    expect(next.activeFactionId).toBe('cao-cao');
    expect(next.cities.luoyang.population).toBeGreaterThan(state.cities.luoyang.population);
    expect(next.actedOfficerIds).toEqual([]);
    expect(Object.values(next.officers).every(
      (officer) => officer.age === previousAges[officer.id] + 1,
    )).toBe(true);
    expect(next.logs.some((log) => log.message.includes('人物年龄增长 1 岁'))).toBe(true);
    expect(validateGameState(next)).toEqual([]);
  });

  it('ages serving, free, hidden, captive, and travelling officers exactly once at year rollover', () => {
    let state = createSampleState();
    state.calendar = { year: 190, month: 12 };
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'free',
      factionId: 'neutral',
      cityId: 'hanzhong',
    };
    state.officers['xun-yu'] = {
      ...state.officers['xun-yu'],
      status: 'hidden',
      factionId: 'neutral',
      cityId: undefined,
    };
    state.officers['guan-yu'] = {
      ...state.officers['guan-yu'],
      status: 'captive',
      factionId: 'neutral',
      captorFactionId: 'cao-cao',
      formerFactionId: 'liu-bei',
      cityId: 'luoyang',
      troops: 0,
      stamina: 0,
    };
    state = issueMoveOrder(state, {
      sourceCityId: 'chenliu',
      targetCityId: 'chang-an',
      officerId: 'zhang-liao',
    });
    const previousAges = Object.fromEntries(
      Object.values(state.officers).map((officer) => [officer.id, officer.age]),
    );

    const january = finishTurn(beginAiPhase(state));
    const february = finishTurn(beginAiPhase(january));

    for (const officer of Object.values(january.officers)) {
      expect(officer.age).toBe(previousAges[officer.id] + 1);
      expect(february.officers[officer.id].age).toBe(officer.age);
    }
    expect(validateGameState(february)).toEqual([]);
  });

  it('consumes transport randomness before random-city annual appearance', () => {
    const state = createSampleState();
    state.calendar = { year: 190, month: 12 };
    state.rngSeed = 1972;
    state.officers['chen-gong'] = {
      ...state.officers['chen-gong'],
      status: 'hidden',
      cityId: undefined,
      appearanceYear: 191,
      appearanceCityId: undefined,
    };
    const moving = issueTransportOrder(state, {
      sourceCityId: 'chenliu',
      targetCityId: 'luoyang',
      officerId: 'zhang-liao',
      cargo: { money: 40, food: 80, reserveTroops: 120 },
    });
    const transportDraw = nextRandom(moving.rngSeed);
    const appearanceDraw = nextRandom(transportDraw.seed);
    const orderedCityIds = Object.values(moving.cities)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((city) => city.id);

    const next = finishTurn({ ...moving, phase: 'ai', activeFactionId: 'liu-bei' });

    expect(next.rngSeed).not.toBe(appearanceDraw.seed);
    expect(next.officers['chen-gong'].cityId).toBe(
      orderedCityIds[Math.floor(appearanceDraw.value * orderedCityIds.length)],
    );
    expect(next.logs.some((log) => log.message.includes('输送途中受损'))).toBe(true);
    expect(validateGameState(next)).toEqual([]);
  });

  it('advances a saved multi-month move exactly once during real month settlement', () => {
    const moving = issueMoveOrder(createSampleState(), {
      sourceCityId: 'chenliu',
      targetCityId: 'chang-an',
      officerId: 'zhang-liao',
    });
    const reloaded = parseSave(serializeSave(moving)).state;

    const afterOneMonth = finishTurn(beginAiPhase(reloaded));

    expect(afterOneMonth.calendar).toEqual({ year: 190, month: 2 });
    expect(afterOneMonth.officers['zhang-liao'].cityId).toBeUndefined();
    expect(Object.values(afterOneMonth.strategicOrders)[0].remainingMonths).toBe(1);
    expect(afterOneMonth.actedOfficerIds).toEqual([]);
    expect(validateGameState(afterOneMonth)).toEqual([]);
  });

  it('finishes a month while an unresolved captive remains in prison', () => {
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

    const next = finishTurn(beginAiPhase(state));

    expect(next.officers['chen-gong']).toMatchObject({ status: 'captive', stamina: 0, troops: 0 });
    expect(validateGameState(next)).toEqual([]);
  });

  it('pauses AI progression before an attack against the player', () => {
    const state = createSampleState();
    state.officers['guan-yu'].troops = 100_000;
    state.cities['chang-an'].reserveTroops = 0;
    state.cities.hanzhong.food = 30_000;
    const progress = advanceTurnUntilPlayerDefense(state);

    expect(progress.completed).toBe(false);
    expect(progress.state.phase).toBe('ai');
    expect(progress.pendingPlayerDefense).toBeDefined();
    expect(progress.state.cities[progress.pendingPlayerDefense!.order.targetCityId].ownerId).toBe(state.playerFactionId);
    expect(progress.state.logs.at(-1)?.message).toContain('决定从');
    expect(progress.state.logs.at(-1)?.kind).toBe('ai');
    expect(validateGameState(progress.state)).toEqual([]);
  });

  it('can resolve a paused player defence and return a valid AI-phase state', () => {
    let state = issueMoveOrder(createSampleState(), {
      sourceCityId: 'chenliu',
      targetCityId: 'chang-an',
      officerId: 'zhang-liao',
    });
    state.officers['guan-yu'].troops = 100_000;
    state.officers['cao-cao'].cityId = 'chang-an';
    state.cities['chang-an'].reserveTroops = 0;
    state.cities.hanzhong.food = 30_000;
    state = updateCitySatraps(state);
    const progress = advanceTurnUntilPlayerDefense(state);
    const pending = progress.pendingPlayerDefense!;
    let battle = createTacticalBattle(progress.state, pending.order);
    battle = endTacticalSide(battle);
    const defender = Object.values(battle.units).find((unit) => unit.side === 'defender' && unit.officerId)!;
    const attacker = Object.values(battle.units).find((unit) => unit.side === 'attacker')!;
    battle = {
      ...battle,
      units: {
        ...battle.units,
        [defender.id]: { ...defender, x: 5, y: 4 },
        [attacker.id]: { ...attacker, x: 4, y: 4, troops: 1 },
      },
    };
    const finished = attackTacticalUnit(battle, defender.id, attacker.id);
    const resumed = applyBattleResult(progress.state, createTacticalBattleResult(finished));

    expect(finished.status).toBe('defender-won');
    expect(resumed.phase).toBe('ai');
    expect(Object.values(progress.state.strategicOrders)[0].remainingMonths).toBe(2);
    expect(Object.values(resumed.strategicOrders)[0].remainingMonths).toBe(2);
    expect(resumed.cities[pending.order.targetCityId].ownerId).toBe(state.playerFactionId);
    expect(validateGameState(resumed)).toEqual([]);

    const completed = continueTurnUntilPlayerDefense(resumed, pending.nextFactionIndex);
    expect(completed.completed).toBe(true);
    expect(Object.values(completed.state.strategicOrders)[0].remainingMonths).toBe(1);
    expect(completed.state.calendar).toEqual({ year: 190, month: 2 });
  });
});
