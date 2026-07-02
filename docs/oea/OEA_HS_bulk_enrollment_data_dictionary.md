# OEA High School — Bulk Enrollment CSV: Data Dictionary

**Purpose:** One row provisions a parent account AND a student account, links them,
tags both to the OEA program (and the correct oversight org / state), and
optionally places the student on a diploma pathway. OpenEd exports this file from
its marketplace/enrollment records; Optio ingests it to create accounts and issue
credentials.

**File format:** UTF-8 CSV, comma-delimited, one row **per student**. A parent with
multiple students appears on multiple rows with the **same `parent_email`** (see the
two Sandoval rows in the template) — the parent account is created once and each
student is linked to it.

**Limits:** ≤ 100 rows and ≤ 1 MB per file (split larger exports). Re-importing a row
that already exists is safe — see "Idempotency / re-imports" below.

## Columns

| Column | Required | Format / values | Notes |
|---|---|---|---|
| `external_student_id` | Recommended | OpenEd's unique student ID | The reconciliation key. Lets us re-import safely (update instead of duplicate) and match the right student on later files. If OpenEd can supply this, it removes almost all matching ambiguity. |
| `parent_email` | **Yes** | valid email | Parent's login + the key we use to group siblings and match an existing parent account. |
| `parent_first_name` | **Yes** | text | |
| `parent_last_name` | **Yes** | text | |
| `student_first_name` | **Yes** | text | |
| `student_last_name` | **Yes** | text | |
| `student_dob` | **Yes** | `YYYY-MM-DD` | Used for matching existing students and age handling. |
| `student_email` | Optional | valid email | If present, the student gets **their own login** (read-only diploma view). If blank, the student is provisioned as a parent-managed dependent (no separate login). |
| `partner_key` | Optional | `opened-academy` | Program tag stamped on both accounts. Defaults to `opened-academy` if blank. |
| `partner_org_slug` | Optional | e.g. `oea`, `hearthwood` | Which oversight/admin org the student sits under. Drives which admin can see them and (with `state`) which state ruleset applies. Defaults to `oea` if blank. |
| `state` | Recommended | 2-letter US code (e.g. `UT`, `ID`) | Drives state-specific rules (submission cadence, transfer-credit cap, etc.). |
| `school_year` | Optional | e.g. `2026-2027` | |
| `grade_level` | Optional | `9`–`12` | |
| `pathway_key` | Optional | `open_balanced` \| `traditional` \| `college_bound` | If blank, the parent chooses the pathway at first login. Can be changed anytime later. |
| `enrollment_start_date` | Optional | `YYYY-MM-DD` | Defaults to import date if blank. |

## Credentials

We do **not** want OpenEd to put passwords in this file. On import, Optio generates a
temporary password per new account and either (a) returns a results CSV of
`email,temp_password` to OpenEd to distribute, or (b) emails each user a
"set your password" welcome link. Confirm which delivery OpenEd prefers (we
recommend the welcome email).

## Idempotency / re-imports

Rows are matched in this order: `external_student_id` → (`parent_email` +
`student_first_name` + `student_last_name` + `student_dob`). A match **updates**
the existing record (no duplicate account, no credential reset); a non-match
**creates** new accounts. This makes it safe to send the full roster repeatedly
or a daily delta during the enrollment surge.

## Open confirmations for OpenEd

1. Can OpenEd supply `external_student_id`? (Strongly preferred.)
2. Can OpenEd supply `student_dob` and `state` on every row?
3. Credential delivery: welcome email (recommended) or returned `temp_password` CSV?
4. Cadence: one full roster file, or full + daily deltas during the surge?
