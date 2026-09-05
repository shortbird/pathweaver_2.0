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

SAFETY: template-task authoring is allowed ONLY on quests owned by the class's
organization. Global/Optio-library quests are assigned as-is and their tasks are
never edited here — editing quest_template_tasks on a shared quest would change
it for every user of that quest.

All DB access uses the service-role admin client; authorization is enforced in
Python above every read/write.
"""


from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from utils.auth.relationships import require_relationship_to
from utils.logger import get_logger
from utils.validation import validate_uuid
from services import sis_service
from services.sis_quest_authoring import (
    QuestAuthoringError,
    clean_task as _clean_task,
    create_org_quest,
    norm_pillar as _norm_pillar,
)
from services.sis_curriculum_sync import assignable_quest_ids
from services.class_quest_enrollment import (
    enroll_class_in_quests,
    enroll_safe,
    publish_due_class_quests,
)
from database import get_supabase_admin_client

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
    }


# ── Assigned quests ───────────────────────────────────────────────────────────

@bp.route('/classes/<class_id>/quests', methods=['GET'])
@require_auth
def list_class_quests(user_id, class_id):
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    rows = (admin.table('class_quests')
            .select('id, quest_id, sequence_order, publish_at, due_date, '
                    'quests(id, title, description, quest_type, is_active, '
                    'organization_id, xp_threshold)')
            .eq('class_id', class_row['id']).order('sequence_order').execute()).data or []
    quest_ids = [r['quest_id'] for r in rows]
    counts = _template_task_count(admin, quest_ids)
    org_id = class_row['organization_id']
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
            'template_task_count': counts.get(r['quest_id'], 0),
            # The XP a student has to earn before the quest counts as finished.
            # On the quest, not the class link: it is a property of the work.
            'xp_threshold': q.get('xp_threshold') or 0,
            # Only the org's own quests may have their preset tasks edited here.
            'editable_tasks': q.get('organization_id') == org_id,
        })
    return jsonify({'success': True, 'quests': out})


@bp.route('/classes/<class_id>/assignable-quests', methods=['GET'])
@require_auth
def assignable_quests(user_id, class_id):
    """Quests a teacher can assign: the school's own quests + the Optio library."""
    class_row, admin, err = _authorize(user_id, class_id)
    if err:
        return err
    org_id = class_row['organization_id']
    search = (request.args.get('search') or '').strip()
    limit = min(int(request.args.get('limit', 40) or 40), 100)

    already = {r['quest_id'] for r in (admin.table('class_quests').select('quest_id')
               .eq('class_id', class_row['id']).execute()).data or []}

    def _q(base):
        if search:
            base = base.ilike('title', f'%{search}%')
        return base.limit(limit).execute().data or []

    org_quests = _q(admin.table('quests')
                    .select('id, title, description, quest_type, organization_id')
                    .eq('organization_id', org_id).eq('is_active', True))
    lib_quests = _q(admin.table('quests')
                    .select('id, title, description, quest_type, organization_id')
                    .is_('organization_id', 'null').eq('is_active', True).eq('is_public', True))

    merged = []
    seen = set()
    for source, rows in (('organization', org_quests), ('library', lib_quests)):
        for q in rows:
            if q['id'] in seen or q['id'] in already:
                continue
            seen.add(q['id'])
            merged.append({
                'quest_id': q['id'],
                'title': q.get('title'),
                'description': q.get('description'),
                'quest_type': q.get('quest_type'),
                'source': source,
                'editable_tasks': q.get('organization_id') == org_id,
            })
    counts = _template_task_count(admin, [q['quest_id'] for q in merged])
    for q in merged:
        q['template_task_count'] = counts.get(q['quest_id'], 0)
    return jsonify({'success': True, 'quests': merged})


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

    existing = (admin.table('class_quests').select('sequence_order')
                .eq('class_id', class_row['id']).order('sequence_order', desc=True)
                .limit(1).execute()).data
    next_order = ((existing[0]['sequence_order'] or 0) + 1) if existing else 0
    admin.table('class_quests').upsert({
        'class_id': class_row['id'], 'quest_id': quest_id,
        'added_by': user_id, 'sequence_order': next_order,
    }, on_conflict='class_id,quest_id').execute()
    _attach_quest_to_class_curricula(admin, class_row['id'], quest_id, user_id)
    # An assigned quest is a quest: enroll the class so it lands in each
    # student's account like any other, not in a separate "assigned" tray.
    enrolled = enroll_safe(enroll_class_in_quests, admin, class_row['id'], [quest_id])
    return jsonify({'success': True, 'students_enrolled': enrolled['enrolled']})


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

    existing = (admin.table('class_quests').select('sequence_order')
                .eq('class_id', class_row['id']).order('sequence_order', desc=True)
                .limit(1).execute()).data
    next_order = ((existing[0]['sequence_order'] or 0) + 1) if existing else 0
    admin.table('class_quests').upsert({
        'class_id': class_row['id'], 'quest_id': quest_id,
        'added_by': user_id, 'sequence_order': next_order,
    }, on_conflict='class_id,quest_id').execute()
    _attach_quest_to_class_curricula(admin, class_row['id'], quest_id, user_id)
    enrolled = enroll_safe(enroll_class_in_quests, admin, class_row['id'], [quest_id])

    return jsonify({'success': True, 'quest_id': quest_id, 'task_count': created['task_count'],
                    'students_enrolled': enrolled['enrolled']})


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
    if not updates:
        return jsonify({'success': False, 'error': 'Nothing to update.'}), 400

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
        if field in data:
            value = data.get(field)
            updates[field] = (str(value).strip() or None) if value else None

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

    link = (admin.table('class_quests').select('id')
            .eq('class_id', class_id).eq('quest_id', quest_id).limit(1).execute()).data
    if not link:
        return jsonify({'success': False, 'error': 'That quest is not on this class.'}), 404

    row = [{}]
    if updates:
        # No updated_at here: class_quests doesn't have that column (only added_at),
        # and PostgREST rejects the whole PATCH over it (Sentry OPTIO-BACKEND-7B/7C).
        row = (admin.table('class_quests').update(updates)
               .eq('class_id', class_id).eq('quest_id', quest_id).execute()).data
        if not row:
            return jsonify({'success': False, 'error': 'That quest is not on this class.'}), 404

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
                    'xp_threshold': xp_threshold})


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

    `user_quests.completed_at` is NOT the answer on its own. Nothing on the
    platform sets it automatically: finishing the last task only makes the
    student's own app offer a celebration modal, and ending the quest there is
    the student's choice — they are equally free to keep it open and add more
    tasks ("The Process Is The Goal"). A student who finishes everything and
    dismisses that modal leaves completed_at NULL forever.

    Read literally, that left this grid saying "1/1" in amber for work that was
    checked off everywhere else on the platform (Gryffin, 2026-09-02: "why
    Presley's reading appreciation task doesn't say 'done' in the progress, but
    is checked off everywhere else"). 35 enrollments across 7 orgs were in that
    state. A teacher asking "is this student done" means every assigned task is
    turned in, so answer that question instead.
    """
    return bool(user_quest and user_quest.get('completed_at')) or (total > 0 and done >= total)


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
                .select('quest_id, sequence_order, due_date, quests(id, title)')
                .eq('class_id', class_row['id']).order('sequence_order').execute()).data or []
    quests = [{
        'quest_id': r['quest_id'],
        'title': (r.get('quests') or {}).get('title') or 'Untitled quest',
        'due_date': r.get('due_date'),
    } for r in assigned]
    quest_ids = [q['quest_id'] for q in quests]

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
        tasks = (admin.table('user_quest_tasks')
                 .select('id, user_quest_id, user_id, quest_id, title, xp_value')
                 .in_('user_quest_id', uq_ids).execute()).data or []
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
            uq = uq_by_student_quest.get((sid, q['quest_id']))
            if not uq:
                cells.append({'quest_id': q['quest_id'], 'started': False,
                              'completed': False, 'done': 0, 'total': 0})
                continue
            own = tasks_by_uq.get(uq['id'], [])
            done = len([t for t in own if t['id'] in done_task_ids])
            total_done += done
            total_tasks += len(own)
            cells.append({
                'quest_id': q['quest_id'],
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
             .select('quest_id, due_date, quests(title)')
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
                 .select('id, user_quest_id, title, xp_value, order_index')
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
            'started': bool(uq),
            'completed': _is_done(uq, len([t for t in own if t['id'] in done_ids]), len(own)),
            'tasks': [{
                'id': t['id'],
                'title': t.get('title'),
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
        if q['completed']:
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
