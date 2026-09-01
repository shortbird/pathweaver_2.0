# Supabase Storage Backup — Plan

**Status**: not implemented. This is the design, not a description of something
that runs. Written 2026-09-01, after the nightly database backup was fixed and
[BACKUP_RESTORE.md](BACKUP_RESTORE.md) went green.

The database is now backed up off-site nightly and verified restorable. Storage
objects are not backed up at all, by anything.

---

## The gap

Database backups — ours and Supabase's — contain the `storage.objects` metadata
rows, not the files. A restore from the nightly dump gives you a database that
knows a student uploaded `evidence/abc123.mp4`, and no such file anywhere.

Measured 2026-09-01 on prod (`vvfgxcykxjybtvpfzwyx`):

| Bucket | Public | Objects | Size |
|---|---|---|---|
| `quest-evidence` | no | 2,095 | 5.7 GB |
| `user-uploads` | no | 413 | 1.3 GB |
| `user-photos` | no | 357 | 458 MB |
| `curriculum` | no | 39 | 63 MB |
| `quest-headers` | yes | 30 | 51 MB |
| `staff-documents` | no | 40 | 50 MB |
| `course-covers` | yes | 28 | 49 MB |
| `site-assets` | yes | 33 | 33 MB |
| `sis-secure-documents` | no | 106 | 27 MB |
| `bug-reports` | no | 169 | 17 MB |
| `org-documents` | no | 23 | 14 MB |
| 9 smaller buckets | mixed | 42 | ~25 MB |
| **Total** | | **3,375** | **~7.6 GB** |

`quest-evidence` is 75% of the bytes and is the part that matters most: it is the
student's portfolio. Losing it is not a data-loss incident you recover from by
re-running a job — the artifacts are the work itself, and they are irreplaceable
in a way that a derived table never is.

Back up **all** buckets, including the public ones. They are ~100 MB combined,
and "we can regenerate the site assets" is the kind of assumption that turns out
to be false at the worst time.

---

## Design

### Source: the S3-compatible endpoint

Supabase exposes Storage over S3:

```
https://vvfgxcykxjybtvpfzwyx.storage.supabase.co/storage/v1/s3
```

Credentials come from Dashboard → Project Settings → Storage → S3 access keys.
Region matches the project (`us-west-1`).

This is a long-lived static credential, which we deliberately avoided for GCS.
There is no federation option on Supabase's side, so it goes in GitHub secrets.
Scope it read-only if Supabase offers that at key-creation time; a backup job has
no business holding write access to the thing it is backing up.

### Tool: rclone

Roughly 99% of these objects are write-once evidence uploads that are never
modified. Incremental sync therefore transfers only the day's new files — seconds
per night after the first run, rather than 7.6 GB. rclone also streams
Supabase → GCS in one hop without staging to the runner's disk, and both ends are
first-class remotes.

Do not write a bespoke download-and-upload loop. Object listing, pagination,
retries, checksums and partial-transfer resume are all solved here and all easy
to get subtly wrong.

### The trap: a sync is not a backup

`rclone sync` mirrors deletions. If evidence is mass-deleted — a bug, a bad
migration, ransomware, a disgruntled admin — the next nightly run faithfully
deletes it from the backup too, and both copies are gone. A job that does this is
worse than no job, because it produces the confident feeling of having a backup.

**Use GCS Object Versioning on the backup bucket**, with a lifecycle rule expiring
*noncurrent* versions after 90 days. Deletions and overwrites become recoverable
history. This is enforced server-side and cannot be defeated by a bug in the
workflow — the same reasoning that keeps retention on a bucket lifecycle rule
rather than a prune step in the database job.

The alternative, `rclone sync --backup-dir=gs://.../replaced/<date>`, is enforced
by the workflow and so is strictly weaker. Object versioning is the better trade.

### Encryption: start in plaintext, and know why

The database dump is GPG-encrypted client-side because it is a single file
containing every user's PII, which makes it trivially exfiltratable as one blob.
Storage is a different shape: 3,375 separate files where the realistic recovery
case is "restore one student's evidence." Client-side encryption turns that
one-command download into an rclone-plus-passphrase operation, and adds a second
secret whose loss destroys the backup.

Start with **plaintext in a private bucket** — uniform bucket-level access, public
access prevention on, `objectAdmin` scoped to that one bucket, and no long-lived
GCP credential thanks to the existing WIF setup.

If parity with the database posture is wanted later, rclone's `crypt` remote
encrypts contents and filenames client-side while staying incremental. That is
the upgrade path; it is a real cost, not a free win, and the passphrase becomes a
second single point of failure alongside `BACKUP_GPG_PASSPHRASE`.

This is the one decision in this plan worth revisiting deliberately rather than
inheriting. `sis-secure-documents` and `identity-documents` hold exactly the sort
of material that argues the other way.

### Destination

New bucket `optio-prod-storage-backups`, project `optio-483122`, region
`us-west1`, **Nearline**, uniform access, public access prevention on, **object
versioning ON**.

