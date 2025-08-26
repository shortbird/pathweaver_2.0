@echo off
echo Starting PathwayU Local Development...
echo.

:: Start backend in a new window
echo Starting Backend Server...
start "PathwayU Backend" cmd /k "cd backend && call venv\Scripts\activate && python app.py"

:: Wait a moment for backend to initialize
timeout /t 3 /nobreak > nul

:: Start frontend in a new window
echo Starting Frontend Server...
start "PathwayU Frontend" cmd /k "npm run dev"

echo.
echo ========================================
echo Both servers are starting...
echo Backend: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
echo Press Ctrl+C in each window to stop the servers
echo Close this window when done
echo ========================================
pause