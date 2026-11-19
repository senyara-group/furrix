import { androidEnvironment } from './android-environment.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { platform } from 'node:os';
import { join } from 'node:path';

// Diagnostic local seulement. Ne lit ni clés, ni .env, ni comptes de signature.
const command = (name, args) => {
  const result = spawnSync(name, args, { encoding: 'utf8', windowsHide: true });
  return !result.error && result.status === 0;
};
const os = platform();
const toolchain = androidEnvironment();
const java = toolchain.javaMajor !== null;
const report = {
  node: process.versions.node,
  nodeCompatible: Number(process.versions.node.split('.')[0]) >= 22,
  systeme: os,
  capacitor: JSON.parse(readFileSync('node_modules/@capacitor/core/package.json', 'utf8')).version,
  projetsGeneres: { android: existsSync('android/app/build.gradle'), ios: existsSync('ios/App/App.xcodeproj') },
  android: { java, javaMajor: toolchain.javaMajor, java21: toolchain.javaMajor === 21, sdk: existsSync(toolchain.sdk), sdk36: toolchain.sdk36, plateformes: existsSync(join(toolchain.sdk, 'platforms')), compilationExecutee: false },
  ios: { macOS: os === 'darwin', xcode: os === 'darwin' && command('xcodebuild', ['-version']), compilationExecutee: false },
};
console.log(JSON.stringify(report, null, 2));
console.log('\nLa présence des outils ne prouve pas la compilation, la signature ni le fonctionnement sur appareil.');
if (process.argv.includes('--require-android') && !toolchain.ready) process.exitCode = 1;
if (process.argv.includes('--require-ios') && (!report.ios.macOS || !report.ios.xcode)) process.exitCode = 1;
