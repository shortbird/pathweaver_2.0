"""
Teacher-scoped quest assignment for a SIS class (2026-07-28).

Additive, prefix /api/sis. Lets a class's teacher assign quests to their class
and (for their school's own quests) author "template tasks" — preset tasks that
every enrolled student receives when they start the quest.

Authorization is a per-class MODERATOR gate (not a plain role check), so it
recognizes the class's primary_instructor_id — which the older learning-app
class endpoints (class_advisors-only) do not. A moderator is:
  - an org_admin/superadmin of the class's org, OR
  - the class's primary instructor (org_classes.primary_instructor_id), OR
  - an active co-teacher (class_advisors row, is_active).
Students never reach these endpoints. Since 2026-09-02 they don't need to:
assigning a quest ENROLLS the class's active students in it (user_quests +
their copy of the template tasks, via services/class_quest_enrollment), so the
quest shows up wherever a student's quests show up rather than only in a
separate "assigned to you, start it" tray. Unassigning does not unenroll.

Who a quest is for (2026-09-11, Gryffin): class_quests.student_ids. NULL is the
whole class; a list is those students only. Resolved in one place --
services/class_quest_enrollment.audience. The per-student routes -- the
progress grid, one student's work, reminders, and the /students endpoints that
change who a quest is for -- live in routes/sis/class_quest_students.py, split
out when this file crossed the route-file line cap. A release date (publish_at)
set here hides the quest from students until then; enrollment follows the date.

SAFETY: template-task authoring is allowed ONLY on quests owned by the class's
organization. Global/Optio-library quests are assigned as-is and their tasks are
never edited here — editing quest_template_tasks on a shared quest would change
it for every user of that quest.

All DB access uses the service-role admin client; authorization is enforced in
Python above every read/write.
"""


from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from utils.logger import get_logger
from utils.quest_completion import is_quest_done
from utils.validation import validate_uuid
from services import sis_service
from services import sis_notifications
from services.sis_quest_authoring import (
    QuestAuthoringError,
    clean_task as _clean_task,
    create_org_quest,
    duplicate_template_task as _duplicate_template_task,
    norm_pillar as _norm_pillar,
    subject_updates as _subject_updates,
)
from services.sis_curriculum_sync import assignable_quest_ids
from services.class_quest_enrollment import (
    active_student_ids,
    audience,
    enroll_class_in_quests,
    enroll_safe,
    is_published,
    publish_due_class_quests,
    withdraw_students_from_quest,
)
from repositories.class_quest_audience_repository import ClassQuestAudienceRepository
from database import get_supabase_admin_client
from utils import person_name
from datetime import datetime

logger = get_logger(__name__)

bp = Blueprint('sis_class_quests', __name__, url_prefix='/api/sis')




def _bad_uuid(*values):
    for v in values:
        ok, _ = validate_uuid(v)
        if not ok:
            return True
    return False


def _load_org_class(admin, class_id):
    rows = (
        admin.table('org_classes')
        .select('id, organization_id, name, primary_instructor_id, assistant_instructor_ids, status')
        .eq('id', class_id).limit(1).execute()
    ).data or []
    return rows[0] if rows else None


def _is_moderator(user_id, class_row, admin):
    org_id = class_row.get('organization_id')
    if sis_service.caller_is_admin(user_id):
        return sis_service.resolve_org_id(user_id, org_id) == org_id
    if class_row.get('primary_instructor_id') == user_id:
        return True
    # A named assistant counts. They already see the class in their portal
    # (sis_service.advisor_class_ids), so leaving them out here would render
    # them a Quests tab where every button 403s. iCreate on the assistant role,
    # 2026-08-04: "We may not need them to have all access to what the main
    # teacher has (but for now we can)."
    if user_id in (class_row.get('assistant_instructor_ids') or []):
        return True
    co_teacher = (
        admin.table('class_advisors').select('id')
        .eq('class_id', class_row['id']).eq('advisor_id', user_id)
        .eq('is_active', True).limit(1).execute()
    ).data
    return bool(co_teacher)


def _authorize(user_id, class_id):
    """(class_row, admin, None) for a moderator, else (None, None, err_tuple)."""
    if _bad_uuid(class_id):
        return None, None, (jsonify({'success': False, 'error': 'Invalid class id'}), 400)
    # admin client justified: loads the class and runs the _is_moderator gate (teacher/assistant/org admin) over deny-all-RLS class tables before any quest management
    admin = get_supabase_admin_client()
    class_row = _load_org_class(admin, class_id)
    if not class_row:
        return None, None, (jsonify({'success': False, 'error': 'Class not found'}), 404)
    if not _is_moderator(user_id, class_row, admin):
        return None, None, (jsonify({
            'success': False,
            'error': 'Only the class teacher or an administrator can manage class quests.'
        }), 403)
    return class_row, admin, None


def _template_task_count(admin, quest_ids):
    """{quest_id: count} of template tasks for the given quests."""
    if not quest_ids:
        return {}
    rows = (admin.table('quest_template_tasks').select('quest_id')
            .in_('quest_id', quest_ids).execute()).data or []
    out = {}
    for r in rows:
        out[r['quest_id']] = out.get(r['quest_id'], 0) + 1
    return out


def _serialize_task(t):
    return {
        'id': t['id'],
        'title': t.get('title'),
        'description': t.get('description') or '',
        'pillar': t.get('pillar'),
        'xp_value': t.get('xp_value'),
        'is_required': bool(t.get('is_required')),
        'order_index': t.get('order_index', 0),
        # The diploma credit the task earns. Read-only here until 2026-09-09:
        # the editor had no subject field, so every task a school typed in kept
        # the column default of Electives whatever the work was.
        'diploma_subjects': t.get('diploma_subjects') or [],
        'subject_xp_distribution': t.get('subject_xp_distribution') or {},
    }


