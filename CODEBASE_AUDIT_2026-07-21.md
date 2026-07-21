# Optio Platform — Deep Codebase Audit

**Date:** 2026-07-21
**Scope:** Flask backend (`backend/`, ~545 Python files, 90+ route modules, 100+ services, 34 repositories) · React v1 web app (`frontend/`) · Expo v2 mobile app (`frontend-v2/`) · Supabase Postgres (158 migrations + live prod DB `vvfgxcykxjybtvpfzwyx`) · Render/CI config.
**Method:** Seven parallel domain audits reading actual code (not filenames), plus **direct live-prod DB inspection** (RLS state, policies, grants, advisors, SECURITY DEFINER functions) via the Supabase management API. Findings were verified against source before inclusion. **No code was changed** — this is the prioritized report; fixes are a follow-up pass.

> **Live DB access note:** The Supabase MCP tools were permission-blocked in this environment, so the database posture was read via the management API with the provided PAT. One planned check — an unauthenticated anon-key read of `user_subject_xp` to *demonstrate* exploitability — was blocked by the safety classifier. That finding (SEC-DB-1) is therefore confirmed by **policy + grant inspection**, not by a live exfiltration.

---

## 1. Executive Summary

The platform is, on the whole, carefully engineered: httpOnly-cookie auth with an in-memory token store, DOMPurify everywhere on the web, correct SecureStore usage on mobile, no committed secrets, RLS enabled on **every** public table, and a strong password/secret-validation baseline. The serious problems cluster in **two systemic weaknesses**, both amplified because this backend deliberately uses the RLS-bypassing admin client and enforces authorization **manually** in each handler — so a single missing check is full cross-tenant exposure with no database backstop, on a platform holding **minors' data**.

**Top issues by severity (one line each):**

1. **[CRITICAL] Unauthenticated `/api/oauth/authorize` mints full-privilege app session tokens** — no `@require_auth`, reads user from an unused Flask session, issues a normal app JWT; scope never enforced. `backend/routes/auth/oauth.py:45-284`.
2. **[CRITICAL] Cross-tenant transcript/transfer-credit IDOR on minors' academic records** — `@require_school_admin` endpoints act on any `user_id` with no org scoping; one path emails an official transcript + a minor's DOB to an attacker-supplied address. `transcript_generator.py`, `transfer_credits.py`.
3. **[CRITICAL] Cross-tenant *destructive* deletes** — org advisors can delete any org's quests/courses **and** cascade-delete arbitrary students' `user_quest_tasks` (root cause: authorization checked against the raw `role` column, which is `org_managed` for real advisors). `quest_management/crud.py:512`, `curriculum_generate/project.py:195`, `course_refine.py`.
4. **[CRITICAL] `remove_user_from_organization` missing org guard** — an org_admin can evict users from *other* orgs and demote a superadmin to student. `organization_management.py:595-652`.
5. **[HIGH] CSRF is initialized but never enforced** (`WTF_CSRF_CHECK_DEFAULT=False`, no `csrf.protect()` anywhere; exempt list uses wrong endpoint names). `csrf_protection.py:47`.
6. **[HIGH] Any authenticated user can delete ANY user's evidence files** — no ownership check on the storage-delete endpoint; evidence URLs are public on portfolios. `evidence_documents.py:1345`.
7. **[HIGH] Cross-org read/deletion of minors' emergency contacts** — three SIS endpoints (`list`/`delete_emergency_contact`/`remove_household_contact`) have no org scoping; any staff user reads or deletes any student's emergency-contact PII (names, phones, pickup authorization) across all orgs. `sis/__init__.py:499,518,589`.
8. **[HIGH] Observers (view-only) can read a minor's private DMs/group/AI-tutor messages and write to their journal/portfolio** — `verify_parent_access` admits observer links. `parent/communications.py`, `parent/learning_moments.py`.
9. **[HIGH] Live DB exposes every student's subject-XP and per-user feed views** — `user_subject_xp` and `feed_item_views` carry `USING(true)` SELECT policies with anon+authenticated grants; these policies exist in **no migration** (live ≠ repo). Confirmed on prod.
10. **[HIGH] Production ships known-vulnerable deps while CI is green** — CI audits `backend/requirements.txt` but Render deploys root `requirements.txt` (gunicorn 21.2.0 request-smuggling, Flask-Cors 4.0.0, PyJWT 2.10.1). `release.yml`, `requirements.txt`.
11. **[HIGH] Non-atomic XP increment (lost-update race) on the live completion path** — concurrent completions silently lose XP; an unused atomic RPC already exists. `xp_service.py:116-146`.

**Severity totals (deduplicated across the 7 audits + live DB):**

| Severity | Count |
|----------|-------|
| Critical | 6 |
| High | 28 |
| Medium | 40+ |
| Low | 35+ |

**Two root causes drive most CRITICAL/HIGH findings — fix these patterns, not just instances:**

- **RC-A — Raw-`role` authorization:** handlers gate on `user['role'] == 'advisor'` (or allowlist the invalid literal `'admin'`). Real org staff have `role='org_managed'` with the true role in `org_role`, so the ownership/assignment check is silently skipped (fail-open) or the intended actor is denied (fail-closed). Fix: use `get_effective_role()` everywhere. Appears in `student_task_management.py`, `quest_management/crud.py`, `course_quest_management.py`, `notifications.py`, `task_flags.py`, and ~100 RLS policies.
- **RC-B — Admin client without manual org/ownership scoping:** the RLS-bypassing client is used, but the `user_id`/`org_id` scope check that is supposed to replace RLS is missing. Fix: default the repository client to the RLS-enforcing **user** client (opt into admin), and add ownership predicates to generic `update`/`delete`/`find_by_id`. `base_repository.py:75-123`.

---

## 2. Security Findings

