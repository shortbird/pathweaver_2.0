#!/usr/bin/env python3
"""
Reconstruct the live production schema as a single idempotent SQL file.

WHY THIS EXISTS RATHER THAN `supabase db dump`
----------------------------------------------
`supabase db dump` and `pg_dump` both need a direct Postgres connection, which
means SUPABASE_DB_PASSWORD. This script needs only SUPABASE_PAT, because it
reads the catalogs through the Management API's query endpoint with
`read_only: true` -- the server runs every statement in a READ ONLY transaction,
so this cannot write to production even if the SQL below were wrong.

That trade is deliberate. The baseline was blocking on a credential nobody had
handy; a catalog reconstruction is 95% of a pg_dump and needs no secret beyond
the PAT already in the shell. When SUPABASE_DB_PASSWORD does get provisioned,
`supabase db dump --schema public,private` is the better generator and this
script should be retired in its favour. See MIGRATION_RECONCILIATION.md.

WHAT IT CAPTURES
----------------
schemas, extensions, enum types, sequences, tables (columns/defaults/identity/
generated), constraints (PK, UNIQUE, CHECK, then FK), indexes, views, functions,
triggers, RLS enablement, RLS policies, table and column grants, default ACLs,
and object comments -- for the `public` and `private` schemas only.

WHAT IT DOES NOT CAPTURE
------------------------
- Supabase-managed schemas (auth, storage, realtime, vault, cron, net, graphql).
  A fresh project provisions those itself; dumping them fights the platform.
- Table data. This is a schema baseline. Seeding is supabase/seed.sql and
  scripts/anonymize_staging.py.
- Roles, database-level settings, publications, event triggers.
- `test_schema` and `backup_schema` -- see MIGRATION_RECONCILIATION.md; they are
  production cruft that the baseline deliberately does not carry forward.

Usage:  SUPABASE_PAT=... python3 scripts/dump_prod_schema.py > baseline.sql
"""
import json, os, sys, urllib.request

REF = os.environ.get("SUPABASE_PROJECT_REF", "vvfgxcykxjybtvpfzwyx")
PAT = os.environ.get("SUPABASE_PAT")
SCHEMAS = ("public", "private")

if not PAT:
    sys.exit("SUPABASE_PAT is not set. See docs/MCP_SETUP.md.")


def q(sql):
    """Run one read-only query against production. Returns a list of dicts."""
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": sql, "read_only": True}).encode(),
        headers={
            "Authorization": f"Bearer {PAT}",
            "Content-Type": "application/json",
            # The API sits behind a WAF that 403s the default Python-urllib
            # agent string. Any ordinary UA gets through.
            "User-Agent": "optio-schema-dump/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read().decode()
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} from the query endpoint: {e.read().decode()[:500]}\n"
                 f"--- sql ---\n{sql[:800]}")
    try:
        out = json.loads(body)
    except json.JSONDecodeError:
        sys.exit(f"non-JSON response from the query endpoint:\n{body[:500]}")
    if isinstance(out, dict) and out.get("message"):
        sys.exit(f"query failed: {out['message']}\n--- sql ---\n{sql[:800]}")
    return out


SCHEMA_LIST = ", ".join(f"'{s}'" for s in SCHEMAS)

