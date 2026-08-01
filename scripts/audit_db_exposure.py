#!/usr/bin/env python3
"""Fail if the LIVE database exposes anything to the public Data API.

Why this exists
---------------
On 2026-08-01 an external audit found three critical exposures that were
invisible to code review, because the offending objects were created out-of-band
and no migration in the repo described them:

  * `organizations.feature_flags` held a live Stripe SECRET key. The table's RLS
    policy was `USING (is_active = true)` -- and Postgres RLS filters ROWS, not
    COLUMNS -- so the key was readable by the `anon` role, whose key ships in the
    public JS bundle. No login required.
  * `portfolio_visibility_reset_20260801` (718 rows of per-student minor and
    consent flags) and `sis_billing_audit` shipped with RLS disabled. Because
    default privileges grant `anon` ALL on every new public table, both were
    world-readable and world-TRUNCATABLE.

Static tests (backend/tests/test_secret_exposure_guard.py) stop the code half.
This stops the database half, which is the half that actually bit. Run it on a
schedule against production -- drift happens through the dashboard and the SQL
editor, not only through pull requests.

Usage
-----
    SUPABASE_ACCESS_TOKEN=sbp_...  python scripts/audit_db_exposure.py
    ... --project-ref vvfgxcykxjybtvpfzwyx   # or SUPABASE_PROJECT_REF

Exit codes: 0 clean, 1 exposure found, 2 could not run (missing creds, API error).

Never prints a credential value -- only the column/key path where one was found.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PROJECT_REF = 'vvfgxcykxjybtvpfzwyx'
API = 'https://api.supabase.com/v1/projects/{ref}/database/query'

# Columns `anon` is allowed to read on `organizations`. Everything else on that
# table -- notably feature_flags -- must stay invisible. Keep in sync with the
# GRANT in supabase/migrations/20260801_org_secrets_and_rls_gaps.sql.
ORG_PUBLIC_COLUMNS = {
    'id', 'name', 'slug', 'is_active', 'timezone', 'branding_config',
    'quest_visibility_policy', 'course_visibility_policy', 'accreditation_source',
    'created_at', 'updated_at', 'ai_features_enabled', 'ai_chatbot_enabled',
    'ai_lesson_helper_enabled', 'ai_task_generation_enabled',
}

# Tables intentionally reachable by anon/authenticated through a policy. Adding
# to this list is a deliberate decision to publish, and should be reviewed.
KNOWN_PUBLIC_TABLES = {
    'contact_submissions',   # public "anyone can submit" form (INSERT only)
    'promo_interest',        # ditto
}

# Tables the anon key is ALLOWED to return rows from. Every entry is a decision
# to publish that data to the open internet, so each needs a reason. Adding a
# table here to make the build green is the exact mistake this file exists to
# prevent -- if a table appears in the probe output and is not listed here, the
# default answer is to fix the policy, not to extend this set.
ANON_READABLE_BY_DESIGN = {
    'organizations',      # public org directory (name/slug/branding) for /join and embeds.
                          # Column exposure is constrained separately -- see
                          # check_organizations_columns; RLS cannot filter columns.
    'course_quest_tasks', # curriculum task text, shown in the public course catalog
    'ai_task_cache',      # cached AI-suggested task text, no user data
    'quests',             # the public quest catalog
    'quest_sample_tasks', # sample task text attached to catalog quests
    'quest_sources',      # catalog source names + header images
    'docs_articles',      # the public help centre
    'docs_categories',    # ditto
    'philosophy_nodes',   # public marketing content (/philosophy map)
    'philosophy_edges',   # ditto
    'site_settings',      # site name, logo, colours -- rendered for logged-out visitors
    'platform_settings',  # teacher-of-record name/bio shown on public transcripts
    'tutor_tier_limits',  # static plan limits, no user data
    'security_warnings_documentation',  # static help text
}

# Reviewed on 2026-08-01 and deliberately NOT allowlisted. Each returns rows to
# the public anon key and carries personal or org data, so each needs an explicit
# product decision rather than a line in the set above. Until they are resolved
# this script exits non-zero, which is the intended behaviour -- the alternative
# is a green check that means nothing.
#
#   diplomas / user_skill_xp / user_mastery / user_task_evidence_documents /
#   evidence_document_blocks
#       Readable when `diplomas.is_public = true`. That is the PRE-2026-08-01
#       privacy rule. The private-by-default work moved the real decision into
#       utils/portfolio_access.py (consent record + minor check + parent control),
#       but these RLS policies were never updated to match, so the Data API still
#       answers the old question. Anything that sets is_public -- a bug, a legacy
#       row, a future feature -- publishes the student's evidence CONTENT to the
#       internet without the consent gate the application enforces.
#   bounties
#       `status = 'active'` exposes allowed_student_ids and moderation_notes.
#   curriculum_attachments
#       Exposes file_url for org curriculum uploads, including soft-deleted rows.


def _get(url: str, token: str):
    req = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {token}',
        'User-Agent': 'optio-db-exposure-audit/1.0',
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def q(ref: str, token: str, sql: str):
    req = urllib.request.Request(
        API.format(ref=ref),
        data=json.dumps({'query': sql}).encode(),
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            # Supabase sits behind Cloudflare, which answers urllib's default
            # Python-urllib/3.x agent with a 403 (code 1010).
            'User-Agent': 'optio-db-exposure-audit/1.0',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors='ignore')[:400]
        print(f"::error::Supabase management API {e.code}: {body}", file=sys.stderr)
        sys.exit(2)
    except Exception as e:  # noqa: BLE001
        print(f"::error::Could not reach the Supabase management API: {e}", file=sys.stderr)
        sys.exit(2)


# ── Checks ───────────────────────────────────────────────────────────────────

def check_rls_enabled(ref, token):
    """Every table in `public` must have RLS on. Without it, default privileges
    make the table fully readable AND writable by anon."""
    rows = q(ref, token, """
        select c.relname as tbl,
               coalesce(string_agg(distinct g.privilege_type, ','), '') as anon_grants
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        left join information_schema.role_table_grants g
          on g.table_schema = 'public' and g.table_name = c.relname and g.grantee = 'anon'
        where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
        group by c.relname order by 1;
    """)
    return [
        f"table `{r['tbl']}` has RLS DISABLED"
        + (f" and grants anon: {r['anon_grants']}" if r['anon_grants'] else "")
        for r in rows
    ]


def check_no_always_true_policies(ref, token):
    """Policies with an unconditional qualifier.

    Grants are blanket in this project (default privileges give anon ALL on every
    public table), so grants alone are not a useful signal -- RLS is the control.
    What matters is a policy that evaluates to true for everyone, which turns the
    control back off.
    """
    rows = q(ref, token, """
        select tablename as tbl, policyname as pol, cmd,
               coalesce(qual, '') as qual, coalesce(with_check, '') as wc
        from pg_policies
        where schemaname = 'public'
          and (roles::text like '%anon%' or roles::text = '{public}')
          and (btrim(coalesce(qual, '')) = 'true'
               or btrim(coalesce(with_check, '')) = 'true')
        order by 1, 2;
    """)
    # An unconditional SELECT policy on a table that is deliberately published
    # is not a finding -- that is how you publish a table.
    expected_public = KNOWN_PUBLIC_TABLES | ANON_READABLE_BY_DESIGN
    return [
        f"policy `{r['pol']}` on `{r['tbl']}` ({r['cmd']}) is unconditional "
        f"(always-true), so RLS does not constrain it"
        for r in rows if r['tbl'] not in expected_public
    ]


def check_organizations_columns(ref, token):
    """C1 directly: RLS cannot restrict columns, so `organizations` must rely on
    column-level GRANTs to keep feature_flags away from anon."""
    rows = q(ref, token, """
        select distinct column_name as col, grantee
        from information_schema.column_privileges
        where table_schema = 'public' and table_name = 'organizations'
          and grantee in ('anon','authenticated') and privilege_type = 'SELECT'
        order by 1;
    """)
    return [
        f"`organizations.{r['col']}` is SELECT-able by `{r['grantee']}` "
        f"(not in the reviewed public column set)"
        for r in rows if r['col'] not in ORG_PUBLIC_COLUMNS
    ]


def check_no_secrets_in_jsonb(ref, token):
    """Credential-shaped keys inside jsonb config columns.

    Reports the KEY PATH only, never the value. `organizations.feature_flags` is
    the one that bit, but the same shape (config blob echoed to clients) recurs.
    """
    rows = q(ref, token, r"""
        select o.id::text as org_id, o.name, kv.key as bad_key, 'feature_flags' as col
        from public.organizations o,
             lateral jsonb_each(coalesce(o.feature_flags, '{}'::jsonb)) top,
             lateral jsonb_each(case when jsonb_typeof(top.value) = 'object'
                                     then top.value else '{}'::jsonb end) kv
        where kv.key ~* '(secret|password|private_key|api_?key|access_key|client_secret|auth_token)'
        union all
        select o.id::text, o.name, top.key, 'feature_flags'
        from public.organizations o,
             lateral jsonb_each(coalesce(o.feature_flags, '{}'::jsonb)) top
        where top.key ~* '(secret|password|private_key|api_?key|access_key|client_secret|auth_token)';
    """)
    return [
        f"org `{r['name']}` has a credential-shaped key `{r['bad_key']}` in "
        f"{r['col']} -- move it to organization_secrets (see utils/org_secrets.py)"
        for r in rows
    ]


def check_anon_cannot_read_rows(ref, token):
    """The empirical check: what does the public anon key ACTUALLY return?

    Every other check reasons about configuration. This one asks PostgREST the
    same question an attacker would, using the same key that ships in the JS
    bundle, and fails on any table outside the reviewed-public list that hands
    back a row. This is how C2 was found; it is the check most likely to catch
    the next one, because it needs no theory about why the data is reachable.
    """
    keys = _get(f'https://api.supabase.com/v1/projects/{ref}/api-keys', token)
    anon = next((k['api_key'] for k in keys if k.get('name') == 'anon'), None)
    if not anon:
        return ['could not resolve the project anon key; probe skipped']

    tables = [r['tbl'] for r in q(ref, token, """
        select c.relname as tbl from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by 1;
    """)]

    base = f'https://{ref}.supabase.co/rest/v1/'
    findings = []
    for table in tables:
        if table in ANON_READABLE_BY_DESIGN:
            continue
        req = urllib.request.Request(
            f'{base}{urllib.parse.quote(table)}?select=*&limit=1',
            headers={'apikey': anon, 'Authorization': f'Bearer {anon}',
                     'Accept': 'application/json',
                     'Prefer': 'count=exact', 'Range': '0-0',
                     'User-Agent': 'optio-db-exposure-audit/1.0'},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                total = (resp.headers.get('content-range') or '').split('/')[-1]
                body = json.loads(resp.read().decode() or '[]')
        except urllib.error.HTTPError:
            continue          # 401/404 = not reachable by anon, which is the goal
        except Exception:     # noqa: BLE001
            continue
        if body:
            findings.append(
                f"`{table}` returns rows to the PUBLIC anon key "
                f"({total} row(s) visible) -- data readable by anyone on the internet"
            )
    return findings


CHECKS = [
    ('RLS enabled on every public table', check_rls_enabled),
    ('No unconditional (always-true) anon policies', check_no_always_true_policies),
    ('organizations exposes only reviewed columns', check_organizations_columns),
    ('No credentials in jsonb config columns', check_no_secrets_in_jsonb),
    ('anon key cannot read non-public tables', check_anon_cannot_read_rows),
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--project-ref',
                    default=os.environ.get('SUPABASE_PROJECT_REF', DEFAULT_PROJECT_REF))
    args = ap.parse_args()

    token = os.environ.get('SUPABASE_ACCESS_TOKEN', '').strip()
    if not token:
        print("::error::SUPABASE_ACCESS_TOKEN is not set. This check cannot run, and "
              "a silent skip is how C1/C2 survived. Add the secret or remove the job.",
              file=sys.stderr)
        return 2

    findings = []
    for label, fn in CHECKS:
        result = fn(args.project_ref, token)
        status = 'FAIL' if result else 'ok'
        print(f"[{status:>4}] {label}")
        for item in result:
            print(f"         - {item}")
        findings.extend(result)

    print()
    if findings:
        print(f"::error::{len(findings)} Data API exposure(s) found in project "
              f"{args.project_ref}. See AUDIT.md for the incident these checks encode.")
        return 1
    print(f"No Data API exposures found in project {args.project_ref}.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
