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
from modules.gate import require_module
from utils.logger import get_logger
from services import sis_service
from services import sis_staff_service as staff
from services import sis_forms_service as forms
from services import sis_onboarding_service as onboarding
from services import sis_form_template_service as form_templates
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
    # A coordinator can't read a pay rate or an employment term, so they must not
    # be able to set one either — a blind write is the same leak in the other
    # direction.
    if not sis_service.caller_sees_pay(user_id) and any(f in payload for f in staff.RESTRICTED_FIELDS):
        return jsonify({'success': False,
                        'error': 'Pay and employment details are managed by an organization admin.'}), 403
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
@require_module('forms')
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
@require_module('forms')
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
@require_module('forms')
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
@require_module('forms')
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
@require_module('forms')
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
@require_module('forms')
def list_form_comments(user_id, submission_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True,
                    'comments': forms.list_comments(org_id, submission_id)})


@bp.route('/forms/<submission_id>/comments', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_module('forms')
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

# ── Form templates (the builder) ─────────────────────────────────────────────
# ADMIN_ROLES: building a form is operational, not financial, so a campus
# coordinator authors them like any other front-office work.

@bp.route('/form-templates', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_module('forms')
def list_form_templates(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True,
                    'templates': form_templates.list_templates(org_id),
                    # The shared built-ins, each with whether this school hides
                    # it, so the Forms panel can list what staff actually see.
                    'builtins': form_templates.builtin_forms(org_id),
                    'field_types': list(form_templates.FIELD_TYPES)})


@bp.route('/form-templates/builtin/<key>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def set_builtin_form_visibility(user_id, key):
    """Hide or restore one built-in form for this school. The list is shared by
    every org, so a school that never files reimbursements switches it off for
    itself rather than deleting it (iCreate, 2026-09-02)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    from services.sis_forms_service import FORM_TYPES, PARENT_FORM_TYPES
    if key not in {**FORM_TYPES, **PARENT_FORM_TYPES}:
        return jsonify({'success': False, 'error': 'Unknown form'}), 404
    hidden = bool((request.get_json(silent=True) or {}).get('hidden'))
    return jsonify({'success': True,
                    'hidden_form_types': form_templates.set_builtin_hidden(org_id, key, hidden)})


@bp.route('/form-templates', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_module('forms')
def create_form_template(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = form_templates.save_template(org_id, request.get_json() or {}, actor_id=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result}), 201


@bp.route('/form-templates/<template_id>', methods=['PUT'])
@require_role(*ADMIN_ROLES)
@require_module('forms')
def update_form_template(user_id, template_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = form_templates.save_template(org_id, request.get_json() or {},
                                          actor_id=user_id, template_id=template_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result})


@bp.route('/form-templates/<template_id>/duplicate', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_module('forms')
def duplicate_form_template(user_id, template_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = form_templates.duplicate_template(org_id, template_id, actor_id=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result}), 201


@bp.route('/form-templates/<template_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
@require_module('forms')
def delete_form_template(user_id, template_id):
    """409 with submission_count when submissions exist, unless ?force=1."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    force = str(request.args.get('force', '')).lower() in ('1', 'true', 'yes')
    result = form_templates.delete_template(org_id, template_id, force=force)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error'],
                        'submission_count': result.get('submission_count')}), result.get('status', 400)
    return jsonify({'success': True, **result})


@bp.route('/onboarding/templates', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_module('onboarding')
def list_templates(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'templates': onboarding.list_templates(org_id)})


