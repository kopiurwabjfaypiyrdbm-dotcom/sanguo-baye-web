import { describe, expect, it } from 'vitest';
import { updateCitySatraps } from './administration';
import { applyBattleResult } from './battle';
import { createSampleState } from './sampleState';
import { advanceCalendar, advanceTurnUntilPlayerDefense, beginAiPhase, finishTurn } from './turn';
import {
  attackTacticalUnit,
  createTacticalBattle,
  createTacticalBattleResult,
  endTacticalSide,
} from './tacticalBattle';
import { validateGameState } from './validation';

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
    const aiState = beginAiPhase(state);
    const next = finishTurn(aiState);

    expect(next.turn).toBe(2);
    expect(next.calendar).toEqual({ year: 191, month: 1 });
    expect(next.phase).toBe('player');
    expect(next.activeFactionId).toBe('cao-cao');
    expect(next.cities.luoyang.population).toBeGreaterThan(state.cities.luoyang.population);
    expect(next.actedOfficerIds).toEqual([]);
    expect(validateGameState(next)).toEqual([]);
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
    let state = createSampleState();
    state.officers['guan-yu'].troops = 100_000;
    state.officers['cao-cao'].cityId = 'chang-an';
    state.cities['chang-an'].reserveTroops = 0;
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
    expect(resumed.cities[pending.order.targetCityId].ownerId).toBe(state.playerFactionId);
    expect(validateGameState(resumed)).toEqual([]);
  });
});
