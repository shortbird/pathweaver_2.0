# Stale docs — for Tanner to decide

Output of the `docs/` audit of 2026-09-08. Every file in `docs/` was classified
**current**, **stale**, or **superseded**.

- **Superseded** (content replaced by an authoritative successor that exists
  today) → deleted. Five files, listed in §1 for the record.
- **Stale** (not wrong, just finished — a plan for work that shipped, a triage
  note for a closed ticket, a duplicate whose twin may hold unique content) →
  **listed below, nothing deleted.** These need a human call.
- **Current** → left alone, not listed.

The rule applied throughout: if a file had *any* inbound reference from code, a
workflow, or another doc, it was not deleted regardless of how stale it read.

---

## 1. Already deleted (superseded)

| File | Lines | Successor |
|---|---|---|
| `ADMIN_CLIENT_USAGE.md` | 342 | ADR 002 + `tests/unit/test_admin_client_justified.py` |
| `ADMIN_CLIENT_USAGE_AUDIT.md` | 153 | same — this was a near-duplicate of the above |
| `AUTHENTICATION_ANALYSIS.md` | 432 | `docs/ADR-001-token-storage.md`, `backend/docs/adr/003`, `004` |
| `SESSION_PERSISTENCE.md` | 259 | SEC-14's key model. **Also published two 64-hex secrets** — see REGISTER.md NEEDS TANNER §1 |
| `SIS_MVP.md` | 148 | `SIS_IMPLEMENTATION_PLAN.md`, per its own banner |

Plus, in the previous commit: `docs/audit-2026-08/` (3,964 lines) and
`docs/archive/` (98 files, 12,479 lines).

---

## 2. Stale — your call

**Decided 2026-09-11: deleted.** 49 files and 11,566 lines came out of `docs/`
(155 files → 106; 28,567 lines of markdown → 17,001). Everything in §2a, §2b,
§2c and §2e below is gone, with three exceptions and one correction:

- **Kept: everything in §2d.** Business and marketing material was listed only
  so the audit was complete and was recommended for keeping. It was not
  touched.
- **Kept: `icreate/FAB_TRIAGE_2026-07-29_enrollment_counts.md`.** It is the
  postmortem `backend/utils/db_truncation_canary.py` cites for the
  never-count-rows-in-Python rule. Its one link to a deleted sibling now points
  at git history.
- **Kept: `backend/docs/ENVIRONMENT_VARIABLES.md`**, the third env doc. Only
  the `docs/` copy was deleted; `backend/docs/` is the designated location.
- **Correction, found while deleting `SIS_ARCHITECTURE_DISCOVERY.md`.** Its
  §1.5 "locked decision" — no payment processor, Simple Biz Suite collects —
  was **reversed** after it was written: `sis_billing_service.py` runs Stripe
  Checkout and autopay on each school's own account. Three docstrings
  (`sis_pricing`, `sis_billing_service`, `sis_reports_service`) cited that
  section and repeated the claim; they now describe the code beneath them.
  The concern in §2b about deleting it "blind" turned out to be backwards —
  the doc was the thing misleading the reader.
- `EVIDENCE_ATTACH_IOS_2026-07-30.md` was checked before deletion: the report
  is marked resolved in `bug_reports` and no iOS photo/upload/attach report has
  arrived in the six weeks since. Not an open bug.

The lists below are left as written so the reasoning survives.

Grouped by why they were stale.

### 2a. Duplicate pairs — one of each is probably redundant

Both survive because I could not confirm the surviving twin contains everything
the other does, and CLAUDE.md designates the `backend/docs/` copy in each case.

