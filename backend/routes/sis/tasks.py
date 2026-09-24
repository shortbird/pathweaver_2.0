"""
Tasks -- the person's list, one task, its thread, and the office's side.

Everything the SIS asks of anybody is a task (iCreate meeting 2026-09-23), one
row of sis_onboarding_assignments, and these are its routes. Three kinds of
caller reach them and each route says which:

  - STAFF_ROLES: the staff member's own list (/my-tasks) and the
    acknowledgment shortcut.
  - @require_auth, authorized by the TASK: one task, its steps, its comments,
    its uploads. The rule is sis_tasks_service.may_see_task -- the assignee,
    whoever assigned it, or an admin of that school -- so a teacher assigned a
    task can finally work it and a parent can read the office's comment on
    theirs. Families and students reach their own list through /tasks/mine.
  - ADMIN_ROLES: assigning, the Assigned view, templates-from-a-task and
    recurring schedules.

Deliberately NOT /api/sis/teacher/tasks -- that rule belonged to
routes/sis/staff_portal.py. Flask dispatches a duplicate rule to whichever
blueprint registered first and tells nobody, so this surface keeps its own
paths.
"""

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth, require_role
from modules.gate import require_module
from utils.logger import get_logger
from services import sis_service
from services import sis_onboarding_service as onboarding
from services import sis_tasks_service as tasks
from services import sis_task_schedule_service as schedules
from database import get_supabase_admin_client
from routes.sis import portal_views
from utils.sis_roles import ADMIN_ROLES, STAFF_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_tasks', __name__, url_prefix='/api/sis')

# Every route here is gated on the tasks OR the onboarding block. Checklists
# (the onboarding block) became tasks on 2026-09-24, so a school that turned
# off one of the two before the merge keeps what the other gave it. The same
# rule gates the portals' step routes and the office's template routes
# (parent.py, staff_portal.py, staff_admin.py). Per-route rather than a
# blueprint guard because module_guard takes one key.
TASK_MODULES = ('tasks', 'onboarding')


def _truthy(value) -> bool:
    return str(value or '').lower() in ('1', 'true', 'yes')


# ── The person's own list ─────────────────────────────────────────────────────

