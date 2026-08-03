import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exactEngine = 'D:\\03_Godot\\01_Engine\\Godot_v4.7.1-stable_win64.exe';
const engine = process.env.GODOT_BIN || (existsSync(exactEngine) ? exactEngine : 'godot');
const runtimeRoot = resolve(root, 'godot/.runtime-user');
mkdirSync(runtimeRoot, { recursive: true });
const runtimeUserDir = mkdtempSync(resolve(runtimeRoot, `run-${process.pid}-`));
const env = { ...process.env, APPDATA: runtimeUserDir, LOCALAPPDATA: runtimeUserDir };
const version = spawnSync(engine, ['--version'], { cwd: root, env, encoding: 'utf8', timeout: 60_000, windowsHide: true });
const versionText = String(version.stdout ?? '').trim();
if (version.error || version.status !== 0 || !/^4\.7\.1(?:\.|$)/u.test(versionText)) throw new Error(`Godot 4.7.1 is required: ${versionText}`);
process.stdout.write(`[Godot campaign setup presentation] engine=${versionText}\n`);
const result = spawnSync(engine, [
  '--headless', '--display-driver', 'headless', '--path', resolve(root, 'godot'), '--script', 'res://tests/campaign_setup_presentation_runner.gd',
], { cwd: root, env, encoding: 'utf8', timeout: 180_000, windowsHide: true });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
if (/SCRIPT ERROR|Node not found|Parse Error/u.test(output)) throw new Error('Godot campaign-setup runner emitted a script/runtime error');
if (result.error || result.signal || result.status !== 0) throw new Error(`Godot campaign setup presentation verification failed: ${result.error?.message ?? result.signal ?? result.status}`);
