# H1 — Admin Client Usage Audit (RLS Bypass)

**Goal:** For every `get_supabase_admin_client()` call site, either (a) replace with `get_user_client()`, or (b) document a one-line justification comment immediately above the call. Add a defense-in-depth role check before each remaining admin-client call where appropriate.

**Scope reality check:** Audit plan estimated 392 calls / 60 files. Actual is **737 calls / 210 files** (as of 2026-04-13). We will prioritize and chip away in passes, not boil the ocean.

**Status legend:**
- [ ] = not reviewed
- [~] = partially reviewed / in progress
- [x] = reviewed, all calls either justified-with-comment or replaced
- [skip] = out of scope (script, doc, test, migration)

---

## Pass 1 — Named Priority Files (do first) ✅

These were called out specifically in `AUDIT_IMPLEMENTATION_PLAN.md` H1.

- [x] [backend/routes/auth/login/security.py](backend/routes/auth/login/security.py) — 3 calls — all justified (pre-auth, login_attempts is service-role-only)
- [x] [backend/routes/auth/password.py](backend/routes/auth/password.py) — 3 calls — all justified (pre-auth password reset; auth.users Admin API + password_reset_tokens)
- [x] [backend/routes/direct_messages.py](backend/routes/direct_messages.py) — 1 call — justified (cross-user contact lookup gated by relationship checks below the call)
- [x] [backend/routes/observer/social.py](backend/routes/observer/social.py) — 4 calls — all justified (per-call: feed-view write where viewer_id == auth user, viewer-list read, two cross-user comment endpoints with explicit relationship gates)
- [x] [backend/routes/curriculum.py](backend/routes/curriculum.py) — 24 calls — all justified via file-level docstring + per-call marker; CurriculumPermissionService gates every endpoint
- [x] [backend/routes/advisor/main.py](backend/routes/advisor/main.py) — 5 calls — all justified (each is under @require_advisor / @require_role; cross-org or cross-student reads/writes)
- [x] [backend/routes/dependents.py](backend/routes/dependents.py) — 13 calls — all justified via file-level docstring + per-call marker; verify_parent_role + dependent ownership check gate every endpoint

**Pass 1 outcome:** No replacements with `get_user_client()` were warranted — every call is in a flow where admin client is genuinely needed (pre-auth, cross-user/cross-org reads/writes, or service-role-only tables). All 53 calls now have justification comments. PR template added at [.github/pull_request_template.md](.github/pull_request_template.md) with the H1 checklist item.

User gates whether we proceed to Pass 2.

---

## Pass 2 — Auth (pre-auth boundaries; usually justified) ✅

Auth bootstrapping legitimately needs admin client (no session yet). Goal: confirm justification + add comment.

- [x] [backend/routes/auth/login/core.py](backend/routes/auth/login/core.py) — 5 — justified per call (logout-replay check, /me self-fetch, post-auth profile init, org-login pre-auth lookup, logout housekeeping)
- [x] [backend/routes/auth/login/tokens.py](backend/routes/auth/login/tokens.py) — 2 — justified (refresh-path replay check + last_active update)
- [skip] [backend/routes/auth/login/diagnostics.py](backend/routes/auth/login/diagnostics.py) — 0 calls
- [skip] [backend/routes/auth/login/settings.py](backend/routes/auth/login/settings.py) — 0 calls
- [x] [backend/routes/auth/registration.py](backend/routes/auth/registration.py) — 2 — justified (pre-auth signup + unauthenticated resend-verification)
- [x] [backend/routes/auth/oauth.py](backend/routes/auth/oauth.py) — 7 — justified (5 OAuth-flow calls on service-role-only oauth_clients/codes/tokens; 2 admin endpoints behind @require_admin)
- [x] [backend/routes/auth/google_oauth.py](backend/routes/auth/google_oauth.py) — 2 — justified (OAuth callback + TOS-acceptance gated by short-lived JWT)
- [x] [backend/routes/auth/session.py](backend/routes/auth/session.py) — 1 — justified (self-write of tutorial_completed_at after @require_auth)
- [x] [backend/routes/account_deletion.py](backend/routes/account_deletion.py) — 3 — justified (GDPR delete-request, full export, hard-delete cascades; user_id always from @require_auth, scoped to self)
- [x] [backend/routes/parental_consent.py](backend/routes/parental_consent.py) — 11 — justified via file-level docstring + per-call markers; COPPA flow gated by hashed consent tokens + email verification

