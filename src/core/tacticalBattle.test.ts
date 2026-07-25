import { describe, expect, it } from 'vitest';
import {
  buildBayeAttackAttributes,
  countBayeAttackDamage,
  getBayeTerrainShift,
} from '../compat/baye/tacticalBattle';
import { applyBattleResult } from './battle';
import { createSampleState } from './sampleState';
import {
  attackTacticalUnit,
  createTacticalBattle,
  createTacticalBattleResult,
  endTacticalSide,
  getReachableTiles,
  getTacticalPath,
  getTacticalTile,
  moveTacticalUnit,
  previewTacticalAttack,
  runBasicTacticalAi,
} from './tacticalBattle';
import { validateGameState } from './validation';

function battleFixture() {
  const state = createSampleState();
  state.officers['cao-cao'].cityId = 'chang-an';
  const order = {
    sourceCityId: 'chang-an',
    targetCityId: 'hanzhong',
    officerIds: ['cao-cao'],
    provisions: 100,
  };
  return { state, order };
}

describe('manual tactical battle core', () => {
  it('creates a battle session without mutating strategic state', () => {
    const { state, order } = battleFixture();
    const snapshot = structuredClone(state);
    const battle = createTacticalBattle(state, order);

    expect(state).toEqual(snapshot);
    expect(battle.sourceCityId).toBe('chang-an');
    expect(battle.targetCityId).toBe('hanzhong');
    expect(battle.units['officer:cao-cao'].side).toBe('attacker');
    expect(battle.units['officer:guan-yu'].side).toBe('defender');
    expect(battle.units['reserve:hanzhong'].troops).toBe(state.cities.hanzhong.reserveTroops);
  });

  it('projects equipped attribute and movement bonuses into manual battle units', () => {
    const { state, order } = battleFixture();
    state.officers['cao-cao'].equipmentItemIds = ['qinglong-blade', 'red-hare'];

    const unit = createTacticalBattle(state, order).units['officer:cao-cao'];

    expect(unit.force).toBe(state.officers['cao-cao'].force + state.items['qinglong-blade'].forceBonus);
    expect(unit.intelligence).toBe(state.officers['cao-cao'].intelligence);
    expect(unit.mobility).toBe(Math.min(
      8,
      state.armsTypes[state.officers['cao-cao'].armsTypeId].mobility + state.items['red-hare'].moveBonus,
    ));
  });

  it('rejects deployments above the original ten-officer side limit', () => {
    const { state, order } = battleFixture();
    const defender = state.officers['guan-yu'];
    for (let index = 0; index < 10; index += 1) {
      const id = `extra-defender-${index}`;
      state.officers[id] = { ...defender, id, name: `守将${index}` };
    }

    expect(() => createTacticalBattle(state, order)).toThrow('每方最多可部署 10 名武将');
  });

  it('calculates deterministic reachable tiles and rejects occupied destinations', () => {
    const { state, order } = battleFixture();
    const battle = createTacticalBattle(state, order);
    const reachable = getReachableTiles(battle, 'officer:cao-cao');

    expect(reachable).toEqual(getReachableTiles(battle, 'officer:cao-cao'));
    expect(reachable.length).toBeGreaterThan(0);
    expect(() => moveTacticalUnit(battle, 'officer:cao-cao', { x: 10, y: 4 })).toThrow('可移动范围');

    const destination = reachable[0];
    const moved = moveTacticalUnit(battle, 'officer:cao-cao', destination);
    expect(moved.units['officer:cao-cao']).toMatchObject({ ...destination, moved: true, acted: false });
    expect(battle.units['officer:cao-cao']).not.toEqual(moved.units['officer:cao-cao']);
  });

  it('uses the verified Baye attribute and normal-damage formula', () => {
    const { state, order } = battleFixture();
    state.cities.hanzhong.reserveTroops = 0;
    let battle = createTacticalBattle(state, order);
    const attacker = battle.units['officer:cao-cao'];
    const defender = battle.units['officer:guan-yu'];
    battle = {
      ...battle,
      units: {
        ...battle.units,
        [attacker.id]: { ...attacker, x: 4, y: 4 },
        [defender.id]: { ...defender, x: 5, y: 4 },
      },
    };

    const attackerTerrain = getTacticalTile(battle, 4, 4)!.terrain;
    const defenderTerrain = getTacticalTile(battle, 5, 4)!.terrain;
    const attack = buildBayeAttackAttributes({
      force: attacker.force,
      intelligence: attacker.intelligence,
      level: attacker.level,
      armsType: attacker.armsType,
      terrain: attackerTerrain,
      terrainShift: getBayeTerrainShift(attacker.armsType, attackerTerrain),
    });
    const defence = buildBayeAttackAttributes({
      force: defender.force,
      intelligence: defender.intelligence,
      level: defender.level,
      armsType: defender.armsType,
      terrain: defenderTerrain,
      terrainShift: getBayeTerrainShift(defender.armsType, defenderTerrain),
    });
    const expectedDamage = countBayeAttackDamage({
      attack: attack.attack,
      defence: defence.defence,
      troops: attacker.troops,
      attackerArmsType: attacker.armsType,
      defenderArmsType: defender.armsType,
    });

    const preview = previewTacticalAttack(battle, attacker.id, defender.id);
    const next = attackTacticalUnit(battle, attacker.id, defender.id);
    expect(defender.troops - next.units[defender.id].troops).toBe(expectedDamage);
    expect(preview.damage).toBe(expectedDamage);
    expect(preview.targetTroopsAfter).toBe(next.units[defender.id].troops);
    expect(next.units[attacker.id].acted).toBe(true);
  });

  it('uses deterministic paths and gives water troops a river-crossing advantage', () => {
    const { state, order } = battleFixture();
    let battle = createTacticalBattle(state, order);
    const attacker = battle.units['officer:cao-cao'];
    battle = {
      ...battle,
      tiles: battle.tiles.map((tile) => ({ ...tile, terrain: tile.x === 2 && tile.y === 4 ? 7 : 0 })),
      units: { ...battle.units, [attacker.id]: { ...attacker, x: 1, y: 4, armsType: 0, mobility: 5 } },
    };
    expect(getReachableTiles(battle, attacker.id)).not.toContainEqual({ x: 2, y: 4 });

    const navyBattle: typeof battle = {
      ...battle,
      units: { ...battle.units, [attacker.id]: { ...battle.units[attacker.id], armsType: 3 as const } },
    };
    const path = getTacticalPath(navyBattle, attacker.id, { x: 2, y: 4 });
    expect(path).toEqual([{ x: 1, y: 4 }, { x: 2, y: 4 }]);
    expect(path).toEqual(getTacticalPath(navyBattle, attacker.id, { x: 2, y: 4 }));
  });

  it('requires the attacker to hold the city until its phase ends', () => {
    const { state, order } = battleFixture();
    state.cities.hanzhong.reserveTroops = 0;
    let battle = createTacticalBattle(state, order);
    const attacker = battle.units['officer:cao-cao'];
    const objective = battle.tiles.find((tile) => tile.objective === 'city')!;
    const adjacent = { x: Math.max(0, objective.x - 1), y: objective.y };
    battle = {
      ...battle,
      tiles: battle.tiles.map((tile) => (
        tile.x === adjacent.x && tile.y === adjacent.y ? { ...tile, terrain: 0 } : tile
      )),
      units: {
        ...battle.units,
        [attacker.id]: { ...attacker, ...adjacent, mobility: 6 },
      },
    };
    const occupied = moveTacticalUnit(battle, attacker.id, objective);
    expect(occupied.status).toBe('ongoing');

    const finished = endTacticalSide(occupied);
    expect(finished.status).toBe('attacker-won');
    expect(finished.victoryReason).toBe('objective-held');
  });

  it('runs the basic AI deterministically and returns control to the other side', () => {
    const { state, order } = battleFixture();
    const playerEnded = endTacticalSide(createTacticalBattle(state, order));

    const first = runBasicTacticalAi(playerEnded);
    const second = runBasicTacticalAi(playerEnded);
    expect(first).toEqual(second);
    expect(first.activeSide).toBe('attacker');
    expect(first.day).toBe(2);
  });

  it('creates one atomic strategic result after a manual victory', () => {
    const { state, order } = battleFixture();
    state.cities.hanzhong.reserveTroops = 0;
    state.officers['guan-yu'].troops = 1;
    state.officers['liu-bei'].cityId = 'hanzhong';
    state.officers['liu-bei'].troops = 0;
    let battle = createTacticalBattle(state, order);
    const attacker = battle.units['officer:cao-cao'];
    const defender = battle.units['officer:guan-yu'];
    battle = {
      ...battle,
      units: {
        ...battle.units,
        [attacker.id]: { ...attacker, x: 4, y: 4 },
        [defender.id]: { ...defender, x: 5, y: 4 },
      },
    };
    const finished = attackTacticalUnit(battle, attacker.id, defender.id);
    const result = createTacticalBattleResult(finished);
    const next = applyBattleResult(state, result);

    expect(result.winner).toBe('attacker');
    expect(next.cities.hanzhong.ownerId).toBe('cao-cao');
    expect(next.officers['cao-cao'].cityId).toBe('hanzhong');
    expect(next.officers['liu-bei'].cityId).toBe('chengdu');
    expect(next.cities.hanzhong.food).toBe(finished.attackerFood + finished.defenderFood);
    expect(validateGameState(next)).toEqual([]);
    expect(() => applyBattleResult(next, result)).toThrow();
  });

  it('rejects a result when a participant changed outside the battle', () => {
    const { state, order } = battleFixture();
    state.cities.hanzhong.reserveTroops = 0;
    state.officers['guan-yu'].troops = 1;
    let battle = createTacticalBattle(state, order);
    const attacker = battle.units['officer:cao-cao'];
    const defender = battle.units['officer:guan-yu'];
    battle = {
      ...battle,
      units: {
        ...battle.units,
        [attacker.id]: { ...attacker, x: 4, y: 4 },
        [defender.id]: { ...defender, x: 5, y: 4 },
      },
    };
    const result = createTacticalBattleResult(attackTacticalUnit(battle, attacker.id, defender.id));
    const changed = structuredClone(state);
    changed.officers['cao-cao'].troops -= 1;

    expect(() => applyBattleResult(changed, result)).toThrow('stale participant state');
  });

  it('preserves full strategic troop counts above the legacy U16 damage input', () => {
    const { state, order } = battleFixture();
    state.officers['cao-cao'].troops = 100_000;
    state.cities.hanzhong.reserveTroops = 90_000;
    const battle = createTacticalBattle(state, order);

    expect(battle.units['officer:cao-cao'].troops).toBe(100_000);
    expect(battle.units['reserve:hanzhong'].troops).toBe(90_000);

    const defeated = {
      ...battle,
      status: 'defender-won' as const,
      units: {
        ...battle.units,
        'officer:cao-cao': { ...battle.units['officer:cao-cao'], troops: 0 },
      },
    };
    const next = applyBattleResult(state, createTacticalBattleResult(defeated));
    expect(next.officers['cao-cao'].troops).toBe(0);
  });

  it('rejects a result when combat attributes, arms data, or city defense changed', () => {
    const { state, order } = battleFixture();
    const battle = { ...createTacticalBattle(state, order), status: 'defender-won' as const };
    const result = createTacticalBattleResult(battle);

    const changedForce = structuredClone(state);
    changedForce.officers['cao-cao'].force += 1;
    expect(() => applyBattleResult(changedForce, result)).toThrow('stale participant state');

    const changedMobility = structuredClone(state);
    changedMobility.armsTypes[state.officers['cao-cao'].armsTypeId].mobility += 1;
    expect(() => applyBattleResult(changedMobility, result)).toThrow('stale participant state');

    const changedDefense = structuredClone(state);
    changedDefense.cities.hanzhong.defense += 1;
    expect(() => applyBattleResult(changedDefense, result)).toThrow('stale target resources');
  });

  it('only writes actual reserve casualties when the attacker wins by food exhaustion', () => {
    const { state, order } = battleFixture();
    const battle = createTacticalBattle(state, order);
    const finished = { ...battle, defenderFood: 0, status: 'attacker-won' as const };
    const result = createTacticalBattleResult(finished);
    const next = applyBattleResult(state, result);

    expect(result.defenderReserveLosses).toBe(0);
    expect(next.cities.hanzhong.reserveTroops).toBe(state.cities.hanzhong.reserveTroops);
  });

  it('ends with a defender victory when attacker provisions are exhausted', () => {
    const { state, order } = battleFixture();
    let battle = createTacticalBattle(state, order);
    battle = { ...battle, attackerFood: 1 };
    battle = endTacticalSide(battle);
    battle = endTacticalSide(battle);

    expect(battle.status).toBe('defender-won');
    expect(createTacticalBattleResult(battle).winner).toBe('defender');
  });
});
