import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createProductionSessionState } from '../src/core/migration/applicationSessionContract';
import { canonicalSha256 } from '../src/core/migration/canonicalJson';
import { nextRandom } from '../src/core/random';
import { createTacticalBattle, getAvailableTacticalSkills, getTacticalSkillTargetIds, previewTacticalSkill, useTacticalSkill, type TacticalBattleState, type TacticalSide } from '../src/core/tacticalBattle';
import { MODERN_TERRAIN_MOVE_COSTS } from '../src/compat/baye/tacticalState';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(root, 'godot/data/fixtures/tactical-battle-skill-v1.json');
const writeMode = process.argv.includes('--write');
type JsonObject = Record<string, any>;

export function buildSkillFixture() {
  const state = createProductionSessionState(1, 1);
  const order = { sourceCityId: 'city-12', targetCityId: 'city-11', officerIds: ['officer-1', 'officer-32'], provisions: 20 };
  const created = createTacticalBattle(state, order);
  const actorId = 'officer:officer-1'; const targetId = 'officer:officer-32'; const skillId = 'rally';
  const webBattle = prepareWebBattle(created, actorId, targetId);
  const initialBattle = projectBattle(webBattle);
  const available = getAvailableTacticalSkills(webBattle.units[actorId]).map((skill) => skill.id);
  const targets = getTacticalSkillTargetIds(webBattle, actorId, skillId);
  const webPreview = JSON.parse(JSON.stringify(previewTacticalSkill(webBattle, actorId, skillId, targetId)));
  const equipmentBaseState = structuredClone(state);
  equipmentBaseState.officers['officer-1'] = { ...equipmentBaseState.officers['officer-1'], intelligence: 60, equipmentItemIds: [] };
  const equipmentUnmodifiedBattle = prepareWebBattle(createTacticalBattle(equipmentBaseState, order), actorId, targetId);
  const equipmentState = structuredClone(equipmentBaseState);
  equipmentState.officers['officer-1'] = { ...equipmentState.officers['officer-1'], equipmentItemIds: ['item-13'] };
  const equipmentBattle = prepareWebBattle(createTacticalBattle(equipmentState, order), actorId, targetId);
  for (const battle of [equipmentUnmodifiedBattle, equipmentBattle]) {
    battle.units[targetId].originalTroops = 200;
    battle.units[targetId].troops = 70;
  }
  const equipmentModifierPreview = JSON.parse(JSON.stringify(previewTacticalSkill(equipmentBattle, actorId, skillId, targetId)));
  const webAfter = useTacticalSkill(webBattle, actorId, skillId, targetId);
  const successCommand = command('skill-rally-0001', canonicalSha256(initialBattle), actorId, skillId, targetId);
  const successExpected = resultFor(initialBattle, projectBattle(webAfter), webPreview, successCommand, webBattle.rngSeed, webAfter.rngSeed);
  const selfBattle = structuredClone(webBattle);
  selfBattle.units[actorId].troops = 70;
  selfBattle.units[actorId].moved = false;
  selfBattle.units[actorId].acted = false;
  selfBattle.actedUnitIds = [targetId];
  const selfPreview = JSON.parse(JSON.stringify(previewTacticalSkill(selfBattle, actorId, skillId, actorId)));
  const selfAfter = useTacticalSkill(selfBattle, actorId, skillId, actorId);
  const selfCommand = command('skill-rally-self-0002', canonicalSha256(projectBattle(selfBattle)), actorId, skillId, actorId);
  const selfExpected = resultFor(projectBattle(selfBattle), projectBattle(selfAfter), selfPreview, selfCommand, selfBattle.rngSeed, selfAfter.rngSeed);
  const confirmed = new ReferenceSkillSession(initialBattle, successExpected, targetId);
  const restored = new ReferenceSkillSession(initialBattle, successExpected, targetId);
  const wrongPhase = structuredClone(initialBattle); wrongPhase.phase = 'deployment'; wrongPhase.units[actorId].slotX = 9; wrongPhase.units[actorId].slotY = 3; wrongPhase.units[targetId].slotX = 9; wrongPhase.units[targetId].slotY = 4; wrongPhase.units['ally:ally-a'].slotX = 9; wrongPhase.units['ally:ally-a'].slotY = 5; wrongPhase.units['ally:ally-b'].slotX = 10; wrongPhase.units['ally:ally-b'].slotY = 3; updateDeployment(wrongPhase, actorId); updateDeployment(wrongPhase, targetId); updateDeployment(wrongPhase, 'ally:ally-a'); updateDeployment(wrongPhase, 'ally:ally-b');
  const noPoints = structuredClone(initialBattle); noPoints.units[actorId].skillPoints = 0;
  const acted = structuredClone(initialBattle); acted.units[actorId].acted = true; acted.actedUnitIds = [actorId, targetId].sort();
  const silenced = structuredClone(initialBattle); silenced.units[actorId].status = 'silenced';
  const farTarget = structuredClone(initialBattle); farTarget.units[targetId].slotX = 9; farTarget.units[targetId].slotY = 7; updateDeployment(farTarget, targetId);
  const boundaryCases: JsonObject[] = [
    failureCase('wrong-phase', wrongPhase, actorId, skillId, targetId, 'skill-boundary-phase-0010', '战斗尚未开始'),
    failureCase('no-skill-points', noPoints, actorId, skillId, targetId, 'skill-boundary-points-0011', '计谋不可用'),
    failureCase('acted-actor', acted, actorId, skillId, targetId, 'skill-boundary-acted-0012', '计谋不可用'),
    failureCase('silenced-actor', silenced, actorId, skillId, targetId, 'skill-boundary-silenced-0013', '计谋不可用'),
    failureCase('far-target', farTarget, actorId, skillId, targetId, 'skill-boundary-range-0014', '目标不在计谋范围内'),
    failureCase('stale-digest', initialBattle, actorId, skillId, targetId, 'skill-boundary-stale-0015', '战斗状态摘要已过期', '00000000'),
    failureCase('unknown-target', initialBattle, actorId, skillId, 'officer:unknown', 'skill-boundary-target-0016', '目标不在计谋范围内'),
    failureCase('malformed-skill', initialBattle, actorId, 'fire', targetId, 'skill-boundary-skill-0017', '计谋不可用'),
    failureCase('malformed-target-id', initialBattle, actorId, skillId, 42 as any, 'skill-boundary-type-0018', '战斗命令缺少 targetUnitId'),
    (() => { const session = new ReferenceSkillSession(initialBattle, successExpected, targetId); const first = successCommand; const expected = session.execute(first); return { id: 'duplicate-command', command: first, expected, duplicateExpected: session.execute(first) }; })(),
    (() => { const session = new ReferenceSkillSession(initialBattle, successExpected, targetId); session.execute(successCommand); const conflict = command(successCommand.commandId, canonicalSha256(successExpected.battle), actorId, skillId, targetId); conflict.parameters.targetUnitId = 'officer:unknown'; return { id: 'command-id-conflict', snapshot: initialBattle, prelude: [successCommand], command: conflict, expected: session.execute(conflict) }; })(),
  ];
  return {
    tacticalBattleSkillFixtureVersion: 1,
    algorithms: { canonicalJson: 'canonical-json-v1', digest: 'sha256', skill: 'rally-v1', rng: 'lcg32-explicit-seed-v1' },
    source: { periodId: 1, rulerSourceIndex: 1, initialStateSha256: canonicalSha256(state), battlefieldSource: 'src/core/tacticalBattle.ts:getAvailableTacticalSkills/getTacticalSkillTargetIds/previewTacticalSkill/useTacticalSkill' },
    initialBattle,
    webOracle: { availableSkillIds: available.filter((id) => id === skillId), webAvailableSkillIds: available, targetIds: targets, preview: webPreview },
    equipmentModifierCase: {
      modifier: { kind: 'equipment-intelligence', itemId: 'item-13', equipmentItemIds: ['item-13'], intelligenceBonus: 10 },
      unmodifiedBattle: projectBattle(equipmentUnmodifiedBattle),
      battle: projectBattle(equipmentBattle),
      unmodifiedAvailable: getAvailableTacticalSkills(equipmentUnmodifiedBattle.units[actorId]).some((skill) => skill.id === skillId),
      preview: equipmentModifierPreview,
    },
    success: { command: successCommand, expected: successExpected },
    selfRallyCase: { command: selfCommand, expected: selfExpected },
    restoredContinuation: { command: successCommand, expected: restored.execute(successCommand) },
    boundaryCases,
    expected: { skillId, actorId, targetId, recovery: webPreview.expectedTroopChange, seedAfter: nextRandom(webBattle.rngSeed).seed },
    steps: [{ id: 'skill-rally', command: successCommand, expected: confirmed.execute(successCommand) }],
  };
}

