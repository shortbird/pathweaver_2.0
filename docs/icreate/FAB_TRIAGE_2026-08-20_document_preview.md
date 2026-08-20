# "Everyone got assigned the same file — my background check"

**Reported**: Molly (iCreate), 2026-08-19, on the teacher contracts sent for signature.
**Verdict**: the filing is correct. The **preview** was lying.

## What was actually stored

Every contract is filed against the right teacher. Checked in prod
(`sis_secure_documents`, org `1340004f`) on 2026-08-20:

- 23 contract rows uploaded 2026-08-18, each with its own storage object (distinct
  path, distinct byte size), `shared_with_owner = true`, and a filename that matches
  its owner: *Teacher Employee Agreement - Ana Rogers.pdf* → Ana Rogers, and so on
  for all 23.
- 11 background checks from 2026-08-14, likewise one per person.

Nothing to repair in the data, and nothing wrong in the upload path: `store_document`
writes one blob and one row per person attached, and it did.

## What Molly saw

The office checks its work with **View portal** on the Staff page, which puts the
console into the teacher-portal preview: the teacher nav, reading that teacher's
data via `?teacher_id=`. Every portal page honoured that — dashboard, classes,
schedule, profile, forms, time, onboarding — **except My Documents**, which read
`user_id` straight from the session and answered with the caller's own documents.

So walking the staff list showed the same one file under every teacher's name: the
admin's own background check, the only document filed against her. The contracts were
in the teachers' portals the whole time; the page checking on them was the wrong page.

## The fix

- `GET /api/sis/teacher/my-documents` and `/my-documents/<id>/url` resolve the owner
  through the preview (`_documents_target`), so the preview shows the teacher's
  documents and opens them.
- Following a preview into this store is **HR_ROLES only** (org_admin / superadmin).
  A campus coordinator gets a 403 with a reason, not a silent fall back to their own
  documents — this store holds background checks, and answering "here are yours
  instead" is how the bug read in the first place.
- The page itself now says whose documents these are, and hides the *send a document
  in* box while previewing: that upload is caller-bound and would file the admin's
  file against the teacher.
- **My Tasks** is dropped from the nav during a preview. `/api/sis/my-tasks` takes no
  `?teacher_id=` on purpose, so under a preview that link could only ever show the
  admin's own inbox behind the teacher's name — the same lie in a different place.

## Still open

`GET /api/sis/training` reports `my_progress` for the caller only, so the Training
page under a preview shows the admin's own quest progress. Lower stakes (no
confidential content, and the endpoint auto-assigns on read, so it cannot simply be
pointed at someone else), but it is the same shape and worth closing when the
training pages are next touched.

---

# Second report, same thread: "it also assigned the background check to be the contract"

Not the same bug, and this one was real in the data the teachers see.

## What was happening

The staff onboarding template's first item, *Review & Sign Your Contract*, names
no document — its description says the contract will be uploaded to the portal.
An item like that signs against a **pool**: every document the office has shared
with that person (`sis_onboarding_service.office_documents`). Nothing in the
store said which of those was the contract.

That was survivable while a school only shared contracts. iCreate also shared
each person's background check, so on 2026-08-19 the pool held two documents:

| Who | What their item offered to sign |
|---|---|
| Alysa Russell, Hollie Russell, Karina Worlton, Thomas Duffany | their contract **and** their background check |
| Molly Christensen | **only** her background check — the office never had a contract for her |
| the other 15 | their contract only (their check was never shared) |

Signing recorded every document in the pool as "what they had in front of them",
so a signature on the contract also claimed a background check.

## The fix

`sis_secure_documents.requires_signature` — the office ticking **"They must sign
this"** on the upload form, on a row in the list, or over a selection. The pool
prefers flagged documents, and asking for a signature shares the document too
(nobody signs what they cannot open).

The interesting part is what happens when somebody has nothing flagged:

- **A school that has never ticked anything keeps its whole shared pool.** No
  school is to deploy this and have its teachers read "your document is not here
  yet" — that is the 2026-08-18 failure, and it refuses signatures outright.
- **Once a school uses the tick, silence means silence.** That is Molly's case:
  she has no contract, so her item now correctly says the office has not
  uploaded her document, instead of offering her background check.

## Applied to iCreate

- Migration `20260820000000_secure_document_requires_signature.sql` applied to
  prod.
- The 23 `Teacher Employee Agreement` rows were marked as needing a signature.
  Nothing else was: the 11 background checks stay in their owners' portals to
  read, and are no longer offered to sign.

Verified after the backfill: the four teachers above are asked for their
contract only, and Molly's item is empty rather than pointing at her own check.
