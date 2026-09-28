"""
Move every Hearthwood Academy family into Optio Academy (2026-09).

Hearthwood is being retired and its families become ordinary Optio Academy
families. This is a records conversion as well as a move, because the two
schools count credit differently: Hearthwood kept a course list with letter
grades (oea_credits), Optio Academy counts subject XP (user_subject_xp) plus
transfer credit. A family must never log in after the move to a diploma
tracker that reads zero, so the script carries everything across:

  Parent-entered courses (credit_source transfer / earned_elsewhere, complete)
      -> one transfer_credits row per student, school "Hearthwood Academy",
         one course line per course with its grade as the parent entered it.
         The transcript prints those grades and folds them into the GPA.

  In-progress Hearthwood courses (direct, in progress)
      -> every task completion already done inside the course is backfilled:
         its XP is finalized into the course's subject, exactly as a
         reviewer's approval would, with a review round saying where it came
         from. The course quest stays on the student's dashboard and earns XP
         from here like any other quest.

  Completed Hearthwood courses (direct, complete)
      -> their task completions go to the credit review queue (pending_review)
         for a reviewer to approve. A completed course with no completions to
         review is reported, not invented.

  Accounts
      -> each family moves together: organization_id becomes Optio Academy,
         a household is found or made, the students are enrolled at the school
         and hold an active academy_enrollments row (parent_supported), which
         is what puts the WASC mark on their transcript.

  Content
      -> every quest Hearthwood owns is re-pointed to Optio Academy. Never
         delete them: a quest delete cascades through user_quests into the
         student's task completions.

Nothing is deleted. oea_* rows stay as the historical record, and the
Hearthwood org itself is left for the deletion step once this has run.

Subjects: a Hearthwood requirement without an Optio subject maps as
REQUIREMENT_SUBJECT says (world language -> language arts; health/PE -> health
when the course name says health, otherwise pe).

Dry run by default; --apply writes. Run from backend/ with the venv:

    python scripts/migrate_hearthwood_to_optio_academy.py
    python scripts/migrate_hearthwood_to_optio_academy.py --family parent@example.com
    python scripts/migrate_hearthwood_to_optio_academy.py --apply --actor you@optioeducation.com
    python scripts/migrate_hearthwood_to_optio_academy.py --apply --actor ... --family parent@example.com

--family limits the run to the family of that account and finds it in either
org, so a family interrupted part-way can be re-run: every step is idempotent.
"""

import argparse
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

# admin client justified: a superadmin-run migration script that moves accounts between orgs and writes credit for them; there is no request or caller to scope to
from utils.admin_client import admin_client  # noqa: E402
from utils.db_fetch import fetch_all_rows  # noqa: E402
from utils.timestamps import now_iso  # noqa: E402
from utils.validation.sanitizers import pgrst_uuid_list  # noqa: E402
from services import (  # noqa: E402
    academy_enrollment_service as academy_enrollment,
    sis_attach_service,
    sis_person_service,
    transfer_credit_service as transfer,
)
from routes.tasks.xp_helpers import (  # noqa: E402
    add_pending_subject_xp,
    finalize_subject_xp,
    pending_subjects_for_completion,
    remove_pending_subject_xp,
)

HEARTHWOOD_SLUG = 'hearthwood'
ACADEMY_SLUG = 'optio-academy'
SOURCE = 'hearthwood_migration'
TRANSFER_SCHOOL_NAME = 'Hearthwood Academy'
ACADEMY_PATHWAY = 'parent_supported'

# Hearthwood requirement slots with no Optio subject of their own.
REQUIREMENT_SUBJECT = {'world_language': 'language_arts'}

TODAY = datetime.now(timezone.utc).strftime('%Y-%m-%d')
CARRIED_OVER = f'Carried over from Hearthwood Academy on {TODAY}.'


def subject_for(credit):
    if credit.get('subject_key'):
        return credit['subject_key']
    req = credit.get('requirement_key')
    if req == 'health_pe':
        return 'health' if 'health' in (credit.get('course_name') or '').lower() else 'pe'
    return REQUIREMENT_SUBJECT.get(req, 'electives')


def name_of(u):
    full = f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
    return full or u.get('display_name') or u.get('email') or u.get('username') or u['id'][:8]


def role_of(u):
    return u.get('org_role') if u.get('organization_id') else u.get('role')


# ── Loading ─────────────────────────────────────────────────────────────────

USER_COLS = ('id, email, username, first_name, last_name, display_name, role, org_role, '
             'organization_id, is_dependent, managed_by_parent_id, created_at')


