import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGodotSpikeData } from '../../scripts/generate-godot-spike-data';
import { canonicalJson, canonicalSha256 } from './migration/canonicalJson';
import { buildMigrationReplaySuite, validateReplaySuite } from './migration/replayFixture';

const suitePath = resolve(process.cwd(), 'godot/data/fixtures/migration-replay-suite-v1.json');

describe('Godot migration replay protocol', () => {
  it('reproduces every checked-in vector and replay checkpoint', () => {
    const suite = JSON.parse(readFileSync(suitePath, 'utf8')) as ReturnType<typeof buildMigrationReplaySuite>;
    expect(validateReplaySuite(suite, buildGodotSpikeData())).toEqual([]);
    expect(suite).toEqual(JSON.parse(JSON.stringify(buildMigrationReplaySuite(buildGodotSpikeData()))));
  });

  it('sorts object keys while retaining semantic array order', () => {
    expect(canonicalSha256({ beta: 2, alpha: { y: 2, x: 1 } }))
      .toBe(canonicalSha256({ alpha: { x: 1, y: 2 }, beta: 2 }));
    expect(canonicalSha256(['a', 'b'])).not.toBe(canonicalSha256(['b', 'a']));
  });

  it('rejects non-finite numeric and unsupported value domains', () => {
    expect(canonicalJson(0.5)).toBe('0.5');
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow('only accepts finite numbers');
    expect(() => canonicalJson(1.2345678)).toThrow('at most 6 decimal places');
    expect(() => canonicalJson(1e-20)).toThrow('at most 6 decimal places');
    expect(canonicalJson('😀')).toBe('"😀"');
    expect(() => canonicalJson('\ud800')).toThrow('well-formed Unicode scalar sequences');
    expect(() => canonicalJson({ ['\udc00']: 1 })).toThrow('well-formed Unicode scalar sequences');
    expect(() => canonicalJson(undefined)).toThrow('cannot encode undefined');
  });

  it('pinpoints a tampered replay step', () => {
    const suite = buildMigrationReplaySuite(buildGodotSpikeData());
    suite.replays[1].steps[1].afterStateSha256 = '0'.repeat(64);
    expect(validateReplaySuite(suite, buildGodotSpikeData()))
      .toContainEqual(expect.stringContaining('develop-farming-sequence-v1.step[1].afterStateSha256'));
  });

  it('proves an invalid command changes neither state nor seed', () => {
    const suite = buildMigrationReplaySuite(buildGodotSpikeData());
    expect(suite.replays[1].steps[0].stateChanged).toBe(true);
    expect(suite.replays[1].steps[0].expected.ok).toBe(true);
    expect(suite.replays[1].steps[1].stateChanged).toBe(true);
    expect(suite.replays[1].steps[1].expected.ok).toBe(true);
    const invalid = suite.replays[1].steps[2];
    expect(invalid.expected).toEqual({ ok: false, error: '只能在己方城池执行命令', receipt: {} });
    expect(invalid.stateChanged).toBe(false);
    expect(invalid.afterStateSha256).toBe(invalid.beforeStateSha256);
  });

  it('rejects unknown fixture and algorithm versions', () => {
    const state = buildGodotSpikeData();
    const futureSuite = { ...buildMigrationReplaySuite(state), fixtureSuiteVersion: 2 };
    const unknownAlgorithm = buildMigrationReplaySuite(state) as unknown as Record<string, unknown>;
    unknownAlgorithm.algorithms = {
      canonical: 'unknown-canonical', digest: 'sha256', numberDomain: 'safe-integer-or-decimal-6-v1',
    };
    expect(validateReplaySuite(futureSuite, state)).toContainEqual(expect.stringContaining('fixtureSuiteVersion'));
    expect(validateReplaySuite(unknownAlgorithm, state)).toContainEqual(expect.stringContaining('algorithms.canonical'));
  });

  it('rejects malformed suites and unknown adapters before replaying', () => {
    const state = buildGodotSpikeData();
    expect(validateReplaySuite(null, state)).toEqual(['suite: expected object']);
    expect(validateReplaySuite({ fixtureSuiteVersion: 1, id: 'godot-migration-replay-suite-v1' }, state))
      .toEqual(['algorithms: expected object']);
    const suite = buildMigrationReplaySuite(state) as unknown as {
      replays: Array<{ steps: Array<{ command: { kind: string } }> }>;
    };
    suite.replays[0].steps[0].command.kind = 'unknownCommand';
    expect(validateReplaySuite(suite, state))
      .toContainEqual(expect.stringContaining('step[0].command: unsupported'));
    const emptyIdSuite = buildMigrationReplaySuite(state) as unknown as {
      replays: Array<{ steps: Array<{ command: { cityId: string } }> }>;
    };
    emptyIdSuite.replays[0].steps[0].command.cityId = '';
    expect(validateReplaySuite(emptyIdSuite, state))
      .toContainEqual(expect.stringContaining('step[0].command: unsupported'));
  });
});
