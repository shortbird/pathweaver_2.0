# Local Development Setup (Windows)

**Last Updated**: December 2025

This guide will help you run the Optio platform locally on Windows for faster development iteration. You'll run both frontend and backend locally, connecting to the cloud Supabase database.

## Why Local Development?

- Instant hot-reload on code changes (frontend and backend)
- No deployment wait times
- Test changes before pushing to develop
- Debug with breakpoints and better error visibility

## Prerequisites

Before starting, ensure you have:

1. **Python 3.11.9** - [Download from python.org](https://www.python.org/downloads/)
   - During installation, CHECK "Add Python to PATH"
   - Verify: `python --version` should show 3.11.x

2. **Node.js 22.12.0+** - [Download from nodejs.org](https://nodejs.org/)
   - Verify: `node --version` should show 22.12.x or higher
   - Verify: `npm --version` should show 10.x or higher

3. **Git** - [Download from git-scm.com](https://git-scm.com/download/win)
   - Should already be installed if you cloned this repo

## Quick Start (First Time Setup)

### Step 1: Run the Setup Script

Open Command Prompt or PowerShell in the project root and run:

```cmd
setup-local.bat
```

This will:
- Create Python virtual environment
- Install all backend dependencies
- Install all frontend dependencies
- Create local environment files

### Step 2: Configure Environment Variables

The setup script creates `.env` files for you, but you need to verify they're correct:

**Backend** (`backend/.env`):
- Should already have Supabase credentials
- Verify `ALLOWED_ORIGINS` includes `http://localhost:3000`
- Verify `DISABLE_RATE_LIMIT=true` (makes testing easier)

**Frontend** (`frontend/.env`):
```env
VITE_API_URL=http://localhost:5001
VITE_SUPABASE_URL=https://vvfgxcykxjybtvpfzwyx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**IMPORTANT**: `VITE_API_URL` should be `http://localhost:5001` (NO `/api` suffix - frontend adds it automatically)

### Step 3: Start the Development Servers

Open Command Prompt or PowerShell and run:

```cmd
start-local.bat
```

This will open TWO terminal windows:
- **Backend** - Flask server running on http://localhost:5001
- **Frontend** - Vite dev server running on http://localhost:3000

### Step 4: Open Your Browser

Navigate to: **http://localhost:3000**

You should see the Optio login page. The frontend will communicate with your local backend, which connects to the cloud Supabase database.

## Manual Setup (If Scripts Don't Work)

### Backend Setup

```cmd
# 1. Navigate to project root
cd c:\Users\tanne\Desktop\pw_v2

# 2. Create virtual environment
python -m venv venv

# 3. Activate virtual environment
venv\Scripts\activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Set environment variable
set FLASK_APP=app.py

# 6. Run backend (from project root, NOT backend folder)
python backend/app.py
```

Backend will run on: **http://localhost:5001**

### Frontend Setup

Open a NEW Command Prompt window:

```cmd
# 1. Navigate to frontend folder
cd c:\Users\tanne\Desktop\pw_v2\frontend

# 2. Install dependencies (first time only)
npm install

# 3. Run frontend
npm run dev
```

Frontend will run on: **http://localhost:3000**

## Development Workflow

### Making Changes

1. **Frontend Changes**:
   - Edit files in `frontend/src/`
   - Vite will auto-reload the browser (hot module replacement)
   - Check the frontend terminal for errors

2. **Backend Changes**:
   - Edit files in `backend/`
   - Flask will auto-reload on file changes
   - Check the backend terminal for errors

3. **Testing**:
   - Frontend unit tests: `cd frontend && npm test`
   - Test coverage: `cd frontend && npm run test:coverage`
   - Backend tests: (coming soon)

### Stopping the Servers

Press `Ctrl+C` in each terminal window to stop the servers.

## Environment Configuration Details

### Backend Environment Variables

Your `backend/.env` should have:

```env
# Flask Configuration
FLASK_ENV=development
SECRET_KEY=your-secret-key-here

# Supabase (connect to cloud database)
SUPABASE_URL=https://vvfgxcykxjybtvpfzwyx.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# CORS (allow local frontend)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
FRONTEND_URL=http://localhost:3000

# Development Settings
DISABLE_RATE_LIMIT=true
TEST_MODE=false

# AI Features (optional for most testing)
GEMINI_API_KEY=your-key-here

# Email (optional for most testing)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-key
SENDER_EMAIL=support@optioeducation.com
SENDER_NAME=Optio
```

### Frontend Environment Variables

Your `frontend/.env` should have:

```env
# Backend API URL (NO /api suffix)
VITE_API_URL=http://localhost:5001

# Supabase (direct access for some features)
VITE_SUPABASE_URL=https://vvfgxcykxjybtvpfzwyx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Feature Flags
VITE_ENABLE_AI_QUESTS=true
VITE_ENABLE_PORTFOLIO=true

# Environment
VITE_ENVIRONMENT=development
```

## Troubleshooting

### Backend Won't Start

**Error**: `ModuleNotFoundError: No module named 'flask'`
- **Solution**: Make sure virtual environment is activated (`venv\Scripts\activate`)
- **Solution**: Run `pip install -r requirements.txt` again

**Error**: `Address already in use`
- **Solution**: Port 5001 is already taken. Kill the process:
  ```cmd
  netstat -ano | findstr :5001
  taskkill /PID <process_id> /F
  ```

**Error**: `SUPABASE_KEY environment variable must be set`
- **Solution**: Check `backend/.env` has all Supabase credentials

### Frontend Won't Start

**Error**: `npm: command not found`
- **Solution**: Install Node.js and restart terminal

**Error**: `Port 3000 is already in use`
- **Solution**: Kill the process or use a different port:
  ```cmd
  # Kill process
  netstat -ano | findstr :3000
  taskkill /PID <process_id> /F

  # Or change port in vite.config.js (server.port)
  ```

**Error**: `Cannot connect to backend`
- **Solution**: Make sure backend is running on http://localhost:5001
- **Solution**: Check `frontend/.env` has `VITE_API_URL=http://localhost:5001` (NO `/api` suffix)

### Authentication Issues

**Error**: `401 Unauthorized` errors
- **Solution**: httpOnly cookies might not work on localhost
- **Check**: Backend logs should show `[SessionManager]` messages
- **Check**: Browser DevTools > Application > Cookies - should see cookies for localhost
- **Workaround**: Backend automatically falls back to Authorization headers

**Error**: `CSRF token missing`
- **Solution**: Make sure `DISABLE_RATE_LIMIT=true` in backend/.env (disables CSRF for local dev)

### Database Issues

**Error**: `relation "users" does not exist`
- **Cause**: You're connected to the wrong Supabase project
- **Solution**: Verify `SUPABASE_URL` matches production: `https://vvfgxcykxjybtvpfzwyx.supabase.co`

**Error**: `RLS policy violation`
- **Cause**: Code is using wrong Supabase client (user client vs admin client)
- **Solution**: Check CLAUDE.md for RLS client selection rules

## Testing Before Deployment

Before pushing to develop:

1. **Run Frontend Tests**:
   ```cmd
   cd frontend
   npm run test:run
   ```
   - Must have 95%+ pass rate (current: 97.8%)

2. **Check Test Coverage**:
   ```cmd
   cd frontend
   npm run test:coverage
   ```
   - Must have 60%+ coverage (current: 60.61%)

3. **Manual Testing**:
   - Login/logout
   - Quest enrollment
   - Task completion
   - Badge claiming
   - Role-specific features

4. **Check Logs**:
   - Backend terminal: No errors
   - Frontend terminal: No errors
   - Browser console: No errors

## Deployment Workflow

Once you've tested locally:

1. **Commit Changes**:
   ```cmd
   git add .
   git commit -m "Your commit message"
   ```

2. **Push to Develop**:
   ```cmd
   git push origin develop
   ```

3. **Wait for Deploy**:
   - Backend: https://optio-dev-backend.onrender.com
   - Frontend: https://optio-dev-frontend.onrender.com
   - Check GitHub Actions for E2E test results

4. **Test on Dev Environment**:
   - Visit https://optio-dev-frontend.onrender.com
   - Verify changes work in deployed environment

5. **Merge to Main** (when ready for production):
   - Run full test suite first (`npm run test:run`)
   - Create PR: develop → main
   - Review and merge
   - Production deploys automatically

## Useful Commands

### Backend

```cmd
# Activate virtual environment
venv\Scripts\activate

# Deactivate virtual environment
deactivate

# Install new dependency
pip install package-name
pip freeze > requirements.txt

# Run backend
python backend/app.py

# Check installed packages
pip list
```

### Frontend

```cmd
# Install new dependency
npm install package-name

# Run dev server
npm run dev

# Run tests (watch mode)
npm test

# Run tests (once)
npm run test:run

# Generate coverage report
npm run test:coverage

# Build for production
npm run build

# Preview production build
npm run preview
```

### Git

```cmd
# Check status
git status

# See recent commits
git log --oneline -10

# Switch branches
git checkout develop
git checkout main

# Pull latest changes
git pull origin develop
```

## Need Help?

- Check CLAUDE.md for architectural patterns and rules
- Check backend logs in terminal
- Check browser console (F12)
- Check Network tab (F12) for API errors

## Environment Comparison

| Feature | Local Dev | Dev (Render) | Production |
|---------|-----------|--------------|------------|
| Frontend URL | http://localhost:3000 | https://optio-dev-frontend.onrender.com | https://www.optioeducation.com |
| Backend URL | http://localhost:5001 | https://optio-dev-backend.onrender.com | https://optio-prod-backend.onrender.com |
| Database | Cloud Supabase | Cloud Supabase | Cloud Supabase |
| Hot Reload | Yes (instant) | No | No |
| HTTPS | No | Yes | Yes |
| Rate Limiting | Disabled | Enabled | Enabled |
| E2E Tests | Manual | Auto (GitHub Actions) | Auto (GitHub Actions) |
