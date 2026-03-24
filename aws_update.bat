@echo off
setlocal
echo ========================================================
echo         MP Stock Discovery Lite Deploy Script (v2.0)
echo ========================================================
echo.

set "SSH_KEY=C:\Users\danbe\Documents\mp-key.pem"
set "SSH_USER=ubuntu"
set "SSH_HOST=15.134.243.209"
set "PROJECT_DIR=~/mp-stock-discovery"

:: Record Deployment Start Time (Using PowerShell to fix Locale bugs)
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmm"') do set TIMESTAMP=%%i

echo [1/8] Building React on Local Machine (Bypassing AWS RAM Limits)...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] React build failed. Stopping deployment.
    exit /b 1
)

echo.
echo [2/8] Backing up original dist folder on AWS Server...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && cp -R dist dist_backup_%TIMESTAMP% 2>/dev/null || echo No existing dist"

echo.
echo [3/8] Syncing latest Git codebase on AWS Server...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && git reset --hard HEAD && git clean -fd && git pull"

echo.
echo [4/8] Uploading compiled dist folder to AWS Server...
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no -r dist %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Upload failed. Stopping deployment.
    exit /b 1
)

echo.
echo [5/8] Applying Permissions and Reloading PM2 Clusters (Zero Downtime)...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cd %PROJECT_DIR% && chmod -R 755 dist && pm2 reload ecosystem.config.cjs --env production"

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
pause
