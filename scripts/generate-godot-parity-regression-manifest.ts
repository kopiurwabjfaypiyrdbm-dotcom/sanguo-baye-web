import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, canonicalSha256, compareUnicodeScalar } from '../src/core/migration/canonicalJson';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(projectRoot, 'godot/data/fixtures/full-parity-regression-v1.json');
const fixtureFiles = [
  'develop-farming-v1.json',
  'migration-replay-suite-v1.json',
  'application-session-suite-v1.json',
  'tactical-battle-v1.json',
  'tactical-battle-movement-v1.json',
  'tactical-battle-attack-v1.json',
  'tactical-battle-skill-v1.json',
  'tactical-battle-ai-v1.json',
  'tactical-battle-outcome-v1.json',
  'tactical-battle-settlement-v1.json',
  'godot-production-save-recovery-v1.json',
  'godot-campaign-entry-v1.json',
  'godot-full-loop-v1.json',
] as const;

const expectedFixtureFiles = [...fixtureFiles].sort(compareUnicodeScalar);
const actualFixtureFiles = readdirSync(resolve(projectRoot, 'godot/data/fixtures'))
  .filter((fileName) => fileName.endsWith('.json') && fileName !== basename(outputPath))
  .sort(compareUnicodeScalar);
if (canonicalJson(actualFixtureFiles) !== canonicalJson(expectedFixtureFiles)) {
  throw new Error(`fixture directory drift: expected ${expectedFixtureFiles.join(', ')}, received ${actualFixtureFiles.join(', ')}`);
}

export function buildParityRegressionManifest() {
  const ids = new Set<string>();
  const paths = new Set<string>();
  const fixtures = fixtureFiles.map((fileName) => {
    const sourcePath = resolve(projectRoot, 'godot/data/fixtures', fileName);
    const value = JSON.parse(readFileSync(sourcePath, 'utf8')) as Record<string, unknown>;
    const versionFields = Object.keys(value)
      .filter((key) => key.endsWith('Version'))
      .sort(compareUnicodeScalar)
      .map((key) => ({ key, value: value[key] }));
    if (versionFields.length === 0) throw new Error(`${fileName} has no *Version metadata field`);
    const id = basename(fileName, '.json');
    const path = `res://data/fixtures/${fileName}`;
    if (ids.has(id) || paths.has(path)) throw new Error(`duplicate fixture id/path: ${id}`);
    ids.add(id);
    paths.add(path);
    return {
      id,
      path,
      versionFields,
      canonicalSha256: canonicalSha256(value),
    };
  });
  return {
    manifestVersion: 1,
    id: 'godot-full-parity-regression-v1',
    algorithms: {
      canonical: 'canonical-json-v1',
      digest: 'sha256',
      ordering: 'fixture-list-order-v1',
    },
    fixtures,
  };
}

const generated = buildParityRegressionManifest();
if (process.argv.includes('--write')) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(generated, null, 2)}\n`, 'utf8');
  process.stdout.write(`[Godot parity regression] generated ${generated.fixtures.length} fixture entries\n`);
} else {
  let checkedIn: unknown;
  try {
    checkedIn = JSON.parse(readFileSync(outputPath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${outputPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (canonicalJson(checkedIn) !== canonicalJson(generated)) {
    throw new Error('godot/data/fixtures/full-parity-regression-v1.json differs from the TypeScript generator');
  }
  process.stdout.write(`[Godot parity regression] PASSED ${generated.fixtures.length} fixture entries\n`);
}
