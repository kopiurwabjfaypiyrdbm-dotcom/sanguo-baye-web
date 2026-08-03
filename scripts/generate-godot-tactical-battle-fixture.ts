import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, canonicalSha256 } from '../src/core/migration/canonicalJson';
import { createProductionSessionState } from '../src/core/migration/applicationSessionContract';
import { createTacticalBattle, type TacticalBattleState, type TacticalSide } from '../src/core/tacticalBattle';
import { MODERN_TERRAIN_MOVE_COSTS } from '../src/compat/baye/tacticalState';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'godot/data/fixtures/tactical-battle-v1.json');
const writeMode = process.argv.includes('--write');

type JsonObject = Record<string, any>;

export function buildFixture() {
  const initialState = createProductionSessionState(1, 1);
  const order = { sourceCityId: 'city-12', targetCityId: 'city-11', officerIds: ['officer-1'], provisions: 20 };
  const oracleBattle = createTacticalBattle(initialState, order);
  const initialBattle = projectBattle(oracleBattle, initialState);
  const equipmentState = structuredClone(initialState);
  equipmentState.officers['officer-0'].equipmentItemIds = [];
  equipmentState.officers['officer-4'].equipmentItemIds = [];
  equipmentState.officers['officer-1'].equipmentItemIds = ['item-13', 'item-10'];
  const equipmentBattle = createTacticalBattle(equipmentState, order);
  const reserveState = structuredClone(initialState);
  reserveState.cities['city-11'].reserveTroops = 120;
  const reserveBattle = createTacticalBattle(reserveState, order);
  const zeroDefenderState = structuredClone(initialState);
  for (const officerId of ['officer-84', 'officer-81', 'officer-82', 'officer-83', 'officer-10']) zeroDefenderState.officers[officerId].troops = 0;
  const zeroDefenderBattle = projectBattle(createTacticalBattle(zeroDefenderState, order), zeroDefenderState);
  const session = new ReferenceSession(initialBattle);
  const steps: JsonObject[] = [];
  const add = (id: string, command: JsonObject) => steps.push({ id, command, expected: session.execute(command) });

  add('move-deployment', command('battle-move-deploy-0001', session.digest(), 'move_deployment', { unitId: 'officer:officer-1', slotX: 9, slotY: 4 }));
  add('remove-deployment', command('battle-remove-deploy-0002', session.digest(), 'remove_deployment', { unitId: 'officer:officer-1' }));
  add('deploy-unit', command('battle-deploy-unit-0003', session.digest(), 'deploy_unit', { unitId: 'officer:officer-1', slotX: 10, slotY: 4 }));
  add('confirm-deployment', command('battle-confirm-0004', session.digest(), 'confirm_deployment'));
  add('attacker-unit-turn', command('battle-attacker-unit-0005', session.digest(), 'end_unit_turn', { unitId: 'officer:officer-1' }));
  add('attacker-side-turn', command('battle-attacker-side-0006', session.digest(), 'end_side_turn'));
  for (const [index, officerId] of initialBattle.defenderOfficerIds.entries()) {
    add(`defender-unit-turn-${index + 1}`, command(`battle-defender-unit-${index + 7}`, session.digest(), 'end_unit_turn', { unitId: `officer:${officerId}` }));
  }
  add('defender-side-turn', command('battle-defender-side-0012', session.digest(), 'end_side_turn'));

  const restored = new ReferenceSession(session.snapshot());
  const continuation = command('battle-restored-0013', restored.digest(), 'end_unit_turn', { unitId: 'officer:officer-1' });
  const restoredContinuation = { command: continuation, expected: restored.execute(continuation) };

  const invalidSession = new ReferenceSession(initialBattle);
  const boundaryCases = [
    (() => {
      const commandValue = command('battle-boundary-oob-0010', invalidSession.digest(), 'move_deployment', { unitId: 'officer:officer-1', slotX: 99, slotY: 0 });
      return { id: 'deployment-out-of-bounds', command: commandValue, expected: invalidSession.execute(commandValue) };
    })(),
    (() => {
      const commandValue = command('battle-boundary-enemy-slot-0011', invalidSession.digest(), 'move_deployment', { unitId: 'officer:officer-1', slotX: 1, slotY: 0 });
      return { id: 'deployment-enemy-slot', command: commandValue, expected: invalidSession.execute(commandValue) };
    })(),
    (() => {
      const commandValue = command('battle-boundary-stale-0012', '00000000', 'confirm_deployment');
      return { id: 'stale-digest', command: commandValue, expected: invalidSession.execute(commandValue) };
    })(),
    (() => {
      const commandValue = command('battle-boundary-duplicate-0013', invalidSession.digest(), 'confirm_deployment');
      const first = invalidSession.execute(commandValue);
      const second = invalidSession.execute(commandValue);
      return { id: 'duplicate-command', command: commandValue, expected: first, duplicateExpected: second };
    })(),
    (() => {
      const ended = invalidSession.snapshot();
      ended.phase = 'ended'; ended.status = 'defender-won'; ended.outcome = 'day-limit';
      const endedSession = new ReferenceSession(ended);
      const commandValue = command('battle-boundary-ended-0014', endedSession.digest(), 'end_side_turn');
      return { id: 'ended-guard', command: commandValue, expected: endedSession.execute(commandValue) };
    })(),
    (() => {
      const limited = structuredClone(initialBattle);
      limited.phase = 'battle'; limited.activeSide = 'defender'; limited.day = limited.maxDays; limited.units['officer:officer-1'].acted = false; limited.actedUnitIds = [];
      for (const unit of Object.values(limited.units) as JsonObject[]) if (unit.side === 'defender') { unit.acted = true; limited.actedUnitIds.push(unit.id); }
      limited.actedUnitIds.sort();
      const limitedSession = new ReferenceSession(limited);
      const commandValue = command('battle-boundary-day-limit-0015', limitedSession.digest(), 'end_side_turn');
      return { id: 'real-day-limit', snapshot: limited, command: commandValue, expected: limitedSession.execute(commandValue) };
    })(),
    (() => {
      const noUnits = structuredClone(initialBattle);
      noUnits.phase = 'battle'; noUnits.units['officer:officer-1'].troops = 0;
      const noUnitsSession = new ReferenceSession(noUnits);
      const commandValue = command('battle-boundary-no-units-0016', noUnitsSession.digest(), 'end_side_turn');
      return { id: 'no-active-units', snapshot: noUnits, command: commandValue, expected: noUnitsSession.execute(commandValue) };
    })(),
    (() => {
      const enemySession = new ReferenceSession(initialBattle);
      const commandValue = command('battle-boundary-enemy-unit-0017', enemySession.digest(), 'move_deployment', { unitId: 'officer:officer-84', slotX: 1, slotY: 4 });
      return { id: 'enemy-unit-deployment', command: commandValue, expected: enemySession.execute(commandValue) };
    })(),
    (() => {
      const removeSession = new ReferenceSession(initialBattle);
      const commandValue = command('battle-boundary-enemy-remove-0018', removeSession.digest(), 'remove_deployment', { unitId: 'officer:officer-84' });
      return { id: 'enemy-unit-removal', command: commandValue, expected: removeSession.execute(commandValue) };
    })(),
    (() => {
      const deployedSession = new ReferenceSession(initialBattle);
      const commandValue = command('battle-boundary-already-deployed-0019', deployedSession.digest(), 'deploy_unit', { unitId: 'officer:officer-1', slotX: 1, slotY: 4 });
      return { id: 'already-deployed', command: commandValue, expected: deployedSession.execute(commandValue) };
    })(),
    (() => {
      const occupied = structuredClone(initialBattle); occupied.activeSide = 'defender';
      const occupiedSession = new ReferenceSession(occupied);
      const commandValue = command('battle-boundary-occupied-0020', occupiedSession.digest(), 'move_deployment', { unitId: 'officer:officer-81', slotX: 2, slotY: 4 });
      return { id: 'occupied-slot', snapshot: occupied, command: commandValue, expected: occupiedSession.execute(commandValue) };
    })(),
    (() => {
      const envelopeSession = new ReferenceSession(initialBattle);
      const commandValue = { ...command('battle-boundary-envelope-0021', envelopeSession.digest(), 'confirm_deployment'), commandEnvelopeVersion: 2 };
      return { id: 'invalid-envelope', command: commandValue, expected: envelopeSession.execute(commandValue) };
    })(),
    (() => {
      const envelopeSession = new ReferenceSession(initialBattle);
      const commandValue = command('battle-boundary-missing-id-0022', envelopeSession.digest(), 'confirm_deployment'); delete commandValue.commandId;
      return { id: 'missing-command-id', command: commandValue, expected: envelopeSession.execute(commandValue) };
    })(),
    (() => {
      const envelopeSession = new ReferenceSession(initialBattle);
      const commandValue = { ...command('battle-boundary-bad-sha-0023', envelopeSession.digest(), 'confirm_deployment'), expectedBattleStateSha256: 123 };
      return { id: 'non-string-expected-sha', command: commandValue, expected: envelopeSession.execute(commandValue) };
    })(),
    (() => {
      const envelopeSession = new ReferenceSession(initialBattle);
      const commandValue = { ...command('battle-boundary-bad-params-0024', envelopeSession.digest(), 'confirm_deployment'), parameters: [] };
      return { id: 'non-object-parameters', command: commandValue, expected: envelopeSession.execute(commandValue) };
    })(),
    (() => {
      const conflictSession = new ReferenceSession(initialBattle);
      const first = command('battle-boundary-conflict-0025', conflictSession.digest(), 'confirm_deployment');
      conflictSession.execute(first);
      const commandValue = command('battle-boundary-conflict-0025', conflictSession.digest(), 'end_side_turn');
      return { id: 'command-id-conflict', snapshot: initialBattle, prelude: [first], command: commandValue, expected: conflictSession.execute(commandValue) };
    })(),
    (() => {
      const replaySession = new ReferenceSession(initialBattle);
      const first = command('battle-boundary-replay-0026', replaySession.digest(), 'confirm_deployment');
      replaySession.execute(first);
      const advance = command('battle-boundary-replay-advance-0027', replaySession.digest(), 'end_unit_turn', { unitId: 'officer:officer-1' });
      replaySession.execute(advance);
      const replayCommand = first;
      return { id: 'post-advance-duplicate', snapshot: initialBattle, prelude: [first, advance], command: replayCommand, expected: replaySession.execute(replayCommand) };
    })(),
    (() => {
      const decimalSession = new ReferenceSession(initialBattle);
      const commandValue = command('battle-boundary-decimal-slot-0028', decimalSession.digest(), 'move_deployment', { unitId: 'officer:officer-1', slotX: 9.5, slotY: 4 });
      return { id: 'decimal-slot', command: commandValue, expected: decimalSession.execute(commandValue) };
    })(),
    (() => {
      const bothZero = structuredClone(initialBattle); bothZero.phase = 'battle';
      for (const unit of Object.values(bothZero.units) as JsonObject[]) unit.troops = 0;
      return { id: 'both-sides-zero', snapshot: bothZero, expectedValid: false };
    })(),
  ];
  return {
    tacticalBattleFixtureVersion: 1,
    algorithms: { canonicalJson: 'canonical-json-v1', digest: 'sha256', rng: 'explicit-seed-no-consumption-v1' },
    campaign: { periodId: 1, rulerSourceIndex: 1, initialStateSha256: canonicalSha256(initialState) },
    order,
    create: {
      initialStateSha256: canonicalSha256(initialState),
      expectedBattle: initialBattle,
      expectedBattleStateSha256: canonicalSha256(initialBattle),
      expectedRngSeed: initialState.rngSeed,
    },
    equipmentCase: {
      statePatch: { clearOfficerIds: ['officer-0', 'officer-4'], officerId: 'officer-1', equipmentItemIds: ['item-13', 'item-10'] },
      expectedBattle: projectBattle(equipmentBattle, equipmentState),
      expectedBattleStateSha256: canonicalSha256(projectBattle(equipmentBattle, equipmentState)),
    },
    reserveCase: {
      statePatch: { cityId: 'city-11', reserveTroops: 120 },
      expectedBattle: projectBattle(reserveBattle, reserveState),
      expectedBattleStateSha256: canonicalSha256(projectBattle(reserveBattle, reserveState)),
    },
    initialBattle,
    steps,
    restoredContinuation,
    boundaryCases,
    createGuardCases: [
      { id: 'strategic-ended', statePatch: { phase: 'ended' }, expectedError: 'The game has ended' },
      { id: 'pending-succession', statePatch: { pendingSuccession: { factionId: 'ruler-1' } }, expectedError: '必须先拥立新君' },
      { id: 'decimal-provisions', statePatch: {}, orderPatch: { provisions: 20.000001 }, expectedError: '军粮必须是正整数' },
      { id: 'zero-defenders', statePatch: {}, officerTroopPatch: ['officer-84', 'officer-81', 'officer-82', 'officer-83', 'officer-10'], expectedOk: true, expectedBattle: zeroDefenderBattle, expectedBattleStateSha256: canonicalSha256(zeroDefenderBattle) },
    ],
    deferredRules: ['terrain', 'pathfinding', 'attack-damage', 'skills', 'tactical-ai', 'retreat-and-campaign-commit'],
  };
}

