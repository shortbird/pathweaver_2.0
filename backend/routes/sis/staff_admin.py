"""
SIS staff-operations admin routes — employment profiles, duties, form review,
onboarding templates, timesheets, and the payroll CSV export.

ADMIN-ONLY: this is the employer side of the teacher portal. Teachers reach
their own slice via routes/sis/staff_portal.py.

The payroll half (timesheets, time-entry edits, approvals, payroll.csv) is
FINANCE_ROLES, so campus coordinators run onboarding and form review without
seeing what anyone is paid. Pay fields on the employment profile are redacted
for them rather than the whole profile withheld -- it also carries the
emergency contact and work schedule, which they do need.
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
from routes.sis import signature_request_views
from database import get_supabase_admin_client
from utils.sis_roles import ADMIN_ROLES, FINANCE_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_staff_admin', __name__, url_prefix='/api/sis/staff-admin')


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    # request.form matters for multipart (uploads): get_json returns nothing
    # there, so a superadmin -- who has no org to fall back to -- could not
    # reach any upload endpoint. See routes/sis/__init__._org_or_error.
    requested = (request.args.get('organization_id')
                 or body.get('organization_id')
                 or request.form.get('organization_id'))
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
                    'profile': staff.redact_pay(staff.get_staff_profile_with_contact(org_id, staff_id),
                                                not sis_service.caller_sees_pay(user_id)),
                    'assignments': staff.list_assignments(org_id, staff_id)})


@bp.route('/profiles/<staff_id>', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def put_profile(user_id, staff_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    payload = request.get_json() or {}
    # A coordinator can't read a pay rate, so they must not be able to set one
    # either — a blind write is the same leak in the other direction.
    if not sis_service.caller_sees_pay(user_id) and any(f in payload for f in staff.PAY_FIELDS):
        return jsonify({'success': False,
                        'error': 'Pay details are managed by an organization admin.'}), 403
    result = staff.upsert_staff_profile(org_id, staff_id, payload)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    if result.get('profile'):
        result['profile'] = staff.redact_pay(result['profile'],
                                             not sis_service.caller_sees_pay(user_id))
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
                    'counts': forms.status_counts(org_id),
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


@bp.route('/forms', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_form(user_id):
    """Admin files a request/task, optionally already assigned, prioritised and
    dated — the internal task system's create door (iCreate Phase 2)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = forms.submit(org_id, user_id, request.get_json() or {},
                          submitter_role='staff', allow_assign=True)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


@bp.route('/form-routing', methods=['GET'])
@require_role(*ADMIN_ROLES)
def get_form_routing(user_id):
    """Which form type is auto-assigned to whom.

    ADMIN_ROLES, coordinators included: deciding that substitute requests go to
    the person who covers classes is running the campus, not spending money.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True,
                    'routing': forms.routing(org_id),
                    'form_types': forms.ALL_FORM_TYPES})


@bp.route('/form-routing', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def put_form_routing(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    result = forms.set_routing(org_id, data.get('routing') or {})
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/forms/<submission_id>/comments', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_form_comments(user_id, submission_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True,
                    'comments': forms.list_comments(org_id, submission_id)})


@bp.route('/forms/<submission_id>/comments', methods=['POST'])
@require_role(*ADMIN_ROLES)
def add_form_comment(user_id, submission_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    result = forms.add_comment(org_id, submission_id, user_id, data.get('body'))
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


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
    """Delete a template. 409 (with assigned_count) when people still hold a
    checklist from it, unless the caller passes ?force=1 after confirming."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    force = str(request.args.get('force', '')).lower() in ('1', 'true', 'yes')
    result = onboarding.delete_template(org_id, template_id, force=force)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error'],
                        'assigned_count': result.get('assigned_count')}), result.get('status', 400)
    return jsonify({'success': True, **result})


