#!/usr/bin/env python3
"""
Generate synthetic data for a staging database, at production scale.

WHY SYNTHETIC RATHER THAN AN ANONYMISED CLONE OF PRODUCTION
-----------------------------------------------------------
OPS-01 exists because real student records -- names, dates of birth, emergency
contacts, evidence media -- are what a developer sees on localhost and what an
automated test run reads and writes. A seeding pipeline that pulls production
data and rewrites the sensitive columns does not end that exposure; it moves it
and makes it conditional on a redaction list being exhaustive. Miss one column
and real children's names are in a database people poke at, silently.

This script never reads production. Every row below is invented. "Must never
copy real student PII" is therefore a property of the design, not a claim about
the completeness of a list of columns.

The cost of that choice is real: synthetic data does not reproduce the quirks of
data entered by actual humans over two years. What it does reproduce is VOLUME,
which is what makes staging useful for the thing it is for -- finding out
whether a migration locks a table before production finds out.

SCALE (measured against production 2026-09-09; --scale multiplies these)
------------------------------------------------------------------------
    organizations              18
    users                   1,013     756 org-managed, 199 platform students,
                                      36 parents, 18 observers, 2 advisors
    org_classes               254
    class_enrollments       2,493
    quests                  1,445
    user_quests             2,666
    user_quest_tasks       14,037
    quest_task_completions  2,113
    user_skill_xp           3,551
    notifications           7,697
    student_access_logs    24,296
    user_activity_events  154,095     92 MB -- the only table where volume bites

WHAT THIS DOES NOT COVER
------------------------
The core learner graph and the SIS tables that hang off classes. It does not
generate: billing and invoices, CRM, curriculum lesson content, AI usage logs,
announcements, messaging, or evidence documents. Those tables stay empty. Adding
one means adding a function here and calling it from main(); the pattern is the
same throughout.

NOT YET RUN AGAINST A REAL DATABASE. There is no staging project to run it on --
that is the point of the runbook this ships with. Expect to iterate on the first
run. It is written to fail loudly and to be re-runnable: --reset truncates
everything it created before regenerating, and the RNG is seeded so two runs
with the same --seed produce identical data.

Usage:
    pip install psycopg[binary]
    DATABASE_URL='postgresql://postgres.<ref>:<pw>@<pooler-host>:5432/postgres' \
      python3 scripts/seed_staging.py --reset
    ... --scale 0.1     a tenth of production, for a quick smoke run
    ... --scale 1.0     production scale (default)

REFUSES TO RUN AGAINST PRODUCTION. The project ref vvfgxcykxjybtvpfzwyx is
hardcoded as a blocklist below. That is a guard against a mistyped DATABASE_URL,
not a security boundary -- do not rely on it as one.
"""
import argparse, hashlib, os, random, sys, uuid
from datetime import datetime, timedelta, timezone

PROD_REFS = {"vvfgxcykxjybtvpfzwyx"}

# Production counts, 2026-09-09. Multiplied by --scale.
COUNTS = {
    "organizations": 18,
    "users_org_managed": 756,
    "users_student": 199,
    "users_parent": 36,
    "users_observer": 18,
    "users_advisor": 2,
    "org_classes": 254,
    "class_enrollments": 2493,
    "quests": 1445,
    "user_quests": 2666,
    "user_quest_tasks": 14037,
    "quest_task_completions": 2113,
    "notifications": 7697,
    "student_access_logs": 24296,
    "user_activity_events": 154095,
}

PILLARS = ["art", "stem", "communication", "civics", "wellness"]
ORG_ROLES = ["student", "parent", "advisor", "org_admin", "campus_coordinator", "observer"]

# These are CHECK-constrained in the schema, not free text. Values taken from the
# live constraint definitions rather than guessed -- every one of these columns
# is NOT NULL with no default, so a wrong value fails at the insert.
NOTIFICATION_TYPES = ["quest_started", "task_approved", "announcement",
                      "badge_earned", "message_received", "system_alert"]
ACCESSOR_ROLES = ["parent", "advisor", "observer", "org_admin"]
EVENT_CATEGORIES = ["auth", "quest", "task", "navigation", "evidence"]