function command(commandId: string, expectedBattleStateSha256: string, kind: string, parameters: JsonObject = {}) {
  return { commandEnvelopeVersion: 1, commandId, expectedBattleStateSha256, kind, parameters };
}

function projectBattle(battle: TacticalBattleState, state: any): JsonObject {
  const officers = state.officers as Record<string, any>;
  const units: JsonObject = {};
  for (const unit of Object.values(battle.units).sort((left, right) => left.id.localeCompare(right.id))) {
    const officer = unit.officerId ? officers[unit.officerId] : undefined;
    units[unit.id] = {
      id: unit.id, name: unit.name, officerId: unit.officerId ?? '', factionId: unit.factionId, side: unit.side,
      force: unit.force, intelligence: unit.intelligence, leadership: officer?.leadership ?? 0,
      level: unit.level, armsType: unit.armsType, mobility: unit.mobility, skillPoints: unit.skillPoints, maxSkillPoints: unit.maxSkillPoints, originalTroops: unit.originalTroops,
      troops: unit.troops, status: unit.status, statusTurns: unit.statusTurns, moved: unit.moved, acted: unit.acted,
      deployed: true, slotX: unit.x, slotY: unit.y,
    };
  }
  const deployment: Record<TacticalSide, JsonObject[]> = { attacker: [], defender: [] };
  for (const unit of Object.values(units) as JsonObject[]) {
    deployment[unit.side].push({ unitId: unit.id, slotX: unit.slotX, slotY: unit.slotY });
  }
  deployment.attacker.sort((left, right) => left.unitId.localeCompare(right.unitId));
  deployment.defender.sort((left, right) => left.unitId.localeCompare(right.unitId));
  const guard = {
    ...battle.guard,
    participants: battle.guard.participants.map((participant) => ({
      ...participant,
      equipmentKey: participant.equipmentKey.split('\0').join('|'),
      equipmentKeyEncoding: 'pipe-v1',
    })),
  };
  return {
    contractVersion: 1, id: battle.id, strategicTurn: battle.strategicTurn, seedBefore: battle.seedBefore, rngSeed: battle.rngSeed,
    sourceCityId: battle.sourceCityId, targetCityId: battle.targetCityId, attackerFactionId: battle.attackerFactionId, defenderFactionId: battle.defenderFactionId,
    attackerOfficerIds: [...battle.attackerOfficerIds], defenderOfficerIds: [...battle.defenderOfficerIds], provisionsCommitted: battle.provisionsCommitted,
    attackerFood: battle.attackerFood, defenderFood: battle.defenderFood, width: battle.width, height: battle.height, day: battle.day, maxDays: battle.maxDays,
    weather: battle.weather, phase: battle.status === 'ongoing' ? 'deployment' : 'ended', activeSide: battle.activeSide, status: battle.status, outcome: battle.status === 'ongoing' ? '' : (battle.victoryReason ?? 'annihilation'), approach: battle.approach,
    battlefieldVersion: battle.battlefieldVersion, battlefieldKey: battle.battlefieldKey, battlefieldTemplate: battle.battlefieldTemplate,
    deployment, units, actedUnitIds: [], logs: [...battle.logs],
    commanderUnitIds: { attacker: battle.commanderUnitIds.attacker ?? '', defender: battle.commanderUnitIds.defender ?? '' },
    experienceGains: { ...battle.experienceGains }, experienceGainOrder: [...((battle as any).experienceGainOrder ?? [])],
    guard,
    terrainContractVersion: 1,
    tiles: battle.tiles.map((tile) => {
      const costs = [...MODERN_TERRAIN_MOVE_COSTS].map((row) => row[tile.terrain] ?? Number.POSITIVE_INFINITY);
      return {
        x: tile.x, y: tile.y, terrainId: tile.terrain,
        terrainName: ['plain', 'road', 'hill', 'forest', 'village', 'city', 'marsh', 'river'][tile.terrain],
        movementCosts: costs.map((cost) => Number.isFinite(cost) ? cost : null),
        passableArms: costs.map((cost) => Number.isFinite(cost)),
        ...(tile.objective ? { objective: tile.objective } : {}),
      };
    }),
  };
}

