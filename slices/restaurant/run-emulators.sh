#!/bin/zsh
# 8.A2 — Validation du SLICE sur émulateurs iOS ET Android (Étape A, 0 $).
# Build dev depuis l'artefact du slice (rootHash 343a94d9…), installation,
# puis flows E2E GÉNÉRÉS DEPUIS L'AIR (Oracle L2) sur les 2 plateformes.
set -u
export JAVA_HOME="$HOME/jdk21/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="/opt/homebrew/bin:$JAVA_HOME/bin:$PATH"
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/app"
RES="$HERE/results"
mkdir -p "$RES"
cd "$APP" || exit 1
npm ci --ignore-scripts --no-audit --no-fund > "$RES/emul-npmci.log" 2>&1
echo "npm ci: $?"
npx expo prebuild --no-install > "$RES/emul-prebuild.log" 2>&1
echo "prebuild: $?"
echo "cmake.dir=$ANDROID_HOME/cmake/3.31.6" >> android/local.properties
(cd ios && pod install > "$RES/emul-pod.log" 2>&1); echo "pod: $?"
npx expo run:android --variant release --no-bundler > "$RES/emul-android-build.log" 2>&1 &
A=$!
npx expo run:ios --configuration Release --no-bundler > "$RES/emul-ios-build.log" 2>&1 &
I=$!
wait $A; echo "ANDROID_BUILD=$?"
wait $I; echo "IOS_BUILD=$?"
