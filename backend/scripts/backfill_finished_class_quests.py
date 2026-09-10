"""Close the class quests that were finished but never ended.

Gryffin student check-ins, 2026-09-10 (Dallin Bird): "Tarien still has a quest
in class quests that is already done for reading." Both tasks of "Dickenson at
first sight" were turned in and the enrollment was still open, so it sat on his
home page under Current Quests and stayed amber on the class list.

From 2026-09-10 a class quest ends itself the moment its last task is turned in
(services/class_quest_completion.py). That fix only fires on a task completion,
so it cannot reach an enrollment whose last task was completed before the
deploy — Tarien has nothing left to submit on that quest. This script is the
other half: it closes the ones already in that state.

What it targets, and nothing else:
  * the student is ACTIVELY enrolled in an ACTIVE class,
  * that class has the quest assigned (class_quests),
  * the enrollment is open (completed_at IS NULL, archived_at IS NULL),
  * and every task on it has a completion (at least one task).

A quest the student picked for themselves is never touched. Finishing the last
task is not the end of a self-directed quest — they keep adding to it, and
closing one behind their back would take that away with no explanation.

NO events are fired. The student's own "End quest" button emits a
quest.completed webhook and enqueues a Canvas grade sync; both are wrong here.
These completions happened days or weeks ago, and replaying them now would post
duplicate grades and tell families their child "just finished" old work. The
rows are corrected quietly; the next real completion behaves normally.

Reversible: POST /api/quests/<id>/reopen puts any of these back.

Dry run by default; --apply writes.

Usage:
    cd backend && python scripts/backfill_finished_class_quests.py
    cd backend && python scripts/backfill_finished_class_quests.py --apply
    cd backend && python scripts/backfill_finished_class_quests.py --org <uuid>
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

# The client is built here rather than imported from `database`, which cannot be
# the first import in a script: it imports utils, which imports it back. Every
# other backfill in this directory does the same.
from supabase import create_client  # noqa: E402

from utils.db_fetch import fetch_all_rows  # noqa: E402
from utils.quest_completion import is_quest_done  # noqa: E402
from utils.timestamps import now_iso  # noqa: E402

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SERVICE_KEY']


def get_supabase_admin_client():
    return create_client(SUPABASE_URL, SERVICE_KEY)


def _chunks(seq, size=100):
    seq = list(seq)
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def find_candidates(admin, org_id=None):
    """Open class-assigned enrollments whose every task is turned in.

    Paged, not read straight: this crosses orgs and class rosters, so it is
    exactly the shape that hits PostgREST's 1000-row cap without saying so.
    A truncated read here would silently skip students.
    """
    classes = fetch_all_rows(lambda: (
        admin.table('org_classes').select('id, name, organization_id')
        .eq('status', 'active')
    ))
    if org_id:
        classes = [c for c in classes if c.get('organization_id') == org_id]
    class_ids = [c['id'] for c in classes]
    if not class_ids:
        return []
    class_names = {c['id']: c.get('name') for c in classes}

    assignments, enrollments = [], []
    for chunk in _chunks(class_ids):
        assignments.extend(fetch_all_rows(lambda ch=chunk: (
            admin.table('class_quests').select('class_id, quest_id').in_('class_id', ch)
        )))
        enrollments.extend(fetch_all_rows(lambda ch=chunk: (
            admin.table('class_enrollments').select('class_id, student_id')
            .in_('class_id', ch).eq('status', 'active')
        )))

    # (student, quest) -> the class that assigned it, for the report.
    quests_by_class = {}
    for a in assignments:
        quests_by_class.setdefault(a['class_id'], set()).add(a['quest_id'])

    assigned = {}
    for e in enrollments:
        for quest_id in quests_by_class.get(e['class_id'], ()):
            assigned.setdefault((e['student_id'], quest_id), class_names.get(e['class_id']))
    if not assigned:
        return []

    student_ids = sorted({s for s, _ in assigned})
    open_rows = []
    for chunk in _chunks(student_ids):
        open_rows.extend(fetch_all_rows(lambda ch=chunk: (
            admin.table('user_quests').select('id, user_id, quest_id, completed_at, archived_at')
            .in_('user_id', ch).is_('completed_at', 'null').is_('archived_at', 'null')
        )))
    open_rows = [r for r in open_rows if (r['user_id'], r['quest_id']) in assigned]
    if not open_rows:
        return []

    uq_ids = [r['id'] for r in open_rows]
    tasks = []
    for chunk in _chunks(uq_ids):
        tasks.extend(fetch_all_rows(lambda ch=chunk: (
            admin.table('user_quest_tasks').select('id, user_quest_id').in_('user_quest_id', ch)
        )))
    done_ids = set()
    for chunk in _chunks([t['id'] for t in tasks], 200):
        rows = (admin.table('quest_task_completions').select('task_id')
                .in_('task_id', chunk).execute()).data or []
        done_ids.update(r['task_id'] for r in rows)

    counts = {}
    for t in tasks:
        bucket = counts.setdefault(t['user_quest_id'], [0, 0])
        bucket[1] += 1
        if t['id'] in done_ids:
            bucket[0] += 1

    candidates = []
    for row in open_rows:
        done, total = counts.get(row['id'], (0, 0))
        # The shared rule, so this agrees with the teacher's progress grid.
        if total > 0 and is_quest_done(row, done, total):
            candidates.append({
                **row,
                'done': done,
                'total': total,
                'class_name': assigned.get((row['user_id'], row['quest_id'])),
            })
    return candidates


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='write the changes')
    parser.add_argument('--org', help='limit to one organization id')
    args = parser.parse_args()

    admin = get_supabase_admin_client()
    candidates = find_candidates(admin, org_id=args.org)

    if not candidates:
        print('Nothing to close. Every finished class quest is already ended.')
        return

    names = {}
    for chunk in _chunks(sorted({c['user_id'] for c in candidates})):
        for u in (admin.table('users').select('id, first_name, last_name')
                  .in_('id', chunk).execute()).data or []:
            names[u['id']] = f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
    titles = {}
    for chunk in _chunks(sorted({c['quest_id'] for c in candidates})):
        for q in (admin.table('quests').select('id, title').in_('id', chunk).execute()).data or []:
            titles[q['id']] = q.get('title')

    print(f"{len(candidates)} finished class quest(s) still open, "
          f"across {len({c['user_id'] for c in candidates})} student(s):\n")
    for c in sorted(candidates, key=lambda r: (names.get(r['user_id'], ''), r['class_name'] or '')):
        print(f"  {names.get(c['user_id'], c['user_id'][:8]):<20} "
              f"{(c['class_name'] or '-'):<28} "
              f"{(titles.get(c['quest_id']) or c['quest_id'][:8])[:48]:<50} "
              f"{c['done']}/{c['total']} tasks")

    if not args.apply:
        print('\nDry run. Re-run with --apply to close these.')
        return

    stamp = now_iso()
    closed = 0
    for c in candidates:
        # Gated on completed_at IS NULL so a student ending one of these while
        # the script runs wins, rather than having their timestamp overwritten.
        updated = (admin.table('user_quests')
                   .update({'completed_at': stamp, 'is_active': False,
                            'last_set_down_at': stamp})
                   .eq('id', c['id']).is_('completed_at', 'null').execute()).data or []
        if updated:
            closed += 1

    print(f"\nClosed {closed} of {len(candidates)}. "
          f"Any difference is an enrollment somebody ended while this ran.")


if __name__ == '__main__':
    main()
