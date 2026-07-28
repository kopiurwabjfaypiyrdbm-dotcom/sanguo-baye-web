import { describe, expect, it } from 'vitest';
import {
  buildBayeAttackAttributes,
  countBayeAttackDamage,
  getModernTerrainShift,
} from '../compat/baye/tacticalBattle';
import { applyBattleResult } from './battle';
import { createSampleState } from './sampleState';
import { createBundledScenario, getScenarioRulers } from '../data/bundledScenarios';
import {
  attackTacticalUnit,
  createTacticalBattle,
  createTacticalBattleResult,
  endTacticalSide,
  getAttackableUnitIds,
  getAvailableTacticalSkills,
  getReachableTiles,
  getTacticalPath,
  getTacticalTile,
  moveTacticalUnit,
  previewTacticalAttack,
  previewTacticalSkill,
  retreatTacticalSide,
  runBasicTacticalAi,
  useTacticalSkill,
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
    expect(unit.maxSkillPoints).toBeGreaterThan(0);
    expect(unit.skillPoints).toBe(unit.maxSkillPoints);
  });

  it('uses deterministic weather-aware fire tactics and records experience', () => {
    const { state, order } = battleFixture();
    let battle = createTacticalBattle(state, order);
    const attacker = battle.units['officer:cao-cao'];
    const defender = battle.units['officer:guan-yu'];
    battle = {
      ...battle,
      weather: 'wind',
      units: {
        ...battle.units,
        [attacker.id]: { ...attacker, x: 4, y: 4, intelligence: 255, skillPoints: 255 },
        [defender.id]: { ...defender, x: 5, y: 4, intelligence: 0 },
      },
    };

    const next = useTacticalSkill(battle, attacker.id, 'fire', defender.id);

    expect(next).toEqual(useTacticalSkill(structuredClone(battle), attacker.id, 'fire', defender.id));
    expect(next.units[defender.id].troops).toBeLessThan(defender.troops);
    expect(next.units[attacker.id].skillPoints).toBeLessThan(255);
    expect(next.experienceGains['cao-cao']).toBeGreaterThan(0);
    expect(next.logs.at(-1)).toContain('火计');
  });

  it('applies confusion on the target next phase and changes weather each day', () => {
    const { state, order } = battleFixture();
    let battle = createTacticalBattle(state, order);
    const attacker = battle.units['officer:cao-cao'];
    const defender = battle.units['officer:guan-yu'];
    battle = {
      ...battle,
      units: {
        ...battle.units,
        [attacker.id]: { ...attacker, x: 4, y: 4, intelligence: 255, skillPoints: 255 },
        [defender.id]: { ...defender, x: 5, y: 4, intelligence: 0 },
      },
    };

    const confused = useTacticalSkill(battle, attacker.id, 'confuse', defender.id);
    const defenderPhase = endTacticalSide(confused);

    expect(defenderPhase.units[defender.id]).toMatchObject({ status: 'confused', statusTurns: 0, acted: true });
    expect(defenderPhase.logs.some((message) => message.includes('跳过本阶段行动'))).toBe(true);
    const nextDay = endTacticalSide(defenderPhase);
    expect(nextDay.day).toBe(2);
    expect(nextDay.rngSeed).not.toBe(defenderPhase.rngSeed);
    expect(nextDay.logs.some((message) => message.includes('天气转为'))).toBe(true);
    expect(nextDay.units[defender.id].status).toBe('confused');
    expect(nextDay.units[defender.id].statusTurns).toBe(0);
  });

  it('consumes skill points but grants no experience when a tactic fails', () => {
    const { state, order } = battleFixture();
    let battle = createTacticalBattle(state, order);
    const attacker = battle.units['officer:cao-cao'];
    const defender = battle.units['officer:guan-yu'];
    battle = {
      ...battle,
      rngSeed: 1,
      units: {
        ...battle.units,
        [attacker.id]: { ...attacker, x: 4, y: 4, intelligence: 70, skillPoints: 100 },
        [defender.id]: { ...defender, x: 5, y: 4, intelligence: 255 },
      },
    };

    const next = useTacticalSkill(battle, attacker.id, 'confuse', defender.id);

    expect(next.units[defender.id].status).toBe('normal');
    expect(next.units[attacker.id].skillPoints).toBeLessThan(100);
    expect(next.experienceGains['cao-cao']).toBeUndefined();
    expect(next.logs.at(-1)).toContain('未能奏效');
  });

  it('rallies a damaged ally, clears confusion, and restores its skipped action', () => {
    const { state, order } = battleFixture();
    state.officers['xiahou-dun'].cityId = 'chang-an';
    order.officerIds.push('xiahou-dun');
    let battle = createTacticalBattle(state, order);
    const attacker = battle.units['officer:cao-cao'];
    const ally = battle.units['officer:xiahou-dun'];
    battle = {
      ...battle,
      units: {
        ...battle.units,
        [attacker.id]: { ...attacker, x: 4, y: 4, intelligence: 255, skillPoints: 255 },
        [ally.id]: {
          ...ally, x: 5, y: 4, troops: 100, status: 'confused', statusTurns: 0, moved: true, acted: true,
        },
      },
    };

    const next = useTacticalSkill(battle, attacker.id, 'rally', ally.id);

    expect(next.units[ally.id].troops).toBeGreaterThan(100);
    expect(next.units[ally.id]).toMatchObject({ status: 'normal', statusTurns: 0, moved: false, acted: false });
  });

  it('selects the first ten defenders when a city has more than the side limit', () => {
    const { state, order } = battleFixture();
    const defender = state.officers['guan-yu'];
    for (let index = 0; index < 10; index += 1) {
      const id = `extra-defender-${index}`;
      state.officers[id] = { ...defender, id, name: `守将${index}` };
    }

    const battle = createTacticalBattle(state, order);

    expect(battle.defenderOfficerIds).toHaveLength(10);
    expect(Object.values(battle.units).filter((unit) => unit.side === 'defender' && unit.id.startsWith('officer:')))
      .toHaveLength(10);
  });

  it('opens a manual battle against an over-capacity city in bundled period 2', () => {
    const state = createBundledScenario(2, getScenarioRulers(2)[0].sourceIndex);
    const serving = Object.values(state.officers).filter((officer) => officer.status === 'serving');
    const target = Object.values(state.cities).find((city) => {
      const defenderCount = serving.filter((officer) => officer.cityId === city.id && officer.troops > 0).length;
      return defenderCount > 10 && city.neighbors.some((neighborId) => {
        const neighbor = state.cities[neighborId];
        return neighbor.ownerId !== city.ownerId
          && serving.some((officer) => officer.cityId === neighbor.id && officer.troops > 0);
      });
    });
    expect(target).toBeDefined();
    const source = target!.neighbors
      .map((cityId) => state.cities[cityId])
      .find((city) => city.ownerId !== target!.ownerId
        && serving.some((officer) => officer.cityId === city.id && officer.troops > 0))!;
    const attacker = serving.find((officer) => officer.cityId === source.id && officer.troops > 0)!;
    state.playerFactionId = source.ownerId;
    state.activeFactionId = source.ownerId;

    const battle = createTacticalBattle(state, {
      sourceCityId: source.id,
      targetCityId: target!.id,
      officerIds: [attacker.id],
      provisions: 1,
    });

    expect(battle.defenderOfficerIds).toHaveLength(10);
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
      terrainShift: getModernTerrainShift(attacker.armsType, attackerTerrain),
    });
    const defence = buildBayeAttackAttributes({
      force: defender.force,
      intelligence: defender.intelligence,
      level: defender.level,
      armsType: defender.armsType,
      terrain: defenderTerrain,
      terrainShift: getModernTerrainShift(defender.armsType, defenderTerrain),
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

  it('lets a configured equipment slot replace the normal attack pattern', () => {
    const { state, order } = battleFixture();
    state.items['qinglong-blade'].normalAttackPatternOverride = 'manhattan-ring-two';
    state.officers['cao-cao'].equipmentItemIds = ['qinglong-blade'];
    let battle = createTacticalBattle(state, order);
    const attacker = battle.units['officer:cao-cao'];
    const defender = battle.units['officer:guan-yu'];
    battle = {
      ...battle,
      units: {
        ...battle.units,
        [attacker.id]: { ...attacker, x: 4, y: 4 },
        [defender.id]: { ...defender, x: 6, y: 4 },
      },
    };

    expect(attacker.normalAttackPatternOverride).toBe('manhattan-ring-two');
    expect(getAttackableUnitIds(battle, attacker.id)).toContain(defender.id);
  });

  it('uses the original semantic normal-attack shapes for all six arms', () => {
    const { state, order } = battleFixture();
    let battle = createTacticalBattle(state, order);
    const attacker = battle.units['officer:cao-cao'];
    const defender = battle.units['officer:guan-yu'];
    battle = {
      ...battle,
      units: {
        ...battle.units,
        [attacker.id]: { ...attacker, x: 4, y: 4 },
        [defender.id]: { ...defender, x: 5, y: 5 },
      },
    };

    for (const armsType of [0, 3, 5] as const) {
      const orthogonal = {
        ...battle,
        units: { ...battle.units, [attacker.id]: { ...battle.units[attacker.id], armsType } },
      };
      expect(getAttackableUnitIds(orthogonal, attacker.id)).not.toContain(defender.id);
    }
    for (const armsType of [1, 4] as const) {
      const adjacentEight = {
        ...battle,
        units: { ...battle.units, [attacker.id]: { ...battle.units[attacker.id], armsType } },
      };
      expect(getAttackableUnitIds(adjacentEight, attacker.id)).toContain(defender.id);
    }
    const archerRing = {
      ...battle,
      units: {
        ...battle.units,
        [attacker.id]: { ...battle.units[attacker.id], armsType: 2 as const },
        [defender.id]: { ...battle.units[defender.id], x: 6, y: 4 },
      },
    };
    expect(getAttackableUnitIds(archerRing, attacker.id)).toContain(defender.id);
    const archerAdjacent = {
      ...archerRing,
      units: { ...archerRing.units, [defender.id]: { ...archerRing.units[defender.id], x: 5, y: 4 } },
    };
    expect(getAttackableUnitIds(archerAdjacent, attacker.id)).not.toContain(defender.id);
  });

  it('lets either active side retreat through the normal strategic result path', () => {
    const { state, order } = battleFixture();
    const attackBattle = createTacticalBattle(state, order);
    const attackRetreat = retreatTacticalSide(attackBattle, 'attacker');
    expect(attackRetreat).toMatchObject({ status: 'defender-won', victoryReason: 'attacker-retreated' });
    expect(createTacticalBattleResult(attackRetreat).winner).toBe('defender');
    expect(validateGameState(applyBattleResult(state, createTacticalBattleResult(attackRetreat)))).toEqual([]);

    const defendBattle = endTacticalSide(createTacticalBattle(state, order));
    const defendRetreat = retreatTacticalSide(defendBattle, 'defender');
    expect(defendRetreat).toMatchObject({ status: 'attacker-won', victoryReason: 'defender-retreated' });
    expect(createTacticalBattleResult(defendRetreat)).toMatchObject({ winner: 'attacker', cityCaptured: true });
    expect(() => retreatTacticalSide(attackBattle, 'defender')).toThrow('本方行动阶段');
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

  it('lets the tactical AI use the same skill command as the player', () => {
    const { state, order } = battleFixture();
    let battle = endTacticalSide(createTacticalBattle(state, order));
    const attacker = battle.units['officer:cao-cao'];
    const defender = battle.units['officer:guan-yu'];
    battle = {
      ...battle,
      units: {
        ...battle.units,
        [attacker.id]: { ...attacker, x: 4, y: 4, intelligence: 0 },
        [defender.id]: { ...defender, x: 5, y: 4, intelligence: 255, skillPoints: 255 },
      },
    };

    const next = runBasicTacticalAi(battle);

    expect(next.logs.some((message) => message.includes('施展扰乱'))).toBe(true);
    expect(next).toEqual(runBasicTacticalAi(structuredClone(battle)));
  });

  it('lets tactical AI act with a unit restored by a later rally', () => {
    const { state, order } = battleFixture();
    let battle = endTacticalSide(createTacticalBattle(state, order));
    const confused = battle.units['officer:guan-yu'];
    const strategist = {
      ...confused,
      id: 'officer:z-strategist',
      officerId: 'z-strategist',
      name: '军师',
      x: 6,
      y: 4,
      intelligence: 255,
      skillPoints: 255,
      maxSkillPoints: 255,
      status: 'normal' as const,
      statusTurns: 0,
      moved: false,
      acted: false,
    };
    battle = {
      ...battle,
      units: {
        ...battle.units,
        [confused.id]: {
          ...confused,
          x: 5,
          y: 4,
          status: 'confused',
          statusTurns: 0,
          moved: true,
          acted: true,
        },
        [strategist.id]: strategist,
      },
    };

    const next = runBasicTacticalAi(battle);
    const rallyIndex = next.logs.findIndex((message) => message.includes('军师对关羽施展激励'));

    expect(rallyIndex).toBeGreaterThanOrEqual(0);
    expect(next.logs.slice(rallyIndex + 1).some((message) => message.startsWith('关羽'))).toBe(true);
  });

  it('creates one atomic strategic result after a manual victory', () => {
    const { state, order } = battleFixture();
    state.cities.hanzhong.reserveTroops = 0;
    state.officers['guan-yu'].troops = 1;
    state.officers['guan-yu'].intelligence = 0;
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
    expect(next.officers['liu-bei']).toMatchObject({
      status: 'captive',
      captorFactionId: 'cao-cao',
      formerFactionId: 'liu-bei',
      cityId: 'hanzhong',
    });
    expect(next.factions['liu-bei'].rulerOfficerId).toBe('zhuge-liang');
    expect(next.officers['guan-yu']).toMatchObject({
      status: 'captive', captorFactionId: 'cao-cao', formerFactionId: 'liu-bei', cityId: 'hanzhong',
    });
    expect(next.officers['cao-cao'].experience).toBeGreaterThan(state.officers['cao-cao'].experience ?? 0);
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

  it('rejects a result when a target-city captive appeared after battle creation', () => {
    const { state, order } = battleFixture();
    const battle = { ...createTacticalBattle(state, order), status: 'defender-won' as const };
    const result = createTacticalBattleResult(battle);
    const changed = structuredClone(state);
    changed.cities.luoyang.satrapOfficerId = 'xiahou-dun';
    changed.officers['chen-gong'] = {
      ...changed.officers['chen-gong'],
      status: 'captive',
      factionId: 'neutral',
      cityId: 'hanzhong',
      captorFactionId: 'liu-bei',
      formerFactionId: 'cao-cao',
      troops: 0,
      stamina: 0,
    };
    expect(validateGameState(changed)).toEqual([]);
    expect(() => applyBattleResult(changed, result)).toThrow('stale strategic state');
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

  it('selects six deterministic modern battlefield templates by city index', () => {
    const { state, order } = battleFixture();
    const signatures = new Set<string>();
    for (let sourceIndex = 0; sourceIndex < 6; sourceIndex += 1) {
      state.cities.hanzhong.sourceIndex = sourceIndex;
      const battle = createTacticalBattle(state, order);
      signatures.add(`${battle.battlefieldTemplate}:${battle.tiles.map((tile) => tile.terrain).join('')}`);
      expect(battle.battlefieldKey).toContain(String(sourceIndex));
      expect(battle.tiles.some((tile) => tile.objective === 'city')).toBe(true);
    }
    expect(signatures.size).toBe(6);
  });

  it('lets friendly units be crossed, applies enemy control zones, and lets qimen bypass them', () => {
    const { state, order } = battleFixture();
    state.officers['xiahou-dun'].cityId = 'chang-an';
    order.officerIds.push('xiahou-dun');
    let battle = createTacticalBattle(state, order);
    const actor = battle.units['officer:cao-cao'];
    const ally = battle.units['officer:xiahou-dun'];
    const enemy = battle.units['officer:guan-yu'];
    battle = {
      ...battle,
      tiles: battle.tiles.map((tile) => ({ ...tile, terrain: 0 })),
      units: {
        ...battle.units,
        [actor.id]: { ...actor, x: 1, y: 4, mobility: 3 },
        [ally.id]: { ...ally, x: 2, y: 4 },
        [enemy.id]: { ...enemy, x: 3, y: 3 },
      },
    };

    expect(getTacticalPath(battle, actor.id, { x: 3, y: 4 })).toEqual([
      { x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 },
    ]);
    expect(getReachableTiles(battle, actor.id)).not.toContainEqual({ x: 4, y: 4 });
    const qimen = {
      ...battle,
      units: { ...battle.units, [actor.id]: { ...battle.units[actor.id], status: 'qimen' as const } },
    };
    expect(getReachableTiles(qimen, actor.id)).toContainEqual({ x: 4, y: 4 });
    const rooted = {
      ...qimen,
      units: { ...qimen.units, [actor.id]: { ...qimen.units[actor.id], status: 'rooted' as const } },
    };
    expect(getReachableTiles(rooted, actor.id)).toEqual([]);
    expect(getTacticalPath(rooted, actor.id, { x: 2, y: 4 })).toEqual([]);
  });

  it('enforces silence, stealth targeting, and dunjia damage reduction', () => {
    const { state, order } = battleFixture();
    let battle = createTacticalBattle(state, order);
    const attacker = battle.units['officer:cao-cao'];
    const defender = battle.units['officer:guan-yu'];
    battle = {
      ...battle,
      units: {
        ...battle.units,
        [attacker.id]: { ...attacker, x: 4, y: 4, armsType: 2, skillPoints: 255 },
        [defender.id]: { ...defender, x: 6, y: 4 },
      },
    };
    const silenced = { ...attacker, status: 'silenced' as const };
    expect(getAvailableTacticalSkills(silenced)).toEqual([]);

    const hidden = {
      ...battle,
      units: { ...battle.units, [defender.id]: { ...defender, x: 6, y: 4, status: 'hidden' as const } },
    };
    expect(getAttackableUnitIds(hidden, attacker.id)).not.toContain(defender.id);

    const adjacent = {
      ...battle,
      units: {
        ...battle.units,
        [attacker.id]: { ...battle.units[attacker.id], armsType: 0 as const },
        [defender.id]: { ...defender, x: 5, y: 4 },
      },
    };
    const protectedBattle = {
      ...adjacent,
      units: { ...adjacent.units, [defender.id]: { ...adjacent.units[defender.id], status: 'dunjia' as const } },
    };
    expect(previewTacticalAttack(protectedBattle, attacker.id, defender.id).damage)
      .toBeLessThan(previewTacticalAttack(adjacent, attacker.id, defender.id).damage);
  });

  it('drives stone-array damage at day change and resolves commander defeat explicitly', () => {
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
        [defender.id]: {
          ...defender,
          x: 5,
          y: 4,
          troops: 80,
          intelligence: 0,
          status: 'stone-array',
          statusTurns: 1,
        },
      },
    };
    const defenderPhase = endTacticalSide(battle);
    const nextDay = endTacticalSide(defenderPhase);
    expect(nextDay.units[defender.id].troops).toBe(70);
    expect(nextDay.logs.some((message) => message.includes('石阵侵蚀'))).toBe(true);

    const commanderAtOne = {
      ...battle,
      units: {
        ...battle.units,
        [defender.id]: { ...battle.units[defender.id], x: 5, y: 4, troops: 1, status: 'normal' as const },
      },
    };
    const finished = attackTacticalUnit(commanderAtOne, attacker.id, defender.id);
    expect(finished.status).toBe('attacker-won');
    expect(finished.victoryReason).toBe('defender-commander-defeated');
  });

  it('uses a data-driven provisions skill and makes preview equal execution', () => {
    const { state, order } = battleFixture();
    let battle = createTacticalBattle(state, order);
    const attacker = battle.units['officer:cao-cao'];
    const defender = battle.units['officer:guan-yu'];
    battle = {
      ...battle,
      defenderFood: 1,
      units: {
        ...battle.units,
        [attacker.id]: { ...attacker, x: 4, y: 4, intelligence: 255, skillPoints: 255 },
        [defender.id]: { ...defender, x: 5, y: 4, intelligence: 0 },
      },
    };
    const before = battle.defenderFood;
    const preview = previewTacticalSkill(battle, attacker.id, 'raid-provisions', defender.id);
    const next = useTacticalSkill(battle, attacker.id, 'raid-provisions', defender.id);
    expect(before - next.defenderFood).toBe(Math.abs(preview.expectedFoodChange));
    expect(next.logs.at(-1)).toContain('劫粮');
    expect(next.status).toBe('ongoing');
    const defenderPhase = endTacticalSide(next);
    expect(defenderPhase.status).toBe('ongoing');
    expect(endTacticalSide(defenderPhase)).toMatchObject({
      status: 'attacker-won',
      victoryReason: 'defender-food-exhausted',
    });
  });

  it('covers food, simultaneous food, day-limit, and annihilation victory priorities', () => {
    const { state, order } = battleFixture();
    const initial = createTacticalBattle(state, order);

    let defenderStarved = { ...initial, defenderFood: 1 };
    defenderStarved = endTacticalSide(defenderStarved);
    defenderStarved = endTacticalSide(defenderStarved);
    expect(defenderStarved).toMatchObject({
      status: 'attacker-won',
      victoryReason: 'defender-food-exhausted',
    });

    const defender = initial.units['officer:guan-yu'];
    let terminalBeforeStatuses = {
      ...initial,
      defenderFood: 1,
      units: {
        ...initial.units,
        [defender.id]: {
          ...defender,
          troops: 80,
          intelligence: 0,
          status: 'stone-array' as const,
          statusTurns: 1,
        },
      },
    };
    const seedBeforeTerminal = terminalBeforeStatuses.rngSeed;
    terminalBeforeStatuses = endTacticalSide(terminalBeforeStatuses);
    terminalBeforeStatuses = endTacticalSide(terminalBeforeStatuses);
    expect(terminalBeforeStatuses).toMatchObject({
      status: 'attacker-won',
      victoryReason: 'defender-food-exhausted',
      rngSeed: seedBeforeTerminal,
    });
    expect(terminalBeforeStatuses.units[defender.id].troops).toBe(80);

    let bothStarved = { ...initial, attackerFood: 1, defenderFood: 1 };
    bothStarved = endTacticalSide(bothStarved);
    bothStarved = endTacticalSide(bothStarved);
    expect(bothStarved).toMatchObject({
      status: 'defender-won',
      victoryReason: 'attacker-food-exhausted',
    });

    let timedOut = { ...initial, day: initial.maxDays };
    timedOut = endTacticalSide(timedOut);
    timedOut = endTacticalSide(timedOut);
    expect(timedOut).toMatchObject({ status: 'defender-won', victoryReason: 'day-limit' });

    const annihilated = {
      ...initial,
      commanderUnitIds: { ...initial.commanderUnitIds, defender: undefined },
      units: Object.fromEntries(Object.entries(initial.units).map(([id, unit]) => [
        id,
        unit.side === 'defender' ? { ...unit, troops: 0 } : unit,
      ])),
    };
    const evaluated = endTacticalSide(annihilated);
    expect(evaluated).toMatchObject({ status: 'attacker-won', victoryReason: 'annihilation' });
  });
});
