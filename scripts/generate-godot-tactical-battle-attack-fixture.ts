import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createProductionSessionState } from '../src/core/migration/applicationSessionContract';
import { canonicalSha256 } from '../src/core/migration/canonicalJson';
import {
  attackTacticalUnit,
  createTacticalBattle,
  getAttackableUnitIds,
  previewTacticalAttack,
  type TacticalBattleState,
  type TacticalSide,
} from '../src/core/tacticalBattle';
import { MODERN_TERRAIN_MOVE_COSTS } from '../src/compat/baye/tacticalState';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(root, 'godot/data/fixtures/tactical-battle-attack-v1.json');
const writeMode = process.argv.includes('--write');
type JsonObject = Record<string, any>;

export function buildAttackFixture() {
  const state = createProductionSessionState(1, 1);
  const order = { sourceCityId: 'city-12', targetCityId: 'city-11', officerIds: ['officer-1'], provisions: 20 };
  const created = createTacticalBattle(state, order);
  const attackerId = 'officer:officer-1';
  const targetId = 'officer:officer-81';
  const webBattle = prepareWebBattle(created, attackerId, targetId, 3, 3);
  const initialBattle = projectBattle(webBattle);
  const webTargets = getAttackableUnitIds(webBattle, attackerId);
  const webPreview = previewTacticalAttack(webBattle, attackerId, targetId);
  let webFailure = '';
  try { attackTacticalUnit(webBattle, attackerId, 'officer:unknown'); } catch (error) { webFailure = error instanceof Error ? error.message : String(error); }
  const webAfter = attackTacticalUnit(webBattle, attackerId, targetId);
  const successCommand = command('attack-success-0001', canonicalSha256(initialBattle), attackerId, targetId);
  const successExpected = resultFor(initialBattle, projectBattle(webAfter), webPreview, attackerId, targetId, successCommand);

  const zeroWebBattle = prepareWebBattle(created, attackerId, targetId, 3, 3);
  zeroWebBattle.units[targetId].troops = 10;
  const zeroInitial = projectBattle(zeroWebBattle);
  const zeroPreview = previewTacticalAttack(zeroWebBattle, attackerId, targetId);
  const zeroAfter = attackTacticalUnit(zeroWebBattle, attackerId, targetId);
  const zeroCommand = command('attack-defeat-0002', canonicalSha256(zeroInitial), attackerId, targetId);
  const zeroExpected = resultFor(zeroInitial, projectBattle(zeroAfter), zeroPreview, attackerId, targetId, zeroCommand);

  const dunjiaWebBattle = prepareWebBattle(created, attackerId, targetId, 3, 3);
  dunjiaWebBattle.units[targetId].status = 'dunjia';
  const dunjiaInitial = projectBattle(dunjiaWebBattle);
  const dunjiaPreview = previewTacticalAttack(dunjiaWebBattle, attackerId, targetId);
  const dunjiaAfter = attackTacticalUnit(dunjiaWebBattle, attackerId, targetId);
  const dunjiaCommand = command('attack-dunjia-0003', canonicalSha256(dunjiaInitial), attackerId, targetId);
  const dunjiaExpected = resultFor(dunjiaInitial, projectBattle(dunjiaAfter), dunjiaPreview, attackerId, targetId, dunjiaCommand);

  const confirmed = new ReferenceAttackSession(initialBattle, successExpected, targetId);
  const steps = [{ id: 'attack-success', command: successCommand, expected: confirmed.execute(successCommand) }];
  const restored = new ReferenceAttackSession(initialBattle, successExpected, targetId);
  const restoredContinuation = { command: successCommand, expected: restored.execute(successCommand) };
  const wrongPhase = structuredClone(initialBattle);
  wrongPhase.phase = 'deployment';
  wrongPhase.units[attackerId].slotX = 9;
  updateDeployment(wrongPhase, attackerId);
  const undeployed = structuredClone(initialBattle);
  undeployed.units[attackerId].deployed = false;
  undeployed.deployment.attacker = [];
  const undeployedTarget = structuredClone(initialBattle);
  undeployedTarget.units[targetId].deployed = false;
  undeployedTarget.deployment.defender = undeployedTarget.deployment.defender.filter((entry: JsonObject) => entry.unitId !== targetId);
  const boundaryCases: JsonObject[] = [
    failureCase('wrong-phase', wrongPhase, attackerId, targetId, 'attack-boundary-phase-0010', '战斗尚未开始'),
    failureCase('unknown-target', initialBattle, attackerId, 'officer:unknown', 'attack-boundary-target-0011', webFailure),
    failureCase('friendly-target', initialBattle, attackerId, 'officer:officer-1', 'attack-boundary-friendly-0012', '攻击目标无效'),
    failureCase('out-of-range', initialBattle, attackerId, 'officer:officer-84', 'attack-boundary-range-0013', '目标不在攻击范围内'),
    failureCase('stale-digest', initialBattle, attackerId, targetId, 'attack-boundary-stale-0014', '战斗状态摘要已过期', '00000000'),
    (() => {
      const session = new ReferenceAttackSession(initialBattle, successExpected, targetId);
      const first = successCommand;
      const expected = session.execute(first);
      return { id: 'duplicate-command', command: first, expected, duplicateExpected: session.execute(first) };
    })(),
    (() => {
      const session = new ReferenceAttackSession(initialBattle, successExpected, targetId);
      const first = successCommand;
      session.execute(first);
      const conflict = command('attack-success-0001', session.digest(), attackerId, targetId === 'officer:officer-81' ? 'officer:officer-84' : targetId);
      return { id: 'command-id-conflict', snapshot: initialBattle, prelude: [first], command: conflict, expected: session.execute(conflict) };
    })(),
    (() => {
      const session = new ReferenceAttackSession(initialBattle, successExpected, targetId);
      const first = successCommand;
      session.execute(first);
      const repeated = command('attack-boundary-acted-0016', session.digest(), attackerId, targetId);
      return { id: 'acted-attacker', snapshot: initialBattle, prelude: [first], command: repeated, expected: session.execute(repeated) };
    })(),
    failureCase('hidden-far', prepareHiddenFar(initialBattle, attackerId, targetId), attackerId, targetId, 'attack-boundary-hidden-0017', '目标不在攻击范围内'),
    failureCase('malformed-target-id', initialBattle, attackerId, 42 as any, 'attack-boundary-type-0018', '战斗命令缺少 targetUnitId'),
    failureCase('undeployed-attacker', undeployed, attackerId, targetId, 'attack-boundary-deployed-0019', '攻击单位尚未部署'),
    failureCase('undeployed-target', undeployedTarget, attackerId, targetId, 'attack-boundary-deployed-0020', '攻击目标尚未部署'),
  ];
  return {
    tacticalBattleAttackFixtureVersion: 1,
    algorithms: { canonicalJson: 'canonical-json-v1', digest: 'sha256', damage: 'baye-u16-f32-modern-terrain-v1', rng: 'explicit-seed-no-consumption-v1' },
    source: { periodId: 1, rulerSourceIndex: 1, initialStateSha256: canonicalSha256(state), battlefieldSource: 'src/core/tacticalBattle.ts:getAttackableUnitIds/previewTacticalAttack/attackTacticalUnit + src/compat/baye/tacticalBattle.ts' },
    initialBattle,
    webOracle: { attackableUnitIds: webTargets, preview: webPreview, failure: { targetUnitId: 'officer:unknown', error: webFailure }, expectedAfterBattle: projectBattle(webAfter) },
    success: { command: successCommand, expected: successExpected },
    defeatCase: { initialBattle: zeroInitial, command: zeroCommand, expected: zeroExpected },
    dunjiaCase: { initialBattle: dunjiaInitial, command: dunjiaCommand, expected: dunjiaExpected },
    restoredContinuation,
    boundaryCases,
    expected: { attackableCount: webTargets.length, targetId, zeroTroopsAfter: zeroAfter.units[targetId].troops, dunjiaDamage: dunjiaPreview.damage },
  };
}