class ReferenceSession {
  private state: JsonObject;
  private completed = new Map<string, { requestSha256: string; result: JsonObject }>();

  constructor(snapshot: JsonObject) { this.state = structuredClone(snapshot); }
  snapshot() { return structuredClone(this.state); }
  digest() { return canonicalSha256(this.state); }

  execute(commandValue: JsonObject): JsonObject {
    const before = this.snapshot();
    const beforeDigest = this.digest();
    const requestSha256 = canonicalSha256(commandValue);
    const commandId = String(commandValue.commandId ?? '');
    if (commandValue.commandEnvelopeVersion !== 1) return this.fail(before, beforeDigest, '不支持的战斗命令版本', commandValue);
    if (typeof commandValue.commandId !== 'string' || commandValue.commandId.length === 0) return this.fail(before, beforeDigest, '战斗命令缺少 commandId', commandValue);
    if (typeof commandValue.expectedBattleStateSha256 !== 'string' || commandValue.expectedBattleStateSha256.length === 0) return this.fail(before, beforeDigest, '战斗命令缺少 expectedBattleStateSha256', commandValue);
    if (!commandValue.parameters || typeof commandValue.parameters !== 'object' || Array.isArray(commandValue.parameters)) return this.fail(before, beforeDigest, '战斗命令 parameters 必须是对象', commandValue);
    if (this.completed.has(commandId)) {
      const cached = this.completed.get(commandId)!;
      if (cached.requestSha256 === requestSha256) {
        const duplicate = structuredClone(cached.result);
        duplicate.battle = before;
        duplicate.beforeBattleStateSha256 = beforeDigest;
        duplicate.afterBattleStateSha256 = beforeDigest;
        duplicate.stateChanged = false;
        duplicate.duplicate = true;
        return duplicate;
      }
      return this.fail(before, beforeDigest, 'commandId 已经用于另一条战斗命令', commandValue);
    }
    if (commandValue.expectedBattleStateSha256 !== beforeDigest) return this.fail(before, beforeDigest, '战斗状态摘要已过期', commandValue);
    const parameters = commandValue.parameters ?? {};
    let result: JsonObject;
    if (commandValue.kind === 'confirm_deployment') result = this.confirm(before, beforeDigest);
    else if (commandValue.kind === 'move_deployment') result = this.deployment(before, beforeDigest, parameters, true);
    else if (commandValue.kind === 'deploy_unit') result = this.deployment(before, beforeDigest, parameters, false);
    else if (commandValue.kind === 'remove_deployment') result = this.removeDeployment(before, beforeDigest, parameters.unitId);
    else if (commandValue.kind === 'end_unit_turn') result = this.endUnit(before, beforeDigest, parameters.unitId);
    else if (commandValue.kind === 'end_side_turn') result = this.endSide(before, beforeDigest);
    else result = this.fail(before, beforeDigest, `不支持的战斗命令：${commandValue.kind}`, commandValue);
    result.commandId = commandId; result.kind = commandValue.kind; result.battle = result.ok ? this.state : before;
    this.completed.set(commandId, { requestSha256, result: structuredClone(result) });
    return result;
  }

