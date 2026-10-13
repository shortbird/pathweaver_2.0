"""
A family group's dashboard (/family-groups/<id> on the web platform), for the
person outside the school who runs the group: OpenEd's enrollment lead for the
OpenEd families at Optio Academy. The rules are in
services/family_group_dashboard.py.

Every route is require_auth plus require_manager: a family_group_managers row
for this group, or superadmin. No SIS role and no module gate applies, because
the manager is not a member of the school. A group the caller cannot run
answers 404 like one that does not exist.
"""
from flask import Blueprint, jsonify, request

from middleware.rate_limiter import rate_limit
from services import family_group_dashboard as dashboard
from utils.auth.decorators import require_auth
from utils.validation import validate_uuid

bp = Blueprint('family_group_dashboard', __name__, url_prefix='/api/family-groups')


def _refusal(e):
    return jsonify({'success': False, 'error': str(e)}), e.status


def _managed(user_id, group_id):
    if not validate_uuid(group_id)[0]:
        raise dashboard.DashboardError('Group not found', 404)
    return dashboard.require_manager(user_id, group_id)


@bp.route('/mine', methods=['GET'])
@require_auth
def my_groups(user_id):
    return jsonify({'success': True, 'groups': dashboard.managed_groups(user_id)})


@bp.route('/<group_id>/students', methods=['GET'])
@require_auth
def group_students(user_id, group_id):
    try:
        group = _managed(user_id, group_id)
    except dashboard.DashboardError as e:
        return _refusal(e)
    return jsonify({'success': True,
                    'group': {'id': group['id'], 'name': group['name'],
                              'school_name': dashboard._org_name(group['organization_id'])},
                    **dashboard.roster(group)})


@bp.route('/<group_id>/roster-import/preview', methods=['POST'])
@require_auth
@rate_limit(max_requests=30, window_seconds=300)
def preview_import(user_id, group_id):
    try:
        group = _managed(user_id, group_id)
        plan = dashboard.plan_import(group, (request.get_json(silent=True) or {}).get('csv'))
    except dashboard.DashboardError as e:
        return _refusal(e)
    return jsonify({'success': True, 'can_import': not plan['row_errors'], **plan})


@bp.route('/<group_id>/roster-import/commit', methods=['POST'])
@require_auth
@rate_limit(max_requests=5, window_seconds=300)
def commit_import(user_id, group_id):
    body = request.get_json(silent=True) or {}
    try:
        group = _managed(user_id, group_id)
        plan = dashboard.plan_import(group, body.get('csv'))
    except dashboard.DashboardError as e:
        return _refusal(e)
    if plan['row_errors']:
        return jsonify({'success': False, 'error': 'Fix the invalid rows before importing',
                        'row_errors': plan['row_errors']}), 400
    outcome = dashboard.commit_import(group, plan, user_id, send_emails=body.get('send_emails') is True)
    return jsonify({'success': True, **outcome})


@bp.route('/<group_id>/students/<student_id>/drop', methods=['POST'])
@require_auth
def drop_student(user_id, group_id, student_id):
    return _set_dropped(user_id, group_id, student_id, True)


@bp.route('/<group_id>/students/<student_id>/reenroll', methods=['POST'])
@require_auth
def reenroll_student(user_id, group_id, student_id):
    return _set_dropped(user_id, group_id, student_id, False)


@bp.route('/<group_id>/students/<student_id>/credits', methods=['POST'])
@require_auth
@rate_limit(max_requests=60, window_seconds=300)
def add_student_credits(user_id, group_id, student_id):
    """Bank credits from an order: {credits, kind: accelerated|adjustment,
    order_reference, note}. Answers the student's new balance."""
    if not validate_uuid(student_id)[0]:
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    try:
        group = _managed(user_id, group_id)
        balance = dashboard.add_credits(group, student_id, request.get_json(silent=True) or {}, user_id)
    except dashboard.DashboardError as e:
        return _refusal(e)
    return jsonify({'success': True, 'credits': balance})


def _set_dropped(user_id, group_id, student_id, dropped):
    if not validate_uuid(student_id)[0]:
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    try:
        group = _managed(user_id, group_id)
        result = dashboard.set_dropped(group, student_id, dropped, user_id)
    except dashboard.DashboardError as e:
        return _refusal(e)
    return jsonify({'success': True, **result})
