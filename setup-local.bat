@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo Optio Platform - Local Development Setup
echo ==========================================
echo.

REM Check for Python
echo [1/6] Checking for Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.11.9 from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)
python --version
echo.

REM Check for Node.js
echo [2/6] Checking for Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js 22.12.0+ from https://nodejs.org/
    pause
    exit /b 1
)
node --version
npm --version
echo.

REM Create Python virtual environment
echo [3/6] Creating Python virtual environment...
if exist venv (
    echo Virtual environment already exists, skipping...
) else (
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
    echo Virtual environment created successfully
)
echo.

REM Activate virtual environment and install backend dependencies
echo [4/6] Installing backend dependencies...
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo ERROR: Failed to activate virtual environment
    pause
    exit /b 1
)

pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install backend dependencies
    pause
    exit /b 1
)
echo Backend dependencies installed successfully
echo.

REM Install frontend dependencies
echo [5/6] Installing frontend dependencies...
cd frontend
if not exist node_modules (
    npm install
    if errorlevel 1 (
        echo ERROR: Failed to install frontend dependencies
        cd ..
        pause
        exit /b 1
    )
    echo Frontend dependencies installed successfully
) else (
    echo Frontend dependencies already installed, skipping...
)
cd ..
echo.

REM Check environment files
echo [6/6] Checking environment files...

REM Backend .env
if not exist backend\.env (
    echo WARNING: backend\.env not found
    echo You need to create backend\.env with Supabase credentials
    echo See backend\.env.example for template
) else (
    echo Backend .env found
)

REM Frontend .env
if not exist frontend\.env (
    echo WARNING: frontend\.env not found
    echo Creating frontend\.env from your current configuration...
    echo VITE_API_URL=http://localhost:5001 > frontend\.env
    echo VITE_SUPABASE_URL=https://vvfgxcykxjybtvpfzwyx.supabase.co >> frontend\.env
    if exist backend\.env (
        REM Extract SUPABASE_KEY from backend\.env
        for /f "tokens=2 delims==" %%a in ('findstr /b "SUPABASE_KEY=" backend\.env') do (
            echo VITE_SUPABASE_ANON_KEY=%%a >> frontend\.env
        )
    )
    echo VITE_ENVIRONMENT=development >> frontend\.env
    echo Created frontend\.env
) else (
    echo Frontend .env found
    REM Check if VITE_API_URL is correct
    findstr /c:"VITE_API_URL=http://localhost:5001" frontend\.env >nul
    if errorlevel 1 (
        echo.
        echo WARNING: frontend\.env may have incorrect VITE_API_URL
        echo It should be: VITE_API_URL=http://localhost:5001
        echo Current contents:
        type frontend\.env | findstr VITE_API_URL
    )
)
echo.

echo ==========================================
echo Setup Complete!
echo ==========================================
echo.
echo Next steps:
echo 1. Verify backend\.env has correct Supabase credentials
echo 2. Run: start-local.bat
echo 3. Open browser to: http://localhost:3000
echo.
echo For more details, see LOCAL_DEVELOPMENT.md
echo.
pause