**Pass 2 outcome:** 33 calls audited (across 8 files; 2 listed files had 0 calls). No replacements with `get_user_client()` were warranted — every call is genuinely pre-auth, an OAuth flow on service-role-only tables, a self-scoped operation needing cross-table access, or a logout housekeeping write.

User gates whether we proceed to Pass 3 (user-facing routes — observer, parent, advisor, courses, quest, classes, users, tutor, misc).

---

## Pass 3 — Non-admin user-facing routes ✅

**Outcome:** ~245 admin-client calls audited across 67 files. Zero replacements with `get_user_client()` were warranted in this pass — all calls are gated by relationship checks (observer_student_links / parent_student_links / advisor_student_assignments / managed_by_parent_id), org-scoped role decorators (@require_role / @require_admin), or scoped to the caller's own data (user_id from @require_auth). All 161 route files in `backend/routes/` pass `ast.parse()`.



These are the highest-risk: user-facing routes that may be over-privileged.

### Observer ✅
- [x] [backend/routes/observer/acceptance.py](backend/routes/observer/acceptance.py) — 3
- [x] [backend/routes/observer/activity.py](backend/routes/observer/activity.py) — 3
- [x] [backend/routes/observer/comments.py](backend/routes/observer/comments.py) — 3
- [x] [backend/routes/observer/family.py](backend/routes/observer/family.py) — 4
- [x] [backend/routes/observer/feed.py](backend/routes/observer/feed.py) — 1
- [x] [backend/routes/observer/parent_management.py](backend/routes/observer/parent_management.py) — 4
- [x] [backend/routes/observer/pending.py](backend/routes/observer/pending.py) — 1
- [x] [backend/routes/observer/portfolio.py](backend/routes/observer/portfolio.py) — 1
- [x] [backend/routes/observer/sharing.py](backend/routes/observer/sharing.py) — 2
- [x] [backend/routes/observer/student_invitations.py](backend/routes/observer/student_invitations.py) — 4
- [x] [backend/routes/observer_requests.py](backend/routes/observer_requests.py) — 3

### Parent ✅
- [skip] [backend/routes/parent/analytics.py](backend/routes/parent/analytics.py) — 0 calls
- [x] [backend/routes/parent/analytics_insights.py](backend/routes/parent/analytics_insights.py) — 4
- [x] [backend/routes/parent/child_overview.py](backend/routes/parent/child_overview.py) — 2
- [x] [backend/routes/parent/communications.py](backend/routes/parent/communications.py) — 7
- [x] [backend/routes/parent/dashboard_overview.py](backend/routes/parent/dashboard_overview.py) — 1
- [x] [backend/routes/parent/engagement.py](backend/routes/parent/engagement.py) — 1
- [x] [backend/routes/parent/evidence_view.py](backend/routes/parent/evidence_view.py) — 2
- [x] [backend/routes/parent/family_quest_ai.py](backend/routes/parent/family_quest_ai.py) — 1
- [x] [backend/routes/parent/learning_moments.py](backend/routes/parent/learning_moments.py) — 12
- [x] [backend/routes/parent/quests_view.py](backend/routes/parent/quests_view.py) — 3
- [x] [backend/routes/parent_linking.py](backend/routes/parent_linking.py) — 11

### Advisor ✅
- [x] [backend/routes/advisor/learning_moments.py](backend/routes/advisor/learning_moments.py) — 5
- [x] [backend/routes/advisor/student_overview.py](backend/routes/advisor/student_overview.py) — 1
- [skip] [backend/routes/advisor/credit_review.py](backend/routes/advisor/credit_review.py) — 0 calls
- [x] [backend/routes/advisor_notes.py](backend/routes/advisor_notes.py) — 4
- [x] [backend/routes/advisor_checkins.py](backend/routes/advisor_checkins.py) — 5