function prepareWebBattle(battle: TacticalBattleState, actorId: string, targetId: string): TacticalBattleState {
  const next = structuredClone(battle); next.activeSide = 'attacker'; next.status = 'ongoing';
  next.units[actorId].x = 3; next.units[actorId].y = 3; next.units[actorId].moved = false; next.units[actorId].acted = false;
  next.units[targetId].x = 3; next.units[targetId].y = 4; next.units[targetId].troops = 70; next.units[targetId].status = 'confused'; next.units[targetId].statusTurns = 1; next.units[targetId].moved = true; next.units[targetId].acted = true;
  next.units['ally:ally-a'] = { id: 'ally:ally-a', name: '辅军甲', factionId: next.attackerFactionId, side: 'attacker', x: 3, y: 5, force: 60, intelligence: 40, level: 1, armsType: 1, mobility: 3, originalTroops: 100, troops: 70, skillPoints: 0, maxSkillPoints: 0, status: 'normal', statusTurns: 0, moved: false, acted: false } as any;
  next.units['ally:ally-b'] = { id: 'ally:ally-b', name: '辅军乙', factionId: next.attackerFactionId, side: 'attacker', x: 4, y: 3, force: 60, intelligence: 40, level: 1, armsType: 1, mobility: 3, originalTroops: 100, troops: 70, skillPoints: 0, maxSkillPoints: 0, status: 'normal', statusTurns: 0, moved: false, acted: false } as any;
  next.actedUnitIds = [targetId];
  return next;
}