| File | Twin (authoritative per CLAUDE.md) | Note |
|---|---|---|
| `docs/REPOSITORY_PATTERN.md` (547L) | `backend/docs/REPOSITORY_PATTERN.md` (401L) | The `docs/` copy is **longer** and dated 2025-01-22 "Sprint 2". Diff them before deleting either |
| `docs/SERVICE_LAYER_PATTERNS.md` (472L) | `backend/docs/SERVICE_LAYER_PATTERN_GUIDE.md` | Jan 2025 vs Dec 2025. Same subject, different vintages |
| `docs/ENVIRONMENT_VARIABLES.md` (304L) | `backend/docs/ENV_KEYS_REFERENCE.md` | **Three** env docs exist (the third is `backend/docs/ENVIRONMENT_VARIABLES.md`, 472L). See the defect note below |

> **Defect found while comparing these, not fixed** (structural pass, no
> behaviour changes): `docs/ENVIRONMENT_VARIABLES.md:32` says
> `FLASK_SECRET_KEY` is "Secret key for JWT signing". Since SEC-14 that is
> wrong — `JWT_SECRET_KEY` holds the Supabase JWT secret and signs sessions;
> `FLASK_SECRET_KEY` signs only `sis_pay_links`. The file does not mention
> `JWT_SECRET_KEY` at all. Separately, **none of the three env docs documents
> `ORG_SECRETS_ENCRYPTION_KEY`, `PLATFORM_STAFF_EMAILS`, or
> `OAUTH_PROVIDER_ENABLED`**, all of which are live `Config` keys.

### 2b. Plans for work that has shipped

Accurate when written; the code is now the truth. Candidates for deletion once
you confirm none is still a reference.

| File | Lines | Evidence |
|---|---|---|
| `SIS_ARCHITECTURE_DISCOVERY.md` | 286 | Self-declared "Superseded by implementation". **Do not delete blind**: `sis_billing_service.py` and `sis_pricing.py` cite its §1.5 for who processes payments (Simple Biz Suite collects). Move that decision somewhere live first |
| `SIS_IMPLEMENTATION_PLAN.md` | 270 | The build blueprint for the 7-phase SIS, all shipped. Two other docs point at it as "current state" |
| `SIS_SCHOOL_DASHBOARD_PLAN.md` | 253 | Says "Status: Implemented" in its own header |
| `OEA_HS_Phase2_TransferCredits_GradePeriods_Reporting_Plan.md` | 433 | Phase 2 plan; transfer credits are live (SEC-15 logs disclosures on them) |
| `OEA_Implementation_Plan_for_Approval.md` | 230 | 2026-05 approval doc; OEA is live |
| `PRD_OpenEd_Academy_Integration.md` | 335 | 2026-03 PRD, "Updated with OEA Feedback"; superseded by the two above |
| `LTI_FRONTEND_REDESIGN.md` | 273 | "Draft for review", 2026-05-19. LTI is live and in daily use; whether this redesign happened is not recorded anywhere |
| `gryffin/GRYFFIN_BUILD_PLAN.md` | 478 | 2026-06 build plan; Gryffin is a live org with a live registration link |
| `gryffin/GRYFFIN_SIS_PLAN.md` | 181 | same |
| `hearthwood/ACCOUNT_CREATION_TEST_PLAN.md` | 166 | 2026-08 test plan for a flow now in production |
| `JJ/` (8 files) | 2,564 | Treehouse build/test docs from 2026-06. `student.txt` + `teacher.txt` are 1,409 lines of raw notes. Treehouse routes exist and are gated by SEC-10 |
| `blocks/` (7 files) | 2,159 | Explicitly says "Branch `blocks/backbone`. **Nothing on `main`.**" Two 950-line JSON parity baselines. Live work-in-progress on a branch, or abandoned — only you know |

### 2c. Point-in-time triage records for closed tickets

Each documents one incident. Keep as institutional memory or delete as noise.

