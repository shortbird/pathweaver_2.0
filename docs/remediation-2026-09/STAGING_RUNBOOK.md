# Staging project runbook (OPS-01)

Numbered steps to stand up a staging Supabase project and repoint dev, local and
E2E at it. Work through it with the Supabase dashboard open.

**Why this exists.** Dev, local development and the E2E suite all point at
production `vvfgxcykxjybtvpfzwyx`. Real student records — names, dates of birth,
emergency contacts, evidence media — are what a developer sees on localhost and
what an automated test run reads and writes. A test run has already sent real
email to real families through the production Brevo key. That is the finding;
this is the fix.

**Nothing here has been executed.** No staging project exists yet, so
`scripts/seed_staging.py` has never run against a real database. Expect to
iterate on step 6.

---

## Decision first: what tier

You deferred this. Pick before step 1.

| | Supabase Pro (~$25/mo) | Free tier |
|---|---|---|
| Pauses when idle | no | **yes, after ~1 week** |
| Storage | 8 GB | 500 MB |
| Fits the data? | easily | yes — production's dump is 147 MB |

The data fits either way. The question is the pausing: a paused project fails
every CI run that touches it until someone clicks resume, and the failure looks
like a connection error rather than "your project is asleep". If staging is only
for occasional migration rehearsal, free is fine and you accept that friction.
If CI is going to depend on it, Pro.

**Recommendation: free tier to start.** Nothing in the plan below makes CI
depend on staging yet — step 8 is explicitly deferred. Upgrade when you wire the
E2E suite to it, which is when pausing would start costing you.

---

## 1. Create the project

1. Supabase dashboard → **New project**, in the same **Optio** org.
2. Name: `optio-staging`. Region: **US West (North California)** — match
   production so latency-sensitive behaviour is comparable.
3. Set a strong database password and **put it in your password manager now**.
   You will need it three more times in this runbook.
4. Note the project ref from the URL (`https://supabase.com/dashboard/project/<REF>`).
   It appears throughout as `<STAGING_REF>`.

## 2. Apply the baseline

This is the first time anything will have built a database from
`supabase/baseline/20260909144435_baseline_20260909.sql`. **Treat it as a test of
the baseline as much as of this runbook.** If it fails, that is information worth
having — the file is a catalog reconstruction, not a `pg_dump`, and it has never
been executed.

1. Dashboard → **SQL Editor** → paste the whole file → Run.
2. Expect it to take a minute or two. 241 tables, 634 indexes, 1,106
   constraints, 121 functions, 302 policies.
3. If it fails partway, note the statement and **stop** — do not patch around it
   by hand. A baseline that needed hand-patching to apply is not a baseline. Send
   me the error and I will fix the generator.
4. Verify:
   ```sql
   SELECT count(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE';   -- expect 241
   SELECT count(*) FROM pg_policies WHERE schemaname = 'public';  -- expect 302
   ```

### What the baseline does not carry

- **Supabase-managed schemas** (`auth`, `storage`, `realtime`, `vault`, `cron`,
  `net`, `graphql`). The new project provisions those itself.
- **`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`** — nine statements,
  emitted commented out because `postgres` is not a member of that role.
  Supabase sets them at project creation, so this is expected, not a gap.
- **Storage buckets.** Production has private buckets for evidence and quest
  media. If you need them, create them in the dashboard; nothing in the seed
  writes files.

## 3. Bootstrap the API grants

The baseline is schema-only, so PostgREST returns 42501 on every request until
the grants exist. The CI stack already solves this:

```bash
psql "<STAGING_DB_URL>" -v ON_ERROR_STOP=1 -f supabase/ci/grants.sql
```

## 4. Record the migration history

So `supabase db push` treats staging as up to date rather than trying to replay
73 migrations onto a schema that already has them:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements, created_by)
SELECT v, 'baselined', NULL, 'staging-bootstrap'
FROM unnest(ARRAY['20260812000000','20260814000000' /* … all 73 … */]) AS v
ON CONFLICT (version) DO NOTHING;
```

Generate the full list from the directory rather than typing it:

```bash
ls supabase/migrations/*.sql \
  | sed -E 's|.*/([0-9]+)_.*|\1|' \
  | awk '{printf "'"'"'%s'"'"',\n", $1}'
