$content = @"
@echo off
title PRD Stock Discovery Launcher
echo =========================================
echo  Starting PRD Stock Discovery System...
echo =========================================
cd /d "c:\Users\danbe\Documents\Antigravity\주식종목발굴"

echo.
echo [1/3] Starting Backend Server (Port 3001)...
start "PRD Backend" /MIN cmd.exe /c "node server.cjs"

echo [2/3] Starting Frontend Server (Port 5173)...
start "PRD Frontend" /MIN cmd.exe /c "npm run dev"

echo.
echo Waiting 5 seconds for servers to initialize...
timeout /t 5 >nul

echo [3/3] Opening Browser...
start http://localhost:5173

echo.
echo Startup complete. The servers are running minimized.
echo This window will close automatically in 3 seconds.
timeout /t 3 >nul
exit
"@

Set-Content -Path "c:\Users\danbe\Desktop\PRD주식발굴_실행.bat" -Value $content -Encoding Default
