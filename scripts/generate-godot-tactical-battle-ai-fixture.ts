import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createProductionSessionState } from '../src/core/migration/applicationSessionContract';
import { canonicalSha256 } from '../src/core/migration/canonicalJson';
import { attackTacticalUnit, createTacticalBattle, endTacticalSide, getAttackableUnitIds, getAvailableTacticalSkills, getReachableTiles, getTacticalSkillTargetIds, moveTacticalUnit, previewTacticalAttack, previewTacticalSkill, runBasicTacticalAi, useTacticalSkill, waitTacticalUnit, type TacticalBattleState, type TacticalSide } from '../src/core/tacticalBattle';
import { MODERN_TERRAIN_MOVE_COSTS } from '../src/compat/baye/tacticalState';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(root, 'godot/data/fixtures/tactical-battle-ai-v1.json');
const writeMode = process.argv.includes('--write');
type JsonObject = Record<string, any>;

export function buildAiFixture() {
  const state = createProductionSessionState(1, 1);
  const order = { sourceCityId: 'city-12', targetCityId: 'city-11', officerIds: ['officer-1'], provisions: 20 };
  const created = createTacticalBattle(state, order);
  const actorId = 'officer:officer-1'; const targetId = 'officer:officer-84';
  const webBattle = prepareAiBattle(created, actorId, targetId);
  const initialBattle = projectBattle(webBattle);
  const attackable = getAttackableUnitIds(webBattle, actorId);
  const preview = previewTacticalAttack(webBattle, actorId, targetId);
  const actionAfter = attackTacticalUnit(webBattle, actorId, targetId);
  const actionCommand = command('ai-attack-0001', canonicalSha256(initialBattle), actorId, targetId);
  const actionExpected = resultFor(initialBattle, projectBattle(actionAfter), preview, actorId, targetId, actionCommand);
  const webFinal = runBasicTacticalAi(prepareAiBattle(created, actorId, targetId));
  const skillWebBattle = prepareAiBattle(created, actorId, targetId); skillWebBattle.units[actorId].troops = 70; skillWebBattle.units[actorId].skillPoints = 30; skillWebBattle.units[actorId].maxSkillPoints = 30;
  const skillTrace = traceWebAi(skillWebBattle);
  const moveAttackWebBattle = prepareAiBattle(created, actorId, targetId); moveAttackWebBattle.units[targetId].x = 3; moveAttackWebBattle.units[targetId].y = 7; moveAttackWebBattle.units[targetId].troops = 100;
  const moveAttackTrace = traceWebAi(moveAttackWebBattle);
  const moveWaitWebBattle = prepareAiBattle(created, actorId, targetId); moveWaitWebBattle.units[targetId].x = 0; moveWaitWebBattle.units[targetId].y = 7; moveWaitWebBattle.units[targetId].troops = 100;
  const moveWaitTrace = traceWebAi(moveWaitWebBattle);
  const boundaryCases = createBoundaryCases(initialBattle, actionExpected, actorId, targetId, actionCommand);
  return {
    tacticalBattleAiFixtureVersion: 1,
    algorithms: { canonicalJson: 'canonical-json-v1', digest: 'sha256', policy: 'web-basic-tactical-ai-v1', actionOrder: 'commander-defeat-then-lethal-damage-then-damage-then-id-v1' },
    source: { periodId: 1, rulerSourceIndex: 1, initialStateSha256: canonicalSha256(state), battlefieldSource: 'src/core/tacticalBattle.ts:runBasicTacticalAi/chooseAiTarget' },
    initialBattle,
    webOracle: { activeSide: 'attacker', unitOrder: [actorId], attackableUnitIds: attackable, selectedAction: { kind: 'attack_unit', unitId: actorId, targetUnitId: targetId }, preview, expectedFinalBattle: projectBattle(webFinal) },
    action: { command: actionCommand, expected: actionExpected },
    finalBattle: projectBattle(webFinal),
    policyCases: [
      { id: 'rally-self', initialBattle: projectBattle(skillWebBattle), webOracle: { actions: skillTrace.actions, finalBattle: projectBattle(skillTrace.final) } },
      { id: 'move-and-attack', initialBattle: projectBattle(moveAttackWebBattle), webOracle: { actions: moveAttackTrace.actions, finalBattle: projectBattle(moveAttackTrace.final) } },
      { id: 'move-and-wait', initialBattle: projectBattle(moveWaitWebBattle), webOracle: { actions: moveWaitTrace.actions, finalBattle: projectBattle(moveWaitTrace.final) } },
    ],
    boundaryCases,
    expected: { actorId, targetId, actionKind: 'attack_unit', seedBefore: initialBattle.rngSeed, seedAfter: projectBattle(actionAfter).rngSeed, finalActiveSide: projectBattle(webFinal).activeSide },
  };
}

