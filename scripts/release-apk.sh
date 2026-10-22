#!/usr/bin/env bash
# Сборка подписанного APK datalaw_recnik. Используется и локально (npm run android:release), и в GitHub Actions.
#
# Подпись — ПОСТОЯННАЯ (signing/datalaw_recnik.keystore лежит в репозитории, пароль публичный):
# все сборки подписаны одним ключом, поэтому Android ставит новую версию ПОВЕРХ старой,
# без удаления приложения и потери «Моих слов».
# Условие обновления: versionCode новой сборки больше, чем у установленной.
#   CI:        versionCode = номер запуска workflow (GITHUB_RUN_NUMBER)
#   локально:  задайте VERSION_CODE=<число больше уже установленного>
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
VERSION_CODE="${VERSION_CODE:-${GITHUB_RUN_NUMBER:-1}}"
KEYSTORE="${KEYSTORE:-signing/datalaw_recnik.keystore}"
KEY_ALIAS="${KEY_ALIAS:-datalaw_recnik}"
KEYSTORE_PASSWORD="${KEYSTORE_PASSWORD:-datalaw_recnik}"
KEY_PASSWORD="${KEY_PASSWORD:-$KEYSTORE_PASSWORD}"
OUT_DIR="${OUT_DIR:-release}"
OUT_APK="$OUT_DIR/datalaw_recnik-${VERSION}.apk"

echo "▶ datalaw_recnik ${VERSION} (versionCode ${VERSION_CODE})"


[ -d android ] || npx cap add android

npm run assets
npm run build
npx cap sync android
node scripts/android-patch.mjs

# versionCode / versionName
GRADLE=android/app/build.gradle
sed -i -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/" "$GRADLE"
sed -i -E "s/versionName \"[^\"]*\"/versionName \"${VERSION}\"/" "$GRADLE"
grep -nE "versionCode|versionName|applicationId" "$GRADLE"

(cd android && ./gradlew --no-daemon assembleRelease)

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$SDK" ] || { echo "✖ Не задан ANDROID_HOME" >&2; exit 1; }
BT=""
for d in $(ls "$SDK/build-tools" | grep -v -- '-' | sort -V -r); do
  if [ -x "$SDK/build-tools/$d/zipalign" ] && [ -x "$SDK/build-tools/$d/apksigner" ]; then BT="$SDK/build-tools/$d"; break; fi
done
[ -n "$BT" ] || { echo "✖ В $SDK/build-tools нет zipalign/apksigner" >&2; ls -la "$SDK/build-tools" >&2; exit 1; }
echo "▶ build-tools: $BT"

UNSIGNED="$(ls android/app/build/outputs/apk/release/*.apk 2>/dev/null | head -1 || true)"
[ -n "$UNSIGNED" ] || { echo "✖ Gradle не создал APK:" >&2; find android/app/build/outputs -type f >&2; exit 1; }
echo "▶ unsigned: $UNSIGNED"
[ -f "$KEYSTORE" ] || { echo "✖ Нет файла ключа $KEYSTORE" >&2; exit 1; }
mkdir -p "$OUT_DIR"
ALIGNED="$(mktemp -u).apk"
"$BT/zipalign" -p -f 4 "$UNSIGNED" "$ALIGNED"
"$BT/apksigner" sign \
  --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$KEYSTORE_PASSWORD" --key-pass "pass:$KEY_PASSWORD" \
  --out "$OUT_APK" "$ALIGNED"
rm -f "$ALIGNED"

"$BT/apksigner" verify --print-certs "$OUT_APK" | grep -E "Signer #1 certificate (DN|SHA-256)" || true
echo "✔ $OUT_APK"
