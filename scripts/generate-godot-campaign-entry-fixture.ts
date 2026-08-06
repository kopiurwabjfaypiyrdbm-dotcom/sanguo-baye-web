import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createProductionSessionState,
  OracleApplicationSession,
  type ApplicationCommandEnvelope,
} from '../src/core/migration/applicationSessionContract';
import { buildProductionEnvelope } from '../src/core/migration/productionDataContract';
import { canonicalJson, canonicalSha256 } from '../src/core/migration/canonicalJson';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'godot/data/fixtures/godot-campaign-entry-v1.json');
const writeMode = process.argv.includes('--write');

const periodId = 1 as const;
const rulerSourceIndex = 1;
const envelope = buildProductionEnvelope(periodId);
const initialState = createProductionSessionState(periodId, rulerSourceIndex);
const initialStateSha256 = canonicalSha256(initialState);
const candidate = envelope.scenario.playerCandidates.find((entry) => entry.sourceIndex === rulerSourceIndex);
if (!candidate) throw new Error('campaign-entry fixture candidate is missing');

const command: ApplicationCommandEnvelope = {
  commandEnvelopeVersion: 1,
  commandId: 'mb21-entry-develop-0001',
  expectedStateSha256: initialStateSha256,
  kind: 'develop_farming',
  parameters: { cityId: 'city-12', officerId: 'officer-1' },
};
const session = new OracleApplicationSession(initialState);
const result = session.execute(command);
if (!result.ok) throw new Error(`campaign-entry command oracle rejected: ${result.error}`);
const { state: _state, ...resultCore } = result;
const afterState = result.state;

function reciprocalRoadCount() {
  const pairs = new Set<string>();
  for (const cityId of initialState.cityOrder) {
    for (const neighborId of [...initialState.cities[cityId].neighbors].sort()) {
      if (!initialState.cities[neighborId]?.neighbors.includes(cityId)) continue;
      pairs.add([cityId, neighborId].sort().join('\u001f'));
    }
  }
  return pairs.size;
}

const fixture = {
  fixtureVersion: 1,
  source: {
    sessionFactory: 'src/core/migration/applicationSessionContract.ts:createProductionSessionState',
    commandOracle: 'src/core/migration/applicationSessionContract.ts:OracleApplicationSession',
    godotSession: 'godot/src/application/game_session/game_session.gd:GameSession',
  },
  selection: {
    periodId,
    rulerSourceIndex,
    title: envelope.scenario.title,
    rulerName: candidate.name,
    playerFactionId: candidate.factionId,
    rulerOfficerId: candidate.rulerOfficerId,
  },
  campaign: {
    productionDataContractVersion: 2,
    periodId,
    title: envelope.scenario.title,
    rulerSourceIndex,
    playerFactionId: candidate.factionId,
    rulerOfficerId: candidate.rulerOfficerId,
    rulerName: candidate.name,
  },
  before: {
    stateSha256: initialStateSha256,
    rngSeed: initialState.rngSeed,
    cityCount: initialState.cityOrder.length,
    roadCount: reciprocalRoadCount(),
  },
  command,
  expectedResult: resultCore,
  after: {
    stateSha256: canonicalSha256(afterState),
    rngSeed: afterState.rngSeed,
    cityId: 'city-12',
    farming: afterState.cities['city-12'].farming,
    money: afterState.cities['city-12'].money,
    officerStamina: afterState.officers['officer-1'].stamina,
  },
};

if (fixture.before.cityCount !== 38 || fixture.before.roadCount !== 54) {
  throw new Error(`campaign-entry graph facts must remain 38/54, got ${fixture.before.cityCount}/${fixture.before.roadCount}`);
}

if (writeMode) {
  mkdirSync(resolve(root, 'godot/data/fixtures'), { recursive: true });
  writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
} else {
  const disk = JSON.parse(readFileSync(output, 'utf8')) as unknown;
  if (canonicalJson(disk) !== canonicalJson(fixture)) throw new Error('Godot campaign-entry fixture is stale; run with --write');
}
process.stdout.write(`[Godot campaign entry] ${writeMode ? 'wrote' : 'verified'} ${output}\n`);
