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
