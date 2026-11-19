import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';
/** Meme diagnostic et meme environnement pour le controle puis Gradle. */
export function androidEnvironment() {
  const win = platform() === 'win32';
  const bundled = win ? 'C:/Program Files/Android/Android Studio/jbr' : '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  const localRoot = resolve('.mobile-tools/java21');
  const localName = existsSync(localRoot) ? readdirSync(localRoot).find(name => existsSync(join(localRoot,name,'bin',win?'java.exe':'java'))) : undefined;
  const localJava = localName ? join(localRoot, localName) : undefined;
  const javaHome = process.env.JAVA_HOME || localJava || (existsSync(bundled) ? bundled : undefined);
  const env = {...process.env,...(javaHome ? { JAVA_HOME:javaHome } : {})};
  const executable = javaHome ? join(javaHome,'bin',win?'java.exe':'java') : 'java';
  const probe = spawnSync(executable,['-version'],{encoding:'utf8',windowsHide:true});
  const match = (probe.stderr ?? '').match(/version "(\d+)/);
  const javaMajor = probe.status === 0 && match ? Number(match[1]) : null;
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || (win ? join(homedir(),'AppData','Local','Android','Sdk') : platform()==='darwin' ? join(homedir(),'Library','Android','sdk') : join(homedir(),'Android','Sdk'));
  env.ANDROID_HOME = sdk;
  return { env, javaMajor, sdk, sdk36:existsSync(join(sdk,'platforms','android-36','android.jar')), ready:javaMajor === 21 && existsSync(join(sdk,'platforms','android-36','android.jar')) };
}