def _iso_or_error(data, field):
    """(value, error) for an optional ISO timestamp field in a request body.

    Absent -> (None, None) and the caller leaves the column alone. Present and
    empty -> ('', None): clear it. Present and malformed -> a 400.
    """
    if field not in data:
        return None, None
    raw = data.get(field)
    if raw in (None, ''):
        return '', None
    try:
        datetime.fromisoformat(str(raw).strip().replace('Z', '+00:00'))
    except (ValueError, TypeError):
        return None, (jsonify({
            'success': False, 'error': f'{field} must be an ISO datetime string.'}), 400)
    return str(raw).strip(), None


def _roster(admin, class_id):
    """The class's active students, named, in roster order -- who a quest can be for."""
    ids = active_student_ids(admin, class_id)
    if not ids:
        return []
    by_id = {u['id']: u for u in ClassQuestAudienceRepository(admin).named_users(ids)}
    roster = [{'student_id': sid, 'name': person_name.full_name(by_id.get(sid), 'Unnamed')}
              for sid in ids]
    roster.sort(key=lambda r: r['name'].lower())
    return roster


def _student_ids_or_error(data, roster_ids):
    """(student_ids, error). None = everyone; a list is kept to the roster."""
    if 'student_ids' not in data or data.get('student_ids') is None:
        return None, None
    raw = data.get('student_ids')
    if not isinstance(raw, list) or any(not isinstance(x, str) for x in raw):
        return None, (jsonify({
            'success': False, 'error': 'student_ids must be a list of student ids.'}), 400)
    if _bad_uuid(*raw):
        return None, (jsonify({'success': False, 'error': 'Invalid student id'}), 400)
    on_roster = set(roster_ids)
    return [sid for sid in dict.fromkeys(raw) if sid in on_roster], None



@bp.route('/classes/<class_id>/call-for-help', methods=['POST'])
@require_auth
def call_for_help(user_id, class_id):
    """A teacher asks for somebody to come to the room.

    iCreate, 2026-08-25 (9d0618f8): "it would be super helpful to have a Campus
    Coordinator 'call button' ... maybe a button on each class that they opened
    up for attendance. This button would send a notification to any campus
    coordinator role when a teacher needed help in the class. Just not sure how
    this could show up for the campus coordinator that they would notice it?"

    It shows up as a notification, which is what already rings their bell and
    pushes to their phone — no new surface to remember to look at. Every admin
    is called too: a school may have no coordinator on shift, and a call for
    help that reaches nobody would be worse than no button.

    Deliberately fire-and-forget with no record of its own. This is somebody
    raising a hand, not a ticket; the answer to it arrives in person.
    """
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    org_id = class_row['organization_id']
    note = (request.get_json() or {}).get('note') or ''
    note = str(note).strip()[:200]

    caller = (admin.table('users').select('display_name, first_name, last_name')
              .eq('id', user_id).limit(1).execute()).data
    from utils import person_name
    who = person_name.full_name(caller[0], 'A teacher') if caller else 'A teacher'

    recipients = sis_service.front_office_ids(org_id)
    # One NotificationService for the whole fan-out — see sis_notifications.notify.
    from services.notification_service import NotificationService
    service = NotificationService()
    for rid in recipients:
        if rid == user_id:
            continue
        sis_notifications.notify(
            rid,
            f'Help needed in {class_row.get("name") or "a class"}',
            f'{who} asked for someone to come{f": {note}" if note else "."}',
            link=f'/classes?class_id={class_id}', organization_id=org_id,
            service=service)
    return jsonify({'success': True, 'notified': len([r for r in recipients if r != user_id])})


# ── Assigned quests ───────────────────────────────────────────────────────────

@bp.route('/classes/<class_id>/quests', methods=['GET'])
@require_auth
def list_class_quests(user_id, class_id):
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    rows = (admin.table('class_quests')
            .select('id, quest_id, sequence_order, publish_at, due_date, student_ids, '
                    'quests(id, title, description, quest_type, is_active, '
                    'organization_id, xp_threshold)')
            .eq('class_id', class_row['id']).order('sequence_order').execute()).data or []
    quest_ids = [r['quest_id'] for r in rows]
    counts = _template_task_count(admin, quest_ids)
    org_id = class_row['organization_id']
    # The roster rides along so the "who is this for" picker needs no second
    # request, and so a stored list can be shown against the students who are
    # actually still in the class.
    roster = _roster(admin, class_row['id'])
    roster_ids = [r['student_id'] for r in roster]
    out = []
    for r in rows:
        q = r.get('quests') or {}
        out.append({
            'quest_id': r['quest_id'],
            'title': q.get('title'),
            'description': q.get('description'),
            'quest_type': q.get('quest_type'),
            'sequence_order': r.get('sequence_order'),
            'publish_at': r.get('publish_at'),
            'due_date': r.get('due_date'),
            # None = everyone in the class. A list is the students it is kept to,
            # already trimmed to the active roster.
            'student_ids': None if r.get('student_ids') is None else audience(r, roster_ids),
            'template_task_count': counts.get(r['quest_id'], 0),
            # The XP a student has to earn before the quest counts as finished.
            # On the quest, not the class link: it is a property of the work.
            'xp_threshold': q.get('xp_threshold') or 0,
            # Only the org's own quests may have their preset tasks edited here.
            'editable_tasks': q.get('organization_id') == org_id,
        })
    return jsonify({'success': True, 'quests': out, 'students': roster})


