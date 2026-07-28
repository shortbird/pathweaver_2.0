"""
SIS staff training — the org's training quests for its own teachers.

iCreate wanted teacher training as quests rather than a separate video system:
an onboarding walkthrough, plus optional themed courses ("Classroom
Management", "Whole Brain Learning") that uplevel teaching. Rather than build a
parallel content system, this marks existing quests as staff training and reads
completion back from the ordinary quest tables — so training content is authored
in the normal curriculum editor, videos and all.

A teacher completing training is a learner like any other: they enrol in the
quest and finish its tasks in the learning app. This module only answers "which
quests are training, and how far has each teacher got".

NEW, additive (/api/sis/training). Admin manages the catalog; teachers read
their own progress.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from utils.validation import validate_uuid
from services import sis_service
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_staff_training', __name__, url_prefix='/api/sis')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')
ADMIN_ROLES = ('org_admin', 'superadmin')


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


def _catalog(org_id):
    """The org's training quests, newest config first, with quest titles."""
    rows = (_admin().table('sis_staff_training')
            .select('id, quest_id, category, is_required, sequence_order, '
                    'quests(id, title, description, is_active)')
            .eq('organization_id', org_id).order('sequence_order').execute()).data or []
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
    """The training catalog, plus the caller's own progress through it."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    catalog = _catalog(org_id)
    progress = _progress_for([user_id], [c['quest_id'] for c in catalog])
    for c in catalog:
        c['my_progress'] = progress.get((user_id, c['quest_id']), dict(_NOT_STARTED))
    return jsonify({'success': True, 'training': catalog})


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
    already = {r['quest_id'] for r in (admin.table('sis_staff_training')
               .select('quest_id').eq('organization_id', org_id).execute()).data or []}
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

    last = (_admin().table('sis_staff_training').select('sequence_order')
            .eq('organization_id', org_id).order('sequence_order', desc=True)
            .limit(1).execute()).data
    row = (_admin().table('sis_staff_training').upsert({
        'organization_id': org_id,
        'quest_id': quest_id,
        'category': (data.get('category') or '').strip() or None,
        'is_required': bool(data.get('is_required')),
        'sequence_order': ((last[0]['sequence_order'] or 0) + 1) if last else 0,
        'created_by': user_id,
    }, on_conflict='organization_id,quest_id').execute()).data
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
    """Every staff member against every training item — the completion record
    an accreditor or UFA would ask for."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    catalog = _catalog(org_id)
    staff = sis_service.list_org_staff(org_id)
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
                    'required_total': required_total})
