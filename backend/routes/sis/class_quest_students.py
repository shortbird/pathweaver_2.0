"""
The students on a class's quests (split from routes/sis/class_quests.py, 2026-09-11).

Same blueprint prefix, same moderator gate (imported from class_quests, whose
_authorize / _is_moderator the assistant-access tests patch by name). What
lives here is everything a teacher does about ONE student's relationship to
the class's quests:

  - the progress grid (how far each student is on each assigned quest), which
    replaced the hand-entered gradebook;
  - one student's work, task by task, and the nudge to them and their guardians
    about what is left (Gryffin, 2026-08-27);
  - who a quest is for -- the /students endpoints that add or remove a student
    from a class quest's audience, and take the quest back out of a removed
    student's account as far as their work allows (Gryffin, 2026-09-10).

All DB access uses the service-role admin client; authorization is enforced in
Python above every read/write.
"""


from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from utils.auth.relationships import require_relationship_to
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger
from services.class_quest_enrollment import (
    active_student_ids,
    assigned_to,
    audience,
    set_class_quest_audience,
)
from repositories.class_quest_audience_repository import ClassQuestAudienceRepository
from services import student_class_quests
from routes.sis.class_quests import (
    _authorize,
    _bad_uuid,
    _is_done,
    _student_ids_or_error,
)

logger = get_logger(__name__)

bp = Blueprint('sis_class_quest_students', __name__, url_prefix='/api/sis')


def _audience_summary(result):
    """One sentence a teacher can read back after changing who a quest is for."""
    parts = []
    if result.get('enrolled') or result.get('reactivated'):
        n = result['enrolled'] + result['reactivated']
        parts.append(f"added for {n} student{'s' if n != 1 else ''}")
    gone = result.get('withdrawn', 0) + result.get('set_down', 0)
    if gone:
        note = (f" ({result['set_down']} had started; their work stays in their account)"
                if result.get('set_down') else '')
        parts.append(f"removed for {gone} student{'s' if gone != 1 else ''}{note}")
    return '; '.join(parts).capitalize() + '.' if parts else 'No change for anyone.'


# ── What a cell on the progress grid says ─────────────────────────────────────

# Written by GET /api/quests/<id> when the student or their parent opens the
# quest (migration 20260923120000_user_quests_opened_at). Read optimistically:
# until that migration is applied the columns do not exist, and the grid must
# still load -- it just cannot tell "Opened" from "Assigned" yet.
OPENED_COLUMNS = 'first_opened_at, last_opened_at'

# How far back "XP this week" looks on the grid's engagement line.
RECENT_XP_DAYS = 7


def _read_enrollments(build, columns):
    """user_quests rows, with the opened timestamps when the database has them.

    `build(columns)` returns a fresh query. A read that fails with the opened
    columns is retried without them, so a missing migration costs the Opened
    state and nothing else.
    """
    try:
        return (build(f'{columns}, {OPENED_COLUMNS}').execute()).data or []
    except Exception as e:  # noqa: BLE001 -- the column may not exist yet
        logger.warning(f'user_quests opened columns unavailable, reading without them: {e}')
        return (build(columns).execute()).data or []


def _pick_enrollment(rows):
    """The one enrollment that speaks for a student on a quest.

    A student can hold more than one user_quests row for the same quest (ended
    and restarted, removed and re-added). The grid used to keep whichever row
    the database returned last, so a restarted quest could show the old, ended
    attempt. Prefer the active row, then the most recent.
    """
    if not rows:
        return None
    return max(rows, key=lambda r: (bool(r.get('is_active')),
                                    r.get('started_at') or r.get('created_at') or ''))


def _group_enrollments(user_quests, key):
    grouped = {}
    for uq in user_quests:
        grouped.setdefault(key(uq), []).append(uq)
    return {k: _pick_enrollment(rows) for k, rows in grouped.items()}


def _xp(task):
    return task.get('xp_value') or 0


def _xp_required(threshold, own_tasks):
    """The XP this student needs on this quest.

    The quest's xp_threshold when the school set one; otherwise every task's XP,
    which is the same bar as "every task done".
    """
    return (threshold or 0) or sum(_xp(t) for t in own_tasks)