function prepareWebBattle(battle: TacticalBattleState, attackerId: string, targetId: string, attackerX: number, attackerY: number): TacticalBattleState {
  const next = structuredClone(battle);
  next.activeSide = 'attacker'; next.status = 'ongoing';
  next.units[attackerId].x = attackerX; next.units[attackerId].y = attackerY; next.units[attackerId].moved = false; next.units[attackerId].acted = false;
  next.units[targetId].moved = false; next.units[targetId].acted = false;
  return next;
}

function prepareHiddenFar(snapshot: JsonObject, attackerId: string, targetId: string): JsonObject {
  const next = structuredClone(snapshot);
  next.units[attackerId].slotX = 5; next.units[attackerId].slotY = 3;
  next.units[targetId].status = 'hidden';
  updateDeployment(next, attackerId); updateDeployment(next, targetId);
  return next;
}

function updateDeployment(snapshot: JsonObject, unitId: string): void {
  const unit = snapshot.units[unitId];
  for (const side of ['attacker', 'defender'] as const) {
    const entry = snapshot.deployment[side].find((candidate: JsonObject) => candidate.unitId === unitId);
    if (entry) { entry.slotX = unit.slotX; entry.slotY = unit.slotY; }
  }
}

function projectBattle(battle: TacticalBattleState): JsonObject {
  const units: JsonObject = {};
  for (const unit of Object.values(battle.units).sort((left, right) => left.id.localeCompare(right.id))) {
    units[unit.id] = {
      id: unit.id, name: unit.name, officerId: unit.officerId ?? '', factionId: unit.factionId, side: unit.side,
      force: unit.force, intelligence: unit.intelligence, level: unit.level, armsType: unit.armsType, mobility: unit.mobility,
      originalTroops: unit.originalTroops, troops: unit.troops, status: unit.status, statusTurns: unit.statusTurns,
      moved: unit.moved, acted: unit.acted, deployed: true, slotX: unit.x, slotY: unit.y,
      ...(unit.normalAttackPatternOverride ? { normalAttackPatternOverride: unit.normalAttackPatternOverride } : {}),
    };
  }
  const deployment: Record<TacticalSide, JsonObject[]> = { attacker: [], defender: [] };
  for (const unit of Object.values(units) as JsonObject[]) deployment[unit.side].push({ unitId: unit.id, slotX: unit.slotX, slotY: unit.slotY });
  deployment.attacker.sort((left, right) => left.unitId.localeCompare(right.unitId)); deployment.defender.sort((left, right) => left.unitId.localeCompare(right.unitId));
  const tiles = battle.tiles.map((tile) => {
    const costs = [...MODERN_TERRAIN_MOVE_COSTS].map((row) => row[tile.terrain] ?? Number.POSITIVE_INFINITY);
    return { x: tile.x, y: tile.y, terrainId: tile.terrain, terrainName: ['plain', 'road', 'hill', 'forest', 'village', 'city', 'marsh', 'river'][tile.terrain], movementCosts: costs.map((cost) => Number.isFinite(cost) ? cost : null), passableArms: costs.map((cost) => Number.isFinite(cost)), ...(tile.objective ? { objective: tile.objective } : {}) };
  });
  return {
    contractVersion: 1, id: battle.id, strategicTurn: battle.strategicTurn, seedBefore: battle.seedBefore, rngSeed: battle.rngSeed,
    sourceCityId: battle.sourceCityId, targetCityId: battle.targetCityId, attackerFactionId: battle.attackerFactionId, defenderFactionId: battle.defenderFactionId,
    attackerOfficerIds: [...battle.attackerOfficerIds], defenderOfficerIds: [...battle.defenderOfficerIds], provisionsCommitted: battle.provisionsCommitted,
    attackerFood: battle.attackerFood, defenderFood: battle.defenderFood, width: battle.width, height: battle.height, day: battle.day, maxDays: battle.maxDays,
    weather: battle.weather, phase: 'battle', activeSide: battle.activeSide, status: battle.status, outcome: battle.victoryReason ?? '', approach: battle.approach,
    battlefieldVersion: battle.battlefieldVersion, battlefieldKey: battle.battlefieldKey, battlefieldTemplate: battle.battlefieldTemplate,
    deployment, units, actedUnitIds: Object.values(units).filter((unit: JsonObject) => unit.acted).map((unit: JsonObject) => unit.id).sort(), commanderUnitIds: { ...battle.commanderUnitIds }, experienceGains: { ...battle.experienceGains }, logs: [...battle.logs], guard: { ...battle.guard, participants: battle.guard.participants.map((participant) => ({ ...participant, equipmentKey: participant.equipmentKey.split('\0').join('|'), equipmentKeyEncoding: 'pipe-v1' })) }, terrainContractVersion: 1, tiles,
  };
}