# Each section is (heading, sql). Every query returns a single column `ddl`,
# already ordered. Ordering is by name everywhere so that re-running the script
# against an unchanged database produces a byte-identical file -- a baseline you
# cannot diff is a baseline nobody re-generates.
SECTIONS = [
    ("SCHEMAS", f"""
SELECT 'CREATE SCHEMA IF NOT EXISTS ' || quote_ident(nspname) || ';' AS ddl
FROM pg_namespace WHERE nspname IN ({SCHEMA_LIST}) ORDER BY nspname;
"""),

    ("EXTENSIONS", """
SELECT 'CREATE EXTENSION IF NOT EXISTS ' || quote_ident(e.extname)
       || ' WITH SCHEMA ' || quote_ident(n.nspname) || ';' AS ddl
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname <> 'plpgsql'
ORDER BY e.extname;
"""),

    ("ENUM TYPES", f"""
SELECT 'CREATE TYPE ' || quote_ident(n.nspname) || '.' || quote_ident(t.typname)
       || ' AS ENUM (' || string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder)
       || ');' AS ddl
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE n.nspname IN ({SCHEMA_LIST})
GROUP BY n.nspname, t.typname
ORDER BY n.nspname, t.typname;
"""),

    ("DOMAINS", f"""
SELECT 'CREATE DOMAIN ' || quote_ident(n.nspname) || '.' || quote_ident(t.typname)
       || ' AS ' || format_type(t.typbasetype, t.typtypmod)
       || CASE WHEN t.typnotnull THEN ' NOT NULL' ELSE '' END
       || coalesce(' DEFAULT ' || t.typdefault, '')
       || coalesce((SELECT ' ' || string_agg(pg_get_constraintdef(c.oid), ' ' ORDER BY c.conname)
                    FROM pg_constraint c WHERE c.contypid = t.oid), '')
       || ';' AS ddl
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname IN ({SCHEMA_LIST}) AND t.typtype = 'd'
ORDER BY n.nspname, t.typname;
"""),

    # Sequences that are not owned by an identity or serial column. Owned ones
    # come back implicitly with their table's column definition, so emitting
    # them here too would create them twice.
    ("SEQUENCES", f"""
SELECT 'CREATE SEQUENCE IF NOT EXISTS ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
       || ' AS ' || format_type(s.seqtypid, NULL)
       || ' INCREMENT BY ' || s.seqincrement
       || ' MINVALUE ' || s.seqmin || ' MAXVALUE ' || s.seqmax
       || ' START WITH ' || s.seqstart || ' CACHE ' || s.seqcache
       || CASE WHEN s.seqcycle THEN ' CYCLE' ELSE ' NO CYCLE' END || ';' AS ddl
FROM pg_sequence s
JOIN pg_class c ON c.oid = s.seqrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ({SCHEMA_LIST})
  AND NOT EXISTS (SELECT 1 FROM pg_depend d
                  WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass
                    AND d.deptype IN ('a','i'))
ORDER BY n.nspname, c.relname;
"""),

    ("TABLES", f"""
SELECT 'CREATE TABLE IF NOT EXISTS ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
       || ' (' || E'\\n  '
       || string_agg(
            quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
            || CASE WHEN a.attcollation <> 0
                     AND a.attcollation <> (SELECT typcollation FROM pg_type WHERE oid = a.atttypid)
                    THEN ' COLLATE ' || (SELECT quote_ident(collname) FROM pg_collation WHERE oid = a.attcollation)
                    ELSE '' END
            || CASE a.attidentity
                 WHEN 'a' THEN ' GENERATED ALWAYS AS IDENTITY'
                 WHEN 'd' THEN ' GENERATED BY DEFAULT AS IDENTITY'
                 ELSE '' END
            || CASE WHEN a.attgenerated = 's'
                    THEN ' GENERATED ALWAYS AS (' || pg_get_expr(ad.adbin, ad.adrelid) || ') STORED'
                    WHEN ad.adbin IS NOT NULL AND a.attidentity = ''
                    THEN ' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid)
                    ELSE '' END
            || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
            ',' || E'\\n  ' ORDER BY a.attnum)
       || E'\\n);' AS ddl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
WHERE n.nspname IN ({SCHEMA_LIST}) AND c.relkind = 'r'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid
                    AND d.classid = 'pg_class'::regclass AND d.deptype = 'e')
GROUP BY n.nspname, c.relname
ORDER BY n.nspname, c.relname;
"""),

    # PK / UNIQUE / CHECK / EXCLUDE. Foreign keys are a separate section so that
    # every table exists before anything references it.
    ("CONSTRAINTS (primary key, unique, check)", f"""
SELECT 'ALTER TABLE ' || quote_ident(n.nspname) || '.' || quote_ident(rel.relname)
       || ' ADD CONSTRAINT ' || quote_ident(con.conname) || ' '
       || pg_get_constraintdef(con.oid) || ';' AS ddl
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname IN ({SCHEMA_LIST}) AND con.contype IN ('p','u','c','x')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = con.oid
                    AND d.classid = 'pg_constraint'::regclass AND d.deptype = 'i')
ORDER BY rel.relname, con.conname;
"""),

    ("CONSTRAINTS (foreign key)", f"""
SELECT 'ALTER TABLE ' || quote_ident(n.nspname) || '.' || quote_ident(rel.relname)
       || ' ADD CONSTRAINT ' || quote_ident(con.conname) || ' '
       || pg_get_constraintdef(con.oid) || ';' AS ddl
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname IN ({SCHEMA_LIST}) AND con.contype = 'f'
ORDER BY rel.relname, con.conname;
"""),

    # Indexes that do not back a constraint; the constraint section already
    # created those.
    ("INDEXES", f"""
SELECT pg_get_indexdef(i.indexrelid) || ';' AS ddl
FROM pg_index i
JOIN pg_class ic ON ic.oid = i.indexrelid
JOIN pg_class tc ON tc.oid = i.indrelid
JOIN pg_namespace n ON n.oid = ic.relnamespace
WHERE n.nspname IN ({SCHEMA_LIST})
  AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
ORDER BY tc.relname, ic.relname;
"""),

    # Functions before views and triggers: a view or a policy may call one.
    ("FUNCTIONS", f"""
SELECT pg_get_functiondef(p.oid) || ';' AS ddl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ({SCHEMA_LIST})
  AND p.prokind IN ('f','p')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid
                    AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
ORDER BY n.nspname, p.proname, p.oid;
"""),

    ("VIEWS", f"""
SELECT 'CREATE OR REPLACE VIEW ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
       || ' AS' || E'\\n' || pg_get_viewdef(c.oid, true) AS ddl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ({SCHEMA_LIST}) AND c.relkind = 'v'
ORDER BY n.nspname, c.relname;
"""),

    ("MATERIALIZED VIEWS", f"""
SELECT 'CREATE MATERIALIZED VIEW IF NOT EXISTS ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
       || ' AS' || E'\\n' || pg_get_viewdef(c.oid, true) AS ddl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ({SCHEMA_LIST}) AND c.relkind = 'm'
ORDER BY n.nspname, c.relname;
"""),

    ("TRIGGERS", f"""
SELECT pg_get_triggerdef(t.oid, true) || ';' AS ddl
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ({SCHEMA_LIST}) AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
"""),

    ("ROW LEVEL SECURITY", f"""
SELECT 'ALTER TABLE ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
       || ' ENABLE ROW LEVEL SECURITY;'
       || CASE WHEN c.relforcerowsecurity
               THEN E'\\nALTER TABLE ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
                    || ' FORCE ROW LEVEL SECURITY;'
               ELSE '' END AS ddl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ({SCHEMA_LIST}) AND c.relkind = 'r' AND c.relrowsecurity
ORDER BY n.nspname, c.relname;
"""),

    # Policy DDL is assembled by hand: there is no pg_get_policydef().
    ("POLICIES", f"""
SELECT 'CREATE POLICY ' || quote_ident(pol.polname)
       || ' ON ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
       || CASE WHEN pol.polpermissive THEN ' AS PERMISSIVE' ELSE ' AS RESTRICTIVE' END
       || ' FOR ' || CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                                     WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                                     ELSE 'ALL' END
       || ' TO ' || coalesce(
            (SELECT string_agg(quote_ident(pg_get_userbyid(r)), ', ' ORDER BY pg_get_userbyid(r))
             FROM unnest(pol.polroles) AS r WHERE r <> 0), 'PUBLIC')
       || coalesce(E'\\n  USING (' || pg_get_expr(pol.polqual, pol.polrelid) || ')', '')
       || coalesce(E'\\n  WITH CHECK (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')', '')
       || ';' AS ddl
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ({SCHEMA_LIST})
ORDER BY c.relname, pol.polname;
"""),

    # Table-level grants. Restricted to the four roles this platform actually
    # issues -- dumping postgres/supabase_admin grants would be noise, and they
    # are provisioned by the platform on a fresh project anyway.
    # Table-level grants, read from pg_class.relacl rather than
    # information_schema.role_table_grants. The information_schema views filter
    # to grants the *querying* role can see; the Management API connects as a
    # role that sees none of them, so that source silently returns zero rows and
    # the baseline ships with no grants at all. aclexplode on the catalog is not
    # filtered. Restricted to the roles this platform issues -- postgres and
    # supabase_admin grants are platform-provisioned on any fresh project.
    ("GRANTS (table level)", f"""
SELECT 'GRANT ' || string_agg(DISTINCT a.privilege_type, ', ' ORDER BY a.privilege_type)
       || ' ON ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
       || ' TO ' || quote_ident(pg_get_userbyid(a.grantee)) || ';' AS ddl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) AS a
WHERE n.nspname IN ({SCHEMA_LIST})
  AND c.relkind IN ('r','v','m','S')
  AND pg_get_userbyid(a.grantee) IN ('anon','authenticated','service_role')
GROUP BY n.nspname, c.relname, a.grantee
ORDER BY c.relname, pg_get_userbyid(a.grantee);
"""),

    # Column-level grants are the whole point of the C1 organizations fix
    # (20260904173100): anon and authenticated may SELECT 15 reviewed columns of
    # public.organizations and not feature_flags, which used to hold live Stripe
    # secret keys. They do not appear in role_table_grants at all -- which is
    # exactly how that gap went unnoticed for a month -- so they get their own
    # section, and losing them on a rebuild would re-open the finding.
    ("GRANTS (column level)", f"""
SELECT 'GRANT ' || a.privilege_type
       || ' (' || string_agg(quote_ident(att.attname), ', ' ORDER BY att.attnum) || ')'
       || ' ON ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
       || ' TO ' || quote_ident(pg_get_userbyid(a.grantee)) || ';' AS ddl
FROM pg_attribute att
JOIN pg_class c ON c.oid = att.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(att.attacl) AS a
WHERE n.nspname IN ({SCHEMA_LIST})
  AND att.attnum > 0 AND NOT att.attisdropped
  AND pg_get_userbyid(a.grantee) IN ('anon','authenticated','service_role')
GROUP BY n.nspname, c.relname, a.grantee, a.privilege_type
ORDER BY c.relname, pg_get_userbyid(a.grantee), a.privilege_type;
"""),

    ("DEFAULT PRIVILEGES", f"""
SELECT 'ALTER DEFAULT PRIVILEGES FOR ROLE ' || quote_ident(pg_get_userbyid(d.defaclrole))
       || ' IN SCHEMA ' || quote_ident(n.nspname)
       || ' GRANT ' || string_agg(DISTINCT a.privilege_type, ', ' ORDER BY a.privilege_type)
       || ' ON ' || CASE d.defaclobjtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES'
                                         WHEN 'f' THEN 'FUNCTIONS' WHEN 'T' THEN 'TYPES' END
       || ' TO ' || quote_ident(pg_get_userbyid(a.grantee)) || ';' AS ddl
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) AS a
WHERE n.nspname IN ({SCHEMA_LIST})
  AND pg_get_userbyid(a.grantee) IN ('anon','authenticated','service_role')
GROUP BY n.nspname, d.defaclrole, d.defaclobjtype, a.grantee
ORDER BY 1;
"""),

    ("COMMENTS", f"""
SELECT 'COMMENT ON TABLE ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
       || ' IS ' || quote_literal(d.description) || ';' AS ddl
FROM pg_description d
JOIN pg_class c ON c.oid = d.objoid AND d.objsubid = 0
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ({SCHEMA_LIST}) AND c.relkind IN ('r','v','m')
UNION ALL
SELECT 'COMMENT ON COLUMN ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
       || '.' || quote_ident(a.attname) || ' IS ' || quote_literal(d.description) || ';'
FROM pg_description d
JOIN pg_class c ON c.oid = d.objoid
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.objsubid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ({SCHEMA_LIST}) AND d.objsubid > 0
ORDER BY 1;
"""),
]