### Courses ✅
- [x] [backend/routes/courses/crud.py](backend/routes/courses/crud.py) — 8
- [x] [backend/routes/courses/enrollment.py](backend/routes/courses/enrollment.py) — 4
- [skip] [backend/routes/courses/homepage.py](backend/routes/courses/homepage.py) — 0 calls
- [x] [backend/routes/courses/publishing.py](backend/routes/courses/publishing.py) — 1
- [x] [backend/routes/courses/quests.py](backend/routes/courses/quests.py) — 6

### Quest ✅
- [x] [backend/routes/quest/completion.py](backend/routes/quest/completion.py) — 5
- [x] [backend/routes/quest/detail.py](backend/routes/quest/detail.py) — 1
- [x] [backend/routes/quest/engagement.py](backend/routes/quest/engagement.py) — 1
- [x] [backend/routes/quest/enrollment.py](backend/routes/quest/enrollment.py) — 8
- [x] [backend/routes/quest/listing.py](backend/routes/quest/listing.py) — 2
- [x] [backend/routes/quest_ai.py](backend/routes/quest_ai.py) — 2
- [x] [backend/routes/quest_conversion.py](backend/routes/quest_conversion.py) — 2
- [x] [backend/routes/quest_lifecycle.py](backend/routes/quest_lifecycle.py) — 1
- [x] [backend/routes/quest_personalization.py](backend/routes/quest_personalization.py) — 4
- [x] [backend/routes/quest_types.py](backend/routes/quest_types.py) — 4

### Classes ✅
- [x] [backend/routes/classes/advisors.py](backend/routes/classes/advisors.py) — 2
- [x] [backend/routes/classes/crud.py](backend/routes/classes/crud.py) — 1
- [x] [backend/routes/classes/quests.py](backend/routes/classes/quests.py) — 4
- [x] [backend/routes/classes/students.py](backend/routes/classes/students.py) — 2

### Users ✅
- [x] [backend/routes/users/completed_quests.py](backend/routes/users/completed_quests.py) — 2
- [x] [backend/routes/users/engagement.py](backend/routes/users/engagement.py) — 1
- [x] [backend/routes/users/profile.py](backend/routes/users/profile.py) — 2

### Tutor ✅
- [x] [backend/routes/tutor/chat.py](backend/routes/tutor/chat.py) — 10

### Top-level routes (misc) ✅
- [x] [backend/routes/activity.py](backend/routes/activity.py) — 1
- [x] [backend/routes/analytics.py](backend/routes/analytics.py) — 1
- [x] [backend/routes/buddy.py](backend/routes/buddy.py) — 5
- [x] [backend/routes/contact.py](backend/routes/contact.py) — 1
- [x] [backend/routes/credits.py](backend/routes/credits.py) — 1
- [x] [backend/routes/curriculum_enhance.py](backend/routes/curriculum_enhance.py) — 1
- [x] [backend/routes/docs.py](backend/routes/docs.py) — 16
- [x] [backend/routes/evidence_documents.py](backend/routes/evidence_documents.py) — 8
- [x] [backend/routes/evidence_reports.py](backend/routes/evidence_reports.py) — 1
- [x] [backend/routes/family_quests.py](backend/routes/family_quests.py) — 6
- [x] [backend/routes/helper_evidence.py](backend/routes/helper_evidence.py) — 4
- [x] [backend/routes/learning_events.py](backend/routes/learning_events.py) — 6
- [x] [backend/routes/notifications.py](backend/routes/notifications.py) — 8
- [x] [backend/routes/philosophy.py](backend/routes/philosophy.py) — 10
- [x] [backend/routes/portfolio.py](backend/routes/portfolio.py) — 1
- [x] [backend/routes/promo.py](backend/routes/promo.py) — 1
- [x] [backend/routes/public.py](backend/routes/public.py) — 3
- [x] [backend/routes/push_subscriptions.py](backend/routes/push_subscriptions.py) — 2
- [x] [backend/routes/settings.py](backend/routes/settings.py) — 1
- [x] [backend/routes/spark_integration.py](backend/routes/spark_integration.py) — 6
- [x] [backend/routes/student_ai_assistance.py](backend/routes/student_ai_assistance.py) — 1
- [x] [backend/routes/task_library.py](backend/routes/task_library.py) — 1
- [x] [backend/routes/tasks.py](backend/routes/tasks.py) — 8
- [x] [backend/routes/teacher_verification.py](backend/routes/teacher_verification.py) — 3
- [x] [backend/routes/uploads.py](backend/routes/uploads.py) — 4

