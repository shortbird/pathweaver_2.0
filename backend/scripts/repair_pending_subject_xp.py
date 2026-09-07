"""Rebuild user_subject_xp.pending_xp from the credit requests behind it.

WHY THIS EXISTS
---------------
Approving a diploma credit decremented ``pending_xp`` twice: the route called
``remove_pending_subject_xp`` with the requested split, and then
``finalize_subject_xp`` subtracted the approved split again on its way to
``xp_amount``. The second withdrawal landed on whatever pending balance the
subject happened to be carrying, so approving one task quietly deleted pending
credit belonging to entirely different, still-unreviewed work.

That defect is fixed (finalize_subject_xp no longer touches pending). This
repairs the balances it already corrupted -- 4,335 XP across 13 learners as of
2026-09-07.

It also realigns the ``subject_suggestion`` snapshot on rounds that are still
awaiting review. Those snapshots were written by a second, independent Gemini
classification that has since been removed; leaving them in place would show a
reviewer -- and the student's pending bar -- subjects the student never chose.
Rounds on completions that have already been decided are history and are left
alone.

SAFETY
------
Dry run by default. ``--apply`` is required to write, and the diff is printed
either way. Unlike its retired predecessor (repair_subject_xp.py, see bb2aaff3)
this is idempotent: it computes an absolute target from the completions rather
than adjusting balances by a delta, so a second run over the same data is a
no-op. It never touches ``xp_amount``.

    python backend/scripts/repair_pending_subject_xp.py                # dry run
    python backend/scripts/repair_pending_subject_xp.py --apply
    python backend/scripts/repair_pending_subject_xp.py --user <uuid>
"""

import argparse
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

# Built directly rather than through database.get_supabase_admin_client(): that
# module imports utils/, which imports the auth decorators, which import
# database again -- a cycle Flask resolves at app startup and a bare script
# does not. Same approach as the other scripts in this directory.
from supabase import create_client                      # noqa: E402
from app_config import Config                           # noqa: E402
from utils.db_fetch import fetch_all_rows               # noqa: E402
from utils.subject_xp import get_subject_xp_distribution  # noqa: E402
from utils.timestamps import now_iso                    # noqa: E402

# The states in which a credit request is still outstanding, and therefore
# still owed a pending balance. 'approved' is a FINALIZED state, not a pending
# one -- mistaking it for pending is how the previous repair nearly zeroed 29
# live completions. 'ready_for_credit' has no rows.
PENDING_STATES = ('pending_review', 'pending_org_approval')


def _completions(client, user_id=None):
    def build():
        q = client.table('quest_task_completions') \
            .select('id, user_id, task_id, diploma_status') \
            .in_('diploma_status', list(PENDING_STATES))
        if user_id:
            q = q.eq('user_id', user_id)
        return q
    return fetch_all_rows(build)


def _tasks_by_id(client, task_ids):
    tasks = {}
    for i in range(0, len(task_ids), 200):
        chunk = task_ids[i:i + 200]
        rows = client.table('user_quest_tasks') \
            .select('id, xp_value, diploma_subjects, subject_xp_distribution') \
            .in_('id', chunk).execute().data or []
        for row in rows:
            tasks[row['id']] = row
    return tasks


def _latest_rounds(client, completion_ids):
    """completion_id -> (round id, subject_suggestion) for the highest round."""
    latest = {}
    for i in range(0, len(completion_ids), 200):
        chunk = completion_ids[i:i + 200]
        rows = client.table('diploma_review_rounds') \
            .select('id, completion_id, round_number, subject_suggestion') \
            .in_('completion_id', chunk).execute().data or []
        for row in rows:
            cid = row['completion_id']
            best = latest.get(cid)
            if not best or (row.get('round_number') or 0) > (best.get('round_number') or 0):
                latest[cid] = row
    return latest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true',
                        help='write the changes (default: dry run)')
    parser.add_argument('--user', help='limit to one user id')
    args = parser.parse_args()

    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
        print('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
        return 1

    client = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)
    now = now_iso()

    completions = _completions(client, args.user)
    if not completions:
        print('No outstanding credit requests. Nothing to do.')
        return 0

    task_ids = sorted({c['task_id'] for c in completions if c.get('task_id')})
    tasks = _tasks_by_id(client, task_ids)
    rounds = _latest_rounds(client, sorted({c['id'] for c in completions}))

    target = defaultdict(int)          # (user_id, subject) -> xp
    users = set()
    round_fixes = []                   # (round_id, before, after)

    for completion in completions:
        task = tasks.get(completion.get('task_id'))
        if not task:
            continue
        users.add(completion['user_id'])
        split = get_subject_xp_distribution(task, task.get('xp_value') or 0)
        for subject, xp in split.items():
            target[(completion['user_id'], subject)] += xp

        rnd = rounds.get(completion['id'])
        if rnd and rnd.get('subject_suggestion') != split:
            round_fixes.append((rnd['id'], rnd.get('subject_suggestion'), split))

    # Current balances for every user we touched.
    current = {}
    user_list = sorted(users)
    for i in range(0, len(user_list), 100):
        chunk = user_list[i:i + 100]
        rows = client.table('user_subject_xp') \
            .select('id, user_id, school_subject, pending_xp') \
            .in_('user_id', chunk).execute().data or []
        for row in rows:
            current[(row['user_id'], row['school_subject'])] = row

    keys = set(target) | {k for k in current if k[0] in users}
    changes = []
    for key in sorted(keys):
        want = target.get(key, 0)
        row = current.get(key)
        have = (row or {}).get('pending_xp') or 0
        if want != have:
            changes.append((key, have, want, row))

    print(f'Outstanding credit requests: {len(completions)} across {len(users)} learners')
    print(f'Stale review-round snapshots: {len(round_fixes)}')
    print(f'pending_xp rows to correct:   {len(changes)}')
    if changes:
        drift = sum(abs(want - have) for _, have, want, _ in changes)
        print(f'Total pending XP drift:       {drift}')
        print()
        for (user_id, subject), have, want, _ in changes:
            print(f'  {user_id[:8]}  {subject:<20} {have:>6} -> {want:<6} ({want - have:+})')

    if not args.apply:
        print('\nDry run. Re-run with --apply to write.')
        return 0

    for round_id, _before, after in round_fixes:
        client.table('diploma_review_rounds') \
            .update({'subject_suggestion': after}).eq('id', round_id).execute()

    for (user_id, subject), _have, want, row in changes:
        if row:
            client.table('user_subject_xp') \
                .update({'pending_xp': want, 'updated_at': now}) \
                .eq('id', row['id']).execute()
        elif want > 0:
            client.table('user_subject_xp').insert({
                'user_id': user_id,
                'school_subject': subject,
                'xp_amount': 0,
                'pending_xp': want,
                'updated_at': now,
            }).execute()

    print(f'\nApplied: {len(round_fixes)} round snapshots, {len(changes)} pending_xp rows.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
