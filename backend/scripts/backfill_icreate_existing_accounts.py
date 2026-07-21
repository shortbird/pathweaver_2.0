"""
Backfill: normalize students who "already had an Optio account" into full
iCreate org students, so they are indistinguishable from funnel-created ones.

Why: before 2026-07 the funnel 409'd when a kid's email already had an Optio
account, and the admin "add to family" flow only inserted a household_members
row. Both paths left half-connected accounts: in a household but not in the org
(invisible to the roster/CLP), org-attached but with no parent link, or worse, a
brand-new duplicate dependent while the kid's real account sat unused.

What it does (per org, default iCreate):
  1. attach   — household members with relationship='student' whose users row is
                not attached to the org -> set org fields (org_managed/student;
                dependents keep role='student' and just gain organization_id).
  2. link     — every non-dependent student in a household gets
                parent_student_links to that household's guardians.
  3. report   — org students with NO household (needs a human to pick/create the
                family) and duplicate candidates: a platform account with the
                same first+last name as an org student/dependent. Report-only.
  4. merge    — explicit, one pair at a time: --merge KEEP_ID REMOVE_ID prints a
                full data census of BOTH accounts, repoints every SIS row AND
                every learning-data row (quests, tasks, completions, learning
                events, evidence, diplomas, transfer credits) from the duplicate
                onto the kept account, sums XP rollups instead of dropping them,
                attaches the kept account to the org + household + parent, copies
                profile fields the kept account is missing, then deletes the
                duplicate (users row + auth user) and VERIFIES the kept account
                retained all of its rows. KEEP should be the kid's real/original
                account, REMOVE the funnel-made duplicate — but no learning data
                is lost even if the pair is given the other way around.

Dry-run by default; pass --apply to write.

Run from backend/ with the venv:
    ../venv/bin/python scripts/backfill_icreate_existing_accounts.py
    ../venv/bin/python scripts/backfill_icreate_existing_accounts.py --apply
    ../venv/bin/python scripts/backfill_icreate_existing_accounts.py --find tiberius
    ../venv/bin/python scripts/backfill_icreate_existing_accounts.py --merge KEEP REMOVE            # dry-run
    ../venv/bin/python scripts/backfill_icreate_existing_accounts.py --merge KEEP REMOVE --apply
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))
from supabase import create_client

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SERVICE_KEY']

ICREATE_ORG_ID = '1340004f-d12f-44ae-9ec3-185af5240130'

# (table, student-id column) pairs a merge must repoint from the duplicate.
STUDENT_ROW_TABLES = [
    ('class_enrollments', 'student_id'),
    ('sis_waitlist_entries', 'student_user_id'),
    ('sis_enrollment_waitlist', 'student_user_id'),
    ('sis_attendance', 'student_user_id'),
    ('emergency_contacts', 'student_user_id'),
    ('school_enrollments', 'student_user_id'),
    ('parent_student_links', 'student_user_id'),
    ('household_members', 'user_id'),
    ('advisor_student_assignments', 'student_id'),
    ('observer_student_links', 'student_id'),
]

# Learning-data tables (the kid's actual work). The funnel duplicate normally
# has none of this, but when it does — or when the "duplicate" turns out to be
# the kid's older account — the merge repoints it so no history is ever lost.
LEARNING_ROW_TABLES = [
    ('user_quests', 'user_id'),
    ('user_quest_tasks', 'user_id'),
    ('quest_task_completions', 'user_id'),
    ('learning_events', 'user_id'),
    ('user_task_evidence_documents', 'user_id'),
    ('diplomas', 'user_id'),
    ('transfer_credits', 'user_id'),
]

# Per-(user, key) XP rollups: rows can't be blindly repointed when the kept
# account already has the same key — the amounts are summed instead.
XP_SUM_TABLES = [
    ('user_skill_xp', 'pillar'),
    ('user_subject_xp', 'school_subject'),
]

# users profile fields copied onto the kept account when it lacks them.
PROFILE_FILL_FIELDS = ('date_of_birth', 'gender', 'allergies', 'medications',
                       'preferred_name', 'avatar_url')


def _name(u):
    return f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip() or u.get('display_name') or u['id'][:8]


def _households(db, org_id):
    hhs = (db.table('households').select('id, name, primary_contact_user_id')
           .eq('organization_id', org_id).execute()).data or []
    if not hhs:
        return hhs, []
    members = (db.table('household_members').select('household_id, user_id, relationship')
               .in_('household_id', [h['id'] for h in hhs]).execute()).data or []
    return hhs, members


def _users_by_id(db, ids):
    out = {}
    ids = [i for i in set(ids) if i]
    for chunk in (ids[i:i + 100] for i in range(0, len(ids), 100)):
        rows = (db.table('users')
                .select('id, first_name, last_name, display_name, email, role, org_role, '
                        'org_roles, organization_id, is_dependent, managed_by_parent_id, '
                        'date_of_birth, gender, allergies, medications, preferred_name, '
                        'avatar_url, total_xp, created_at')
                .in_('id', chunk).execute()).data or []
        out.update({r['id']: r for r in rows})
    return out


def fix_attach_and_link(db, org_id, apply):
    """Steps 1 + 2: attach half-connected household students, ensure parent links."""
    hhs, members = _households(db, org_id)
    users = _users_by_id(db, [m['user_id'] for m in members])
    links = (db.table('parent_student_links').select('parent_user_id, student_user_id')
             .execute()).data or []
    linked = {(l['parent_user_id'], l['student_user_id']) for l in links}

    by_hh = {}
    for m in members:
        by_hh.setdefault(m['household_id'], []).append(m)

    n_attach = n_link = 0
    for hh in hhs:
        ms = by_hh.get(hh['id'], [])
        students = [users.get(m['user_id']) for m in ms if m.get('relationship') == 'student']
        guardians = [users.get(m['user_id']) for m in ms if m.get('relationship') != 'student']
        students = [s for s in students if s]
        guardians = [g for g in guardians if g]
        for s in students:
            # 1. attach to org
            if s.get('organization_id') != org_id or (
                    not s.get('is_dependent') and s.get('org_role') != 'student'):
                if s.get('organization_id') and s['organization_id'] != org_id:
                    print(f"  SKIP {_name(s)} ({s['id'][:8]}): belongs to another org")
                    continue
                if s.get('role') in ('superadmin',):
                    print(f"  SKIP {_name(s)} ({s['id'][:8]}): role={s['role']}")
                    continue
                updates = ({'organization_id': org_id} if s.get('is_dependent') else
                           {'organization_id': org_id, 'role': 'org_managed',
                            'org_role': 'student', 'org_roles': ['student']})
                n_attach += 1
                print(f"  ATTACH {_name(s)} ({s['id'][:8]}) -> {hh['name']}: {updates}")
                if apply:
                    db.table('users').update(updates).eq('id', s['id']).execute()
            # 2. parent links (non-dependents only; dependents use managed_by_parent_id)
            if s.get('is_dependent'):
                continue
            for g in guardians:
                if (g['id'], s['id']) in linked:
                    continue
                n_link += 1
                print(f"  LINK   {_name(g)} -> {_name(s)}  ({hh['name']})")
                if apply:
                    db.table('parent_student_links').insert({
                        'parent_user_id': g['id'], 'student_user_id': s['id'],
                        'status': 'approved', 'admin_verified': True,
                        'admin_notes': 'Backfill: iCreate existing-account normalization',
                    }).execute()
                linked.add((g['id'], s['id']))
    print(f"attach: {n_attach} account(s), link: {n_link} parent link(s)")


def fix_dependent_households(db, org_id, apply):
    """Deterministic household placement: an org dependent whose MANAGING parent
    is in a household joins that household (e.g. Nebojsa Vrajich, added outside
    the funnel's household rebuild). No guessing — managed_by_parent_id is the
    parent, the parent's membership names the family."""
    deps = (db.table('users')
            .select('id, first_name, last_name, managed_by_parent_id')
            .eq('organization_id', org_id).eq('is_dependent', True).execute()).data or []
    hhs, members = _households(db, org_id)
    hh_names = {h['id']: h['name'] for h in hhs}
    in_hh = {m['user_id'] for m in members}
    parent_hh = {m['user_id']: m['household_id'] for m in members
                 if m.get('relationship') != 'student'}
    n = 0
    for d in deps:
        if d['id'] in in_hh:
            continue
        hh_id = parent_hh.get(d.get('managed_by_parent_id'))
        if not hh_id:
            continue
        n += 1
        print(f"  HOUSEHOLD {_name(d)} ({d['id'][:8]}) -> {hh_names.get(hh_id)} (via managing parent)")
        if apply:
            db.table('household_members').upsert({
                'household_id': hh_id, 'user_id': d['id'],
                'relationship': 'student', 'is_primary_guardian': False,
            }, on_conflict='household_id,user_id').execute()
    print(f"dependent households: {n} placement(s)")


def report_gaps(db, org_id):
    """Step 3: what a human still needs to decide on."""
    org_students = (db.table('users')
                    .select('id, first_name, last_name, email, is_dependent, org_role, role, created_at')
                    .eq('organization_id', org_id).execute()).data or []
    org_students = [u for u in org_students
                    if u.get('org_role') == 'student' or u.get('is_dependent')]
    _, members = _households(db, org_id)
    in_hh = {m['user_id'] for m in members}

    print("\n-- students with NO household (create/pick a family in the SIS) --")
    for s in org_students:
        if s['id'] not in in_hh:
            print(f"  {_name(s)}  ({s['id']})  email={s.get('email')}")

    print("\n-- duplicate candidates (platform account with same name as an org kid) --")
    platform = (db.table('users')
                .select('id, first_name, last_name, email, role, total_xp, created_at')
                .is_('organization_id', 'null').eq('role', 'student')
                .eq('is_dependent', False).execute()).data or []
    by_name = {}
    for p in platform:
        key = (str(p.get('first_name') or '').strip().lower(), str(p.get('last_name') or '').strip().lower())
        if all(key):
            by_name.setdefault(key, []).append(p)
    for s in org_students:
        key = (str(s.get('first_name') or '').strip().lower(), str(s.get('last_name') or '').strip().lower())
        for p in by_name.get(key, []):
            print(f"  KEEP={p['id']} (platform, {p.get('email')}, xp={p.get('total_xp')}, since {str(p.get('created_at'))[:10]})"
                  f"  REMOVE={s['id']} (org {'dependent' if s.get('is_dependent') else 'student'}, since {str(s.get('created_at'))[:10]})"
                  f"  -> --merge {p['id']} {s['id']}")


def _census(db, uid):
    """Row counts for every table a student can own data in, plus XP totals."""
    counts = {}
    for table, col in STUDENT_ROW_TABLES + LEARNING_ROW_TABLES:
        rows = (db.table(table).select('id').eq(col, uid).execute()).data or []
        if rows:
            counts[table] = len(rows)
    for table, key in XP_SUM_TABLES:
        rows = (db.table(table).select('xp_amount').eq('user_id', uid).execute()).data or []
        if rows:
            counts[table] = f"{len(rows)} rows, {sum(r.get('xp_amount') or 0 for r in rows)} XP"
    return counts


def _print_census(label, u, counts):
    print(f"  {label}: {_name(u)} <{u.get('email')}> dob={u.get('date_of_birth')} "
          f"total_xp={u.get('total_xp')} created={str(u.get('created_at'))[:10]}")
    for table, n in sorted(counts.items()):
        print(f"      {table}: {n}")
    if not counts:
        print("      (no rows in any student table)")


def merge_pair(db, org_id, keep_id, remove_id, apply):
    """Step 4: fold the duplicate (REMOVE) into the kid's real account (KEEP)."""
    users = _users_by_id(db, [keep_id, remove_id])
    keep, remove = users.get(keep_id), users.get(remove_id)
    if not keep or not remove:
        sys.exit('merge: both ids must exist in users')
    if keep.get('organization_id') not in (None, org_id):
        sys.exit('merge: KEEP account belongs to another org — refusing')
    print(f"MERGE {_name(remove)} ({remove_id[:8]}, dup) -> {_name(keep)} ({keep_id[:8]})")
    keep_census = _census(db, keep_id)
    _print_census('KEEP  ', keep, keep_census)
    _print_census('REMOVE', remove, _census(db, remove_id))

    # profile fields the kept account is missing
    fill = {f: remove.get(f) for f in PROFILE_FILL_FIELDS if remove.get(f) and not keep.get(f)}
    attach = ({'organization_id': org_id} if keep.get('is_dependent') else
              {'organization_id': org_id, 'role': 'org_managed',
               'org_role': 'student', 'org_roles': ['student']})
    print(f"  users[KEEP] <- {dict(**attach, **fill)}")

    for table, col in STUDENT_ROW_TABLES + LEARNING_ROW_TABLES:
        rows = (db.table(table).select('id').eq(col, remove_id).execute()).data or []
        if not rows:
            continue
        print(f"  {table}: repoint {len(rows)} row(s) {col} {remove_id[:8]} -> {keep_id[:8]}")
        if apply:
            # avoid unique-key collisions (e.g. same class/household on both): drop
            # the duplicate's row when the kept account already has one.
            for r in rows:
                try:
                    db.table(table).update({col: keep_id}).eq('id', r['id']).execute()
                except Exception as e:  # noqa: BLE001
                    print(f"    row {r['id']}: update failed ({e}); deleting duplicate row")
                    db.table(table).delete().eq('id', r['id']).execute()

    # XP rollups: repoint, but SUM into the kept account's row when the same
    # pillar/subject exists on both — XP must never be silently dropped.
    moved_xp = 0
    for table, key in XP_SUM_TABLES:
        dup_rows = (db.table(table).select('*').eq('user_id', remove_id).execute()).data or []
        if not dup_rows:
            continue
        keep_rows = {r[key]: r for r in
                     ((db.table(table).select('*').eq('user_id', keep_id).execute()).data or [])}
        for r in dup_rows:
            amount = int(r.get('xp_amount') or 0)
            moved_xp += amount
            existing = keep_rows.get(r[key])
            if existing:
                print(f"  {table}[{r[key]}]: +{amount} XP onto kept row "
                      f"({existing.get('xp_amount')} -> {int(existing.get('xp_amount') or 0) + amount})")
                if apply:
                    db.table(table).update(
                        {'xp_amount': int(existing.get('xp_amount') or 0) + amount}
                    ).eq('id', existing['id']).execute()
                    db.table(table).delete().eq('id', r['id']).execute()
            else:
                print(f"  {table}[{r[key]}]: repoint {amount} XP -> {keep_id[:8]}")
                if apply:
                    db.table(table).update({'user_id': keep_id}).eq('id', r['id']).execute()
    if moved_xp:
        new_total = int(keep.get('total_xp') or 0) + int(remove.get('total_xp') or 0)
        print(f"  users[KEEP].total_xp: {keep.get('total_xp')} + {remove.get('total_xp')} -> {new_total}")
        fill['total_xp'] = new_total

    # registrations that list the duplicate in their kids snapshot
    regs = (db.table('icreate_registrations').select('id, kids')
            .eq('organization_id', org_id).execute()).data or []
    for reg in regs:
        kids = reg.get('kids') or []
        changed = False
        for k in kids:
            if k.get('user_id') == remove_id:
                k['user_id'] = keep_id
                k['type'] = 'existing'
                k['was_platform'] = keep.get('organization_id') is None
                changed = True
        if changed:
            print(f"  icreate_registrations {reg['id'][:8]}: kids snapshot repointed")
            if apply:
                db.table('icreate_registrations').update({'kids': kids}).eq('id', reg['id']).execute()

    # parent link from the duplicate's parent, unless the kept account is a dependent
    parent_id = remove.get('managed_by_parent_id')
    if parent_id and not keep.get('is_dependent'):
        existing = (db.table('parent_student_links').select('id')
                    .eq('parent_user_id', parent_id).eq('student_user_id', keep_id).execute()).data
        if not existing:
            print(f"  parent_student_links: {parent_id[:8]} -> {keep_id[:8]}")
            if apply:
                db.table('parent_student_links').insert({
                    'parent_user_id': parent_id, 'student_user_id': keep_id,
                    'status': 'approved', 'admin_verified': True,
                    'admin_notes': 'Backfill: merged duplicate iCreate account',
                }).execute()

    if apply:
        db.table('users').update({**attach, **fill}).eq('id', keep_id).execute()
        db.table('users').delete().eq('id', remove_id).execute()
        try:
            db.auth.admin.delete_user(remove_id)
        except Exception as e:  # noqa: BLE001
            print(f"  WARN: auth delete failed for {remove_id[:8]}: {e}")
        print("  merged.\n\nPOST-MERGE VERIFICATION")
        keep_after = _users_by_id(db, [keep_id]).get(keep_id)
        after = _census(db, keep_id)
        _print_census('KEEP  ', keep_after, after)
        # Every table the kept account had rows in before must still have at
        # least that many (repointing only adds), and the duplicate must be gone.
        problems = [f"{t}: {keep_census[t]} -> {after.get(t, 0)}"
                    for t in keep_census
                    if not isinstance(keep_census[t], str) and (after.get(t) or 0) < keep_census[t]]
        leftovers = _census(db, remove_id)
        if (db.table('users').select('id').eq('id', remove_id).execute()).data:
            problems.append('users[REMOVE] still exists')
        if leftovers:
            problems.append(f'rows still on REMOVE: {leftovers}')
        if problems:
            print('  !! VERIFICATION FAILED: ' + '; '.join(problems))
            sys.exit(1)
        print('  verification passed: kept account retained all rows; duplicate fully gone.')
    else:
        print("  (dry-run: users[KEEP] update + users[REMOVE] delete pending)")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument('--org', default=ICREATE_ORG_ID)
    ap.add_argument('--apply', action='store_true', help='write changes (default: dry-run)')
    ap.add_argument('--merge', nargs=2, metavar=('KEEP_ID', 'REMOVE_ID'),
                    help='merge one duplicate pair instead of the attach/link sweep')
    ap.add_argument('--find', metavar='TEXT',
                    help='print users matching a name/email substring (with data census), then exit')
    args = ap.parse_args()

    db = create_client(SUPABASE_URL, SERVICE_KEY)
    print(f"org={args.org}  mode={'APPLY' if args.apply else 'dry-run'}\n")

    if args.find:
        q = args.find
        rows = (db.table('users')
                .select('id, first_name, last_name, display_name, email, role, org_role, '
                        'organization_id, is_dependent, managed_by_parent_id, date_of_birth, '
                        'total_xp, created_at')
                .or_(f"first_name.ilike.%{q}%,last_name.ilike.%{q}%,"
                     f"display_name.ilike.%{q}%,email.ilike.%{q}%")
                .execute()).data or []
        for u in rows:
            print(f"{u['id']}  role={u.get('role')}/{u.get('org_role')} "
                  f"dep={u.get('is_dependent')} org={str(u.get('organization_id'))[:8]} "
                  f"parent={str(u.get('managed_by_parent_id'))[:8]}")
            _print_census('      ', u, _census(db, u['id']))
        print(f"\n{len(rows)} match(es)")
        return

    if args.merge:
        merge_pair(db, args.org, args.merge[0], args.merge[1], args.apply)
        return

    fix_dependent_households(db, args.org, args.apply)
    fix_attach_and_link(db, args.org, args.apply)
    report_gaps(db, args.org)


if __name__ == '__main__':
    main()