function traceWebAi(state: TacticalBattleState): { final: TacticalBattleState; actions: JsonObject[] } {
  let next = structuredClone(state); const actions: JsonObject[] = []; const side = next.activeSide;
  const objective = next.tiles.find((tile) => tile.objective === 'city'); const enemyCommander = next.units[next.commanderUnitIds[side === 'attacker' ? 'defender' : 'attacker']];
  const unitIds = Object.values(next.units).filter((unit) => unit.side === side && unit.troops > 0).sort((a, b) => (objective ? distance(a, objective) - distance(b, objective) : enemyCommander ? distance(a, enemyCommander) - distance(b, enemyCommander) : 0) || a.id.localeCompare(b.id)).map((unit) => unit.id);
  while (next.status === 'ongoing') {
    const unitId = unitIds.find((id) => next.units[id] && next.units[id].troops > 0 && !next.units[id].acted); if (!unitId) break;
    const skill = chooseWebSkill(next, unitId);
    if (skill) { actions.push({ kind: 'use_skill', unitId, skillId: skill.skillId, targetUnitId: skill.targetUnitId }); next = useTacticalSkill(next, unitId, skill.skillId, skill.targetUnitId); continue; }
    const immediate = chooseWebTarget(next, unitId);
    if (immediate) { actions.push({ kind: 'attack_unit', unitId, targetUnitId: immediate }); next = attackTacticalUnit(next, unitId, immediate); continue; }
    const current = next.units[unitId]; const destination = chooseWebDestination(next, current, getReachableTiles(next, unitId));
    if (destination) { actions.push({ kind: 'move_unit', unitId, slotX: destination.x, slotY: destination.y }); next = moveTacticalUnit(next, unitId, destination); }
    if (next.status !== 'ongoing') break;
    const afterMove = chooseWebTarget(next, unitId);
    if (afterMove) { actions.push({ kind: 'attack_unit', unitId, targetUnitId: afterMove }); next = attackTacticalUnit(next, unitId, afterMove); }
    else { actions.push({ kind: 'wait_unit', unitId }); next = waitTacticalUnit(next, unitId); }
  }
  return { final: next.status === 'ongoing' ? endTacticalSide(next) : next, actions };
}

function chooseWebSkill(state: TacticalBattleState, unitId: string): JsonObject | undefined {
  const unit = state.units[unitId]; if (!unit) return undefined; const commander = state.commanderUnitIds[unit.side];
  return getAvailableTacticalSkills(unit).flatMap((skill) => getTacticalSkillTargetIds(state, unitId, skill.id).map((targetUnitId) => { const target = state.units[targetUnitId]; const preview = previewTacticalSkill(state, unitId, skill.id, targetUnitId); const chance = preview.successChance / 100; let score = 0; if (skill.effect === 'troop-recovery') score = preview.expectedTroopChange + (target.status !== 'normal' ? 12000 : 0); if (targetUnitId === commander && skill.target === 'enemy') score += 2000; if (skill.target === 'ally' && targetUnitId === commander) score += 300; return { skillId: skill.id, targetUnitId, score, chance }; })).filter((candidate) => candidate.score >= 6).sort((a, b) => b.score - a.score || a.skillId.localeCompare(b.skillId) || a.targetUnitId.localeCompare(b.targetUnitId))[0];
}

function chooseWebTarget(state: TacticalBattleState, unitId: string): string | undefined { const unit = state.units[unitId]; const commander = unit.side === 'attacker' ? state.commanderUnitIds.defender : state.commanderUnitIds.attacker; return getAttackableUnitIds(state, unitId).map((targetId) => ({ targetId, preview: previewTacticalAttack(state, unitId, targetId) })).sort((a, b) => Number(b.targetId === commander) - Number(a.targetId === commander) || Number(b.preview.damage >= state.units[b.targetId].troops) - Number(a.preview.damage >= state.units[a.targetId].troops) || b.preview.damage - a.preview.damage || a.targetId.localeCompare(b.targetId))[0]?.targetId; }