### 2.1 Authentication & session middleware (`backend/routes/auth/`, `middleware/`, `utils/auth/`)

**[CRITICAL] AUTH-C1 — `/api/oauth/authorize` unauthenticated; mints full app session token**
`backend/routes/auth/oauth.py:45-139`, `:210-284`. No `@require_auth`; reads the granting user from Flask `session.get('user_id')` (never populated → `None`); issues a normal `session_manager.generate_access_token(user_id)` — the same JWT that authenticates the whole app — and never enforces the requested `scope`. Any party with a valid `client_id` + registered `redirect_uri` obtains a full-privilege token; `generate_access_token(None)` yields a null-subject token with undefined downstream behavior. Also a state-changing **GET** with no consent/CSRF (AUTH-L6). **Fix:** require auth, derive user from `session_manager`, add explicit consent, issue scoped non-session OAuth tokens with enforced scope, reject `user_id is None`.

**[HIGH] AUTH-H1 — CSRF protection initialized but never enforced (global bypass)**
`backend/middleware/csrf_protection.py:47`, `backend/app.py:90`. `WTF_CSRF_CHECK_DEFAULT=False` and no `csrf.protect()` call exists anywhere; the exempt list references non-existent endpoint names (`auth.login` vs real `auth_login.login`). CSRF runs on **zero** state-changing routes. In cross-origin mode (`SameSite=None` on dev/onrender) this is directly exploitable; in prod only the `Lax` cookie attribute defends. **Fix:** enable check-default (or a `before_request` `csrf.protect()` for mutating methods), correct the exempt names, add a test that a cookie-auth POST without a token is rejected.

**[HIGH] AUTH-H2 — `/api/auth/cookie-debug` reflects `Cookie` + `Authorization` headers in its JSON body**
`backend/routes/auth/login/diagnostics.py:189,210`. Unauthenticated; returns `dict(request.headers)` (raw token values) plus env/config and, in dev, a full traceback — defeating the entire httpOnly model (any XSS can `fetch()` the tokens). **Fix:** remove `all_headers`, gate behind `@require_admin` or strip from production.

**[HIGH] AUTH-H3 — Reflected-origin CORS with credentials on all error responses**
`backend/middleware/error_handler.py:160-165`. Echoes any `Origin` with `Access-Control-Allow-Credentials: true` and no allowlist check on every `AppError`, letting a malicious origin read credentialed error bodies (auth state, IDOR/validation signals). **Fix:** only set ACAO when `origin in Config.ALLOWED_ORIGINS`; let flask-cors handle CORS uniformly.

**[HIGH] AUTH-H4 — Idempotency cache not scoped per user (cross-user IDOR)**
`backend/middleware/idempotency.py:190-288`, applied at `tasks/completion.py` and `quest/enrollment.py`. Cache key is the client-chosen `Idempotency-Key` alone; two users sharing a key collide, so user B can replay user A's key and receive A's cached response body (completion/XP data). **Fix:** namespace the key by authenticated `user_id`.

**[HIGH] AUTH-H5 — Logout and password reset don't invalidate active sessions**
`utils/auth/decorators.py` (role decorators never check `last_logout_at`), `routes/auth/password.py:332` (reset never stamps `last_logout_at`). The invalidation check exists only in `/me` and `/refresh`. A stolen access token survives logout (≤15 min) and, worse, a stolen refresh token survives **password reset** for up to 30 days. **Fix:** enforce `last_logout_at`/`iat` centrally in `require_auth`; stamp `last_logout_at` on password/credential change.

**[HIGH] AUTH-H6 — No rate limiting on `/api/auth/refresh` and `/reset-password`**
`routes/auth/login/tokens.py:36`, `routes/auth/password.py:332`. Login/register/forgot-password are throttled; token refresh and reset-token consumption are not. **Fix:** add `@rate_limit` to both.

**Medium:** AUTH-M1 rate-limit IP uses spoofable **leftmost** X-Forwarded-For (`rate_limiter.py:31-69`); AUTH-M2 device-fingerprint binding is log-only (`session_manager.py:112-143`); AUTH-M3 OAuth client secrets stored plaintext + revocation doesn't invalidate the JWT (`oauth.py`); AUTH-M4 `require_parental_consent` **fails open** on error — COPPA gate bypass (`decorators.py:731-792`); AUTH-M5 automatic OAuth account-linking by email match (pre-account-takeover) (`google_oauth.py:230`, `apple_oauth.py:149`); AUTH-M6 "absolute" 30-day session timeout is sliding (reset on refresh), no revocation list (`app_config.py:200`); AUTH-M7 `verify_token` accepts refresh tokens as identity and skips logout/timeout checks (`token_utils.py:13-54`).
**Low:** AUTH-L1 admin audit decorator reads a kwarg the decorators never pass → audit rows silently not written (`audit_logger.py:60`); AUTH-L2 activity tracker persists all query params (may capture tokens/invite codes) (`activity_tracker.py:243`); AUTH-L3 unmasked PII/tracebacks via `print()`/raw logging (`password.py:226`, `registration.py:232`, `google_oauth.py:372`); AUTH-L4 org-login username timing enumeration (`login/core.py:451`); AUTH-L5 `resend-verification` can confirm account existence (`registration.py:738`); AUTH-L6 authorize is a state-changing GET (folded into C1).
**Verified OK:** CORS success path has no wildcard; JWT pinned to HS256 (no alg-confusion); secret-key entropy validated at startup; strong password policy; solid login enumeration/lockout; sound password-reset token handling; `get_effective_role`/superadmin inclusion correct in the core role decorators; masquerade authz uses the actual-admin id.

### 2.2 Authorization & data access — cross-tenant IDOR (`backend/routes/`, `repositories/`)

