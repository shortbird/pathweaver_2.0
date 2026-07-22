"""
SIS staff-operations admin routes — employment profiles, duties, form review,
onboarding templates, timesheets, and the payroll CSV export.

ADMIN-ONLY (org_admin/superadmin): this is the employer side of the teacher
portal. Teachers reach their own slice via routes/sis/staff_portal.py.
"""

import csv
import io

from flask import Blueprint, request, jsonify, Response

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_staff_service as staff
from services import sis_forms_service as forms
from services import sis_onboarding_service as onboarding
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_staff_admin', __name__, url_prefix='/api/sis/staff-admin')

ADMIN_ROLES = ('org_admin', 'superadmin')


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


# ── Employment profiles ──────────────────────────────────────────────────────

@bp.route('/profiles/<staff_id>', methods=['GET'])
@require_role(*ADMIN_ROLES)
def get_profile(user_id, staff_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True,
                    'profile': staff.get_staff_profile(org_id, staff_id),
                    'assignments': staff.list_assignments(org_id, staff_id)})


@bp.route('/profiles/<staff_id>', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def put_profile(user_id, staff_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = staff.upsert_staff_profile(org_id, staff_id, request.get_json() or {})
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


# ── Duties / assignments ─────────────────────────────────────────────────────

@bp.route('/assignments', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_assignment(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = staff.create_assignment(org_id, request.get_json() or {}, created_by=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


@bp.route('/assignments/<assignment_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_assignment(user_id, assignment_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not staff.delete_assignment(org_id, assignment_id):
        return jsonify({'success': False, 'error': 'Assignment not found'}), 404
    return jsonify({'success': True})


# ── Forms review ─────────────────────────────────────────────────────────────

@bp.route('/forms', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_forms(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True,
                    'submissions': forms.list_all(org_id, request.args.get('status')),
                    'form_types': forms.FORM_TYPES})


@bp.route('/forms/<submission_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_form(user_id, submission_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = forms.update_status(org_id, submission_id, request.get_json() or {},
                                 actor_id=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


# ── Onboarding admin ─────────────────────────────────────────────────────────

@bp.route('/onboarding/templates', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_templates(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'templates': onboarding.list_templates(org_id)})


@bp.route('/onboarding/templates', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_template(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = onboarding.save_template(org_id, request.get_json() or {}, actor_id=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


@bp.route('/onboarding/templates/<template_id>', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def update_template(user_id, template_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = onboarding.save_template(org_id, request.get_json() or {},
                                      actor_id=user_id, template_id=template_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/onboarding/templates/<template_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_template(user_id, template_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not onboarding.delete_template(org_id, template_id):
        return jsonify({'success': False, 'error': 'Template not found'}), 404
    return jsonify({'success': True})


@bp.route('/onboarding/assignments', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_onboarding_assignments(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'assignments': onboarding.list_assignments(org_id)})


@bp.route('/onboarding/assignments', methods=['POST'])
@require_role(*ADMIN_ROLES)
def assign_onboarding(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    if not data.get('template_id') or not data.get('user_id'):
        return jsonify({'success': False, 'error': 'template_id and user_id are required'}), 400
    result = onboarding.assign(org_id, data['template_id'], data['user_id'],
                               assigned_by=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


# ── Timesheets & payroll export ──────────────────────────────────────────────

def _period_or_error():
    start = request.args.get('start')
    end = request.args.get('end')
    if not start or not end:
        return None, None, (jsonify({'success': False,
                                     'error': 'start and end are required (YYYY-MM-DD)'}), 400)
    return start, end, None


@bp.route('/timesheets', methods=['GET'])
@require_role(*ADMIN_ROLES)
def timesheets(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    start, end, perr = _period_or_error()
    if perr:
        return perr
    return jsonify({'success': True, 'timesheets': staff.timesheet_summary(org_id, start, end)})


@bp.route('/time-entries/<entry_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def edit_time_entry(user_id, entry_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = staff.update_time_entry(org_id, entry_id, request.get_json() or {},
                                     edited_by=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/timesheets/approve', methods=['POST'])
@require_role(*ADMIN_ROLES)
def approve_timesheet(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    if not data.get('user_id') or not data.get('start') or not data.get('end'):
        return jsonify({'success': False, 'error': 'user_id, start, end are required'}), 400
    result = staff.approve_period(org_id, data['user_id'], data['start'], data['end'],
                                  approved_by=user_id)
    return jsonify({'success': True, **result})


@bp.route('/payroll.csv', methods=['GET'])
@require_role(*ADMIN_ROLES)
def payroll_csv(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    start, end, perr = _period_or_error()
    if perr:
        return perr
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['Employee', 'Payroll ID', 'Pay Period', 'Date', 'Job/Class',
                     'Hours', 'Hourly Rate', 'Amount', 'Notes', 'Status'])
    for row in staff.payroll_rows(org_id, start, end):
        writer.writerow(row)
    return Response(
        buf.getvalue(), mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename=payroll_{start}_{end}.csv'})


@bp.route('/staff-roster.csv', methods=['GET'])
@require_role(*ADMIN_ROLES)
def staff_roster_csv(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    rows = sis_service.list_org_staff(org_id)
    profiles = {p['user_id']: p for p in (
        get_supabase_admin_client().table('sis_staff_profiles').select('*')
        .eq('organization_id', org_id).execute()
    ).data or []}
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['Name', 'Email', 'Roles', 'Position', 'Staff Type', 'Pay Type',
                     'Payroll ID', 'Start Date', 'End Date', 'Active', 'Last Active'])
    for s in rows:
        p = profiles.get(s['id']) or {}
        writer.writerow([
            s['name'], s.get('email') or '', ', '.join(s.get('role_labels') or []),
            p.get('position') or '', p.get('staff_type') or '', p.get('pay_type') or '',
            p.get('payroll_id') or '', p.get('start_date') or '', p.get('end_date') or '',
            'No' if p.get('is_active') is False else 'Yes', s.get('last_active') or '',
        ])
    return Response(
        buf.getvalue(), mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=staff_roster.csv'})
