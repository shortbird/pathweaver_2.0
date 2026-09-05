"""Realign subject_xp_distribution with the credit the learner was shown.

Two defects (fixed 2026-09-05) let a task credit a subject split the learner
never accepted:

  1. persist_accepted_task ran a second, independent Gemini classification over
     a task that already carried diploma_subjects, and that shadow answer won at
     credit time because get_subject_xp_distribution reads
     subject_xp_distribution first.
  2. The diploma_subjects fallback read XP amounts as percentages, so a 200 XP
     task tagged {'Social Studies': 150, 'Financial Literacy': 50} credited
     100/100.

diploma_subjects is authoritative: the personalization wizard renders it on the
card the learner accepts ("Diploma Credits: Social Studies (200 XP)").

This script rewrites subject_xp_distribution from diploma_subjects on affected
tasks, then REBUILDS user_subject_xp from scratch for the touched learners:

    xp_amount  = baseline + sum(correct split of every finalized completion)
    pending_xp = sum(correct split of every completion awaiting review)

The baseline is whatever the transcript held before Optio task credit
(transfer credits and the like); it is derived as the current xp_amount minus
the CURRENT (wrong) finalized contribution, so it survives the rewrite intact.

Usage:
    python backend/scripts/repair_subject_xp_drift.py --dry-run
    python backend/scripts/repair_subject_xp_drift.py --user <uuid> --apply
    python backend/scripts/repair_subject_xp_drift.py --apply        # everyone
"""

import argparse
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# utils/ first: importing database directly pulls utils/__init__, which imports
# back into database before it finishes defining get_supabase_client.
from utils.db_fetch import fetch_all_rows  # noqa: E402
from utils.timestamps import now_iso  # noqa: E402
from database import get_supabase_admin_client  # noqa: E402
from routes.tasks.xp_helpers import (  # noqa: E402
    SUBJECT_NORMALIZATION,
    get_subject_xp_distribution,
)

# Completions whose XP already sits on the transcript vs still in pending.
FINALIZED = {'finalized'}
PENDING = {'pending_review', 'ready_for_credit', 'approved'}


def _normalize(dist):
    """Collapse display names onto canonical machine keys."""
    out = defaultdict(int)
    for subject, xp in (dist or {}).items():
        key = SUBJECT_NORMALIZATION.get(subject, subject.lower().replace(' ', '_'))
        out[key] += xp
    return dict(out)


def _correct_split(task):
    """The split the learner accepted, in canonical keys summing to xp_value."""
    return get_subject_xp_distribution(
        {'diploma_subjects': task.get('diploma_subjects')},
        task.get('xp_value') or 0,
    )


def load_tasks(client, user_id=None):
    def query():
        q = client.table('quest_task_completions').select(
            'id, user_id, diploma_status, user_quest_task_id,'
            'user_quest_tasks!user_quest_task_id('
            'id, title, xp_value, diploma_subjects, subject_xp_distribution)'
        )
        return q.eq('user_id', user_id) if user_id else q

    rows = fetch_all_rows(query)
    out = []
    for row in rows:
        task = row.get('user_quest_tasks') or {}
        if not task.get('diploma_subjects') or not task.get('xp_value'):
            continue
        out.append({
            'completion_id': row['id'],
            'user_id': row['user_id'],
            'status': row.get('diploma_status'),
            'task': task,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--user', help='Repair a single learner (UUID)')
    ap.add_argument('--apply', action='store_true', help='Write changes')
    ap.add_argument('--dry-run', action='store_true', default=False)
    args = ap.parse_args()
    apply = args.apply and not args.dry_run

    client = get_supabase_admin_client()
    records = load_tasks(client, args.user)
    print(f"{'APPLY' if apply else 'DRY RUN'}: inspected {len(records)} completions\n")

    # Per learner: current vs corrected contribution, and the tasks to rewrite.
    current = defaultdict(lambda: defaultdict(int))
    corrected = defaultdict(lambda: defaultdict(int))
    cur_pending = defaultdict(lambda: defaultdict(int))
    cor_pending = defaultdict(lambda: defaultdict(int))
    task_fixes = []
    touched = set()

    for rec in records:
        task, uid, status = rec['task'], rec['user_id'], rec['status']
        stored = _normalize(task.get('subject_xp_distribution'))
        # Mirror the read path: an empty stored split already falls back to
        # diploma_subjects, so it is not drift.
        effective = stored or _correct_split(task)
        want = _correct_split(task)

        if status in FINALIZED:
            for s, xp in effective.items():
                current[uid][s] += xp
            for s, xp in want.items():
                corrected[uid][s] += xp
        elif status in PENDING:
            for s, xp in effective.items():
                cur_pending[uid][s] += xp
            for s, xp in want.items():
                cor_pending[uid][s] += xp

        if stored and stored != want:
            task_fixes.append((task['id'], task.get('title'), stored, want))
            touched.add(uid)

    if not task_fixes:
        print("No drift found.")
        return

    print(f"Tasks to realign: {len(task_fixes)} across {len(touched)} learners\n")

    for uid in sorted(touched):
        subs = set(current[uid]) | set(corrected[uid]) | set(cur_pending[uid]) | set(cor_pending[uid])
        lines = []
        for s in sorted(subs):
            d_fin = corrected[uid][s] - current[uid][s]
            d_pen = cor_pending[uid][s] - cur_pending[uid][s]
            if d_fin or d_pen:
                lines.append(f"    {s:<20} transcript {d_fin:+5d}   pending {d_pen:+5d}")
        if lines:
            print(f"  learner {uid}")
            print('\n'.join(lines))

    if not apply:
        print("\nNothing written. Re-run with --apply to commit.")
        return

    now = now_iso()

    for task_id, title, stored, want in task_fixes:
        client.table('user_quest_tasks').update({
            'subject_xp_distribution': want, 'updated_at': now,
        }).eq('id', task_id).execute()
        print(f"  task {task_id[:8]} {str(title)[:48]:<48} {stored} -> {want}")

    for uid in sorted(touched):
        existing = client.table('user_subject_xp').select(
            'id, school_subject, xp_amount, pending_xp'
        ).eq('user_id', uid).execute().data or []
        by_subject = {r['school_subject']: r for r in existing}

        subs = (set(by_subject) | set(corrected[uid]) | set(cor_pending[uid])
                | set(current[uid]) | set(cur_pending[uid]))
        for s in sorted(subs):
            row = by_subject.get(s)
            held = (row or {}).get('xp_amount') or 0
            # Preserve credit that did not come from these completions.
            baseline = held - current[uid][s]
            new_amount = max(0, baseline + corrected[uid][s])
            new_pending = max(0, cor_pending[uid][s])
            if row:
                if row.get('xp_amount') == new_amount and (row.get('pending_xp') or 0) == new_pending:
                    continue
                client.table('user_subject_xp').update({
                    'xp_amount': new_amount, 'pending_xp': new_pending, 'updated_at': now,
                }).eq('id', row['id']).execute()
            elif new_amount or new_pending:
                client.table('user_subject_xp').insert({
                    'user_id': uid, 'school_subject': s,
                    'xp_amount': new_amount, 'pending_xp': new_pending, 'updated_at': now,
                }).execute()
            print(f"  {uid[:8]} {s:<20} xp={new_amount:<6} pending={new_pending}")

    print("\nDone.")


if __name__ == '__main__':
    main()