function chooseWebDestination(state: TacticalBattleState, unit: any, destinations: any[]): any | undefined { if (destinations.length === 0) return undefined; const enemies = Object.values(state.units).filter((candidate: any) => candidate.side !== unit.side && candidate.troops > 0) as any[]; const objective = state.tiles.find((tile) => tile.objective === 'city'); return [...destinations].sort((a, b) => aiPositionScore(state, unit, a, enemies, objective) - aiPositionScore(state, unit, b, enemies, objective) || a.y - b.y || a.x - b.x)[0]; }
function aiPositionScore(state: TacticalBattleState, unit: any, position: any, enemies: any[], objective: any): number { const enemyDistance = enemies.length === 0 ? 0 : Math.min(...enemies.map((enemy) => distance(position, enemy))); const simulated = structuredClone(state); simulated.units[unit.id] = { ...simulated.units[unit.id], x: position.x, y: position.y, moved: true }; const targets = getAttackableUnitIds(simulated, unit.id); const best = targets.map((targetId) => ({ preview: previewTacticalAttack(simulated, unit.id, targetId), troops: state.units[targetId].troops })).sort((a, b) => Number(b.preview.damage >= b.troops) - Number(a.preview.damage >= a.troops) || b.preview.damage - a.preview.damage)[0]?.preview; if (best) return -10000 - best.damage; if (!objective) return enemyDistance; const objectiveDistance = distance(position, objective); if (unit.side === 'attacker') { const provision = Math.max(1, Math.ceil(Object.values(state.units).filter((candidate: any) => candidate.side === 'attacker').reduce((total: number, candidate: any) => total + Math.max(0, candidate.troops), 0) / 1000)); return objectiveDistance * (state.attackerFood <= provision * 3 ? 5 : 2) + enemyDistance; } const preferred = unit.armsType === 2 ? 2 : 1; return objectiveDistance * 3 + Math.abs(enemyDistance - preferred); }
function distance(a: any, b: any): number { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function prepareAiBattle(battle: TacticalBattleState, actorId: string, targetId: string): TacticalBattleState {
  const next = structuredClone(battle); next.activeSide = 'attacker'; next.status = 'ongoing';
  next.units[actorId].x = 3; next.units[actorId].y = 3; next.units[actorId].moved = false; next.units[actorId].acted = false; next.units[actorId].skillPoints = 0; next.units[actorId].maxSkillPoints = 0;
  for (const unit of Object.values(next.units)) if (unit.side === 'defender' && unit.id !== targetId) { unit.troops = 0; unit.acted = false; unit.moved = false; }
  next.units[targetId].x = 3; next.units[targetId].y = 4; next.units[targetId].moved = false; next.units[targetId].acted = false; next.units[targetId].troops = 100;
  next.actedUnitIds = [];
  return next;
}

function projectBattle(battle: TacticalBattleState): JsonObject {
  const units: JsonObject = {};
  for (const unit of Object.values(battle.units).sort((left, right) => left.id.localeCompare(right.id))) units[unit.id] = { id: unit.id, name: unit.name, officerId: unit.officerId ?? '', factionId: unit.factionId, side: unit.side, force: unit.force, intelligence: unit.intelligence, level: unit.level, armsType: unit.armsType, mobility: unit.mobility, skillPoints: unit.skillPoints, maxSkillPoints: unit.maxSkillPoints, originalTroops: unit.originalTroops, troops: unit.troops, status: unit.status, statusTurns: unit.statusTurns, moved: unit.moved, acted: unit.acted, deployed: true, slotX: unit.x, slotY: unit.y, ...(unit.normalAttackPatternOverride ? { normalAttackPatternOverride: unit.normalAttackPatternOverride } : {}) };
  const deployment: Record<TacticalSide, JsonObject[]> = { attacker: [], defender: [] };
  for (const unit of Object.values(units) as JsonObject[]) deployment[unit.side].push({ unitId: unit.id, slotX: unit.slotX, slotY: unit.slotY });
  deployment.attacker.sort((a, b) => a.unitId.localeCompare(b.unitId)); deployment.defender.sort((a, b) => a.unitId.localeCompare(b.unitId));
  const tiles = battle.tiles.map((tile) => { const costs = [...MODERN_TERRAIN_MOVE_COSTS].map((row) => row[tile.terrain] ?? Number.POSITIVE_INFINITY); return { x: tile.x, y: tile.y, terrainId: tile.terrain, terrainName: ['plain', 'road', 'hill', 'forest', 'village', 'city', 'marsh', 'river'][tile.terrain], movementCosts: costs.map((cost) => Number.isFinite(cost) ? cost : null), passableArms: costs.map((cost) => Number.isFinite(cost)), ...(tile.objective ? { objective: tile.objective } : {}) }; });
  return { contractVersion: 1, id: battle.id, strategicTurn: battle.strategicTurn, seedBefore: battle.seedBefore, rngSeed: battle.rngSeed, sourceCityId: battle.sourceCityId, targetCityId: battle.targetCityId, attackerFactionId: battle.attackerFactionId, defenderFactionId: battle.defenderFactionId, attackerOfficerIds: [...battle.attackerOfficerIds], defenderOfficerIds: [...battle.defenderOfficerIds], provisionsCommitted: battle.provisionsCommitted, attackerFood: battle.attackerFood, defenderFood: battle.defenderFood, width: battle.width, height: battle.height, day: battle.day, maxDays: battle.maxDays, weather: battle.weather, phase: 'battle', activeSide: battle.activeSide, status: battle.status, outcome: battle.victoryReason ?? '', approach: battle.approach, battlefieldVersion: battle.battlefieldVersion, battlefieldKey: battle.battlefieldKey, battlefieldTemplate: battle.battlefieldTemplate, deployment, units, actedUnitIds: Object.values(units).filter((unit: JsonObject) => unit.acted).map((unit: JsonObject) => unit.id).sort(), commanderUnitIds: { ...battle.commanderUnitIds }, experienceGains: { ...battle.experienceGains }, logs: [...battle.logs], guard: { ...battle.guard, participants: battle.guard.participants.map((participant) => ({ ...participant, equipmentKey: participant.equipmentKey.split('\0').join('|'), equipmentKeyEncoding: 'pipe-v1' })) }, terrainContractVersion: 1, tiles };
}

function command(commandId: string, digest: string, unitId: string, targetUnitId: any): JsonObject { return { commandEnvelopeVersion: 1, commandId, expectedBattleStateSha256: digest, kind: 'attack_unit', parameters: { unitId, targetUnitId } }; }
function resultFor(before: JsonObject, after: JsonObject, preview: JsonObject, unitId: string, targetUnitId: string, commandValue: JsonObject): JsonObject { const beforeDigest = canonicalSha256(before); const afterDigest = canonicalSha256(after); const attacker = before.units[unitId]; const target = before.units[targetUnitId]; const base = Math.floor(Math.sqrt(Math.max(0, Math.floor(preview.damage)))) >> 2; const levelDifference = attacker.level - target.level; const adjusted = levelDifference < 0 ? base + Math.abs(levelDifference) : Math.max(0, base - levelDifference); const gained = preview.damage > 0 ? adjusted + 2 : 0; return { ok: true, error: '', stateChanged: true, beforeBattleStateSha256: beforeDigest, afterBattleStateSha256: afterDigest, receipt: { kind: 'attack_unit', details: { unitId, targetUnitId, preview, damage: preview.damage, targetTroopsAfter: preview.targetTroopsAfter, experienceGained: gained, seedBefore: before.rngSeed, seedAfter: after.rngSeed }, battleStateSha256: afterDigest }, commandId: commandValue.commandId, kind: 'attack_unit', battle: after }; }

function failureCase(id: string, snapshot: JsonObject, unitId: string, targetUnitId: any, commandId: string, error: string, digest = canonicalSha256(snapshot)): JsonObject { const value = command(commandId, digest, unitId, targetUnitId); return { id, snapshot, command: value, expected: { ok: false, error, stateChanged: false, beforeBattleStateSha256: canonicalSha256(snapshot), afterBattleStateSha256: canonicalSha256(snapshot), receipt: {}, commandId, kind: 'attack_unit', battle: snapshot } }; }

function createBoundaryCases(initial: JsonObject, expected: JsonObject, actorId: string, targetId: string, actionCommand: JsonObject): JsonObject[] {
  const wrongPhase = structuredClone(initial); wrongPhase.phase = 'deployment'; wrongPhase.units[actorId].slotX = 9; wrongPhase.units[actorId].slotY = 3; wrongPhase.units[targetId].slotX = 3; wrongPhase.units[targetId].slotY = 4; updateDeployment(wrongPhase, actorId); updateDeployment(wrongPhase, targetId);
  const ended = structuredClone(initial); ended.phase = 'ended'; ended.status = 'defender-won'; ended.outcome = 'day-limit';
  const defenderTurn = structuredClone(initial); defenderTurn.activeSide = 'defender';
  const acted = structuredClone(initial); acted.units[actorId].acted = true; acted.units[actorId].moved = true; acted.actedUnitIds = [actorId];
  const noTroops = structuredClone(initial); noTroops.units[actorId].troops = 0;
  const malformed = structuredClone(initial); malformed.units[actorId].originalTroops = {};
  const cases = [
    failureCase('wrong-phase', wrongPhase, actorId, targetId, 'ai-boundary-phase-0010', '战斗尚未开始'),
    failureCase('ended', ended, actorId, targetId, 'ai-boundary-ended-0011', '战斗已经结束'),
    failureCase('defender-turn', defenderTurn, actorId, targetId, 'ai-boundary-side-0012', '当前不是该单位所属阵营的行动阶段'),
    failureCase('acted-actor', acted, actorId, targetId, 'ai-boundary-acted-0013', '目标不在攻击范围内'),
    failureCase('no-troops', noTroops, actorId, targetId, 'ai-boundary-troops-0014', '单位不存在或已经退出战斗'),
    failureCase('unknown-target', initial, actorId, 'officer:unknown', 'ai-boundary-target-0015', '攻击目标无效'),
    failureCase('stale-digest', initial, actorId, targetId, 'ai-boundary-stale-0016', '战斗状态摘要已过期', '00000000'),
    failureCase('malformed-target-id', initial, actorId, 42 as any, 'ai-boundary-type-0017', '战斗命令缺少 targetUnitId'),
    { id: 'malformed-restore', snapshot: malformed, command: actionCommand, expectedRestore: false },
  ];
  const duplicate = { id: 'duplicate-command', snapshot: initial, command: actionCommand, expected: expected, duplicateExpected: { ...expected, stateChanged: false, duplicate: true, beforeBattleStateSha256: canonicalSha256(expected.battle), afterBattleStateSha256: canonicalSha256(expected.battle), battle: expected.battle } };
  const conflict = command(actionCommand.commandId, canonicalSha256(expected.battle), actorId, 'officer:unknown');
  cases.push(duplicate, { id: 'command-id-conflict', snapshot: initial, prelude: [actionCommand], command: conflict, expected: failureCase('x', expected.battle, actorId, 'officer:unknown', actionCommand.commandId, 'commandId 已经用于另一条战斗命令', canonicalSha256(expected.battle)).expected });
  return cases;
}

function updateDeployment(snapshot: JsonObject, unitId: string): void { const unit = snapshot.units[unitId]; for (const side of ['attacker', 'defender'] as const) { const entry = snapshot.deployment[side].find((candidate: JsonObject) => candidate.unitId === unitId); if (entry) { entry.slotX = unit.slotX; entry.slotY = unit.slotY; } } }

if (writeMode) { mkdirSync(resolve(root, 'godot/data/fixtures'), { recursive: true }); writeFileSync(fixturePath, `${JSON.stringify(buildAiFixture(), null, 2)}\n`); console.log('[Godot tactical AI] generated fixture'); } else { const fixture = buildAiFixture(); const disk = JSON.parse(readFileSync(fixturePath, 'utf8')); if (canonicalSha256(disk) !== canonicalSha256(fixture)) throw new Error('godot/data/fixtures/tactical-battle-ai-v1.json differs from TypeScript oracle'); console.log(`[Godot tactical AI] PASSED ${fixture.boundaryCases.length} boundary cases`); }