  private confirm(before: JsonObject, beforeDigest: string) {
    if (before.status !== 'ongoing') return this.battleFail(before, beforeDigest, '战斗已经结束');
    if (before.phase !== 'deployment') return this.battleFail(before, beforeDigest, '部署已经确认');
    if (before.deployment.attacker.length === 0 || before.deployment.defender.length === 0) return this.battleFail(before, beforeDigest, '不能空部署');
    const next = structuredClone(before); next.phase = 'battle'; next.logs.push('双方部署确认，战斗回合开始。');
    return this.success(next, beforeDigest, 'confirm_deployment', { phase: 'battle' });
  }

  private deployment(before: JsonObject, beforeDigest: string, params: JsonObject, moving: boolean) {
    if (before.phase !== 'deployment') return this.battleFail(before, beforeDigest, '只能在部署阶段调整部队');
    const unit = before.units[params.unitId];
    if (!unit || !unit.officerId) return this.battleFail(before, beforeDigest, `未知或不可部署的部队：${params.unitId}`);
    if (unit.side !== before.activeSide) return this.battleFail(before, beforeDigest, '只能调整当前阵营的部署');
    if (moving && !unit.deployed) return this.battleFail(before, beforeDigest, `部队尚未部署：${params.unitId}`);
    if (!moving && unit.deployed) return this.battleFail(before, beforeDigest, `部队已经部署：${params.unitId}`);
    if (!Number.isInteger(params.slotX) || !Number.isInteger(params.slotY)) return this.battleFail(before, beforeDigest, '部署坐标必须是整数');
    if (params.slotX < 0 || params.slotX >= before.width || params.slotY < 0 || params.slotY >= before.height) return this.battleFail(before, beforeDigest, '部署位置越界');
    if (!this.slotAllowed(before.approach, unit.side, params.slotX, params.slotY)) return this.battleFail(before, beforeDigest, '部署位置不属于本方阵地');
    if ((Object.values(before.units) as JsonObject[]).some((other) => other.id !== unit.id && other.deployed && other.slotX === params.slotX && other.slotY === params.slotY)) return this.battleFail(before, beforeDigest, '部署位置已经被占用');
    const next = structuredClone(before);
    next.units[unit.id].slotX = params.slotX; next.units[unit.id].slotY = params.slotY; next.units[unit.id].deployed = true;
    next.deployment[unit.side] = next.deployment[unit.side].filter((entry: JsonObject) => entry.unitId !== unit.id);
    next.deployment[unit.side].push({ unitId: unit.id, slotX: params.slotX, slotY: params.slotY });
    next.deployment[unit.side].sort((a: JsonObject, b: JsonObject) => a.unitId.localeCompare(b.unitId));
    return this.success(next, beforeDigest, moving ? 'move_deployment' : 'deploy_unit', { unitId: unit.id, slotX: params.slotX, slotY: params.slotY });
  }

