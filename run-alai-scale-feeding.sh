#!/bin/zsh

cd /Users/joseal/AdvanceLogicStudios/alai-brain || exit 1

mkdir -p logs/scale-feeding

echo "======================================"
echo "ALAI SCALE FEEDING MODE STARTED"
date
echo "======================================"

caffeinate -dimsu bash -c '
while true
do
  echo ""
  echo "======================================"
  date
  echo "ALAI LEARNING LIKE CRAZY - SAFE LOOP"
  echo "======================================"

  npm run alai:scale-learning-loop || true

  echo ""
  echo "CYCLE COMPLETE. SLEEPING 120 SECONDS."
  echo ""

  sleep 120
done
'
