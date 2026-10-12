"""
Family groups: a school's own named cohorts of families ("OpenEd" at Optio
Academy). The work is in services/sis_family_groups.py; a group is a label on
the household, and says nothing about who pays (that is funding_source).

Every route is ADMIN_ROLES and scoped to the caller's org; a household id in
the path is checked to belong to that org before anything is written.
"""
from flask import Blueprint, jsonify, request

from database import get_supabase_admin_client
from repositories.household_repository import HouseholdRepository
from services import sis_family_groups, sis_service
from modules.gate import module_guard
from utils.auth.decorators import require_role
from utils.sis_roles import ADMIN_ROLES

bp = Blueprint('sis_family_groups', __name__, url_prefix='/api/sis')
# Registered from routes/__init__.py (like people_removal), so it carries its
# own module gate: the SIS core, the same as the households routes.
module_guard(bp, 'sis')


def _group_refusal(e):
    return jsonify({'success': False, 'error': str(e)}), e.status


@bp.route('/family-groups', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_family_groups(user_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'groups': sis_family_groups.list_groups(org_id)})


@bp.route('/family-groups', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_family_group(user_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    try:
        group = sis_family_groups.create_group(org_id, (request.json or {}).get('name'), user_id)
    except sis_family_groups.GroupError as e:
        return _group_refusal(e)
    return jsonify({'success': True, 'group': group}), 201


@bp.route('/family-groups/<group_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def rename_family_group(user_id, group_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    try:
        group = sis_family_groups.rename_group(org_id, group_id, (request.json or {}).get('name'))
    except sis_family_groups.GroupError as e:
        return _group_refusal(e)
    return jsonify({'success': True, 'group': group})


@bp.route('/family-groups/<group_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_family_group(user_id, group_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    try:
        sis_family_groups.delete_group(org_id, group_id)
    except sis_family_groups.GroupError as e:
        return _group_refusal(e)
    return jsonify({'success': True})


@bp.route('/households/<household_id>/groups', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def set_household_groups(user_id, household_id):
    """Make this family's groups exactly the ids sent."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    # admin client justified: household org check for a group write; gated by @require_role(ADMIN_ROLES)
    existing = HouseholdRepository(client=get_supabase_admin_client()).find_by_id(household_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Household not found'}), 404
    group_ids = (request.json or {}).get('group_ids')
    if not isinstance(group_ids, list):
        return jsonify({'success': False, 'error': 'group_ids must be a list'}), 400
    try:
        groups = sis_family_groups.set_household_groups(org_id, household_id, group_ids, user_id)
    except sis_family_groups.GroupError as e:
        return _group_refusal(e)
    return jsonify({'success': True, 'groups': groups})
