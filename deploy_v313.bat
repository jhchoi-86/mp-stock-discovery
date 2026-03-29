@echo off
set "SSH_KEY=C:\Users\danbe\Documents\mp-key.pem"
set "SSH_USER=ubuntu"
set "SSH_HOST=15.134.243.209"
set "PROJECT_DIR=~/mp-stock-discovery"

echo [1/4] Building...
call npm run build
if %ERRORLEVEL% neq 0 exit /b 1

echo [2/4] Pulling latest...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && git reset --hard HEAD && git pull"

echo [3/4] Compressing and Uploading...
if exist deploy.tar.gz del deploy.tar.gz
tar -czf deploy.tar.gz dist src platform sniper_engine server.cjs analyzer.cjs ecosystem.config.cjs
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no deploy.tar.gz %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no data/stock_master.json %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/data/

echo [4/4] Extracting and Reloading...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && tar -xzf deploy.tar.gz && rm deploy.tar.gz && chmod -R 755 dist && pm2 reload ecosystem.config.cjs --env production"

echo DONE.
