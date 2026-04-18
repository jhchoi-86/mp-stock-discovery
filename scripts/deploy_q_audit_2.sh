#!/bin/bash
cd ~/mp-stock-discovery
echo "--- [Q1/Q2 ADDITIONAL] AUDIT START ---"

echo "[ADD-1] TDR/JWT Keys in .env"
grep -E "^TDR|^JWT|^tdr|^jwt" .env 2>/dev/null | sed 's/=.*/=***/'
echo ""

echo "[ADD-2] ecosystem.config.cjs Apps"
grep -A10 "apps:\|name:\|script:" ecosystem.config.cjs 2>/dev/null | head -60
echo ""

echo "[ADD-3] PM2 Process Names"
pm2 list --no-color | grep -E "online|stopped|error"
echo "--- [Q1/Q2 ADDITIONAL] AUDIT END ---"