@bp.route('/my-tasks', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_module(*TASK_MODULES, any_of=True)
def my_tasks(user_id):
    """This staff member's tasks. Always the caller's own -- there is no
    ?teacher_id preview, because reading somebody else's to-do list is not a
    thing the console needs to do.

    ?include_done=1 keeps finished and expired tasks in the list.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    result = tasks.list_my_tasks(org_id, user_id, audience='staff',
                                 include_done=_truthy(request.args.get('include_done')))
    return jsonify({'success': True, **result})


@bp.route('/tasks/mine', methods=['GET'])
@require_auth
@require_module(*TASK_MODULES, any_of=True)
def my_family_or_student_tasks(user_id):
    """A guardian's To do (?audience=family) or a student's (?audience=student).

    Only ever the caller's own rows -- the service filters on user_id -- so
    the org named on the request narrows the list rather than widening it. A
    student is in their own org; a guardian names the school they are looking
    at, falling back to the one their children belong to.
    """
    audience = (request.args.get('audience') or 'family').strip().lower()
    if audience not in ('family', 'student'):
        return jsonify({'success': False, 'error': 'audience must be family or student'}), 400
    org_id = sis_service.requested_org_id() or sis_service.member_org_id(user_id)
    if not org_id:
        return jsonify({'success': True, 'tasks': [], 'counts': {'open': 0}})
    result = tasks.list_my_tasks(org_id, user_id, audience=audience,
                                 include_done=_truthy(request.args.get('include_done')))
    return jsonify({'success': True, **result})


@bp.route('/my-tasks/acknowledge', methods=['POST'])
@require_role(*STAFF_ROLES)
@require_module(*TASK_MODULES, any_of=True)
def acknowledge_resource(user_id):
    """Acknowledge a resource from the list.

    Writes the same sis_resource_acks row the resource library writes, stamped
    with the version acknowledged -- an ack is for the version that was read, so
    re-versioning a policy re-opens the task for everyone.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    resource_id = (data.get('resource_id') or '').strip()
    if not resource_id:
        return jsonify({'success': False, 'error': 'resource_id is required'}), 400

    # admin client justified: org_resources + sis_resource_acks are service-role-only; gated by @require_role(STAFF_ROLES), resource confirmed in the caller's org below
    supabase = get_supabase_admin_client()
    rows = (supabase.table('org_resources').select('id, organization_id, version_date, audience, visible_to_roles')
            .eq('id', resource_id).limit(1).execute()).data or []
    resource = rows[0] if rows else None
    if not resource or resource.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Document not found'}), 404
    # Same visibility rule the library applies: a resource narrowed away from
    # this person is not one they can acknowledge.
    if not sis_service.filter_role_visible(user_id, [resource]):
        return jsonify({'success': False, 'error': 'Document not found'}), 404

    try:
        supabase.table('sis_resource_acks').upsert({
            'resource_id': resource_id,
            'user_id': user_id,
            'version_date': resource.get('version_date'),
            'acknowledged_at': datetime.now(timezone.utc).isoformat(),
        }, on_conflict='resource_id,user_id').execute()
    except Exception as e:
        logger.error(f'Resource acknowledgment failed for {resource_id}: {e}')
        return jsonify({'success': False, 'error': 'Could not record that'}), 500
    return jsonify({'success': True})


# ── One task (authorized by the task) ─────────────────────────────────────────

def _access(user_id, task_id):
    """(row, is_admin) for a task this caller may see, or (None, None).

    The org is the TASK's: a guardian has no organization_id of their own to
    resolve one from. Admin standing only counts in the task's own school --
    resolve_org_id hands a non-superadmin their own org whatever was asked.
    """
    from repositories.sis_task_repository import SisTaskRepository
    # admin client justified: the task table is service-role only; the row is released only to its assignee, its assigner or an admin of its org (may_see_task below)
    row = SisTaskRepository(client=get_supabase_admin_client()).get(task_id)
    if not row:
        return None, None
    org_id = row.get('organization_id')
    is_admin = (sis_service.caller_is_admin(user_id)
                and sis_service.resolve_org_id(user_id, org_id) == org_id)
    if not tasks.may_see_task(row, org_id, user_id, is_admin):
        return None, None
    return row, is_admin


def _not_found():
    return jsonify({'success': False, 'error': 'Task not found'}), 404


@bp.route('/tasks/<task_id>', methods=['GET'])
@require_auth
@require_module(*TASK_MODULES, any_of=True)
def get_task(user_id, task_id):
    """One task: its steps, who assigned it, its comments, and -- for a task
    made from a message -- the link back to the thread it answers."""
    row, is_admin = _access(user_id, task_id)
    if not row:
        return _not_found()
    task = tasks.get_task(row['organization_id'], user_id, task_id, is_admin)
    if not task:
        return _not_found()
    return jsonify({'success': True, 'task': task})


@bp.route('/tasks/<task_id>/comments', methods=['GET'])
@require_auth
@require_module(*TASK_MODULES, any_of=True)
def list_task_comments(user_id, task_id):
    row, is_admin = _access(user_id, task_id)
    if not row:
        return _not_found()
    return jsonify({'success': True,
                    'comments': tasks.list_comments(row['organization_id'], user_id,
                                                    task_id, is_admin) or []})


@bp.route('/tasks/<task_id>/comments', methods=['POST'])
@require_auth
@require_module(*TASK_MODULES, any_of=True)
def add_task_comment(user_id, task_id):
    row, is_admin = _access(user_id, task_id)
    if not row:
        return _not_found()
    data = request.get_json(silent=True) or {}
    result = tasks.add_comment(row['organization_id'], user_id, task_id,
                               data.get('body'), is_admin)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result}), 201


