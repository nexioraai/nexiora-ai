#!/bin/zsh
# V4 B-NAV — critère 5 : comportement back RÉEL sur device.
# Usage : ./v4-device.sh <candidat> <app_id>
#   candidat ∈ {rn-nav, router-nav} ; app_id = package/bundle id.
# Android : bouton système back (android-back.yaml) sur emulator-5554.
# iOS : bouton retour d'en-tête (ios-back.yaml) sur le simulateur démarré.
# Journal : results/v4-device-<candidat>.log (verdicts PASS/FAIL Maestro).
set -u
export JAVA_HOME="$HOME/jdk21/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
HERE="$(cd "$(dirname "$0")" && pwd)"
MAESTRO="$HOME/.maestro/bin/maestro"
CAND="$1"; APP_ID="$2"
LOG="$HERE/results/v4-device-$CAND.log"
mkdir -p "$HERE/results"
: > "$LOG"

echo "=== $CAND Android (back système) ===" | tee -a "$LOG"
"$MAESTRO" --device emulator-5554 test -e APP_ID="$APP_ID" \
  "$HERE/maestro/android-back.yaml" 2>&1 | tail -8 | tee -a "$LOG"
echo "ANDROID_FLOW_EXIT=${pipestatus[1]}" | tee -a "$LOG"

IOS_UDID=$(xcrun simctl list devices | grep Booted | head -1 | grep -oE '[0-9A-F-]{36}')
echo "=== $CAND iOS (back en-tête, sim $IOS_UDID) ===" | tee -a "$LOG"
"$MAESTRO" --device "$IOS_UDID" test -e APP_ID="$APP_ID" \
  "$HERE/maestro/ios-back.yaml" 2>&1 | tail -8 | tee -a "$LOG"
echo "IOS_FLOW_EXIT=${pipestatus[1]}" | tee -a "$LOG"