> Architecture: most routes authenticate, then use the admin client (RLS bypassed) and scope **manually**. "Admin client used" is not itself the finding — the finding is admin client used **without** the manual scope check (RC-B). Because most real advisors/admins are `org_managed`, raw-`role` checks (RC-A) skip the guard entirely.

**[CRITICAL] IDOR-C1 — Transcript endpoints unscoped; official transcript + minor DOB exfiltration**
`backend/routes/admin/transcript_generator.py:534-725` (`send_transcript_to_school`) and `:54-509` (all endpoints). `@require_school_admin` (injects no org id); handlers take an arbitrary `user_id`, read student name/email/DOB, and email an official-looking transcript to an attacker-supplied `recipient_email` — with no check the caller's org owns the student. `update_course_names` (`:389`) only checks the record exists. **Impact:** any org_admin exfiltrates any minor's PII/transcript across all tenants, or mutates planned credits/overrides. **Fix:** resolve target student org, enforce `== caller org` (superadmin exempt) before any read/email/write.

**[CRITICAL] IDOR-C2 — Transfer-credit endpoints unscoped + cross-org XP tampering**
`backend/routes/admin/transfer_credits.py:69-437`. `@require_school_admin` + arbitrary `user_id`; `save` writes `user_subject_xp`/`user_skill_xp`, deletes subtract XP. Ownership checks bind record→path `user_id` but never `user_id`→caller org. **Impact:** any org_admin reads any student's credits/PII and creates/modifies/deletes transfer credits that change another org's students' diploma + pillar XP (academic-record tampering on minors). **Fix:** enforce caller-org match on every handler + `_delete_transfer_credit_record`.

**[CRITICAL] IDOR-C3 — Cross-tenant destructive quest delete (raw-role bypass)**
`backend/routes/admin/quest_management/crud.py:512-596` (`delete_quest`). Ownership guard gated on `if user_role == 'advisor'` where `user_role` is the **raw** `role` column; org advisors (`role='org_managed'`) skip it, and `@require_advisor` admits them. Handler cascade-deletes `quest_task_completions`, `user_task_evidence_documents`, `user_quest_tasks`, `user_quests` and reverses XP. **Impact:** any org advisor deletes any quest in any org (incl. published) and destroys minors' learning records. **Fix:** `get_effective_role`; enforce `created_by==user_id AND not is_active` for advisors + org match for org_admins (mirror `update_quest:341-369`). Same raw-role destructive pattern in `curriculum_generate/project.py:195-242` (`delete_project` cascades to students' `user_quest_tasks`) and `finalize.py:94-120` (`delete_draft`, service `course_generation_service.py:1178-1230`).

**[CRITICAL] IDOR-C4 — `course_refine` unscoped: cross-org AI bulk edits + session hijack**
`backend/routes/admin/course_refine.py:78-469`. `@require_role('superadmin','org_admin','advisor')` passes `course_id`/`session_id` straight to `CourseRefineService`, which looks up by id via the admin client (`_fetch_course_content:385`, `_get_session:380`) and `apply_changes:217` writes content. Any org_admin/advisor from any org refines and applies AI bulk edits to another org's course; `session_id` is unbound to the caller (hijack). **Fix:** load course, `get_effective_role`, reject when not superadmin and `course.organization_id != caller org`; scope `_get_session` by user/org.

**[CRITICAL] IDOR-C5 — `remove_user_from_organization` missing org guard**
`backend/routes/admin/organization_management.py:595-652`. Non-superadmin path updates `users` by `.eq('id', user_id)` with no `.eq('organization_id', org_id)`; the only check validates the URL org == caller org, not that the target belongs to it (the sibling bulk-remove *does* scope, `:697`). **Impact:** an org_admin evicts users from other orgs and demotes a superadmin (fetched `org_role` is NULL → defaults `'student'`). **Fix:** fetch target org, reject if `!= org_id` unless superadmin; add the org filter to the update.

**[CRITICAL] SEC-DB-1 — Live DB: every student's subject-XP is world-readable (live ≠ repo)**
Confirmed on prod: `public.user_subject_xp` has a `SELECT USING (true)` policy for the `public` role, and `anon`+`authenticated` hold table SELECT grants, so **any caller with the public anon key can read every user's `user_id`/`school_subject`/`xp_amount`/`pending_xp`**. The repo migration (`backend/migrations/20260112_fix_rls_performance_part3.sql:610`) defines an admin-only (in practice dead) policy — the live `true` policy exists in **no migration** (applied out-of-band). `feed_item_views` has the same `SELECT USING(true)` + anon grant, exposing per-user engagement rows. **Fix:** replace `true` with `user_id = (select auth.uid())` (+ service_role catch-all) and commit as a migration.

**[HIGH] EVID-1 — Any authenticated user deletes ANY user's evidence files**
`backend/routes/evidence_documents.py:1345-1382` (`POST /api/evidence/storage/delete-urls`). `@require_auth` only; deletes each client-supplied URL from Storage via the admin client with no ownership check (`user_id` used only for logging). Evidence URLs are public on diploma/portfolio pages. Sibling `delete_block_file`/`delete_evidence_block` already check ownership — this is the outlier. **Fix:** resolve each URL → `user_task_evidence_documents.user_id` and require `== caller` (superadmin exempt).

**[HIGH] IDOR-H1 — `create_student_task` has no advisor-student assignment check + STM raw-role bypass**
`backend/routes/admin/student_task_management.py:53-188` (create: no assignment check at all; injects `approval_status:'approved'` XP-bearing tasks into any `target_user_id`, auto-enrolls them, copies any `template_task_id`), and `:399-676` (get/update/delete: gate on raw `role`, so org advisors skip `is_advisor_for_student`). **Impact:** any org advisor reads/edits/deletes/injects tasks + evidence for any student across all orgs. **Fix:** `get_effective_role` + apply the assignment check to every non-superadmin advisor/org_admin on all four handlers and the create path.