@bp.route('/tasks/<task_id>/items/<item_key>', methods=['PATCH'])
@require_auth
@require_module(*TASK_MODULES, any_of=True)
def update_task_item(user_id, task_id, item_key):
    """Tick, sign or attach a document to one step. The assignee works their
    own steps; an admin of the school may also approve, reject, attach a
    filed document or clear a signature. The service re-checks both."""
    row, is_admin = _access(user_id, task_id)
    if not row:
        return _not_found()
    if not is_admin and row.get('user_id') != user_id:
        # The assigner who is not an admin may read the task, not work it.
        return jsonify({'success': False, 'error': 'Only the person it is assigned to can do this'}), 403
    return portal_views.update_onboarding_item(row['organization_id'], user_id, task_id,
                                               item_key, is_admin=is_admin)


@bp.route('/tasks/<task_id>/upload', methods=['POST'])
@require_auth
@require_module(*TASK_MODULES, any_of=True)
def upload_task_document(user_id, task_id):
    """Upload a file for one of the caller's own steps, into the private
    bucket for the task's audience. Returns a storage path; the item PATCH
    attaches it."""
    row, _ = _access(user_id, task_id)
    if not row or row.get('user_id') != user_id:
        return _not_found()
    bucket = onboarding.CHECKLIST_BUCKETS.get(onboarding._clean_audience(row.get('audience')))
    return portal_views.upload_doc(row['organization_id'], user_id, bucket)


@bp.route('/tasks/<task_id>/doc-url', methods=['GET'])
@require_auth
@require_module(*TASK_MODULES, any_of=True)
def task_document_url(user_id, task_id):
    """A signed URL for a file attached to one of this task's steps. The path
    must be one the task actually holds -- never a path the client names."""
    row, _ = _access(user_id, task_id)
    if not row:
        return _not_found()
    path = request.args.get('path') or ''
    held = {d.get('path') for i in (row.get('items') or [])
            for d in onboarding.item_documents(i) if d.get('path')}
    if not path or path not in held:
        return jsonify({'success': False, 'error': 'Document not found'}), 404
    bucket = onboarding.CHECKLIST_BUCKETS.get(onboarding._clean_audience(row.get('audience')))
    try:
        # admin client justified: signed URL on a PRIVATE bucket for a path this task holds; the caller may see the task (_access)
        signed = get_supabase_admin_client().storage.from_(bucket).create_signed_url(path, 3600)
        url = signed.get('signedURL') or signed.get('signedUrl')
    except Exception as e:  # noqa: BLE001
        logger.error(f'task doc-url failed for {task_id}: {e}')
        url = None
    if not url:
        return jsonify({'success': False, 'error': 'Could not open the document'}), 404
    return jsonify({'success': True, 'url': url})


@bp.route('/tasks/<task_id>/sign-documents/<doc_id>/url', methods=['GET'])
@require_auth
@require_module(*TASK_MODULES, any_of=True)
def task_sign_document_url(user_id, task_id, doc_id):
    """Open a document the office shared for the assignee to sign on this
    task. The same three checks as every office-document door: filed against
    the assignee, shared with them, this org."""
    row, _ = _access(user_id, task_id)
    if not row or row.get('user_id') != user_id:
        return _not_found()
    return portal_views.office_document_url(row['organization_id'], user_id, doc_id)


# ── The office's side ─────────────────────────────────────────────────────────