HEADER = """--
-- Production schema baseline -- Optio (project {ref})
--
-- GENERATED FILE. Do not hand-edit. Regenerate with:
--     SUPABASE_PAT=... python3 scripts/dump_prod_schema.py
--
-- This is a point-in-time reconstruction of the live production schema, taken
-- to end the drift between supabase/migrations/ and
-- supabase_migrations.schema_migrations (OPS-03). It is the new source of truth
-- for what production looks like; every migration filed after it is a delta on
-- top of it.
--
-- IT WAS NEVER APPLIED TO PRODUCTION AND MUST NOT BE.
-- Production already has every object below. Applying it there is at best a
-- long series of no-ops and at worst a lock storm. Its two real uses are:
--   1. standing up a fresh project (staging -- see STAGING_RUNBOOK.md), and
--   2. reading, to answer "what does production actually look like".
-- The reconciliation script marks it applied in the history table without
-- running it, which is what makes `db push` sane again.
--
-- Reconstructed from the system catalogs over the Management API in a READ ONLY
-- transaction, not from pg_dump -- see the module docstring in
-- scripts/dump_prod_schema.py for why, and for what is deliberately missing.
-- The short version: no Supabase-managed schemas, no data, no roles.
--
-- Object counts at generation time are in the section headers below.
--

SET statement_timeout = 0;
SET client_min_messages = warning;
SET search_path = public, extensions;
"""


