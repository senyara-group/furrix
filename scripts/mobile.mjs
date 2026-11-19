import { build, loadEnv } from 'vite';
import { spawnSync } from 'node:child_process';
import { validateMobileConfig } from './mobile-config.mjs';
const action = process.argv[2] ?? 'check';
if (!['check','build','android','ios'].includes(action)) throw Error('Action mobile inconnue.');
const env = { ...loadEnv('mobile', process.cwd(), 'VITE_'), ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('VITE_'))) };
console.log(JSON.stringify(validateMobileConfig(env)));
if (action !== 'check') {
  await build({ mode: 'mobile' });
  if (action !== 'build') {
    const result = spawnSync(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor','sync',action], {stdio:'inherit',windowsHide:true});
    if (result.error || result.status !== 0) process.exitCode = 1;
  }
}
