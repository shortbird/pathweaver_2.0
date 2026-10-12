"""
Mail-merge sends from /admin/crm/lists (services/crm_broadcast_service.py).

Superadmin-only, same prefix as routes/admin/crm_lists.py. The page resolves a
list to user ids, the superadmin writes one email with {{variables}} and fills
the per-school billing sheet, previews it person by person, sends a test to
themself, then sends. Each person gets their own copy through SendGrid; every
outcome is a crm_broadcast_recipients row.
"""
from flask import Blueprint, jsonify, request

from repositories.crm_broadcast_repository import CrmBroadcastRepository
from repositories.crm_email_list_repository import CrmEmailListRepository
from services import crm_broadcast_service as merge
from utils.auth.decorators import require_superadmin
from utils.class_membership import guardians_by_student
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_crm_broadcasts', __name__, url_prefix='/api/admin/crm')

# admin client justified: the merge reads every org's users, classes and
# households, and the crm_broadcast* tables are service-role only; every route
# here is behind require_superadmin.
from utils.admin_client import admin_client as _db


def _lists():
    return CrmEmailListRepository(client=_db())


def _repo():
    return CrmBroadcastRepository(client=_db())


def _context(sheet):
    repo = _lists()
    users = repo.all_users()
    classes_by_student = {}
    for e in repo.active_enrollments():
        classes_by_student.setdefault(e['student_id'], set()).add(e['class_id'])
    return merge.MergeContext(
        users=users,
        classes_by_student=classes_by_student,
        guardians=guardians_by_student([u['id'] for u in users]),
        class_names={c['id']: c.get('name') or '' for c in repo.all_classes()},
        org_names={o['id']: (o.get('name') or '').strip() for o in repo.all_organizations()},
        sheet=sheet,
    )


def _draft(body):
    """The email as posted: subject, body, sheet, recipient ids. Raises
    BroadcastError."""
    subject = (body.get('subject') or '').strip()
    text = body.get('body') or ''
    if not subject:
        raise merge.BroadcastError('Write a subject first')
    if not text.strip():
        raise merge.BroadcastError('Write the email first')
    ids = body.get('recipient_ids') or []
    if not isinstance(ids, list) or not all(isinstance(i, str) and i for i in ids):
        raise merge.BroadcastError('recipient_ids must be a list of user ids')
    if len(ids) > merge.MAX_RECIPIENTS:
        raise merge.BroadcastError(f'At most {merge.MAX_RECIPIENTS} people per send')
    return {
        'subject': subject[:300],
        'body': text[:50000],
        'sheet': merge.clean_sheet(body.get('sheet')),
        'recipient_ids': list(dict.fromkeys(ids)),
        'include_suppressed': bool(body.get('include_suppressed')),
        'sender_name': (body.get('sender_name') or '').strip()[:100],
        'reply_to': (body.get('reply_to') or '').strip()[:200],
    }


def _plan(draft, ctx):
    suppressed = _lists().suppressed_emails()
    return merge.plan_recipients(draft['recipient_ids'], ctx.users, suppressed,
                                 draft['include_suppressed'])


@bp.route('/broadcasts/variables', methods=['GET'])
@require_superadmin
def variables(user_id):
    return jsonify({'variables': [
        {'name': n, 'token': '{{' + n + '}}', 'label': label, 'group': group, 'example': example}
        for n, label, group, example in merge.VARIABLES]})


@bp.route('/broadcasts/school-sheet', methods=['POST'])
@require_superadmin
def school_sheet(user_id):
    """The live roster count and names for these schools, to start the sheet."""
    org_ids = (request.get_json(silent=True) or {}).get('organization_ids') or []
    users = _lists().all_users()
    rosters = merge.school_rosters(users)
    return jsonify({'schools': {
        org_id: {'student_count': len(rosters.get(org_id, [])), 'students': rosters.get(org_id, [])}
        for org_id in org_ids if isinstance(org_id, str)}})