function updateDeployment(snapshot: JsonObject, unitId: string): void { const unit = snapshot.units[unitId]; for (const side of ['attacker', 'defender'] as const) { const entry = snapshot.deployment[side].find((candidate: JsonObject) => candidate.unitId === unitId); if (entry) { entry.slotX = unit.slotX; entry.slotY = unit.slotY; } } }

function projectBattle(battle: TacticalBattleState): JsonObject {
  const units: JsonObject = {};
  for (const unit of Object.values(battle.units).sort((left, right) => left.id.localeCompare(right.id))) units[unit.id] = { id: unit.id, name: unit.name, officerId: unit.officerId ?? '', factionId: unit.factionId, side: unit.side, force: unit.force, intelligence: unit.intelligence, level: unit.level, armsType: unit.armsType, mobility: unit.mobility, skillPoints: unit.skillPoints, maxSkillPoints: unit.maxSkillPoints, originalTroops: unit.originalTroops, troops: unit.troops, status: unit.status, statusTurns: unit.statusTurns, moved: unit.moved, acted: unit.acted, deployed: true, slotX: unit.x, slotY: unit.y, ...(unit.normalAttackPatternOverride ? { normalAttackPatternOverride: unit.normalAttackPatternOverride } : {}) };
  const deployment: Record<TacticalSide, JsonObject[]> = { attacker: [], defender: [] }; for (const unit of Object.values(units) as JsonObject[]) deployment[unit.side].push({ unitId: unit.id, slotX: unit.slotX, slotY: unit.slotY }); deployment.attacker.sort((a, b) => a.unitId.localeCompare(b.unitId)); deployment.defender.sort((a, b) => a.unitId.localeCompare(b.unitId));
  const tiles = battle.tiles.map((tile) => { const costs = [...MODERN_TERRAIN_MOVE_COSTS].map((row) => row[tile.terrain] ?? Number.POSITIVE_INFINITY); return { x: tile.x, y: tile.y, terrainId: tile.terrain, terrainName: ['plain', 'road', 'hill', 'forest', 'village', 'city', 'marsh', 'river'][tile.terrain], movementCosts: costs.map((cost) => Number.isFinite(cost) ? cost : null), passableArms: costs.map((cost) => Number.isFinite(cost)), ...(tile.objective ? { objective: tile.objective } : {}) }; });
  return { contractVersion: 1, id: battle.id, strategicTurn: battle.strategicTurn, seedBefore: battle.seedBefore, rngSeed: battle.rngSeed, sourceCityId: battle.sourceCityId, targetCityId: battle.targetCityId, attackerFactionId: battle.attackerFactionId, defenderFactionId: battle.defenderFactionId, attackerOfficerIds: [...battle.attackerOfficerIds], defenderOfficerIds: [...battle.defenderOfficerIds], provisionsCommitted: battle.provisionsCommitted, attackerFood: battle.attackerFood, defenderFood: battle.defenderFood, width: battle.width, height: battle.height, day: battle.day, maxDays: battle.maxDays, weather: battle.weather, phase: 'battle', activeSide: battle.activeSide, status: battle.status, outcome: battle.victoryReason ?? '', approach: battle.approach, battlefieldVersion: battle.battlefieldVersion, battlefieldKey: battle.battlefieldKey, battlefieldTemplate: battle.battlefieldTemplate, deployment, units, actedUnitIds: Object.values(units).filter((unit: JsonObject) => unit.acted).map((unit: JsonObject) => unit.id).sort(), commanderUnitIds: { ...battle.commanderUnitIds }, experienceGains: { ...battle.experienceGains }, experienceGainOrder: [...((battle as any).experienceGainOrder ?? [])], logs: [...battle.logs], guard: { ...battle.guard, participants: battle.guard.participants.map((participant) => ({ ...participant, equipmentKey: participant.equipmentKey.split('\0').join('|'), equipmentKeyEncoding: 'pipe-v1' })) }, terrainContractVersion: 1, tiles };
}

