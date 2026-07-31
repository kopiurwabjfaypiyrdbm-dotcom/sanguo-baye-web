import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDirectory = path.join(root, 'android');
const isWindows = process.platform === 'win32';
const javaHome = findCompatibleJavaHome();
const environment = { ...process.env, JAVA_HOME: javaHome };
environment.Path = `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.Path ?? ''}`;
const command = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : './gradlew';
const args = isWindows
  ? ['/d', '/s', '/c', 'gradlew.bat', 'assembleDebug']
  : ['assembleDebug'];

console.log(`Android build JDK: ${javaHome}`);

const child = spawn(command, args, {
  cwd: androidDirectory,
  env: environment,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Unable to start Gradle: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  if (code === 0) {
    console.log('Debug APK: android/app/build/outputs/apk/debug/app-debug.apk');
  }
  process.exitCode = code ?? 1;
});

function findCompatibleJavaHome() {
  const candidates = [
    process.env.ANDROID_STUDIO_JBR,
    isWindows && process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, 'Android', 'Android Studio', 'jbr')
      : undefined,
    isWindows
      ? path.join(path.parse(root).root, 'Program Files', 'Android', 'Android Studio', 'jbr')
      : undefined,
    process.platform === 'darwin'
      ? '/Applications/Android Studio.app/Contents/jbr/Contents/Home'
      : undefined,
    process.platform === 'linux' ? '/opt/android-studio/jbr' : undefined,
    process.env.JAVA_HOME,
  ].filter(Boolean);

  const javaExecutable = isWindows ? 'java.exe' : 'java';
  const found = candidates.find((candidate) => {
    const executable = path.join(candidate, 'bin', javaExecutable);
    if (!existsSync(executable)) return false;
    const version = spawnSync(executable, ['-version'], { encoding: 'utf8' });
    const output = `${version.stdout ?? ''}\n${version.stderr ?? ''}`;
    const major = Number(output.match(/version "(?:1\.)?(\d+)/)?.[1] ?? 0);
    return major >= 21;
  });
  if (found) return found;

  throw new Error(
    'Android build requires JDK 21 or newer. Install Android Studio or set ANDROID_STUDIO_JBR/JAVA_HOME.',
  );
}
