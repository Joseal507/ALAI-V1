#!/bin/zsh

cd /Users/joseal/AdvanceLogicStudios/alai-brain || exit 1
mkdir -p logs/scale-feeding

caffeinate -dimsu bash -c '
while true
do
  echo ""
  echo "======================================"
  date
  echo "ALAI SCALE FEEDING + SAFE QUESTION ROUTER"
  echo "======================================"

  npm run alai:v19-regression || true
  npm run alai:v17-regression || true
  npm run alai:v16-core || true
  npm run alai:v12-bridges || true
  npm run alai:research-executor || true
  npm run alai:research-auto-closer || true
  npm run alai:research-gap-closer || true
  npm run alai:cognitive-debt-governor || true
  npm run alai:pending-promotion-v2 || true
  npm run alai:belief-system || true
  npm run alai:belief-revision || true
  npm run alai:episodic-experience || true
  npm run alai:semantic-relation-grounding-v2 || true
  npm run alai:relation-court || true
  npm run alai:trace-court || true
  npm run alai:path-quality || true
  npm run alai:final-scale-readiness || true
  npm run model:health || true

  echo "CYCLE COMPLETE. SLEEPING 120 SECONDS."
  sleep 120
done
'
