@echo off
setlocal
echo ========================================================
echo         MP Stock Discovery Lite Deploy Script (v2.0)
echo ========================================================
echo.

:: Use environment variables if set, otherwise fallback to defaults (DEPRECATED: Please set these in your system environment)
if "%MP_SSH_KEY%"=="" (set "SSH_KEY=C:\Users\danbe\Documents\mp-key.pem") else (set "SSH_KEY=%MP_SSH_KEY%")
if "%MP_SSH_USER%"=="" (set "SSH_USER=ubuntu") else (set "SSH_USER=%MP_SSH_USER%")
if "%MP_SSH_HOST%"=="" (set "SSH_HOST=15.134.243.209") else (set "SSH_HOST=%MP_SSH_HOST%")
set "PROJECT_DIR=~/mp-stock-discovery"

:: Record Deployment Start Time (Using PowerShell to fix Locale bugs)
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmm"') do set TIMESTAMP=%%i

echo [1/8] Updating Revision Number and Release History...
:: Auto-increment patch version (v9.4.x -> v9.4.x+1)
call npm version patch --no-git-tag-version
:: Sync version to RELEASE.md
node scripts/version_sync.cjs

echo [2/8] Building React on Local Machine (Bypassing AWS RAM Limits)...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] React build failed. Stopping deployment.
    exit /b 1
)

echo.
echo [2/8] Ensuring Server Permissions and Backing up dist...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && sudo chown -R %SSH_USER%:%SSH_USER% . && sudo chmod -R 755 . && (cp -R dist dist_backup_%TIMESTAMP% 2>/dev/null || echo No existing dist)"

echo.
echo [3/8] Syncing latest Git codebase on AWS Server (Safely checking for .git)...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && if [ -d .git ]; then git reset --hard HEAD && git clean -fd -e data/ && git pull; else echo '[SKIP] Not a git repository, skipping git sync.'; fi"

echo.
echo [4/8] Uploading compiled dist folder and backend scripts to AWS Server...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && (rm -rf dist 2>/dev/null || sudo rm -rf dist) && mkdir -p platform/approval/tdr_bridge/ platform/analysis/scoring/ src/services/ src/utils/ src/routes/ src/components/ prisma/ scripts/ sniper_engine/"
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no -r dist %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no analyzer.cjs %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no server.cjs %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no sniper_3m.cjs %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no -r src %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no -r platform %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no -r scripts %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no -r sniper_engine %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no prisma/schema.prisma %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/prisma/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no ecosystem.config.cjs %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no RELEASE.md %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no -r data/vip_logs %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/data/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no remove_test_db.cjs %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no remove_test_json.cjs %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no package.json %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no ROLLBACK.md %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Upload failed. Stopping deployment.
    exit /b 1
)

echo.
echo [5/8] Applying DB Schema, Syncing dist to /var/www, and Permissions (Zero Downtime)...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && npx prisma db push && node remove_test_db.cjs && node remove_test_json.cjs && node scripts/fix_dongkook_name.cjs && mkdir -p data/vip_logs && chmod -R 755 data && sudo mkdir -p /var/www/mp-stock-discovery && sudo rm -rf /var/www/mp-stock-discovery/dist && sudo cp -R dist /var/www/mp-stock-discovery/ && sudo chown -R ubuntu:ubuntu /var/www/mp-stock-discovery && sudo chmod 755 /home/ubuntu && chmod 755 . && chmod -R 755 dist && pm2 reload ecosystem.config.cjs --env production"

echo.
echo [6/8] Waiting for Health Check (10 seconds)...
powershell -nop -c "Start-Sleep -Seconds 10"

echo.
echo [7/8] Analyzing PM2 Zero-Downtime Health Check...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "curl -sf http://localhost:3001/api/health > /dev/null"
if %ERRORLEVEL% neq 0 (
    echo [FATAL ERROR] Health Check Failed! Initiating automatic rollback to previous version...
    ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && rm -rf dist && mv dist_backup_%TIMESTAMP% dist && pm2 reload ecosystem.config.cjs --env production"
    echo [ROLLBACK] Successfully rolled back to the previous stable version. Please fix the code and deploy again.
    exit /b 1
)

echo.
echo [8/8] Deployment Successful! Cleaning up old backup files (older than 7 days)...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "find %PROJECT_DIR% -maxdepth 1 -name 'dist_backup_*' -mtime +7 -exec rm -rf {} +"

echo.
echo ========================================================
echo     [SUCCESS] Deployment completed and Verified!
echo     Please refresh (F5) your browser window now.
echo     Access URL: https://mpstock.co.kr
echo ========================================================
echo.
endlocal
exit /b 0
