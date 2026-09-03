# Database Backup & Restore

**Last verified**: 2026-08-17 against prod project `vvfgxcykxjybtvpfzwyx` (Postgres 17.4, 307 MB).

This is the single source of truth for how the Optio production database is backed
up and how to get data back. It replaces the two aspirational documents that
preceded it (`SUPABASE_BACKUP_SETUP.md`, `BACKUP_RESTORE_TEST.md`), both of which
described a setup that was never implemented and stated the plan tiers wrong.

---

## What we actually have

| Layer | Retention | RPO (worst-case loss) | Restorable to |
|---|---|---|---|
| Supabase daily physical backups (Pro plan, automatic) | 7 days | ~24 hours | A Supabase project only |
| **Nightly off-site logical dump** ([backup-db.yml](../../.github/workflows/backup-db.yml)) | 90 days | ~24 hours | Any Postgres 17 |
| Point-in-Time Recovery | not enabled | — | — |

Org `Shortbird` is on the **Pro** plan, so daily physical backups are on and
require no configuration. PITR is a **paid add-on** (~$100/mo for 7-day
retention), not a plan inclusion — it is currently **off**.

### What is NOT backed up

**Supabase Storage objects.** Every student evidence upload, photo, and video
lives in the Storage API. Database backups contain only the `storage.objects`
metadata rows, not the files. Neither Supabase's daily backups nor the nightly
dump protect them. This gap is open.

---

## The nightly dump

[.github/workflows/backup-db.yml](../../.github/workflows/backup-db.yml) runs at
**08:00 UTC daily** (01:00 MDT), and on demand via **Actions → Nightly DB Backup →
Run workflow**. Run it manually before any risky migration or bulk data script.

Each run:

1. Installs the PostgreSQL 17 client (the runner ships 16; pg_dump won't dump a
   newer server than itself).
2. `pg_dump --format=custom` over schemas `public`, `auth`, `storage`,
   `supabase_migrations`.
3. Fails if the archive is under 5 MB — catches a truncated or empty dump before
   it overwrites nothing and looks fine.
4. **Restores the dump into a throwaway Postgres 17 container and asserts row
   counts.** This is the step that makes it a backup rather than a file. If the
   dump can't be read back, the job goes red that night, not in six months.
5. Encrypts with `gpg --symmetric --cipher-algo AES256`.
6. Uploads to Cloud Storage and reads the object back, failing if the remote byte
   count differs from the local one. A short write is worse than a failed one: it
   looks like a backup.

