import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, canonicalSha256 } from '../src/core/migration/canonicalJson';
import { createProductionSessionState } from '../src/core/migration/applicationSessionContract';
import { createTacticalBattle, getReachableTiles, getTacticalPath, getTacticalPathCost, type TacticalBattleState, type TacticalSide } from '../src/core/tacticalBattle';
import { MODERN_TERRAIN_MOVE_COSTS } from '../src/compat/baye/tacticalState';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'godot/data/fixtures/tactical-battle-movement-v1.json');
const writeMode = process.argv.includes('--write');
type JsonObject = Record<string, any>;
type Position = { x: number; y: number };
const DIRECTIONS: Position[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

export function buildMovementFixture() {
  const state = createProductionSessionState(1, 1);
  const order = { sourceCityId: 'city-12', targetCityId: 'city-11', officerIds: ['officer-1'], provisions: 20 };
  const battle = createTacticalBattle(state, order);
  const initialBattle = projectBattle(battle, state);
  const attackerId = 'officer:officer-1';
  const defenderId = initialBattle.defenderOfficerIds[0] ? `officer:${initialBattle.defenderOfficerIds[0]}` : 'officer:officer-10';
  const initialReachable = reachable(initialBattle, attackerId);
  const destination = initialReachable[0] ?? { x: 9, y: 4 };
  const initialPath = findPath(initialBattle, attackerId, destination);
  const blockedBattle = withBlockedTile(initialBattle, destination);
  const blockedPath = findPath(blockedBattle, attackerId, destination);
  const tieBreakCase = createTieBreakCase();
  const webDestination = getReachableTiles(battle, attackerId)[0] ?? destination;
  const webPath = getTacticalPath(battle, attackerId, webDestination);
  const session = new ReferenceMovementSession(initialBattle);
  const steps: JsonObject[] = [];
  const add = (id: string, commandValue: JsonObject) => steps.push({ id, command: commandValue, expected: session.execute(commandValue) });
  add('confirm-deployment', command('movement-confirm-0001', session.digest(), 'confirm_deployment'));
  add('move-attacker', command('movement-move-attacker-0002', session.digest(), 'move_unit', { unitId: attackerId, slotX: destination.x, slotY: destination.y }));
  add('end-attacker-unit', command('movement-end-attacker-0003', session.digest(), 'end_unit_turn', { unitId: attackerId }));
  add('end-attacker-side', command('movement-end-attacker-side-0004', session.digest(), 'end_side_turn'));
  const restored = new ReferenceMovementSession(session.snapshot());
  const defenderReachable = reachable(restored.snapshot(), defenderId);
  const defenderDestination = defenderReachable[0] ?? { x: 2, y: 6 };
  const restoredContinuation = {
    command: command('movement-restored-defender-0005', restored.digest(), 'move_unit', { unitId: defenderId, slotX: defenderDestination.x, slotY: defenderDestination.y }),
    expected: restored.execute(command('movement-restored-defender-0005', restored.digest(), 'move_unit', { unitId: defenderId, slotX: defenderDestination.x, slotY: defenderDestination.y })),
  };

  const confirmed = new ReferenceMovementSession(initialBattle);
  const confirmCommand = command('movement-boundary-confirm-0010', confirmed.digest(), 'confirm_deployment');
  confirmed.execute(confirmCommand);
  const confirmedSnapshot = confirmed.snapshot();
  const boundaryCases: JsonObject[] = [
    (() => {
      const boundarySession = new ReferenceMovementSession(initialBattle);
      const commandValue = command('movement-boundary-phase-0011', boundarySession.digest(), 'move_unit', { unitId: attackerId, slotX: destination.x, slotY: destination.y });
      return { id: 'wrong-phase', command: commandValue, expected: boundarySession.execute(commandValue) };
    })(),
    (() => {
      const boundarySession = new ReferenceMovementSession(confirmedSnapshot);
      const commandValue = command('movement-boundary-stale-0012', '00000000', 'move_unit', { unitId: attackerId, slotX: destination.x, slotY: destination.y });
      return { id: 'stale-digest', snapshot: confirmedSnapshot, command: commandValue, expected: boundarySession.execute(commandValue) };
    })(),
    (() => {
      const boundarySession = new ReferenceMovementSession(confirmedSnapshot);
      const commandValue = command('movement-boundary-occupied-0013', boundarySession.digest(), 'move_unit', { unitId: attackerId, slotX: initialBattle.units[defenderId].slotX, slotY: initialBattle.units[defenderId].slotY });
      return { id: 'occupied-destination', snapshot: confirmedSnapshot, command: commandValue, expected: boundarySession.execute(commandValue) };
    })(),
    (() => {
      const boundarySession = new ReferenceMovementSession(confirmedSnapshot);
      const commandValue = command('movement-boundary-enemy-0014', boundarySession.digest(), 'move_unit', { unitId: defenderId, slotX: defenderDestination.x, slotY: defenderDestination.y });
      return { id: 'enemy-unit', snapshot: confirmedSnapshot, command: commandValue, expected: boundarySession.execute(commandValue) };
    })(),
    (() => {
      const boundarySession = new ReferenceMovementSession(withBlockedTile(confirmedSnapshot, destination));
      const commandValue = command('movement-boundary-blocked-0015', boundarySession.digest(), 'move_unit', { unitId: attackerId, slotX: destination.x, slotY: destination.y });
      return { id: 'blocked-terrain', snapshot: boundarySession.snapshot(), command: commandValue, expected: boundarySession.execute(commandValue) };
    })(),
    (() => {
      const boundarySession = new ReferenceMovementSession(confirmedSnapshot);
      const first = command('movement-boundary-duplicate-0016', boundarySession.digest(), 'move_unit', { unitId: attackerId, slotX: destination.x, slotY: destination.y });
      const expected = boundarySession.execute(first);
      return { id: 'duplicate-command', snapshot: confirmedSnapshot, command: first, expected, duplicateExpected: boundarySession.execute(first) };
    })(),
    (() => {
      const boundarySession = new ReferenceMovementSession(confirmedSnapshot);
      const first = command('movement-boundary-conflict-0017', boundarySession.digest(), 'move_unit', { unitId: attackerId, slotX: destination.x, slotY: destination.y });
      boundarySession.execute(first);
      const commandValue = command('movement-boundary-conflict-0017', boundarySession.digest(), 'move_unit', { unitId: attackerId, slotX: Math.max(0, destination.x - 1), slotY: destination.y });
      return { id: 'command-id-conflict', snapshot: confirmedSnapshot, prelude: [first], command: commandValue, expected: boundarySession.execute(commandValue) };
    })(),
    (() => {
      const movedSession = new ReferenceMovementSession(confirmedSnapshot);
      const first = command('movement-boundary-moved-0018', movedSession.digest(), 'move_unit', { unitId: attackerId, slotX: destination.x, slotY: destination.y });
      movedSession.execute(first);
      const next = reachable(movedSession.snapshot(), attackerId)[0] ?? { x: 10, y: 4 };
      const commandValue = command('movement-boundary-moved-0019', movedSession.digest(), 'move_unit', { unitId: attackerId, slotX: next.x, slotY: next.y });
      return { id: 'already-moved', snapshot: confirmedSnapshot, prelude: [first], command: commandValue, expected: movedSession.execute(commandValue) };
    })(),
    (() => {
      const boundarySession = new ReferenceMovementSession(confirmedSnapshot);
      const commandValue = { ...command('movement-boundary-decimal-0020', boundarySession.digest(), 'move_unit', { unitId: attackerId, slotX: 9.5, slotY: 4 }) };
      return { id: 'decimal-coordinate', snapshot: confirmedSnapshot, command: commandValue, expected: boundarySession.execute(commandValue) };
    })(),
    (() => {
      const boundarySession = new ReferenceMovementSession(confirmedSnapshot);
      const commandValue = command('movement-boundary-same-cell-0021', boundarySession.digest(), 'move_unit', { unitId: attackerId, slotX: confirmedSnapshot.units[attackerId].slotX, slotY: confirmedSnapshot.units[attackerId].slotY });
      return { id: 'same-cell', snapshot: confirmedSnapshot, command: commandValue, expected: boundarySession.execute(commandValue) };
    })(),
    (() => {
      const boundarySession = new ReferenceMovementSession(confirmedSnapshot);
      const commandValue = command('movement-boundary-out-of-bounds-0022', boundarySession.digest(), 'move_unit', { unitId: attackerId, slotX: 99, slotY: 0 });
      return { id: 'out-of-bounds', snapshot: confirmedSnapshot, command: commandValue, expected: boundarySession.execute(commandValue) };
    })(),
    (() => {
      const boundarySession = new ReferenceMovementSession(confirmedSnapshot);
      const commandValue = command('movement-boundary-over-mobility-0023', boundarySession.digest(), 'move_unit', { unitId: attackerId, slotX: 0, slotY: 7 });
      return { id: 'over-mobility', snapshot: confirmedSnapshot, command: commandValue, expected: boundarySession.execute(commandValue) };
    })(),
  ];
  return {
    tacticalBattleMovementFixtureVersion: 1,
    algorithms: { canonicalJson: 'canonical-json-v1', digest: 'sha256', path: 'dijkstra-cost-steps-y-x-parent-v1', rng: 'explicit-seed-no-consumption-v1' },
    source: { periodId: 1, rulerSourceIndex: 1, initialStateSha256: canonicalSha256(state), battlefieldSource: 'src/core/tacticalBattle.ts:createStructuredBattlefield + src/compat/baye/tacticalState.ts:MODERN_TERRAIN_MOVE_COSTS' },
    initialBattle,
    queryCases: [
      { id: 'attacker-reachable', snapshot: initialBattle, unitId: attackerId, expectedReachable: initialReachable },
      { id: 'attacker-path', snapshot: initialBattle, unitId: attackerId, destination, expectedPath: initialPath, expectedCost: pathCost(initialBattle, attackerId, initialPath) },
      { id: 'blocked-path', snapshot: blockedBattle, unitId: attackerId, destination, expectedPath: blockedPath, expectedCost: blockedPath.length ? pathCost(blockedBattle, attackerId, blockedPath) : null },
      { id: 'defender-reachable', snapshot: initialBattle, unitId: defenderId, expectedReachable: reachable(initialBattle, defenderId) },
      { id: 'tie-break-path', snapshot: tieBreakCase, unitId: 'u-attacker', destination: { x: 2, y: 2 }, expectedPath: findPath(tieBreakCase, 'u-attacker', { x: 2, y: 2 }), expectedCost: pathCost(tieBreakCase, 'u-attacker', findPath(tieBreakCase, 'u-attacker', { x: 2, y: 2 })) },
      { id: 'tie-break-reachable', snapshot: tieBreakCase, unitId: 'u-attacker', expectedReachable: reachable(tieBreakCase, 'u-attacker') },
    ],
    webOracleCases: [{ id: 'web-api-attacker-path', snapshot: initialBattle, unitId: attackerId, destination: webDestination, expectedReachable: getReachableTiles(battle, attackerId), expectedPath: webPath, expectedCost: getTacticalPathCost(battle, attackerId, webDestination) }],
    steps,
    restoredContinuation,
    boundaryCases,
    expectedTerrainContract: { version: 1, width: initialBattle.width, height: initialBattle.height, tileCount: initialBattle.tiles.length },
  };
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
  for (const unit of Object.values(units) as JsonObject[]) deployment[unit.side].push({ unitId: unit.id, slotX: unit.slotX, slotY: unit.slotY });
  deployment.attacker.sort((left, right) => left.unitId.localeCompare(right.unitId));
  deployment.defender.sort((left, right) => left.unitId.localeCompare(right.unitId));
  const guard = {
    ...battle.guard,
    participants: battle.guard.participants.map((participant) => ({ ...participant, equipmentKey: participant.equipmentKey.split('\0').join('|'), equipmentKeyEncoding: 'pipe-v1' })),
  };
  const tiles = battle.tiles.map((tile) => {
    const costs = [...MODERN_TERRAIN_MOVE_COSTS].map((row) => row[tile.terrain] ?? Number.POSITIVE_INFINITY);
    return {
      x: tile.x, y: tile.y, terrainId: tile.terrain,
      terrainName: ['plain', 'road', 'hill', 'forest', 'village', 'city', 'marsh', 'river'][tile.terrain],
      movementCosts: costs.map((cost) => Number.isFinite(cost) ? cost : null),
      passableArms: costs.map((cost) => Number.isFinite(cost)),
      ...(tile.objective ? { objective: tile.objective } : {}),
    };
  });
  return {
    ...battleBase(battle, deployment, units, guard),
    terrainContractVersion: 1,
    tiles,
  };
}

function battleBase(battle: TacticalBattleState, deployment: Record<TacticalSide, JsonObject[]>, units: JsonObject, guard: JsonObject): JsonObject {
  return {
    contractVersion: 1, id: battle.id, strategicTurn: battle.strategicTurn, seedBefore: battle.seedBefore, rngSeed: battle.rngSeed,
    sourceCityId: battle.sourceCityId, targetCityId: battle.targetCityId, attackerFactionId: battle.attackerFactionId, defenderFactionId: battle.defenderFactionId,
    attackerOfficerIds: [...battle.attackerOfficerIds], defenderOfficerIds: [...battle.defenderOfficerIds], provisionsCommitted: battle.provisionsCommitted,
    attackerFood: battle.attackerFood, defenderFood: battle.defenderFood, width: battle.width, height: battle.height, day: battle.day, maxDays: battle.maxDays,
    weather: battle.weather, phase: battle.status === 'ongoing' ? 'deployment' : 'ended', activeSide: battle.activeSide, status: battle.status,
    outcome: battle.status === 'ongoing' ? '' : (battle.victoryReason ?? 'annihilation'), approach: battle.approach,
    battlefieldVersion: battle.battlefieldVersion, battlefieldKey: battle.battlefieldKey, battlefieldTemplate: battle.battlefieldTemplate,
    deployment, units, actedUnitIds: [], logs: [...battle.logs],
    commanderUnitIds: { attacker: battle.commanderUnitIds.attacker ?? '', defender: battle.commanderUnitIds.defender ?? '' },
    experienceGains: { ...battle.experienceGains }, experienceGainOrder: [...((battle as any).experienceGainOrder ?? [])], guard,
  };
}

class ReferenceMovementSession {
  private state: JsonObject;
  private completed = new Map<string, { requestSha256: string; result: JsonObject }>();
  constructor(snapshot: JsonObject) { this.state = structuredClone(snapshot); }
  snapshot() { return structuredClone(this.state); }
  digest() { return canonicalSha256(this.state); }

  execute(commandValue: JsonObject): JsonObject {
    const before = this.snapshot(); const beforeDigest = this.digest(); const requestSha256 = canonicalSha256(commandValue);
    const commandId = String(commandValue.commandId ?? '');
    if (commandValue.commandEnvelopeVersion !== 1) return this.fail(before, beforeDigest, '不支持的战斗命令版本', commandValue);
    if (typeof commandValue.commandId !== 'string' || !commandValue.commandId) return this.fail(before, beforeDigest, '战斗命令缺少 commandId', commandValue);
    if (typeof commandValue.expectedBattleStateSha256 !== 'string' || !commandValue.expectedBattleStateSha256) return this.fail(before, beforeDigest, '战斗命令缺少 expectedBattleStateSha256', commandValue);
    if (!commandValue.parameters || typeof commandValue.parameters !== 'object' || Array.isArray(commandValue.parameters)) return this.fail(before, beforeDigest, '战斗命令 parameters 必须是对象', commandValue);
    if (this.completed.has(commandId)) {
      const cached = this.completed.get(commandId)!;
      if (cached.requestSha256 === requestSha256) return { ...structuredClone(cached.result), battle: before, beforeBattleStateSha256: beforeDigest, afterBattleStateSha256: beforeDigest, stateChanged: false, duplicate: true };
      return this.fail(before, beforeDigest, 'commandId 已经用于另一条战斗命令', commandValue);
    }
    if (commandValue.expectedBattleStateSha256 !== beforeDigest) return this.fail(before, beforeDigest, '战斗状态摘要已过期', commandValue);
    const parameters = commandValue.parameters as JsonObject;
    let result: JsonObject;
    if (commandValue.kind === 'confirm_deployment') result = this.confirm(before, beforeDigest);
    else if (commandValue.kind === 'move_unit') result = this.move(before, beforeDigest, parameters);
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
    const next = structuredClone(before); next.phase = 'battle'; next.logs.push('双方部署确认，战斗回合开始。');
    this.state = next; return this.success(next, beforeDigest, 'confirm_deployment', { phase: 'battle' });
  }

  private move(before: JsonObject, beforeDigest: string, params: JsonObject) {
    if (typeof params.unitId !== 'string' || !params.unitId) return this.battleFail(before, beforeDigest, '战斗命令缺少 unitId');
    if (!Number.isInteger(params.slotX) || !Number.isInteger(params.slotY)) return this.battleFail(before, beforeDigest, '部署坐标必须是整数');
    if (before.phase !== 'battle') return this.battleFail(before, beforeDigest, '战斗回合尚未开始');
    if (before.status !== 'ongoing') return this.battleFail(before, beforeDigest, '战斗已经结束');
    const unit = before.units[params.unitId];
    if (!unit || !unit.deployed) return this.battleFail(before, beforeDigest, `部队不存在或尚未部署：${params.unitId}`);
    if (unit.side !== before.activeSide) return this.battleFail(before, beforeDigest, '当前不是该部队所属阵营的行动阶段');
    if (unit.acted) return this.battleFail(before, beforeDigest, '该部队本回合已经行动');
    if (unit.moved) return this.battleFail(before, beforeDigest, '该部队本回合已经移动');
    if (unit.slotX === params.slotX && unit.slotY === params.slotY) return this.battleFail(before, beforeDigest, '目标格不在该单位的可移动范围内');
    const path = findPath(before, params.unitId, { x: params.slotX, y: params.slotY });
    const cost = path.length ? pathCost(before, params.unitId, path) : -1;
    if (!path.length || cost < 0) return this.battleFail(before, beforeDigest, '目标格不在该单位的可移动范围内');
    const next = structuredClone(before); next.units[params.unitId].slotX = params.slotX; next.units[params.unitId].slotY = params.slotY; next.units[params.unitId].moved = true;
    const entries = next.deployment[unit.side] as JsonObject[]; const entry = entries.find((candidate) => candidate.unitId === params.unitId);
    if (entry) { entry.slotX = params.slotX; entry.slotY = params.slotY; }
    entries.sort((left, right) => left.unitId.localeCompare(right.unitId)); next.logs.push(`${unit.name}移动至 ${params.slotX},${params.slotY}。`);
    this.state = next;
    const remainingMobility = Math.max(0, (unit.status === 'rooted' ? Math.min(1, unit.mobility) : unit.mobility) - cost);
    return this.success(next, beforeDigest, 'move_unit', { unitId: params.unitId, path, cost, remainingMobility, seedBefore: next.rngSeed, seedAfter: next.rngSeed });
  }

  private endUnit(before: JsonObject, beforeDigest: string, unitId: string) {
    if (before.phase !== 'battle') return this.battleFail(before, beforeDigest, '战斗回合尚未开始');
    const unit = before.units[unitId]; if (!unit || !unit.deployed) return this.battleFail(before, beforeDigest, `部队不存在或尚未部署：${unitId}`);
    if (unit.side !== before.activeSide) return this.battleFail(before, beforeDigest, '当前不是该部队所属阵营的行动阶段');
    const next = structuredClone(before); next.units[unitId].acted = true; next.actedUnitIds.push(unitId); next.actedUnitIds.sort(); next.logs.push(`${unit.name}结束本回合行动。`); this.state = next;
    return this.success(next, beforeDigest, 'end_unit_turn', { unitId, activeSide: before.activeSide });
  }

  private endSide(before: JsonObject, beforeDigest: string) {
    if (before.phase !== 'battle') return this.battleFail(before, beforeDigest, '战斗回合尚未开始');
    const active = Object.values(before.units).filter((unit: any) => unit.side === before.activeSide && unit.deployed && unit.troops > 0) as JsonObject[];
    if (active.some((unit) => !unit.acted)) return this.battleFail(before, beforeDigest, `${before.activeSide}方仍有部队未结束行动`);
    const next = structuredClone(before); const side = before.activeSide; const nextSide = side === 'attacker' ? 'defender' : 'attacker';
    for (const unit of Object.values(next.units) as JsonObject[]) if (unit.side === side) { unit.acted = false; unit.moved = false; }
    next.actedUnitIds = []; next.activeSide = nextSide; next.logs.push(side === 'attacker' ? '守方行动开始。' : `第${next.day + 1}日战斗开始。`); if (side === 'defender') next.day += 1;
    this.state = next; return this.success(next, beforeDigest, 'end_side_turn', { fromSide: side, toSide: nextSide, day: next.day, turn: next.strategicTurn });
  }

  private success(next: JsonObject, beforeDigest: string, kind: string, details: JsonObject) {
    const afterDigest = canonicalSha256(next); return { ok: true, error: '', stateChanged: afterDigest !== beforeDigest, beforeBattleStateSha256: beforeDigest, afterBattleStateSha256: afterDigest, receipt: { kind, details, battleStateSha256: afterDigest } };
  }
  private battleFail(_before: JsonObject, beforeDigest: string, error: string) { return { ok: false, error, stateChanged: false, beforeBattleStateSha256: beforeDigest, afterBattleStateSha256: beforeDigest, receipt: {} }; }
  private fail(before: JsonObject, beforeDigest: string, error: string, commandValue: JsonObject) { return { ...this.battleFail(before, beforeDigest, error), commandId: commandValue.commandId ?? '', kind: commandValue.kind ?? '', battle: before }; }
}

function reachable(snapshot: JsonObject, unitId: string): Position[] {
  const unit = snapshot.units[unitId]; if (!unit || unit.moved || unit.acted || unit.status === 'rooted') return [];
  const start = { x: unit.slotX, y: unit.slotY }; const mobility = unit.status === 'rooted' ? Math.min(1, unit.mobility) : unit.mobility;
  const occupied = occupiedPositions(snapshot, unitId); const enemy = enemyOccupied(snapshot, unit.side); const best = new Map([[key(start), 0]]); const frontier: any[] = [{ ...start, cost: 0, steps: 0, parentY: -1, parentX: -1 }];
  while (frontier.length) { frontier.sort(queueCompare); const current = frontier.shift(); const currentKey = key(current); if (current.cost !== best.get(currentKey)) continue; if (currentKey !== key(start) && unit.status !== 'qimen' && enemyZone(snapshot, unit.side, current)) continue;
    for (const direction of DIRECTIONS) { const next = { x: current.x + direction.x, y: current.y + direction.y }; const step = stepCost(snapshot, unit, next); if (step < 0 || enemy.has(key(next))) continue; const cost = current.cost + step; if (cost > mobility || (best.has(key(next)) && (best.get(key(next)) as number) <= cost)) continue; best.set(key(next), cost); frontier.push({ ...next, cost, steps: current.steps + 1, parentY: current.y, parentX: current.x }); }
  }
  return [...best.keys()].filter((positionKey) => positionKey !== key(start) && !occupied.has(positionKey)).map(parsePosition).sort(positionCompare);
}

function findPath(snapshot: JsonObject, unitId: string, destination: Position): Position[] {
  const unit = snapshot.units[unitId]; if (!unit || unit.status === 'rooted') return []; const start = { x: unit.slotX, y: unit.slotY }; if (key(start) === key(destination)) return [start]; const destinationKey = key(destination); const occupied = occupiedPositions(snapshot, unitId); if (occupied.has(destinationKey)) return [];
  const mobility = unit.status === 'rooted' ? Math.min(1, unit.mobility) : unit.mobility; const best = new Map([[key(start), 0]]); const previous = new Map<string, string>(); const frontier: any[] = [{ ...start, cost: 0, steps: 0, parentY: -1, parentX: -1 }];
  while (frontier.length) { frontier.sort(queueCompare); const current = frontier.shift(); const currentKey = key(current); if (current.cost !== best.get(currentKey)) continue; if (currentKey === destinationKey) break; if (currentKey !== key(start) && unit.status !== 'qimen' && enemyZone(snapshot, unit.side, current)) continue;
    for (const direction of DIRECTIONS) { const next = { x: current.x + direction.x, y: current.y + direction.y }; const step = stepCost(snapshot, unit, next); if (step < 0 || enemyOccupied(snapshot, unit.side).has(key(next))) continue; const cost = current.cost + step; if (cost > mobility || (best.has(key(next)) && (best.get(key(next)) as number) <= cost)) continue; best.set(key(next), cost); previous.set(key(next), currentKey); frontier.push({ ...next, cost, steps: current.steps + 1, parentY: current.y, parentX: current.x }); }
  }
  if (!best.has(destinationKey)) return []; const path: Position[] = []; let cursor = destinationKey; while (true) { path.push(parsePosition(cursor)); if (cursor === key(start)) break; cursor = previous.get(cursor) ?? ''; if (!cursor) return []; } return path.reverse();
}

function pathCost(snapshot: JsonObject, unitId: string, path: Position[]): number { const unit = snapshot.units[unitId]; return path.slice(1).reduce((total, position) => total + stepCost(snapshot, unit, position), 0); }
function stepCost(snapshot: JsonObject, unit: JsonObject, position: Position): number { const tile = tileAt(snapshot, position); const cost = tile?.movementCosts?.[unit.armsType]; return tile && cost !== null && cost !== undefined ? cost : -1; }
function tileAt(snapshot: JsonObject, position: Position): JsonObject | undefined { return (snapshot.tiles as JsonObject[]).find((tile) => tile.x === position.x && tile.y === position.y); }
function occupiedPositions(snapshot: JsonObject, ignoredId: string) { return new Set(Object.values(snapshot.units).filter((unit: any) => unit.id !== ignoredId && unit.troops > 0).map((unit: any) => key({ x: unit.slotX, y: unit.slotY }))); }
function enemyOccupied(snapshot: JsonObject, side: string) { return new Set(Object.values(snapshot.units).filter((unit: any) => unit.side !== side && unit.troops > 0).map((unit: any) => key({ x: unit.slotX, y: unit.slotY }))); }
function enemyZone(snapshot: JsonObject, side: string, position: Position) { return Object.values(snapshot.units).some((unit: any) => unit.side !== side && unit.troops > 0 && Math.abs(unit.slotX - position.x) + Math.abs(unit.slotY - position.y) === 1); }
function key(position: Position) { return `${position.x},${position.y}`; }
function parsePosition(value: string): Position { const [x, y] = value.split(',').map(Number); return { x, y }; }
function positionCompare(left: Position, right: Position) { return left.y - right.y || left.x - right.x; }
function queueCompare(left: any, right: any) { return left.cost - right.cost || left.steps - right.steps || left.y - right.y || left.x - right.x || left.parentY - right.parentY || left.parentX - right.parentX; }

function withBlockedTile(snapshot: JsonObject, position: Position): JsonObject {
  const next = structuredClone(snapshot); const tile = next.tiles.find((candidate: JsonObject) => candidate.x === position.x && candidate.y === position.y);
  if (tile) { tile.movementCosts = [null, null, null, null, null, null]; tile.passableArms = [false, false, false, false, false, false]; }
  return next;
}

function createTieBreakCase(): JsonObject {
  const tiles: JsonObject[] = [];
  for (let y = 0; y < 5; y += 1) for (let x = 0; x < 5; x += 1) tiles.push({ x, y, terrainId: 0, terrainName: 'plain', movementCosts: [1, 1, 1, 1, 1, 1], passableArms: [true, true, true, true, true, true] });
  return { width: 5, height: 5, terrainContractVersion: 1, tiles, units: { 'u-attacker': { id: 'u-attacker', side: 'attacker', factionId: 'a', slotX: 0, slotY: 0, armsType: 0, mobility: 10, troops: 100, moved: false, acted: false, deployed: true, status: 'normal' } } };
}

function command(commandId: string, expectedBattleStateSha256: string, kind: string, parameters: JsonObject = {}) { return { commandEnvelopeVersion: 1, commandId, expectedBattleStateSha256, kind, parameters }; }

const fixture = buildMovementFixture();
if (writeMode) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8'); process.stdout.write(`[Godot tactical movement] generated ${fixture.steps.length} steps and ${fixture.boundaryCases.length} boundary cases\n`); }
else { let current: unknown; try { current = JSON.parse(readFileSync(path, 'utf8')); } catch { current = null; } if (canonicalJson(current) !== canonicalJson(fixture)) throw new Error('godot/data/fixtures/tactical-battle-movement-v1.json differs from TypeScript oracle'); process.stdout.write(`[Godot tactical movement] PASSED ${fixture.steps.length} steps and ${fixture.boundaryCases.length} boundary cases\n`); }
