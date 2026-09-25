"""
CRM assistant console API (docs/CRM_AI_ASSISTANT_PLAN.md).

Superadmin-only, same prefix as routes/admin/crm.py: the Gmail connection, a
contact's working file (email, to-dos, drafts), and the client-org list.

THE HARD RULE: the AI drafts, it never sends. `send_draft` below is the only
route that sends email from the connected mailbox, and it runs only for a
signed-in superadmin who clicked Send. Nothing on a cron path reaches it
(test_crm_assistant.py (TestTheAiNeverSends)).
"""
from flask import Blueprint, jsonify, request

from repositories.crm_contact_repository import (
    TASK_STATUSES,
    CrmContactRepository,
    normalize_email,
)
from utils.auth.decorators import require_superadmin
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_crm_assistant', __name__, url_prefix='/api/admin/crm')


# admin client justified: crm_* tables are service-role only; every route
# here is behind require_superadmin.
from utils.admin_client import admin_client as _db


def _repo():
    return CrmContactRepository(client=_db())


def _audit(user_id, action_type, resource_type, resource_id, metadata=None):
    try:
        from services.admin_audit_service import AdminAuditService
        AdminAuditService(user_id=user_id).log_action(
            admin_id=user_id, action_type=action_type,
            resource_type=resource_type, resource_id=str(resource_id),
            metadata=metadata or {})
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM audit log failed ({action_type}): {e}')


def _valid_date(value):
    from datetime import datetime
    if not value:
        return True
    try:
        datetime.strptime(value, '%Y-%m-%d')
        return True
    except ValueError:
        return False


# -------------------------------------------------------------------- gmail

@bp.route('/gmail', methods=['GET'])
@require_superadmin
def gmail_status(user_id):
    from services.crm_gmail_service import status
    return jsonify(status())


@bp.route('/gmail/connect', methods=['POST'])
@require_superadmin
def gmail_connect(user_id):
    from services.crm_gmail_service import GmailNotConfigured, authorization_url
    try:
        url = authorization_url(user_id)
    except GmailNotConfigured:
        return jsonify({'error': 'Gmail is not set up on this server yet '
                                 '(GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET).'}), 503
    _audit(user_id, 'crm_gmail_connect_started', 'crm_mail_account', 'gmail')
    return jsonify({'url': url})


@bp.route('/gmail/disconnect', methods=['POST'])
@require_superadmin
def gmail_disconnect(user_id):
    from services.crm_gmail_service import disconnect, status
    disconnect()
    _audit(user_id, 'crm_gmail_disconnected', 'crm_mail_account', 'gmail')
    return jsonify(status())


@bp.route('/gmail/sync', methods=['POST'])
@require_superadmin
def gmail_sync_now(user_id):
    from services.crm_gmail_service import run_sync
    return jsonify(run_sync())


# ------------------------------------------------------------------ contact

@bp.route('/contact', methods=['GET'])
@require_superadmin
def get_contact(user_id):
    """One contact's working file, by email."""
    email = normalize_email(request.args.get('email'))
    if '@' not in email:
        return jsonify({'error': 'A valid email is required'}), 400
    repo = _repo()
    clients = repo.client_contact_emails()
    return jsonify({
        'email': email,
        'client_org': clients.get(email),
        'messages': repo.messages_for(email),
        'tasks': repo.tasks_for(email),
        'drafts': repo.drafts_for(email),
    })


# -------------------------------------------------------------------- tasks

