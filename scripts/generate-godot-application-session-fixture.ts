import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, canonicalSha256 } from '../src/core/migration/canonicalJson';
import {
  createProductionSessionState,
  OracleApplicationSession,
  type ApplicationCommandEnvelope,
} from '../src/core/migration/applicationSessionContract';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'godot/data/fixtures/application-session-suite-v1.json');
const writeMode = process.argv.includes('--write');
const fixture = buildFixture();

if (writeMode) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stdout.write(`[Godot application session] generated ${fixture.steps.length} transaction cases\n`);
} else {
  let current: unknown;
  try { current = JSON.parse(readFileSync(path, 'utf8')); } catch { current = null; }
  if (canonicalJson(current) !== canonicalJson(fixture)) {
    throw new Error('godot/data/fixtures/application-session-suite-v1.json differs from TypeScript oracle');
  }
  process.stdout.write(`[Godot application session] PASSED ${fixture.steps.length} transaction cases\n`);
}

export function buildFixture() {
  const initialState = createProductionSessionState(1, 1);
  const initialDigest = canonicalSha256(initialState);
  const session = new OracleApplicationSession(initialState);
  const success: ApplicationCommandEnvelope = {
    commandEnvelopeVersion: 1,
    commandId: 'mb04-develop-0001',
    expectedStateSha256: initialDigest,
    kind: 'develop_farming',
    parameters: { cityId: 'city-12', officerId: 'officer-1' },
  };
  const steps: { id: string; command: unknown; expected: unknown }[] = [];
  const apply = (id: string, command: unknown) => steps.push({ id, command, expected: session.execute(command) });
  const firstResult = session.execute(success);
  steps.push({ id: 'success', command: success, expected: firstResult });
  apply('exact-duplicate', success);
  apply('stale-before-digest', { ...success, commandId: 'mb04-stale-0002' });
  apply('domain-rejection', {
    ...success,
    commandId: 'mb04-domain-0003',
    expectedStateSha256: canonicalSha256(session.snapshot()),
  });
  apply('command-id-conflict', {
    ...success,
    expectedStateSha256: canonicalSha256(session.snapshot()),
    parameters: { cityId: 'city-12', officerId: 'officer-21' },
  });
  apply('unknown-command', {
    ...success,
    commandId: 'mb04-unknown-0004',
    expectedStateSha256: canonicalSha256(session.snapshot()),
    kind: 'unknown',
    parameters: {},
  });
  apply('unsupported-version', {
    ...success,
    commandEnvelopeVersion: 2,
    commandId: 'mb04-version-0005',
    expectedStateSha256: canonicalSha256(session.snapshot()),
  });
  apply('missing-parameter', {
    ...success,
    commandId: 'mb04-missing-0006',
    expectedStateSha256: canonicalSha256(session.snapshot()),
    parameters: { cityId: 'city-12' },
  });
  apply('sorted-unknown-field-error', {
    ...success,
    commandId: 'mb04-fields-0007',
    expectedStateSha256: canonicalSha256(session.snapshot()),
    ['\u{10000}']: true,
    ['\ue000']: true,
  });
  apply('wrong-parameter-type', {
    ...success,
    commandId: 'mb04-invalid-0008',
    expectedStateSha256: canonicalSha256(session.snapshot()),
    parameters: { cityId: 12, officerId: 'officer-1' },
  });
  apply('non-breaking-space-command-id', {
    ...success,
    commandId: '\u00a0',
    expectedStateSha256: canonicalSha256(session.snapshot()),
  });
  const restoredSession = new OracleApplicationSession(firstResult.state);
  const continuationCommand: ApplicationCommandEnvelope = {
    commandEnvelopeVersion: 1,
    commandId: 'mb04-restored-0009',
    expectedStateSha256: canonicalSha256(restoredSession.snapshot()),
    kind: 'develop_farming',
    parameters: { cityId: 'city-12', officerId: 'officer-32' },
  };
  const continuationExpected = restoredSession.execute(continuationCommand);
  apply('second-success', continuationCommand);
  apply('advanced-duplicate', success);
  return {
    applicationSessionFixtureVersion: 1,
    algorithms: {
      canonicalJson: 'canonical-json-v1',
      digest: 'sha256',
      numberDomain: 'safe-integer-or-decimal-6-v1',
    },
    campaign: { periodId: 1, rulerSourceIndex: 1, initialStateSha256: initialDigest },
    steps,
    finalStateSha256: canonicalSha256(session.snapshot()),
    restoredContinuation: {
      command: continuationCommand,
      expected: continuationExpected,
    },
  };
}