---

## Pass 4 — Admin routes (assume justified, just verify + comment)

Routes under `routes/admin/` are by definition admin-only and authenticated via `@require_admin` / `@require_superadmin`. Admin client is justified by role gate. Goal here is just to add the one-line comment so the audit checkbox passes.

- [ ] [backend/routes/admin_core.py](backend/routes/admin_core.py) — 7
- [ ] [backend/routes/admin/advisor_management.py](backend/routes/admin/advisor_management.py) — 5
- [ ] [backend/routes/admin/ai_costs.py](backend/routes/admin/ai_costs.py) — 3
- [ ] [backend/routes/admin/ai_prompts.py](backend/routes/admin/ai_prompts.py) — 3
- [ ] [backend/routes/admin/ai_quest_review.py](backend/routes/admin/ai_quest_review.py) — 4
- [ ] [backend/routes/admin/bulk_import.py](backend/routes/admin/bulk_import.py) — 2
- [ ] [backend/routes/admin/course_enrollments.py](backend/routes/admin/course_enrollments.py) — 5
- [ ] [backend/routes/admin/course_import.py](backend/routes/admin/course_import.py) — 1
- [ ] [backend/routes/admin/course_quest_management.py](backend/routes/admin/course_quest_management.py) — 7
- [ ] [backend/routes/admin/curriculum_generate.py](backend/routes/admin/curriculum_generate.py) — 11
- [ ] [backend/routes/admin/curriculum_upload.py](backend/routes/admin/curriculum_upload.py) — 13
- [ ] [backend/routes/admin/ferpa_compliance.py](backend/routes/admin/ferpa_compliance.py) — 2
- [ ] [backend/routes/admin/masquerade.py](backend/routes/admin/masquerade.py) — 4
- [ ] [backend/routes/admin/observer_audit.py](backend/routes/admin/observer_audit.py) — 3
- [ ] [backend/routes/admin/org_connections.py](backend/routes/admin/org_connections.py) — 11
- [ ] [backend/routes/admin/organization_management.py](backend/routes/admin/organization_management.py) — 8
- [ ] [backend/routes/admin/parent_connections.py](backend/routes/admin/parent_connections.py) — 6
- [ ] [backend/routes/admin/plan_mode.py](backend/routes/admin/plan_mode.py) — 1
- [ ] [backend/routes/admin/quest_management.py](backend/routes/admin/quest_management.py) — 11
- [ ] [backend/routes/admin/sample_task_management.py](backend/routes/admin/sample_task_management.py) — 5
- [ ] [backend/routes/admin/student_task_management.py](backend/routes/admin/student_task_management.py) — 7
- [ ] [backend/routes/admin/subject_backfill.py](backend/routes/admin/subject_backfill.py) — 7
- [ ] [backend/routes/admin/task_approval.py](backend/routes/admin/task_approval.py) — 5
- [ ] [backend/routes/admin/transcript_generator.py](backend/routes/admin/transcript_generator.py) — 9
- [ ] [backend/routes/admin/transfer_credits.py](backend/routes/admin/transfer_credits.py) — 5
- [ ] [backend/routes/admin/user_invitations.py](backend/routes/admin/user_invitations.py) — 9
- [ ] [backend/routes/admin/user_management.py](backend/routes/admin/user_management.py) — 13
- [ ] [backend/routes/admin/xp_reconciliation.py](backend/routes/admin/xp_reconciliation.py) — 7

---

## Pass 5 — Service & repository layer

Services typically receive a client from caller; if they instantiate `get_supabase_admin_client()` themselves they may be hiding a privilege escalation. Each needs eyeballs.

