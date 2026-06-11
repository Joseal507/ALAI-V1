#!/bin/zsh
cd /Users/joseal/AdvanceLogicStudios/alai-brain || exit 1

export ALAI_SESSION_MINUTES=45
export ALAI_SLEEP_SECONDS=120
export ALAI_MAX_CYCLES=999

caffeinate -dimsu &
CAFFEINATE_PID=$!

echo "ALAI Hybrid Night Learning started."
echo "caffeinate PID: $CAFFEINATE_PID"
echo "Press CTRL+C to stop."

cleanup() {
  echo "Stopping caffeinate..."
  kill $CAFFEINATE_PID 2>/dev/null || true
}
trap cleanup EXIT

while true
do
  echo ""
  echo "======================================"
  date
  echo "ALAI HYBRID NIGHT CYCLE START"
  echo "======================================"

  npm run alai:objective-3-final-audit || true
  npm run alai:safe-night-autonomy || true
  npm run alai:cognitive-cycle || true
  npm run alai:research-v2 || true
  npm run alai:autonomous-research || true
  npm run alai:knowledge-expand || true
  npm run alai:evidence-backfill || true
  npm run alai:core-relations || true
  npm run alai:graph-density || true
  npm run alai:validation-accelerator || true
  npm run alai:reasoning-exam || true
  npm run alai:grounded-exam || true
  npm run alai:autonomous-exam || true
  npm run alai:competency || true
  npm run alai:repair-competency-status || true
  npm run alai:sync-competency || true
  npm run alai:strict-mastery || true
  npm run alai:promotion-v5 || true
  npm run alai:canonical-alias-resolver || true
  npm run alai:question-concept-cleaner || true
  npm run alai:quality-flag-cleaner || true
  npm run alai:real-rating || true
  npm run model:health || true

  echo ""
  echo "ALAI HYBRID NIGHT CYCLE COMPLETE"
  echo "SLEEPING 120 SECONDS"
  echo ""

  sleep 120
done
