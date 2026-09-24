# Child safety: what the platform does, and what a person must do

**Last updated**: September 15, 2026. Owner: the superadmin (Tanner Bowman).

This is the runbook for the two events the code cannot finish on its own: a
known-CSAM hash match on an upload, and a flagged conversation. Everything
below the line "What a person must do" is a legal or judgement step. The
code stops at the line and tells you.

---

## What the platform does on its own

| Layer | Where | What it catches | What happens |
|---|---|---|---|
| Contact-detail regex | `utils/contact_details.py` | phone, email, link, address in any student text, name or bio | Held or refused on sight, no model call |
| Per-message screen | `services/peer_text_screen_service.py` | a student's message or comment (peer rules); an adult's message to a student (grooming rules); images with the text | Held before it posts; the right adults are told; fails open to `pending` for the 10-minute sweep |
| Upload gate | `services/upload_safety_service.py` | every user-uploaded image: known-CSAM hash match, then the classifier for a student's picture | CSAM: quarantined, recorded, superadmins alerted, refused with a neutral sentence. Classifier: held for the parent, refused; schoolwork showing only the child's contact details is refused with what to cover and not held; the same image again within a day reuses its hold |
| Nightly conversation review | `services/conversation_review_service.py` | the pattern no single message shows: grooming, sustained bullying, self-harm talk | A pending report in the moderation queue; superadmins notified |
| Reports | `/api/moderation/report` | anything a person flags, including class chat messages | The moderation queue; "Action taken" hides the target |
| Tracker | Superadmin home, "Safety screen" card | all of the above, per surface, with model cost and failed calls | Read it |

The hash match runs only when `CSAM_MATCH_PROVIDER` is set. Until a
PhotoDNA key exists it is `off`, and the tracker says so. **Getting the key
is a task for a person**: apply at https://www.microsoft.com/en-us/photodna
(free for qualifying platforms), then set `CSAM_MATCH_PROVIDER=photodna`
and `PHOTODNA_API_KEY` on the production backend and deploy.

---

## What a person must do

### 1. A CSAM hash match (the "CSAM hash match: action required" alert)

You will get three signals at once: a Sentry event at level fatal, an email
titled "CSAM hash match on Optio: action required", and an in-app
notification. Each names an incident id. The file is already in the
`csam-quarantine` bucket, which no user can read or sign. The upload was
refused with "This file could not be uploaded." and the uploader was told
nothing else.

**The law.** 18 U.S.C. 2258A requires a provider that obtains actual
knowledge of apparent child pornography to report it to the NCMEC
CyberTipline "as soon as reasonably possible". The REPORT Act (2024) requires
the provider to preserve the material and related account data for one year
from the report. A knowing and willful failure to report is a federal
offence with fines set by the statute; check the current figures with
counsel rather than this document.

**Do, in this order:**

1. **Do not open the file. Do not download it. Do not forward the email.**
   A hash match is knowledge enough; viewing the material is itself an
   offence and adds nothing to the report.
2. **Confirm the incident row** in `csam_incidents` (Supabase, project
   `vvfgxcykxjybtvpfzwyx`): `select * from csam_incidents where id = '<id>'`.
   Note `user_id`, `purpose`, `provider`, `sha256`, `storage_path`.
3. **File the CyberTipline report** at https://report.cybertip.org/ispweb
   (the ESP portal; you need an ESP account, see "Set up once" below). Give
   NCMEC: the incident time, the uploader's account details (`users` row:
   name, email, organization, date of birth), the hash, and the quarantine
   path. NCMEC asks for the file itself; upload it through their portal
   from the quarantine bucket using the Supabase dashboard, not through
   anything that leaves a copy on your machine.
4. **Record the report** on the incident so the row says the duty was
   discharged:
   `update csam_incidents set reported_at = now(), report_reference = '<CyberTipline report id>', reported_by = '<your user id>' where id = '<id>';`
5. **Preserve everything for one year.** Do not delete the quarantine
   object, the incident row, the uploader's account, or their messages.
   Account deletion for that user is on hold until the year passes; note
   the date in the incident's `details` if you have to.
6. **Do not tell the uploader, their parent, or their school what matched.**
   NCMEC and law enforcement decide who is told. If law enforcement
   contacts you, they will cite the report id.
7. If the uploader is a student at a partner school and there is any sign a
   child is in danger now (the nightly review says `risk: high`, or the
   material appears self-produced), call 911 first, then NCMEC's hotline
   1-800-843-5678, then file the report.

**Set up once** (not done as of 2026-09-15):

- Register Optio as an Electronic Service Provider with NCMEC:
  https://report.cybertip.org/ispweb. It takes a few days.
- Name a backup reporter with access to this document and the Supabase
  project, so a match on a day you are unreachable is still filed.
- Apply for PhotoDNA (link above). Without it, this whole section is
  waiting on an alert that cannot fire.

### 2. A flagged conversation (the "Safety review" notification)

The nightly review read a thread and flagged it. A pending report with no
reporter sits in the moderation queue (`/admin/moderation`), with the
review's reasons in its notes and the last eight messages in its preview.

1. Open the queue. Read the reasons and the preview. Open the thread if you
   need more: the superadmin can read any thread through the admin users
   panel (masquerade), and every read of a student's messages is logged.
2. Decide. The options, in rising order:
   - **Dismiss**: the review was wrong. Mark it dismissed. If the same
     thread keeps coming back clean, the prompt needs a look
     (`conversation_review_service.ConversationReviewService.PROMPT`).
   - **Reviewed**: real but handled by a word with the school. Mark it
     reviewed and write what you did in the notes.
   - **Actioned**: the adult is removed from contact with the student.
     For an org staff member, tell the org admin the same day and let the
     org handle employment; for a platform advisor, unassign them in the
     admin panel. Mark the report actioned.
3. If the review says `risk: high`, or the thread shows an adult arranging
   to meet a child, treat it as section 1 step 7: 911, then the school,
   then the queue.
4. A parent is not told by the code about a flagged conversation. You
   decide whether and how, with the school.

### 3. A held message from an adult (the "Staff message held" notification)

The per-message screen held something an adult wrote to a student. The org
admins of the student's school and every superadmin were told, with the
words. The message was never sent.

Most of these will be a teacher's clumsy sentence. Read it in the Holds
tab. If it is one of the grooming patterns (secrecy, off-platform contact,
gifts, comments on the child's body), open the thread and treat it as
section 2. Otherwise nothing further is required; the hold stays on record.

---

## Who to call

| Who | How |
|---|---|
| NCMEC CyberTipline (ESP reports) | https://report.cybertip.org/ispweb |
| NCMEC hotline | 1-800-843-5678 |
| Emergency | 911 |
| Partner school's org admin | the org's `org_admin` users, listed in the SIS staff page |

## The switches

| Env var | Effect when off |
|---|---|
| `CSAM_MATCH_PROVIDER=off` | No hash match runs. The tracker shows the provider as off |
| `UPLOAD_IMAGE_SCREEN_ENABLED=false` | Uploads skip the classifier; the hash match still runs |
| `PEER_TEXT_SCREEN_ENABLED=false` | Messages post as `pending` and nothing is refused; the regex still holds contact details |
| `CONVERSATION_REVIEW_ENABLED=false` | The nightly review does not run |

Every one of them exists so a misfiring layer can be turned off without a
deploy. None of them turns off the duty in section 1.
