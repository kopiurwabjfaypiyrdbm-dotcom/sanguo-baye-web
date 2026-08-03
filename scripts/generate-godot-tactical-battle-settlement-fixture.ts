import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createProductionSessionState } from '../src/core/migration/applicationSessionContract';
import { canonicalSha256 } from '../src/core/migration/canonicalJson';
import { applyBattleResult } from '../src/core/battle';
import { createTacticalBattle, createTacticalBattleResult, retreatTacticalSide } from '../src/core/tacticalBattle';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(root, 'godot/data/fixtures/tactical-battle-settlement-v1.json');
const writeMode = process.argv.includes('--write');
const state = createProductionSessionState(1, 1);
const order = { sourceCityId: 'city-12', targetCityId: 'city-11', officerIds: ['officer-1'], provisions: 20 };
const created = createTacticalBattle(state, order);
const terminal = structuredClone(created);
terminal.units['officer:officer-1'].troops = 75;
terminal.units['officer:officer-10'].troops = 60;
terminal.experienceGains = { 'officer-10': 150, 'officer-1': 50 };
terminal.experienceGainOrder = ['officer-10', 'officer-1'];
const ended = retreatTacticalSide(terminal, 'attacker');
const result = createTacticalBattleResult(ended);
// JSON is the language-neutral boundary; TypeScript's optional fields with
// `undefined` are omitted exactly as they are when the Web saves a snapshot.
const expectedState = JSON.parse(JSON.stringify(applyBattleResult(state, result)));

function projectResult(value: any) {
  return { ...value, experienceGainOrder: Object.keys(value.experienceGains ?? {}), guard: { ...value.guard, participants: value.guard.participants.map((participant: any) => ({ ...participant, equipmentKey: participant.equipmentKey.split('\0').join('|'), equipmentKeyEncoding: 'pipe-v1' })) } };
}

const attackerTerminal = structuredClone(created);
attackerTerminal.status = 'attacker-won';
attackerTerminal.reason = 'annihilation';
attackerTerminal.units['officer:officer-1'].troops = 80;
attackerTerminal.units['officer:officer-10'].troops = 70;
attackerTerminal.experienceGains = { 'officer-10': 150, 'officer-1': 50 };
attackerTerminal.experienceGainOrder = ['officer-10', 'officer-1'];
const attackerResult = createTacticalBattleResult(attackerTerminal);
const attackerExpectedState = JSON.parse(JSON.stringify(applyBattleResult(state, attackerResult)));

const fixture = {
  tacticalBattleSettlementFixtureVersion: 1,
  source: { initialStateSha256: canonicalSha256(state), applicationSource: 'src/core/battle.ts:applyBattleResult', tacticalSource: 'src/core/tacticalBattle.ts:retreatTacticalSide/createTacticalBattleResult' },
  initialState: state,
  order,
  result: projectResult(result),
  expectedState,
  initialStateSha256: canonicalSha256(state),
  expectedStateSha256: canonicalSha256(expectedState),
  attackerWin: {
    result: projectResult(attackerResult),
    expectedState: attackerExpectedState,
    expectedStateSha256: canonicalSha256(attackerExpectedState),
  },
};

if (writeMode) {
  mkdirSync(resolve(root, 'godot/data/fixtures'), { recursive: true });
  writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
} else {
  const disk = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (canonicalSha256(disk) !== canonicalSha256(fixture)) throw new Error('Godot tactical settlement fixture is stale; run with --write');
}
console.log(`[Godot tactical settlement fixture] ${writeMode ? 'wrote' : 'verified'} ${fixturePath}`);
