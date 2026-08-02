import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engineCandidate = 'D:\\03_Godot\\01_Engine\\Godot_v4.7.1-stable_win64_console.exe';
const engine = process.env.GODOT_BIN || (existsSync(engineCandidate) ? engineCandidate : 'godot');
const version = spawnSync(engine, ['--version'], { cwd: root, encoding: 'utf8', timeout: 60_000 });
const stdout = String(version.stdout ?? '').trim();
if (version.error || version.signal || version.status !== 0 || !/^4\.7\.1(?:\.|$)/u.test(stdout)) {
  throw new Error(`Godot 4.7.1 is required: ${stdout || version.error?.message || String(version.stderr ?? '').trim()}`);
}
const result = spawnSync(engine, [
  '--headless', '--path', resolve(root, 'godot'), '--script', 'res://tests/production_data_runner.gd',
], { cwd: root, encoding: 'utf8', timeout: 60_000 });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error || result.signal || result.status !== 0) {
  throw new Error(`Godot production data verification failed: ${result.error?.message ?? result.signal ?? result.status}`);
}