@bp.route('/tasks/due', methods=['GET'])
@require_superadmin
def due_tasks(user_id):
    """Open to-dos due today (Mountain) or earlier, for the Today tab."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    today = datetime.now(ZoneInfo('America/Denver')).date().isoformat()
    tasks = _repo().due_tasks(today)
    return jsonify({'today': today, 'tasks': tasks, 'links': _repo().file_links(
        sorted({t['contact_email'] for t in tasks}))})


@bp.route('/tasks', methods=['POST'])
@require_superadmin
def create_task(user_id):
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get('email'))
    title = (data.get('title') or '').strip()
    if '@' not in email or not title:
        return jsonify({'error': 'A contact and a to-do are required'}), 400
    if not _valid_date(data.get('due_on')):
        return jsonify({'error': 'Due date must be YYYY-MM-DD'}), 400
    task = _repo().create_task(email, title[:500], due_on=data.get('due_on') or None,
                               detail=(data.get('detail') or '').strip() or None,
                               created_by=user_id)
    return jsonify({'task': task}), 201


@bp.route('/tasks/<task_id>', methods=['PUT'])
@require_superadmin
def update_task(user_id, task_id):
    data = request.get_json(silent=True) or {}
    fields = {}
    if 'title' in data:
        title = (data.get('title') or '').strip()
        if not title:
            return jsonify({'error': 'A to-do needs a title'}), 400
        fields['title'] = title[:500]
    if 'due_on' in data:
        if not _valid_date(data.get('due_on')):
            return jsonify({'error': 'Due date must be YYYY-MM-DD'}), 400
        fields['due_on'] = data.get('due_on') or None
    if 'detail' in data:
        fields['detail'] = (data.get('detail') or '').strip() or None
    if 'status' in data:
        if data['status'] not in TASK_STATUSES:
            return jsonify({'error': 'Unknown status'}), 400
        fields['status'] = data['status']
    if not fields:
        return jsonify({'error': 'Nothing to change'}), 400
    task = _repo().update_task(task_id, fields)
    if not task:
        return jsonify({'error': 'To-do not found'}), 404
    return jsonify({'task': task})


# ------------------------------------------------------------------- drafts

@bp.route('/drafts', methods=['POST'])
@require_superadmin
def create_draft(user_id):
    """Start a draft, new or as a reply to a stored message."""
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get('email'))
    if '@' not in email:
        return jsonify({'error': 'A valid email is required'}), 400
    repo = _repo()
    fields = {
        'contact_email': email,
        'to_email': normalize_email(data.get('to_email')) or email,
        'subject': (data.get('subject') or '').strip()[:500],
        'body_text': data.get('body_text') or '',
        'origin': 'manual',
    }
    reply_thread = (data.get('thread_id') or '').strip()
    if reply_thread:
        latest = repo.latest_message_in_thread(reply_thread)
        if not latest or email not in (
                [latest['from_email'], *latest.get('to_emails', []), *latest.get('cc_emails', [])]):
            return jsonify({'error': 'That thread is not with this contact'}), 400
        subject = latest.get('subject') or ''
        fields.update({
            'thread_id': reply_thread,
            'in_reply_to': latest.get('rfc_message_id'),
            'subject': fields['subject'] or (
                subject if subject.lower().startswith('re:') else f'Re: {subject}'.strip()),
        })
    draft = repo.create_draft(fields)
    return jsonify({'draft': draft}), 201


@bp.route('/drafts/<draft_id>', methods=['PUT'])
@require_superadmin
def update_draft(user_id, draft_id):
    data = request.get_json(silent=True) or {}
    fields = {}
    if 'to_email' in data:
        to_email = normalize_email(data.get('to_email'))
        if '@' not in to_email:
            return jsonify({'error': 'A valid recipient is required'}), 400
        fields['to_email'] = to_email
    if 'subject' in data:
        fields['subject'] = (data.get('subject') or '').strip()[:500]
    if 'body_text' in data:
        fields['body_text'] = data.get('body_text') or ''
    if not fields:
        return jsonify({'error': 'Nothing to change'}), 400
    draft = _repo().update_draft(draft_id, fields)
    if not draft:
        return jsonify({'error': 'Draft not found, or already sent'}), 404
    return jsonify({'draft': draft})


@bp.route('/drafts/<draft_id>/discard', methods=['POST'])
@require_superadmin
def discard_draft(user_id, draft_id):
    draft = _repo().update_draft(draft_id, {'status': 'discarded'})
    if not draft:
        return jsonify({'error': 'Draft not found, or already sent'}), 404
    return jsonify({'draft': draft})


@bp.route('/drafts/<draft_id>/send', methods=['POST'])
@require_superadmin
def send_draft(user_id, draft_id):
    """Send a draft. The person clicking Send is the approval.

    Saves the latest edit first, so what is on screen is what goes out.
    """
    from services.crm_gmail_service import (
        GmailNotConnected,
        GmailSendError,
        send_approved_draft,
    )
    repo = _repo()
    data = request.get_json(silent=True) or {}
    edits = {k: data[k] for k in ('to_email', 'subject', 'body_text') if k in data}
    if 'to_email' in edits:
        edits['to_email'] = normalize_email(edits['to_email'])
    draft = repo.update_draft(draft_id, edits) if edits else repo.get_draft(draft_id)
    if not draft:
        return jsonify({'error': 'Draft not found, or already sent'}), 404
    try:
        sent = send_approved_draft(draft, approved_by=user_id)
    except GmailNotConnected:
        return jsonify({'error': 'Gmail is not connected. Connect it on the Today tab.'}), 409
    except GmailSendError as e:
        return jsonify({'error': str(e)}), 409
    _audit(user_id, 'crm_email_sent', 'crm_draft', draft_id,
           {'to': sent.get('to_email'), 'origin': sent.get('origin')})
    return jsonify({'draft': sent})


# ------------------------------------------------------------------ clients

def _client_orgs_payload():
    """Every active org, marked when it is a microschool client."""
    repo = _repo()
    selected = set(repo.client_org_ids())
    orgs = repo.active_orgs()
    return {'orgs': [{**o, 'is_client': o['id'] in selected} for o in orgs]}


@bp.route('/client-orgs', methods=['GET'])
@require_superadmin
def list_client_orgs(user_id):
    return jsonify(_client_orgs_payload())


@bp.route('/client-orgs', methods=['PUT'])
@require_superadmin
def set_client_orgs(user_id):
    data = request.get_json(silent=True) or {}
    org_ids = data.get('org_ids')
    if not isinstance(org_ids, list) or not all(isinstance(i, str) for i in org_ids):
        return jsonify({'error': 'org_ids must be a list'}), 400
    _repo().set_client_org_ids(sorted(set(org_ids)))
    _audit(user_id, 'crm_client_orgs_set', 'crm_settings', 'client_org_ids',
           {'count': len(set(org_ids))})
    return jsonify(_client_orgs_payload())