def _done_on_this_tab(uq, done, total, xp_earned, xp_required):
    """Is this quest done, as the Student Progress tab shows it?

    Reaching the quest's XP target counts, on this tab only (iCreate, ticket
    d4e562c9, 2026-09-23: Colby Barker read "2/8" while he had earned the 50 XP
    the quest asks for). The weekly digest and the class list keep the stricter
    rule in utils/quest_completion.is_quest_done, which this does not change --
    by decision (Tanner, 2026-09-23).
    """
    if _is_done(uq, done, total):
        return True
    return bool(uq) and xp_required > 0 and xp_earned >= xp_required


def _cell_state(uq, completed, done, xp_earned):
    """One word for where a student is on an assigned quest.

    Assigned -> Opened -> In progress -> Done, or Set aside. "Assigned" and
    "Opened" exist because assigning a quest creates the enrollment at once, so
    an enrollment alone says nothing about whether the student has looked
    (iCreate, ticket 7cf5d330, 2026-09-23).
    """
    if not uq:
        return 'assigned'
    if completed:
        return 'done'
    # The student's own "end quest" below the XP target sets the quest aside
    # (routes/quest/completion.py _set_aside): off their dashboard, work kept.
    if uq.get('status') == 'set_down':
        return 'set_aside'
    if done or xp_earned:
        return 'in_progress'
    if uq.get('first_opened_at'):
        return 'opened'
    return 'assigned'


