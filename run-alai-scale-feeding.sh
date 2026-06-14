#!/bin/zsh

cd /Users/joseal/AdvanceLogicStudios/alai-brain || exit 1

mkdir -p logs/scale-feeding locks

if [ -f locks/alai-scale-feeding.pid ]; then
  OLD_PID=$(cat locks/alai-scale-feeding.pid)
  if ps -p "$OLD_PID" > /dev/null 2>&1; then
    echo "ALAI scale feeding already running with PID $OLD_PID"
    exit 0
  fi
fi

echo $$ > locks/alai-scale-feeding.pid

caffeinate -dimsu bash -c '
while true
do
  echo ""
  echo "======================================"
  date
  echo "ALAI SAFE SCALE FEEDING GOVERNED LOOP"
  echo "NO DUPLICATES / NO INLINE PROCESS EXPLOSION"
  echo "======================================"

  npm run alai:safe-scale-cycle || true

  echo ""
  echo "CYCLE COMPLETE. SLEEPING 120 SECONDS."
  echo ""

  sleep 120
done
'
