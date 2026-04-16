@echo off
:: ─────────────────────────────────────────────────────────────────
::  PathGuard — Windows launcher
::  Double-click this file to start PathGuard.
::  The dashboard will open automatically in your browser.
:: ─────────────────────────────────────────────────────────────────

cd /d "%~dp0"
set "PROJECT_ROOT=%~dp0"
set "BACKEND_DIR=%PROJECT_ROOT%backend"
set "FRONTEND_DIR=%PROJECT_ROOT%frontend"
set "DROP_DIR=%PROJECT_ROOT%drop_results_here"
set "LOG_DIR=%PROJECT_ROOT%logs"

if not exist "%DROP_DIR%\processed" mkdir "%DROP_DIR%\processed"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo.
echo ====================================================
echo           PathGuard is starting...
echo ====================================================
echo.

:: Kill any stale processes on ports 8000 / 5173
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 "') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Check Python
where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: python not found.
    echo Install Python 3.10+ from https://python.org and try again.
    pause
    exit /b 1
)

:: Install Python dependencies if needed
echo -^> Checking Python dependencies...
python -c "import fastapi, uvicorn, watchdog" >nul 2>&1
if errorlevel 1 (
    echo -^> Installing Python dependencies (first run only^)...
    python -m pip install -r "%BACKEND_DIR%\requirements.txt" --quiet
)

:: Check Node
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: node not found.
    echo Install Node.js 18+ from https://nodejs.org and try again.
    pause
    exit /b 1
)

:: Install Node dependencies if needed
if not exist "%FRONTEND_DIR%\node_modules" (
    echo -^> Installing frontend dependencies (first run only^)...
    npm --prefix "%FRONTEND_DIR%" install --silent
)

:: Start backend
echo -^> Starting backend on http://localhost:8000...
start "PathGuard Backend" /min cmd /c "cd /d "%BACKEND_DIR%" && python -m uvicorn main:app --host 0.0.0.0 --port 8000 > "%LOG_DIR%\backend.log" 2>&1"

:: Wait for backend
echo -^> Waiting for backend to start...
timeout /t 4 /nobreak >nul

:: Start frontend
echo -^> Starting frontend on http://localhost:5173...
start "PathGuard Frontend" /min cmd /c "npm --prefix "%FRONTEND_DIR%" run dev > "%LOG_DIR%\frontend.log" 2>&1"

:: Give Vite a moment then open browser
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo ====================================================
echo   PathGuard is running!
echo.
echo   Dashboard:  http://localhost:5173
echo   Drop files: drop_results_here\
echo.
echo   Logs: logs\backend.log  /  logs\frontend.log
echo   Close this window to stop PathGuard.
echo ====================================================
echo.
pause
