import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { BAYE_CORE_FILES } from './reference-core-files.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const referenceRoot = path.join(projectRoot, '.reference');
const cacheRoot = path.join(referenceRoot, '.cache', 'baye-fmj-app.git');
const checkoutRoot = path.join(referenceRoot, 'baye-fmj-app');
const lock = JSON.parse(
  await readFile(path.join(projectRoot, 'references', 'upstream-lock.json'), 'utf8'),
);
const includeOfflineRuntime = process.argv.includes('--include-offline-runtime');
const includeFullSource = process.argv.includes('--full-source');

function git(args, options = {}) {
  const attempts = options.retry ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return execFileSync('git', args, {
        encoding: options.binary ? 'buffer' : 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: options.binary ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      });
    } catch (error) {
      if (attempt === attempts) throw error;
      console.warn(`Git operation failed; retrying (${attempt}/${attempts - 1})...`);
    }
  }
}

function isUnsafeWindowsPath(relativePath) {
  if (process.platform !== 'win32') return false;
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  return relativePath.split('/').some((component) => reserved.test(component));
}

await mkdir(path.dirname(cacheRoot), { recursive: true });
if (!existsSync(cacheRoot)) {
  git(['clone', '--bare', '--filter=blob:none', lock.repository.url, cacheRoot]);
} else {
  const actualRemote = execFileSync(
    'git',
    ['--git-dir', cacheRoot, 'remote', 'get-url', 'origin'],
    { encoding: 'utf8' },
  ).trim();
  if (actualRemote !== lock.repository.url) {
    throw new Error(`Reference cache origin mismatch: ${actualRemote}`);
  }
}

git([
  '--git-dir',
  cacheRoot,
  'fetch',
  '--depth',
  '1',
  'origin',
  lock.repository.commit,
], { retry: true });

const requestedPaths = [
  ...BAYE_CORE_FILES.map((relativePath) => `Baye/baye_c/${relativePath}`),
  'Baye/baye_doc/_sources/demos/index.txt',
];
if (includeFullSource) {
  requestedPaths.push('Baye/baye_c', 'Baye/baye_doc/_sources');
}
if (includeOfflineRuntime) {
  requestedPaths.push('Baye/baye_offline');
}

const listed = execFileSync(
  'git',
  ['--git-dir', cacheRoot, 'ls-tree', '-r', '--name-only', lock.repository.commit, '--', ...requestedPaths],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
)
  .split(/\r?\n/)
  .filter(Boolean);

await rm(checkoutRoot, { recursive: true, force: true });
await mkdir(checkoutRoot, { recursive: true });
let skipped = 0;
for (const relativePath of listed) {
  if (isUnsafeWindowsPath(relativePath)) {
    skipped += 1;
    continue;
  }
  const content = git(
    ['--git-dir', cacheRoot, 'show', `${lock.repository.commit}:${relativePath}`],
    { binary: true, retry: true },
  );
  const targetPath = path.join(checkoutRoot, ...relativePath.split('/'));
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content);
}

const statePath = path.join(checkoutRoot, '.reference-state.json');
await rm(statePath, { force: true });
await writeFile(
  statePath,
  `${JSON.stringify({
    schemaVersion: 1,
    repository: lock.repository.url,
    commit: lock.repository.commit,
    includedFullSource: includeFullSource,
    includedOfflineRuntime: includeOfflineRuntime,
    materializedFiles: listed.length - skipped,
    skippedUnsafePaths: skipped,
  }, null, 2)}\n`,
  'utf8',
);

console.log(`Baye reference ready at ${checkoutRoot}`);
console.log(`Pinned commit: ${lock.repository.commit}`);
if (skipped > 0) console.warn(`Skipped ${skipped} operating-system-reserved path(s).`);
