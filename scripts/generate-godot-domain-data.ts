import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/core/migration/canonicalJson';
import {
  buildProductionDataBundle,
  validateProductionCatalog,
  validateProductionEnvelope,
} from '../src/core/migration/productionDataContract';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = resolve(projectRoot, 'godot/data/campaigns');
const writeMode = process.argv.includes('--write');
const bundle = buildProductionDataBundle();
const outputs = new Map<string, unknown>([
  [resolve(dataRoot, 'catalog-v1.json'), bundle.catalog],
  ...bundle.envelopes.map((envelope) => [
    resolve(dataRoot, `period-${envelope.scenario.periodId}.json`), envelope,
  ] as const),
]);

const failures = [
  ...validateProductionCatalog(bundle.catalog, bundle.envelopes),
  ...bundle.envelopes.flatMap((envelope) =>
    validateProductionEnvelope(envelope).map((issue) => `period-${envelope.scenario.periodId}: ${issue}`)),
];

if (writeMode) {
  for (const [path, value] of outputs) writeJson(path, value);
  process.stdout.write(`[Godot domain data] generated catalog + ${bundle.envelopes.length} periods\n`);
} else {
  for (const [path, expected] of outputs) {
    if (!existsAsCanonical(path, expected)) failures.push(`${relative(path)}: checked-in data differs from generator`);
  }
  if (failures.length === 0) {
    process.stdout.write(`[Godot domain data] PASSED catalog + ${bundle.envelopes.length} periods\n`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`[Godot domain data] ${failure}\n`);
  process.exitCode = 1;
}

function existsAsCanonical(path: string, expected: unknown): boolean {
  try { return canonicalJson(JSON.parse(readFileSync(path, 'utf8'))) === canonicalJson(expected); }
  catch { return false; }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function relative(path: string): string { return path.slice(projectRoot.length + 1).replaceAll('\\', '/'); }
