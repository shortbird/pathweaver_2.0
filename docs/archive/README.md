# Archive

Point-in-time documents, kept for the record and **not maintained**. If one of
these disagrees with the code, the code is right.

They were moved here from the repository root on 2026-09-03 (DOC-05). Nothing
was rewritten in the move except inbound links.

| Document | What it was | Status |
|---|---|---|
| `AUDIT.md` | The 2026-08-01 internal audit | Superseded by the 2026-08-31 audit; remediation tracked in [../audit-2026-08/REMEDIATION_PLAN.md](../audit-2026-08/REMEDIATION_PLAN.md) |
| `AUDIT_IMPLEMENTATION_PLAN.md` | Worklist for the 2026-04 audit | Historical; CLAUDE.md still links it |
| `H1_ADMIN_CLIENT_AUDIT.md` | The 737-call admin-client sweep | The rule it produced is now enforced by `tests/unit/test_admin_client_justified.py` |
| `BUG_TRIAGE_PLAN_2026-06-06.md` | One triage session | Done |
| `TASK_DIFFICULTY_IMPLEMENTATION_PLAN.md` | Success-criteria redesign | Shipped |
| `MOBILE_APP_LAUNCH_PLAN.md` | v2 launch checklist | Shipped |
| `OPTIO_COURSE_PATH_PITCH.md` | A pitch deck in prose | Historical |
| `POE_Fine_Arts_Credit_Proposal.md` | The AGO proposal | Superseded by [../POE_LAUNCH_PLAN.md](../POE_LAUNCH_PLAN.md), which is live |

Code comments across `backend/` still cite `AUDIT.md` by name (for example
"AUDIT.md C1"). Those are prose citations rather than links, and they were left
alone deliberately: rewriting twenty comments in files other sessions are
editing costs more than it buys, and the finding ids still grep.