function command(commandId: string, digest: string, unitId: string, targetUnitId: any): JsonObject { return { commandEnvelopeVersion: 1, commandId, expectedBattleStateSha256: digest, kind: 'attack_unit', parameters: { unitId, targetUnitId } }; }

function resultFor(before: JsonObject, after: JsonObject, preview: JsonObject, unitId: string, targetUnitId: string, commandValue: JsonObject): JsonObject {
  const beforeDigest = canonicalSha256(before); const afterDigest = canonicalSha256(after); const damage = preview.damage; const attacker = before.units[unitId]; const target = before.units[targetUnitId];
  const levelDifference = attacker.level - target.level;
  const base = Math.floor(Math.sqrt(Math.max(0, Math.floor(damage)))) >> 2;
  const adjusted = levelDifference < 0 ? base + Math.abs(levelDifference) : Math.max(0, base - levelDifference);
  const gained = damage > 0 ? adjusted + 2 : 0;
  return { ok: true, error: '', stateChanged: true, beforeBattleStateSha256: beforeDigest, afterBattleStateSha256: afterDigest, receipt: { kind: 'attack_unit', details: { unitId, targetUnitId, preview, damage, targetTroopsAfter: preview.targetTroopsAfter, experienceGained: gained, seedBefore: before.rngSeed, seedAfter: after.rngSeed }, battleStateSha256: afterDigest }, commandId: commandValue.commandId, kind: 'attack_unit', battle: after };
}

