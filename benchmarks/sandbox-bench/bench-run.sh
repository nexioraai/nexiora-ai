#!/bin/zsh
# Lance les deux bancs providers en parallèle (arrière-plan), journaux
# incrémentaux. Usage : ./bench-run.sh
set -u
cd "$(dirname "$0")"
node bench-e2b.mjs > results/e2b-live.log 2>&1 &
E2B_PID=$!
node bench-modal.mjs > results/modal-live.log 2>&1 &
MODAL_PID=$!
wait $E2B_PID; echo "E2B_EXIT=$?"
wait $MODAL_PID; echo "MODAL_EXIT=$?"