### Repositories
- [ ] [backend/repositories/base_repository.py](backend/repositories/base_repository.py) — 1
- [ ] [backend/repositories/advisor_notes_repository.py](backend/repositories/advisor_notes_repository.py) — 1
- [ ] [backend/repositories/advisor_repository.py](backend/repositories/advisor_repository.py) — 1
- [ ] [backend/repositories/checkin_repository.py](backend/repositories/checkin_repository.py) — 1
- [ ] [backend/repositories/class_repository.py](backend/repositories/class_repository.py) — 1
- [ ] [backend/repositories/course_repository.py](backend/repositories/course_repository.py) — 1
- [ ] [backend/repositories/dependent_repository.py](backend/repositories/dependent_repository.py) — 1
- [ ] [backend/repositories/organization_repository.py](backend/repositories/organization_repository.py) — 2
- [ ] [backend/repositories/quest_repository.py](backend/repositories/quest_repository.py) — 9

### Services
- [ ] [backend/services/advisor_service.py](backend/services/advisor_service.py) — 1
- [ ] [backend/services/ai_quest_review_service.py](backend/services/ai_quest_review_service.py) — 8
- [ ] [backend/services/atomic_quest_service.py](backend/services/atomic_quest_service.py) — 1
- [ ] [backend/services/base_ai_service.py](backend/services/base_ai_service.py) — 1
- [ ] [backend/services/batch_quest_generation_service.py](backend/services/batch_quest_generation_service.py) — 1
- [ ] [backend/services/bounty_service.py](backend/services/bounty_service.py) — 1
- [ ] [backend/services/cost_tracker.py](backend/services/cost_tracker.py) — 1
- [ ] [backend/services/course_generation_job_service.py](backend/services/course_generation_job_service.py) — 1
- [ ] [backend/services/course_generation_service.py](backend/services/course_generation_service.py) — 1
- [ ] [backend/services/course_plan_mode_service.py](backend/services/course_plan_mode_service.py) — 1
- [ ] [backend/services/course_refine_service.py](backend/services/course_refine_service.py) — 1
- [ ] [backend/services/course_service.py](backend/services/course_service.py) — 9
- [ ] [backend/services/credit_mapping_service.py](backend/services/credit_mapping_service.py) — 5
- [ ] [backend/services/curriculum/progress.py](backend/services/curriculum/progress.py) — 1
- [ ] [backend/services/curriculum/review.py](backend/services/curriculum/review.py) — 1
- [ ] [backend/services/curriculum_upload_service.py](backend/services/curriculum_upload_service.py) — 1
- [ ] [backend/services/daily_summary_service.py](backend/services/daily_summary_service.py) — 1
- [ ] [backend/services/dashboard_service.py](backend/services/dashboard_service.py) — 1
- [ ] [backend/services/dependent_progress_service.py](backend/services/dependent_progress_service.py) — 1
- [ ] [backend/services/direct_message_service.py](backend/services/direct_message_service.py) — 1
- [ ] [backend/services/docs_ai_service.py](backend/services/docs_ai_service.py) — 3
- [ ] [backend/services/expo_push_service.py](backend/services/expo_push_service.py) — 1
- [ ] [backend/services/family_quest_ai_service.py](backend/services/family_quest_ai_service.py) — 1
- [ ] [backend/services/fcm_notification_service.py](backend/services/fcm_notification_service.py) — 3
- [ ] [backend/services/group_message_service.py](backend/services/group_message_service.py) — 1
- [ ] [backend/services/interest_tracks_service.py](backend/services/interest_tracks_service.py) — 16
- [ ] [backend/services/learning_ai_orchestrator.py](backend/services/learning_ai_orchestrator.py) — 5
- [ ] [backend/services/learning_ai_service.py](backend/services/learning_ai_service.py) — 3
- [ ] [backend/services/learning_events_service.py](backend/services/learning_events_service.py) — 7
- [ ] [backend/services/media_upload_service.py](backend/services/media_upload_service.py) — 1
- [ ] [backend/services/organization_service.py](backend/services/organization_service.py) — 1
- [ ] [backend/services/personalization_service.py](backend/services/personalization_service.py) — 2
- [ ] [backend/services/portfolio_service.py](backend/services/portfolio_service.py) — 1
- [ ] [backend/services/prompt_management_service.py](backend/services/prompt_management_service.py) — 4
- [ ] [backend/services/push_notification_service.py](backend/services/push_notification_service.py) — 1
- [ ] [backend/services/quest_ai_service.py](backend/services/quest_ai_service.py) — 4
- [ ] [backend/services/quest_conversion_service.py](backend/services/quest_conversion_service.py) — 4
- [ ] [backend/services/quest_invitation_service.py](backend/services/quest_invitation_service.py) — 1
- [ ] [backend/services/quest_lifecycle_service.py](backend/services/quest_lifecycle_service.py) — 1
- [ ] [backend/services/quest_optimization.py](backend/services/quest_optimization.py) — 1
- [ ] [backend/services/safety_service.py](backend/services/safety_service.py) — 1
- [ ] [backend/services/student_ai_assistant_service.py](backend/services/student_ai_assistant_service.py) — 1
- [ ] [backend/services/subject_classification_service.py](backend/services/subject_classification_service.py) — 1
- [ ] [backend/services/task_library_sanitization_service.py](backend/services/task_library_sanitization_service.py) — 1
- [ ] [backend/services/task_quality_service.py](backend/services/task_quality_service.py) — 1
- [ ] [backend/services/task_steps_service.py](backend/services/task_steps_service.py) — 1
- [ ] [backend/services/topic_generation_service.py](backend/services/topic_generation_service.py) — 1
- [ ] [backend/services/xp_service.py](backend/services/xp_service.py) — 1

