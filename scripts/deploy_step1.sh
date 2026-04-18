#!/bin/bash
cd ~/mp-stock-discovery
echo "--- STEP-01 ENRICHED REPORT ---"
echo "[1] VERSION"
grep '"version"' package.json
echo ""
echo "[2] GIT STATUS & LOG"
git status
git log --oneline -3
echo ""
echo "[3] PM2 PROCESSES"
pm2 list
echo ""
echo "[4] DISK SPACE"
df -h /
echo ""
echo "[5] DB SCHEMA CHECK"
psql $DATABASE_URL -c "\d ppp_watchlist" 2>/dev/null | grep -iE "g_sell|matched_tfs|tf_values|current_price|price_updated" || echo "COLUMNS MISSING - MIGRATION NEEDED"
echo ""
echo "[6] ENV VARS (KEYS ONLY)"
for key in DATABASE_URL REDIS_URL TELEGRAM_TOKEN TELEGRAM_CHAT_ID TDR_SECRET JWT_SECRET KIS_APP_KEY KIS_APP_SECRET; do
  in_file=$(grep -c "^${key}=" .env 2>/dev/null || echo 0)
  in_env=$(printenv | grep -c "^${key}=" || echo 0)
  echo "${key}: File=${in_file}, OS=${in_env}"
done
echo ""
echo "[7] NPM DEPENDENCY CHECK"
# Checking for changes in package.json compared to current HEAD
git diff HEAD origin/main package.json 2>/dev/null | grep "^+" || echo "No major dependency changes detected"
