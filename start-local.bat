@echo off
setlocal

echo ==========================================
echo Optio Platform - Starting Local Servers
echo ==========================================
echo.

REM Check if virtual environment exists
if not exist venv (
    echo ERROR: Virtual environment not found
    echo Please run setup-local.bat first
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist frontend\node_modules (
    echo ERROR: Frontend dependencies not installed
    echo Please run setup-local.bat first
    pause
    exit /b 1
)

echo Starting backend server (Flask on port 5001)...
echo Starting frontend server (Vite on port 3000)...
echo.
echo Two new terminal windows will open:
echo - Backend: Flask development server
echo - Frontend: Vite development server
echo.
echo Once both servers start, open your browser to:
echo http://localhost:3000
echo.
echo Press Ctrl+C in each window to stop the servers.
echo.

REM Start backend in new window
start "Optio Backend (Flask)" cmd /k "cd /d %~dp0 && call venv\Scripts\activate.bat && set FLASK_APP=app.py && set FLASK_ENV=development && python backend/app.py"

REM Wait a bit for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend in new window
start "Optio Frontend (Vite)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Servers are starting...
echo Check the new terminal windows for status.
echo.
echo If you see errors, check LOCAL_DEVELOPMENT.md for troubleshooting.
echo.
