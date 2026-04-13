@echo off
setlocal
echo ========================================================
echo       MP Stock Discovery Hotfix Deploy Script (v9.3.3)
echo ========================================================
echo.

:: SSH Configuration
if "%MP_SSH_KEY%"=="" (set "SSH_KEY=C:\Users\danbe\Documents\mp-key.pem") else (set "SSH_KEY=%MP_SSH_KEY%")
if "%MP_SSH_USER%"=="" (set "SSH_USER=ubuntu") else (set "SSH_USER=%MP_SSH_USER%")
if "%MP_SSH_HOST%"=="" (set "SSH_HOST=15.134.243.209") else (set "SSH_HOST=%MP_SSH_HOST%")
set "PROJECT_DIR=~/mp-stock-discovery"

echo [1/5] Building Frontend (Modified UI)...
:: Built locally to ensure correctness
echo [Local Build Complete]

echo.
echo [2/5] Uploading modified files...
:: Ensure permissions first
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "sudo chown -R %SSH_USER%:%SSH_USER% %PROJECT_DIR% && sudo chmod -R 755 %PROJECT_DIR%"
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no analyzer.cjs %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no server.cjs %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no RELEASE.md %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no package.json %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/

:: Upload specific src folders modified in v9.3.3
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "mkdir -p %PROJECT_DIR%/src/routes %PROJECT_DIR%/src/utils"
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no src/routes/admin.cjs %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/src/routes/
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no src/utils/kisCache.cjs %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/src/utils/

echo.
echo [3/5] Syncing dist folder (Selective Sync)...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "rm -rf %PROJECT_DIR%/dist_prev 2>/dev/null && mv %PROJECT_DIR%/dist %PROJECT_DIR%/dist_prev 2>/dev/null"
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no -r dist %SSH_USER%@%SSH_HOST%:%PROJECT_DIR%/

echo.
echo [4/5] Reloading PM2 and Updating Nginx Path...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "sudo cp -R %PROJECT_DIR%/dist/* /var/www/mp-stock-discovery/dist/ && pm2 reload mp-stock-discovery"

echo.
echo [5/5] Health Check...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "curl -sf http://localhost:3001/api/health > /dev/null"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Health Check Failed!
    exit /b 1
)

echo.
echo ========================================================
echo    [SUCCESS] Hotfix v9.3.3 Deployed & Verified.
echo ========================================================
endlocal
exit /b 0
