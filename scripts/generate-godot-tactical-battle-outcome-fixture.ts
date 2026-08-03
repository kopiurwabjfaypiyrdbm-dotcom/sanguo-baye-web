import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createProductionSessionState } from '../src/core/migration/applicationSessionContract';
import { canonicalSha256 } from '../src/core/migration/canonicalJson';
import { createTacticalBattle, createTacticalBattleResult, retreatTacticalSide } from '../src/core/tacticalBattle';
import { MODERN_TERRAIN_MOVE_COSTS } from '../src/compat/baye/tacticalState';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(root, 'godot/data/fixtures/tactical-battle-outcome-v1.json');
const writeMode = process.argv.includes('--write');

const state = createProductionSessionState(1, 1);
const order = { sourceCityId: 'city-12', targetCityId: 'city-11', officerIds: ['officer-1'], provisions: 20 };
const created = createTacticalBattle(state, order);

function withTerminal(status: 'attacker-won' | 'defender-won', outcome: string, message: string) {
  const next = structuredClone(created);
  next.status = status;
  next.victoryReason = outcome as any;
  next.logs = [...next.logs, message];
  return next;
}

function projectBattle(battle: any) {
  const units: Record<string, any> = {};
  for (const unit of Object.values(battle.units).sort((left: any, right: any) => left.id.localeCompare(right.id))) {
    units[unit.id] = { id: unit.id, name: unit.name, officerId: unit.officerId ?? '', factionId: unit.factionId, side: unit.side, force: unit.force, intelligence: unit.intelligence, level: unit.level, armsType: unit.armsType, mobility: unit.mobility, skillPoints: unit.skillPoints, maxSkillPoints: unit.maxSkillPoints, originalTroops: unit.originalTroops, troops: unit.troops, status: unit.status, statusTurns: unit.statusTurns, moved: unit.moved, acted: unit.acted, deployed: true, slotX: unit.x, slotY: unit.y, ...(unit.normalAttackPatternOverride ? { normalAttackPatternOverride: unit.normalAttackPatternOverride } : {}) };
  }
  const deployment = { attacker: [] as any[], defender: [] as any[] };
  for (const unit of Object.values(units)) deployment[unit.side].push({ unitId: unit.id, slotX: unit.slotX, slotY: unit.slotY });
  deployment.attacker.sort((a, b) => a.unitId.localeCompare(b.unitId)); deployment.defender.sort((a, b) => a.unitId.localeCompare(b.unitId));
  const tiles = battle.tiles.map((tile: any) => { const costs = [...MODERN_TERRAIN_MOVE_COSTS].map((row) => row[tile.terrain] ?? Number.POSITIVE_INFINITY); return { x: tile.x, y: tile.y, terrainId: tile.terrain, terrainName: ['plain', 'road', 'hill', 'forest', 'village', 'city', 'marsh', 'river'][tile.terrain], movementCosts: costs.map((cost) => Number.isFinite(cost) ? cost : null), passableArms: costs.map((cost) => Number.isFinite(cost)), ...(tile.objective ? { objective: tile.objective } : {}) }; });
  return { contractVersion: 1, id: battle.id, strategicTurn: battle.strategicTurn, seedBefore: battle.seedBefore, rngSeed: battle.rngSeed, sourceCityId: battle.sourceCityId, targetCityId: battle.targetCityId, attackerFactionId: battle.attackerFactionId, defenderFactionId: battle.defenderFactionId, attackerOfficerIds: [...battle.attackerOfficerIds], defenderOfficerIds: [...battle.defenderOfficerIds], provisionsCommitted: battle.provisionsCommitted, attackerFood: battle.attackerFood, defenderFood: battle.defenderFood, width: battle.width, height: battle.height, day: battle.day, maxDays: battle.maxDays, weather: battle.weather, phase: 'battle', activeSide: battle.activeSide, status: battle.status, outcome: battle.victoryReason ?? '', approach: battle.approach, battlefieldVersion: battle.battlefieldVersion, battlefieldKey: battle.battlefieldKey, battlefieldTemplate: battle.battlefieldTemplate, deployment, units, actedUnitIds: Object.values(units).filter((unit: any) => unit.acted).map((unit: any) => unit.id).sort(), commanderUnitIds: { ...battle.commanderUnitIds }, experienceGains: { ...battle.experienceGains }, experienceGainOrder: [...((battle as any).experienceGainOrder ?? [])], logs: [...battle.logs], guard: { ...battle.guard, participants: battle.guard.participants.map((participant: any) => ({ ...participant, equipmentKey: participant.equipmentKey.split('\0').join('|'), equipmentKeyEncoding: 'pipe-v1' })) }, terrainContractVersion: 1, tiles };
}

function projectResult(result: any) {
  return { ...result, attackerOfficerIds: [...result.attackerOfficerIds], defenderOfficerIds: [...result.defenderOfficerIds], guard: { ...result.guard, participants: result.guard.participants.map((participant: any) => ({ ...participant, equipmentKey: participant.equipmentKey.split('\0').join('|'), equipmentKeyEncoding: 'pipe-v1' })) } };
}

const attackerWin = withTerminal('attacker-won', 'annihilation', '守军全部溃退，攻方获胜。');
for (const unit of Object.values(attackerWin.units)) if (unit.side === 'defender') unit.troops = 0;
const defenderWin = withTerminal('defender-won', 'day-limit', '攻方未能在期限内破城，守方获胜。');
const attackerRetreat = retreatTacticalSide(created, 'attacker');
const defenderBase = structuredClone(created); defenderBase.activeSide = 'defender';
const defenderRetreat = retreatTacticalSide(defenderBase, 'defender');

const cases = [
  { id: 'attacker-win-annihilation', initialBattle: projectBattle(attackerWin), expectedBattle: projectBattle(attackerWin), expectedResult: projectResult(createTacticalBattleResult(attackerWin)) },
  { id: 'defender-win-day-limit', initialBattle: projectBattle(defenderWin), expectedBattle: projectBattle(defenderWin), expectedResult: projectResult(createTacticalBattleResult(defenderWin)) },
  { id: 'attacker-retreat', initialBattle: projectBattle(created), expectedBattle: projectBattle(attackerRetreat), expectedResult: projectResult(createTacticalBattleResult(attackerRetreat)) },
  { id: 'defender-retreat', initialBattle: projectBattle(defenderBase), expectedBattle: projectBattle(defenderRetreat), expectedResult: projectResult(createTacticalBattleResult(defenderRetreat)) },
];

const fixture = {
  tacticalBattleOutcomeFixtureVersion: 1,
  source: { initialStateSha256: canonicalSha256(state), battlefieldSource: 'src/core/tacticalBattle.ts:createTacticalBattleResult/retreatTacticalSide' },
  order,
  cases,
  savedContinuation: {
    caseId: 'defender-retreat',
    snapshot: projectBattle(defenderRetreat),
    snapshotSha256: canonicalSha256(projectBattle(defenderRetreat)),
    result: projectResult(createTacticalBattleResult(defenderRetreat)),
  },
};

if (writeMode) {
  mkdirSync(dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
} else {
  const current = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (JSON.stringify(current) !== JSON.stringify(fixture)) throw new Error('Godot tactical outcome fixture is stale; run with --write');
}

console.log(`[Godot tactical outcome fixture] ${writeMode ? 'wrote' : 'verified'} ${fixturePath}`);
