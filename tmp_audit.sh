#!/bin/bash
echo "=== Red Team Audit Script ==="

echo -e "\n[1] Checking PM2 Worker limits (ulimit -n)"
PID=$(pgrep -f 'server.cjs' | head -n 1)
if [ -z "$PID" ]; then
    PID=$(ps aux | grep 'node' | grep 'mp-stock-discovery' | awk '{print $2}' | head -n 1)
fi

if [ -n "$PID" ]; then
    echo "PM2 Worker PID: $PID"
    cat /proc/$PID/limits | grep 'Max open files'
else
    echo "Failed to find PM2 process"
fi

echo -e "\n[2] Testing Caching Glitch (HTTP GET /api/signals)"
echo "Sending rapid bursts to test caching..."
for i in {1..3}; do
    curl -s -w "Time: %{time_total}s\\n" http://127.0.0.1:3001/api/signals | head -c 50
    echo ""
done

echo -e "\n[3] Checking Mutex/Auth Protection (HTTP POST /api/auto-sync)"
echo "From Localhost (Should Pass):"
curl -s -X POST http://127.0.0.1:3001/api/auto-sync -H "Content-Type: application/json" -d '{"timeframe":"1D"}' | grep -o "error" || echo "Pass - Handled properly"
echo -e "\nAudit Complete."
