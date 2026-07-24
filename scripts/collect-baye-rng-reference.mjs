import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const projectRoot = resolve(import.meta.dirname, '..');
const args = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(args.source ?? process.env.BAYE_REFERENCE_SOURCE ?? '');

if (!args.source && !process.env.BAYE_REFERENCE_SOURCE) {
  fail('Pass --source <path-to-Baye> or set BAYE_REFERENCE_SOURCE.');
}

const runtimeJsPath = resolve(sourceRoot, 'baye_offline/js/baye.v2.js');
const runtimeWasmPath = resolve(sourceRoot, 'baye_offline/js/baye.v2.wasm');
const rngSourcePath = resolve(sourceRoot, 'baye_c/src/comIn.c');
const lockPath = resolve(projectRoot, 'references/upstream-lock.json');

for (const requiredPath of [runtimeJsPath, runtimeWasmPath, rngSourcePath, lockPath]) {
  if (!existsSync(requiredPath)) fail(`Required reference file not found: ${requiredPath}`);
}

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const runtime = await loadEmscriptenRuntime(runtimeJsPath, runtimeWasmPath);
const seeds = [0, 1, 12_345, 0x7fff_ffff, 0xffff_ffff];
const drawCount = 8;

const fixture = {
  schemaVersion: 1,
  subject: 'baye-web-port-rand-r',
  authority: {
    repository: lock.repository.url,
    expectedCommit: lock.repository.commit,
    snapshotCommitVerified: false,
    limitation:
      'The supplied ZIP snapshot has no Git metadata. Its WebAssembly output verifies the web port rand_r path, not the BBK SysRand implementation.',
  },
  generator: {
    command: 'node scripts/collect-baye-rng-reference.mjs --source <path-to-Baye>',
    sourceEntry: 'Baye/baye_c/src/comIn.c:gam_srand/gam_rand',
    runtimeExports: ['bayeSRand', 'bayeRand', 'bayeGetSeed'],
    files: {
      'Baye/baye_c/src/comIn.c': sha256(rngSourcePath),
      'Baye/baye_offline/js/baye.v2.js': sha256(runtimeJsPath),
      'Baye/baye_offline/js/baye.v2.wasm': sha256(runtimeWasmPath),
    },
  },
  sequences: seeds.map((seed) => collectSequence(runtime, seed, drawCount)),
};

const json = `${JSON.stringify(fixture, null, 2)}\n`;
if (args.output) {
  const outputPath = resolve(projectRoot, args.output);
  writeFileSync(outputPath, json);
  console.log(`Wrote ${outputPath}`);
} else {
  process.stdout.write(json);
}

function collectSequence(runtimeModule, seed, count) {
  runtimeModule._bayeSRand(seed);
  const draws = [];
  for (let index = 0; index < count; index += 1) {
    const value = runtimeModule._bayeRand() >>> 0;
    draws.push({ value, seedAfter: runtimeModule._bayeGetSeed() >>> 0 });
  }
  return { seed: seed >>> 0, draws };
}

async function loadEmscriptenRuntime(jsPath, wasmPath) {
  const wasmBinary = readFileSync(wasmPath);
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const moduleObject = {
    noInitialRun: true,
    wasmBinary,
    onAbort(reason) {
      rejectReady(new Error(`Reference runtime aborted: ${String(reason)}`));
    },
    onRuntimeInitialized() {
      resolveReady(moduleObject);
    },
    print() {},
    printErr(message) {
      if (!String(message).includes('wasm streaming compile failed')) console.error(message);
    },
  };
  const moduleShim = { exports: moduleObject };
  const context = {
    Module: moduleObject,
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    WebAssembly,
    __dirname: dirname(jsPath),
    __filename: jsPath,
    clearInterval,
    clearTimeout,
    console,
    exports: moduleShim.exports,
    module: moduleShim,
    process,
    require: createRequire(jsPath),
    setInterval,
    setTimeout,
  };
  context.global = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(jsPath, 'utf8'), context, { filename: jsPath });

  const timeout = setTimeout(() => rejectReady(new Error('Timed out loading the reference WebAssembly runtime.')), 15_000);
  try {
    return await ready;
  } finally {
    clearTimeout(timeout);
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
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
