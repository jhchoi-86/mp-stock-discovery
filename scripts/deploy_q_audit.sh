#!/bin/bash
cd ~/mp-stock-discovery
echo "--- [Q1/Q2] AUDIT START ---"

echo "[Q1-1] ecosystem.config Content"
cat ecosystem.config.js 2>/dev/null || cat ecosystem.config.cjs 2>/dev/null
echo ""

echo "[Q1-2] System Environment Variables (Masked)"
env | grep -E "REDIS|JWT|TDR|TELEGRAM|KIS|DATABASE" | sed 's/=.*/=***/'
echo ""

echo "[Q1-3] /etc/environment (Masked)"
grep -E "^REDIS_URL|^JWT_SECRET|^TDR_SECRET|^TELEGRAM_TOKEN" /etc/environment 2>/dev/null | sed 's/=.*/=***/'
echo ""

echo "[Q1-4] RC Profiles (Masked)"
grep -E "REDIS_URL|JWT_SECRET|TDR_SECRET|TELEGRAM_TOKEN" ~/.bashrc ~/.profile ~/.bash_profile 2>/dev/null | sed 's/=.*/=***/'
echo ""

echo "[Q1-5] .env Key List (Masked)"
grep -E "^[A-Z_]+=." .env 2>/dev/null | sed 's/=.*/=***/' | sort
echo ""

echo "[Q2-1] Scheduler Files"
ls -la *scheduler* *Scheduler* 2>/dev/null
echo ""

echo "[Q2-2] sync-scheduler PPP Logic Check"
grep -n "ppp\|PPP\|cron\|schedule" sync_scheduler.cjs sync-scheduler.cjs 2>/dev/null | head -20
echo ""

echo "[Q2-3] Ecosystem Apps"
grep -A5 "name:" ecosystem.config.js 2>/dev/null || grep -A5 "name:" ecosystem.config.cjs 2>/dev/null
echo ""

echo "[Q2-4] ppp_scheduler.cjs Existence"
ls -la ppp_scheduler.cjs 2>/dev/null || echo "ppp_scheduler.cjs 없음"
echo "--- [Q1/Q2] AUDIT END ---"
