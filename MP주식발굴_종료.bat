@echo off
title MP Stock Discovery Shutdown Tool
echo =========================================
echo  Stopping MP Stock Discovery System...
echo =========================================
echo.

echo Stopping Backend (3001) and Frontend (5173)...
powershell -NoProfile -Command "$pids = Get-NetTCPConnection -LocalPort 3001, 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess; if ($pids) { Stop-Process -Id $pids -Force -ErrorAction SilentlyContinue; Write-Host '[INFO] Termination complete.' } else { Write-Host '[INFO] No running servers found.' }"

echo.
echo All systems have been shut down safely.
echo Press any key to continue...
pause >nul
exit