def org_id(db, slug):
    rows = db.table('organizations').select('id, name, accreditation_source, feature_flags') \
        .eq('slug', slug).limit(1).execute().data
    if not rows:
        sys.exit(f'No organization with slug {slug}')
    return rows[0]


def load_members(db, hw_id, academy_id, family_email):
    """Hearthwood members, or with --family the whole family of one account
    wherever its members now are (so an interrupted family can resume)."""
    if not family_email:
        return fetch_all_rows(lambda: db.table('users').select(USER_COLS).eq('organization_id', hw_id))
    seed = db.table('users').select(USER_COLS).eq('email', family_email.strip().lower()).execute().data
    if not seed:
        sys.exit(f'No account with email {family_email}')
    members = {seed[0]['id']: seed[0]}
    frontier = [seed[0]['id']]
    while frontier:
        ids = frontier
        frontier = []
        related = set()
        for link in db.table('parent_student_links').select('parent_user_id, student_user_id') \
                .or_(f"parent_user_id.in.({pgrst_uuid_list(ids)}),student_user_id.in.({pgrst_uuid_list(ids)})") \
                .execute().data or []:
            related.update([link['parent_user_id'], link['student_user_id']])
        for u in db.table('users').select('id, managed_by_parent_id') \
                .or_(f"id.in.({pgrst_uuid_list(ids)}),managed_by_parent_id.in.({pgrst_uuid_list(ids)})").execute().data or []:
            related.add(u['id'])
            if u.get('managed_by_parent_id'):
                related.add(u['managed_by_parent_id'])
        new = [i for i in related if i not in members]
        if new:
            for u in db.table('users').select(USER_COLS).in_('id', new).execute().data or []:
                if u.get('organization_id') in (hw_id, academy_id):
                    members[u['id']] = u
                    frontier.append(u['id'])
    return list(members.values())


def group_families(members, links):
    """Connected components over parent links and managed profiles."""
    by_id = {m['id']: m for m in members}
    parent = {i: i for i in by_id}

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def join(a, b):
        if a in by_id and b in by_id:
            parent[find(a)] = find(b)

    for m in members:
        if m.get('managed_by_parent_id'):
            join(m['id'], m['managed_by_parent_id'])
    for link in links:
        join(link['parent_user_id'], link['student_user_id'])

    groups = defaultdict(list)
    for i in by_id:
        groups[find(i)].append(by_id[i])
    return list(groups.values())


# ── Planning ────────────────────────────────────────────────────────────────

def plan_family(fam, links, credits_by_student, completions_by_student, uqt_by_id):
    parents = [m for m in fam if role_of(m) == 'parent']
    students = [m for m in fam if role_of(m) == 'student']
    others = [m for m in fam if role_of(m) not in ('parent', 'student')]

    kids_of = defaultdict(set)
    for link in links:
        kids_of[link['parent_user_id']].add(link['student_user_id'])
    for s in students:
        if s.get('managed_by_parent_id'):
            kids_of[s['managed_by_parent_id']].add(s['id'])
    primary = None
    if parents:
        primary = sorted(parents, key=lambda p: (-len(kids_of[p['id']]), p.get('created_at') or ''))[0]

    plan = {'parents': parents, 'students': students, 'others': others, 'primary': primary,
            'transfer': {}, 'backfill': [], 'queue': [], 'notes': []}

    for s in students:
        sid = s['id']
        credits = credits_by_student.get(sid, [])
        by_quest = {c['quest_id']: c for c in credits if c.get('quest_id')}

        # Parent-entered courses -> one graded transfer row.
        lines = [c for c in credits if c['status'] == 'complete'
                 and c['credit_source'] in ('transfer', 'earned_elsewhere')]
        if lines:
            subject_xp, course_names = defaultdict(int), defaultdict(list)
            for c in lines:
                subj = subject_for(c)
                subject_xp[subj] += transfer.credits_to_xp(float(c['credits']))
                line = {'name': c['course_name'], 'credits': round(float(c['credits']), 2)}
                if c.get('letter_grade'):
                    line['grade'] = c['letter_grade']
                course_names[subj].append(line)
            plan['transfer'][sid] = (dict(subject_xp), dict(course_names))

        for comp in completions_by_student.get(sid, []):
            credit = by_quest.get(comp['quest_id'])
            uqt = uqt_by_id.get(comp.get('user_quest_task_id')) or {}
            xp = int(uqt.get('xp_value') or 0)
            item = {'student': s, 'completion': comp, 'task': uqt, 'xp': xp,
                    'subject': subject_for(credit) if credit else None,
                    'course': (credit or {}).get('course_name')}
            status = comp.get('diploma_status') or 'none'
            if status not in ('none', 'pending_org_approval'):
                continue  # already reviewed, queued, or finalized -- leave it
            if not credit:
                plan['notes'].append(f"{name_of(s)}: completion {comp['id'][:8]} is not in a Hearthwood course; left as is")
            elif xp <= 0:
                plan['notes'].append(f"{name_of(s)}: completion {comp['id'][:8]} in {credit['course_name']} has no XP value; left as is")
            elif credit['credit_source'] != 'direct':
                plan['notes'].append(
                    f"{name_of(s)}: {xp} XP of work inside {credit['course_name']}, which is already a "
                    f"transfer course; left unclaimed so it is not counted twice")
            elif credit['status'] == 'complete':
                plan['queue'].append(item)
            else:
                plan['backfill'].append(item)

        for c in credits:
            if c['credit_source'] == 'direct' and c['status'] == 'complete' and not any(
                    q['completion']['quest_id'] == c.get('quest_id') for q in plan['queue']):
                plan['notes'].append(
                    f"{name_of(s)}: completed course {c['course_name']} has no task work to review; "
                    f"a reviewer needs to decide it by hand")
    return plan


