import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseBayeLegacyPeriod } from '../src/compat/baye/legacyScenario';

const EXPECTED_ARCHIVE_SHA256 = 'c5b33922146e1631b5ab1c8429ca3c6cb3b80b26152747e391438409ec0f82ab';
const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error('Usage: vite-node scripts/generate-bundled-scenarios.ts <path-to-Baye>');

const archivePath = resolve(sourceRoot, 'baye_c/src/dat.lib.orig');
const bytes = new Uint8Array(readFileSync(archivePath));
const actualHash = createHash('sha256').update(bytes).digest('hex');
if (actualHash !== EXPECTED_ARCHIVE_SHA256) {
  throw new Error(`Unexpected dat.lib.orig SHA-256: ${actualHash}`);
}

const outputPath = resolve('src/data/generated/baye-periods.json');
const payload = {
  schemaVersion: 1,
  source: {
    repository: 'https://github.com/erduoniba/baye-fmj-app.git',
    commit: '60c41ea2d9932b295833ece7004394497610596a',
    archiveSha256: actualHash,
    note: 'Parsed scenario records only. The original resource archive and visual assets are not bundled.',
  },
  periods: ([1, 2, 3, 4] as const).map((period) => parseBayeLegacyPeriod(bytes, period)),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Generated ${outputPath} (${payload.periods.length} periods).`);
