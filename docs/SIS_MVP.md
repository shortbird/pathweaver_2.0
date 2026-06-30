# Optio SIS — MVP (build + test + deploy)

Microschool Student Information System. One codebase, two surfaces:
`www.optioeducation.com` (learning app) and `sis.optioeducation.com` (admin console),
sharing `api.optioeducation.com` and the same login session.

> **⚠️ Superseded (2026-06-30):** this doc describes the original 4-table MVP. The
> **full 7-phase SIS** (programs/classes, registration, waitlists, billing,
> attendance, check-in, parent self-service) has since shipped to prod. For the
> current state see [`SIS_IMPLEMENTATION_PLAN.md`](SIS_IMPLEMENTATION_PLAN.md). This
> doc is kept for the local-testing walkthrough and the go-live/DNS notes below.

**Status:** **live behind the `sis_enabled` flag.** The carve-out is gated per-org by
`organizations.feature_flags.sis_enabled` — **on** for **iCreate** (pilot school) and
**Test-Org** (slug `test`); **off** for every other org. The SIS surface activates on
the `sis.` host (verify whether it's pointed before assuming prod users can reach it)
or via the local `?app=sis` override.

---

## What was built

**Frontend (`frontend/`)**
- `src/utils/appSurface.js` — surface detection + cross-surface navigation + the local
  `?app=sis` / `?sisflag=1` dev overrides.
- `src/App.jsx` — branches at the top of the route tree: SIS host → `<SisRoutes />`,
  else the existing learning app (unchanged).
- `src/sis/SisRoutes.jsx` — SIS route tree (new pages + carved-out admin pages at their
  original paths).
- `src/components/sis/SisLayout.jsx` + `SisSidebar.jsx` — staff-gated console chrome.
- `src/pages/sis/*` — Dashboard, Roster (+ StudentDetailModal), Households/Families,
  Family Messaging, org picker + `useSisOrg` hook.
- `src/components/navigation/Sidebar.jsx` — when `sis_enabled`, hides Organization /
  Advisor / Credit Review and shows a "School Admin" launcher to the SIS surface.

**Backend (`backend/`)**
- `routes/sis/__init__.py` — `/api/sis/*` blueprint (dashboard, roster, members,
  households + members, enrollments, emergency contacts, roster CSV). Gated to
  `org_admin`/`advisor`/`superadmin`; superadmin may target any org via `?organization_id`.
- `services/sis_service.py`, `repositories/household_repository.py`.
- `routes/__init__.py` registers it; `app_config.py` adds `https://sis.optioeducation.com`
  to CORS origins.

**Database (prod, applied)** — the MVP added 4 additive, RLS-locked tables (no existing
table altered): `households`, `household_members`, `emergency_contacts`,
`school_enrollments` (migration `20260623_sis_mvp_tables.sql`). The full SIS build has
since added the rest in prod (`programs`, `org_classes` SIS columns, `class_meetings`,
`sis_registrations`/`_items`, `sis_waitlist_entries`, the `sis_*` billing tables,
`sis_attendance`, `sis_checkins`, `sis_attendance_alerts`) — see
[`SIS_IMPLEMENTATION_PLAN.md`](SIS_IMPLEMENTATION_PLAN.md) for the full migration list.

---

## Local testing

No DNS needed — use the `?app=sis` override. The prod DB already has the tables (local
dev points at prod), so the console has live data immediately.

1. **Start servers** (mac-native): backend Flask on :5001, frontend Vite on :3000.
   Restart the backend after pulling these changes so the new blueprint loads.

2. **The new SIS console** — log in at `http://localhost:3000` as **superadmin**
   (tannerbowman@gmail.com), then visit:
   ```
   http://localhost:3000/?app=sis
   ```
   The override persists to localStorage. You'll land on the SIS console.
   - As superadmin you'll see an **Organization picker** (top-right). Choose **Test-Org**.
   - **Dashboard** → student counts, active-7-day, families, enrollment-status breakdown.
   - **Roster** → 5 students. Change a status inline (saves to `school_enrollments`).
     "Details" → edit grade/start-date + add/remove **emergency contacts**.
     "Export CSV" → downloads the roster.
   - **Families** → create a household, "+ Add member" to attach students/guardians,
     remove members.
   - **Messaging** → compose to Families/Students/Advisors (sends via the existing
     `/api/announcements` → notification bell + push).

3. **The carve-out (learning app)** — Test-Org has `sis_enabled=true`. To see the
   learning sidebar with admin items removed + the "School Admin" launcher:
   - Easiest: log in as the **Test-Org org_admin** at `http://localhost:3000` (normal
     learning surface). Organization / Advisor / Credit Review are gone from the sidebar;
     a purple **School Admin** button appears and switches you to the SIS console.
   - Or as superadmin, force the flag locally without an org:
     `http://localhost:3000/?sisflag=1` (clear with `?sisflag=0`).

4. **No-regression check (the important one)** — for any **other** org (sis_enabled
   off) or a platform student/parent, confirm the learning app is **unchanged**: same
   sidebar, same admin pages, no SIS anything. This is what protects every existing
   school. (`?sisflag=0` and remove the `optio_surface` override / use a fresh browser.)

5. **Switch back** to the learning surface anytime via the SIS sidebar's "Back to
   Learning app", or clear `localStorage.optio_surface`.

> Note: don't gauge the v1 vitest suite on this machine — Node 25 breaks it; CI runs
> Node 22. The production build passes locally (`npm run build`).

---

## Going live — Render + DNS (do AFTER you've tested)

Going live is just two deliberate, reversible steps. Until you do them, the SIS surface
is unreachable by real users.

### 1. Render — add `sis.` as a second custom domain on the existing frontend service
No new service. The same static build already serves it; the SPA branches on host.

- **Prod:** Render dashboard → `optio-prod-frontend` (srv-d2to04vfte5s73ae97ag) →
  Settings → Custom Domains → **Add** `sis.optioeducation.com`. Render shows the DNS
  target (a CNAME, e.g. `<something>.onrender.com`).
- **(Optional) Dev:** same on `optio-dev-frontend` with `sis-dev.optioeducation.com` if
  you want a dev SIS host; otherwise just use `?app=sis` on the dev URL.

### 2. DNS — point `sis` at Render
At your DNS provider for `optioeducation.com`:
```
CNAME   sis   ->   <the target Render shows>   (proxy/CDN off if applicable)
```
Wait for Render to verify + issue the TLS cert. Then `https://sis.optioeducation.com`
serves the console; `getAppSurface()` returns `'sis'` automatically on that host.

> ⚠️ Verify where `www`/apex actually resolve first. The apex may still be on Vercel
> (see CLAUDE.md / prod-web-hosting). Add `sis` alongside whatever serves the real prod
> web app today.

### 3. Backend CORS (only if `ALLOWED_ORIGINS` env is set)
The code default already includes `https://sis.optioeducation.com`. If prod sets the
`ALLOWED_ORIGINS` env var explicitly (Render dashboard / render.yaml), **append**
`https://sis.optioeducation.com` there too and redeploy the backend. Auth cookies need
no change — they're already scoped to `.optioeducation.com`.

### 4. Roll out per org
- Keep `sis_enabled` **off** for all real schools at first.
- Enable for one pilot:
  ```sql
  update organizations
  set feature_flags = coalesce(feature_flags,'{}'::jsonb) || '{"sis_enabled": true}'::jsonb
  where slug = '<pilot-slug>';
  ```
- Roll out org-by-org. Instant rollback: set `sis_enabled` to `false` (and/or un-point
  DNS).

---

## Rollback / safety summary
- **Frontend/back unreachable** until DNS is pointed → merging to `main` is safe.
- **Carve-out** is per-org and reversible via the `sis_enabled` flag.
- **DB** changes are additive new tables only; `drop table` reverts cleanly if ever needed.
- **Pushing:** merged to `main` and applied to prod; live behind `sis_enabled`.