def _curriculum_quest_ids(admin, class_id):
    """Quest ids the office saved onto this class's curricula — the set a
    teacher is meant to be teaching from."""
    curricula = _linked_curricula(admin, class_id)
    if not curricula:
        return set()
    rows = (admin.table('sis_curriculum_quests').select('quest_id')
            .in_('curriculum_id', [c['id'] for c in curricula]).execute()).data or []
    return {r['quest_id'] for r in rows if r.get('quest_id')}


@bp.route('/classes/<class_id>/assignable-quests', methods=['GET'])
@require_auth
def assignable_quests(user_id, class_id):
    """Quests a teacher can assign, nearest first.

    Everything active in the school plus the whole public Optio library used to
    come back as one flat list — 183 rows for iCreate on the day this was
    reported, in no order, most of them nothing to do with the class:

      "I'm thinking this would be a lot more manageable for teachers to add
      quests if they ONLY saw the quests assigned to their class by us on the
      Curriculum page OR the ones they created. Otherwise I could see this list
      getting soooo long, and with different people's naming conventions what
      does something like 'History week 1' even mean?" (49ba6e08)

      "'Assign saved quests' for this class should be more like the drop down
      with existing quests that belong to the class + create new. It'll be too
      confusing to have all the 'assign existing' quests in the dropdown."
      (71e7f320)

    So each quest is tagged with how it relates to THIS class, and with no
    search term only the two near tiers come back. The rest of the school and
    the library are still reachable — by typing, which is an explicit act of
    looking further afield rather than a wall to scroll past.
    """
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    org_id = class_row['organization_id']
    search = (request.args.get('search') or '').strip()
    limit = min(int(request.args.get('limit', 40) or 40), 100)

    already = {r['quest_id'] for r in (admin.table('class_quests').select('quest_id')
               .eq('class_id', class_row['id']).execute()).data or []}
    from_curriculum = _curriculum_quest_ids(admin, class_id)

    def _q(base):
        if search:
            base = base.ilike('title', f'%{search}%')
        return base.limit(limit).execute().data or []

    org_quests = _q(admin.table('quests')
                    .select('id, title, description, quest_type, organization_id, created_by')
                    .eq('organization_id', org_id).eq('is_active', True))
    lib_quests = _q(admin.table('quests')
                    .select('id, title, description, quest_type, organization_id, created_by')
                    .is_('organization_id', 'null').eq('is_active', True).eq('is_public', True))

    merged = []
    seen = set()
    for source, rows in (('organization', org_quests), ('library', lib_quests)):
        for q in rows:
            if q['id'] in seen or q['id'] in already:
                continue
            seen.add(q['id'])
            # Curriculum wins over authorship: a quest the office put on this
            # class's curriculum AND the teacher wrote is, to them, the one they
            # are supposed to be teaching.
            scope = ('curriculum' if q['id'] in from_curriculum
                     else 'mine' if q.get('created_by') == user_id
                     else 'other')
            merged.append({
                'quest_id': q['id'],
                'title': q.get('title'),
                'description': q.get('description'),
                'quest_type': q.get('quest_type'),
                'source': source,
                'scope': scope,
                'editable_tasks': q.get('organization_id') == org_id,
            })

    near = [q for q in merged if q['scope'] != 'other']
    # Without a search this answers "what should I be teaching?"; with one it
    # answers "where is the quest called X?", and the far tier has to be in it.
    shown = merged if search else near
    counts = _template_task_count(admin, [q['quest_id'] for q in shown])
    for q in shown:
        q['template_task_count'] = counts.get(q['quest_id'], 0)
    order = {'curriculum': 0, 'mine': 1, 'other': 2}
    shown.sort(key=lambda q: (order[q['scope']], (q['title'] or '').lower()))
    return jsonify({
        'success': True,
        'quests': shown,
        # How many the teacher is NOT being shown, so the UI can say so rather
        # than letting the short list read as "there is nothing else".
        'hidden_count': 0 if search else len(merged) - len(near),
    })


@bp.route('/classes/<class_id>/quests', methods=['POST'])
@require_auth
def assign_quest(user_id, class_id):
    """Assign an existing quest (org-owned or Optio-library) to this class."""
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    quest_id = (data.get('quest_id') or '').strip()
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Invalid quest id'}), 400
    quest = (admin.table('quests').select('id, organization_id, is_public, is_active')
             .eq('id', quest_id).limit(1).execute()).data
    quest = quest[0] if quest else None
    org_id = class_row['organization_id']
    # Only the org's own quests or the public Optio library are assignable.
    if not quest or not (quest.get('organization_id') == org_id
                         or (quest.get('organization_id') is None and quest.get('is_public'))):
        return jsonify({'success': False, 'error': 'That quest is not available to assign.'}), 404

    # A release date, a due date and an audience can all be set at assign time.
    # The release date in particular HAS to be: assigning enrolls the class on
    # the spot, so a date added a minute later would find the quest already in
    # every student's account (Gryffin, 2026-09-10: "put all of the assignments
    # in and then schedule a release date in addition to a due date").
    row, err = _assignment_fields(admin, class_row, data)
    if err:
        return err

    existing = (admin.table('class_quests').select('sequence_order')
                .eq('class_id', class_row['id']).order('sequence_order', desc=True)
                .limit(1).execute()).data
    next_order = ((existing[0]['sequence_order'] or 0) + 1) if existing else 0
    admin.table('class_quests').upsert({
        'class_id': class_row['id'], 'quest_id': quest_id,
        'added_by': user_id, 'sequence_order': next_order, **row,
    }, on_conflict='class_id,quest_id').execute()
    _attach_quest_to_class_curricula(admin, class_row['id'], quest_id, user_id)
    # An assigned quest is a quest: enroll the class so it lands in each
    # student's account like any other, not in a separate "assigned" tray.
    # (Only the students it is for, and only once its release date has come.)
    enrolled = enroll_safe(enroll_class_in_quests, admin, class_row['id'], [quest_id])
    return jsonify({'success': True, 'students_enrolled': enrolled['enrolled'],
                    'publish_at': row.get('publish_at'), 'student_ids': row.get('student_ids')})


