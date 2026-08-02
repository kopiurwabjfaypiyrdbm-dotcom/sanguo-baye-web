import { developFarming, getDevelopFarmingAvailability } from '../cityCommands';
import type { GameState } from '../types';
import {
  CANONICAL_DIGEST_ALGORITHM,
  CANONICAL_JSON_ALGORITHM,
  CANONICAL_NUMBER_DOMAIN,
  canonicalJson,
  canonicalSha256,
} from './canonicalJson';

export type ReplayCommand = {
  kind: 'developFarming';
  cityId: string;
  officerId: string;
};

export type ReplayStep = {
  command: ReplayCommand;
  beforeStateSha256: string;
  afterStateSha256: string;
  stateChanged: boolean;
  expected: ReplayResult;
};

export type ReplayResult =
  | { ok: true; receipt: Record<string, unknown> }
  | { ok: false; error: string; receipt: Record<string, never> };

export type MigrationReplaySuite = ReturnType<typeof buildMigrationReplaySuite>;

export function buildMigrationReplaySuite(initialState: GameState) {
  const normalizedInitialState = jsonClone(initialState);
  const firstCommand: ReplayCommand = {
    kind: 'developFarming', cityId: 'city-12', officerId: 'officer-1',
  };
  const afterFirst = runReplay(normalizedInitialState, [firstCommand]).finalState;
  const secondCommand = findNextDevelopFarmingCommand(afterFirst);
  const single = buildReplay('develop-farming-single-v1', normalizedInitialState, [
    firstCommand,
  ]);
  const sequence = buildReplay('develop-farming-sequence-v1', normalizedInitialState, [
    firstCommand,
    secondCommand,
    { kind: 'developFarming', cityId: 'unknown-city', officerId: 'officer-1' },
  ]);
  const canonicalVectors = [
    vector('null-bool-numbers', { z: null, t: true, f: false, negative: -7, ratio: 1.04, zero: -0 }),
    vector('unicode-and-escapes', { text: '三国\n霸业\t"\\' }),
    vector('arrays-retain-order', ['city-12', 'city-3', 48641]),
    vector('object-keys-sort-a', { beta: 2, alpha: { y: 2, x: 1 } }),
    vector('object-keys-sort-b', { alpha: { x: 1, y: 2 }, beta: 2 }),
    vector('unicode-scalar-key-order', { '😀': 1, '\ue000': 2, '三': 3 }),
    vector('integer-boundaries', {
      int32Min: -2_147_483_648,
      uint32Max: 4_294_967_295,
      uint32Overflow: 4_294_967_296,
      maxSafeInteger: Number.MAX_SAFE_INTEGER,
    }),
  ];

  return {
    fixtureSuiteVersion: 1,
    id: 'godot-migration-replay-suite-v1',
    usage: {
      scope: 'internal-migration-verification',
      redistributionReview: 'pending',
    },
    algorithms: {
      canonical: CANONICAL_JSON_ALGORITHM,
      digest: CANONICAL_DIGEST_ALGORITHM,
      numberDomain: CANONICAL_NUMBER_DOMAIN,
    },
    initialState: { path: 'godot/data/period-1.json' },
    provenance: {
      oracle: { path: 'src/core/cityCommands.ts', symbol: 'developFarming' },
      generator: { path: 'src/core/migration/replayFixture.ts', symbol: 'buildMigrationReplaySuite' },
    },
    canonicalVectors,
    replays: [single, sequence],
  };
}

export function runReplay(initialState: GameState, commands: ReplayCommand[]): {
  steps: ReplayStep[];
  finalState: GameState;
  finalStateSha256: string;
} {
  let state = jsonClone(initialState);
  const steps: ReplayStep[] = [];
  for (const command of commands) {
    const beforeStateSha256 = canonicalSha256(state);
    const execution = executeReplayCommand(state, command);
    const afterStateSha256 = canonicalSha256(execution.nextState);
    steps.push({
      command: structuredClone(command),
      beforeStateSha256,
      afterStateSha256,
      stateChanged: beforeStateSha256 !== afterStateSha256,
      expected: execution.result,
    });
    state = execution.nextState;
  }
  return { steps, finalState: state, finalStateSha256: canonicalSha256(state) };
}

