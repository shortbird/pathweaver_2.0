"""
Assigning a quest to a class enrolls its students in it.

iCreate/Horizon, 2026-09-02: "quests assigned through classes should appear in
student accounts just like other quests do, no difference. they appear in the
journal quest list, etc. exact same."

They did not, and the reason was that assignment and enrollment are different
things. A class_quests row says a quest is assigned to a section; a user_quests
row says a student has taken it on. Everything a student's account is built from
reads the second one -- active quests, the journal's task picker (which lists
"the student's active quests"), XP goals, the quest detail's task list. So an
assigned quest showed up on the class page, in the quest hub, and in a separate
"assigned to you, start it" tray on the dashboard, and nowhere else. Rory England
had "Intro to Human Anatomy and Physiology and Cell Unit" due the next day and no
way to find it from anywhere he would normally look for a quest.

This module closes that: assigning enrolls, so the quest is a quest.

What it deliberately does NOT do:

  - It never touches an enrollment that already exists, in any state. A student
    who started, finished, or abandoned the quest keeps exactly what they had --
    re-running this is a no-op for them. That is what makes it safe to call on
    every assignment and to backfill with.
  - It does not unenroll. Unassigning a quest from a class leaves the student's
    enrollment alone, because by then it may have their work behind it. Whether
    that should change is an open question (2026-09-02), not an oversight.

The enrollment it writes matches what routes/quest/enrollment.py writes when a
student presses start: the user_quests row, every template task copied into
user_quest_tasks, and personalization marked complete when there were template
tasks to copy (the wizard has nothing left to ask). Anything less would be a
second kind of enrollment for the rest of the app to special-case, which is the
problem this is fixing.
"""

from datetime import datetime, timezone

from utils.logger import get_logger
from utils.template_tasks import (
    copy_template_tasks_to_enrollment,
    load_template_tasks,
)
from utils.validation.sanitizers import pgrst_timestamp

logger = get_logger(__name__)

# PostgREST truncates at 1000 rows, and these reads scale with students x quests
# (a 30-student class inheriting a 40-quest curriculum is 1200). Chunked rather
# than paged: the reads are keyed by id lists we already hold, so slicing the
# input is simpler than cursoring the output. See CLAUDE.md, Row Limits.
_CHUNK = 200


def _now():
    return datetime.now(timezone.utc).isoformat()


def _chunks(seq, size=_CHUNK):
    seq = list(seq)
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def active_student_ids(admin, class_id):
    """Actively enrolled students of a class. Withdrawn students get nothing."""
    rows = (admin.table('class_enrollments').select('student_id')
            .eq('class_id', class_id).eq('status', 'active').execute()).data or []
    return sorted({r['student_id'] for r in rows if r.get('student_id')})


def _assignable_quests(admin, quest_ids):
    """{quest_id: quest} for the ones worth enrolling anyone in.

    An inactive quest is skipped: a class_quests row can outlive the quest it
    points at, and enrolling 30 students in a retired quest puts a dead entry in
    every one of their accounts.
    """
    out = {}
    for chunk in _chunks(quest_ids):
        rows = (admin.table('quests').select('id, title, is_active, allow_custom_tasks')
                .in_('id', chunk).execute()).data or []
        for q in rows:
            if q.get('is_active'):
                out[q['id']] = q
    return out


def _existing_pairs(admin, user_ids, quest_ids):
    """{(user_id, quest_id)} already enrolled, in ANY state.

    Completed and abandoned count as existing. Re-enrolling somebody who
    finished a quest would reopen it in their account and, worse, re-copy its
    template tasks alongside the ones they already completed.
    """
    pairs = set()
    for u_chunk in _chunks(user_ids):
        for q_chunk in _chunks(quest_ids):
            rows = (admin.table('user_quests').select('user_id, quest_id')
                    .in_('user_id', u_chunk).in_('quest_id', q_chunk).execute()).data or []
            pairs.update((r['user_id'], r['quest_id']) for r in rows)
    return pairs


def enroll_students_in_quests(admin, student_ids, quest_ids):
    """Enroll each student in each quest they are not already enrolled in.

    Returns {'enrolled': n, 'tasks': m, 'skipped_existing': k}. Idempotent: the
    second call over the same pairs enrolls nobody.
    """
    student_ids = sorted({s for s in (student_ids or []) if s})
    quest_ids = [q for q in dict.fromkeys(quest_ids or []) if q]
    if not student_ids or not quest_ids:
        return {'enrolled': 0, 'tasks': 0, 'skipped_existing': 0}

    quests = _assignable_quests(admin, quest_ids)
    quest_ids = [q for q in quest_ids if q in quests]
    if not quest_ids:
        return {'enrolled': 0, 'tasks': 0, 'skipped_existing': 0}

    have = _existing_pairs(admin, student_ids, quest_ids)
    todo = [(s, q) for q in quest_ids for s in student_ids if (s, q) not in have]
    if not todo:
        return {'enrolled': 0, 'tasks': 0, 'skipped_existing': len(have)}

    now = _now()
    enrolled, task_count = 0, 0
    # Loaded once per quest, not once per student: a 30-student class inheriting
    # one quest should read its template list once. utils.template_tasks is
    # written for exactly this ("bulk assignment loads once per quest").
    templates_by_quest = {q: load_template_tasks(q) for q in quest_ids}

    for chunk in _chunks(todo):
        inserted = (admin.table('user_quests').insert([
            {'user_id': s, 'quest_id': q, 'is_active': True, 'last_picked_up_at': now}
            for s, q in chunk
        ]).execute()).data or []
        enrolled += len(inserted)

        for row in inserted:
            # The shared copier, so a student enrolled this way ends up with the
            # same task rows -- and the same personalization_completed -- as one
            # who pressed start. A second, thinner enrollment for the rest of the
            # app to special-case is the bug, not the fix.
            task_count += copy_template_tasks_to_enrollment(
                admin, row['quest_id'], row['user_id'], row['id'],
                template_tasks=templates_by_quest.get(row['quest_id']))

    logger.info(f'Class assignment enrolled {enrolled} student-quest pairs '
                f'({task_count} tasks copied)')
    return {'enrolled': enrolled, 'tasks': task_count, 'skipped_existing': len(have)}


