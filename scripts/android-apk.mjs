import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { androidEnvironment } from "./android-environment.mjs";
let firebase;
try {
  firebase = JSON.parse(
    readFileSync("android/app/google-services.json", "utf8"),
  );
} catch {
  throw Error("Ajoute le fichier Firebase Android local avant de compiler.");
}
if (
  firebase.project_info?.project_id !== "furrix-8dd6e" ||
  !firebase.client?.some(
    (c) => c.client_info?.android_client_info?.package_name === "fr.furrix.app",
  )
)
  throw Error("Le fichier Firebase doit cibler Furrix Android.");
const tools = androidEnvironment();
if (!tools.ready)
  throw Error(
    "Installe Android Studio, son JDK 21 et le SDK 36, puis relance npm run android:apk.",
  );
const prepare = spawnSync(process.execPath, ["scripts/mobile.mjs", "android"], {
  stdio: "inherit",
  env: tools.env,
  windowsHide: true,
});
if (prepare.error || prepare.status !== 0) process.exit(1);
const win = process.platform === "win32";
const result = spawnSync(
  win ? "cmd.exe" : "./gradlew",
  win ? ["/d", "/c", "gradlew.bat", "assembleDebug"] : ["assembleDebug"],
  { cwd: "android", stdio: "inherit", env: tools.env, windowsHide: true },
);
if (result.error || result.status !== 0) process.exit(1);
console.log("APK de test : android/app/build/outputs/apk/debug/app-debug.apk");