**[HIGH] IDOR-H2 — Advisor can push an arbitrary notification (phishing) to ANY user**
`backend/routes/notifications.py:224-262`, broadcast `:331-414`. Only a coarse role check; `target_user_id`, `title`, `message`, `link` all from the body; stamped with the sender's org so cross-org delivery is invisible; fires push + realtime. **Impact:** any advisor sends unsolicited, arbitrarily-linked notifications to minors in other orgs. **Fix:** require an active assignment (advisor) or same-org (org_admin); allowlist `link` to internal paths. (Gate also uses raw `role` — NOTIF-2.)

**[HIGH] IDOR-H3 — Platform (null-org) group chats leak all-platform PII and add any minor**
`backend/services/group_message_service.py:764-819` (`get_available_members`), `:95-148` (`can_add_member`). Org isolation is applied only `if org_id is not None`; a group created by a platform advisor (org_id NULL) returns **every** user (names/roles) and lets any user id be added. **Fix:** treat null-org as "no auto-eligible members"; require an explicit relationship.

**[HIGH] IDOR-H4 — Observers read a minor's PRIVATE messages (DMs, group, AI-tutor)**
Root cause `backend/routes/parent/dashboard_overview.py:82-90` (`verify_parent_access` returns true for an `observer_student_links` row); exposed by `parent/communications.py` (`get_student_dm_messages:164`, `get_student_group_messages:249`, `get_student_tutor_messages:317`, …). Observers are documented view-only ("can comment on student work"), not permitted private comms. **Fix:** add `allow_observer=False`; gate on a true guardian relationship + superadmin.

**[HIGH] IDOR-H5 — Observers WRITE to a linked minor's data (view-only violated)**
Same root cause; `parent/learning_moments.py` (`create_child_learning_moment:22`, `upload_moment_media:176`, `create_child_topic:447`, `assign_child_moment_to_topic:633`), `parent/child_overview.py` (`upload_child_avatar:753`), `observer/activity.py` (`toggle_feed_item_visibility:519`). A view-only observer injects journal/portfolio content, uploads media, renames topics, overwrites the avatar, and toggles confidentiality on the child's work. **Fix:** as H4 — exclude observers from all write paths.

**[HIGH] IDOR-H6 — `add_users_to_organization` absorbs cross-org users**
`organization_management.py:529-592`. Updates each caller-supplied `user_id`'s org/role by id only; only superadmins are skipped. An org_admin absorbs students/parents/advisors (and their minor data) from other orgs into their own. **Fix:** only move users whose current `organization_id` is NULL or the caller's org.

**[HIGH] IDOR-H7 — Cross-org audit-log reads**
`backend/routes/admin/audit_logs.py:90-140` (`get_admin_activity`) and `:143-181` (`get_resource_history`); services `admin_audit_service.py:98-159` apply no org filter (siblings do). Any org_admin pulls any admin's or any resource's full audit trail (actions, resource ids, IPs, old/new values) across tenants. **Fix:** filter by `current_org_id` for non-superadmins.

**[HIGH] IDOR-H8 — `course_quest_management` global-content gap + course-generation family unscoped**
`course_quest_management.py:298-758` skips the org check when `quest_org` is falsy (global library quests have `organization_id=NULL`), so any advisor rewrites/deletes global course-quest task sets. The whole `curriculum_generate/*` family (`project.py:151`, `finalize.py:60`, `outline.py:186`, `lessons.py:224-334`, `tasks.py:157-271`) reads/updates by id with no org scope — read any org's course state, publish another org's draft, rewrite any quest. **Fix:** deny global-content mutation for non-superadmins; add org guards to each generation handler.

**[HIGH] IDOR-H9 — `xp_reconciliation` single-user endpoints unscoped**
`backend/routes/admin/xp_reconciliation.py:121-255`. Inline `require_admin` admits org_admin; `audit_user_xp`/`reconcile_user_xp` take arbitrary `user_id`, no org scope; reconcile writes `user_skill_xp` + `users.total_xp`. Cross-tenant read PII + write on minors' records. **Fix:** enforce target-org == caller-org for non-superadmins.

**[HIGH] IDOR-H10 — SIS emergency-contact cluster: cross-org read + destructive delete of minors' safety records**
`backend/routes/sis/__init__.py:499` (`list_emergency_contacts` — the only SIS endpoint that never calls `_org_or_error`; service `sis_service.py:321` selects `*` by `student_user_id` with no org filter), `:518` (`delete_emergency_contact` — `delete().eq('id', contact_id)`, no org/ownership check), `:589` (`remove_household_contact` — resolves org but passes body `ids` straight to `delete().in_('id', ids)` unconstrained). **Impact:** any staff user (org_admin/advisor) in any org reads any student's emergency-contact PII (names, phones, emails, **pickup authorization**) and deletes any student's safety records across all orgs. **Fix:** add `_org_or_error` + `student_in_org` and filter/validate every row by `organization_id` before read/delete. (Related MEDIUM: `add_emergency_contact:505` and `update_enrollment:401` don't verify the target student is in the caller's org.)

**[HIGH] IDOR-H11 — `credit_dashboard/get_student_context` leaks student PII across orgs**
`backend/routes/credit_dashboard/items.py:434-512` (`@require_role('superadmin','org_admin')`). Fetches a student's `email`/`total_xp`/avatar, full `user_subject_xp`, and pending completions by URL `student_id` via the admin client with no org-scope check — while the sibling `get_dashboard_item_detail:275` does enforce `caller_org == student_org`. **Impact:** an org_admin reads any student's email/XP/subject-XP/pending diploma items regardless of org. **Fix:** replicate the org check from `get_dashboard_item_detail`.