# Deliberately unmistakable. If one of these ever shows up in a support ticket or
# a screenshot, it is instantly obvious that someone is looking at staging.
FIRST = ["Ada", "Bram", "Cleo", "Dex", "Esme", "Fen", "Gus", "Hattie", "Ida",
         "Jory", "Kit", "Lark", "Moss", "Nell", "Ora", "Pip", "Quill", "Rune",
         "Sage", "Tove", "Umber", "Vesper", "Wren", "Xanth", "Yarrow", "Zephyr"]
LAST = ["Ashdown", "Brightwater", "Comfrey", "Dunmore", "Everly", "Fallowfield",
        "Grimsby", "Hollowell", "Ironwood", "Jessamine", "Kestrel", "Larkspur",
        "Mirabel", "Northgate", "Oakhurst", "Pemberton", "Quicksilver",
        "Ravensworth", "Stonebridge", "Thistlewood"]


def die(msg):
    sys.exit(f"seed_staging: {msg}")


def guard(url):
    for ref in PROD_REFS:
        if ref in url:
            die(f"DATABASE_URL points at production ({ref}). Refusing.")
    if not url.startswith(("postgresql://", "postgres://")):
        die("DATABASE_URL is not a postgres URI.")


class Gen:
    """Deterministic generators. Same seed in, same database out."""

    def __init__(self, seed):
        self.r = random.Random(seed)

    def uuid(self, ns):
        # Derived from the seed so ids are stable across runs -- makes a
        # re-seeded staging database diffable against the previous one.
        h = hashlib.sha256(f"{ns}:{self.r.random()}".encode()).hexdigest()
        return str(uuid.UUID(h[:32]))

    def name(self):
        return self.r.choice(FIRST), self.r.choice(LAST)

    def email(self, first, last, i):
        # @example.invalid is reserved by RFC 2606 and can never be delivered.
        # This matters more than it looks: a test run once sent real email to
        # real families through the production Brevo key. A domain that cannot
        # resolve makes a repeat impossible rather than unlikely.
        return f"{first.lower()}.{last.lower()}.{i}@staging.example.invalid"

    def phone(self):
        # 555-01xx is the reserved fictional range.
        return f"+1555010{self.r.randint(0, 99):02d}"

    def past(self, days):
        return datetime.now(timezone.utc) - timedelta(
            days=self.r.uniform(0, days), seconds=self.r.uniform(0, 86400))

    def dob(self, lo=8, hi=18):
        return (datetime.now(timezone.utc) - timedelta(days=365 * self.r.randint(lo, hi))).date()