export function validateReplaySuite(suite: unknown, initialState: GameState): string[] {
  const failures: string[] = [];
  const normalizedInitialState = jsonClone(initialState);
  if (!isRecord(suite)) return ['suite: expected object'];
  if (suite.fixtureSuiteVersion !== 1) return [`fixtureSuiteVersion: expected 1, received ${String(suite.fixtureSuiteVersion)}`];
  if (suite.id !== 'godot-migration-replay-suite-v1') return [`id: unsupported ${String(suite.id)}`];
  if (!isRecord(suite.algorithms)) return ['algorithms: expected object'];
  compare('algorithms.canonical', suite.algorithms.canonical, CANONICAL_JSON_ALGORITHM, failures);
  compare('algorithms.digest', suite.algorithms.digest, CANONICAL_DIGEST_ALGORITHM, failures);
  compare('algorithms.numberDomain', suite.algorithms.numberDomain, CANONICAL_NUMBER_DOMAIN, failures);
  if (failures.length > 0) return failures;
  if (!isRecord(suite.initialState) || suite.initialState.path !== 'godot/data/period-1.json') {
    return ['initialState.path: v1 only allows godot/data/period-1.json'];
  }
  if (!Array.isArray(suite.canonicalVectors)) failures.push('canonicalVectors: expected array');
  if (!Array.isArray(suite.replays)) failures.push('replays: expected array');
  if (failures.length > 0) return failures;
  const canonicalVectors = suite.canonicalVectors as unknown[];
  const replays = suite.replays as unknown[];

  for (const [index, vector] of canonicalVectors.entries()) {
    if (!isRecord(vector) || typeof vector.id !== 'string' || !('value' in vector)
      || typeof vector.canonical !== 'string' || typeof vector.sha256 !== 'string') {
      failures.push(`canonicalVectors[${index}]: missing or invalid required field`);
      continue;
    }
    try {
      compare(`${vector.id}.canonical`, canonicalJson(vector.value), vector.canonical, failures);
      compare(`${vector.id}.sha256`, canonicalSha256(vector.value), vector.sha256, failures);
    } catch (error) {
      failures.push(`${vector.id}.canonical: ${errorMessage(error)}`);
    }
  }
  for (const [replayIndex, replay] of replays.entries()) {
    if (!isRecord(replay) || typeof replay.id !== 'string' || !Array.isArray(replay.steps)
      || typeof replay.initialStateSha256 !== 'string' || typeof replay.finalStateSha256 !== 'string') {
      failures.push(`replays[${replayIndex}]: missing or invalid required field`);
      continue;
    }
    const replaySteps: ReplayStep[] = [];
    for (const [stepIndex, step] of replay.steps.entries()) {
      const prefix = `${replay.id}.step[${stepIndex}]`;
      if (!isRecord(step) || !isRecord(step.command) || !isRecord(step.expected)
        || typeof step.beforeStateSha256 !== 'string' || typeof step.afterStateSha256 !== 'string'
        || typeof step.stateChanged !== 'boolean') {
        failures.push(`${prefix}: missing or invalid required field`);
        continue;
      }
      if (step.command.kind !== 'developFarming' || typeof step.command.cityId !== 'string'
        || typeof step.command.officerId !== 'string' || step.command.cityId.length === 0
        || step.command.officerId.length === 0) {
        failures.push(`${prefix}.command: unsupported or incomplete adapter payload`);
        continue;
      }
      replaySteps.push(step as ReplayStep);
    }
    if (replaySteps.length !== replay.steps.length) continue;
    let actual: ReturnType<typeof runReplay>;
    try {
      compare(`${replay.id}.initialStateSha256`, canonicalSha256(normalizedInitialState), replay.initialStateSha256, failures);
      actual = runReplay(normalizedInitialState, replaySteps.map((step) => step.command));
    } catch (error) {
      failures.push(`${replay.id}.execution: ${errorMessage(error)}`);
      continue;
    }
    compare(`${replay.id}.finalStateSha256`, actual.finalStateSha256, replay.finalStateSha256, failures);
    replaySteps.forEach((expected, index) => {
      const actualStep = actual.steps[index];
      compare(`${replay.id}.step[${index}].beforeStateSha256`, actualStep.beforeStateSha256, expected.beforeStateSha256, failures);
      compare(`${replay.id}.step[${index}].afterStateSha256`, actualStep.afterStateSha256, expected.afterStateSha256, failures);
      compare(`${replay.id}.step[${index}].stateChanged`, actualStep.stateChanged, expected.stateChanged, failures);
      try {
        compare(
          `${replay.id}.step[${index}].expected`,
          canonicalJson(actualStep.expected),
          canonicalJson(expected.expected),
          failures,
        );
      } catch (error) {
        failures.push(`${replay.id}.step[${index}].expected.canonical: ${errorMessage(error)}`);
      }
    });
  }
  return failures;
}

