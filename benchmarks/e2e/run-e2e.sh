#!/bin/zsh
# BANC E2E — exécuteur commun aux DEUX outils : même app (même binaire), même
# flow (même sémantique), même appareil, même nombre d'exécutions, même mesure
# (horloge murale autour de l'invocation CLI = unité de coût réelle en CI).
export PATH="$HOME/.maestro/bin:/opt/homebrew/bin:$PATH"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME=$HOME/Library/Android/sdk
UDID=68B8F6A8-F2BC-42BC-9B7E-9431ABC82F77
export DETOX_IOS_APP=$(ls -d ~/Library/Developer/Xcode/DerivedData/e2ebench-*/Build/Products/Release-iphonesimulator/*.app 2>/dev/null | head -1)
TOOL=$1; PLAT=$2; N=${3:-20}
OUT=~/deribfy-bench/e2e/results/$TOOL-$PLAT.jsonl
LOGD=~/deribfy-bench/e2e/results/logs/$TOOL-$PLAT
mkdir -p ~/deribfy-bench/e2e/results $LOGD
: > $OUT
cd ~/deribfy-bench/e2e/app || exit 1
for i in $(seq 1 $N); do
  T0=$(python3 -c 'import time;print(int(time.time()*1000))')
  if [ "$TOOL" = "maestro" ]; then
    if [ "$PLAT" = "ios" ]; then DEV="$UDID"; else DEV="emulator-5554"; fi
    maestro --device $DEV test ~/deribfy-bench/e2e/maestro/flow-reference.yaml > $LOGD/run-$i.log 2>&1
    RC=$?
  else
    if [ "$PLAT" = "ios" ]; then CONF="ios.release"; else CONF="android.release"; fi
    npx detox test -c $CONF e2e/flow.test.js > $LOGD/run-$i.log 2>&1
    RC=$?
  fi
  T1=$(python3 -c 'import time;print(int(time.time()*1000))')
  OK=$([ $RC -eq 0 ] && echo true || echo false)
  echo "{\"tool\":\"$TOOL\",\"platform\":\"$PLAT\",\"run\":$i,\"ok\":$OK,\"wallMs\":$((T1-T0)),\"rc\":$RC}" >> $OUT
  printf "%s %s run %02d : %s (%d ms)\n" "$TOOL" "$PLAT" "$i" "$OK" "$((T1-T0))"
done
echo "TERMINE $TOOL $PLAT"