```

## 5. Install the seed script's dependency

```bash
pip install 'psycopg[binary]'
```

## 6. Seed it

```bash
export DATABASE_URL='postgresql://postgres.<STAGING_REF>:<PASSWORD>@aws-1-us-west-1.pooler.supabase.com:5432/postgres'

python3 scripts/seed_staging.py --dry-run          # what it would generate
python3 scripts/seed_staging.py --scale 0.1        # ~15k rows, a couple of minutes
python3 scripts/seed_staging.py --reset --scale 1  # production scale, ~200k rows
```

Use the **session pooler** host and port **5432**. The direct
`db.<ref>.supabase.co` endpoint is IPv6-only without the IPv4 add-on.

**The data is invented, not anonymised.** The script never reads production.
"Never copy real student PII" is a property of the design rather than a claim
about a redaction list being exhaustive — which matters, because the failure
mode of an incomplete redaction list is real children's names sitting in a
database people poke at, silently.

Three things make an accident visible:

- Every email is `@staging.example.invalid`. `.invalid` is reserved by RFC 2606
  and can never resolve, so the Brevo incident cannot repeat from this data.
- Names come from a small deliberately odd list (Wren Thistlewood, Zephyr
  Ironwood). If one appears in a support ticket, someone is looking at staging.
- Phone numbers are all `+1555010xx`, the reserved fictional range.
- The script **refuses to run** against project ref `vvfgxcykxjybtvpfzwyx`. That
  is a typo guard, not a security boundary.

It ends by asserting every user carries a staging address, and warns loudly if
not.

### What it does not generate

Billing and invoices, CRM, curriculum lesson content, AI usage logs,
announcements, messaging, evidence documents. Those tables stay empty. Add a
function and call it from `main()` if you need one — the pattern is uniform.

## 7. Set the environment variables

From the staging project: Settings → API for the URL and keys.

**Render — dev services only.** Leave the two production services alone.

| Service | ID |
|---|---|
| Dev backend | `srv-d9sjl22fngtc73ffenl0` |
| Dev frontend | `srv-d9sjl3n10e5c73a14b2g` |
| Dev mobile web target | `srv-d9sjl42fngtc73fff1d0` |

Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` to the
staging values.

**A Render env var change needs a deploy, not a restart.** The API stores the new
value and the running process keeps the old one, and every signal says it worked.
Trigger a deploy after changing them.

**Local** — `backend/.env`: the same three, plus `SUPABASE_DB_PASSWORD` if you
use the CLI locally.

**GitHub Actions** — nothing yet. See step 8.

## 8. Deferred: point the E2E suite at staging

`mobile-e2e.yml` uses `E2E_*` credentials against production. Repointing it means
creating those users in staging and swapping the secrets.

**Not part of this runbook**, deliberately. Do steps 1–7, confirm staging behaves,
then repoint E2E as its own change — that way, if E2E breaks, you know it was the
repoint and not the baseline. This is also the point where a paused free-tier
project starts failing CI runs, so revisit the tier decision here.

---

## Verification

```sql
-- 1. No production data. The important one.
SELECT count(*) FROM public.users WHERE email NOT LIKE '%@staging.example.invalid';
-- expect 0

-- 2. Schema matches production's shape
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE';   -- 241

-- 3. RLS is on everywhere, as in production
SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
-- expect 0

-- 4. Volume actually landed
SELECT count(*) FROM public.user_activity_events;   -- ~154,000 at scale 1
```

Then rehearse a migration: write a throwaway one, run `migrate-prod.yml`'s logic
against staging by hand, and confirm `db push` applies it. That is the capability
none of this had before.

---

## What this does not fix

**Storage.** Evidence media lives in Supabase Storage, and staging's buckets are
empty. Anything exercising uploads needs buckets created and, if you want them
populated, files generated — the seed writes rows, not objects.

**The production Brevo key.** Local and dev `.env` files still carry it. Staging
addresses cannot receive mail, so the specific incident cannot repeat, but the
key itself is still a live production credential in a development environment.
Worth its own item.

**Third-party keys generally.** Stripe, Gemini, SendGrid, Pexels in dev are
production keys. Staging fixes the database; it does not fix those.
