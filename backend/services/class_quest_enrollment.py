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

Who gets enrolled (2026-09-11, Gryffin / Katie Bird: "some kids can only handle
so many assignments" and "only assign certain assignments to specific kids"):
a class_quests row carries `student_ids`. NULL means the whole class, the way
every row read before the column existed; a list means only those students.
`audience()` is the one place that rule is resolved, and it always intersects
the list with the class's ACTIVE enrollments, so a withdrawn student's id left
in a list is inert.

What the enrollment half deliberately does NOT do:

  - It never touches an enrollment that already exists, in any state. A student
    who started, finished, or abandoned the quest keeps exactly what they had --
    re-running this is a no-op for them. That is what makes it safe to call on
    every assignment and to backfill with.
  - It does not unenroll on UNASSIGN. Taking a quest off a class leaves every
    student's enrollment alone, because by then it may have their work behind
    it. Whether that should change is an open question (2026-09-02).

Taking a quest away from ONE student is different, and is the second half of
this module. A teacher removing a struggling student from an assignment means
"this is no longer on their plate", so `withdraw_students_from_quest` does the
most it can without destroying anything: an enrollment with no work behind it
is deleted outright (no ghost in their history); one with work is set down --
the same state a student reaches by choosing to move on -- so it leaves their
active list and stays in their portfolio; a finished one is left alone. Nothing
a student did is ever deleted here.

The enrollment it writes matches what routes/quest/enrollment.py writes when a
student presses start: the user_quests row, every template task copied into
user_quest_tasks, and personalization marked complete when there were template
tasks to copy (the wizard has nothing left to ask). Anything less would be a
second kind of enrollment for the rest of the app to special-case, which is the
problem this is fixing.
"""


from datetime import datetime, timezone

from repositories.class_quest_audience_repository import ClassQuestAudienceRepository
from utils.logger import get_logger
from utils.template_tasks import (
    copy_template_tasks_to_enrollment,
    load_template_tasks,
)

logger = get_logger(__name__)

# PostgREST truncates at 1000 rows, and these reads scale with students x quests
# (a 30-student class inheriting a 40-quest curriculum is 1200). Chunked rather
# than paged: the reads are keyed by id lists we already hold, so slicing the
# input is simpler than cursoring the output. See CLAUDE.md, Row Limits.
_CHUNK = 200


from utils.timestamps import now_iso as _now  # noqa: E402


def _chunks(seq, size=_CHUNK):
    seq = list(seq)
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def _empty():
    return {'enrolled': 0, 'tasks': 0, 'skipped_existing': 0}


def _add(total, part):
    for key in total:
        total[key] += part.get(key, 0)
    return total


def _parse_ts(value):
    """An ISO timestamp as an aware datetime, or None for nothing/garbage."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except (ValueError, TypeError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


# ── Who a class quest is for ──────────────────────────────────────────────────

def is_published(link, now=None):
    """Has this class quest's release time arrived (or was none set)?"""
    publish_at = _parse_ts(link.get('publish_at'))
    if publish_at is None:
        return True
    now = now or datetime.now(timezone.utc)
    return publish_at <= now


def assigned_to(link, student_id):
    """Is this student in the quest's audience? NULL student_ids = everyone.

    Membership only. Whether the student is still actively enrolled in the
    class is the caller's question -- every caller here already starts from
    active enrollments.
    """
    ids = link.get('student_ids')
    return ids is None or student_id in ids


def audience(link, roster_ids):
    """The students this class quest is for, as a subset of the active roster.

    Roster order is kept so a class-wide quest and a "specific students" quest
    covering the same people resolve to the same list.
    """
    ids = link.get('student_ids')
    if ids is None:
        return list(roster_ids)
    wanted = set(ids)
    return [s for s in roster_ids if s in wanted]


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
        return _empty()

    quests = _assignable_quests(admin, quest_ids)
    quest_ids = [q for q in quest_ids if q in quests]
    if not quest_ids:
        return _empty()

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


def published_links(admin, class_id, quest_ids=None):
    """The class_quests rows students may see now, with their audience.

    A publish_at in the future is the teacher's statement of when students may
    see it, and enrolling them would put it in their accounts today -- the
    schedule would silently stop working. Those are picked up by
    publish_due_class_quests() when the time comes.
    """
    rows = ClassQuestAudienceRepository(admin).links(class_id, published_only=True, now_iso=_now())
    if quest_ids is not None:
        wanted = set(quest_ids)
        rows = [r for r in rows if r.get('quest_id') in wanted]
    return rows


def enroll_links(admin, links, roster_ids):
    """Enroll each link's audience in its quest.

    Grouped by audience so a class-wide batch stays one insert: the common case
    is every link for everyone, and that must not turn into a write per quest.
    """
    groups = {}
    for link in links:
        groups.setdefault(tuple(audience(link, roster_ids)), []).append(link['quest_id'])
    total = _empty()
    for who, quest_ids in groups.items():
        if who:
            _add(total, enroll_students_in_quests(admin, list(who), quest_ids))
    return total


def enroll_class_in_quests(admin, class_id, quest_ids):
    """Each quest's audience, enrolled -- for the quests actually published.

    Narrowed to the published rows on this class (see published_links) and to
    each row's audience: a quest kept to three students enrolls three, not the
    class.
    """
    links = published_links(admin, class_id, quest_ids)
    if not links:
        return _empty()
    return enroll_links(admin, links, active_student_ids(admin, class_id))


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
    rows = ClassQuestAudienceRepository(admin).due_links(now)
    if not rows:
        return {'classes': 0, 'enrolled': 0, 'tasks': 0}

    by_class = {}
    for r in rows:
        by_class.setdefault(r['class_id'], []).append(r)

    enrolled = tasks = 0
    for class_id, links in by_class.items():
        # Active classes and active students only -- the same rules assignment
        # follows, so a published quest on an archived section stays put.
        result = enroll_links(admin, links, active_student_ids(admin, class_id))
        enrolled += result['enrolled']
        tasks += result['tasks']
    return {'classes': len(by_class), 'enrolled': enrolled, 'tasks': tasks}


def class_quest_ids(admin, class_id, published_only=True, student_id=None):
    """The quests assigned to a class.

    published_only skips ones scheduled for later: a quest whose publish_at has
    not arrived is deliberately not visible yet, and enrolling students in it
    would put it in their account ahead of the date the teacher set. Those get
    picked up when the schedule fires or the next assignment runs.

    student_id narrows to the quests that student is in the audience of.
    """
    rows = ClassQuestAudienceRepository(admin).links(class_id, published_only, _now())
    if student_id:
        rows = [r for r in rows if assigned_to(r, student_id)]
    return [r['quest_id'] for r in rows]


def enroll_student_in_class_quests(admin, class_id, student_id):
    """A student joining a class picks up the quests already assigned to it.

    Without this the fix only works for students who were already enrolled when
    the quest was assigned, and everyone who joins later is back to the original
    bug with no way to notice.

    Only the quests assigned to the whole class (or to this student by name):
    a quest a teacher kept to specific students does not spread to a newcomer.
    """
    return enroll_students_in_quests(
        admin, [student_id], class_quest_ids(admin, class_id, student_id=student_id))


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
        return _empty()


# ── Taking a quest back from some students ────────────────────────────────────

def _worked_enrollment_ids(repo, user_quest_ids):
    """Which of these enrollments have work behind them.

    Work is a completed task, an evidence document on a task, or a task the
    student wrote themselves. Template copies alone are not work: they are what
    enrolling put there, and deleting them takes back only what we gave.
    """
    tasks = repo.tasks_for_enrollments(user_quest_ids)
    worked = {t['user_quest_id'] for t in tasks if t.get('is_manual')}
    touched = repo.touched_task_ids([t['id'] for t in tasks])
    worked.update(t['user_quest_id'] for t in tasks if t['id'] in touched)
    return worked


def withdraw_students_from_quest(admin, student_ids, quest_id, set_down_started=True):
    """Take a quest back out of these students' accounts, as far as their work allows.

    Per enrollment:
      - finished (completed_at set)      left alone; done work is done
      - has work behind it               set down when set_down_started, else
                                         left alone -- it leaves the active
                                         list and stays in the portfolio
      - untouched                        deleted, template copies and all

    set_down_started=False is for rescheduling a released quest into the
    future: students who have not touched it lose sight of it until the new
    date, and students mid-way keep working. Hiding half-done work would be a
    surprise, and a release date is about visibility, not about taking work
    back.

    Returns {'removed': n, 'set_down': m, 'kept': k}.
    """
    student_ids = sorted({s for s in (student_ids or []) if s})
    out = {'removed': 0, 'set_down': 0, 'kept': 0}
    if not student_ids or not quest_id:
        return out

    repo = ClassQuestAudienceRepository(admin)
    rows = repo.enrollments(student_ids, quest_id)
    if not rows:
        return out

    worked = _worked_enrollment_ids(repo, [r['id'] for r in rows])
    to_delete, to_set_down = [], []
    for r in rows:
        if r.get('completed_at'):
            out['kept'] += 1
        elif r['id'] in worked:
            if set_down_started and r.get('is_active') is not False:
                to_set_down.append(r['id'])
            else:
                out['kept'] += 1
        else:
            to_delete.append(r['id'])

    # user_quest_tasks cascades from user_quests, and these enrollments have no
    # completions or evidence to lose -- that is what "untouched" means.
    repo.delete_enrollments(to_delete)
    out['removed'] = len(to_delete)

    # The same write quest_lifecycle_service.set_down_quest makes, so the
    # student's account reads it as a quest they moved on from.
    repo.set_down(to_set_down, _now())
    out['set_down'] = len(to_set_down)

    logger.info(f'Withdrew quest {quest_id} from {len(student_ids)} students: {out}')
    return out


def reactivate_set_down(admin, student_ids, quest_id):
    """Pick a set-down enrollment back up for students re-added to a quest.

    enroll_students_in_quests skips any existing row on purpose, so a student
    who was removed (set down) and then added back would otherwise stay set
    down -- assigned on the teacher's screen and invisible on theirs.
    """
    student_ids = sorted({s for s in (student_ids or []) if s})
    if not student_ids or not quest_id:
        return 0
    repo = ClassQuestAudienceRepository(admin)
    rows = repo.enrollments(student_ids, quest_id)
    targets = [r['id'] for r in rows if r.get('is_active') is False and not r.get('completed_at')]
    repo.pick_up(targets, _now())
    return len(targets)


def set_class_quest_audience(admin, class_id, quest_id, student_ids, roster_ids=None):
    """Decide who a class quest is for, and make the students' accounts agree.

    student_ids None means everyone. A list is intersected with the active
    roster; a list that covers the whole roster is stored as NULL so the quest
    keeps reaching students who join later.

    Students newly in the audience are enrolled (if the quest is released) and
    any set-down enrollment of theirs is picked back up. Students newly out of
    it are withdrawn as far as their work allows (see
    withdraw_students_from_quest).

    Returns None when the quest is not on the class; otherwise
    {'student_ids': stored, 'added': [...], 'removed': [...],
     'enrolled': n, 'reactivated': n, 'withdrawn': n, 'set_down': n, 'kept': n}.
    """
    repo = ClassQuestAudienceRepository(admin)
    link = repo.link(class_id, quest_id)
    if not link:
        return None
    roster = list(roster_ids) if roster_ids is not None else active_student_ids(admin, class_id)

    before = set(audience(link, roster))
    if student_ids is None:
        stored, after = None, set(roster)
    else:
        after = {s for s in student_ids if s in roster}
        stored = None if after == set(roster) else sorted(after)

    repo.set_student_ids(link['id'], stored)

    added, removed = sorted(after - before), sorted(before - after)
    result = {'student_ids': stored, 'added': added, 'removed': removed,
              'enrolled': 0, 'reactivated': 0, 'withdrawn': 0, 'set_down': 0, 'kept': 0}
    if added and is_published(link):
        result['enrolled'] = enroll_students_in_quests(admin, added, [quest_id])['enrolled']
        result['reactivated'] = reactivate_set_down(admin, added, quest_id)
    if removed:
        taken = withdraw_students_from_quest(admin, removed, quest_id)
        result['withdrawn'] = taken['removed']
        result['set_down'] = taken['set_down']
        result['kept'] = taken['kept']
    return result
