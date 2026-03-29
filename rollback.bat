@echo off
setlocal
echo ========================================================
echo         MP Stock Discovery Rollback System (v1.0)
echo ========================================================
echo.

:: 1. 커밋 ID 결정 (인자가 없으면 직전 커밋 HEAD~1 사용)
set "TARGET_COMMIT=%~1"
if "%TARGET_COMMIT%"=="" (
    set "TARGET_COMMIT=HEAD~1"
    echo [INFO] 타겟 커밋이 지정되지 않아 직전 커밋(HEAD~1)으로 설정합니다.
) else (
    echo [INFO] 타겟 커밋: %TARGET_COMMIT%
)

echo.
echo [1/4] Git 하드 리셋 시작...
git reset --hard %TARGET_COMMIT%
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git 리셋 실패. 커밋 ID를 확인하세요.
    exit /b 1
)

echo.
echo [2/4] 무결성 해시(SHA256) 재계산 중...
:: 핵심 파일: server.cjs, analyzer.cjs, src/utils/fullUniversePoller.cjs
for /f "tokens=*" %%i in ('node -e "const fs=require('fs'),crypto=require('crypto'),path=require('path');const h=crypto.createHash('sha256');['server.cjs','analyzer.cjs','src/utils/fullUniversePoller.cjs'].forEach(f=>{if(fs.existsSync(f)){h.update(fs.readFileSync(f,'utf8'))}});console.log(h.digest('hex'))"') do set NEW_HASH=%%i

if "%NEW_HASH%"=="" (
    echo [ERROR] 해시 계산 실패.
    exit /b 1
)
echo [INFO] 신규 해시: %NEW_HASH%

echo.
echo [3/4] .env 파일 업데이트...
powershell -Command "(Get-Content .env) -replace 'CORE_INTEGRITY_HASH=.*', 'CORE_INTEGRITY_HASH=%NEW_HASH%' | Set-Content .env"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] .env 업데이트 실패.
    exit /b 1
)

echo.
echo [4/4] AWS 운영 서버 동기화 배포 시작...
echo [INFO] aws_update.bat을 호출하여 롤백된 코드를 배포합니다.
call aws_update.bat

echo.
echo ========================================================
echo     [SUCCESS] 롤백 및 운영 서버 반영 완료!
echo     타겟 버전: %TARGET_COMMIT%
echo ========================================================
echo.
endlocal
exit /b 0