| File | Lines | Note |
|---|---|---|
| `PORTFOLIO_PRIVACY_AUDIT_2026-07-31.md` | 350 | The audit that led to the 2026-08-01 C/H findings. Its successor (`AUDIT.md`) is now deleted, so this is the last surviving prose on that work outside CLOSED_FINDINGS §3 |
| `SESSION_LOGOUT_AUDIT_2026-07-30.md` | 142 | Triage of one bug report |
| `EVIDENCE_ATTACH_IOS_2026-07-30.md` | 142 | **Read this one.** Header: "Status: not fixed. Instrumented so the next report identifies the cause." Two reports from one student, 18 days apart, July 2026. If nobody ever read the instrumentation, this is an **open bug**, not a stale doc |
| `icreate/` — 12 dated triage/shipped records | ~2,400 | `ROUND6/8/9/10/11_SHIPPED`, `FAB_TRIAGE_2026-07-27/-07-29/-08-20`, `PERCH_TRIAGE`, `PERCH_SWEEP`, `PERCH_CLIENT_REPLIES` ×2. Delivery logs for a client engagement. **Keep `FAB_TRIAGE_2026-07-29_enrollment_counts.md`** — CLAUDE.md cites it as the postmortem for the row-truncation rule |
| `icreate/BACKLOG_RECONCILIATION_2026-08-06.md` | 85 | Reconciled backlog, superseded by `BACKLOG_PLAN_2026-08-18.md` |
| `wasc/` (2 files) | 139 | 2026-07 accreditation announcement drafts |

### 2d. Business and marketing material — not engineering docs

Listed only so the audit is complete. All are plausibly still wanted; none is a
reference for the codebase. **Recommend keeping all of these.**

`GRANT_EXECUTIVE_SUMMARY.md`, `CREDIT_PARTNER_PROGRAM_PLAN.md` (+ print HTML and
PDF), `partner/` (3), `POE_LAUNCH_PLAN.md`, `IHUB_MAKERSPACE_QUESTS.md`,
`aspen-peaks-pitch-outline.md`, `marketing-strategy-2026-04-22.md`,
`optio-core-direction.md`, `marketing/` (26), `ago/` (3), `disclosures/` (2),
`oea/` (2), the four PDFs, `buddy.md`, `course_overview.md`.

One note: `docs/` holds **~40,000 lines of PDF and image binaries** (four PDFs
plus two JPEGs in `ago/`) counted as text by `wc`. They dominate any line-count
measurement of this directory and are not documentation debt.

### 2e. Stale but low-cost to keep

| File | Lines | Note |
|---|---|---|
| `SECURITY_CHECKLIST.md` | 174 | A **pull-request** checklist. This repo ships by direct push to `main` with no PR (OPS-05 WONTFIX), so it gates nothing. Its content is sound; its premise is not |
| `SECURITY_TESTING_GUIDE.md` | 432 | "Week 1 Verification", January 2025, 19 unchecked pass/fail boxes. The dev host it names still answers 200, so the procedures are runnable — but nobody has run them in 20 months |
| `RENDER_MIGRATION_CHAMBERLIN_DUB.md` | 137 | A playbook for migrating two **other** products' Render services. Useful once, to somebody, not to this codebase |
| `ICREATE_ORIENTATION_FOLLOWUP.md` | 770 | Contains "Status: helper written, uncommitted, untested, wiring removed before deploy" — worth checking whether that helper ever landed |
| `command_reference.md` | 311 | Slash-command reference; verify it matches `.claude/` today |

---

## 3. Counts

Measured with `find docs -type f` and `wc -l`, binaries included (see the note
in §2d about PDFs inflating the line count).

| | Files | Lines |
|---|---|---|
| Before | 235 | 80,735 |
| After | 133 | 63,496 |
| **Removed** | **102** | **17,239** |

Markdown only, which is the number that reflects documentation debt:

| | Files | Lines |
|---|---|---|
| Before | 109 | 29,606 |
| After | 90 | 21,613 |
| **Removed** | **19** | **7,993** |

The gap between the two tables is the 89 legacy `.sql` files under
`docs/archive/legacy-migrations/` (9,988 lines), which were never markdown.

If everything in §2a–2c were also deleted, `docs/` would lose roughly a further
**12,000 lines across 45 files**, leaving the business material in §2d and about
a dozen genuinely current engineering docs.
