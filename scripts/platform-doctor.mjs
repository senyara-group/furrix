import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

// Diagnostic local seulement. Ne lit ni clés, ni .env, ni comptes de signature.
const command = (name, args) => {
  const result = spawnSync(name, args, { encoding: 'utf8', windowsHide: true });
  return !result.error && result.status === 0;
};
const os = platform();
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  || (os === 'win32' ? join(homedir(), 'AppData', 'Local', 'Android', 'Sdk')
    : os === 'darwin' ? join(homedir(), 'Library', 'Android', 'sdk') : join(homedir(), 'Android', 'Sdk'));
const androidJava = os === 'win32' && existsSync('C:/Program Files/Android/Android Studio/jbr/bin/java.exe');
const java = command('java', ['-version']) || Boolean(androidJava);
const report = {
  node: process.versions.node,
  nodeCompatible: Number(process.versions.node.split('.')[0]) >= 22,
  systeme: os,
  capacitor: JSON.parse(readFileSync('node_modules/@capacitor/core/package.json', 'utf8')).version,
  projetsGeneres: { android: existsSync('android/app/build.gradle'), ios: existsSync('ios/App/App.xcodeproj') },
  android: { java, sdk: existsSync(sdk), plateformes: existsSync(join(sdk, 'platforms')), compilationExecutee: false },
  ios: { macOS: os === 'darwin', xcode: os === 'darwin' && command('xcodebuild', ['-version']), compilationExecutee: false },
};
console.log(JSON.stringify(report, null, 2));
console.log('\nLa présence des outils ne prouve pas la compilation, la signature ni le fonctionnement sur appareil.');
if (process.argv.includes('--require-android') && (!java || !report.android.plateformes)) process.exitCode = 1;
if (process.argv.includes('--require-ios') && (!report.ios.macOS || !report.ios.xcode)) process.exitCode = 1;