@bp.route('/onboarding/assignments', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_onboarding_assignments(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    # 'checklist' only: a document sent to 40 people for signature is 40
    # assignment rows, and burying the onboarding roll-up under them is exactly
    # what the Sent-paperwork view exists to avoid.
    return jsonify({'success': True,
                    'assignments': onboarding.list_assignments(org_id, kind='checklist')})


@bp.route('/onboarding/assignments', methods=['POST'])
@require_role(*ADMIN_ROLES)
def assign_onboarding(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    if not data.get('template_id'):
        return jsonify({'success': False, 'error': 'template_id is required'}), 400
    # Accept a single user_id OR a list of user_ids (bulk assign).
    user_ids = data.get('user_ids')
    if isinstance(user_ids, list) and user_ids:
        result = onboarding.assign_many(org_id, data['template_id'], user_ids, assigned_by=user_id)
        return jsonify({'success': True, **result}), 201
    if not data.get('user_id'):
        return jsonify({'success': False, 'error': 'user_id or user_ids is required'}), 400
    result = onboarding.assign(org_id, data['template_id'], data['user_id'],
                               assigned_by=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


@bp.route('/onboarding/assignments/<assignment_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def unassign_onboarding(user_id, assignment_id):
    """Take a checklist back off someone. Their uploaded documents are kept."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = onboarding.unassign(org_id, assignment_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})


@bp.route('/onboarding/recipients', methods=['GET'])
@require_role(*ADMIN_ROLES)
def onboarding_recipients(user_id):
    """People an admin can assign a template to. ?audience=staff returns staff;
    ?audience=family returns the org's guardians (parents) for family checklists."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    audience = (request.args.get('audience') or 'staff').strip().lower()
    return jsonify({'success': True, 'recipients': onboarding.list_recipients(org_id, audience)})


# ── Documents sent for signature ─────────────────────────────────────────────
#
# The front office sends campus paperwork (handbooks, permission slips, policy
# acknowledgements) and tracks who has signed. Employment paperwork is the same
# machinery with sensitivity='hr' and lives on the HR-gated blueprint
# (routes/sis/secure_documents.py) — a campus coordinator reaches this pair and
# not that one, which is the whole of the difference between them.

@bp.route('/signature-requests', methods=['POST'])
@require_role(*ADMIN_ROLES)
def send_signature_request(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return signature_request_views.send_signature_request(user_id, org_id, allow_hr=False)


@bp.route('/signature-requests', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_signature_requests(user_id):
    """Campus paperwork sends only — HR sends stay invisible here even to an
    org_admin, who has the HR view for those."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return signature_request_views.list_signature_requests(org_id, include_hr=False)


@bp.route('/signature-requests/<assignment_id>/remind', methods=['POST'])
@require_role(*ADMIN_ROLES)
def remind_signature_request(user_id, assignment_id):
    """Chase one person who has not signed. HR sends 404 here."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return signature_request_views.remind_signature_request(
        org_id, assignment_id, include_hr=False)


@bp.route('/signature-requests/<assignment_id>/release', methods=['POST'])
@require_role(*ADMIN_ROLES)
def release_signature_hold(user_id, assignment_id):
    """Let a family back into the platform without signing. HR sends 404 here."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return signature_request_views.release_signature_hold(
        org_id, assignment_id, include_hr=False)


# ── Timesheets & payroll export ──────────────────────────────────────────────

def _period_or_error():
    start = request.args.get('start')
    end = request.args.get('end')
    if not start or not end:
        return None, None, (jsonify({'success': False,
                                     'error': 'start and end are required (YYYY-MM-DD)'}), 400)
    return start, end, None


@bp.route('/timesheets', methods=['GET'])
@require_role(*FINANCE_ROLES)
def timesheets(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    start, end, perr = _period_or_error()
    if perr:
        return perr
    return jsonify({'success': True, 'timesheets': staff.timesheet_summary(org_id, start, end)})


@bp.route('/time-entries/<entry_id>', methods=['PATCH'])
@require_role(*FINANCE_ROLES)
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
@require_role(*FINANCE_ROLES)
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
@require_role(*FINANCE_ROLES)
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
    # Pay Type and Payroll ID are money. Drop the columns entirely for a campus
    # coordinator rather than blanking them — an empty column reads as "nobody
    # has a payroll ID", which is a different and wrong statement.
    sees_pay = sis_service.caller_sees_pay(user_id)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['Name', 'Email', 'Roles', 'Position', 'Staff Type']
                    + (['Pay Type', 'Payroll ID'] if sees_pay else [])
                    + ['Start Date', 'End Date', 'Active', 'Last Active'])
    for s in rows:
        p = profiles.get(s['id']) or {}
        writer.writerow([
            s['name'], s.get('email') or '', ', '.join(s.get('role_labels') or []),
            p.get('position') or '', p.get('staff_type') or '',
        ] + ([p.get('pay_type') or '', p.get('payroll_id') or ''] if sees_pay else []) + [
            p.get('start_date') or '', p.get('end_date') or '',
            'No' if p.get('is_active') is False else 'Yes', s.get('last_active') or '',
        ])
    return Response(
        buf.getvalue(), mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=staff_roster.csv'})