def print_plan(i, plan):
    who = ', '.join(f"{name_of(m)} ({role_of(m)})" for m in plan['parents'] + plan['students'] + plan['others'])
    print(f"\n[{i}] {who}")
    if plan['primary']:
        print(f"    household: primary contact {name_of(plan['primary'])} <{plan['primary'].get('email')}>")
    else:
        print('    household: NONE -- no parent in this family; students are moved and enrolled only')
    for sid, (_subject_xp, course_names) in plan['transfer'].items():
        s = next(m for m in plan['students'] if m['id'] == sid)
        print(f"    transfer credit for {name_of(s)}:")
        for subj, courses in course_names.items():
            for c in courses:
                print(f"      {subj:<16} {c['name'][:40]:<40} {c['credits']:>5} {c.get('grade', '-')}")
    if plan['backfill']:
        totals = defaultdict(int)
        for b in plan['backfill']:
            totals[(name_of(b['student']), b['subject'])] += b['xp']
        for (who_, subj), xp in sorted(totals.items()):
            print(f"    backfill {who_}: {xp} XP -> {subj}")
    for q in plan['queue']:
        print(f"    review queue: {name_of(q['student'])} / {q['course']} / "
              f"{q['task'].get('title', '?')[:40]} ({q['xp']} XP {q['subject']})")
    for m in plan['others']:
        print(f"    NOTE: {name_of(m)} is {role_of(m)}, not moved -- handle by hand")
    for n in plan['notes']:
        print(f"    NOTE: {n}")


# ── Applying ────────────────────────────────────────────────────────────────

def write_transfer(db, sid, subject_xp, course_names, actor_id):
    if transfer.row_for_school(sid, TRANSFER_SCHOOL_NAME):
        print(f'      transfer row already exists for {sid[:8]}, skipped')
        return
    course_names = transfer.clean_course_names(course_names, subject_xp)
    db.table('transfer_credits').insert({
        'user_id': sid, 'school_name': TRANSFER_SCHOOL_NAME, 'subject_xp': subject_xp,
        'course_names': course_names, 'notes': CARRIED_OVER, 'created_by': actor_id,
    }).execute()
    sync = transfer.sync_xp(sid, subject_xp, {})
    if not sync.get('success'):
        raise RuntimeError(f"transfer XP sync failed for {sid[:8]}: {sync.get('error')}")


def _latest_round(db, completion_id):
    rows = db.table('diploma_review_rounds').select('id, round_number') \
        .eq('completion_id', completion_id).order('round_number', desc=True).limit(1).execute().data
    return rows[0] if rows else None


