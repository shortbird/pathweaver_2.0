"""
Org quest groups — named subcategories of an organization's quests used for
batch assignment (e.g. "Ages 5-7 pins", "STEM pins"). A quest can belong to
any number of groups.

Managed from the organization quest board; consumed by assignment UIs (e.g.
the Treehouse facilitator Assign tab) to select a whole group at once.

Tables: org_quest_groups, org_quest_group_items (see
supabase/migrations/20260707_org_quest_groups.sql).
"""

from flask import Blueprint, request, jsonify

from database import get_supabase_admin_client
from utils.auth.decorators import require_auth, validate_uuid_param
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('quest_groups', __name__, url_prefix='/api/organizations')


def _org_access(user_id, org_id):
    """
    Caller may manage this org's quest groups: superadmin, or an org_admin /
    advisor belonging to the org.
    """
    admin = get_supabase_admin_client()
    u = admin.table('users').select('role, org_role, org_roles, organization_id')\
        .eq('id', user_id).limit(1).execute()
    user = u.data[0] if u.data else None
    if not user:
        return False
    if user.get('role') == 'superadmin':
        return True
    roles = set()
    if user.get('org_role'):
        roles.add(user['org_role'])
    if isinstance(user.get('org_roles'), list):
        roles.update(user['org_roles'])
    return user.get('organization_id') == org_id and bool(roles & {'org_admin', 'advisor'})


def _get_group_in_org(admin, group_id, org_id):
    res = admin.table('org_quest_groups').select('id, organization_id, name')\
        .eq('id', group_id).limit(1).execute()
    group = res.data[0] if res.data else None
    if not group or group.get('organization_id') != org_id:
        return None
    return group


@bp.route('/<org_id>/quest-groups', methods=['GET'])
@require_auth
@validate_uuid_param('org_id')
def list_groups(user_id, org_id):
    """List the org's quest groups with their quest ids."""
    if not _org_access(user_id, org_id):
        return jsonify({'success': False, 'error': 'Organization access required'}), 403
    admin = get_supabase_admin_client()
    groups = (admin.table('org_quest_groups').select('id, name, created_at')
              .eq('organization_id', org_id).order('name').execute()).data or []
    group_ids = [g['id'] for g in groups]
    items = []
    if group_ids:
        items = (admin.table('org_quest_group_items').select('group_id, quest_id')
                 .in_('group_id', group_ids).execute()).data or []
    by_group = {}
    for it in items:
        by_group.setdefault(it['group_id'], []).append(it['quest_id'])
    for g in groups:
        g['quest_ids'] = by_group.get(g['id'], [])
    return jsonify({'success': True, 'groups': groups}), 200


@bp.route('/<org_id>/quest-groups', methods=['POST'])
@require_auth
@validate_uuid_param('org_id')
def create_group(user_id, org_id):
    if not _org_access(user_id, org_id):
        return jsonify({'success': False, 'error': 'Organization access required'}), 403
    name = ((request.get_json() or {}).get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'name is required'}), 400
    admin = get_supabase_admin_client()
    existing = (admin.table('org_quest_groups').select('id')
                .eq('organization_id', org_id).eq('name', name).limit(1).execute())
    if existing.data:
        return jsonify({'success': False, 'error': 'A group with that name already exists'}), 409
    res = admin.table('org_quest_groups').insert({
        'organization_id': org_id, 'name': name, 'created_by': user_id,
    }).execute()
    group = res.data[0] if res.data else None
    if group:
        group['quest_ids'] = []
    return jsonify({'success': True, 'group': group}), 201


@bp.route('/<org_id>/quest-groups/<group_id>', methods=['PATCH'])
@require_auth
@validate_uuid_param('org_id')
@validate_uuid_param('group_id')
def rename_group(user_id, org_id, group_id):
    if not _org_access(user_id, org_id):
        return jsonify({'success': False, 'error': 'Organization access required'}), 403
    admin = get_supabase_admin_client()
    if not _get_group_in_org(admin, group_id, org_id):
        return jsonify({'success': False, 'error': 'Group not found'}), 404
    name = ((request.get_json() or {}).get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'name is required'}), 400
    res = admin.table('org_quest_groups').update({'name': name}).eq('id', group_id).execute()
    return jsonify({'success': True, 'group': res.data[0] if res.data else None}), 200


@bp.route('/<org_id>/quest-groups/<group_id>', methods=['DELETE'])
@require_auth
@validate_uuid_param('org_id')
@validate_uuid_param('group_id')
def delete_group(user_id, org_id, group_id):
    """Delete a group (its items cascade). The quests themselves are untouched."""
    if not _org_access(user_id, org_id):
        return jsonify({'success': False, 'error': 'Organization access required'}), 403
    admin = get_supabase_admin_client()
    if not _get_group_in_org(admin, group_id, org_id):
        return jsonify({'success': False, 'error': 'Group not found'}), 404
    admin.table('org_quest_groups').delete().eq('id', group_id).execute()
    return jsonify({'success': True}), 200


@bp.route('/<org_id>/quest-groups/<group_id>/quests', methods=['PUT'])
@require_auth
@validate_uuid_param('org_id')
@validate_uuid_param('group_id')
def set_group_quests(user_id, org_id, group_id):
    """Replace the group's quest membership with the given quest_ids (org quests only)."""
    if not _org_access(user_id, org_id):
        return jsonify({'success': False, 'error': 'Organization access required'}), 403
    admin = get_supabase_admin_client()
    if not _get_group_in_org(admin, group_id, org_id):
        return jsonify({'success': False, 'error': 'Group not found'}), 404
    quest_ids = (request.get_json() or {}).get('quest_ids')
    if not isinstance(quest_ids, list):
        return jsonify({'success': False, 'error': 'quest_ids must be an array'}), 400

    valid_ids = []
    if quest_ids:
        res = (admin.table('quests').select('id')
               .eq('organization_id', org_id).in_('id', quest_ids).execute())
        valid_ids = [r['id'] for r in (res.data or [])]

    admin.table('org_quest_group_items').delete().eq('group_id', group_id).execute()
    if valid_ids:
        admin.table('org_quest_group_items').insert([
            {'group_id': group_id, 'quest_id': qid} for qid in valid_ids
        ]).execute()
    return jsonify({'success': True, 'quest_ids': valid_ids}), 200