  private removeDeployment(before: JsonObject, beforeDigest: string, unitId: string) {
    if (before.phase !== 'deployment') return this.battleFail(before, beforeDigest, '只能在部署阶段撤下部队');
    const unit = before.units[unitId];
    if (!unit || !unit.officerId) return this.battleFail(before, beforeDigest, `未知或不可撤下的部队：${unitId}`);
    if (unit.side !== before.activeSide) return this.battleFail(before, beforeDigest, '只能调整当前阵营的部署');
    if (!unit.deployed) return this.battleFail(before, beforeDigest, `部队尚未部署：${unitId}`);
    const next = structuredClone(before);
    next.units[unitId].deployed = false; next.units[unitId].slotX = -1; next.units[unitId].slotY = -1;
    next.deployment[unit.side] = next.deployment[unit.side].filter((entry: JsonObject) => entry.unitId !== unitId);
    return this.success(next, beforeDigest, 'remove_deployment', { unitId, side: unit.side });
  }

  private slotAllowed(approach: string, side: string, x: number, y: number) {
    if (approach === 'east') return side === 'attacker' ? x <= 3 : x >= 8;
    if (approach === 'west') return side === 'attacker' ? x >= 8 : x <= 3;
    if (approach === 'south') return side === 'attacker' ? y <= 3 : y >= 4;
    return side === 'attacker' ? y >= 4 : y <= 3;
  }

