import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = resolve(root, 'godot');
const engineCandidate = 'D:\\03_Godot\\01_Engine\\Godot_v4.7.1-stable_win64.exe';
const engine = process.env.GODOT_BIN || (existsSync(engineCandidate) ? engineCandidate : 'godot');
const runtimeRoot = resolve(project, '.godot/runtime-full-loop');
const env = { ...process.env,
  APPDATA: resolve(runtimeRoot, 'appdata'),
  LOCALAPPDATA: resolve(runtimeRoot, 'localappdata'),
  XDG_CONFIG_HOME: resolve(runtimeRoot, 'xdg-config'),
  XDG_CACHE_HOME: resolve(runtimeRoot, 'xdg-cache'),
  XDG_DATA_HOME: resolve(runtimeRoot, 'xdg-data'),
};
for (const path of [env.APPDATA, env.LOCALAPPDATA, env.XDG_CONFIG_HOME, env.XDG_CACHE_HOME, env.XDG_DATA_HOME]) mkdirSync(path, { recursive: true });
const version = spawnSync(engine, ['--version'], { cwd: root, env, encoding: 'utf8', timeout: 60_000 });
const stdout = String(version.stdout ?? '').trim();
if (version.error || version.signal || version.status !== 0 || !/^4\.7\.1(?:\.|$)/u.test(stdout)) {
  throw new Error(`Godot 4.7.1 is required: ${stdout || version.error?.message || String(version.stderr ?? '').trim()}`);
}
process.stdout.write(`[Godot full loop] engine=${stdout}\n`);
const result = spawnSync(engine, ['--headless', '--path', project, '--script', 'res://tests/full_loop_replay_runner.gd'], {
  cwd: root, env, encoding: 'utf8', timeout: 60_000,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error || result.signal || result.status !== 0) throw new Error(`Godot full loop failed: ${result.error?.message ?? result.signal ?? result.status}`);
const combinedOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
if (/SCRIPT ERROR|Parse Error|Node not found|Invalid call/u.test(combinedOutput)) throw new Error('Godot full loop emitted a runtime/script error despite exit code 0');
