@echo off
echo ========================================
echo    Starting Moveify Application
echo ========================================
echo.

REM Change to the moveify-app directory
cd /d "%~dp0"

echo [1/4] Starting backend with PM2...
cd backend
call npm run pm2:start
if %errorlevel% neq 0 (
    echo ERROR: Failed to start backend
    pause
    exit /b 1
)
echo Backend started successfully!
echo.

echo [2/4] Waiting for backend to be ready...
timeout /t 3 /nobreak >nul
echo.

echo [3/4] Starting frontend...
cd ..\frontend
start "Moveify Frontend" cmd /k "npm run dev"
if %errorlevel% neq 0 (
    echo ERROR: Failed to start frontend
    pause
    exit /b 1
)
echo Frontend started successfully!
echo.

echo [4/4] Opening browser...
timeout /t 5 /nobreak >nul
start http://localhost:5173
echo.

echo ========================================
echo    Moveify Application Started!
echo ========================================
echo.
echo Backend:  http://localhost:3000
echo Frontend: http://localhost:5173
echo.
echo To view backend logs: npm run pm2:logs
echo To stop backend:      npm run pm2:stop
echo To view PM2 status:   npm run pm2:status
echo.
echo Press any key to view PM2 status...
pause >nul

cd backend
call npm run pm2:status
echo.
echo Press any key to exit...
pause >nul
