@echo off
set "SSH_KEY=C:\Users\danbe\Documents\mp-key.pem"
set "SSH_USER=ubuntu"
set "SSH_HOST=15.134.243.209"
set "PROJECT_DIR=~/mp-stock-discovery"

echo [1/4] Building...
call npm run build
if %ERRORLEVEL% neq 0 exit /b 1

echo [2/4] Syncing Code using Git (Elevated)...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && sudo git fetch origin && (sudo git checkout feature/MP-TASK-2026-001 || sudo git checkout -b feature/MP-TASK-2026-001 origin/feature/MP-TASK-2026-001) && sudo git reset --hard origin/feature/MP-TASK-2026-001 && sudo git clean -fd && sudo chown -R ubuntu:ubuntu ."

echo [3/4] Compressing and Uploading dist...
if exist dist.tar.gz del dist.tar.gz
tar -czf dist.tar.gz dist
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no dist.tar.gz %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no data/stock_master.json %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/data/

ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && sudo rm -rf dist && sudo tar -xzf dist.tar.gz && sudo rm dist.tar.gz && sudo chmod -R 755 dist && sudo chown -R ubuntu:ubuntu dist && pm2 reload ecosystem.config.cjs --env production && pm2 logs --nostream --lines 15"

echo DONE.