def _assignment_fields(admin, class_row, data):
    """The optional class_quests columns an assign/create request may carry.

    Returns ({column: value}, None) with only the fields the request named, so
    an upsert over an existing link leaves its other dates alone; or (None, err).
    """
    row = {}
    for field in ('publish_at', 'due_date'):
        value, err = _iso_or_error(data, field)
        if err:
            return None, err
        if value is not None:
            row[field] = value or None
    if 'student_ids' in data:
        ids, err = _student_ids_or_error(data, active_student_ids(admin, class_row['id']))
        if err:
            return None, err
        if ids is not None:
            row['student_ids'] = ids
    return row, None


# ── The curriculum round trip ─────────────────────────────────────────────────
# iCreate, 2026-07-31: "I like the idea of quests in here, but I'm wondering if
# we can add the ability to add an in-house course that is tied to the
# curriculum. That way we don't have to start anew with the quests every year?
# And maybe some teachers want to fill it in in advance."
#
# class_quests hangs off a SECTION (this year's Tuesday 10:30 Reading Workshop).
# sis_curriculum is the durable object — it already outlives the timetable and
# already backs four sections at once. So the reusable set lives there, and a
# section copies from it. Two directions, both explicit:
#
#   from-curriculum  seed this section from the saved set (start of a year)
#   to-curriculum    save this section's set back (end of one, or a teacher
#                    building next year's in advance)
#
# Copy, not a live view: a section's quests carry its own publish_at/due_date and
# get individually removed, and a live union would silently change what enrolled
# students see the moment someone edited a curriculum mid-semester.


def _linked_curricula(admin, class_id):
    """The curriculum entries attached to this class, active ones only."""
    links = (admin.table('sis_curriculum_classes').select('curriculum_id')
             .eq('class_id', class_id).execute()).data or []
    ids = [l['curriculum_id'] for l in links]
    if not ids:
        return []
    return (admin.table('sis_curriculum').select('id, title, is_active')
            .in_('id', ids).eq('is_active', True).order('title').execute()).data or []


def _attach_quest_to_class_curricula(admin, class_id, quest_id, user_id):
    """A quest put on a class also lands on the class's curriculum.

    iCreate, 2026-08-31: teachers add quests (not curriculum), and "the quests
    they add get attached to the curriculum for the class" — so the durable set
    the school reuses next year keeps up with what is actually taught, without
    anyone remembering to press save-to-curriculum. Additive only: nothing is
    ever removed from a curriculum here (unassigning a quest from one section
    must not rewrite the school's curriculum); admins prune the set in the
    library. Best-effort — a failure here must not undo the class assignment.
    """
    try:
        for c in _linked_curricula(admin, class_id):
            existing = (admin.table('sis_curriculum_quests')
                        .select('quest_id, sequence_order')
                        .eq('curriculum_id', c['id']).execute()).data or []
            if any(r['quest_id'] == quest_id for r in existing):
                continue
            next_order = max([r.get('sequence_order') or 0 for r in existing],
                             default=-1) + 1
            admin.table('sis_curriculum_quests').upsert(
                {'curriculum_id': c['id'], 'quest_id': quest_id,
                 'sequence_order': next_order, 'added_by': user_id},
                on_conflict='curriculum_id,quest_id').execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Quest {quest_id} assigned but curriculum attach failed: {e}')


# Of a set of quest ids, the ones this org may actually assign — its own, plus
# the public Optio library. Shared with the library's push in the other
# direction (services/sis_curriculum_sync) so the two can't disagree about what
# is assignable; a curriculum outliving its quests is the case both must handle.
_assignable = assignable_quest_ids


@bp.route('/classes/<class_id>/curriculum-quests', methods=['GET'])
@require_auth
def class_curriculum_quests(user_id, class_id):
    """What this class could inherit: each linked curriculum's saved quest set,
    with the ones already on the class marked, so the UI can say "3 of 5 not
    added yet" instead of offering a no-op button."""
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    curricula = _linked_curricula(admin, class_id)
    if not curricula:
        return jsonify({'success': True, 'curricula': []})

    saved = (admin.table('sis_curriculum_quests')
             .select('curriculum_id, quest_id, sequence_order, quests(id, title)')
             .in_('curriculum_id', [c['id'] for c in curricula])
             .order('sequence_order').execute()).data or []
    on_class = {r['quest_id'] for r in (
        admin.table('class_quests').select('quest_id')
        .eq('class_id', class_row['id']).execute()).data or []}

    by_curriculum = {}
    for r in saved:
        q = r.get('quests') or {}
        by_curriculum.setdefault(r['curriculum_id'], []).append({
            'quest_id': r['quest_id'],
            'title': q.get('title'),
            'already_on_class': r['quest_id'] in on_class,
        })
    out = []
    for c in curricula:
        quests = by_curriculum.get(c['id'], [])
        out.append({
            'curriculum_id': c['id'], 'title': c.get('title'),
            'quests': quests,
            'missing_count': sum(1 for q in quests if not q['already_on_class']),
        })
    return jsonify({'success': True, 'curricula': out})


