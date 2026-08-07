import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engineCandidate = 'D:\\03_Godot\\01_Engine\\Godot_v4.7.1-stable_win64.exe';
const engine = process.env.GODOT_BIN || (existsSync(engineCandidate) ? engineCandidate : 'godot');
const runtimeRoot = resolve(root, 'godot/.godot/runtime');
const appData = resolve(runtimeRoot, 'appdata');
const localAppData = resolve(runtimeRoot, 'localappdata');
mkdirSync(appData, { recursive: true });
mkdirSync(localAppData, { recursive: true });
const godotEnv = { ...process.env, APPDATA: appData, LOCALAPPDATA: localAppData };
godotEnv.XDG_CONFIG_HOME = resolve(runtimeRoot, 'xdg-config');
godotEnv.XDG_CACHE_HOME = resolve(runtimeRoot, 'xdg-cache');
godotEnv.XDG_DATA_HOME = resolve(runtimeRoot, 'xdg-data');
for (const path of [godotEnv.XDG_CONFIG_HOME, godotEnv.XDG_CACHE_HOME, godotEnv.XDG_DATA_HOME]) mkdirSync(path, { recursive: true });
const version = spawnSync(engine, ['--version'], { cwd: root, env: godotEnv, encoding: 'utf8', timeout: 60_000 });
const stdout = String(version.stdout ?? '').trim();
if (version.error || version.signal || version.status !== 0 || !/^4\.7\.1(?:\.|$)/u.test(stdout)) {
  throw new Error(`Godot 4.7.1 is required: ${stdout || version.error?.message || String(version.stderr ?? '').trim()}`);
}
const result = spawnSync(engine, [
  '--headless', '--path', resolve(root, 'godot'), '--script', 'res://tests/production_data_runner.gd',
], { cwd: root, env: godotEnv, encoding: 'utf8', timeout: 60_000 });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error || result.signal || result.status !== 0) {
  throw new Error(`Godot production data verification failed: ${result.error?.message ?? result.signal ?? result.status}`);
}
