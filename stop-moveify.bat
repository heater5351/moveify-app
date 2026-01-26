@echo off
echo ========================================
echo    Stopping Moveify Application
echo ========================================
echo.

REM Change to the moveify-app directory
cd /d "%~dp0"

echo [1/2] Stopping backend (PM2)...
cd backend
call npm run pm2:stop
if %errorlevel% neq 0 (
    echo WARNING: Backend may not be running
) else (
    echo Backend stopped successfully!
)
echo.

echo [2/2] Stopping frontend...
echo Please close the frontend terminal window manually
echo (Look for the window titled "Moveify Frontend")
echo.

echo ========================================
echo    Moveify Application Stopped!
echo ========================================
echo.
echo To fully remove PM2 process: npm run pm2:delete
echo To restart:                  npm run pm2:start
echo.
pause
