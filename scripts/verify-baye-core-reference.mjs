import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  BAYE_CORE_FILES,
  BAYE_CORE_SUPPORT_FILES,
  FORBIDDEN_REFERENCE_BASENAMES,
  FORBIDDEN_REFERENCE_EXTENSIONS,
} from './reference-core-files.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const vendorRoot = path.join(projectRoot, 'references', 'vendor', 'baye-c-core');
const lock = JSON.parse(
  await readFile(path.join(projectRoot, 'references', 'upstream-lock.json'), 'utf8'),
);
const manifest = JSON.parse(await readFile(path.join(vendorRoot, 'MANIFEST.json'), 'utf8'));
const failures = [];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(directory, entry.name), relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

if (manifest.upstream?.repository !== lock.repository.url) {
  failures.push('manifest repository does not match upstream-lock.json');
}
if (manifest.upstream?.commit !== lock.repository.commit) {
  failures.push('manifest commit does not match upstream-lock.json');
}

const manifestPaths = manifest.files?.map((entry) => entry.path) ?? [];
if (JSON.stringify(manifestPaths) !== JSON.stringify(BAYE_CORE_FILES)) {
  failures.push('manifest file selection does not match scripts/reference-core-files.mjs');
}

for (const entry of manifest.files ?? []) {
  const filePath = path.join(vendorRoot, ...entry.path.split('/'));
  try {
    const content = await readFile(filePath);
    if (content.byteLength !== entry.bytes) {
      failures.push(`size mismatch: ${entry.path}`);
    }
    if (sha256(content) !== entry.sha256) {
      failures.push(`hash mismatch: ${entry.path}`);
    }
  } catch {
    failures.push(`missing: ${entry.path}`);
  }
}

const actualFiles = (await listFiles(vendorRoot)).sort();
const expectedFiles = [...BAYE_CORE_FILES, ...BAYE_CORE_SUPPORT_FILES].sort();
for (const file of actualFiles) {
  const basename = path.posix.basename(file).toLowerCase();
  const extension = path.posix.extname(file).toLowerCase();
  if (FORBIDDEN_REFERENCE_BASENAMES.has(basename)) {
    failures.push(`forbidden original resource: ${file}`);
  }
  if (FORBIDDEN_REFERENCE_EXTENSIONS.has(extension)) {
    failures.push(`forbidden binary or media extension: ${file}`);
  }
}
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  failures.push('vendor directory contains missing or unapproved files');
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`reference check: ${failure}`);
  process.exit(1);
}

console.log(
  `Verified ${manifest.files.length} vendored Baye C files at pinned commit ${lock.repository.commit}`,
);
