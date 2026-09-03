#!/bin/zsh
# Mesures restantes du protocole : (1) le flow passe-t-il SANS MODIFICATION en
# mode RTL ? (2) qualité du diagnostic d'échec (assertion volontairement fausse).
while ! grep -q "CHAINE E2E TERMINEE" /tmp/chain-e2e.log 2>/dev/null; do sleep 15; done
export PATH="$HOME/.maestro/bin:/opt/homebrew/bin:$PATH"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME=$HOME/Library/Android/sdk
export DETOX_IOS_APP=$(ls -d ~/Library/Developer/Xcode/DerivedData/e2ebench-*/Build/Products/Release-iphonesimulator/*.app | head -1)
UDID=68B8F6A8-F2BC-42BC-9B7E-9431ABC82F77
BID=com.deribfy.bench.e2e
R=~/deribfy-bench/e2e/results
mkdir -p $R/rtl $R/failure
cd ~/deribfy-bench/e2e/app || exit 1

echo "===== (1) BASCULE RTL via l'app (iOS) ====="
maestro --device $UDID test -e APP_ID=$BID ~/deribfy-bench/rtl/rtl-flow.yaml > $R/rtl/bascule-ios.log 2>&1 && echo "bascule RTL iOS OK" || echo "bascule RTL iOS ECHEC"
sleep 26
xcrun simctl io $UDID screenshot $R/rtl/ios-rtl.png >/dev/null 2>&1 && echo "capture RTL iOS OK"
xcrun simctl terminate $UDID $BID 2>/dev/null
echo "--- Maestro, MEME flow, app en RTL ---"
maestro --device $UDID test ~/deribfy-bench/e2e/maestro/flow-reference.yaml > $R/rtl/maestro-ios-rtl.log 2>&1 && echo "MAESTRO iOS RTL : PASS" || echo "MAESTRO iOS RTL : FAIL"
echo "--- Detox, MEME test, app en RTL ---"
npx detox test -c ios.release e2e/flow.test.js > $R/rtl/detox-ios-rtl.log 2>&1 && echo "DETOX iOS RTL : PASS" || echo "DETOX iOS RTL : FAIL"
echo "--- retour LTR ---"
maestro --device $UDID test -e APP_ID=$BID ~/deribfy-bench/rtl/rtl-flow.yaml > $R/rtl/retour-ltr-ios.log 2>&1 && echo "retour LTR iOS OK"
xcrun simctl terminate $UDID $BID 2>/dev/null

echo "===== (2) DIAGNOSTIC D'ECHEC ====="
echo "--- Maestro iOS ---"
maestro --device $UDID test ~/deribfy-bench/e2e/maestro/failure-probe.yaml > $R/failure/maestro-ios.log 2>&1; echo "rc=$?"
echo "--- Detox iOS ---"
npx detox test -c ios.release e2e/failure.test.js > $R/failure/detox-ios.log 2>&1; echo "rc=$?"
echo "--- Maestro Android ---"
maestro --device emulator-5554 test ~/deribfy-bench/e2e/maestro/failure-probe.yaml > $R/failure/maestro-android.log 2>&1; echo "rc=$?"
echo "--- Detox Android ---"
npx detox test -c android.release e2e/failure.test.js > $R/failure/detox-android.log 2>&1; echo "rc=$?"
echo "MESURES COMPLEMENTAIRES TERMINEES"
