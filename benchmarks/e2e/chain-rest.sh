#!/bin/zsh
# Chaîne : fin campagne Maestro iOS -> Detox iOS -> build Android -> campagnes Android.
while ! grep -q "TERMINE maestro ios" /tmp/campagne-maestro-ios.log 2>/dev/null; do sleep 15; done
echo "### ETAPE 1/4 : Maestro iOS terminé"
zsh ~/deribfy-bench/e2e/run-e2e.sh detox ios 20 > /tmp/campagne-detox-ios.log 2>&1
echo "### ETAPE 2/4 : Detox iOS terminé"
export PATH="/opt/homebrew/bin:$PATH"
export ANDROID_HOME=$HOME/Library/Android/sdk
export JAVA_HOME="$HOME/jdk21/Contents/Home"
cd ~/deribfy-bench/e2e/app || exit 1
grep -q "cmake.dir" android/local.properties 2>/dev/null || echo "cmake.dir=$HOME/Library/Android/sdk/cmake/3.31.6" >> android/local.properties
find android -name .cxx -type d -exec rm -rf {} + 2>/dev/null
npx expo run:android --variant release --no-bundler > build-android.log 2>&1
if [ ! -f android/app/build/outputs/apk/release/app-release.apk ]; then
  echo "### BLOCAGE : APK release absent"; grep -A4 -m1 "What went wrong" build-android.log; exit 1
fi
echo "### APK release OK"
(cd android && ./gradlew assembleReleaseAndroidTest -DtestBuildType=release > ../build-androidtest.log 2>&1)
if [ ! -f android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk ]; then
  echo "### BLOCAGE : APK androidTest absent (Detox Android)"; grep -A6 -m1 "What went wrong" build-androidtest.log
else
  echo "### ETAPE 3/4 : APK androidTest OK"
fi
zsh ~/deribfy-bench/e2e/run-e2e.sh maestro android 20 > /tmp/campagne-maestro-android.log 2>&1
echo "### Maestro Android terminé"
zsh ~/deribfy-bench/e2e/run-e2e.sh detox android 20 > /tmp/campagne-detox-android.log 2>&1
echo "### ETAPE 4/4 : Detox Android terminé"
echo "### CHAINE E2E TERMINEE"