  private endUnit(before: JsonObject, beforeDigest: string, unitId: string) {
    if (before.phase !== 'battle') return this.battleFail(before, beforeDigest, '战斗回合尚未开始');
    if (before.status !== 'ongoing') return this.battleFail(before, beforeDigest, '战斗已经结束');
    const unit = before.units[unitId];
    if (!unit || !unit.deployed) return this.battleFail(before, beforeDigest, `部队不存在或尚未部署：${unitId}`);
    if (unit.side !== before.activeSide) return this.battleFail(before, beforeDigest, '当前不是该部队所属阵营的行动阶段');
    if (unit.acted) return this.battleFail(before, beforeDigest, '该部队本回合已经行动');
    const next = structuredClone(before); next.units[unitId].acted = true; next.actedUnitIds.push(unitId); next.actedUnitIds.sort(); next.logs.push(`${unit.name}结束本回合行动。`);
    return this.success(next, beforeDigest, 'end_unit_turn', { unitId, activeSide: before.activeSide });
  }

  private endSide(before: JsonObject, beforeDigest: string) {
    if (before.phase !== 'battle') return this.battleFail(before, beforeDigest, '战斗回合尚未开始');
    if (before.status !== 'ongoing') return this.battleFail(before, beforeDigest, '战斗已经结束');
    const activeUnits = Object.values(before.units).filter((unit: any) => unit.side === before.activeSide && unit.deployed && unit.troops > 0) as JsonObject[];
    if (activeUnits.length === 0) {
      const enemySide = before.activeSide === 'attacker' ? 'defender' : 'attacker';
      const enemyAlive = (Object.values(before.units) as JsonObject[]).some((unit) => unit.side === enemySide && unit.troops > 0);
      const winnerSide = enemyAlive ? enemySide : 'defender';
      const next = structuredClone(before); next.status = winnerSide === 'attacker' ? 'attacker-won' : 'defender-won'; next.outcome = enemyAlive ? `${before.activeSide}-eliminated` : 'annihilation'; next.phase = 'ended'; next.logs.push(`${before.activeSide}方已无可行动部队，${winnerSide}方获胜。`);
      return this.success(next, beforeDigest, 'end_side_turn', { fromSide: before.activeSide, toSide: before.activeSide, day: next.day, turn: next.strategicTurn });
    }
    if (activeUnits.some((unit) => !unit.acted)) return this.battleFail(before, beforeDigest, `${before.activeSide}方仍有部队未结束行动`);
    const next = structuredClone(before); const side = before.activeSide; const nextSide = side === 'attacker' ? 'defender' : 'attacker';
    for (const unit of Object.values(next.units) as JsonObject[]) if (unit.side === side) { unit.acted = false; unit.moved = false; }
    next.actedUnitIds = []; next.activeSide = nextSide;
    if (side === 'defender') { next.day += 1; next.logs.push(next.day > next.maxDays ? '达到战斗日数上限，守方获胜。' : `第${next.day}日战斗开始。`); if (next.day > next.maxDays) { next.status = 'defender-won'; next.outcome = 'day-limit'; next.phase = 'ended'; } }
    else next.logs.push('守方行动开始。');
    return this.success(next, beforeDigest, 'end_side_turn', { fromSide: side, toSide: nextSide, day: next.day, turn: next.strategicTurn });
  }