def main():
    out = [HEADER.format(ref=REF)]
    counts = {}
    for heading, sql in SECTIONS:
        rows = q(sql)
        ddl = [r["ddl"] for r in rows if r.get("ddl")]
        counts[heading] = len(ddl)
        out.append(f"\n--\n-- {heading} ({len(ddl)})\n--\n")
        if not ddl:
            out.append("-- (none)\n")
            continue
        for stmt in ddl:
            s = stmt.rstrip()
            if not s.endswith(";"):
                s += ";"
            # ALTER DEFAULT PRIVILEGES FOR ROLE <r> requires membership in <r>.
            # `postgres` is not a member of `supabase_admin` on a Supabase
            # project, so these three-per-object-type statements are real state
            # that no migration can reproduce -- they would abort the script on
            # a fresh project. Supabase provisions them itself at project
            # creation. Recorded, commented, so the baseline still describes
            # production honestly without being unrunnable.
            if "FOR ROLE supabase_admin" in s:
                s = "-- (platform-provisioned; postgres cannot set these) " + s
            out.append(s + "\n")
    # Some function bodies in production carry CRLF line endings -- they were
    # applied from files written on Windows before .gitattributes landed
    # (2026-09-08), and pg_get_functiondef returns the source verbatim. Git
    # normalises them to LF on commit, so leaving them in would make the
    # committed file differ from a fresh run and destroy the whole point of a
    # deterministic, diffable baseline. Normalise here instead.
    sys.stdout.write("".join(out).replace("\r\n", "\n").replace("\r", "\n"))
    for k, v in counts.items():
        print(f"{v:>6}  {k}", file=sys.stderr)


if __name__ == "__main__":
    main()