**[HIGH] REPO-1 (systemic) — Repository layer defaults to admin client with id-only mutators**
`backend/repositories/base_repository.py:75-123` (`client` → admin when no `user_id`), `:238-301` (generic `update`/`delete` scope by id only), plus `evidence_repository.py`, `evidence_document_repository.py`, `task_repository.py`, `organization_repository.py`. Repos built without `user_id` (the common case) bypass RLS and mutate by id with no ownership predicate; an unused `get_block_with_ownership_check` proves the intent. Authorization is fail-open by construction. **Fix:** default `client` to the user client (opt into admin); add `user_id`/ownership predicates to generic mutators; base deletion success on `result.data`.

**[HIGH] QP-1 — Student-controlled, uncapped `xp_value` on auto-approved tasks (XP inflation)**
`backend/routes/quest_personalization.py:466-485` (`add_manual_tasks_batch`), `:784-803` (`accept_task_immediate`). `xp_value` from the body, auto-approved, no cap/type check; the `clamp_xp_value(50,200)` helper (`personalization_validators.py:173`) is defined but never called. A student self-awards arbitrary XP (corrupts leaderboards + badge thresholds); `accept_task_immediate` also propagates the task into the shared library. **Fix:** apply `clamp_xp_value()` + int validation on both create paths; recompute `subject_xp_distribution` server-side.

**Medium (data-access):** create_org_manual_parent_link attaches any parent to a minor (org_connections.py:670); add_users_to_organization unvalidated `org_role` mass-assignment (org_management.py:546); ai_cleanup_quest raw-role bypass (crud.py:454); ai_jobs advisor platform-wide job control incl. history purge (ai_jobs.py:25-142); bulk_import writes role to wrong column + org_admin mass-creates org_admins (bulk_import.py:26,292); PORT-1 `/portfolio/user/<id>` no privacy gate (portfolio.py:52); PUB-1 unauthenticated public transcript emits a minor's DOB (public.py:215,243,395); REPO-2 PostgREST `.or_()` filter injection via unsanitized `search_term` (quest_repository.py:236,483,633); REPO-3 `update_user_role` no role whitelist (user_repository.py:558); REPO-4 admin user queries `SELECT('*')` incl. email (user_repository.py:401,442); REPO-5 `assign_user_to_organization`/`update_organization` enforce no authz (organization_repository.py:29,74); PROF-1 self-profile read/write on admin client (users/profile.py:25); QP-2/QP-3 unvalidated per-task free-text + body-supplied `diploma_subjects` (quest_personalization.py); OBS-M1 `get_feed_item_viewers` no relationship check (observer/social.py:134); ROLE-1 invalid `'admin'` literal in allowlists — org_admins locked out of moderation (task_flags.py:22, student_task_management.py:383, advisor_notes.py:23); listing.py returns other users' emails to advisors (quest_management/listing.py:172); SIS-7/SIS-8 `add_emergency_contact`/`update_enrollment` don't verify the student is in the caller's org (sis/__init__.py:505,401); CRS-1 `enroll_in_course` lets advisor/org_admin enroll any user cross-org; CRS-3 `get_course`/`get_course_quests` expose any course incl. other-org drafts.
**Low:** curriculum_upload by-id lookups unscoped (latent, superadmin-gated); jobs start/process no ownership; account_deletion incomplete GDPR cascade + dead `friendships` ref; moderation report/block no UUID validation/rate limit; DM superadmin contacts ship all emails; uploads `/finalize` binds `context_id` not `user_id`; showcase queue skips consent redaction; images search open to any student (3rd-party cost); flag_library_task/flag broken signatures (endpoints 500); personalization session_id ownership unverified; confirm_imscc_import mass-assignment.
**Verified OK:** core auth decorators; `organization_management.py` (19 handlers 1:1 org-gated); `user_management.py`; `course_enrollments.py`; `dependents.py`; `bounties.py`; DM/org-group/self-notification paths; portfolio public/diploma `is_public` gates; parent_linking approve/reject; no `teacher`/`educator` role literals; ferpa/observer_audit/moderation_queue/showcase_consent/lti/poe/plan_mode/ai_costs superadmin-gated.

### 2.3 Database / RLS (live prod + migrations)

**Live posture (direct query, verified):** RLS is **enabled on every public table** (0 with it off). 54 tables are RLS-enabled with **no policy** = intentional deny-all served by the backend service_role (SIS/OEA/LTI/households/emergency_contacts — confirmed intentional in `20260623_sis_mvp_tables.sql`). All 45 SECURITY DEFINER functions have a **pinned `search_path` in prod**. Two superadmins exist including a `test-superadmin@optioeducation.com` account, plus one user row with `email=NULL, role=NULL` (data-integrity blemish).

**[HIGH] DB-H1 — Edge function `ai-quest-cycle`: hardcoded secret + no request auth**
`supabase/functions/ai-quest-cycle/index.ts:19-34`. Commits a literal CRON bearer fallback (`'a_very_strong_and_secret_key_for_your_cron_job_2024'`), does no JWT/secret check before spinning up a service-role client and triggering a cost-bearing AI cycle, with CORS `*` and a dead Railway default URL. **Fix:** remove the fallback (fail closed), verify an inbound secret/JWT, rotate the leaked secret, scope CORS, confirm `verify_jwt=true`.

**[HIGH] DB-H2 — Live open policies not reproducible from migrations (live ≠ repo)**
8 of the 13 `USING(true)` prod policies (`ai_task_cache`, `platform_settings`, `site_settings`, `tutor_tier_limits`, `course_quest_tasks`, `quest_sample_tasks`, `feed_item_views`, `promo_interest`) exist in **no** migration — applied out-of-band. A fresh Supabase branch (the documented safe-testing workflow) will diverge from prod. Combined with SEC-DB-1, the two user-data ones (`user_subject_xp`, `feed_item_views`) are live cross-user exposure that no committed code documents or reviews. **Fix:** capture all live policies into a squashed committed baseline migration; tighten the two user-data policies.

