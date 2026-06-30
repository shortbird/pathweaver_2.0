# OEA / Hearthwood Academy — HS Diploma Phase 2 Implementation Plan

**Transfer credits · grade periods · quarterly reports · compliance flagging**

**Prepared by:** Optio Engineering
**Date:** June 30, 2026
**Status:** Draft for review (scoping)
**Source:** Teresa King (OpenEd) requirements, June 19 + post-June-meeting email

---

## 1. Context & scope

Every item in this plan targets the **OEA High School Diploma Plan** — the parent-attested,
pathway-based, 24-credit system. "Hearthwood Academy" is the same program under a
different state's name, which maps to **per-organization branding** on the same code path
(`program_key`, org slug, `organizations.branding_config.logo_url`). No second system.

This is **not** the SIS microschool system (registration/billing/attendance) and **not** the
XP-based K-12 credit system. Those are separate and untouched.

### What already exists (reuse foundation)

The OEA HS diploma layer is built and in production:

| Capability | Where |
|---|---|
| Pathway enrollment (3 fixed pathways, 24 credits, foundation/elective) | [backend/utils/oea_pathways.py](backend/utils/oea_pathways.py), `oea_enrollments` |
| Self-attested course credits with A–F grade + honors/AP/IB weighting | `oea_credits`, [backend/routes/oea.py](backend/routes/oea.py) |
| GPA (unweighted + weighted) + pathway progress + `is_complete` | [backend/utils/oea_grades.py](backend/utils/oea_grades.py) |
| Per-credit evidence (text/link/file) | `oea_credit_evidence`, [backend/repositories/oea_repository.py](backend/repositories/oea_repository.py) |
| Parent credit dashboard (add course, grade, progress, GPA) — **v1 web** | [frontend/src/pages/oea/](frontend/src/pages/oea/), `oeaAPI` in [frontend/src/services/api.js](frontend/src/services/api.js) |
| Admin transcript generator with print-to-PDF (`window.print` + print CSS) — **web only** | [frontend/src/pages/admin/TranscriptGeneratorPage.jsx](frontend/src/pages/admin/TranscriptGeneratorPage.jsx) |
| Scheduled-job pattern (dispatcher + secured cron endpoint + dedup alerts + notifications) | `jobs/cron_dispatch.py`, [backend/services/sis_checkin_sweep_service.py](backend/services/sis_checkin_sweep_service.py), [backend/services/sis_notifications.py](backend/services/sis_notifications.py) |

**Platform decision:** All new parent-facing UI lands in **v1 web** (`frontend/`), where the
diploma dashboard and transcript already live. The v2 mobile OEA companion views
([frontend-v2/app/(app)/oea/](frontend-v2/app/(app)/oea/)) are **out of scope for Phase 2**;
they remain read-only and will be brought to parity in a later pass.

### Confirmed product decisions (from review)

1. **Block scope** when quarterly uploads are missing → **block semester/annual grade entry** for that course (not diploma application, not new-credit creation).
2. **GPA treatment** → both `transfer` and `earned_elsewhere` credits **count toward GPA**.
3. **"Weighting"** on a transfer course → **both** a credit value (e.g. 1.0 / 0.5) *and* an optional honors/AP/IB flag.
4. **OEA-branded printable transcript** (grades, GPA, transfer notations) → **in scope** for this build.

### Assumptions (stated; flag if wrong — see §11)

- **A1.** "Credit earned elsewhere" also captures a letter grade (required, since it counts toward GPA).
- **A2.** Academic-term calendar (quarter/semester boundaries) is **per-organization** config, stored in `organizations.feature_flags.oea_settings`, mirroring the existing `sis_settings` pattern. A sensible US default ships if an org sets nothing.
- **A3.** Admin cap-override is **per-student** (stored on `oea_enrollments`), overriding the program defaults of 6 / 18.
- **A4.** A "direct" credit = `credit_source = 'direct'` (earned through Optio uploads). The ≥6-direct diploma gate counts these; the per-course upload minimums are what make a direct credit legitimate.
- **A5.** "School of record" / per-state naming is handled by org branding already in place (the org logo on quests today); the transcript header reuses `branding_config.logo_url`.