@bp.route('/broadcasts/preview', methods=['POST'])
@require_superadmin
def preview(user_id):
    """The email one person would get, plus who would be skipped and who
    would see a blank variable."""
    body = request.get_json(silent=True) or {}
    try:
        draft = _draft(body)
    except merge.BroadcastError as e:
        return jsonify({'error': str(e)}), 400
    ctx = _context(draft['sheet'])
    rows = _plan(draft, ctx)
    person_id = body.get('person_id') or (rows[0]['user_id'] if rows else None)
    rendered = None
    if person_id:
        values = ctx.variables(person_id)
        rendered = {**merge.render(draft['subject'], draft['body'], values),
                    'person_id': person_id,
                    'to': (ctx.users.get(person_id) or {}).get('email')}
    return jsonify({'preview': rendered, 'summary': merge.summarize(rows, ctx, draft['subject'], draft['body'])})


@bp.route('/broadcasts/test', methods=['POST'])
@require_superadmin
def send_test(user_id):
    """Send the email one person would get to the superadmin's own address."""
    body = request.get_json(silent=True) or {}
    try:
        draft = _draft(body)
    except merge.BroadcastError as e:
        return jsonify({'error': str(e)}), 400
    ctx = _context(draft['sheet'])
    me = ctx.users.get(user_id) or {}
    if not me.get('email'):
        return jsonify({'error': 'Your account has no email'}), 400
    person_id = body.get('person_id') or (draft['recipient_ids'] or [user_id])[0]
    rendered = merge.render(draft['subject'], draft['body'], ctx.variables(person_id))
    rendered['subject'] = f"[Test] {rendered['subject']}"
    if not merge.send_one(me['email'], rendered, draft['sender_name'], draft['reply_to']):
        return jsonify({'error': 'SendGrid did not accept the test email'}), 502
    return jsonify({'sent_to': me['email']})


@bp.route('/broadcasts', methods=['POST'])
@require_superadmin
def send(user_id):
    """Record the email and every recipient, then send in the background.
    `expected_count` is the number the superadmin confirmed; if the list has
    moved since, refuse rather than mail a different group."""
    body = request.get_json(silent=True) or {}
    try:
        draft = _draft(body)
    except merge.BroadcastError as e:
        return jsonify({'error': str(e)}), 400
    ctx = _context(draft['sheet'])
    rows = _plan(draft, ctx)
    queued_count = sum(1 for r in rows if r['status'] == 'queued')
    if not queued_count:
        return jsonify({'error': 'Nobody on this list can be emailed'}), 400
    if body.get('expected_count') != queued_count:
        return jsonify({'error': f'The list changed: {queued_count} people would get this now. '
                                 'Check the preview and confirm again.',
                        'sendable': queued_count}), 409

    repo = _repo()
    broadcast = repo.create({
        'subject': draft['subject'],
        'body': draft['body'],
        'list_id': body.get('list_id') or None,
        'list_name': (body.get('list_name') or '').strip()[:200] or None,
        'sender_name': draft['sender_name'] or None,
        'reply_to': draft['reply_to'] or None,
        'billing_month': draft['sheet'].get('month') or None,
        'sheet': draft['sheet'],
        'recipient_count': len(rows),
        'skipped_count': len(rows) - queued_count,
        'created_by': user_id,
    })
    saved = repo.add_recipients([{**r, 'broadcast_id': broadcast['id']} for r in rows])
    queued = [r for r in saved if r['status'] == 'queued']
    merge.start_broadcast(repo, broadcast, queued, ctx, len(rows) - queued_count)
    _audit(user_id, broadcast['id'], {'subject': draft['subject'], 'recipients': queued_count})
    return jsonify({'broadcast': broadcast}), 202


@bp.route('/broadcasts', methods=['GET'])
@require_superadmin
def history(user_id):
    return jsonify({'broadcasts': _repo().recent()})


@bp.route('/broadcasts/<broadcast_id>', methods=['GET'])
@require_superadmin
def detail(user_id, broadcast_id):
    repo = _repo()
    broadcast = repo.get(broadcast_id)
    if not broadcast:
        return jsonify({'error': 'Email not found'}), 404
    return jsonify({'broadcast': broadcast, 'recipients': repo.recipients(broadcast_id)})


def _audit(user_id, broadcast_id, metadata):
    try:
        from services.admin_audit_service import AdminAuditService
        AdminAuditService(user_id=user_id).log_action(
            admin_id=user_id, action_type='crm_broadcast_sent',
            resource_type='crm_broadcast', resource_id=str(broadcast_id), metadata=metadata)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM broadcast audit log failed: {e}')
