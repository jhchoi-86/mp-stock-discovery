@echo off
echo ========================================================
echo         MP Stock Discovery Lite Deploy Script
echo ========================================================
echo.

set "SSH_KEY=C:\Users\danbe\Documents\mp-key.pem"
set "SSH_USER=ubuntu"
set "SSH_HOST=15.134.243.209"
set "PROJECT_DIR=~/mp-stock-discovery"

echo [1/4] Building React on Local Machine (Bypassing AWS RAM Limits)...
call npm run build

echo.
echo [2/4] Syncing latest Git codebase on AWS Server...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && git reset --hard HEAD && git clean -fd && git pull"

echo.
echo [3/4] Uploading compiled dist folder to AWS Server...
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no -r dist %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/

echo.
echo [4/4] Applying Permissions and Restarting PM2 Clusters...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && chmod -R 755 dist && pm2 restart all"

echo.
echo ========================================================
echo     [SUCCESS] Deployment completed successfully!
echo     Please refresh (F5) your browser window now.
echo     Access URL: http://mp-stock.duckdns.org
echo ========================================================
echo.
pause