function failureCase(id: string, snapshot: JsonObject, unitId: string, targetUnitId: any, commandId: string, error: string, digest = canonicalSha256(snapshot)): JsonObject {
  const commandValue = command(commandId, digest, unitId, targetUnitId);
  return { id, snapshot, command: commandValue, expected: { ok: false, error, stateChanged: false, beforeBattleStateSha256: canonicalSha256(snapshot), afterBattleStateSha256: canonicalSha256(snapshot), receipt: {}, commandId, kind: 'attack_unit', battle: snapshot } };
}

class ReferenceAttackSession {
  private state: JsonObject;
  private completed = new Map<string, { requestSha256: string; result: JsonObject }>();
  constructor(snapshot: JsonObject, private plan: JsonObject, private targetUnitId: string) { this.state = structuredClone(snapshot); }
  snapshot() { return structuredClone(this.state); }
  digest() { return canonicalSha256(this.state); }
  execute(commandValue: JsonObject): JsonObject {
    const before = this.snapshot(); const beforeDigest = this.digest(); const commandId = String(commandValue.commandId ?? ''); const requestSha256 = canonicalSha256(commandValue);
    if (commandValue.commandEnvelopeVersion !== 1) return this.fail(before, beforeDigest, '不支持的战斗命令版本', commandValue);
    if (typeof commandValue.commandId !== 'string' || !commandValue.commandId) return this.fail(before, beforeDigest, '战斗命令缺少 commandId', commandValue);
    if (typeof commandValue.expectedBattleStateSha256 !== 'string' || !commandValue.expectedBattleStateSha256) return this.fail(before, beforeDigest, '战斗命令缺少 expectedBattleStateSha256', commandValue);
    if (!commandValue.parameters || typeof commandValue.parameters !== 'object' || Array.isArray(commandValue.parameters)) return this.fail(before, beforeDigest, '战斗命令 parameters 必须是对象', commandValue);
    if (this.completed.has(commandId)) { const cached = this.completed.get(commandId)!; if (cached.requestSha256 === requestSha256) { const duplicate = structuredClone(cached.result); duplicate.battle = before; duplicate.beforeBattleStateSha256 = beforeDigest; duplicate.afterBattleStateSha256 = beforeDigest; duplicate.stateChanged = false; duplicate.duplicate = true; return duplicate; } return this.fail(before, beforeDigest, 'commandId 已经用于另一条战斗命令', commandValue); }
    if (commandValue.expectedBattleStateSha256 !== beforeDigest) return this.fail(before, beforeDigest, '战斗状态摘要已过期', commandValue);
    const params = commandValue.parameters as JsonObject; const attacker = before.units[params.unitId]; const target = before.units[params.targetUnitId];
    let result: JsonObject;
    if (before.phase !== 'battle') result = this.fail(before, beforeDigest, '战斗尚未开始', commandValue);
    else if (before.status !== 'ongoing') result = this.fail(before, beforeDigest, '战斗已经结束', commandValue);
    else if (!attacker || attacker.troops <= 0) result = this.fail(before, beforeDigest, '单位不存在或已经退出战斗', commandValue);
    else if (!attacker.deployed) result = this.fail(before, beforeDigest, '攻击单位尚未部署', commandValue);
    else if (attacker.side !== before.activeSide) result = this.fail(before, beforeDigest, '当前不是该单位所属阵营的行动阶段', commandValue);
    else if (!target || target.troops <= 0 || target.side === attacker.side) result = this.fail(before, beforeDigest, '攻击目标无效', commandValue);
    else if (!target.deployed) result = this.fail(before, beforeDigest, '攻击目标尚未部署', commandValue);
    else if (attacker.acted || !this.plan || params.targetUnitId !== this.targetUnitId) result = this.fail(before, beforeDigest, '目标不在攻击范围内', commandValue);
    else { result = structuredClone(this.plan); this.state = structuredClone(this.plan.battle); }
    result.commandId = commandId; result.kind = 'attack_unit'; if (!result.battle) result.battle = before;
    this.completed.set(commandId, { requestSha256, result: structuredClone(result) }); return result;
  }
  private fail(before: JsonObject, beforeDigest: string, error: string, commandValue: JsonObject): JsonObject { return { ok: false, error, stateChanged: false, beforeBattleStateSha256: beforeDigest, afterBattleStateSha256: beforeDigest, receipt: {}, commandId: commandValue.commandId ?? '', kind: commandValue.kind ?? '', battle: before }; }
}

if (writeMode) { mkdirSync(resolve(root, 'godot/data/fixtures'), { recursive: true }); writeFileSync(fixturePath, `${JSON.stringify(buildAttackFixture(), null, 2)}\n`); console.log('[Godot tactical attack] generated fixture'); } else {
  const fixture = buildAttackFixture();
  const disk = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (canonicalSha256(disk) !== canonicalSha256(fixture)) throw new Error('godot/data/fixtures/tactical-battle-attack-v1.json differs from TypeScript oracle');
  console.log(`[Godot tactical attack] PASSED ${fixture.boundaryCases.length} boundary cases`);
}