def backfill(db, item, actor_id):
    """Finalize one completion's XP into its course's subject -- the same
    writes a superadmin approval makes (credit_dashboard/superadmin_actions)."""
    comp, sid = item['completion'], item['student']['id']
    split = {item['subject']: item['xp']}
    now = now_iso()
    if comp.get('diploma_status') == 'pending_org_approval':
        requested = pending_subjects_for_completion(db, comp['id'], item['task'], item['xp'])
        remove_pending_subject_xp(db, sid, requested)
    review = {'reviewer_id': actor_id, 'reviewer_action': 'approved', 'reviewer_feedback': CARRIED_OVER,
              'approved_subjects': split, 'reviewed_at': now}
    latest = _latest_round(db, comp['id'])
    if latest:
        db.table('diploma_review_rounds').update(review).eq('id', latest['id']).execute()
    else:
        db.table('diploma_review_rounds').insert({
            **review, 'completion_id': comp['id'], 'round_number': 1, 'evidence_snapshot': [],
            'subject_suggestion': split, 'submitted_at': now}).execute()
    finalize_subject_xp(db, sid, split)
    db.table('quest_task_completions').update({
        'diploma_status': 'finalized', 'credit_reviewer_id': actor_id, 'finalized_at': now,
    }).eq('id', comp['id']).execute()


def queue(db, item):
    """Put one completion in the credit review queue, as a request would."""
    comp, sid = item['completion'], item['student']['id']
    now = now_iso()
    if comp.get('diploma_status') == 'pending_org_approval':
        # Already requested and already holding pending XP; it only changes reviewer.
        db.table('quest_task_completions').update({'diploma_status': 'pending_review'}) \
            .eq('id', comp['id']).execute()
        return
    split = {item['subject']: item['xp']}
    db.table('diploma_review_rounds').insert({
        'completion_id': comp['id'], 'round_number': 1, 'evidence_snapshot': [],
        'subject_suggestion': split, 'submitted_at': now}).execute()
    add_pending_subject_xp(db, sid, split)
    db.table('quest_task_completions').update({
        'diploma_status': 'pending_review', 'credit_requested_at': now, 'revision_number': 1,
    }).eq('id', comp['id']).execute()


def apply_family(db, plan, academy_id, hw_id, actor_id):
    # Credit first: it does not depend on the org, and a family whose move
    # fails part-way still has its record.
    for sid, (subject_xp, course_names) in plan['transfer'].items():
        write_transfer(db, sid, subject_xp, course_names, actor_id)
    for item in plan['backfill']:
        backfill(db, item, actor_id)
    for item in plan['queue']:
        queue(db, item)

    movers = [m for m in plan['parents'] + plan['students'] if m.get('organization_id') == hw_id]
    if movers:
        db.table('users').update({'organization_id': academy_id}) \
            .in_('id', [m['id'] for m in movers]).execute()

    student_ids = [s['id'] for s in plan['students']]
    if plan['primary']:
        last = plan['primary'].get('last_name') or name_of(plan['primary']).split()[-1]
        res = sis_attach_service.attach_family(
            academy_id, plan['primary']['id'], student_ids,
            household_fields={'name': f'{last} Family'}, source=SOURCE, client=db)
        if res['refused']:
            raise RuntimeError(f"household refused students: {res['refused']}")
        for p in plan['parents']:
            if p['id'] != plan['primary']['id']:
                sis_attach_service.attach_guardian(academy_id, p['id'], res['household_id'],
                                                   source=SOURCE, client=db)
    if student_ids:
        sis_person_service.enroll_students(academy_id, student_ids)
    for sid in student_ids:
        if not academy_enrollment.enroll(sid, ACADEMY_PATHWAY, created_by=actor_id, client=db):
            raise RuntimeError(f'academy enrollment failed for {sid[:8]}')