function command(commandId: string, digest: string, unitId: string, skillId: string, targetUnitId: any): JsonObject { return { commandEnvelopeVersion: 1, commandId, expectedBattleStateSha256: digest, kind: 'use_skill', parameters: { unitId, skillId, targetUnitId } }; }
function resultFor(before: JsonObject, after: JsonObject, preview: JsonObject, commandValue: JsonObject, seedBefore: number, seedAfter: number): JsonObject { const beforeDigest = canonicalSha256(before); const afterDigest = canonicalSha256(after); return { ok: true, error: '', stateChanged: true, beforeBattleStateSha256: beforeDigest, afterBattleStateSha256: afterDigest, receipt: { kind: 'use_skill', details: { unitId: commandValue.parameters.unitId, skillId: commandValue.parameters.skillId, targetUnitId: commandValue.parameters.targetUnitId, preview, succeeded: true, recovery: preview.expectedTroopChange, experienceGained: 6, seedBefore, seedAfter }, battleStateSha256: afterDigest }, commandId: commandValue.commandId, kind: 'use_skill', battle: after }; }
function failureCase(id: string, snapshot: JsonObject, unitId: string, skillId: string, targetUnitId: any, commandId: string, error: string, digest = canonicalSha256(snapshot)): JsonObject { const value = command(commandId, digest, unitId, skillId, targetUnitId); return { id, snapshot, command: value, expected: { ok: false, error, stateChanged: false, beforeBattleStateSha256: canonicalSha256(snapshot), afterBattleStateSha256: canonicalSha256(snapshot), receipt: {}, commandId, kind: 'use_skill', battle: snapshot } }; }

class ReferenceSkillSession {
  private state: JsonObject; private completed = new Map<string, { requestSha256: string; result: JsonObject }>();
  constructor(snapshot: JsonObject, private plan: JsonObject, private targetUnitId: string) { this.state = structuredClone(snapshot); }
  execute(value: JsonObject): JsonObject { const before = structuredClone(this.state); const digest = canonicalSha256(before); const id = String(value.commandId ?? ''); const req = canonicalSha256(value); if (this.completed.has(id)) { const cached = this.completed.get(id)!; if (cached.requestSha256 === req) { const duplicate = structuredClone(cached.result); duplicate.battle = before; duplicate.beforeBattleStateSha256 = digest; duplicate.afterBattleStateSha256 = digest; duplicate.stateChanged = false; duplicate.duplicate = true; return duplicate; } return this.fail(before, digest, 'commandId 已经用于另一条战斗命令', value); } if (value.expectedBattleStateSha256 !== digest) return this.fail(before, digest, '战斗状态摘要已过期', value); const params = value.parameters ?? {}; let result: JsonObject; const actor = before.units[params.unitId]; const target = before.units[params.targetUnitId]; if (before.phase !== 'battle') result = this.fail(before, digest, '战斗尚未开始', value); else if (!actor || actor.troops <= 0) result = this.fail(before, digest, '单位不存在或已经退出战斗', value); else if (!actor.deployed) result = this.fail(before, digest, '计谋单位尚未部署', value); else if (actor.acted || params.skillId !== 'rally' || params.targetUnitId !== this.targetUnitId || actor.skillPoints < 20) result = this.fail(before, digest, actor.acted || actor.skillPoints < 20 ? '计谋不可用' : '目标不在计谋范围内', value); else if (!target || !target.deployed) result = this.fail(before, digest, '目标不在计谋范围内', value); else { result = structuredClone(this.plan); this.state = structuredClone(this.plan.battle); } result.commandId = id; result.kind = 'use_skill'; if (!result.battle) result.battle = before; this.completed.set(id, { requestSha256: req, result: structuredClone(result) }); return result; }
  private fail(before: JsonObject, digest: string, error: string, value: JsonObject): JsonObject { return { ok: false, error, stateChanged: false, beforeBattleStateSha256: digest, afterBattleStateSha256: digest, receipt: {}, commandId: value.commandId ?? '', kind: value.kind ?? '', battle: before }; }
}

if (writeMode) { mkdirSync(resolve(root, 'godot/data/fixtures'), { recursive: true }); writeFileSync(fixturePath, `${JSON.stringify(buildSkillFixture(), null, 2)}\n`); console.log('[Godot tactical skill] generated fixture'); } else { const fixture = buildSkillFixture(); const disk = JSON.parse(readFileSync(fixturePath, 'utf8')); if (canonicalSha256(disk) !== canonicalSha256(fixture)) throw new Error('godot/data/fixtures/tactical-battle-skill-v1.json differs from TypeScript oracle'); console.log(`[Godot tactical skill] PASSED ${fixture.boundaryCases.length} boundary cases`); }