@bp.route('/classes/<class_id>/quests/from-curriculum', methods=['POST'])
@require_auth
def copy_quests_from_curriculum(user_id, class_id):
    """Seed this class from a linked curriculum's saved quest set.

    Additive and idempotent: quests already on the class are left exactly as they
    are, dates and all. Running it twice does nothing the second time.
    """
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    curriculum_id = (data.get('curriculum_id') or '').strip()
    if _bad_uuid(curriculum_id):
        return jsonify({'success': False, 'error': 'Invalid curriculum id'}), 400
    # Must be attached to THIS class — otherwise any teacher could pull any
    # curriculum in the org into their section.
    if curriculum_id not in {c['id'] for c in _linked_curricula(admin, class_id)}:
        return jsonify({'success': False,
                        'error': 'That curriculum is not attached to this class.'}), 404

    saved = (admin.table('sis_curriculum_quests').select('quest_id, sequence_order')
             .eq('curriculum_id', curriculum_id).order('sequence_order').execute()).data or []
    wanted = _assignable(admin, [r['quest_id'] for r in saved],
                         class_row['organization_id'])
    existing = (admin.table('class_quests').select('quest_id, sequence_order')
                .eq('class_id', class_row['id']).execute()).data or []
    have = {r['quest_id'] for r in existing}
    next_order = max([r.get('sequence_order') or 0 for r in existing], default=-1) + 1

    rows = []
    for qid in wanted:
        if qid in have:
            continue
        rows.append({'class_id': class_row['id'], 'quest_id': qid,
                     'added_by': user_id, 'sequence_order': next_order})
        next_order += 1
    if rows:
        admin.table('class_quests').upsert(
            rows, on_conflict='class_id,quest_id').execute()
    enrolled = enroll_safe(enroll_class_in_quests, admin, class_row['id'],
                           [r['quest_id'] for r in rows])
    return jsonify({'success': True, 'added': len(rows),
                    'skipped_already_present': len(wanted) - len(rows),
                    'skipped_unavailable': len(saved) - len(wanted),
                    'students_enrolled': enrolled['enrolled']})


@bp.route('/classes/<class_id>/quests/to-curriculum', methods=['POST'])
@require_auth
def save_quests_to_curriculum(user_id, class_id):
    """Save this class's current quest list onto a linked curriculum, so next
    year's section can start from it. Replaces the curriculum's set — the class
    in front of you is the statement of what the curriculum should be."""
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    curriculum_id = (data.get('curriculum_id') or '').strip()
    if _bad_uuid(curriculum_id):
        return jsonify({'success': False, 'error': 'Invalid curriculum id'}), 400
    if curriculum_id not in {c['id'] for c in _linked_curricula(admin, class_id)}:
        return jsonify({'success': False,
                        'error': 'That curriculum is not attached to this class.'}), 404

    current = (admin.table('class_quests').select('quest_id, sequence_order')
               .eq('class_id', class_row['id']).order('sequence_order').execute()).data or []
    admin.table('sis_curriculum_quests').delete() \
        .eq('curriculum_id', curriculum_id).execute()
    rows = [{'curriculum_id': curriculum_id, 'quest_id': r['quest_id'],
             'sequence_order': i, 'added_by': user_id}
            for i, r in enumerate(current)]
    if rows:
        admin.table('sis_curriculum_quests').upsert(
            rows, on_conflict='curriculum_id,quest_id').execute()
    return jsonify({'success': True, 'saved': len(rows)})


@bp.route('/classes/<class_id>/quests/<quest_id>', methods=['DELETE'])
@require_auth
def unassign_quest(user_id, class_id, quest_id):
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Invalid quest id'}), 400
    admin.table('class_quests').delete() \
        .eq('class_id', class_row['id']).eq('quest_id', quest_id).execute()
    return jsonify({'success': True})


@bp.route('/classes/<class_id>/quests/<quest_id>/delete', methods=['DELETE'])
@require_auth
def delete_class_quest(user_id, class_id, quest_id):
    """Delete one of the school's own quests outright, not just unassign it.

    Unassigning leaves the quest in the school's library, which is right for a
    quest that will be used again and wrong for one created by mistake. This
    removes it — but only when it is safe to:

      - it must belong to this org (Optio-library quests are shared, so deleting
        one here would take it away from every other school), and
      - no student may have started it. Deleting a quest with progress behind it
        would destroy their completed tasks and the XP those earned.

    When students have started it, we refuse and say how many, so the teacher
    can unassign instead.
    """
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Invalid quest id'}), 400

    quest = (admin.table('quests').select('id, title, organization_id')
             .eq('id', quest_id).limit(1).execute()).data
    quest = quest[0] if quest else None
    if not quest:
        return jsonify({'success': False, 'error': 'Quest not found'}), 404
    if quest.get('organization_id') != class_row['organization_id']:
        return jsonify({
            'success': False,
            'error': ('This quest comes from the Optio library and is shared with other '
                      'schools, so it can only be removed from your class, not deleted.'),
        }), 403

    started = (admin.table('user_quests').select('id')
               .eq('quest_id', quest_id).limit(50).execute()).data or []
    if started:
        return jsonify({
            'success': False,
            'error': (f'{len(started)} student{"s have" if len(started) != 1 else " has"} '
                      'already started this quest, so deleting it would erase their work. '
                      'Remove it from the class instead.'),
            'started_count': len(started),
        }), 409

    # class_quests rows and template tasks go with it; the quest row is last so a
    # failure part-way leaves the quest reachable rather than orphaned.
    admin.table('class_quests').delete().eq('quest_id', quest_id).execute()
    admin.table('quest_template_tasks').delete().eq('quest_id', quest_id).execute()
    admin.table('quests').delete().eq('id', quest_id).execute()
    return jsonify({'success': True, 'title': quest.get('title')})


