import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createProductionSessionState,
  OracleApplicationSession,
  type ApplicationCommandEnvelope,
} from '../src/core/migration/applicationSessionContract';
import { applyBattleResult } from '../src/core/battle';
import { canonicalSha256, compareUnicodeScalar } from '../src/core/migration/canonicalJson';
import {
  createTacticalBattle,
  createTacticalBattleResult,
  type TacticalBattleState,
  type TacticalSide,
  retreatTacticalSide,
} from '../src/core/tacticalBattle';
import { createSaveEnvelope, parseSave, serializeSave } from '../src/core/saveGame';
import { MODERN_TERRAIN_MOVE_COSTS } from '../src/compat/baye/tacticalState';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'godot/data/fixtures/godot-full-loop-v1.json');
const writeMode = process.argv.includes('--write');

function digest(label: string, value: unknown): string {
  try { return canonicalSha256(value); }
  catch (error) { throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
}

const initialState = createProductionSessionState(1, 1);
const initialStateSha256 = digest('initial state', initialState);
const command: ApplicationCommandEnvelope = {
  commandEnvelopeVersion: 1,
  commandId: 'mb24-full-loop-develop-0001',
  expectedStateSha256: initialStateSha256,
  kind: 'develop_farming',
  parameters: { cityId: 'city-12', officerId: 'officer-1' },
};
const oracle = new OracleApplicationSession(initialState);
const commandResult = oracle.execute(command);
if (!commandResult.ok || !commandResult.state) throw new Error(`full-loop strategic command failed: ${commandResult.error}`);
const afterDevelop = commandResult.state;
const afterDevelopSha256 = digest('after develop', afterDevelop);

function jsonClean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// officer-1 has just spent the month on the farming command; use a second
// stationed officer so the continuous loop exercises the real acted-officer
// invariant instead of silently resetting it.
const order = { sourceCityId: 'city-12', targetCityId: 'city-11', officerIds: ['officer-32'], provisions: 20 };
const battleInitial = jsonClean(createTacticalBattle(afterDevelop, order));
const battleForOutcome = jsonClean({
  ...battleInitial,
  logs: [...battleInitial.logs, '双方部署确认，战斗回合开始。'],
});
const battleTerminal = jsonClean(retreatTacticalSide(battleForOutcome, 'attacker'));
const rawBattleResult = jsonClean(createTacticalBattleResult(battleTerminal));
const battleResult = jsonClean(projectResult(rawBattleResult));
const finalState = jsonClean(applyBattleResult(afterDevelop, rawBattleResult));
const projectedBattleInitial = projectBattle(battleInitial, afterDevelop);
const projectedBattleTerminal = projectBattle(battleTerminal, afterDevelop);
// createTacticalBattle starts at deployment; the Godot runner confirms that
// native creation boundary before entering battle commands.
projectedBattleInitial.phase = 'deployment';
projectedBattleInitial.activeSide = 'attacker';
const saveEnvelope = createSaveEnvelope(finalState, 'MB24 full-loop', '2026-08-04T00:00:00.000Z');
const saveRoundtrip = parseSave(serializeSave(finalState, 'MB24 full-loop', '2026-08-04T00:00:00.000Z')).state;
if (digest('save roundtrip', saveRoundtrip) !== digest('final state', finalState)) throw new Error('full-loop save roundtrip changed state');

const fixture = jsonClean({
  fullLoopFixtureVersion: 1,
  id: 'godot-full-loop-v1',
  source: {
    strategic: 'src/core/migration/applicationSessionContract.ts:OracleApplicationSession',
    tactical: 'src/core/tacticalBattle.ts:createTacticalBattle/retreatTacticalSide/createTacticalBattleResult',
    settlement: 'src/core/battle.ts:applyBattleResult',
    save: 'src/core/saveGame.ts:serializeSave/parseSave',
    godotStrategic: 'godot/src/application/game_session/game_session.gd:GameSession',
    godotTactical: 'godot/src/application/tactical_battle/tactical_battle_session.gd:TacticalBattleSession',
  },
  selection: { periodId: 1, rulerSourceIndex: 1 },
  strategic: {
    initialStateSha256,
    command,
    expectedCommand: {
      ok: true,
      stateChanged: true,
      beforeStateSha256: initialStateSha256,
      afterStateSha256: afterDevelopSha256,
      receipt: commandResult.receipt,
    },
    afterDevelopSha256,
  },
  tactical: {
    order,
    initialBattle: projectedBattleInitial,
    initialBattleSha256: digest('initial battle', projectedBattleInitial),
    terminalBattle: projectedBattleTerminal,
    terminalBattleSha256: digest('terminal battle', projectedBattleTerminal),
    result: battleResult,
    resultSha256: digest('battle result', battleResult),
  },
  settlement: {
    afterDevelopSha256,
    expectedStateSha256: digest('settlement final state', finalState),
    expectedState: finalState,
  },
  persistence: {
    envelope: saveEnvelope,
    finalStateSha256: digest('persistence final state', finalState),
  },
});

if (writeMode) {
  mkdirSync(resolve(root, 'godot/data/fixtures'), { recursive: true });
  writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
} else {
  const disk = JSON.parse(readFileSync(output, 'utf8')) as unknown;
  if (canonicalSha256(disk) !== canonicalSha256(fixture)) throw new Error('Godot full-loop fixture is stale; run with --write');
}
process.stdout.write(`[Godot full-loop] ${writeMode ? 'wrote' : 'verified'} ${output}\n`);

function projectResult(value: Record<string, any>): Record<string, any> {
  return {
    ...value,
    experienceGainOrder: Object.keys(value.experienceGains ?? {}).sort(compareUnicodeScalar),
    guard: {
      ...value.guard,
      participants: value.guard.participants.map((participant: Record<string, any>) => ({
        ...participant,
        equipmentKey: String(participant.equipmentKey ?? '').split('\0').join('|'),
        equipmentKeyEncoding: 'pipe-v1',
      })),
    },
  };
}

function projectBattle(battle: TacticalBattleState, state: any): Record<string, any> {
  const officers = state.officers as Record<string, any>;
  const units: Record<string, any> = {};
  const battleUnits = Object.values(battle.units).sort((left, right) => compareUnicodeScalar(left.id, right.id));
  for (const unit of battleUnits) {
    const officer = unit.officerId ? officers[unit.officerId] : undefined;
    units[unit.id] = {
      id: unit.id, name: unit.name, officerId: unit.officerId ?? '', factionId: unit.factionId, side: unit.side,
      force: unit.force, intelligence: unit.intelligence, leadership: officer?.leadership ?? 0,
      level: unit.level, armsType: unit.armsType, mobility: unit.mobility, skillPoints: unit.skillPoints, maxSkillPoints: unit.maxSkillPoints,
      originalTroops: unit.originalTroops, troops: unit.troops, status: unit.status, statusTurns: unit.statusTurns,
      moved: unit.moved, acted: unit.acted, deployed: true, slotX: unit.x, slotY: unit.y,
    };
  }
  const deployment: Record<TacticalSide, Record<string, any>[]> = { attacker: [], defender: [] };
  for (const unit of Object.values(units)) deployment[unit.side].push({ unitId: unit.id, slotX: unit.slotX, slotY: unit.slotY });
  deployment.attacker.sort((left, right) => compareUnicodeScalar(left.unitId, right.unitId));
  deployment.defender.sort((left, right) => compareUnicodeScalar(left.unitId, right.unitId));
  const guard = {
    ...battle.guard,
    participants: battle.guard.participants.map((participant) => ({
      ...participant,
      equipmentKey: participant.equipmentKey.split('\0').join('|'),
      equipmentKeyEncoding: 'pipe-v1',
    })),
  };
  return jsonClean({
    contractVersion: 1, id: battle.id, strategicTurn: battle.strategicTurn, seedBefore: battle.seedBefore, rngSeed: battle.rngSeed,
    sourceCityId: battle.sourceCityId, targetCityId: battle.targetCityId, attackerFactionId: battle.attackerFactionId, defenderFactionId: battle.defenderFactionId,
    attackerOfficerIds: [...battle.attackerOfficerIds], defenderOfficerIds: [...battle.defenderOfficerIds], provisionsCommitted: battle.provisionsCommitted,
    attackerFood: battle.attackerFood, defenderFood: battle.defenderFood, width: battle.width, height: battle.height, day: battle.day, maxDays: battle.maxDays,
    weather: battle.weather, phase: 'battle', activeSide: battle.activeSide, status: battle.status,
    outcome: battle.status === 'ongoing' ? '' : (battle.victoryReason ?? 'annihilation'), approach: battle.approach,
    battlefieldVersion: battle.battlefieldVersion, battlefieldKey: battle.battlefieldKey, battlefieldTemplate: battle.battlefieldTemplate,
    deployment, units, actedUnitIds: [], logs: [...battle.logs], commanderUnitIds: { attacker: battle.commanderUnitIds.attacker ?? '', defender: battle.commanderUnitIds.defender ?? '' },
    experienceGains: { ...battle.experienceGains }, experienceGainOrder: [...((battle as any).experienceGainOrder ?? [])], guard,
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
  });
}