def scaled(name, scale):
    return max(1, int(COUNTS[name] * scale))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--seed", type=int, default=20260909)
    ap.add_argument("--reset", action="store_true",
                    help="truncate the tables this script writes, then regenerate")
    ap.add_argument("--dry-run", action="store_true",
                    help="print what would be generated and exit without connecting")
    a = ap.parse_args()

    if a.dry_run:
        print(f"scale={a.scale} seed={a.seed}")
        for k in COUNTS:
            print(f"  {k:<24} {scaled(k, a.scale):>8,}")
        return

    url = os.environ.get("DATABASE_URL") or die("DATABASE_URL is not set")
    guard(url)

    try:
        import psycopg
    except ImportError:
        die("psycopg is not installed. pip install 'psycopg[binary]'")

    g = Gen(a.seed)
    n = lambda k: scaled(k, a.scale)

    with psycopg.connect(url, autocommit=False) as conn, conn.cursor() as cur:
        cur.execute("SELECT current_database(), version()")
        print("connected:", cur.fetchone()[0])

        if a.reset:
            # Order does not matter with CASCADE, but auth.users is last because
            # public.users.id references it.
            for t in ["public.user_activity_events", "public.student_access_logs",
                      "public.notifications", "public.quest_task_completions",
                      "public.user_quest_tasks", "public.user_quests",
                      "public.user_skill_xp", "public.class_enrollments",
                      "public.org_classes", "public.quests", "public.users",
                      "public.organizations"]:
                cur.execute(f"TRUNCATE {t} CASCADE")
            cur.execute("DELETE FROM auth.users WHERE email LIKE '%@staging.example.invalid'")
            print("reset: truncated")

        # ---- organizations -------------------------------------------------
        orgs = []
        for i in range(n("organizations")):
            oid = g.uuid("org")
            orgs.append(oid)
            cur.execute(
                """INSERT INTO public.organizations (id, name, slug, is_active, created_at)
                   VALUES (%s, %s, %s, true, %s)""",
                (oid, f"{g.r.choice(LAST)} Academy", f"staging-org-{i}", g.past(700)))
        print(f"organizations: {len(orgs)}")

        # ---- users ---------------------------------------------------------
        # The role model is the one in CLAUDE.md: an org user carries
        # role='org_managed' with the real role in org_role, and a platform user
        # carries a direct role with org_role NULL. Two CHECK constraints
        # (org_managed_requires_org, direct_role_no_org_role) enforce exactly
        # that, so getting it wrong fails at the insert rather than subtly.
        students, parents, all_users = [], [], []
        idx = 0

        def add_user(role, org_role=None, org=None):
            nonlocal idx
            uid, (f, l) = g.uuid("user"), g.name()
            email = g.email(f, l, idx)
            idx += 1
            cur.execute(
                """INSERT INTO auth.users (instance_id, id, aud, role, email,
                       encrypted_password, email_confirmed_at, raw_app_meta_data,
                       raw_user_meta_data, created_at, updated_at)
                   VALUES ('00000000-0000-0000-0000-000000000000', %s, 'authenticated',
                       'authenticated', %s, crypt('staging-not-a-real-password', gen_salt('bf')),
                       now(), '{"provider":"email","providers":["email"]}'::jsonb,
                       '{}'::jsonb, now(), now())""", (uid, email))
            cur.execute(
                """INSERT INTO public.users (id, email, first_name, last_name,
                       display_name, role, org_role, organization_id, total_xp, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (uid, email, f, l, f"{f} {l}", role, org_role, org,
                 g.r.randint(0, 5000), g.past(600)))
            all_users.append(uid)
            return uid

        for _ in range(n("users_org_managed")):
            org = g.r.choice(orgs)
            # Weighted to match production's shape: overwhelmingly students.
            orole = g.r.choices(ORG_ROLES, weights=[80, 8, 5, 3, 2, 2])[0]
            u = add_user("org_managed", orole, org)
            if orole == "student":
                students.append(u)
        for _ in range(n("users_student")):
            students.append(add_user("student"))
        for _ in range(n("users_parent")):
            parents.append(add_user("parent"))
        for _ in range(n("users_observer")):
            add_user("observer")
        for _ in range(n("users_advisor")):
            add_user("advisor")
        print(f"users: {len(all_users)} ({len(students)} students)")

        # ---- classes and enrolments ---------------------------------------
        classes = []
        for i in range(n("org_classes")):
            cid = g.uuid("class")
            classes.append(cid)
            cur.execute(
                """INSERT INTO public.org_classes (id, organization_id, name, created_by, created_at)
                   VALUES (%s, %s, %s, %s, %s)""",
                (cid, g.r.choice(orgs), f"Staging Class {i}",
                 g.r.choice(all_users), g.past(400)))
        for _ in range(n("class_enrollments")):
            cur.execute(
                # enrolled_at, not created_at -- this table has no created_at.
                """INSERT INTO public.class_enrollments (id, class_id, student_id, status, enrolled_at)
                   VALUES (%s, %s, %s, 'active', %s) ON CONFLICT DO NOTHING""",
                (g.uuid("enr"), g.r.choice(classes), g.r.choice(students), g.past(300)))
        print(f"classes: {len(classes)}")

        # ---- quests and the learner graph ----------------------------------
        quests = []
        for i in range(n("quests")):
            qid = g.uuid("quest")
            quests.append(qid)
            cur.execute(
                # quest_type MUST be given. Its column default is 'custom',
                # which check_quest_type rejects -- the default violates the
                # constraint, so any insert omitting it fails. See
                # PHASE_2_HANDOFF.md; this is a production schema bug, not a
                # staging artifact.
                """INSERT INTO public.quests (id, title, quest_type, is_active, created_at)
                   VALUES (%s, %s, %s, true, %s)""",
                (qid, f"Staging Quest {i}: {g.r.choice(LAST)}",
                 g.r.choices(["optio", "class", "course"], weights=[94, 4, 2])[0],
                 g.past(500)))

        user_quests = []
        for _ in range(n("user_quests")):
            uqid = g.uuid("uq")
            user_quests.append((uqid, g.r.choice(students), g.r.choice(quests)))
            cur.execute(
                """INSERT INTO public.user_quests (id, user_id, quest_id, started_at)
                   VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING""",
                (uqid, user_quests[-1][1], user_quests[-1][2], g.past(300)))

        tasks = []
        for i in range(n("user_quest_tasks")):
            uqid, uid, qid = g.r.choice(user_quests)
            tid = g.uuid("task")
            tasks.append((tid, uid, qid))
            cur.execute(
                """INSERT INTO public.user_quest_tasks (id, user_id, quest_id,
                       user_quest_id, title, pillar, xp_value, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                # 25 is the platform-wide XP floor and is clamped in three
                # places. Generating anything below it produces data the
                # application would never have written.
                (tid, uid, qid, uqid, f"Staging Task {i}", g.r.choice(PILLARS),
                 g.r.choice([25, 50, 100, 150, 200]), g.past(250)))

        for _ in range(n("quest_task_completions")):
            tid, uid, qid = g.r.choice(tasks)
            cur.execute(
                # No xp_awarded column here. CLAUDE.md's "Core Tables" section
                # lists one; the table does not have it. XP lives on
                # user_quest_tasks.xp_value and in user_skill_xp.
                """INSERT INTO public.quest_task_completions (id, user_id, quest_id,
                       task_id, completed_at)
                   VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
                (g.uuid("qtc"), uid, qid, tid, g.past(200)))

        for uid in students:
            for p in PILLARS:
                cur.execute(
                    """INSERT INTO public.user_skill_xp (user_id, pillar, xp_amount)
                       VALUES (%s, %s, %s) ON CONFLICT DO NOTHING""",
                    (uid, p, g.r.randint(0, 2000)))
        print(f"quests: {len(quests)}  tasks: {len(tasks)}")

        # ---- volume tables --------------------------------------------------
        # user_activity_events is 92 MB in production and is the reason this
        # script bothers with scale at all. Batched -- one INSERT per row here
        # is the difference between a minute and an hour.
        ev = [(g.uuid("ev"), g.r.choice(all_users), g.uuid("sess"),
               g.r.choice(["login", "quest_start", "task_complete", "page_view",
                           "evidence_upload", "logout"]),
               g.r.choice(EVENT_CATEGORIES), g.past(365))
              for _ in range(n("user_activity_events"))]
        cur.executemany(
            """INSERT INTO public.user_activity_events
                   (id, user_id, session_id, event_type, event_category, created_at)
               VALUES (%s, %s, %s, %s, %s, %s)""", ev)
        print(f"user_activity_events: {len(ev):,}")

        cur.executemany(
            """INSERT INTO public.notifications (id, user_id, type, title, message, created_at)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            [(g.uuid("ntf"), g.r.choice(all_users), g.r.choice(NOTIFICATION_TYPES),
              "Staging notification", "Generated by seed_staging.py.", g.past(120))
             for _ in range(n("notifications"))])

        cur.executemany(
            """INSERT INTO public.student_access_logs
                   (id, student_id, accessor_id, accessor_role, data_accessed, access_timestamp)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            [(g.uuid("sal"), g.r.choice(students), g.r.choice(all_users),
              g.r.choice(ACCESSOR_ROLES), '{"fields": ["display_name"]}', g.past(180))
             for _ in range(n("student_access_logs"))])

        conn.commit()
        print("committed.")

        cur.execute("""SELECT count(*) FROM public.users
                       WHERE email NOT LIKE '%@staging.example.invalid'""")
        leaked = cur.fetchone()[0]
        if leaked:
            print(f"WARNING: {leaked} users do not carry a staging address. "
                  f"If this database was ever loaded from production, stop and investigate.")
        else:
            print("verified: every user carries an @staging.example.invalid address.")


if __name__ == "__main__":
    main()