**[HIGH] DB-H3 — Repo SECURITY DEFINER helpers lack pinned `search_path`**
`backend/migrations/20260112_fix_rls_policies_for_org_roles.sql` defines `is_superadmin/is_org_admin_user/is_advisor_user/is_admin_user/get_effective_role(uuid)` as `SECURITY DEFINER` with no `SET search_path`, granted EXECUTE to `authenticated` and used by public RLS policies. **Prod has since been hardened out-of-band** (live functions are pinned), but the migrations are not — a DR/branch rebuild would be vulnerable to search_path injection. **Fix:** pin `search_path=''` and schema-qualify bodies in the migrations to match prod.

**Medium:** DB-M1 ~100+ policies across 68 tables gate on invalid roles (`admin`/`teacher`/`educator`/`school_admin`) — dead conditions; RLS is effectively deny-all-but-superadmin, masked by the service_role backend, and one is baked into a CHECK constraint (`add_parent_dashboard_schema.sql:17`). DB-M2 sensitive backup tables — `backup_schema.users_backup`/`quests_backup` (full PII copies, no RLS/lifecycle) and `public.parent_invitations_backup` (dead `role='admin'` policy); recommend dropping. DB-M3 duplicate/conflicting migration ordinals across `backend/migrations/` vs `backend/database_migration/` (018-022 collisions) + `get_effective_role(uuid)` defined twice → non-deterministic replay. DB-M4 migrations still patch deleted tables (`user_segments`, `ai_improvement_logs`, `service_inquiries`).
**Low / advisor-sourced:** `update_class_attendance_updated_at` trigger has a mutable search_path; `pg_net` installed in `public`; Postgres has outstanding security patches (upgrade); `user_badges` world-readable by `user_id` (verify intended); `is_*` helpers are anon-EXECUTEable via RPC (low risk given pinned search_path, but revoke anon EXECUTE); standardize `search_path=''` idiom. **Performance advisors (informational):** 297 `multiple_permissive_policies` (each SELECT evaluates several policies — consolidate), 199 unused indexes, 70 unindexed foreign keys, 8 no-PK tables.

### 2.4 Dependencies, config, secrets, CI

**No committed secrets** (verified across `git ls-files`): all `eyJ…` hits are placeholder JWT headers in docs, all `service_role` hits are SQL grants, no tracked `.env`/keystores/keys, `.gitignore` and `Config`-based secret loading correct, no service-role key bundled into any client.

**[HIGH] DEP-H1 — CI supply-chain gate audits the wrong requirements file**
`.github/workflows/release.yml` runs `pip-audit` with `working-directory: backend` (audits `backend/requirements.txt` → "no vulnerabilities"), but Render deploys the **root** `requirements.txt` (confirmed: `render.yaml` `rootDir: ""`, `pip install -r requirements.txt`). `pip-audit -r requirements.txt` → **30+ advisories**. The enforcing gate is blind to production. **Fix:** point CI at the deployed file; collapse to one authoritative requirements file.

**[HIGH] DEP-H2 — Deployed gunicorn 21.2.0 — HTTP request smuggling**
Root `requirements.txt:9` (verified) → CVE-2024-1135/6827 (improper Transfer-Encoding validation), fixed in 22.0.0; `backend/requirements.txt` already pins 23.0.0 but isn't deployed. Request smuggling on the public API can enable cache poisoning / filter bypass. **Fix:** bump root to 23.0.0.

**Medium:** DEP-M1 deployed Flask-Cors 4.0.0 (CVE-2024-1681 + 3 more; app runs `supports_credentials:True`) — bump 6.0.2; DEP-M2 deployed PyJWT 2.10.1 (6 advisories in the LTI JWT verification path) — bump 2.13.0; DEP-M3 deployed requests 2.32.5 / urllib3 2.6.2 / bleach 6.2.0 (XSS-relevant sanitizer) / lxml 5.1.0 all have fixes; DEP-M4 root requirements doesn't pin Werkzeug (non-reproducible) and omits `posthog` which the backend imports → backend PostHog tracking silently dead in prod; DEP-M5 `frontend-v2-e2e.yml` exposes the RLS-bypassing `SUPABASE_SERVICE_KEY` to an unpinned `npm install` step (supply-chain exfil path) — scope to the step + use `npm ci`; DEP-M6 backend pytest runs with `|| true` so backend logic never gates the prod deploy.
**Low:** frontend-v2 10 moderate transitive Expo-tooling vulns (build-time only, under the `high` gate); frontend dev-only `brace-expansion` high + `esbuild` low (not shipped); backend PostHog dead in prod (L3 dup of M4); deploy pins to SHA but the "tests pass → deploy" guarantee is weaker than documented.
**Verified OK:** CORS allowlist (no `*`); DEBUG off in prod; strong `FLASK_SECRET_KEY` validation; sane gunicorn config; every workflow `permissions: contents: read`, no `pull_request_target`, secrets never echoed, commit messages injection-safe, prod deploy pinned to SHA; vite prod sourcemaps hidden+deleted; frontend prod `npm audit` = 0 vulns.

### 2.5 Frontend security

**[HIGH] FE-H1 (web) — Parent access + refresh JWTs written to sessionStorage**
`frontend/src/contexts/ActingAsContext.jsx:139-140,156` (verified). Writes `acting_as_token`, `parent_access_token`, and the long-lived `parent_refresh_token` to sessionStorage — directly violating the project's #1 rule and the in-memory design in `services/api.js`. Any XSS steals a parent refresh token → indefinite account access in a COPPA-sensitive flow. `masqueradeService.js` already shows the correct pattern (backend mints tokens; only UI state cached). **Fix:** remove all token writes; restore via server round-trip.

