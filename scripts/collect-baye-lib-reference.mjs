import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const projectRoot = resolve(import.meta.dirname, '..');
const args = parseArgs(process.argv.slice(2));
const sourceArgument = args.source ?? process.env.BAYE_REFERENCE_SOURCE;
if (!sourceArgument) fail('Pass --source <path-to-Baye> or set BAYE_REFERENCE_SOURCE.');

const sourceRoot = resolve(sourceArgument);
const libPath = resolve(sourceRoot, 'baye_c/src/dat.lib.orig');
const lockPath = resolve(projectRoot, 'references/upstream-lock.json');
const evidencePaths = {
  'Baye/baye_c/src/baye/resource.h': resolve(sourceRoot, 'baye_c/src/baye/resource.h'),
  'Baye/baye_c/src/baye/datman.h': resolve(sourceRoot, 'baye_c/src/baye/datman.h'),
  'Baye/baye_c/src/datman.c': resolve(sourceRoot, 'baye_c/src/datman.c'),
  'Baye/baye_c/src/baye/consdef.h': resolve(sourceRoot, 'baye_c/src/baye/consdef.h'),
  'Baye/baye_c/src/data/pconst.h': resolve(sourceRoot, 'baye_c/src/data/pconst.h'),
  'Baye/baye_c/src/dat.lib.orig': libPath,
};

for (const path of [lockPath, ...Object.values(evidencePaths)]) {
  if (!existsSync(path)) fail(`Required reference file not found: ${path}`);
}

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const bytes = readFileSync(libPath);
const targets = [
  { name: 'terrain combat modifiers (dFgtLandF)', resourceId: 2, itemIndex: 4 },
  { name: 'period 1 cities', resourceId: 57, itemIndex: 1 },
  { name: 'first city name', resourceId: 58, itemIndex: 1 },
  { name: 'period 1 persons', resourceId: 61, itemIndex: 1 },
  { name: 'first period 1 person name', resourceId: 62, itemIndex: 1 },
  { name: 'period 1 person queue', resourceId: 65, itemIndex: 1 },
  { name: 'period 1 goods queue', resourceId: 68, itemIndex: 1 },
  { name: 'first goods name', resourceId: 73, itemIndex: 1 },
];

const fixture = {
  schemaVersion: 1,
  subject: 'baye-original-lib-container',
  authority: {
    repository: lock.repository.url,
    expectedCommit: lock.repository.commit,
    snapshotCommitVerified: false,
    limitation:
      'The supplied ZIP snapshot has no Git metadata. dat.lib.orig remains local-only; this fixture stores structural metadata and hashes, not resource bytes.',
  },
  generator: {
    command: 'node scripts/collect-baye-lib-reference.mjs --source <path-to-Baye> --output references/fixtures/lib-original.json',
    sourceEntry:
      'Baye/baye_c/src/datman.c:GetResStartAddr/GetResItem/ResItemGetN; resource IDs from consdef.h and pconst.h',
    files: Object.fromEntries(Object.entries(evidencePaths).map(([name, path]) => [name, sha256(readFileSync(path))])),
  },
  format: {
    byteOrder: 'little-endian',
    directoryEntry: 'U32 absolute offset, indexed by one-based resource ID; 0xffffffff means absent',
    headerVariant: 'legacy-u16-item-length',
    headerLength: 12,
    variableItemIndex: 'U16 relative offset + U16 length',
    decryption: 'decodedByte = (storedByte - ResKey) & 0xff',
    newerPortDifference:
      'Current datman.h widens ItmLen and both RIDX fields to U32 (14-byte header, 8-byte index), while dat.lib.orig uses U16 (12-byte header, 4-byte index).',
  },
  archive: {
    byteLength: bytes.length,
    sha256: sha256(bytes),
  },
  observations: targets.map((target) => inspectTarget(bytes, target)),
};

const json = `${JSON.stringify(fixture, null, 2)}\n`;
if (args.output) {
  const outputPath = resolve(projectRoot, args.output);
  writeFileSync(outputPath, json);
  console.log(`Wrote ${outputPath}`);
} else {
  process.stdout.write(json);
}

function inspectTarget(archive, target) {
  const directoryOffset = (target.resourceId - 1) * 4;
  requireRange(archive, directoryOffset, 4, `resource ${target.resourceId} directory entry`);
  const resourceOffset = archive.readUInt32LE(directoryOffset);
  if (resourceOffset === 0xffff_ffff) fail(`Resource ${target.resourceId} is absent.`);
  requireRange(archive, resourceOffset, 12, `resource ${target.resourceId} header`);

  const header = {
    resourceOffset,
    resourceLength: archive.readUInt32LE(resourceOffset),
    storedResourceId: archive.readUInt16LE(resourceOffset + 4),
    itemCount: archive.readUInt16LE(resourceOffset + 6),
    itemLength: archive.readUInt16LE(resourceOffset + 8),
    key: archive[resourceOffset + 10],
    reserved: archive[resourceOffset + 11],
  };
  if (header.storedResourceId !== target.resourceId) {
    fail(`Resource ${target.resourceId} points to header ${header.storedResourceId}.`);
  }
  requireRange(archive, resourceOffset, header.resourceLength, `resource ${target.resourceId}`);
  if (target.itemIndex < 1 || target.itemIndex > header.itemCount) {
    fail(`Invalid item ${target.itemIndex} for resource ${target.resourceId}.`);
  }

  let relativeOffset;
  let itemLength;
  if (header.itemLength !== 0) {
    relativeOffset = 12 + (target.itemIndex - 1) * header.itemLength;
    itemLength = header.itemLength;
  } else if (header.itemCount === 1) {
    relativeOffset = 12;
    itemLength = header.resourceLength - 12;
  } else {
    const indexOffset = resourceOffset + 12 + (target.itemIndex - 1) * 4;
    requireRange(archive, indexOffset, 4, `resource ${target.resourceId} item index`);
    relativeOffset = archive.readUInt16LE(indexOffset);
    itemLength = archive.readUInt16LE(indexOffset + 2);
  }

  if (relativeOffset < 12 || relativeOffset + itemLength > header.resourceLength) {
    fail(`Resource ${target.resourceId} item ${target.itemIndex} is outside its resource.`);
  }
  const stored = archive.subarray(resourceOffset + relativeOffset, resourceOffset + relativeOffset + itemLength);
  const decoded = Buffer.from(stored);
  for (let index = 0; index < decoded.length; index += 1) {
    decoded[index] = (decoded[index] - header.key) & 0xff;
  }
  const item = {
    relativeOffset,
    byteLength: decoded.length,
    decodedSha256: sha256(decoded),
  };
  return {
    ...target,
    header,
    item,
  };
}

function requireRange(buffer, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    fail(`${label} range ${offset}..${offset + length} is outside the ${buffer.length}-byte archive.`);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--source' || token === '--output') {
      const value = argv[index + 1];
      if (!value) fail(`Missing value for ${token}.`);
      parsed[token.slice(2)] = value;
      index += 1;
    } else {
      fail(`Unknown argument: ${token}`);
    }
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