@bp.route('/classes/<class_id>/quests/create', methods=['POST'])
@require_auth
def create_quest_with_tasks(user_id, class_id):
    """Create a new org quest (optionally with preset tasks) and assign it."""
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    # Checked before the quest exists: a malformed date must not leave behind a
    # quest that was never assigned.
    _, err = _assignment_fields(admin, class_row, data)
    if err:
        return err
    try:
        created = create_org_quest(
            admin,
            org_id=class_row['organization_id'],
            user_id=user_id,
            title=data.get('title'),
            description=data.get('description'),
            raw_tasks=data.get('tasks'),
        )
    except QuestAuthoringError as e:
        return jsonify({'success': False, 'error': e.message}), e.status
    quest_id = created['quest_id']

    # Same optional release date / due date / audience as assign_quest.
    row, err = _assignment_fields(admin, class_row, data)
    if err:
        return err

    existing = (admin.table('class_quests').select('sequence_order')
                .eq('class_id', class_row['id']).order('sequence_order', desc=True)
                .limit(1).execute()).data
    next_order = ((existing[0]['sequence_order'] or 0) + 1) if existing else 0
    admin.table('class_quests').upsert({
        'class_id': class_row['id'], 'quest_id': quest_id,
        'added_by': user_id, 'sequence_order': next_order, **row,
    }, on_conflict='class_id,quest_id').execute()
    _attach_quest_to_class_curricula(admin, class_row['id'], quest_id, user_id)
    enrolled = enroll_safe(enroll_class_in_quests, admin, class_row['id'], [quest_id])

    return jsonify({'success': True, 'quest_id': quest_id, 'task_count': created['task_count'],
                    'students_enrolled': enrolled['enrolled'],
                    'publish_at': row.get('publish_at')})


# ── Preset (template) tasks on an assigned, org-owned quest ────────────────────

def _authorize_editable_quest(user_id, class_id, quest_id):
    """Moderator + the quest is assigned to this class AND owned by the org
    (so editing its template tasks can't leak into shared/library quests)."""
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return None, None, None, err
    if _bad_uuid(quest_id):
        return None, None, None, (jsonify({'success': False, 'error': 'Invalid quest id'}), 400)
    link = (admin.table('class_quests').select('id')
            .eq('class_id', class_row['id']).eq('quest_id', quest_id).limit(1).execute()).data
    if not link:
        return None, None, None, (jsonify({'success': False, 'error': 'That quest is not assigned to this class.'}), 404)
    quest = (admin.table('quests').select('id, organization_id')
             .eq('id', quest_id).limit(1).execute()).data
    quest = quest[0] if quest else None
    if not quest or quest.get('organization_id') != class_row['organization_id']:
        return None, None, None, (jsonify({
            'success': False,
            'error': 'Preset tasks can only be edited on your school\'s own quests.'
        }), 403)
    return class_row, admin, quest, None


@bp.route('/classes/<class_id>/quests/<quest_id>/tasks', methods=['GET'])
@require_auth
def list_preset_tasks(user_id, class_id, quest_id):
    """Preset tasks for a quest assigned to this class. Read for any assigned
    quest; `editable` is true only for the school's own quests (library quests
    are read-only, since editing their tasks would affect all users)."""
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Invalid quest id'}), 400
    link = (admin.table('class_quests').select('id')
            .eq('class_id', class_row['id']).eq('quest_id', quest_id).limit(1).execute()).data
    if not link:
        return jsonify({'success': False, 'error': 'That quest is not assigned to this class.'}), 404
    quest = (admin.table('quests').select('organization_id')
             .eq('id', quest_id).limit(1).execute()).data
    editable = bool(quest) and quest[0].get('organization_id') == class_row['organization_id']
    rows = (admin.table('quest_template_tasks').select('*')
            .eq('quest_id', quest_id).order('order_index').execute()).data or []
    return jsonify({'success': True, 'editable': editable,
                    'tasks': [_serialize_task(t) for t in rows]})