---

## 2. Architecture decisions

- **Keep `oea_credits.letter_grade` as the authoritative transcript grade per course.** This preserves the existing `compute_gpa` / `compute_progress` functions unchanged. Grade periods write *into* it via a derivation rule (annual > semester), so the override-not-average behavior is a write-time concern, not a GPA-math change.
- **Quarter grades are progress-only.** They live in a new periods table and never feed `letter_grade` or GPA. This is exactly Teresa's "semester overrides quarter, does not average" rule.
- **Caps and the diploma gate are pure functions**, colocated with `compute_progress`, so they're trivially unit-testable and reused by routes, the transcript, and the admin dashboard.
- **Compliance counts are computed on demand** from existing data (learning logs via the credit's linked quest; artifacts via `oea_credit_evidence`; summaries via the periods table) — no duplicate counters to keep in sync. The only new persisted state is a **dedup table for admin alerts**, matching `sis_attendance_alerts`.
- **All new tables: admin-client only, RLS enabled, no public policies** — identical to the existing `oea_*` tables (the frontend never touches them directly; everything goes through `/api/oea/*`).

---

## 3. Data model changes

All migrations follow the repo convention (idempotent `IF NOT EXISTS`, additive, RLS on,
no public policies, default data-API grants already handled by the 2026-05-27 migration).

### 3.1 `oea_credits` — credit source

```sql
-- supabase/migrations/2026XXXX_oea_credit_source.sql
ALTER TABLE oea_credits
  ADD COLUMN IF NOT EXISTS credit_source text NOT NULL DEFAULT 'direct'
    CHECK (credit_source IN ('direct','transfer','earned_elsewhere'));

CREATE INDEX IF NOT EXISTS idx_oea_credits_source
  ON oea_credits(student_id, credit_source);
```

- `direct` (default) — earned through Optio uploads (logs + artifacts).
- `transfer` — Hearthwood-internal transfer; renders as a native credit, **no transcript note**; capped at 6.
- `earned_elsewhere` — outside credit; renders with the note *"Accepted transfer credit from previous school."*; combined with `transfer` capped at 18.

Existing rows backfill to `direct` automatically — correct.

### 3.2 `oea_enrollments` — per-student cap overrides

```sql
-- supabase/migrations/2026XXXX_oea_cap_overrides.sql
ALTER TABLE oea_enrollments
  ADD COLUMN IF NOT EXISTS max_transfer_credits   numeric,  -- NULL = program default (6)
  ADD COLUMN IF NOT EXISTS max_nondirect_credits  numeric;  -- NULL = program default (18)
```

`NULL` means "use the program default." A Hearthwood admin raises a specific student's
ceiling by setting an explicit number.

### 3.3 `oea_credit_grade_periods` — quarter / semester / annual grades + summaries

```sql
-- supabase/migrations/2026XXXX_create_oea_credit_grade_periods.sql
CREATE TABLE IF NOT EXISTS oea_credit_grade_periods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id    uuid NOT NULL REFERENCES oea_credits(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- denormalized for ownership check
  school_year  text NOT NULL,                       -- e.g. '2026-2027'
  term_type    text NOT NULL CHECK (term_type IN ('quarter','semester','annual')),
  term_index   smallint NOT NULL,                   -- quarter 1-4, semester 1-2, annual 1
  grade        text CHECK (grade IN ('A','B','C','D','F')),
  summary      text,
  entered_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  entered_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (credit_id, term_type, term_index, school_year)
);

CREATE INDEX IF NOT EXISTS idx_oea_grade_periods_credit ON oea_credit_grade_periods(credit_id);
CREATE INDEX IF NOT EXISTS idx_oea_grade_periods_student ON oea_credit_grade_periods(student_id);

ALTER TABLE oea_credit_grade_periods ENABLE ROW LEVEL SECURITY;
```

- Quarter rows hold the **in-progress quarter grade + parent summary** (the report-card data).
- Semester / annual rows hold **transcript grades**; writing one derives `oea_credits.letter_grade` (annual wins over semester — see §4.3).

### 3.4 `oea_compliance_alerts` — admin-flag dedup (mirrors `sis_attendance_alerts`)

```sql
-- supabase/migrations/2026XXXX_create_oea_compliance_alerts.sql
CREATE TABLE IF NOT EXISTS oea_compliance_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credit_id       uuid REFERENCES oea_credits(id) ON DELETE CASCADE,
  school_year     text NOT NULL,
  term_index      smallint NOT NULL,                -- quarter that closed non-compliant
  context         jsonb,                            -- {missing_logs, missing_artifacts, missing_summary}
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, credit_id, school_year, term_index)
);

CREATE INDEX IF NOT EXISTS idx_oea_compliance_alerts_org ON oea_compliance_alerts(organization_id, school_year);

ALTER TABLE oea_compliance_alerts ENABLE ROW LEVEL SECURITY;
```

### 3.5 Term calendar + program rules (config, not schema)

Term boundaries and the upload minimums live in code constants with per-org override in
`organizations.feature_flags.oea_settings` (mirrors `sis_settings` read in
[sis_checkin_sweep_service.py](backend/services/sis_checkin_sweep_service.py) `org_settings()`):

```jsonc
// organizations.feature_flags.oea_settings
{
  "school_year": "2026-2027",
  "terms": {
    "quarters": [ {"index":1,"start":"2026-08-25","end":"2026-10-31"}, ... ],
    "semesters": [ {"index":1,"start":"2026-08-25","end":"2027-01-15"}, ... ]
  },
  "minimums": { "logs_per_quarter": 9, "artifacts_per_quarter": 3, "summaries_per_quarter": 1 },
  "caps": { "transfer": 6, "nondirect": 18, "min_direct_for_diploma": 6 }
}
```

New module `backend/utils/oea_rules.py` holds the program defaults and a
`get_oea_settings(org_id)` helper that overlays org config on the defaults.

---

## 4. Backend work

### 4.1 Credit source + caps + admin override (Items 1, 2, 3)

**New `backend/utils/oea_rules.py`** — pure functions alongside the existing grade math:

```python
# program defaults; overridable per-org via oea_settings, per-student via enrollment
DEFAULT_TRANSFER_CAP = 6
DEFAULT_NONDIRECT_CAP = 18
MIN_DIRECT_FOR_DIPLOMA = 6

def check_credit_source_caps(credits, new_source, enrollment, settings) -> None:
    """Raise ValidationError if adding/retagging a credit with new_source would
    breach the transfer (<=6) or combined-nondirect (<=18) cap, honoring any
    per-student override on the enrollment."""

def diploma_eligibility(progress, credits, settings) -> dict:
    """{'direct_credits_earned': n, 'min_direct_required': 6,
        'meets_min_direct': bool, 'diploma_eligible': bool}
       diploma_eligible = progress['is_complete'] and meets_min_direct."""
```

**Route changes in [backend/routes/oea.py](backend/routes/oea.py):**
- `POST /students/<id>/credits` and `PATCH /credits/<id>` accept `credit_source`, `credits` (value), `is_weighted`; call `check_credit_source_caps()` before write (reuses the credit list the route already loads).
- `GET /students/<id>/credits` response gains a `diploma_eligibility` block from `diploma_eligibility()`.
- **New** `PATCH /api/oea/enrollments/<student_id>/caps` — admin-only (org_admin / superadmin), sets `max_transfer_credits` / `max_nondirect_credits`. Reuses `_verify_manages_student` pattern but gated to admin role.

**Repository:** add `credit_source` to `add_credit()` insert; add `set_cap_overrides()` on `OEARepository`. No GPA change — `compute_gpa` already counts any complete credit with a grade (so both transfer types count, satisfying decision #2).

**Effort:** ~2–3 dev-days (logic + tests; GPA untouched).

### 4.2 Grade periods — quarter/semester/annual (Items 4-data, 5)

**New `backend/repositories/oea_grade_period_repository.py`** (or methods on `OEARepository`):
`get_periods(credit_id)`, `upsert_period(credit_id, student_id, school_year, term_type, term_index, grade, summary, entered_by)`, `get_periods_for_student(student_id, school_year)`.

**New endpoints under the existing `oea` blueprint:**
- `GET  /api/oea/credits/<credit_id>/periods` — list period rows.
- `PUT  /api/oea/credits/<credit_id>/periods` — upsert a quarter/semester/annual entry.
  - Quarter entry: writes grade + summary to the period row only.
  - **Semester/annual entry: gated by the compliance check (§4.4) — 422 if required uploads missing** (decision #1). On success, derives `oea_credits.letter_grade` (§4.3) and stamps `status='complete'`/`completed_at`.

**Effort:** ~3–4 dev-days.

### 4.3 Override-not-average derivation (Item 5)

Pure helper in `oea_rules.py`:

```python
def transcript_grade_for_credit(period_rows) -> str | None:
    """Annual grade if present; else latest semester grade; else None.
    Quarter grades are never averaged in — they are progress-only."""
```

Called whenever a semester/annual period is written, to set `oea_credits.letter_grade`.
This is the single point that enforces "semester overrides quarter; annual is final."

**Effort:** included in 4.2.

### 4.4 Per-course submission minimums + grade-entry block (Item 6 + block)

**New `backend/services/oea_compliance_service.py`** — on-demand evaluator (no stored counters):

```python
def evaluate_course_quarter(credit, settings, *, school_year, term_index) -> dict:
    """Counts for one course in one quarter:
       - logs: learning_events linked to credit.quest_id (via learning_event_topics,
               topic_type='quest') with event_date in the quarter window
       - artifacts: oea_credit_evidence for credit_id (block_type in link/file)
                    with created_at in the quarter window
       - summary: an oea_credit_grade_periods row (term_type='quarter') with summary set
       returns {logs:(n/9), artifacts:(n/3), summary:(n/1), is_compliant: bool, missing:{...}}"""

def evaluate_student(student_id, settings, school_year) -> list[dict]:
    """Per-course-per-quarter compliance for a student."""
```

Counting reuses existing data paths:
- Logs ↔ course via `oea_credits.quest_id` → `learning_event_topics(topic_type='quest', topic_id=quest_id)` → `learning_events.event_date`. (The credit→quest link already exists via `_ensure_course_quest`.)
- Artifacts ↔ course via `oea_credit_evidence.credit_id` (already counted by `get_evidence_counts`; extend to filter by date + block_type).
- Summary ↔ the quarter period row.

The grade-period `PUT` (§4.2) calls `evaluate_course_quarter` for each quarter inside the
semester/year and blocks the write if any is non-compliant.

**Effort:** ~3–5 dev-days (the date-bucketed counting is the bulk).

### 4.5 Admin compliance-flag sweep (Item 6 — "flag me as admin")

**New `backend/services/oea_compliance_sweep_service.py`** — modeled directly on
[sis_checkin_sweep_service.py](backend/services/sis_checkin_sweep_service.py):

```python
def run_sweep() -> dict:
    """For each OEA-enabled org, after a quarter's close date:
       for each enrolled student's in-progress courses, run evaluate_course_quarter;
       if non-compliant and not already alerted (oea_compliance_alerts dedup),
       notify org admins via sis_notifications.notify(...) and record the alert."""
```

Wiring (all existing infra):
- Register the job in `jobs/cron_dispatch.py` (the dispatcher already runs every 10 min and decides which jobs fire).
- Reuse the secured trigger pattern: a `/api/oea/internal/compliance-sweep` endpoint guarded by `X-Cron-Secret` (copy [backend/routes/sis/checkin.py](backend/routes/sis/checkin.py) sweep endpoint), or call directly from the dispatcher.
- Reuse `_org_admins(org_id)` and `sis_notifications.notify()` verbatim (notification type `announcement`, already renders in the bell + push).

**Effort:** ~2–3 dev-days (pattern is proven; mostly assembly).

### 4.6 Diploma eligibility surfacing (Item 3)

`diploma_eligibility()` (§4.1) is returned on `GET /students/<id>/credits`. The full
"apply for diploma → notify staff → record issuance" workflow (PRD §4.8) was never built;
**minimum viable** for this phase = surface `diploma_eligible` and let the existing oversight
notification path flag staff. A full application/review workflow is a separable add-on
(noted in §10).

---

## 5. Frontend work (v1 web)

### 5.1 Credit dashboard — source + weighting + caps

In [frontend/src/pages/oea/OEACreditsView.jsx](frontend/src/pages/oea/OEACreditsView.jsx) and the add/edit credit modal:
- Add a **course type** selector: Direct / Transfer credit / Credit earned elsewhere.
- Show a credit-value input and the honors/AP/IB checkbox (already exists for `is_weighted`).
- Surface cap usage ("Transfer: 4 / 6", "Outside credit: 11 / 18") and disable the option when capped, with an admin-override note.
- New `oeaAPI` methods: `setCaps`, `setCreditSource` (extend existing `addCredit`/`updateCredit`).

### 5.2 Grade-period entry + quarterly report

- A per-course **grade-periods panel**: enter quarter grade + summary; enter semester / annual grade (with the block message if uploads are short).
- **Quarterly progress report (printable)** — clone the proven approach in
  [frontend/src/pages/admin/TranscriptGeneratorPage.jsx](frontend/src/pages/admin/TranscriptGeneratorPage.jsx): `window.print()` + print CSS, reuse the `EditableField` component and the `#printable-*` visibility pattern. New route e.g. `/opened-academy/student/:studentId/progress-report?term=Q2`. This is the coach-facing report card.

### 5.3 OEA-branded transcript (decision #4)

- New OEA transcript view (web) reusing the TranscriptGenerator print scaffold but driven by
  `GET /api/oea/students/<id>/transcript` (new endpoint assembling credits + grades + GPA +
  pathway + notations).
- Header uses the org's `branding_config.logo_url` (Hearthwood vs OpenEd per state) instead of
  the hard-coded Optio logo.
- Render rule: `transfer` rows look identical to native credits; `earned_elsewhere` rows show the
  footnote *"Accepted transfer credit from previous school."*

**Effort (all frontend):** ~5–7 dev-days across the three surfaces.

---

## 6. Phasing & sequencing

```
Phase 0  Term calendar + program rules (oea_rules.py, oea_settings)      [foundation]
Phase 1  credit_source + caps + admin override + diploma gate            [Items 1,2,3]
Phase 2  grade periods + override-not-average rule                       [Items 4-data, 5]
Phase 3  OEA-branded transcript + quarterly progress report (print)      [Items 1,2,4,7]
Phase 4  per-course minimums evaluator + semester-grade block            [Item 6 + block]
Phase 5  admin compliance-flag sweep                                     [Item 6 flag]
```

Dependencies: Phase 0 → everything. Phase 3 needs 1+2. Phase 4 needs 0+2. Phase 5 needs 4.
Phases 1, 2 can proceed in parallel after 0.

---

## 7. Effort summary (rough)

| Phase | Backend | Frontend | Total (dev-days) |
|---|---|---|---|
| 0 — calendar + rules | 1.5 | — | 1.5 |
| 1 — source + caps + gate | 2.5 | 2 | 4.5 |
| 2 — grade periods + override | 3.5 | 2.5 | 6 |
| 3 — transcript + quarterly report | 1.5 | 5 | 6.5 |
| 4 — minimums + block | 4 | 1.5 | 5.5 |
| 5 — admin flag sweep | 2.5 | 1 (admin view) | 3.5 |
| QA / UAT with OEA / buffer | — | — | ~4 |
| **Total** | | | **~31 dev-days (~6 weeks, one dev)** |

These are engineering estimates for scoping, not a fixed quote. Several items (the transcript,
the sweep) are heavily pattern-reuse and could compress; the per-course date-bucketed counting
is the main novelty risk.

---

## 8. Testing

- **Pure-function unit tests** (the cheap, high-value layer, like the existing
  [backend/tests/test_oea_grades.py](backend/tests/test_oea_grades.py)): cap enforcement,
  diploma gate, transcript-grade derivation (override-not-average), compliance evaluator
  against fixture logs/artifacts/summaries.
- **Route tests** mirroring [backend/tests/test_oea_routes.py](backend/tests/test_oea_routes.py)
  for the new endpoints (auth, validation, cap 422s, block 422s).
- **v1 web Vitest** for the dashboard source selector and the print scaffolds (the coverage
  gate is enforced on PRs to `main`).

---

## 9. Risks & notes

- **Naming collision:** an unrelated `transfer_credits` table already exists in the *admin XP
  transcript* tool ([backend/routes/admin/transfer_credits.py](backend/routes/admin/transfer_credits.py)).
  The diploma-plan transfer concept here is a `credit_source` enum on `oea_credits` — keep them
  distinct in code and copy to avoid confusion.
- **v2 mobile drift:** parents on mobile will see the older OEA views until a parity pass. If OEA
  expects HS parents to do transfer-credit / grade-period work on mobile, that's added scope.
- **Diploma application workflow** (PRD §4.8) is still unbuilt; this phase surfaces eligibility
  but does not add the apply→review→issue flow.
- **Apex web host:** confirm prod web is served from Render (not residual Vercel) before relying
  on a deploy for what parents see.

---

## 10. Out of scope for Phase 2 (call out in quote)

- Full diploma application / staff review / issuance workflow.
- v2 mobile parity for transfer credits, grade periods, and reports.
- Auto-import of external grades; bulk credit import.
- A dedicated OEA staff oversight dashboard (the read-only enrolled-families console) — the
  compliance sweep notifies admins, but a full console UI is separate.

---

## 11. Open items to confirm (one pass with Teresa)

1. **A2 — term calendar:** Do quarter/semester dates differ by state/program, and will OEA give us the 2026–27 calendar(s)? Who owns editing them (OEA admin UI vs Optio config)?
2. **A1 — earned-elsewhere grade:** Confirm "credit earned elsewhere" carries a letter grade (needed since it counts toward GPA). If some outside credits are pass/no-grade, GPA handling needs a rule.
3. **Block granularity (decision #1):** Block semester *and* annual grade entry, or semester only? And block at the **course** level (this course's quarters incomplete) — confirm it shouldn't also gate the whole transcript.
4. **Cap override (A3):** Per-student total override is assumed. Does OEA also want a per-credit-type override (e.g. raise transfer to 8 but leave outside at 18)?
5. **Diploma gate definition (A4):** Is a "direct" credit simply `credit_source='direct'`, or must it *also* have met all per-course quarterly minimums to count toward the ≥6? (Stricter = more enforcement work.)
6. **Honors/AP/IB on transfer:** Confirm weighted GPA bonus applies to transfer/earned-elsewhere courses the same as direct ones.

---

## Appendix A — Bulk-enrollment CSV template (Teresa's closing question)

No committed spreadsheet template was found in the repo — this is an outstanding deliverable.
The implementation plan (§9) specifies a **minimum** column set for the K-12 bulk import; the
proposed canonical template:

| Column | Required | Example | Notes |
|---|---|---|---|
| `parent_email` | yes | `jane@example.com` | match key for existing accounts |
| `parent_first_name` | yes | `Jane` | |
| `parent_last_name` | yes | `Doe` | |
| `student_first_name` | yes | `Alex` | |
| `student_last_name` | yes | `Doe` | |
| `student_dob` | yes | `2010-04-15` | ISO `YYYY-MM-DD`; match key + COPPA |
| `program` | yes | `oea_high_school` | `oea_high_school` (diploma) vs `oea_k12` (course) |
| `pathway_key` | HS only | `college_bound` | `open_balanced` \| `traditional` \| `college_bound` |
| `course_sku` | K-12 only | `KIWI-CHEM-01` | maps to an Optio quest; omit for HS bundle |
| `purchase_date` | yes | `2026-08-01` | from marketplace record |
| `school_of_record` | optional | `Hearthwood Academy` | drives transcript branding per state |

Encoding UTF-8, one row per purchase. We'll request a sample export from OpenEd to lock exact
column names/cells so their team can match fields directly (the June-30 meeting agenda item).
