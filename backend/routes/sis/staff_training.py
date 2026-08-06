"""
SIS school quests — the quests a school sets for its own teachers and families.

iCreate wanted teacher training as quests rather than a separate video system:
an onboarding walkthrough, plus optional themed courses ("Classroom
Management", "Whole Brain Learning") that uplevel teaching. Rather than build a
parallel content system, this marks existing quests as school-set and reads
completion back from the ordinary quest tables — so the content is authored in
the normal curriculum editor, videos and all.

Two audiences, one catalog (`audience`, added 2026-08-06):
  staff   the original meaning — training for teachers.
  family  quests for GUARDIANS, on their own accounts. iCreate, 2026-08-06:
          "back to school night with families will be a quest." A parent
          completes it themselves; it is not their child's work.

Anyone completing one is a learner like any other: they enrol in the quest and
finish its tasks in the web platform. This module only answers "which quests has
the school set, for whom, and how far has each person got".

NEW, additive (/api/sis/training). Admin manages the catalog; teachers read their
own progress here, and guardians read theirs through /api/sis/parent/quests.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from utils.validation import validate_uuid
from services import sis_service
from database import get_supabase_admin_client
from utils.sis_roles import STAFF_ROLES, ADMIN_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_staff_training', __name__, url_prefix='/api/sis')


def _admin():
    return get_supabase_admin_client()


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    requested = request.args.get('organization_id') or body.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


def _bad_uuid(*values):
    for v in values:
        ok, _ = validate_uuid(v)
        if not ok:
            return True
    return False


AUDIENCES = ('staff', 'family')


def _audience(value):
    """Normalise an audience, defaulting to the original 'staff' meaning."""
    v = (str(value or '').strip().lower())
    return v if v in AUDIENCES else 'staff'


def _catalog(org_id, audience='staff'):
    """The org's quests for one audience, in order, with quest titles."""
    rows = (_admin().table('sis_staff_training')
            .select('id, quest_id, category, is_required, sequence_order, audience, '
                    'quests(id, title, description, is_active)')
            .eq('organization_id', org_id).eq('audience', _audience(audience))
            .order('sequence_order').execute()).data or []
    out = []
    for r in rows:
        q = r.get('quests') or {}
        # A quest deleted or deactivated out from under the catalog shouldn't
        # show up as a broken training item.
        if not q.get('is_active'):
            continue
        out.append({
            'id': r['id'],
            'quest_id': r['quest_id'],
            'title': q.get('title') or 'Untitled',
            'description': q.get('description'),
            'category': r.get('category'),
            'is_required': bool(r.get('is_required')),
            'sequence_order': r.get('sequence_order') or 0,
            'audience': _audience(r.get('audience')),
        })
    return out


def _progress_for(user_ids, quest_ids):
    """{(user_id, quest_id): {started, completed, done, total}} from the normal
    quest tables — the same records that drive a learner's own dashboard."""
    if not user_ids or not quest_ids:
        return {}
    admin = _admin()
    user_quests = (admin.table('user_quests')
                   .select('id, user_id, quest_id, completed_at, started_at')
                   .in_('user_id', user_ids).in_('quest_id', quest_ids).execute()).data or []
    uq_ids = [uq['id'] for uq in user_quests]
    tasks = []
    if uq_ids:
        tasks = (admin.table('user_quest_tasks').select('id, user_quest_id')
                 .in_('user_quest_id', uq_ids).execute()).data or []
    done_ids = set()
    task_ids = [t['id'] for t in tasks]
    for i in range(0, len(task_ids), 200):
        rows = (admin.table('quest_task_completions').select('task_id')
                .in_('task_id', task_ids[i:i + 200]).execute()).data or []
        done_ids.update(r['task_id'] for r in rows)
    by_uq = {}
    for t in tasks:
        by_uq.setdefault(t['user_quest_id'], []).append(t)
    out = {}
    for uq in user_quests:
        own = by_uq.get(uq['id'], [])
        out[(uq['user_id'], uq['quest_id'])] = {
            'started': True,
            'completed': bool(uq.get('completed_at')),
            'done': len([t for t in own if t['id'] in done_ids]),
            'total': len(own),
        }
    return out


_NOT_STARTED = {'started': False, 'completed': False, 'done': 0, 'total': 0}


# ── Catalog ───────────────────────────────────────────────────────────────────

