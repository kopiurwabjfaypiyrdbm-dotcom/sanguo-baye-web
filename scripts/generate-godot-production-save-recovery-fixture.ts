import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { buildProductionEnvelope } from '../src/core/migration/productionDataContract';
import { createProductionSessionState } from '../src/core/migration/applicationSessionContract';
import { createSaveEnvelope } from '../src/core/saveGame';
import { canonicalSha256 } from '../src/core/migration/canonicalJson';
import { createBattleId, createBattleStrategicFingerprint, validateAttackOrder, type AttackOrder } from '../src/core/battle';
import type { GameState } from '../src/core/types';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'godot/data/fixtures/godot-production-save-recovery-v1.json');
const writeMode = process.argv.includes('--write');
const settlementFixture = JSON.parse(readFileSync(resolve(root, 'godot/data/fixtures/tactical-battle-settlement-v1.json'), 'utf8')) as {
  initialState: GameState;
  order: AttackOrder;
  result: Record<string, unknown>;
  expectedState: GameState;
};

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

const period = buildProductionEnvelope(1);
const state = createProductionSessionState(1, 1);
const ruler = state.officers[state.factions[state.playerFactionId].rulerOfficerId];
const campaign = {
  productionDataContractVersion: 2,
  periodId: 1,
  title: period.scenario.title,
  rulerSourceIndex: ruler.sourceId!,
  playerFactionId: state.playerFactionId,
  rulerOfficerId: ruler.id,
  rulerName: ruler.name,
};

function saveEnvelope(input: GameState, label = 'MB20 生产存档', savedAt = '2026-08-03T00:00:00.000Z', saveRevision = 0) {
  return {
    format: 'sanguo-baye-godot-production',
    version: 1,
    dataContractVersion: 2,
    rulesetId: input.rulesetId,
    saveRevision,
    savedAt,
    label,
    campaign: clone(campaign),
    stateSha256: canonicalSha256(input),
    state: clone(input),
  };
}

function webSaveEnvelope(input: GameState) {
  return createSaveEnvelope(input, 'Web v1 生产存档', '2026-08-03T00:00:00.000Z');
}

function findOrder(input: GameState, mode: 'player' | 'ai'): { state: GameState; order: AttackOrder } {
  const candidateStates = mode === 'player'
    ? [input]
    : input.factionOrder.filter((id) => id !== input.playerFactionId).map((factionId) => ({
      ...clone(input), phase: 'ai' as const, activeFactionId: factionId, campaignStarted: true,
    }));
  for (const candidate of candidateStates) for (const sourceId of candidate.cityOrder) {
    const source = candidate.cities[sourceId];
    if (source.ownerId !== (mode === 'player' ? candidate.playerFactionId : candidate.activeFactionId)) continue;
    const targetId = source.neighbors.find((neighborId) => candidate.cities[neighborId].ownerId !== source.ownerId
      && (mode === 'player' || candidate.cities[neighborId].ownerId === candidate.playerFactionId));
    if (!targetId) continue;
    const officerId = candidate.officerOrder.find((id) => {
      const officer = candidate.officers[id];
      return officer.status === 'serving' && officer.factionId === source.ownerId && officer.cityId === source.id && officer.troops > 0;
    });
    if (!officerId) continue;
    const order: AttackOrder = { sourceCityId: source.id, targetCityId: targetId, officerIds: [officerId], provisions: 20 };
    validateAttackOrder(candidate, order);
    return { state: candidate, order };
  }
  throw new Error(`No ${mode} recovery order found in period 1 production state`);
}

const player = findOrder(state, 'player');
const ai = findOrder(state, 'ai');
const playerBattleId = createBattleId(player.state, player.order);
const aiBattleId = createBattleId(ai.state, ai.order);

function pending(input: { state: GameState; order: AttackOrder }, resume: Record<string, unknown>, label: string) {
  return {
    format: 'sanguo-baye-godot:battle-recovery',
    version: 2,
    status: 'pending',
    mode: resume.kind === 'player-phase' ? 'player-attack' : 'ai-defense',
    battleId: createBattleId(input.state, input.order),
    strategicFingerprint: createBattleStrategicFingerprint(input.state),
    strategicSave: saveEnvelope(input.state, label),
    parentSaveRevision: 0,
    order: clone(input.order),
    resume: clone(resume),
  };
}

const pendingPlayer = pending(player, { kind: 'player-phase' }, 'MB20 玩家进攻检查点');
const pendingAi = pending(ai, { kind: 'ai-phase', nextFactionIndex: ai.state.factionOrder.indexOf(ai.state.activeFactionId) + 1 }, 'MB20 AI 守城检查点');
const committed = {
  format: 'sanguo-baye-godot:battle-recovery',
  version: 2,
  status: 'committed',
  mode: 'player-attack',
  battleId: settlementFixture.result.battleId,
  strategicFingerprint: createBattleStrategicFingerprint(settlementFixture.initialState),
  strategicSave: saveEnvelope(settlementFixture.expectedState, 'MB20 战后已提交'),
  sourceStrategicSave: saveEnvelope(settlementFixture.initialState, 'MB20 战前绑定'),
  settlementResult: clone(settlementFixture.result),
  parentSaveRevision: 0,
  order: clone(settlementFixture.order),
  resume: { kind: 'player-phase' },
};

const fixture = {
  fixtureVersion: 1,
  source: {
    stateFactory: 'src/core/migration/applicationSessionContract.ts:createProductionSessionState',
    saveContract: 'godot/src/application/persistence/json_save_repository.gd',
    recoveryContract: 'src/core/battleRecovery.ts + godot/src/application/persistence/battle_recovery_repository.gd',
  },
  campaign,
  initialState: clone(state),
  initialStateSha256: canonicalSha256(state),
  productionSave: saveEnvelope(state),
  webSaveV1: webSaveEnvelope(state),
  legacyProductionSave: {
    format: 'sanguo-baye-godot-production',
    version: 0,
    savedAt: '2026-08-03T00:00:00.000Z',
    label: 'MB20 旧版生产存档',
    state: clone(state),
  },
  pendingPlayer,
  pendingAi,
  committed,
  identifiers: { playerBattleId, aiBattleId, playerFingerprint: createBattleStrategicFingerprint(state), aiFingerprint: createBattleStrategicFingerprint(ai.state) },
  malformed: {
    badJson: '{bad json',
    unknownSaveField: { ...saveEnvelope(state), unknown: true },
    badSaveDigest: { ...saveEnvelope(state), stateSha256: '0'.repeat(64) },
    badSaveState: { ...saveEnvelope(state), state: { ...clone(state), rngSeed: state.rngSeed + 1 } },
    recoveryUnknownField: { ...pendingPlayer, unknown: true },
    recoveryWrongFingerprint: { ...pendingPlayer, strategicFingerprint: '0'.repeat(8) },
    recoveryWrongMode: { ...pendingPlayer, mode: 'ai-defense' },
    recoveryWrongResume: { ...pendingPlayer, resume: { kind: 'ai-phase', nextFactionIndex: 0 } },
  },
};

if (writeMode) {
  mkdirSync(resolve(root, 'godot/data/fixtures'), { recursive: true });
  writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`);
} else {
  const disk = JSON.parse(await (await import('node:fs/promises')).readFile(output, 'utf8'));
  if (canonicalSha256(disk) !== canonicalSha256(fixture)) throw new Error('Godot production save/recovery fixture is stale; run with --write');
}
console.log(`[Godot production save/recovery] ${writeMode ? 'wrote' : 'verified'} ${output}`);