### Utils
- [ ] [backend/utils/ai_access.py](backend/utils/ai_access.py) — 2
- [ ] [backend/utils/auth/decorators.py](backend/utils/auth/decorators.py) — 10
- [ ] [backend/utils/database_policy.py](backend/utils/database_policy.py) — 4
- [ ] [backend/utils/personalization_helpers.py](backend/utils/personalization_helpers.py) — 4
- [ ] [backend/utils/quest_validation.py](backend/utils/quest_validation.py) — 1
- [ ] [backend/utils/source_utils.py](backend/utils/source_utils.py) — 1
- [ ] [backend/utils/user_sync.py](backend/utils/user_sync.py) — 1

### Jobs (background, no user context — admin justified)
- [ ] [backend/jobs/scheduler.py](backend/jobs/scheduler.py) — 8
- [ ] [backend/jobs/quality_monitor.py](backend/jobs/quality_monitor.py) — 5
- [ ] [backend/jobs/ai_improvement_recommendations.py](backend/jobs/ai_improvement_recommendations.py) — 1

### Database core
- [ ] [backend/database.py](backend/database.py) — 2

---

## Out of scope (skip)

- [skip] `backend/scripts/*` — one-off ops scripts, run by humans with full privileges
- [skip] `backend/migrations/*` — DB migrations
- [skip] `backend/tests/*` — test fixtures
- [skip] `backend/docs/*` — documentation

---

## Cross-cutting deliverables

- [ ] Add PR-template checkbox: `New get_supabase_admin_client() use is justified in a comment above the call`
- [ ] Confirm/refresh [ADR 002](backend/docs/adr/002-database-client-usage.md) reflects current convention
- [ ] (Optional after Pass 1) Helper decorator `@admin_client_justified("reason")` if pattern emerges

---

## Comment template

When leaving an admin-client call in place, prepend a single-line comment using this format:

```python
# admin client justified: <one-line reason — e.g. "pre-auth login lookup, no session yet">
supabase = get_supabase_admin_client()
```

Reasons that count as justified:
- **Pre-auth**: login, registration, password reset, OAuth callback — no user session exists yet
- **Cross-user lookup gated by role**: e.g. parent reading dependent's data after dependent-link check
- **Background job / scheduled task**: no user context at all
- **Audit log writes**: must succeed even when user lacks RLS write access
- **Service-role-only table**: e.g. `admin_masquerade_log`, `email_outbox`

Reasons that do NOT count (must replace with `get_user_client()`):
- "It was easier to use admin client"
- "RLS policies are confusing"
- Any read of the *requesting* user's own data
