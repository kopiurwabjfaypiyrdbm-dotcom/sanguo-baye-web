import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const godotProject = resolve(root, 'godot');
const exactWindowsEngine = 'D:\\03_Godot\\01_Engine\\Godot_v4.7.1-stable_win64_console.exe';
const engine = process.env.GODOT_BIN
  || (existsSync(exactWindowsEngine) ? exactWindowsEngine : 'godot');
const runtimeRoot = resolve(godotProject, '.godot/runtime');
const appData = resolve(runtimeRoot, 'appdata');
const localAppData = resolve(runtimeRoot, 'localappdata');
mkdirSync(appData, { recursive: true });
mkdirSync(localAppData, { recursive: true });
const godotEnv = { ...process.env, APPDATA: appData, LOCALAPPDATA: localAppData };
godotEnv.XDG_CONFIG_HOME = resolve(runtimeRoot, 'xdg-config');
godotEnv.XDG_CACHE_HOME = resolve(runtimeRoot, 'xdg-cache');
godotEnv.XDG_DATA_HOME = resolve(runtimeRoot, 'xdg-data');
for (const path of [godotEnv.XDG_CONFIG_HOME, godotEnv.XDG_CACHE_HOME, godotEnv.XDG_DATA_HOME]) mkdirSync(path, { recursive: true });
const common = ['--headless', '--path', godotProject, '--script', 'res://tests/migration_replay_runner.gd'];

const version = spawnSync(engine, ['--version'], { cwd: root, env: godotEnv, encoding: 'utf8', timeout: 60_000 });
const versionStdout = String(version.stdout ?? '').trim();
const versionStderr = String(version.stderr ?? '').trim();
if (version.error || version.signal || version.status !== 0 || !/^4\.7\.1(?:\.|$)/u.test(versionStdout)) {
  throw new Error(`Godot 4.7.1 is required, received ${versionStdout || versionStderr || version.error?.message || 'unavailable'}`);
}
process.stdout.write(`[Godot migration verification] engine=${versionStdout}\n`);

run('canonical replay suite', common, true);

const sourcePath = resolve(godotProject, 'data/fixtures/migration-replay-suite-v1.json');
const tamperedPath = resolve(godotProject, '.godot/migration-replay-suite-tampered.json');
const contractPath = resolve(godotProject, '.godot/migration-replay-suite-invalid-contract.json');
const malformedCommandPath = resolve(godotProject, '.godot/migration-replay-suite-malformed-command.json');
const suite = JSON.parse(readFileSync(sourcePath, 'utf8'));
suite.replays[1].steps[1].afterStateSha256 = '0'.repeat(64);
writeFileSync(tamperedPath, `${JSON.stringify(suite, null, 2)}\n`, 'utf8');
try {
  run(
    'tampered replay rejection',
    [...common, '--', '--fixture', 'res://.godot/migration-replay-suite-tampered.json'],
    false,
    'develop-farming-sequence-v1.step[1].afterStateSha256',
  );
} finally {
  rmSync(tamperedPath, { force: true });
}

suite.replays[1].steps[1].afterStateSha256 = JSON.parse(readFileSync(sourcePath, 'utf8'))
  .replays[1].steps[1].afterStateSha256;
suite.algorithms.numberDomain = 'unknown-number-domain';
writeFileSync(contractPath, `${JSON.stringify(suite, null, 2)}\n`, 'utf8');
try {
  run(
    'unknown number-domain rejection',
    [...common, '--', '--fixture', 'res://.godot/migration-replay-suite-invalid-contract.json'],
    false,
    'algorithms.numberDomain: unsupported',
  );
} finally {
  rmSync(contractPath, { force: true });
}

const malformedCommandSuite = JSON.parse(readFileSync(sourcePath, 'utf8'));
malformedCommandSuite.replays[0].steps[0].command.cityId = 12;
writeFileSync(malformedCommandPath, `${JSON.stringify(malformedCommandSuite, null, 2)}\n`, 'utf8');
try {
  run(
    'malformed command rejection',
    [...common, '--', '--fixture', 'res://.godot/migration-replay-suite-malformed-command.json'],
    false,
    'step[0].command: unsupported or incomplete adapter payload',
  );
} finally {
  rmSync(malformedCommandPath, { force: true });
}

run('missing fixture argument rejection', [...common, '--', '--fixture'], false, '--fixture requires a JSON path');

process.stdout.write('[Godot migration verification] PASSED positive replay and negative tamper rehearsal\n');

function run(label, arguments_, shouldSucceed, expectedFailureText = '') {
  const result = spawnSync(engine, arguments_, { cwd: root, env: godotEnv, encoding: 'utf8', timeout: 60_000 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const succeeded = result.status === 0;
  if (result.error || result.signal || result.status === null) {
    throw new Error(`${label}: Godot process failed: ${result.error?.message ?? result.signal ?? 'no exit status'}`);
  }
  if (succeeded !== shouldSucceed) {
    throw new Error(`${label}: expected exit ${shouldSucceed ? 0 : 'nonzero'}, received ${String(result.status)}`);
  }
  if (!shouldSucceed && expectedFailureText && !`${result.stdout}\n${result.stderr}`.includes(expectedFailureText)) {
    throw new Error(`${label}: failure output did not contain ${expectedFailureText}`);
  }
}
