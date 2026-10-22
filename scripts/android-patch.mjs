#!/usr/bin/env node
// Донастройка сгенерированного проекта android/ (идемпотентно, запускается после `cap add` / `cap sync`):
//   - нативный плагин озвучки RecnikSpeech + MainActivity, который его регистрирует
//   - <queries> для TTS: без него Android 11+ скрывает движки синтеза речи («синтез не установлен»)
//   - allowBackup=false, портретная ориентация
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "android", "app");
const log = (...a) => console.log("[android-patch]", ...a);
if (!fs.existsSync(appDir)) {
  console.error("android/ не найден — сначала `npx cap add android`.");
  process.exit(1);
}

const cfgSrc = fs.readFileSync(path.join(root, "capacitor.config.ts"), "utf8");
const PKG = /appId:\s*['"]([^'"]+)['"]/.exec(cfgSrc)?.[1];
if (!PKG) {
  console.error("Не нашёл appId в capacitor.config.ts");
  process.exit(1);
}

// 1. Java
const javaDir = path.join(appDir, "src", "main", "java", ...PKG.split("."));
fs.mkdirSync(javaDir, { recursive: true });
for (const f of ["MainActivity", "RecnikSpeechPlugin"]) {
  const src = fs.readFileSync(path.join(root, "scripts", "android", `${f}.java`), "utf8").replaceAll("__PKG__", PKG);
  fs.writeFileSync(path.join(javaDir, `${f}.java`), src);
}
log("нативные классы установлены в", path.relative(root, javaDir));

// 2. Манифест
const mp = path.join(appDir, "src", "main", "AndroidManifest.xml");
let m = fs.readFileSync(mp, "utf8");
if (!m.includes("android.intent.action.TTS_SERVICE")) {
  m = m.replace(
    "<application",
    `<queries>
        <intent>
            <action android:name="android.intent.action.TTS_SERVICE" />
        </intent>
    </queries>

    <application`
  );
}
m = m.replace('android:allowBackup="true"', 'android:allowBackup="false"');
if (!m.includes("android:screenOrientation")) {
  m = m.replace("<activity", '<activity\n            android:screenOrientation="portrait"');
}
fs.writeFileSync(mp, m);
if (!m.includes("TTS_SERVICE")) {
  console.error("Не удалось добавить <queries> в манифест");
  process.exit(1);
}
log("манифест: <queries> TTS_SERVICE, allowBackup=false, portrait");
