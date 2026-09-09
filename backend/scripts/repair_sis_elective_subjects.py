"""Re-credit SIS tasks that were filed under Electives because nobody could say otherwise.

WHY THIS EXISTS
---------------
The SIS task editors (a class's Quests tab, the curriculum library) wrote
``pillar`` and ``xp_value`` and nothing else. Both task tables DEFAULT
``diploma_subjects`` to ``['Electives']``, so every task a school typed in was
credited as an elective whatever the work actually was, and no screen showed a
subject to disagree with.

Gryffin found it on 2026-09-09 by asking a different question -- "if they are
writing and talking about multiple subjects how do we give them credit for
multiple subjects?" -- and the answer turned out to be that they were not
getting credit for even one. Their Land of Hope US History unit, their Prima
Latina unit and their Earth Science unit were all sitting in Electives, along
with 1041 XP of one student's pending credit.

The editors now write the column (see services/sis_quest_authoring.clean_subjects).
This repairs what they wrote before that.

WHAT IT CHANGES
---------------
1. ``quest_template_tasks``   -- the school's own preset tasks
2. ``user_quest_tasks``       -- the copies students actually hold, which is
                                 what credit is computed from
3. ``user_subject_xp.xp_amount`` -- finalized credit already on a transcript,
                                 moved out of Electives into the right subject

Pending credit is NOT touched here. ``repair_pending_subject_xp.py`` already
recomputes ``pending_xp`` as an absolute target from ``user_quest_tasks``, so
running it after this one picks the corrected subjects up for free. Run them in
that order.

WHAT IT DELIBERATELY LEAVES ALONE
---------------------------------
- Tasks on quests with no ``organization_id``. Those are the shared Optio
  library, authored through the admin quest form, which has always had a
  subject picker -- an Electives there is a choice, not a default.
- Manual student tasks. Somebody typed those with a subject picker in front of
  them, so an Electives there is a choice rather than a default.
- Any task whose pillar has no better answer than Electives.
- ``xp_amount`` beyond the Electives balance actually present, and never below
  zero. A reviewer can override the split at approval time, so the ledger does
  not always agree with the task; the repair takes what is there and stops.

SAFETY
------
Dry run by default; ``--apply`` is required to write. Idempotent: it selects
only rows still sitting on the default, so a second run over the same data is a
no-op. It never invents XP -- the totals it moves are the ones already recorded.

    python backend/scripts/repair_sis_elective_subjects.py                  # dry run, all orgs
    python backend/scripts/repair_sis_elective_subjects.py --org gryffin
    python backend/scripts/repair_sis_elective_subjects.py --org gryffin --apply
    python backend/scripts/repair_sis_elective_subjects.py --skip-ledger    # tasks only
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
from supabase import create_client                          # noqa: E402
from app_config import Config                               # noqa: E402
from utils.db_fetch import fetch_all_rows                   # noqa: E402
from utils.school_subjects import default_subjects_for_pillar  # noqa: E402
from utils.subject_xp import get_subject_xp_distribution     # noqa: E402
from utils.timestamps import now_iso                        # noqa: E402

# Credit that has been awarded and is sitting on a transcript. Anything still
# awaiting review is pending, and belongs to repair_pending_subject_xp.py.
FINALIZED_STATES = ('finalized',)

CHUNK = 200


def _on_the_default(task):
    """True when this task's subjects are the column default, not a choice.

    NULL and [] count: an explicit NULL skips the default and reads back as no
    credit at all, which is the same bug wearing a different hat.
    """
    subjects = task.get('diploma_subjects')
    if not subjects:
        return True
    if isinstance(subjects, str):          # jsonb sometimes arrives as text
        subjects = [subjects]
    keys = {str(s).strip().lower().replace(' ', '_') for s in subjects if s}
    return keys == {'electives'}


# Pillars that legitimately cover two subjects, so the default is a guess rather
# than a derivation. Worth a human glance: Gryffin's two geometry units sit
# under 'stem' next to two dozen genuinely-science ones, and the default sends
# all of them to Science.
AMBIGUOUS_PILLARS = {'stem', 'wellness'}


AMBIGUOUS_SHOWN = 15


def _ambiguous_quests(client, ambiguous):
    """[(quest title, xp, subject)] for the guesses, largest first."""
    ids = sorted(ambiguous)
    titles = {}
    for i in range(0, len(ids), CHUNK):
        rows = (client.table('quests').select('id, title')
                .in_('id', ids[i:i + CHUNK]).execute()).data or []
        titles.update({r['id']: r.get('title') or r['id'] for r in rows})
    out = [(titles.get(quest_id, quest_id), xp, subject)
           for quest_id, (xp, subject) in ambiguous.items()]
    return sorted(out, key=lambda row: -row[1])


def _org_ids(client, slug):
    rows = client.table('organizations').select('id, name, slug')
    if slug:
        rows = rows.eq('slug', slug)
    data = rows.execute().data or []
    if slug and not data:
        raise SystemExit(f'No organization with slug {slug!r}.')
    return {r['id']: r for r in data}


def _org_quest_ids(client, org_ids):
    """Quests a school owns. The shared library is excluded on purpose."""
    ids = set()
    for i in range(0, len(org_ids), CHUNK):
        for row in fetch_all_rows(lambda chunk=org_ids[i:i + CHUNK]: (
            client.table('quests').select('id').in_('organization_id', chunk)
        )):
            ids.add(row['id'])
    return ids


def _plan_for(task):
    """(subjects, split) this task should carry, or None to leave it alone."""
    subjects = default_subjects_for_pillar(task.get('pillar'))
    if subjects == ['electives']:
        return None                       # no better answer than it already has
    split = get_subject_xp_distribution(
        {'diploma_subjects': subjects}, task.get('xp_value') or 0)
    return subjects, split


def _template_tasks(client, quest_ids):
    quest_ids = sorted(quest_ids)
    out = []
    for i in range(0, len(quest_ids), CHUNK):
        for row in fetch_all_rows(lambda chunk=quest_ids[i:i + CHUNK]: (
            client.table('quest_template_tasks')
            .select('id, quest_id, pillar, xp_value, diploma_subjects')
            .in_('quest_id', chunk)
        )):
            if _on_the_default(row):
                out.append(row)
    return out


def _user_tasks(client, quest_ids):
    """Student copies of a school's preset tasks.

    Two ways a task on a school's quest reaches Electives without anyone
    choosing it, and both are in scope:

      - copied from a preset task the SIS editors saved with no subject
      - written by the personalization wizard, whose normalize_diploma_subjects
        returned {'Electives': xp} whenever the model named no subject

    Manual tasks are excluded: a learner or advisor typing one in has had a
    subject picker in front of them, so an Electives there is a choice.
    """
    quest_ids = sorted(quest_ids)
    out = []
    for i in range(0, len(quest_ids), CHUNK):
        for row in fetch_all_rows(lambda chunk=quest_ids[i:i + CHUNK]: (
            client.table('user_quest_tasks')
            .select('id, user_id, quest_id, pillar, xp_value, diploma_subjects, '
                    'is_manual')
            .in_('quest_id', chunk)
        )):
            if row.get('is_manual'):
                continue
            if _on_the_default(row):
                out.append(row)
    return out


def _finalized_moves(client, changes_by_task):
    """[(user_id, from_subject, to_split, xp)] for credit already on a transcript.

    Keyed off the completion rather than the task so a task nobody has had
    approved moves nothing.
    """
    task_ids = sorted(changes_by_task)
    moves = []
    for i in range(0, len(task_ids), CHUNK):
        for row in fetch_all_rows(lambda chunk=task_ids[i:i + CHUNK]: (
            client.table('quest_task_completions')
            .select('id, user_id, task_id, diploma_status')
            .in_('task_id', chunk).in_('diploma_status', list(FINALIZED_STATES))
        )):
            plan = changes_by_task.get(row['task_id'])
            if plan:
                moves.append((row['user_id'], plan['split']))
    return moves


def _apply_ledger(client, moves, now, dry_run):
    """Move finalized XP out of electives and into the subjects now named.

    Never below zero and never more than the electives balance actually holds:
    a reviewer can override a split at approval time, so the ledger and the
    task do not always agree, and inventing the difference would be worse than
    leaving it.
    """
    wanted = defaultdict(lambda: defaultdict(int))      # user -> subject -> xp
    for user_id, split in moves:
        for subject, xp in split.items():
            wanted[user_id][subject] += xp

    lines = []
    for user_id, gains in sorted(wanted.items()):
        rows = (client.table('user_subject_xp')
                .select('id, school_subject, xp_amount')
                .eq('user_id', user_id).execute()).data or []
        by_subject = {r['school_subject']: r for r in rows}
        electives = by_subject.get('electives')
        available = (electives or {}).get('xp_amount') or 0
        moving = min(available, sum(gains.values()))
        if moving <= 0:
            continue

        # Scale down proportionally if the transcript holds less than the tasks
        # say it should, so the parts still sum to what is actually there.
        scale = moving / sum(gains.values())
        applied = {s: int(round(xp * scale)) for s, xp in gains.items()}
        drift = moving - sum(applied.values())
        if applied and drift:
            first = max(applied, key=applied.get)
            applied[first] += drift

        lines.append((user_id, available, moving, dict(applied)))
        if dry_run:
            continue

        client.table('user_subject_xp').update({
            'xp_amount': available - moving, 'updated_at': now,
        }).eq('id', electives['id']).execute()
        for subject, xp in applied.items():
            if xp <= 0:
                continue
            row = by_subject.get(subject)
            if row:
                client.table('user_subject_xp').update({
                    'xp_amount': (row['xp_amount'] or 0) + xp, 'updated_at': now,
                }).eq('id', row['id']).execute()
            else:
                client.table('user_subject_xp').insert({
                    'user_id': user_id, 'school_subject': subject,
                    'xp_amount': xp, 'pending_xp': 0, 'updated_at': now,
                }).execute()
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true',
                        help='write the changes (default: dry run)')
    parser.add_argument('--org', help='limit to one organization slug')
    parser.add_argument('--skip-ledger', action='store_true',
                        help='fix the tasks only, leave finalized transcripts alone')
    args = parser.parse_args()

    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
        print('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
        return 1

    client = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)
    now = now_iso()
    dry_run = not args.apply

    orgs = _org_ids(client, args.org)
    quest_ids = _org_quest_ids(client, sorted(orgs))
    if not quest_ids:
        print('No school-owned quests. Nothing to do.')
        return 0

    templates = _template_tasks(client, quest_ids)
    user_tasks = _user_tasks(client, quest_ids)

    template_changes, user_changes, by_subject = [], {}, defaultdict(int)
    ambiguous = {}                        # quest_id -> (XP heading to a guess, subject)
    for task in templates:
        plan = _plan_for(task)
        if plan:
            template_changes.append((task['id'], plan[0], plan[1]))
            if (task.get('pillar') or '').lower() in AMBIGUOUS_PILLARS:
                seen, _ = ambiguous.get(task['quest_id'], (0, None))
                ambiguous[task['quest_id']] = (seen + (task.get('xp_value') or 0),
                                               plan[0][0])
    for task in user_tasks:
        plan = _plan_for(task)
        if plan:
            user_changes[task['id']] = {'subjects': plan[0], 'split': plan[1]}
            for subject, xp in plan[1].items():
                by_subject[subject] += xp

    scope = orgs[list(orgs)[0]]['name'] if args.org else f'{len(orgs)} organizations'
    print(f'Scope: {scope}')
    print(f'Preset tasks to re-credit:  {len(template_changes)} of {len(templates)} on the default')
    print(f'Student tasks to re-credit: {len(user_changes)} of {len(user_tasks)} on the default')
    if by_subject:
        print('\nXP leaving Electives, by subject:')
        for subject, xp in sorted(by_subject.items(), key=lambda kv: -kv[1]):
            print(f'  {subject:<20} {xp:>8}')

    if ambiguous:
        rows = _ambiguous_quests(client, ambiguous)
        print(f'\nWorth a look before applying ({len(rows)} quests). Their pillar covers two')
        print('subjects, so the one below is the broader guess -- a geometry unit under')
        print('"stem" lands in Science. The task editor can change any of them afterwards.')
        for title, xp, subject in rows[:AMBIGUOUS_SHOWN]:
            print(f'  {xp:>5} XP -> {subject:<16} {title[:58]}')
        if len(rows) > AMBIGUOUS_SHOWN:
            print(f'  ... and {len(rows) - AMBIGUOUS_SHOWN} more')

    moves = [] if args.skip_ledger else _finalized_moves(client, user_changes)
    ledger_lines = _apply_ledger(client, moves, now, dry_run) if moves else []
    if ledger_lines:
        print(f'\nFinalized credit to move off Electives ({len(moves)} approved completions):')
        for user_id, available, moving, applied in ledger_lines:
            parts = ', '.join(f'{s} +{x}' for s, x in sorted(applied.items()))
            print(f'  {user_id[:8]}  electives {available} -> {available - moving}   ({parts})')
    elif not args.skip_ledger:
        print('\nNo finalized credit is sitting in Electives.')

    if dry_run:
        print('\nDry run. Re-run with --apply to write.')
        print('Afterwards run repair_pending_subject_xp.py --apply to bring pending credit across.')
        return 0

    for task_id, subjects, split in template_changes:
        client.table('quest_template_tasks').update({
            'diploma_subjects': subjects, 'subject_xp_distribution': split,
            'updated_at': now,
        }).eq('id', task_id).execute()

    for task_id, plan in user_changes.items():
        client.table('user_quest_tasks').update({
            'diploma_subjects': plan['subjects'],
            'subject_xp_distribution': plan['split'],
        }).eq('id', task_id).execute()

    print(f'\nApplied: {len(template_changes)} preset tasks, {len(user_changes)} student tasks, '
          f'{len(ledger_lines)} transcripts.')
    print('Now run: python backend/scripts/repair_pending_subject_xp.py --apply')
    return 0


if __name__ == '__main__':
    sys.exit(main())
