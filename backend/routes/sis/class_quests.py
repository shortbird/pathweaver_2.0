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
Students never reach these endpoints; they see assigned quests through the
existing dashboard "assigned to you" surface and self-start them, at which point
the quest's template tasks are copied into their user_quest_tasks (unchanged
enrollment flow).

SAFETY: template-task authoring is allowed ONLY on quests owned by the class's
organization. Global/Optio-library quests are assigned as-is and their tasks are
never edited here — editing quest_template_tasks on a shared quest would change
it for every user of that quest.

All DB access uses the service-role admin client; authorization is enforced in
Python above every read/write.
"""

import uuid as _uuid
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from utils.logger import get_logger
from utils.validation import validate_uuid
from services import sis_service
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_class_quests', __name__, url_prefix='/api/sis')

_MAX_TITLE_LEN = 300
_MAX_TASKS = 40
# Canonical DB pillar keys (what quest_template_tasks.pillar / user_quest_tasks.pillar
# actually store), with friendly aliases the client may send.
_PILLAR_ALIASES = {
    'art': 'art', 'creativity': 'art', 'arts_creativity': 'art',
    'stem': 'stem', 'critical_thinking': 'stem',
    'communication': 'communication',
    'wellness': 'wellness', 'practical_skills': 'wellness',
    'civics': 'civics', 'cultural_literacy': 'civics',
}
_DEFAULT_PILLAR = 'art'
_DEFAULT_XP = 100
_MIN_XP = 25


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _bad_uuid(*values):
    for v in values:
        ok, _ = validate_uuid(v)
        if not ok:
            return True
    return False


def _norm_pillar(value):
    return _PILLAR_ALIASES.get((value or '').strip().lower(), _DEFAULT_PILLAR)


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


def _clean_task(raw, order_index):
    title = (raw.get('title') or '').strip()
    if not title:
        return None
    try:
        xp = int(raw.get('xp_value') or _DEFAULT_XP)
    except (TypeError, ValueError):
        xp = _DEFAULT_XP
    xp = max(_MIN_XP, xp)
    return {
        'title': title[:_MAX_TITLE_LEN],
        'description': (raw.get('description') or '').strip(),
        'pillar': _norm_pillar(raw.get('pillar')),
        'xp_value': xp,
        'is_required': bool(raw.get('is_required', True)),
        'order_index': order_index,
        'ai_generated': False,
        'created_at': _now_iso(),
        'updated_at': _now_iso(),
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
                    'quests(id, title, description, quest_type, is_active, organization_id)')
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
    return jsonify({'success': True})


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


def _assignable(admin, quest_ids, org_id):
    """Of `quest_ids`, the ones this org may actually assign — its own, plus the
    public Optio library. A curriculum can outlive a quest (deleted, archived, or
    a school-owned quest whose org changed), so the set is re-checked on every
    copy rather than trusted from when it was saved."""
    if not quest_ids:
        return []
    rows = (admin.table('quests')
            .select('id, organization_id, is_public, is_active')
            .in_('id', list(quest_ids)).execute()).data or []
    ok = set()
    for q in rows:
        if q.get('is_active') is False:
            continue
        if q.get('organization_id') == org_id or (
                q.get('organization_id') is None and q.get('is_public')):
            ok.add(q['id'])
    return [qid for qid in quest_ids if qid in ok]


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
    return jsonify({'success': True, 'added': len(rows),
                    'skipped_already_present': len(wanted) - len(rows),
                    'skipped_unavailable': len(saved) - len(wanted)})


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
    title = (data.get('title') or '').strip()
    description = (data.get('description') or '').strip()
    if not title:
        return jsonify({'success': False, 'error': 'A quest title is required.'}), 400
    if len(title) > _MAX_TITLE_LEN:
        return jsonify({'success': False, 'error': 'Title is too long.'}), 400

    raw_tasks = data.get('tasks') or []
    if len(raw_tasks) > _MAX_TASKS:
        return jsonify({'success': False, 'error': f'A quest can have at most {_MAX_TASKS} tasks.'}), 400

    org_id = class_row['organization_id']
    image_url = None
    try:
        from services.image_service import search_quest_image
        image_url = search_quest_image(title, description)
    except Exception as e:
        logger.warning(f'Class-quest image lookup failed (non-fatal): {e}')

    quest_row = admin.table('quests').insert({
        'title': title,
        'big_idea': description,
        'description': description,
        'is_v3': True,
        'is_active': True,
        'is_public': False,
        'quest_type': 'optio',
        'header_image_url': image_url,
        'image_url': image_url,
        'created_by': user_id,
        'created_at': _now_iso(),
        'organization_id': org_id,
    }).execute().data
    if not quest_row:
        return jsonify({'success': False, 'error': 'Could not create the quest.'}), 500
    quest_id = quest_row[0]['id']

    cleaned = [t for t in (_clean_task(r, i) for i, r in enumerate(raw_tasks)) if t]
    if cleaned:
        for t in cleaned:
            t['quest_id'] = quest_id
        admin.table('quest_template_tasks').insert(cleaned).execute()

    existing = (admin.table('class_quests').select('sequence_order')
                .eq('class_id', class_row['id']).order('sequence_order', desc=True)
                .limit(1).execute()).data
    next_order = ((existing[0]['sequence_order'] or 0) + 1) if existing else 0
    admin.table('class_quests').upsert({
        'class_id': class_row['id'], 'quest_id': quest_id,
        'added_by': user_id, 'sequence_order': next_order,
    }, on_conflict='class_id,quest_id').execute()

    return jsonify({'success': True, 'quest_id': quest_id, 'task_count': len(cleaned)})


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
    return jsonify({'success': True, 'task': _serialize_task(row[0])})


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
    return jsonify({'success': True})


# ── Student progress ──────────────────────────────────────────────────────────

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
                'completed': bool(uq.get('completed_at')),
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