def enroll_class_in_quests(admin, class_id, quest_ids):
    """Every active student of a class, enrolled in the given quests.

    Narrowed to the quests actually published on this class. A publish_at in the
    future is the teacher's statement of when students may see it, and enrolling
    them would put it in their accounts today -- the schedule would silently stop
    working. Those are picked up by publish_due_class_quests() when the time
    comes.
    """
    published = set(class_quest_ids(admin, class_id))
    due = [q for q in (quest_ids or []) if q in published]
    if not due:
        return {'enrolled': 0, 'tasks': 0, 'skipped_existing': 0}
    return enroll_students_in_quests(admin, active_student_ids(admin, class_id), due)


def publish_due_class_quests(admin, now=None):
    """Enroll students in class quests whose scheduled publish time has arrived.

    Assignment enrolls, but a quest scheduled for later deliberately doesn't --
    so something has to enroll it when its time comes, or a scheduled quest would
    simply never reach anyone. That used to be covered by the dashboard's
    separate "From Your Classes" tray, which listed assigned-but-unstarted
    quests; the tray is gone (2026-09-02: "I just want it to appear like other
    quests instead of different"), and this is what replaces it.

    Idempotent by construction: enroll_students_in_quests skips every pair that
    already has a user_quests row, so re-running finds nothing. Safe to call on
    every cron cycle.
    """
    now = now or _now()
    rows = (admin.table('class_quests').select('class_id, quest_id')
            .not_.is_('publish_at', 'null')
            .lte('publish_at', pgrst_timestamp(now, 'publish_at'))
            .execute()).data or []
    if not rows:
        return {'classes': 0, 'enrolled': 0, 'tasks': 0}

    by_class = {}
    for r in rows:
        by_class.setdefault(r['class_id'], []).append(r['quest_id'])

    enrolled = tasks = 0
    for class_id, quest_ids in by_class.items():
        # Active classes and active students only -- the same rules assignment
        # follows, so a published quest on an archived section stays put.
        result = enroll_students_in_quests(
            admin, active_student_ids(admin, class_id), quest_ids)
        enrolled += result['enrolled']
        tasks += result['tasks']
    return {'classes': len(by_class), 'enrolled': enrolled, 'tasks': tasks}


def class_quest_ids(admin, class_id, published_only=True):
    """The quests assigned to a class.

    published_only skips ones scheduled for later: a quest whose publish_at has
    not arrived is deliberately not visible yet, and enrolling students in it
    would put it in their account ahead of the date the teacher set. Those get
    picked up when the schedule fires or the next assignment runs.
    """
    query = (admin.table('class_quests').select('quest_id, publish_at')
             .eq('class_id', class_id))
    if published_only:
        query = query.or_(
            f'publish_at.is.null,publish_at.lte.{pgrst_timestamp(_now(), "publish_at")}')
    rows = query.order('sequence_order').execute().data or []
    return [r['quest_id'] for r in rows]


def enroll_student_in_class_quests(admin, class_id, student_id):
    """A student joining a class picks up the quests already assigned to it.

    Without this the fix only works for students who were already enrolled when
    the quest was assigned, and everyone who joins later is back to the original
    bug with no way to notice.
    """
    return enroll_students_in_quests(admin, [student_id], class_quest_ids(admin, class_id))


def enroll_in_class_quests(admin, class_id, student_id):
    """The call every class_enrollments write path makes, best-effort.

    Paired with sync_class_group() at each site for the same reason and with the
    same contract: enrolling a student is the thing the user asked for, and
    neither their group chat nor their quest list may fail it. Both are
    idempotent, so the next enrollment change on that class heals a miss.

    The write paths, all six (mirrors the list in class_group_sync_service):
      - staff direct enrollment (routes/sis/catalog)
      - registration completion (sis_registration_service)
      - Schedule Builder add/drop (sis_parent_service)
      - waitlist offer acceptance and promotion (sis_waitlist_service, x2)
      - schedule-exception approval (sis_exception_service)
    """
    return enroll_safe(enroll_student_in_class_quests, admin, class_id, student_id)


def enroll_safe(fn, *args, **kwargs):
    """Run one of the above, swallowing failures.

    Every caller has already committed the thing the user asked for -- the quest
    is assigned, the student is enrolled in the class. Raising here would report
    that as a failure and invite a retry of work that already succeeded. The
    zeros a caller gets back are honest, and the log line says what happened.
    """
    try:
        return fn(*args, **kwargs)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Class quest auto-enrollment failed: {e}', exc_info=True)
        return {'enrolled': 0, 'tasks': 0, 'skipped_existing': 0}
