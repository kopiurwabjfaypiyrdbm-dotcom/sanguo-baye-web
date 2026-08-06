import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = resolve(root, 'godot');
const launcherCandidates = [
  process.env.GDECK_BIN,
  'D:\\03_Godot\\04_Tools\\GodotFlightDeck-Cursor\\bin\\gdeck-cursor.cmd',
  resolve('D:\\03_Godot\\04_Tools\\GodotFlightDeck-Cursor\\cli\\gdeck.mjs'),
].filter(Boolean);

const forwarded = process.argv.slice(2);
if (forwarded.length === 0) {
  process.stderr.write(
    'Usage: node scripts/run-gdeck.mjs <doctor|check|unit|verify|...> [gdeck-args...]\n'
    + 'Runs the Cursor Flight Deck CLI against godot/ without replacing npm godot:* oracle gates.\n',
  );
  process.exit(2);
}

const launcher = launcherCandidates.find((candidate) => existsSync(candidate));
if (!launcher) {
  throw new Error(
    'Cursor Flight Deck launcher not found. Set GDECK_BIN or install GodotFlightDeck-Cursor at '
    + 'D:\\03_Godot\\04_Tools\\GodotFlightDeck-Cursor',
  );
}

const command = forwarded[0];
const commandArgs = forwarded.slice(1);
const args = launcher.endsWith('.mjs')
  ? [launcher, command, project, ...commandArgs]
  : [command, project, ...commandArgs];
const result = spawnSync(launcher.endsWith('.mjs') ? process.execPath : launcher, args, {
  cwd: root,
  env: {
    ...process.env,
    GDECK_CURSOR_COMPAT: process.env.GDECK_CURSOR_COMPAT ?? '1',
  },
  encoding: 'utf8',
  stdio: 'inherit',
  windowsHide: true,
  shell: launcher.endsWith('.cmd'),
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