@bp.route('/classes/<class_id>/quests/<quest_id>/tasks', methods=['POST'])
@require_auth
def add_preset_task(user_id, class_id, quest_id):
    class_row, admin, quest, err = _authorize_editable_quest(user_id, class_id, quest_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    last = (admin.table('quest_template_tasks').select('order_index')
            .eq('quest_id', quest_id).order('order_index', desc=True).limit(1).execute()).data
    next_order = ((last[0]['order_index'] or 0) + 1) if last else 0
    task = _clean_task(data, next_order)
    if not task:
        return jsonify({'success': False, 'error': 'A task title is required.'}), 400
    task['quest_id'] = quest_id
    row = admin.table('quest_template_tasks').insert(task).execute().data
    if not row:
        return jsonify({'success': False, 'error': 'Could not add the task.'}), 500

    # Students' task lists are copies taken at enrollment, so without this a
    # task added after anyone started the quest reached nobody already on it
    # (Gryffin, 2026-08-28: added a second task, "none of the students got that
    # task"). resync inserts the new task into every enrollment and reopens
    # enrollments that had already been completed.
    try:
        from utils.template_tasks import resync_enrollments_to_template
        resync_enrollments_to_template(admin, quest_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Task added but enrollment resync failed for {quest_id}: {e}')

    return jsonify({'success': True, 'task': _serialize_task(row[0])})


@bp.route('/classes/<class_id>/quests/<quest_id>/tasks/<task_id>', methods=['PATCH'])
@require_auth
def update_preset_task(user_id, class_id, quest_id, task_id):
    """Edit a preset task in place.

    Tasks could only be added and deleted, so correcting a typo, an XP value or
    the wrong pillar meant deleting the task and writing it again -- and
    deleting one takes any student work attached to it (Gryffin, 2026-08-27:
    "There is also no option to edit a quest or a task once its saved. You just
    have to delete and start over ... if you put in the wrong category you also
    can't change it").
    """
    class_row, admin, quest, err = _authorize_editable_quest(user_id, class_id, quest_id)
    if err:
        return err
    if _bad_uuid(task_id):
        return jsonify({'success': False, 'error': 'Invalid task id'}), 400

    data = request.get_json(silent=True) or {}
    updates = {}
    if 'title' in data:
        title = (data.get('title') or '').strip()
        if not title:
            return jsonify({'success': False, 'error': 'A task title is required.'}), 400
        updates['title'] = title
    if 'description' in data:
        updates['description'] = (data.get('description') or '').strip()
    if 'pillar' in data:
        updates['pillar'] = _norm_pillar(data.get('pillar'))
    if 'xp_value' in data:
        try:
            xp = int(data.get('xp_value'))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'XP must be a number.'}), 400
        updates['xp_value'] = max(0, xp)
    if 'is_required' in data:
        updates['is_required'] = bool(data.get('is_required'))
    if not updates and 'diploma_subjects' not in data and 'subject_xp_distribution' not in data:
        return jsonify({'success': False, 'error': 'Nothing to update.'}), 400

    # Read before write: the subject split is stored as XP amounts, so working
    # out the new one needs the XP and pillar the task will hold AFTER this
    # patch, and those may be columns the patch is not touching.
    current = (admin.table('quest_template_tasks')
               .select('xp_value, pillar, diploma_subjects, subject_xp_distribution')
               .eq('id', task_id).eq('quest_id', quest_id).limit(1).execute()).data
    if not current:
        return jsonify({'success': False, 'error': 'Task not found.'}), 404
    updates.update(_subject_updates(current[0], data, updates))

    row = (admin.table('quest_template_tasks').update(updates)
           .eq('id', task_id).eq('quest_id', quest_id).execute()).data
    if not row:
        return jsonify({'success': False, 'error': 'Task not found.'}), 404

    # Carry the correction to the students already holding this quest. Their
    # tasks are copies taken at enrolment, so without this an edit would only
    # reach whoever starts it next. resync rewrites rows in place and refuses to
    # touch a task carrying a completion or evidence.
    try:
        from utils.template_tasks import resync_enrollments_to_template
        resync_enrollments_to_template(admin, quest_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Task saved but enrollment resync failed for {quest_id}: {e}')

    return jsonify({'success': True, 'task': _serialize_task(row[0])})


@bp.route('/classes/<class_id>/quests/<quest_id>', methods=['PATCH'])
@require_auth
def update_class_quest(user_id, class_id, quest_id):
    """Set or clear a quest's due date (and publish schedule) for THIS class,
    and the XP a student has to earn before it counts as finished.

    class_quests has carried due_date and publish_at all along and the list
    endpoint returns them, but nothing could write them from the SIS -- so a
    school with due dates switched on still had no way to set one (Gryffin,
    2026-08-27: "How do we add due dates to any tasks that we assign?").

    xp_threshold is the same field the staff-training page writes and
    POST /api/quests/<id>/end already enforces; it lives on the QUEST, not on
    the class link, so it is written separately and only on the school's own
    quests -- a library quest belongs to every school. Teachers asked for it
    four times in a week and reached for the per-task XP box instead, which is
    a different number and does not save a quest-level target (iCreate,
    2026-09-01: "I would like to have an option to add an XP minimum for each
    quest"; "Oops, the XP was to add my own preset task. I was hoping to have a
    required amount of XP for the entire quest").
    """
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Invalid quest id'}), 400

    data = request.get_json(silent=True) or {}
    updates = {}
    for field in ('due_date', 'publish_at'):
        value, err = _iso_or_error(data, field)
        if err:
            return err
        if value is not None:
            updates[field] = value or None

    xp_threshold = None
    if 'xp_threshold' in data:
        raw = data.get('xp_threshold')
        if raw is None or raw == '':
            xp_threshold = 0
        else:
            try:
                xp_threshold = int(raw)
            except (TypeError, ValueError):
                return jsonify({'success': False,
                                'error': 'XP to finish must be a number.'}), 400
            if xp_threshold < 0:
                return jsonify({'success': False,
                                'error': 'XP to finish cannot be negative.'}), 400

    if not updates and xp_threshold is None:
        return jsonify({'success': False, 'error': 'Nothing to update.'}), 400

    link = (admin.table('class_quests').select('id, publish_at, student_ids')
            .eq('class_id', class_id).eq('quest_id', quest_id).limit(1).execute()).data
    if not link:
        return jsonify({'success': False, 'error': 'That quest is not on this class.'}), 404
    link = link[0]

    row = [{}]
    students_enrolled = students_hidden = 0
    if updates:
        # No updated_at here: class_quests doesn't have that column (only added_at),
        # and PostgREST rejects the whole PATCH over it (Sentry OPTIO-BACKEND-7B/7C).
        row = (admin.table('class_quests').update(updates)
               .eq('class_id', class_id).eq('quest_id', quest_id).execute()).data
        if not row:
            return jsonify({'success': False, 'error': 'That quest is not on this class.'}), 404

        if 'publish_at' in updates:
            # Enrollment follows the release date, in both directions. Released
            # now (or cleared): the audience gets it today rather than at the
            # next cron sweep. Pushed into the future: students who have not
            # touched it lose sight of it until then; anyone mid-way keeps
            # working (withdraw_students_from_quest, set_down_started=False).
            # Without this, a date set after assigning changed nothing a
            # student could see, because assigning had already enrolled them.
            was_published = is_published(link)
            now_published = is_published(row[0])
            if now_published:
                students_enrolled = enroll_safe(
                    enroll_class_in_quests, admin, class_row['id'], [quest_id])['enrolled']
            elif was_published:
                who = audience(link, active_student_ids(admin, class_row['id']))
                try:
                    students_hidden = withdraw_students_from_quest(
                        admin, who, quest_id, set_down_started=False)['removed']
                except Exception as e:  # noqa: BLE001 -- the date is saved; say so
                    logger.warning(f'Could not hide rescheduled quest {quest_id}: {e}')

    if xp_threshold is not None:
        quest = (admin.table('quests').select('organization_id')
                 .eq('id', quest_id).limit(1).execute()).data
        if not quest or quest[0].get('organization_id') != class_row['organization_id']:
            return jsonify({
                'success': False,
                'error': "XP to finish can only be set on your school's own quests.",
            }), 403
        # 0 and None both mean "no finish line"; store None so the completion
        # route's `if xp_threshold and xp_threshold > 0` reads it the same way
        # a quest that never had one does.
        admin.table('quests').update({'xp_threshold': xp_threshold or None}) \
            .eq('id', quest_id).execute()

    return jsonify({'success': True,
                    'due_date': row[0].get('due_date'),
                    'publish_at': row[0].get('publish_at'),
                    'xp_threshold': xp_threshold,
                    'students_enrolled': students_enrolled,
                    'students_hidden': students_hidden})


@bp.route('/classes/<class_id>/quests/<quest_id>/tasks/<task_id>/duplicate',
          methods=['POST'])
@require_auth
def duplicate_preset_task(user_id, class_id, quest_id, task_id):
    """Copy one preset task to the end of the same quest.

    The class-page twin of the curriculum route (routes/sis/curriculum.py); the
    two screens share one task editor, so a button that worked in the library
    and did nothing on a class would be the worse bug (iCreate, 2026-09-07:
    "I'd also like to be able to duplicate tasks").
    """
    class_row, admin, quest, err = _authorize_editable_quest(user_id, class_id, quest_id)
    if err:
        return err
    if _bad_uuid(task_id):
        return jsonify({'success': False, 'error': 'Invalid task id'}), 400

    rows = (admin.table('quest_template_tasks').select('*')
            .eq('id', task_id).eq('quest_id', quest_id).limit(1).execute()).data
    if not rows:
        return jsonify({'success': False, 'error': 'Task not found.'}), 404

    row = _duplicate_template_task(admin, rows[0], quest_id)
    if not row:
        return jsonify({'success': False, 'error': 'Could not duplicate the task.'}), 500

    # Same reason add_preset_task resyncs: a student's task list is a copy taken
    # at enrollment, so a task added later reaches nobody without this.
    try:
        from utils.template_tasks import resync_enrollments_to_template
        resync_enrollments_to_template(admin, quest_id)
    except Exception as e:  # noqa: BLE001 -- the duplicate itself succeeded
        logger.warning(f'Task duplicated but enrollment resync failed for {quest_id}: {e}')

    return jsonify({'success': True, 'task': _serialize_task(row)})


@bp.route('/classes/<class_id>/quests/<quest_id>/tasks/<task_id>', methods=['DELETE'])
@require_auth
def delete_preset_task(user_id, class_id, quest_id, task_id):
    class_row, admin, quest, err = _authorize_editable_quest(user_id, class_id, quest_id)
    if err:
        return err
    if _bad_uuid(task_id):
        return jsonify({'success': False, 'error': 'Invalid task id'}), 400
    admin.table('quest_template_tasks').delete() \
        .eq('id', task_id).eq('quest_id', quest_id).execute()

    # Same as add: carry the removal to enrolled students. resync deletes only
    # rows carrying no completion or evidence — a task somebody already worked
    # on stays put rather than cascading their work away.
    try:
        from utils.template_tasks import resync_enrollments_to_template
        resync_enrollments_to_template(admin, quest_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Task removed but enrollment resync failed for {quest_id}: {e}')

    return jsonify({'success': True})


# ── Student progress ──────────────────────────────────────────────────────────

def _is_done(user_quest, done, total):
    """Is this student finished with this quest, as a teacher means it?

    The rule itself moved to utils/quest_completion.py when the weekly parent
    digest needed it: a digest that counted late work differently from this
    grid would tell a family something their teacher's screen contradicts.
    Read the docstring there — it carries the postmortem.
    """
    return is_quest_done(user_quest, done, total)


@bp.route('/internal/publish-class-quests', methods=['POST'])
def publish_class_quests_sweep():
    """Cron entrypoint: enroll students in class quests whose publish time passed.

    Assigning a quest enrolls the class, but a quest scheduled for LATER
    deliberately doesn't -- so this is what enrolls it when its time arrives.
    Without it a scheduled quest would never reach anyone, now that the
    dashboard's separate "assigned to you" tray is gone.

    Auth via X-Cron-Secret, or a signed-in superadmin for manual triggering --
    mirrors /api/sis/internal/engagement-sweep exactly. Idempotent, so running it
    every cycle is safe.
    """
    secret = request.headers.get('X-Cron-Secret')
    from utils.cron_auth import is_valid_cron_secret
    if not is_valid_cron_secret(secret):
        from utils.session_manager import session_manager
        uid = session_manager.get_effective_user_id()
        is_super = False
        if uid:
            # admin client justified: superadmin check for the manual trigger of a cron-only sweep; the role lookup IS the access check
            row = (get_supabase_admin_client().table('users').select('role')
                   .eq('id', uid).limit(1).execute()).data
            is_super = bool(row and row[0].get('role') == 'superadmin')
        if not is_super:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    # admin client justified: publishes due class quests across the org on a
    #   schedule, with no caller session
    return jsonify({'success': True, **publish_due_class_quests(get_supabase_admin_client())})