def main():
    ap = argparse.ArgumentParser(description='Move Hearthwood Academy families into Optio Academy.')
    ap.add_argument('--apply', action='store_true', help='write changes (default: dry run)')
    ap.add_argument('--actor', help='superadmin email recorded as reviewer and creator (required with --apply)')
    ap.add_argument('--family', help='only the family of this account (either org)')
    args = ap.parse_args()

    db = admin_client()
    hw = org_id(db, HEARTHWOOD_SLUG)
    academy = org_id(db, ACADEMY_SLUG)

    actor_id = None
    if args.apply:
        if not args.actor:
            sys.exit('--apply needs --actor <superadmin email>')
        rows = db.table('users').select('id, role').eq('email', args.actor.strip().lower()).execute().data
        if not rows or rows[0]['role'] != 'superadmin':
            sys.exit(f'{args.actor} is not a superadmin')
        actor_id = rows[0]['id']

    if academy.get('accreditation_source') != 'optio':
        print('WARNING: Optio Academy accreditation_source is '
              f"'{academy.get('accreditation_source')}'. Students still get the WASC mark through "
              'their academy_enrollments row, but flip the org config first (audit section 6).')

    members = load_members(db, hw['id'], academy['id'], args.family)
    ids = [m['id'] for m in members]
    if not ids:
        print('Nobody to move.')
        return
    student_ids = [m['id'] for m in members if role_of(m) == 'student']

    links = fetch_all_rows(lambda: db.table('parent_student_links')
                           .select('parent_user_id, student_user_id, status')
                           .in_('student_user_id', ids)) if ids else []
    links = [link for link in links if link.get('status') in (None, 'approved')]
    outside = [link for link in fetch_all_rows(lambda: db.table('parent_student_links')
               .select('parent_user_id, student_user_id').in_('parent_user_id', ids))
               if link['student_user_id'] not in set(ids)]

    credits = fetch_all_rows(lambda: db.table('oea_credits').select('*').in_('student_id', student_ids)) \
        if student_ids else []
    credits_by_student = defaultdict(list)
    for c in credits:
        credits_by_student[c['student_id']].append(c)

    comps = fetch_all_rows(lambda: db.table('quest_task_completions')
                           .select('id, user_id, quest_id, task_id, user_quest_task_id, diploma_status')
                           .in_('user_id', student_ids)) if student_ids else []
    completions_by_student = defaultdict(list)
    for c in comps:
        completions_by_student[c['user_id']].append(c)
    uqt_ids = [c['user_quest_task_id'] for c in comps if c.get('user_quest_task_id')]
    uqt_by_id = {}
    for i in range(0, len(uqt_ids), 200):
        for t in db.table('user_quest_tasks').select(
                'id, title, xp_value, subject_xp_distribution, diploma_subjects') \
                .in_('id', uqt_ids[i:i + 200]).execute().data or []:
            uqt_by_id[t['id']] = t

    families = group_families(members, links)
    plans = [plan_family(f, links, credits_by_student, completions_by_student, uqt_by_id) for f in families]
    plans.sort(key=lambda p: name_of(p['primary'] or (p['students'] + p['others'])[0]))

    print(f"{'APPLY' if args.apply else 'DRY RUN'}: {len(members)} accounts in {len(plans)} families "
          f"({sum(len(p['parents']) for p in plans)} parents, {sum(len(p['students']) for p in plans)} students)")
    for i, plan in enumerate(plans, 1):
        print_plan(i, plan)

    quests = db.table('quests').select('id', count='exact').eq('organization_id', hw['id']).limit(1).execute()
    print('\nSummary')
    print(f"  transfer rows:      {len(set().union(*[p['transfer'].keys() for p in plans]))} students, "
          f"{sum(len(v) for p in plans for _, cn in p['transfer'].values() for v in cn.values())} courses")
    print(f"  backfilled:         {sum(len(p['backfill']) for p in plans)} completions, "
          f"{sum(b['xp'] for p in plans for b in p['backfill'])} XP")
    print(f"  to review queue:    {sum(len(p['queue']) for p in plans)} completions")
    print(f"  quests re-pointed:  {quests.count} Hearthwood-owned quests -> Optio Academy")
    for link in outside:
        print(f"  NOTE: parent {link['parent_user_id'][:8]} is linked to {link['student_user_id'][:8]}, "
              f"who is not in Hearthwood; that student is not moved")

    if not args.apply:
        print('\nDry run. Nothing was written. Re-run with --apply --actor <email> to write.')
        return

    failed = []
    for i, plan in enumerate(plans, 1):
        try:
            apply_family(db, plan, academy['id'], hw['id'], actor_id)
            print(f'  [{i}] done')
        except Exception as e:  # noqa: BLE001
            who = plan['primary'] or (plan['students'] + plan['others'])[0]
            failed.append((who, e))
            print(f"  [{i}] FAILED ({name_of(who)} <{who.get('email')}>): {e}")

    if not args.family:
        db.table('quests').update({'organization_id': academy['id']}).eq('organization_id', hw['id']).execute()
        print(f'  re-pointed Hearthwood quests to {ACADEMY_SLUG}')
    else:
        fam_ids = [m['id'] for m in members]
        db.table('quests').update({'organization_id': academy['id']}) \
            .eq('organization_id', hw['id']).in_('created_by', fam_ids).execute()
        print("  re-pointed this family's Hearthwood quests")

    if failed:
        print('\nFailed families -- fix and re-run each with --family <email>:')
        for who, err in failed:
            print(f"  {who.get('email') or who['id']}: {err}")
        sys.exit(1)
    print('\nDone.')


if __name__ == '__main__':
    main()