@bp.route('/training', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_training(user_id):
    """The catalog for one audience, plus the caller's own progress through it.

    Defaults to 'staff' so a teacher opening their training page sees exactly
    what they saw before the family audience existed.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    audience = _audience(request.args.get('audience'))
    catalog = _catalog(org_id, audience)
    progress = _progress_for([user_id], [c['quest_id'] for c in catalog])
    for c in catalog:
        c['my_progress'] = progress.get((user_id, c['quest_id']), dict(_NOT_STARTED))
    return jsonify({'success': True, 'training': catalog, 'audience': audience})


@bp.route('/training/assignable-quests', methods=['GET'])
@require_role(*ADMIN_ROLES)
def assignable_training_quests(user_id):
    """Quests that could become training: the school's own, plus the public
    Optio library. Mirrors the class-quest picker, minus anything already on
    the catalog."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    admin = _admin()
    # Scoped to the audience being edited: a quest already set for teachers is
    # still a fair choice for families (a school-values quest everyone does).
    audience = _audience(request.args.get('audience'))
    already = {r['quest_id'] for r in (admin.table('sis_staff_training')
               .select('quest_id').eq('organization_id', org_id)
               .eq('audience', audience).execute()).data or []}
    search = (request.args.get('search') or '').strip()

    def _q(base):
        if search:
            base = base.ilike('title', f'%{search}%')
        return base.limit(100).execute().data or []

    org_quests = _q(admin.table('quests').select('id, title, organization_id')
                    .eq('organization_id', org_id).eq('is_active', True))
    lib_quests = _q(admin.table('quests').select('id, title, organization_id')
                    .is_('organization_id', 'null').eq('is_active', True).eq('is_public', True))

    out, seen = [], set()
    for source, rows in (('organization', org_quests), ('library', lib_quests)):
        for q in rows:
            if q['id'] in seen or q['id'] in already:
                continue
            seen.add(q['id'])
            out.append({'quest_id': q['id'], 'title': q.get('title'), 'source': source})
    return jsonify({'success': True, 'quests': out})


@bp.route('/training', methods=['POST'])
@require_role(*ADMIN_ROLES)
def add_training(user_id):
    """Mark one of the org's quests as staff training."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    quest_id = (data.get('quest_id') or '').strip()
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Invalid quest id'}), 400
    quest = (_admin().table('quests').select('id, organization_id, is_public, is_active')
             .eq('id', quest_id).limit(1).execute()).data
    quest = quest[0] if quest else None
    # Same rule as class quests: the org's own quests, or the public library.
    if not quest or not (quest.get('organization_id') == org_id
                         or (quest.get('organization_id') is None and quest.get('is_public'))):
        return jsonify({'success': False, 'error': 'That quest is not available'}), 404

    audience = _audience(data.get('audience'))
    last = (_admin().table('sis_staff_training').select('sequence_order')
            .eq('organization_id', org_id).eq('audience', audience)
            .order('sequence_order', desc=True).limit(1).execute()).data
    row = (_admin().table('sis_staff_training').upsert({
        'organization_id': org_id,
        'quest_id': quest_id,
        'audience': audience,
        'category': (data.get('category') or '').strip() or None,
        'is_required': bool(data.get('is_required')),
        'sequence_order': ((last[0]['sequence_order'] or 0) + 1) if last else 0,
        'created_by': user_id,
    }, on_conflict='organization_id,quest_id,audience').execute()).data
    return jsonify({'success': True, 'training': row[0] if row else None}), 201


@bp.route('/training/<training_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_training(user_id, training_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(training_id):
        return jsonify({'success': False, 'error': 'Invalid id'}), 400
    owned = (_admin().table('sis_staff_training').select('id, organization_id')
             .eq('id', training_id).limit(1).execute()).data
    if not owned or owned[0].get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    data = request.get_json(silent=True) or {}
    fields = {}
    if 'category' in data:
        fields['category'] = (data.get('category') or '').strip() or None
    if 'is_required' in data:
        fields['is_required'] = bool(data.get('is_required'))
    if 'sequence_order' in data:
        try:
            fields['sequence_order'] = int(data.get('sequence_order'))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'sequence_order must be a number'}), 400
    if not fields:
        return jsonify({'success': False, 'error': 'Nothing to update'}), 400
    _admin().table('sis_staff_training').update(fields).eq('id', training_id).execute()
    return jsonify({'success': True})


@bp.route('/training/<training_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def remove_training(user_id, training_id):
    """Take a quest off the training catalog. The quest itself is untouched, and
    so is any progress teachers already made on it."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(training_id):
        return jsonify({'success': False, 'error': 'Invalid id'}), 400
    owned = (_admin().table('sis_staff_training').select('id, organization_id')
             .eq('id', training_id).limit(1).execute()).data
    if not owned or owned[0].get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    _admin().table('sis_staff_training').delete().eq('id', training_id).execute()
    return jsonify({'success': True})


# ── Who has done what ─────────────────────────────────────────────────────────

@bp.route('/training/progress', methods=['GET'])
@require_role(*ADMIN_ROLES)
def training_progress(user_id):
    """Everyone in the audience against every quest set for them — the
    completion record an accreditor or UFA would ask for, and for families the
    answer to "who still hasn't done back to school night".
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    audience = _audience(request.args.get('audience'))
    catalog = _catalog(org_id, audience)
    staff = (_guardians(org_id) if audience == 'family'
             else sis_service.list_org_staff(org_id))
    quest_ids = [c['quest_id'] for c in catalog]
    progress = _progress_for([s['id'] for s in staff], quest_ids)

    rows = []
    for s in staff:
        cells = [{'quest_id': c['quest_id'],
                  **progress.get((s['id'], c['quest_id']), dict(_NOT_STARTED))}
                 for c in catalog]
        required_done = len([c for c, cell in zip(catalog, cells)
                             if c['is_required'] and cell['completed']])
        rows.append({
            'user_id': s['id'], 'name': s['name'], 'cells': cells,
            'completed': len([c for c in cells if c['completed']]),
            'required_completed': required_done,
        })
    required_total = len([c for c in catalog if c['is_required']])
    return jsonify({'success': True, 'training': catalog, 'staff': rows,
                    'audience': audience, 'required_total': required_total})


def _guardians(org_id):
    """The org's guardians, shaped like list_org_staff so the report is one code
    path for both audiences."""
    from utils.db_fetch import fetch_all_rows
    rows = fetch_all_rows(lambda: (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, email, org_role, role')
        .eq('organization_id', org_id)
    ))
    out = [{
        'id': u['id'],
        'name': (u.get('display_name')
                 or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
                 or u.get('email') or 'Unnamed'),
    } for u in rows if 'parent' in (u.get('org_role'), u.get('role'))]
    out.sort(key=lambda p: (p['name'] or '').lower())
    return out
