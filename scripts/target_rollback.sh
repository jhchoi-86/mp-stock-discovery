#!/bin/bash
# [ROLLBACK] v1.3 (PostgreSQL/RDS Optimized)
echo "========================================================"
echo "      MP Stock Discovery - EMERGENCY ROLLBACK           "
echo "========================================================"
echo "[1/3] Restoring Source Code Constants..."

# Restore officialData.js from the latest backup
BACKUP_DIR="~/mp-stock-discovery/backups"
LATEST_JS_BAK=$(ls -t $BACKUP_DIR/officialData.js.bak.* 2>/dev/null | head -1)
if [ ! -z "$LATEST_JS_BAK" ]; then
    cp "$LATEST_JS_BAK" src/constants/officialData.js
    echo "  - officialData.js restored from $LATEST_JS_BAK"
else
    echo "  - [WARN] No officialData.js backup found."
fi

# Restore telegramBot.cjs
LATEST_BOT_BAK=$(ls -t $BACKUP_DIR/telegram_bot.cjs.bak.* 2>/dev/null | head -1)
if [ ! -z "$LATEST_BOT_BAK" ]; then
    cp "$LATEST_BOT_BAK" telegramBot.cjs
    echo "  - telegramBot.cjs restored from $LATEST_BOT_BAK"
fi

echo "[2/3] Verifying Database Backup Integrity..."
LATEST_DB_BAK=$(ls -t backup_dailyStockSnapshot_*.json 2>/dev/null | head -1)
if [ ! -z "$LATEST_DB_BAK" ]; then
    echo "  - Found RDS JSON backup: $LATEST_DB_BAK"
    echo "  - [NOTE] If DB schema migration failed, please use 'npx prisma db push' to revert or manually fix columns."
else
    echo "  - [CRITICAL] No DB backup found! Manual recovery required."
fi

echo "[3/3] Restarting Integrated Services..."
pm2 start 0
echo "========================================================"
echo "    [COMPLETE] Rollback finished. Please check logs.     "
echo "========================================================"
