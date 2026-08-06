import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = resolve(root, 'godot');
// The 4.7.1 console launcher can crash in Windows headless startup while the
// paired engine binary is stable. Both report the same official engine build.
const exactEngine = 'D:\\03_Godot\\01_Engine\\Godot_v4.7.1-stable_win64.exe';
const engine = process.env.GODOT_BIN || (existsSync(exactEngine) ? exactEngine : 'godot');
const runtime = resolve(project, '.godot/runtime');
const paths = {
  appData: resolve(runtime, 'appdata'),
  localAppData: resolve(runtime, 'localappdata'),
  xdgConfig: resolve(runtime, 'xdg-config'),
  xdgCache: resolve(runtime, 'xdg-cache'),
  xdgData: resolve(runtime, 'xdg-data'),
};
for (const path of Object.values(paths)) mkdirSync(path, { recursive: true });
const env = {
  ...process.env,
  APPDATA: paths.appData,
  LOCALAPPDATA: paths.localAppData,
  XDG_CONFIG_HOME: paths.xdgConfig,
  XDG_CACHE_HOME: paths.xdgCache,
  XDG_DATA_HOME: paths.xdgData,
};

const version = run(['--version'], 'engine version');
const versionText = String(version.stdout ?? '').trim();
if (!/^4\.7\.1(?:\.|$)/u.test(versionText)) throw new Error(`Godot 4.7.1 is required: ${versionText}`);
process.stdout.write(`[Godot project verification] engine=${versionText}\n`);

run(['--headless', '--path', project, '--script', 'res://tests/run_all.gd'], 'domain/spike suite');
run(['--headless', '--path', project, '--script', 'res://tests/presentation_input_smoke.gd'], 'presentation/input suite');
run(['--headless', '--path', project, '--editor', '--quit'], 'editor import', 180_000);
run(['--headless', '--path', project, '--quit-after', '3'], 'main scene startup', 180_000);
process.stdout.write('[Godot project verification] PASSED domain, presentation, import and main scene\n');

function run(args, label, timeout = 120_000) {
  const result = spawnSync(engine, args, { cwd: root, env, encoding: 'utf8', timeout });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`${label} failed: ${result.error?.message ?? result.signal ?? result.status}`);
  }
  return result;
}
