@echo off
echo.
echo ========================================================
echo         Starting AWS Server Auto-Deploy Script
echo ========================================================
echo.

set "SSH_KEY=C:\Users\danbe\Documents\mp-key.pem"
set "SSH_USER=ubuntu"
set "SSH_HOST=13.211.128.167"
set "PROJECT_DIR=~/mp-stock-discovery"

echo [1/3] Connecting to AWS Server...
echo.

ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && echo '[2/3] Pulling latest code from Github...' && git reset --hard HEAD && git pull && echo '[3/3] Building React and restarting PM2 server...' && npm run build && pm2 restart all"

echo.
echo ========================================================
echo     Server deployment and restart completed successfully!
echo     Please refresh (F5) your browser window now.
echo ========================================================
echo.
pause