@bp.route('/onboarding/templates', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_module('onboarding')
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
@require_module('onboarding')
def update_template(user_id, template_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = onboarding.save_template(org_id, request.get_json() or {},
                                      actor_id=user_id, template_id=template_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/onboarding/templates/<template_id>/duplicate', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_module('onboarding')
def duplicate_template(user_id, template_id):
    """Copy a template under a free "(Copy)" name. Server-side so the copy keeps
    blocks_access and drops the original's per-person document bindings."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = onboarding.duplicate_template(org_id, template_id, actor_id=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result}), 201


@bp.route('/onboarding/templates/<template_id>/sync', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_module('onboarding')
def sync_template_assignments(user_id, template_id):
    """Push this template's current items onto checklists already assigned.
    Returns counts: what was added, updated, removed, and how many finished
    checklists were deliberately left alone."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = onboarding.sync_assignments(org_id, template_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result})


@bp.route('/onboarding/templates/<template_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
@require_module('onboarding')
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
@require_module('onboarding')
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
@require_module('onboarding')
def assign_onboarding(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    if not data.get('template_id'):
        # No template: a one-off task ("do this one thing"). Same record as a
        # checklist underneath, so the recipient's inbox and the roll-up need
        # no new shape — see onboarding.assign_task.
        if data.get('title'):
            result = onboarding.assign_task(
                org_id, data['title'], data.get('user_ids') or [], assigned_by=user_id,
                description=data.get('description'), due_date=data.get('due_date'),
                audience=data.get('audience') or 'staff',
                items=data.get('items') or None,
                needs_document=bool(data.get('needs_document')))
            if result.get('error'):
                return jsonify({'success': False, 'error': result['error']}), 400
            return jsonify({'success': True, **result}), 201
        return jsonify({'success': False, 'error': 'template_id or title is required'}), 400
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
@require_module('onboarding')
def unassign_onboarding(user_id, assignment_id):
    """Take a checklist back off someone. Their uploaded documents are kept."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = onboarding.unassign(org_id, assignment_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})


@bp.route('/onboarding/doc-url', methods=['GET'])
@require_role(*ADMIN_ROLES)
def onboarding_admin_doc_url(user_id):
    """Signed (1h) URL for a document attached to any checklist item in the org.

    The teacher-portal twin (staff_portal.onboarding_doc_url) only signs against
    the staff bucket; the admin roll-up also shows family checklists, whose
    uploads live in family-documents — `audience` picks the bucket the same way
    the upload routes did."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    bucket = onboarding.CHECKLIST_BUCKETS.get(
        (request.args.get('audience') or 'staff').strip().lower())
    path = request.args.get('path') or ''
    if not bucket or path.split('/')[0] != org_id or len(path.split('/')) < 3:
        return jsonify({'success': False, 'error': 'Document not found'}), 404
    try:
        # admin client justified: signed URL on a PRIVATE checklist bucket; org prefix checked above, caller is ADMIN_ROLES for that org
        signed = get_supabase_admin_client().storage.from_(bucket) \
            .create_signed_url(path, 3600)
        url = signed.get('signedURL') or signed.get('signedUrl')
    except Exception as e:
        logger.error(f'Admin checklist doc-url failed for {path}: {e}')
        return jsonify({'success': False, 'error': 'Could not open the document'}), 500
    return jsonify({'success': True, 'url': url})


@bp.route('/onboarding/recipients', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_module('onboarding')
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
@require_module('tasks')
def send_signature_request(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return signature_request_views.send_signature_request(user_id, org_id, allow_hr=False)


@bp.route('/signature-requests', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_module('tasks')
def list_signature_requests(user_id):
    """Campus paperwork sends only — HR sends stay invisible here even to an
    org_admin, who has the HR view for those."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return signature_request_views.list_signature_requests(org_id, include_hr=False)


@bp.route('/signature-requests/<assignment_id>/remind', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_module('tasks')
def remind_signature_request(user_id, assignment_id):
    """Chase one person who has not signed. HR sends 404 here."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return signature_request_views.remind_signature_request(
        org_id, assignment_id, include_hr=False)


@bp.route('/signature-requests/<assignment_id>/release', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_module('tasks')
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
@require_module('timesheets')
def timesheets(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    start, end, perr = _period_or_error()
    if perr:
        return perr
    return jsonify({'success': True,
                    'timesheets': staff.timesheet_summary(org_id, start, end),
                    # Why the list is empty, when it is: the time clock is off
                    # by default on every staff profile, and nothing on the page
                    # used to say so.
                    'setup': staff.timeclock_setup(org_id)})


@bp.route('/time-entries/<entry_id>', methods=['PATCH'])
@require_role(*FINANCE_ROLES)
@require_module('timesheets')
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
@require_module('timesheets')
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
@require_module('timesheets')
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
    # Pay and employment terms come out entirely for a campus coordinator rather
    # than being blanked — an empty column reads as "nobody has a payroll ID",
    # which is a different and wrong statement. Position and Active stay: those
    # are what the front office runs the campus on.
    sees_pay = sis_service.caller_sees_pay(user_id)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['Name', 'Email', 'Roles', 'Position']
                    + (['Staff Type', 'Pay Type', 'Payroll ID',
                        'Start Date', 'End Date'] if sees_pay else [])
                    + ['Active', 'Last Active'])
    for s in rows:
        p = profiles.get(s['id']) or {}
        writer.writerow([
            s['name'], s.get('email') or '', ', '.join(s.get('role_labels') or []),
            p.get('position') or '',
        ] + ([p.get('staff_type') or '', p.get('pay_type') or '', p.get('payroll_id') or '',
              p.get('start_date') or '', p.get('end_date') or ''] if sees_pay else []) + [
            'No' if p.get('is_active') is False else 'Yes', s.get('last_active') or '',
        ])
    return Response(
        buf.getvalue(), mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=staff_roster.csv'})