def _parse_ts(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _made_by(class_row, links):
    """quest_id -> the student who made it, for class_quests rows carrying
    their quests(organization_id, created_by)."""
    return student_class_quests.made_by(class_row['id'], [
        {'quest_id': r['quest_id'], **{k: (r.get('quests') or {}).get(k)
                                       for k in ('organization_id', 'created_by')}}
        for r in links])


@bp.route('/classes/<class_id>/progress', methods=['GET'])
@require_auth
def class_student_progress(user_id, class_id):
    """Per-student task progress for the quests assigned to this class.

    This is the automatic replacement for the hand-entered gradebook: nothing
    here is typed by a teacher. For every enrolled student it reports, per
    assigned quest, whether they have started it and how many of their tasks
    are done — read from user_quests / user_quest_tasks / quest_task_completions,
    the same records that drive the student's own dashboard.

    Students who have not started a quest are reported explicitly rather than
    omitted; "nobody has begun this yet" is the single most useful thing on the
    page and it must not look like missing data.
    """
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err

    assigned = (admin.table('class_quests')
                .select('quest_id, sequence_order, due_date, publish_at, student_ids, '
                        'quests(id, title, xp_threshold, organization_id, created_by)')
                .eq('class_id', class_row['id']).order('sequence_order').execute()).data or []
    made = _made_by(class_row, assigned)
    quests = [{
        'quest_id': r['quest_id'],
        'title': (r.get('quests') or {}).get('title') or 'Untitled quest',
        'due_date': r.get('due_date'),
        'publish_at': r.get('publish_at'),
        'student_ids': r.get('student_ids'),
        # The XP the school asks for; 0 when unset (then each student's own
        # task XP is the bar).
        'xp_threshold': (r.get('quests') or {}).get('xp_threshold') or 0,
        # The student who wrote this quest for the class, or None for the
        # teacher's own. The grid folds these into one "Own quest" column.
        'made_by': made.get(r['quest_id']),
    } for r in assigned]
    quest_ids = [q['quest_id'] for q in quests]
    link_by_quest = {r['quest_id']: r for r in assigned}

    # Active enrollments only. Without this filter a withdrawn student stayed on
    # the progress grid forever, so this tab disagreed with the roster and the
    # Messages tab about how many students are in the class.
    enrolled = (admin.table('class_enrollments').select('student_id')
                .eq('class_id', class_row['id']).eq('status', 'active').execute()).data or []
    student_ids = [e['student_id'] for e in enrolled if e.get('student_id')]

    if not student_ids:
        return jsonify({'success': True, 'quests': quests, 'students': []})

    users = (admin.table('users')
             .select('id, first_name, last_name, display_name')
             .in_('id', student_ids).execute()).data or []
    names = {u['id']: ((u.get('display_name')
                        or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip())
                       or 'Unnamed') for u in users}

    # Enrollments, then that enrollment's tasks, then which of those are done.
    user_quests, tasks, completed_at_by_task = [], [], {}
    if quest_ids:
        user_quests = _read_enrollments(
            lambda cols: (admin.table('user_quests').select(cols)
                          .in_('user_id', student_ids).in_('quest_id', quest_ids)),
            'id, user_id, quest_id, is_active, status, completed_at, started_at, created_at')
    uq_ids = [uq['id'] for uq in user_quests]
    if uq_ids:
        # Paged: this is one row per task per student per assigned quest, so a
        # full class crosses PostgREST's row cap without saying so. A truncated
        # read drops the tail silently, and every cell built from it reports a
        # smaller `total` than the student actually has — the grid would say a
        # student is done when they are not (Sentry OPTIO-BACKEND-5T).
        tasks = fetch_all_rows(lambda: admin.table('user_quest_tasks')
                               .select('id, user_quest_id, user_id, quest_id, title, xp_value')
                               .in_('user_quest_id', uq_ids))
    task_ids = [t['id'] for t in tasks]
    for chunk_start in range(0, len(task_ids), 200):  # keep the IN list sane
        chunk = task_ids[chunk_start:chunk_start + 200]
        rows = (admin.table('quest_task_completions').select('task_id, completed_at')
                .in_('task_id', chunk).execute()).data or []
        completed_at_by_task.update({r['task_id']: r.get('completed_at') for r in rows})
    done_task_ids = set(completed_at_by_task)

    tasks_by_uq = {}
    for t in tasks:
        tasks_by_uq.setdefault(t['user_quest_id'], []).append(t)
    uq_by_student_quest = _group_enrollments(user_quests, lambda uq: (uq['user_id'], uq['quest_id']))
    recent_since = datetime.now(timezone.utc) - timedelta(days=RECENT_XP_DAYS)

    students = []
    for sid in student_ids:
        cells, total_done, total_tasks = [], 0, 0
        total_xp, total_xp_required, recent_xp, last_activity = 0, 0, 0, None
        for q in quests:
            # A quest kept to other students is not this one's work: no cell
            # arithmetic, and the grid says "not assigned" rather than "not
            # started", which would read as a student falling behind.
            if not assigned_to(link_by_quest[q['quest_id']], sid):
                cells.append({'quest_id': q['quest_id'], 'assigned': False, 'started': False,
                              'completed': False, 'done': 0, 'total': 0,
                              'xp_earned': 0, 'xp_required': 0, 'state': 'not_assigned'})
                continue
            uq = uq_by_student_quest.get((sid, q['quest_id']))
            if not uq:
                total_xp_required += q['xp_threshold']
                cells.append({'quest_id': q['quest_id'], 'assigned': True, 'started': False,
                              'completed': False, 'done': 0, 'total': 0,
                              'xp_earned': 0, 'xp_required': q['xp_threshold'],
                              'state': 'assigned'})
                continue
            own = tasks_by_uq.get(uq['id'], [])
            finished = [t for t in own if t['id'] in done_task_ids]
            done = len(finished)
            xp_earned = sum(_xp(t) for t in finished)
            xp_required = _xp_required(q['xp_threshold'], own)
            completed = _done_on_this_tab(uq, done, len(own), xp_earned, xp_required)
            for t in finished:
                at = _parse_ts(completed_at_by_task.get(t['id']))
                if at and (last_activity is None or at > last_activity):
                    last_activity = at
                if at and at >= recent_since:
                    recent_xp += _xp(t)
            total_done += done
            total_tasks += len(own)
            total_xp += xp_earned
            total_xp_required += xp_required
            cells.append({
                'quest_id': q['quest_id'],
                'assigned': True,
                'started': True,
                'completed': completed,
                'done': done,
                'total': len(own),
                'xp_earned': xp_earned,
                'xp_required': xp_required,
                'state': _cell_state(uq, completed, done, xp_earned),
                'started_at': uq.get('started_at'),
                # Set only when the student (or parent) ended the quest; the
                # grid shows it as a check and a date (iCreate, ticket
                # 8b928af0, 2026-09-23: "When a parent completes a Quest and
                # ends it, it would be nice to know/see that on this page").
                'completed_at': uq.get('completed_at'),
                'set_aside': uq.get('status') == 'set_down' and not uq.get('completed_at'),
                'first_opened_at': uq.get('first_opened_at'),
                'last_opened_at': uq.get('last_opened_at'),
            })
        students.append({
            'student_id': sid,
            'name': names.get(sid, 'Unnamed'),
            'cells': cells,
            'tasks_done': total_done,
            'tasks_total': total_tasks,
            'xp_earned': total_xp,
            'xp_required': total_xp_required,
            # Engagement, read from the class's quests only (iCreate, ticket
            # 7cf5d330): when this student last turned something in, and how
            # much XP they earned in the last week.
            'last_activity_at': last_activity.isoformat() if last_activity else None,
            'xp_last_7_days': recent_xp,
            'quests_started': len([c for c in cells if c['started']]),
            'quests_completed': len([c for c in cells if c['completed']]),
        })
    students.sort(key=lambda s: s['name'].lower())

    return jsonify({'success': True, 'quests': quests, 'students': students})


# ── One student's work, and a nudge about what is left ────────────────────────

def _student_work(admin, class_row, student_id):
    """This student's assigned quests for the class, task by task.

    The class progress grid answers "how many tasks are done"; this answers
    "which ones", which is what a teacher needs before saying anything to a
    family (Gryffin, 2026-08-27: "You should be able to click on a name and see
    what is done and what isn't").
    """
    links = (admin.table('class_quests')
             .select('quest_id, due_date, student_ids, '
                     'quests(title, xp_threshold, organization_id, created_by)')
             .eq('class_id', class_row['id'])
             .order('sequence_order').execute()).data or []
    # Another student's own quest is not this student's work, and listing it
    # would offer "Assign to <name>" -- handing one student's private quest to
    # a classmate.
    made = _made_by(class_row, links)
    links = [r for r in links if made.get(r['quest_id']) in (None, student_id)]
    quest_ids = [r['quest_id'] for r in links if r.get('quest_id')]
    if not quest_ids:
        return []

    user_quests = _read_enrollments(
        lambda cols: (admin.table('user_quests').select(cols)
                      .eq('user_id', student_id).in_('quest_id', quest_ids)),
        'id, quest_id, is_active, status, completed_at, started_at, created_at')
    uq_by_quest = _group_enrollments(user_quests, lambda uq: uq['quest_id'])
    uq_ids = [uq['id'] for uq in uq_by_quest.values()]

    tasks, done_ids, completion_by_task = [], set(), {}
    if uq_ids:
        tasks = (admin.table('user_quest_tasks')
                 .select('id, user_quest_id, title, description, xp_value, order_index')
                 .in_('user_quest_id', uq_ids).order('order_index').execute()).data or []
        task_ids = [t['id'] for t in tasks]
        for start in range(0, len(task_ids), 200):
            rows = (admin.table('quest_task_completions')
                    .select('id, task_id, completed_at')
                    .in_('task_id', task_ids[start:start + 200]).execute()).data or []
            done_ids.update(r['task_id'] for r in rows)
            completion_by_task.update({r['task_id']: r['id'] for r in rows})

    by_uq = {}
    for t in tasks:
        by_uq.setdefault(t['user_quest_id'], []).append(t)

    out = []
    for link in links:
        uq = uq_by_quest.get(link['quest_id'])
        own = by_uq.get(uq['id'], []) if uq else []
        finished = [t for t in own if t['id'] in done_ids]
        threshold = (link.get('quests') or {}).get('xp_threshold') or 0
        xp_earned = sum(_xp(t) for t in finished)
        xp_required = _xp_required(threshold, own)
        completed = _done_on_this_tab(uq, len(finished), len(own), xp_earned, xp_required)
        assigned = assigned_to(link, student_id)
        out.append({
            'quest_id': link['quest_id'],
            'title': (link.get('quests') or {}).get('title') or 'Untitled quest',
            'due_date': link.get('due_date'),
            'made_by': made.get(link['quest_id']),
            # False when the teacher kept this quest to other students. Listed
            # anyway, so the panel can offer to assign it to this one.
            'assigned': assigned,
            'started': bool(uq),
            # Same XP rule as the grid, so the panel and the reminder agree
            # with the cell the teacher clicked from (ticket d4e562c9).
            'completed': completed,
            'xp_earned': xp_earned,
            'xp_required': xp_required,
            'state': _cell_state(uq, completed, len(finished), xp_earned) if assigned else 'not_assigned',
            'completed_at': (uq or {}).get('completed_at'),
            'set_aside': bool(uq) and uq.get('status') == 'set_down' and not uq.get('completed_at'),
            'first_opened_at': (uq or {}).get('first_opened_at'),
            'tasks': [{
                'id': t['id'],
                'title': t.get('title'),
                # What the task actually asks for. A title alone is a label:
                # "I would like to be able to click on the tasks and be able to
                # see the description of the task" (Nicole Connole, 2026-09-04).
                'description': t.get('description'),
                'xp_value': t.get('xp_value'),
                'done': t['id'] in done_ids,
                # Lets the task row link straight to the submission review
                # (Gryffin, 2026-08-28: "It would be nice to be able to click
                # on the task to see their submission").
                'completion_id': completion_by_task.get(t['id']),
            } for t in own],
        })
    return out


@bp.route('/classes/<class_id>/students/<student_id>/progress', methods=['GET'])
@require_auth
@require_relationship_to('student_id', allow=('teacher', 'org_staff'), discloses='progress')
def student_class_progress(user_id, class_id, student_id):
    """What one student on this class has finished, and what they have not."""
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    if _bad_uuid(student_id):
        return jsonify({'success': False, 'error': 'Invalid student id'}), 400

    enrolled = (admin.table('class_enrollments').select('id')
                .eq('class_id', class_row['id']).eq('student_id', student_id)
                .eq('status', 'active').limit(1).execute()).data
    if not enrolled:
        return jsonify({'success': False, 'error': 'That student is not on this class.'}), 404

    from utils import person_name
    user = (admin.table('users').select(person_name.USER_NAME_FIELDS)
            .eq('id', student_id).limit(1).execute()).data
    # The student's guardians, so the panel can offer "Message <parent>" next
    # to the reminder. A teacher wanting to ask a family whether they need
    # help had no way from this screen to the parent (Nicole Connole, iCreate,
    # 2026-09-17, 9c1b49a5: "a tab that would send me to messages with the
    # parent ... a more personalized message, like seeing if they need help").
    # Same guardian set the reminder itself notifies; the message goes to the
    # parent only, by decision.
    from services.notification_service import NotificationService
    guardians = [
        {'id': p['id'], 'name': person_name.full_name(p, 'Parent')}
        for p in (NotificationService().get_parents_for_student(student_id) or [])
        if p.get('id')
    ]
    return jsonify({
        'success': True,
        'student': {
            'id': student_id,
            'name': person_name.full_name(user[0], 'Unnamed') if user else 'Unnamed',
        },
        'guardians': guardians,
        'quests': _student_work(admin, class_row, student_id),
    })


@bp.route('/classes/<class_id>/students/<student_id>/remind', methods=['POST'])
@require_auth
@require_relationship_to('student_id', allow=('teacher', 'org_staff'))
def remind_student(user_id, class_id, student_id):
    """Nudge a student, and their guardians, about work that is still open.

    Gryffin, 2026-08-27: "you should be able to send a reminder of what work
    they haven't completed and that should be sent to the parent and student."
    Nothing like it existed -- the only nudge on the platform was for unread
    announcements.
    """
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    if _bad_uuid(student_id):
        return jsonify({'success': False, 'error': 'Invalid student id'}), 400

    enrolled = (admin.table('class_enrollments').select('id')
                .eq('class_id', class_row['id']).eq('student_id', student_id)
                .eq('status', 'active').limit(1).execute()).data
    if not enrolled:
        return jsonify({'success': False, 'error': 'That student is not on this class.'}), 404

    outstanding = []
    for q in _student_work(admin, class_row, student_id):
        if q['completed'] or not q.get('assigned', True):
            continue
        left = [t['title'] for t in q['tasks'] if not t['done']]
        if left or not q['started']:
            outstanding.append({'quest': q['title'], 'tasks': left, 'started': q['started']})
    if not outstanding:
        return jsonify({'success': False,
                        'error': 'Nothing outstanding — there is nothing to remind them about.'}), 400

    lines = []
    for item in outstanding[:5]:
        if not item['started']:
            lines.append(f"{item['quest']} (not started)")
        else:
            shown = ', '.join(item['tasks'][:3])
            more = len(item['tasks']) - 3
            lines.append(f"{item['quest']}: {shown}" + (f" and {more} more" if more > 0 else ''))
    body = f"Still to do in {class_row.get('name') or 'your class'} — " + '; '.join(lines)

    from services.notification_service import NotificationService
    notifier = NotificationService()

    # Where the alert takes each recipient. A student's own work is on their
    # dashboard, but a PARENT's /dashboard is the family home — so a guardian
    # who opened the alert from the page they were already sitting on went
    # nowhere at all (Gryffin, 2026-09-04: "when I click on it to see the alert
    # nothing happens. I would like to see what assignments my child has").
    # Send them to the child this reminder is actually about.
    recipients = [(student_id, '/dashboard')] + [
        (p['id'], f'/parent/dashboard/{student_id}')
        for p in (notifier.get_parents_for_student(student_id) or []) if p.get('id')]

    sent = 0
    for recipient, link in recipients:
        try:
            # Its own type since 2026-09-15: sent as 'announcement' it read as
            # one in the bell and could not be turned off without turning off
            # every school announcement with it.
            notifier.create_notification(
                user_id=recipient,
                notification_type='class_work_reminder',
                title='A reminder about unfinished work',
                message=body,
                link=link,
            )
            sent += 1
        except Exception as e:  # noqa: BLE001 — one failed send must not lose the rest
            logger.warning(f'Reminder to {recipient[:8]} failed: {e}')

    return jsonify({'success': True, 'notified': sent, 'outstanding': len(outstanding)})


# ── Who a quest is for ────────────────────────────────────────────────────────
# Gryffin, 2026-09-10 (Katie Bird): "Is there a way to go into a specific
# student's assignments and remove them for a specific student? We have some
# kids that can only handle so many assignments. On the flip side, is there a
# way to only assign certain assignments to specific kids in each class?"
#
# One rule, three doors. PUT sets the whole list from the Quests tab's picker;
# POST/DELETE on one student are what the progress panel uses, where the teacher
# is already looking at that student. All three end in
# set_class_quest_audience, which also moves the students' enrollments.

def _student_quest_refusal(admin, class_row, quest_id, wanted):
    """A student's own quest stays with that student.

    It is private work with no school on it; the audience endpoints would
    otherwise enroll classmates in it (and email their parents). Taking it off
    the student's own list is allowed -- that is what Unassign means.
    """
    maker = student_class_quests.maker_of(class_row['id'], quest_id, client=admin)
    if maker and (wanted is None or any(sid != maker for sid in wanted)):
        return jsonify({'success': False,
                        'error': 'This is a student’s own quest. It stays with the student who made it.'}), 409
    return None


def _audience_response(result):
    if result is None:
        return jsonify({'success': False, 'error': 'That quest is not on this class.'}), 404
    return jsonify({'success': True, 'summary': _audience_summary(result), **result})


@bp.route('/classes/<class_id>/quests/<quest_id>/students', methods=['PUT'])
@require_auth
def set_quest_students(user_id, class_id, quest_id):
    """Set who a class quest is for. {"student_ids": null} = everyone."""
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Invalid quest id'}), 400
    data = request.get_json(silent=True) or {}
    roster = active_student_ids(admin, class_row['id'])
    student_ids, err = _student_ids_or_error(data, roster)
    if err:
        return err
    refused = _student_quest_refusal(admin, class_row, quest_id, student_ids)
    if refused:
        return refused
    return _audience_response(set_class_quest_audience(
        admin, class_row['id'], quest_id, student_ids, roster_ids=roster))


def _current_audience(admin, class_row, quest_id, roster):
    link = ClassQuestAudienceRepository(admin).link(class_row['id'], quest_id)
    return audience(link, roster) if link else None


@bp.route('/classes/<class_id>/quests/<quest_id>/students/<student_id>', methods=['POST'])
@require_auth
@require_relationship_to('student_id', allow=('teacher', 'org_staff'))
def add_quest_student(user_id, class_id, quest_id, student_id):
    """Give this quest to one more student on the class."""
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    if _bad_uuid(quest_id, student_id):
        return jsonify({'success': False, 'error': 'Invalid id'}), 400
    roster = active_student_ids(admin, class_row['id'])
    if student_id not in roster:
        return jsonify({'success': False, 'error': 'That student is not on this class.'}), 404
    current = _current_audience(admin, class_row, quest_id, roster)
    if current is None:
        return _audience_response(None)
    wanted = list(dict.fromkeys(current + [student_id]))
    refused = _student_quest_refusal(admin, class_row, quest_id, wanted)
    if refused:
        return refused
    return _audience_response(set_class_quest_audience(
        admin, class_row['id'], quest_id, wanted, roster_ids=roster))


@bp.route('/classes/<class_id>/quests/<quest_id>/students/<student_id>', methods=['DELETE'])
@require_auth
@require_relationship_to('student_id', allow=('teacher', 'org_staff'))
def remove_quest_student(user_id, class_id, quest_id, student_id):
    """Take this quest off one student's plate. Their work, if any, stays."""
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    if _bad_uuid(quest_id, student_id):
        return jsonify({'success': False, 'error': 'Invalid id'}), 400
    roster = active_student_ids(admin, class_row['id'])
    current = _current_audience(admin, class_row, quest_id, roster)
    if current is None:
        return _audience_response(None)
    wanted = [sid for sid in current if sid != student_id]
    return _audience_response(set_class_quest_audience(
        admin, class_row['id'], quest_id, wanted, roster_ids=roster))