@bp.route('/tasks', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_module(*TASK_MODULES, any_of=True)
def assign_tasks(user_id):
    """Assign a task -- or, with `repeat`, a recurring one.

    Body: title, description, items[], due_date, priority, recipients
    [{id, audience}], template_id, blocks_access, save_as_template,
    repeat {days_of_week[], start_date, end_date}.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    saved_template = None
    if data.get('save_as_template') and not data.get('template_id'):
        audiences = {(r or {}).get('audience') for r in (data.get('recipients') or [])
                     if isinstance(r, dict)}
        saved = onboarding.save_template(org_id, {
            'name': data.get('template_name') or data.get('title'),
            'description': data.get('description'),
            'audience': audiences.pop() if len(audiences) == 1 else 'staff',
            'blocks_access': data.get('blocks_access'),
            'items': data.get('items') or [{'title': data.get('title'),
                                            'description': data.get('description')}],
        }, actor_id=user_id)
        if saved.get('error'):
            return jsonify({'success': False, 'error': saved['error']}), 400
        saved_template = saved.get('template')

    repeat = data.get('repeat')
    if repeat:
        result = schedules.create_schedule(org_id, user_id, {
            'title': data.get('title'), 'description': data.get('description'),
            'items': data.get('items'), 'template_id': data.get('template_id'),
            'recipients': data.get('recipients'), 'priority': data.get('priority'),
            'days_of_week': repeat.get('days_of_week'),
            'start_date': repeat.get('start_date'), 'end_date': repeat.get('end_date'),
        })
    else:
        result = onboarding.assign_task(
            org_id, user_id, data.get('recipients') or [],
            title=data.get('title'), description=data.get('description'),
            items=data.get('items') or None, due_date=data.get('due_date') or None,
            priority=data.get('priority') or None,
            audience=data.get('audience') or 'staff',
            needs_document=bool(data.get('needs_document')),
            template_id=data.get('template_id') or None,
            blocks_access=bool(data.get('blocks_access')))
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    result.pop('tasks', None)
    return jsonify({'success': True, **result, 'template': saved_template}), 201


@bp.route('/tasks/assigned', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_module(*TASK_MODULES, any_of=True)
def assigned_batches(user_id):
    """One card per send, each with its people and their per-step state."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'batches': tasks.list_batches(org_id)})


@bp.route('/tasks/<task_id>/save-template', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_module(*TASK_MODULES, any_of=True)
def save_task_as_template(user_id, task_id):
    """Keep any assigned task, one step or many, as a template."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    result = tasks.save_as_template(org_id, user_id, task_id, name=data.get('name'))
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result}), 201


@bp.route('/tasks/schedules', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_module(*TASK_MODULES, any_of=True)
def list_task_schedules(user_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'schedules': schedules.list_schedules(org_id)})


@bp.route('/tasks/schedules/<schedule_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
@require_module(*TASK_MODULES, any_of=True)
def update_task_schedule(user_id, schedule_id):
    """Pause ({active: false}), resume ({active: true}), end ({end: true}),
    or change the days or the end date."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    result = schedules.update_schedule(org_id, schedule_id, request.get_json(silent=True) or {})
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result})


@bp.route('/tasks/schedules/<schedule_id>/grid', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_module(*TASK_MODULES, any_of=True)
def task_schedule_grid(user_id, schedule_id):
    """Dates x people for one schedule. ?since=&until= (ISO dates)."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    result = schedules.grid(org_id, schedule_id, since=request.args.get('since'),
                            until=request.args.get('until'))
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result})


# ── Incident reports (any staff member files one) ─────────────────────────────
#
# Katrine Myers (iCreate), 2026-09-24, ticket a26d9daf: "Reporting an incident
# used to be in task manager. I don't see it there anymore." Filing writes ONE
# task for an office person through assign_task (services/
# sis_incident_report_service.py says why and how). STAFF_ROLES, so a teacher
# can file; the org is always the caller's own, and the service checks the
# recipient and every student against it.

@bp.route('/incident-reports/options', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_module(*TASK_MODULES, any_of=True)
def incident_report_options(user_id):
    """What the form offers: the office people, the school's default one,
    and (unless ?students=0) the school's students as id + name."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    from services import sis_incident_report_service as incidents
    include_students = request.args.get('students', '1') not in ('0', 'false', 'no')
    return jsonify({'success': True,
                    **incidents.form_options(org_id, include_students=include_students)})


@bp.route('/incident-reports', methods=['POST'])
@require_role(*STAFF_ROLES)
@require_module(*TASK_MODULES, any_of=True)
def file_incident_report(user_id):
    """Body: student_ids[], occurred_at (local date-time), location,
    what_happened (required), injury, response, parent_notified ('yes'|'no'),
    parent_notified_detail, witnesses, recipient_id (defaults to the school's
    setting; required when there is none)."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    from services import sis_incident_report_service as incidents
    result = incidents.file_report(org_id, user_id, request.get_json(silent=True) or {})
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result}), 201


@bp.route('/incident-reports/mine', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_module(*TASK_MODULES, any_of=True)
def my_incident_reports(user_id):
    """The incident reports the caller filed, newest first."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    from services import sis_incident_report_service as incidents
    return jsonify({'success': True, 'reports': incidents.filed_by(org_id, user_id)})