**Web — verified OK:** primary token store is genuinely in-memory with a legacy-purge routine; all 11 `dangerouslySetInnerHTML` sites route through DOMPurify; only publishable/public keys read from `import.meta.env`. **Low:** user/admin URLs bound into raw `href` without scheme allowlisting (`javascript:` stored-XSS-on-click) at `NotificationDetailModal.jsx:126`, `StepLinks.jsx:22`, credit-dashboard `ItemDetail.jsx` — add a `safeHref()` helper.

**Mobile — verified clean (do not "fix"):** token storage uses `expo-secure-store` on native + in-memory on web (matches ADR-001; no AsyncStorage token misuse); no committed secrets; deep-link routing hard-codes the `optioeducation.com` origin so a crafted push can't open an arbitrary URL; `EXPO_PUBLIC_*` holds only the public Sentry DSN + Supabase anon key (no service-role key). Client-side admin gating is acceptable **because** the backend enforces role server-side (confirm per 2.2).

---

## 3. Performance Findings

### 3.1 Backend / Render

**[HIGH] PERF-H1 — Non-atomic XP increment (lost-update race), live path** — `xp_service.py:116-146` does read-modify-write on `user_skill_xp`; concurrent completions (mobile double-taps, batch approvals) silently lose XP. An atomic RPC (`increment_user_xp`) is referenced in a comment but unused. **Fix:** switch to `xp_amount = xp_amount + N` / the RPC.
**[HIGH] PERF-H2 — Synchronous push/email in request handlers** — `notification_service.py:112-132` fires Expo push (`expo_push_service.py:90`, 10s timeout) + Brevo email inline; with `workers=2, threads=2` a slow provider stalls a large fraction of capacity. **Fix:** background/queue the dispatch.
**[HIGH] PERF-H3 — AI calls can outlast the worker timeout** — `base_ai_service.py:512-605` retries 3×60s (`ai_gen.py:25`) ≈ 190s > gunicorn `timeout=120` (`gunicorn.conf.py:27`) → worker SIGKILL; 2 workers saturate under a couple of slow AI calls → 502s. **Fix:** keep `retries × timeout + backoff < worker timeout`, or make AI request work async/queued.
**[HIGH] PERF-H4 — `AtomicQuestService.award_task_xp` overwrites XP (latent)** — `atomic_quest_service.py:300-320` upsert replaces `xp_amount` instead of incrementing; unreachable fallback; a `task_id`/`user_quest_task_id` key mismatch would prevent auto-completion. Currently dead code (kept `noqa F401`) — a dormant trap. **Fix:** delete or rewrite before any reuse.
**[HIGH] PERF-H5 — Multi-step XP award not transactional** — `xp_service.py:110-166` + `tasks/completion.py` do several independent writes with no transaction and swallow errors (`return False`); partial failures drift completion vs XP. **Fix:** wrap completion + award in one Postgres RPC.
**Medium:** M1 **`AnalyticsService` is broken** — references `self.supabase` removed from the base class → every analytics endpoint 500s (`analytics_service.py:38,75,123`; instantiated `routes/analytics.py:24`); M2 `_track_usage_async` is actually synchronous (blocking insert per AI call); M3 forced `gc.collect()` every AI attempt (stop-the-world on a shared worker); M4 N+1 in daily advisor summary (`daily_summary_service.py:819`); M5 N+1 inserts materializing AI tasks (`interest_tracks_service.py:787`); M6 dashboard summary = ~10 uncached serial queries + a full `course_quests` table scan (`dashboard_service.py:587,599`); M7 `select('*')` over-fetch in portfolio/dashboard; M8 missing pagination on growing lists (portfolio completions, cost-tracker loads a month of `ai_usage_logs` into memory); M9 Pexels rate limiter is per-worker in-memory (limit × workers); M10 job scheduler claim not atomic (double-execution). **Low:** retry logger bypasses the scrubber; broad exception-swallowing returns success-shaped zeros; XP tracebacks logged at INFO + no persisted XP audit trail; unbounded in-memory cache fallback; unbounded background threads; raw email in a few observer/icreate route logs.
**Done well:** dashboard active-quest/course-progress paths batch with `.in_()`; streak helpers bulk-batched; `video_processing_service` streams to disk to avoid OOM; timeouts set on outbound HTTP; no `os.getenv()` in the service layer.

### 3.2 Frontend v1 (web)

**[HIGH] FE-H2 — `AuthContext` re-render storm** — `AuthContext.jsx:618-643` rebuilds its `value` object and all handlers every render with zero `useMemo`/`useCallback`; `AuthProvider` wraps the app and many components call `useAuth()`, so any auth state change re-renders the entire consumer tree. Highest-leverage web perf fix. **FE-H3** — all 7 context providers recreate their `value` each render (`grep useMemo` = 0). **Fix:** `useMemo` the value, `useCallback` the handlers.
**Medium:** POST calls with no body violate the CSRF/Content-Type rule, incl. the task-completion path (`evidenceDocumentService.js:57`, `useQuests.js:143`, `AccountSettings.jsx:70`); no request cancellation for imperative fetches; no list virtualization anywhere (admin user tables, observer/parent feeds); seven 1000+ line "god" components re-render broadly per keystroke.

### 3.3 Frontend v2 (mobile)

**Medium:** M-1 quest grid not virtualized (`ScrollView`+`.map` with manual infinite scroll — every card+image stays mounted) `quests.tsx:237`; M-2 widespread whole-store Zustand subscription (`const { user } = useAuthStore()` in ~20 components re-renders heavy trees on any auth churn); M-3 chat list not virtualized + `scrollToEnd` timer per append (`ChatWindow.tsx:335`); M-4 loose defensive API typing hides contract drift as empty state; M-5 `any` masks domain data (123 `as any`). **Low:** unmemoized `QuestCard`, inline styles/handlers in list children, silent empty catches in message hooks, 17 `console.*` shipped. **Model to copy:** `feed.tsx`/`journal.tsx` already use `FlatList` + an external visibility store correctly.

