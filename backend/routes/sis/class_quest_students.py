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
                .select('quest_id, sequence_order, due_date, publish_at, student_ids, quests(id, title)')
                .eq('class_id', class_row['id']).order('sequence_order').execute()).data or []
    quests = [{
        'quest_id': r['quest_id'],
        'title': (r.get('quests') or {}).get('title') or 'Untitled quest',
        'due_date': r.get('due_date'),
        'publish_at': r.get('publish_at'),
        'student_ids': r.get('student_ids'),
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
    user_quests, tasks, done_task_ids = [], [], set()
    if quest_ids:
        user_quests = (admin.table('user_quests')
                       .select('id, user_id, quest_id, is_active, completed_at, started_at')
                       .in_('user_id', student_ids).in_('quest_id', quest_ids).execute()).data or []
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
        rows = (admin.table('quest_task_completions').select('task_id')
                .in_('task_id', chunk).execute()).data or []
        done_task_ids.update(r['task_id'] for r in rows)

    tasks_by_uq = {}
    for t in tasks:
        tasks_by_uq.setdefault(t['user_quest_id'], []).append(t)
    uq_by_student_quest = {(uq['user_id'], uq['quest_id']): uq for uq in user_quests}

    students = []
    for sid in student_ids:
        cells, total_done, total_tasks = [], 0, 0
        for q in quests:
            # A quest kept to other students is not this one's work: no cell
            # arithmetic, and the grid says "not assigned" rather than "not
            # started", which would read as a student falling behind.
            if not assigned_to(link_by_quest[q['quest_id']], sid):
                cells.append({'quest_id': q['quest_id'], 'assigned': False, 'started': False,
                              'completed': False, 'done': 0, 'total': 0})
                continue
            uq = uq_by_student_quest.get((sid, q['quest_id']))
            if not uq:
                cells.append({'quest_id': q['quest_id'], 'assigned': True, 'started': False,
                              'completed': False, 'done': 0, 'total': 0})
                continue
            own = tasks_by_uq.get(uq['id'], [])
            done = len([t for t in own if t['id'] in done_task_ids])
            total_done += done
            total_tasks += len(own)
            cells.append({
                'quest_id': q['quest_id'],
                'assigned': True,
                'started': True,
                'completed': _is_done(uq, done, len(own)),
                'done': done,
                'total': len(own),
                'started_at': uq.get('started_at'),
                'completed_at': uq.get('completed_at'),
            })
        students.append({
            'student_id': sid,
            'name': names.get(sid, 'Unnamed'),
            'cells': cells,
            'tasks_done': total_done,
            'tasks_total': total_tasks,
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
             .select('quest_id, due_date, student_ids, quests(title)')
             .eq('class_id', class_row['id'])
             .order('sequence_order').execute()).data or []
    quest_ids = [r['quest_id'] for r in links if r.get('quest_id')]
    if not quest_ids:
        return []

    user_quests = (admin.table('user_quests')
                   .select('id, quest_id, completed_at, started_at')
                   .eq('user_id', student_id)
                   .in_('quest_id', quest_ids).execute()).data or []
    uq_by_quest = {uq['quest_id']: uq for uq in user_quests}
    uq_ids = [uq['id'] for uq in user_quests]

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
        out.append({
            'quest_id': link['quest_id'],
            'title': (link.get('quests') or {}).get('title') or 'Untitled quest',
            'due_date': link.get('due_date'),
            # False when the teacher kept this quest to other students. Listed
            # anyway, so the panel can offer to assign it to this one.
            'assigned': assigned_to(link, student_id),
            'started': bool(uq),
            'completed': _is_done(uq, len([t for t in own if t['id'] in done_ids]), len(own)),
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
    return jsonify({
        'success': True,
        'student': {
            'id': student_id,
            'name': person_name.full_name(user[0], 'Unnamed') if user else 'Unnamed',
        },
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
            notifier.create_notification(
                user_id=recipient,
                notification_type='announcement',
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