Reuse the existing `optio-db-backup` service account: grant it `objectAdmin` on
this bucket too. No new identity, no new auth path, and the WIF binding already
restricts token issuance to this repository.

### Schedule

A **separate workflow** (`backup-storage.yml`), not another job in `backup-db.yml`.
Different failure modes, and a Storage sync failure should not mark the database
backup red or vice versa — a red job nobody can attribute is a job people learn to
ignore, which is how the database backup stayed broken for two weeks.

Run at 09:00 UTC, an hour after the database dump, keeping it clear of the cron
dispatcher's hours (09/10/13/14/15 UTC is used by `backend/jobs/cron_dispatch.py`
— pick a minute offset, e.g. `30 9 * * *`).

---

## Implementation steps

1. **Create the bucket** with versioning and the noncurrent-version lifecycle rule.
2. **Grant** `optio-db-backup@optio-483122.iam.gserviceaccount.com` the
   `roles/storage.objectAdmin` role on that bucket only.
3. **Create Supabase S3 access keys** and add two repository secrets:
   `BACKUP_SUPABASE_S3_ACCESS_KEY_ID`, `BACKUP_SUPABASE_S3_SECRET_ACCESS_KEY`.
   Add `BACKUP_STORAGE_GCS_BUCKET` as a variable, matching the existing pattern of
   secrets for credentials and variables for identifiers.
4. **Write `.github/workflows/backup-storage.yml`**, mirroring the structure of
   `backup-db.yml`: guard every required secret and variable with a named error,
   authenticate to GCP with `google-github-actions/auth@v2` (needs
   `id-token: write`), then run the sync.
5. **Verify** (below) — the step that makes it a backup rather than a cron job.
6. **Document** it in `BACKUP_RESTORE.md`, replacing the "NOT COVERED" section
   there and in the header comment of `backup-db.yml`.

Sketch of the sync itself:

```bash
rclone sync \
  supabase:/ gcs:"$BUCKET/objects/" \
  --checksum \
  --transfers=8 \
  --stats-one-line \
  --log-level INFO
```

`--checksum` rather than the default size-and-modtime: Supabase and GCS do not
agree on modification times, and a same-size overwrite is exactly the corruption
case worth catching.

---

## Verification

The database job earned its keep by restoring the dump and asserting row counts.
The equivalent here is a cross-check the dump makes possible for free: the archive
already contains `storage.objects`, so the truth about what *should* exist is
recoverable from the database itself.

After the sync:

1. Count objects and total bytes in the destination bucket.
2. Compare against `SELECT count(*), sum((metadata->>'size')::bigint) FROM
   storage.objects` on prod.
3. Fail if the object count is short by more than the day's new uploads, or if
   total bytes diverge beyond a small tolerance.

Without this, a sync that silently stops after 200 files looks identical to one
that worked — which is precisely the failure the archive-size floor catches on the
database side.

Quarterly, as with the database: pull one real evidence file out of the backup by
hand and open it. That tests the link automation cannot — that a human can still
reach the bucket and the file is genuinely readable.

---

## Restoring

**One file** (the common case):

```bash
gcloud storage cp \
  "gs://optio-prod-storage-backups/objects/quest-evidence/<path>" .
```

Then re-upload through the Storage API or the dashboard. As with the database, the
last step is deliberately manual: putting a file back into a live bucket is a
judgment call about overwriting whatever is there now.

**A whole bucket**, after a mass-deletion, requires reversing the sync direction
with write credentials — which the backup job should not hold. Create a
short-lived key for the restore, use it, then delete it.

**Recovering a deleted or overwritten file** means reaching for a noncurrent
version:

```bash
gcloud storage ls --all-versions \
  "gs://optio-prod-storage-backups/objects/quest-evidence/<path>"
gcloud storage cp "gs://...#<generation>" ./recovered
```

This is the path that exists *only* because versioning is on, and it is the one
that covers the scenario a plain mirror would have destroyed.

---

## Cost

~7.6 GB on Nearline is about **$0.08/month**, plus noncurrent versions, so call it
under $0.25/month all-in. Storage cost is not a factor in any decision here.

Supabase **egress** is the number to watch: the first sync pulls 7.6 GB, and each
nightly run pulls only new objects. Pro includes 250 GB/month, so steady state is
negligible — but a full re-sync (say, after changing the encryption decision and
re-uploading everything) costs another full 7.6 GB of egress. Avoid casually
re-running with `--ignore-times`.

---

## Open decisions

1. **Encryption** — plaintext in a private bucket, or an rclone `crypt` remote?
   The recommendation above is plaintext, with the reasoning stated; the presence
   of `identity-documents` and `sis-secure-documents` is the counter-argument.
2. **Retention** — 90 days of noncurrent versions matches the database backup. For
   student portfolio artifacts, which are the record of work rather than a
   snapshot of state, a longer window may be more appropriate.
3. **Read-only source key** — confirm whether Supabase's S3 keys can be scoped to
   read. If not, the workflow holds a credential that can write to prod Storage,
   which is worth knowing and worth restricting some other way.