  private success(next: JsonObject, beforeDigest: string, kind: string, details: JsonObject) {
    this.state = next;
    const afterDigest = canonicalSha256(next);
    return { ok: true, error: '', stateChanged: afterDigest !== beforeDigest, beforeBattleStateSha256: beforeDigest, afterBattleStateSha256: afterDigest, receipt: { kind, details, battleStateSha256: afterDigest } };
  }

  private battleFail(before: JsonObject, beforeDigest: string, error: string) { return { ok: false, error, stateChanged: false, beforeBattleStateSha256: beforeDigest, afterBattleStateSha256: beforeDigest, receipt: {} }; }
  private fail(before: JsonObject, beforeDigest: string, error: string, commandValue: JsonObject) { return { ...this.battleFail(before, beforeDigest, error), commandId: commandValue.commandId ?? '', kind: commandValue.kind ?? '', battle: before }; }
}

const fixture = buildFixture();
if (writeMode) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stdout.write(`[Godot tactical battle] generated ${fixture.steps.length} session steps and ${fixture.boundaryCases.length} boundary cases\n`);
} else {
  let current: unknown;
  try { current = JSON.parse(readFileSync(path, 'utf8')); } catch { current = null; }
  if (canonicalJson(current) !== canonicalJson(fixture)) throw new Error('godot/data/fixtures/tactical-battle-v1.json differs from TypeScript oracle');
  process.stdout.write(`[Godot tactical battle] PASSED ${fixture.steps.length} session steps and ${fixture.boundaryCases.length} boundary cases\n`);
}
