import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGodotSpikeData } from './generate-godot-spike-data';
import { buildMigrationReplaySuite, validateReplaySuite } from '../src/core/migration/replayFixture';
import { canonicalJson } from '../src/core/migration/canonicalJson';
import type { GameState } from '../src/core/types';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureArgument = readArgument('--fixture');
const fixturePath = fixtureArgument
  ? (isAbsolute(fixtureArgument) ? fixtureArgument : resolve(projectRoot, fixtureArgument))
  : resolve(projectRoot, 'godot/data/fixtures/migration-replay-suite-v1.json');
const checkedIn: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));
const allowedInitialStatePath = 'godot/data/period-1.json';
const initialState = JSON.parse(
  readFileSync(resolve(projectRoot, allowedInitialStatePath), 'utf8'),
) as GameState;
const failures = validateReplaySuite(checkedIn, initialState);

if (!fixtureArgument) {
  const generated = buildMigrationReplaySuite(buildGodotSpikeData());
  if (failures.length === 0 && canonicalJson(checkedIn) !== canonicalJson(generated)) {
    failures.unshift('checked-in suite differs from the TypeScript oracle generator');
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`[migration-fixture] ${failure}\n`);
  process.exitCode = 1;
} else {
  const validatedSuite = checkedIn as ReturnType<typeof buildMigrationReplaySuite>;
  const stepCount = validatedSuite.replays.reduce((sum, replay) => sum + replay.steps.length, 0);
  process.stdout.write(
    `[migration-fixture] PASSED vectors=${validatedSuite.canonicalVectors.length} replays=${validatedSuite.replays.length} steps=${stepCount}\n`,
  );
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a JSON path`);
  return value;
}
