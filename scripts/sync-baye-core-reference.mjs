import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { BAYE_CORE_FILES } from './reference-core-files.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const vendorRoot = path.join(projectRoot, 'references', 'vendor', 'baye-c-core');
const lock = JSON.parse(
  await readFile(path.join(projectRoot, 'references', 'upstream-lock.json'), 'utf8'),
);

function parseSourceArgument() {
  const sourceIndex = process.argv.indexOf('--source');
  if (sourceIndex >= 0 && process.argv[sourceIndex + 1]) {
    return path.resolve(process.argv[sourceIndex + 1]);
  }
  return path.join(projectRoot, '.reference', 'baye-fmj-app', 'Baye');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

const bayeRoot = parseSourceArgument();
const sourceRoot = path.join(bayeRoot, 'baye_c');
const allowUnverifiedSource = process.argv.includes('--allow-unverified-source');

try {
  if (!(await stat(sourceRoot)).isDirectory()) {
    throw new Error('not a directory');
  }
} catch {
  throw new Error(
    `Baye C source not found at ${sourceRoot}. Run "npm run reference:setup" or pass --source <path-to-Baye>.`,
  );
}

try {
  const state = JSON.parse(
    await readFile(path.join(path.dirname(bayeRoot), '.reference-state.json'), 'utf8'),
  );
  if (state.repository !== lock.repository.url || state.commit !== lock.repository.commit) {
    throw new Error('reference state does not match upstream lock');
  }
} catch (error) {
  if (!allowUnverifiedSource) {
    throw new Error(
      `Refusing to sync from a source without matching pinned state: ${error.message}. Run "npm run reference:setup" first.`,
    );
  }
  console.warn('WARNING: syncing from an explicitly allowed unverified local source.');
}

try {
  const previousManifest = JSON.parse(
    await readFile(path.join(vendorRoot, 'MANIFEST.json'), 'utf8'),
  );
  for (const entry of previousManifest.files ?? []) {
    if (!BAYE_CORE_FILES.includes(entry.path)) {
      await rm(path.join(vendorRoot, ...entry.path.split('/')), { force: true });
    }
  }
} catch {
  // The first synchronized baseline has no previous manifest.
}

const manifestFiles = [];
for (const relativePath of BAYE_CORE_FILES) {
  const sourcePath = path.join(sourceRoot, ...relativePath.split('/'));
  const targetPath = path.join(vendorRoot, ...relativePath.split('/'));
  const content = await readFile(sourcePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content);
  manifestFiles.push({
    path: relativePath,
    bytes: content.byteLength,
    sha256: sha256(content),
  });
}

const manifest = {
  schemaVersion: 1,
  upstream: {
    repository: lock.repository.url,
    commit: lock.repository.commit,
    tree: lock.repository.tree,
  },
  selectionPolicy: 'MIT-licensed C rule and structure sources only',
  excluded: [
    'original resource archives and generated data arrays',
    'fonts, images, audio, video, WebAssembly and compiled binaries',
    'GPL offline runtime',
    'documentation without a verified redistribution license',
    'unneeded platform projects and third-party submodules',
  ],
  files: manifestFiles,
};

await mkdir(vendorRoot, { recursive: true });
await writeFile(
  path.join(vendorRoot, 'MANIFEST.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(`Synchronized ${manifestFiles.length} Baye C reference files into ${vendorRoot}`);
