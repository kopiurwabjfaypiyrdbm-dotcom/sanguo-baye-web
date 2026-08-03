import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exactEngine = 'D:\\03_Godot\\01_Engine\\Godot_v4.7.1-stable_win64.exe';
const engine = process.env.GODOT_BIN || (existsSync(exactEngine) ? exactEngine : 'godot');
const runtimeUserDir = resolve(root, 'godot/.runtime-user', `run-${process.pid}`);
mkdirSync(runtimeUserDir, { recursive: true });
const godotEnv = { ...process.env, APPDATA: runtimeUserDir, LOCALAPPDATA: runtimeUserDir };
const version = spawnSync(engine, ['--version'], { cwd: root, env: godotEnv, encoding: 'utf8', timeout: 60_000, windowsHide: true });
const versionText = String(version.stdout ?? '').trim();
if (version.error || version.signal || version.status !== 0 || !/^4\.7\.1(?:\.|$)/u.test(versionText)) {
  throw new Error(`Godot 4.7.1 is required: ${versionText || version.error?.message || String(version.stderr ?? '').trim()}`);
}
process.stdout.write(`[Godot production save/recovery] engine=${versionText}\n`);
const result = spawnSync(engine, [
  '--headless', '--display-driver', 'headless', '--path', resolve(root, 'godot'), '--script', 'res://tests/production_save_recovery_runner.gd',
], { cwd: root, env: godotEnv, encoding: 'utf8', timeout: 180_000, windowsHide: true });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error || result.signal || result.status !== 0) {
  throw new Error(`Godot production save/recovery verification failed: ${result.error?.message ?? result.signal ?? result.status}`);
}
