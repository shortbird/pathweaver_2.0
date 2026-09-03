# Local Development

CLAUDE.md has linked this file since before it existed (DOC-03). What follows is
the quick-reference from CLAUDE.md plus the things that are only learned by
hitting them.

Development happens on **macOS**. Repo at `~/pathweaver_2.0`, backend venv at
`~/pathweaver_2.0/venv` (Python 3.13 via Homebrew), Node 22 from Homebrew.

> Node 25 breaks the v1 vitest run. CI uses Node 22; match it.

---

## Ports

| Service | Port | Notes |
|---|---|---|
| Backend (Flask) | 5001 | `/api/health` returns 200 when up |
| Web v1 (Vite) | 3000 | the production web app |
| Mobile v2 (Expo web preview) | 8081 | dev-only target |

## Are the servers already running?

Check before starting anything — another agent may be mid-verification.

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5001/api/health   # 200 = backend up
lsof -nP -iTCP:3000 -sTCP:LISTEN                                          # vite dev server
```

## Start

```bash
# Backend (Flask on :5001)
cd ~/pathweaver_2.0 && source venv/bin/activate && python backend/app.py

# Frontend (Vite on :3000)
cd ~/pathweaver_2.0/frontend && npm run dev
```

From Claude Code, run each with `run_in_background` rather than backgrounding
with `&`.

**The backend runs single-process with no reloader.** Editing backend code does
nothing until you kill and relaunch it. This is the single most common way to
spend twenty minutes debugging a fix that is already correct.

## Stop

```bash
lsof -tnP -iTCP:3000 -sTCP:LISTEN | xargs kill   # frontend
lsof -tnP -iTCP:5001 -sTCP:LISTEN | xargs kill   # backend
```

**Never `killall node` or `pkill node`.** It kills Claude Code itself.

Do not stop servers you did not start — see "Working alongside other agents" in
CLAUDE.md.

---

## Running the tests the way CI does

The backend suite needs placeholder Supabase credentials because unit tests
construct a client against mocks. Without them you get failures that look like
broken code and are actually missing env:

```bash
cd ~/pathweaver_2.0/backend
FLASK_ENV=testing \
FLASK_SECRET_KEY=test-secret-key-for-ci-only \
SUPABASE_URL=https://placeholder.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key \
SUPABASE_ANON_KEY=placeholder-anon-key \
python -m pytest tests/ -q
```

Tests marked `requires_db` skip unless `RUN_DB_INTEGRATION_TESTS=1`. Read
`backend/tests/integration/README.md` before touching those.

Linters, both enforcing in CI as of 2026-09-03:

```bash
cd ~/pathweaver_2.0
ruff check backend
mypy --config-file backend/mypy.ini backend
python -m pyflakes backend | grep -E 'undefined name|invalid syntax'
```

Web (v1):

```bash
cd ~/pathweaver_2.0/frontend
npx vitest run <specific files>   # while iterating
npm run test:run                  # once, before pushing
```

`AuthContext.test.jsx` fails locally on a clean checkout (a jsdom
`localStorage.clear` quirk) and passes in CI. Do not gauge breakage from it.

---

## Gotchas worth knowing before they cost you an afternoon

- **Mobile API URLs.** Do not set `EXPO_PUBLIC_API_URL` in `.env` — it breaks
  the mobile app. `Platform.select` in `frontend-v2/src/services/api.ts` already
  routes web to localhost, the iOS simulator to the LAN IP, and Android to
  `10.0.2.2` (the emulator cannot reach the host's LAN IP).
- **Line endings.** Many tracked files are CRLF. Rewriting one wholesale in
  Python converts it to LF and produces a diff of the entire file. Preserve the
  original ending, or use targeted edits.
- **Android local builds** need JDK 17 (not 25), and local dev builds need
  `SENTRY_DISABLE_AUTO_UPLOAD=true`.

## Before committing

Stop the servers, and commit only the files you changed — several agents share
this checkout. See CLAUDE.md Critical Rules 11 and 12.