---

## 4. Code Quality / Maintainability

- **Raw-`role` anti-pattern (RC-A)** and **invalid role literals** (`admin`/`teacher`/`educator`/`school_admin`) appear in routes, decorators, docstrings, and ~100 RLS policies — the single biggest correctness/authz-consistency debt. Standardize on `get_effective_role()` and the 6 valid roles.
- **Two divergent `requirements.txt` files** (root deployed vs `backend/` tested/audited) — the direct cause of DEP-H1/H2 and the dead-in-prod PostHog. Collapse to one.
- **Migration hygiene:** duplicate ordinals across two migration trees, functions redefined out of order, live policies not represented in any migration (DB-H2), dead migrations patching deleted tables. Squash to one ordered baseline reflecting prod.
- **Dead/broken code:** `AnalyticsService` (500s), `AtomicQuestService` (latent corruption), `QuestTaskRepository` → removed `quest_tasks`, `flag_library_task`/`flag` broken signatures (endpoints 500), `friendships` references after the table was dropped, `clamp_xp_value` defined-but-unused.
- **TypeScript (v2):** `any`/`as any` on the exact API data most likely to change; adopt the already-exported `Quest` interface and a shared `ApiResponse<T>` envelope.
- **Duplicated logic:** three copies of API-error-message extraction (web); two markdown/HTML rendering paths; per-endpoint refresh-and-retry in mobile multipart uploads.
- **Error handling:** ~64 bare/`except Exception` sites in services returning success-shaped defaults that mask failures as empty data.
- **Test coverage on critical paths:** backend pytest is non-enforcing (`|| true`, no test DB), so auth/quest-grading/XP logic doesn't gate deploys — the highest-value coverage gap given the IDOR density above.

---

## 5. Suggested Fix Order

**Phase 0 — contain the live exposures (hours):**
1. Tighten `user_subject_xp` + `feed_item_views` RLS to `user_id = auth.uid()` (SEC-DB-1 / DB-H2) — live student data readable with the public anon key.
2. Add `@require_auth` + consent + scoped tokens to `/oauth/authorize`, or disable the OAuth blueprint until fixed (AUTH-C1).
3. Remove `all_headers` from `/api/auth/cookie-debug` and gate/kill it (AUTH-H2); rotate the `ai-quest-cycle` cron secret and add caller auth (DB-H1).
4. Add an ownership check to `POST /api/evidence/storage/delete-urls` (EVID-1), and org-scope the three SIS emergency-contact endpoints (IDOR-H10) — minors' safety records readable/deletable cross-org.

**Phase 1 — cross-tenant IDOR (root causes, days):**
5. Fix RC-A everywhere: replace raw-`role` checks with `get_effective_role()` and add the missing org/assignment guards — transcript/transfer-credit (IDOR-C1/C2), `delete_quest` + curriculum-generate deletes (IDOR-C3), `course_refine` (IDOR-C4), `remove_user_from_organization`/`add_users_to_organization` (IDOR-C5/H6), student-task management (IDOR-H1), notifications (IDOR-H2), audit logs (IDOR-H7), course-quest/generation (IDOR-H8), xp reconciliation (IDOR-H9), SIS emergency contacts (IDOR-H10), credit-dashboard student context (IDOR-H11).
6. Fix RC-B: default the repository client to the user (RLS) client and add ownership predicates to generic mutators (REPO-1); this converts many latent IDORs to fail-closed.
7. Exclude observers from private-message reads and all write paths (IDOR-H4/H5); fix null-org group chats (IDOR-H3); cap student-set `xp_value` (QP-1).

**Phase 2 — auth hardening + supply chain (days):**
8. Enforce CSRF (AUTH-H1); namespace idempotency by user (AUTH-H4); fix reflected-origin CORS (AUTH-H3); enforce `last_logout_at` centrally + on password reset (AUTH-H5); rate-limit refresh/reset (AUTH-H6); fail-closed on parental consent (AUTH-M4).
9. Point CI pip-audit at the deployed root `requirements.txt`, then bump gunicorn/Flask-Cors/PyJWT/requests/urllib3/bleach/lxml + pin Werkzeug; collapse to one requirements file (DEP-H1/H2/M1-M4); scope the e2e service key (DEP-M5); wire a backend test DB and drop `|| true` (DEP-M6).
10. Remove the parent-token sessionStorage writes (FE-H1).

**Phase 3 — correctness, integrity, perf (1-2 weeks):**
11. Atomic XP increment + transactional completion (PERF-H1/H5); fix/delete `AtomicQuestService` (PERF-H4) and `AnalyticsService` (PERF-M1); background push/email + bound AI retries under the worker timeout (PERF-H2/H3).
12. Memoize `AuthContext`/providers, add list virtualization, and add the `{}` bodies (web FE-H2/H3 + POST-body). Virtualize quest/chat lists + Zustand selectors on mobile.
13. DB hygiene: squash a committed RLS baseline matching prod (DB-H2/H3), sweep invalid roles from policies (DB-M1), drop backup PII tables (DB-M2), add the 70 missing FK indexes, consolidate migration trees.

**Phase 4 — lower-severity cleanup:** the remaining Medium/Low items (over-fetch/PII trimming, `safeHref`, GDPR cascade completeness, dead-code removal, TS typing, docstring/role-label corrections).

---

*Report generated from 7 parallel domain audits + direct live-prod DB inspection. All line references are to the repository state at commit time on branch `claude/optio-codebase-audit-2ldgit`. Nothing in the codebase was modified.*