The job **never deletes anything** — see [Retention](#retention).

### Why these schemas

`public` is the app. `auth` holds logins; without it, a restored database has all
the data and nobody can sign into it. `storage` carries object metadata.
`supabase_migrations` lets a restored database know which migrations it has, so
the migration tooling doesn't try to replay everything.

Skipped: `realtime`, `cron`, `net`, `vault`, `extensions`, `graphql*`. These are
Supabase platform-managed and are recreated by the platform on a new project.
Dumping them adds restore errors, not recoverable data. One consequence worth
knowing: **`pg_cron` job definitions are not in the dump.** We currently schedule
through Render cron ([backend/jobs/cron_dispatch.py](../jobs/cron_dispatch.py)),
not pg_cron, so nothing depends on this today — but if pg_cron jobs are ever added,
add `--schema=cron` here.

---

## One-time setup

Completed 2026-09-01. Recorded here because these are the values to recreate if
the bucket or the repo is ever rebuilt. Every step that needs one fails with a
named error rather than silently producing a bad backup.

Two **secrets** (Settings → Secrets and variables → Actions → Secrets):

| Secret | Where it comes from |
|---|---|
| `BACKUP_DB_URL` | Supabase → Project Settings → Database → **Connection string → Session pooler** (port **5432**) |
| `BACKUP_GPG_PASSPHRASE` | Generate: `openssl rand -base64 48`. **Store in the password manager.** Lose it and the backups are unreadable. |

Three **variables** (same page, Variables tab). None is confidential — access is
granted by the OIDC trust binding below, not by knowing these strings, and a
wrong provider path is far easier to debug when you can read it back:

| Variable | Value |
|---|---|
| `BACKUP_GCP_WIF_PROVIDER` | `projects/532545921392/locations/global/workloadIdentityPools/github/providers/repo` |
| `BACKUP_GCP_SERVICE_ACCOUNT` | `optio-db-backup@optio-483122.iam.gserviceaccount.com` |
| `BACKUP_GCS_BUCKET` | `optio-prod-db-backups` |

### Why Workload Identity Federation and not an access key

The org policy `constraints/storage.restrictAuthTypes` blocks Cloud Storage HMAC
keys, which is the correct default: an HMAC key is a long-lived static credential
sitting in CI forever. Instead the job presents GitHub's OIDC token and GCP trades
it for a credential that expires in an hour. **Nothing long-lived is stored in the
repo**, so there is no backup credential to leak or rotate.

The trust is scoped two ways, and both matter:

- The provider carries the attribute condition
  `assertion.repository == 'shortbird/pathweaver_2.0'`. Without it, a workflow in
  *any* GitHub repository on earth can mint a token for this service account.
- The service account grants `roles/iam.workloadIdentityUser` only to
  `principalSet://.../attribute.repository/shortbird/pathweaver_2.0`, and holds
  `roles/storage.objectAdmin` **on this one bucket**, not project-wide.

To rebuild: create the pool (`github`) and an OIDC provider (`repo`) with issuer
`https://token.actions.githubusercontent.com`, map `google.subject` →
`assertion.sub` and `attribute.repository` → `assertion.repository`, set the
attribute condition, then use **Grant access** on the pool page to bind the
service account — that flow builds the `principalSet://` string for you. The
IAM Service Account Credentials API (`iamcredentials.googleapis.com`) must be on.

### Use the session pooler, not the direct connection

The direct host `db.vvfgxcykxjybtvpfzwyx.supabase.co:5432` is **IPv6-only** unless
the project buys the IPv4 add-on, and GitHub Actions runners are IPv4-only. The
session pooler (port 5432) supports IPv4 and works with `pg_dump`.

The **transaction** pooler (port **6543**) does *not* work with `pg_dump`. If the
dump step fails with a protocol or prepared-statement error, this is why.

### The bucket

`gs://optio-prod-db-backups` — project `optio-483122`, region `us-west1`,
Nearline, uniform bucket-level access, public access prevention on.

Nearline's 30-day minimum storage duration sits well inside the 90-day retention,
so there is no early-deletion charge. The encrypted archive is ~134 MB, so 90 days
of dailies is roughly 12 GB — a few cents a month.

**Do not use Supabase Storage for this** — the point of the off-site copy is that
it survives losing the Supabase account. Google Cloud is a genuinely separate
vendor from Supabase (which runs on AWS), so that property holds.

Moving providers means changing the upload step, not just a config value: the job
authenticates with Workload Identity Federation and uploads with `gcloud storage`.
An S3-compatible target (Backblaze B2, Cloudflare R2) would need an access key and
the `aws s3` calls this workflow used before 2026-09-01.

### Retention

Set a **lifecycle rule on the bucket** to expire objects under `daily/` after
**90 days**. The workflow deliberately does not prune: putting an unattended
nightly delete on the only off-site copy we have is a bad trade. A provider-side
lifecycle rule can't be broken by a bug in the workflow, and it fails safe — it
keeps too much rather than too little.

### Failure alerting

GitHub emails the repo owner when a *scheduled* workflow fails. That covers a red
run. It does **not** cover the workflow silently never running (disabled,
renamed, or a deleted secret), so glance at the Actions tab periodically — or add
a dead-man's-switch ping if this ever carries more weight.

---

## Restoring

### Case 1: "I just deleted rows I shouldn't have" (within 7 days)

**Do not restore the whole project.** Supabase's restore takes the entire project
back to a point in time and takes prod down while it runs — for a handful of rows
that is wildly disproportionate.

Instead pull just what you need out of last night's dump:

```bash
# Fetch and decrypt (gcloud auth login first, as yourself)
gcloud storage cp \
  "gs://optio-prod-db-backups/daily/2026/09/optio-prod-20260901T184534Z.dump.gpg" .
gpg --batch --passphrase "$BACKUP_GPG_PASSPHRASE" \
  --output optio.dump --decrypt optio-prod-20260901T184534Z.dump.gpg

# Restore ONE table into a local scratch database
createdb scratch
pg_restore --dbname=scratch --no-owner --no-privileges \
  --table=sis_invoices optio.dump

# Inspect, then move the rows you need back to prod yourself.
psql scratch -c "SELECT * FROM sis_invoices WHERE id = '...'"
```

The last step is manual on purpose. Re-inserting into a live table is a judgment
call about conflicts and foreign keys that a runbook cannot make for you.

### Case 2: Rebuild the whole database

```bash
gpg --batch --passphrase "$BACKUP_GPG_PASSPHRASE" --output optio.dump \
  --decrypt optio-prod-<stamp>.dump.gpg

pg_restore --dbname "$TARGET_DB_URL" --no-owner --no-privileges --jobs=4 optio.dump
```

Expect errors referencing Supabase platform roles and extensions on a non-Supabase
target — the nightly verification step tolerates the same ones. Confirm success by
row counts, not by exit code:

```sql
SELECT count(*) FROM public.users;   -- 736 on 2026-08-17
SELECT count(*) FROM public.quests;  -- 1031
SELECT count(*) FROM auth.users;     -- 739
```

Custom roles' passwords are not in the dump. Reset them after a restore.

### Case 3: Mid-day mistake, and losing the day is unacceptable

There is no recovery for this today. Both layers are daily snapshots, so a 2pm
error costs everything since midnight. That is the scenario PITR exists for
(~2-minute RPO) and the reason to consider the $100/mo add-on — most valuable
paired with **restore-to-a-new-project**, which lets you recover the damaged rows
from a clone without taking prod down at all.

---

## Verifying it works

The nightly job already does a full restore-and-assert on every run, which is what
the old monthly manual test procedure was trying to achieve. The remaining manual
check is the part a workflow can't do for itself:

**Quarterly** — decrypt the most recent archive *on a laptop, using the passphrase
from the password manager*, and restore one table. This tests the one link the
automation cannot: that a human can still reach the bucket and still has the
passphrase when they need them. The passphrase is the single point of failure —
the job's own credentials are short-lived and mint themselves, but nothing can
recover an archive if that passphrase is lost.