function buildReplay(id: string, initialState: GameState, commands: ReplayCommand[]) {
  const replay = runReplay(initialState, commands);
  return {
    id,
    initialStateSha256: canonicalSha256(initialState),
    steps: replay.steps,
    finalStateSha256: replay.finalStateSha256,
  };
}

function executeReplayCommand(state: GameState, command: ReplayCommand): {
  nextState: GameState;
  result: ReplayResult;
} {
  if (command.kind !== 'developFarming') {
    return {
      nextState: state,
      result: { ok: false, error: `unsupported replay command: ${String(command.kind)}`, receipt: {} },
    };
  }
  try {
    const nextState = developFarming(state, command);
    return { nextState, result: { ok: true, receipt: projectReceipt(state, nextState, command) } };
  } catch (error) {
    return {
      nextState: state,
      result: { ok: false, error: error instanceof Error ? error.message : String(error), receipt: {} },
    };
  }
}

function projectReceipt(before: GameState, after: GameState, command: ReplayCommand): Record<string, unknown> {
  const beforeCity = before.cities[command.cityId];
  const afterCity = after.cities[command.cityId];
  const beforeOfficer = before.officers[command.officerId];
  const afterOfficer = after.officers[command.officerId];
  const appendedLog = after.logs.at(-1);
  if (!beforeCity || !afterCity || !beforeOfficer || !afterOfficer || !appendedLog) {
    throw new Error('Successful developFarming replay is missing observable output');
  }
  return {
    gain: afterCity.farming - beforeCity.farming,
    costs: {
      money: beforeCity.money - afterCity.money,
      stamina: beforeOfficer.stamina - afterOfficer.stamina,
    },
    state: {
      turn: after.turn,
      rngSeed: after.rngSeed,
      campaignStarted: after.campaignStarted,
      actedOfficerIds: [...after.actedOfficerIds],
      logCount: after.logs.length,
    },
    city: { id: afterCity.id, resources: { farming: afterCity.farming, money: afterCity.money } },
    officer: { id: afterOfficer.id, stamina: afterOfficer.stamina },
    appendedLog: structuredClone(appendedLog),
  };
}

function vector(id: string, value: unknown) {
  return { id, value, canonical: canonicalJson(value), sha256: canonicalSha256(value) };
}

function findNextDevelopFarmingCommand(state: GameState): ReplayCommand {
  const cityIds = Object.keys(state.cities).sort(compareText);
  const officerIds = Object.keys(state.officers).sort(compareText);
  for (const cityId of cityIds) {
    for (const officerId of officerIds) {
      if (getDevelopFarmingAvailability(state, { cityId, officerId }).allowed) {
        return { kind: 'developFarming', cityId, officerId };
      }
    }
  }
  throw new Error('No second deterministic developFarming command is available');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compare(label: string, actual: unknown, expected: unknown, failures: string[]): void {
  if (actual !== expected) failures.push(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
