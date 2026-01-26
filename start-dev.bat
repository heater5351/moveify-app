@echo off
echo Starting Moveify Development Environment...
echo.

REM Start backend server
echo [1/2] Starting backend server on port 3000...
cd backend
start "Moveify Backend" cmd /k "npm run dev"
cd ..

REM Wait a moment for backend to initialize
timeout /t 3 /nobreak > nul

REM Start frontend dev server
echo [2/2] Starting frontend dev server on port 5173...
cd frontend
start "Moveify Frontend" cmd /k "npm run dev"
cd ..

echo.
echo ========================================
echo   Moveify is starting!
echo ========================================
echo   Backend:  http://localhost:3000
echo   Frontend: http://localhost:5173
echo ========================================
echo.
echo Both servers are running in separate windows.
echo Close those windows to stop the servers.
echo.
pause
