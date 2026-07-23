"""
Organization announcements / broadcast.

Lets an org admin (or advisor) send a notification through Optio to everyone in
their organization — students, advisors, and/or parents. Delivery is via the
existing notification system (in-app bell + push); the `announcements` row is the
durable record.

Recipient resolution is role-correct: org members are matched by EFFECTIVE role
(org_managed users carry their real role in org_role), and parents are resolved per
student via NotificationService (parents are usually platform users outside the org,
so a plain organization_id filter would miss them).
"""

import re
import threading
import uuid

from flask import Blueprint, request, jsonify, current_app

from utils.auth.decorators import require_role
from utils.roles import get_effective_role
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('announcements', __name__)

ROLE_AUDIENCES = {'students', 'advisors', 'parents'}


@bp.route('/api/announcements', methods=['POST'])
@require_role('org_admin', 'advisor', 'superadmin')
def create_announcement(user_id):
    """Create an announcement and fan it out as notifications to the chosen audience."""
    try:
        admin = get_supabase_admin_client()
        data = request.json or {}
        title = (data.get('title') or '').strip()
        content = (data.get('content') or data.get('message') or '').strip()
        org_id = data.get('organization_id')

        if not title or not content:
            return jsonify({'success': False, 'error': 'Title and message are required'}), 400

        # Audiences: a multi-select list of roles. Falls back to the old single
        # `audience` field ('everyone' => all roles) for back-compat.
        audiences = data.get('audiences')
        if not audiences:
            single = (data.get('audience') or 'everyone')
            audiences = list(ROLE_AUDIENCES) if single == 'everyone' else [single]
        if isinstance(audiences, str):
            audiences = [audiences]
        audiences = [a for a in audiences if a in ROLE_AUDIENCES]
        if not audiences:
            return jsonify({'success': False, 'error': 'Select at least one audience'}), 400

        sender = admin.table('users')\
            .select('id, role, org_role, org_roles, organization_id')\
            .eq('id', user_id).single().execute().data
        sender_role = get_effective_role(sender) if sender else None
        if not org_id:
            org_id = sender.get('organization_id') if sender else None
        if not org_id:
            return jsonify({'success': False, 'error': 'No organization context'}), 400
        if sender_role != 'superadmin' and sender.get('organization_id') != org_id:
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        # Resolve org members by effective role
        members = admin.table('users')\
            .select('id, role, org_role, org_roles')\
            .eq('organization_id', org_id).execute().data or []
        students = [m for m in members if get_effective_role(m) == 'student']
        advisors = [m for m in members if get_effective_role(m) == 'advisor']

        from services.notification_service import NotificationService
        notifier = NotificationService()

        recipient_ids = set()
        if 'students' in audiences:
            recipient_ids.update(m['id'] for m in students)
        if 'advisors' in audiences:
            recipient_ids.update(m['id'] for m in advisors)
        if 'parents' in audiences:
            for s in students:
                try:
                    for p in (notifier.get_parents_for_student(s['id']) or []):
                        if p.get('id'):
                            recipient_ids.add(p['id'])
                except Exception as pe:
                    logger.warning(f"Could not resolve parents for student {s['id']}: {pe}")
        recipient_ids.discard(user_id)

        # Durable announcement record (best-effort; delivery still happens if this fails)
        announcement_id = None
        try:
            ins = admin.table('announcements').insert({
                'organization_id': org_id,
                'author_id': user_id,
                'title': title,
                'message': content,
                'target_audience': ('everyone' if set(audiences) == ROLE_AUDIENCES else ','.join(sorted(audiences))),
            }).execute()
            announcement_id = ins.data[0]['id'] if ins.data else None
        except Exception as ae:
            logger.warning(f"Announcement row insert failed (continuing): {ae}")

        preview = (content[:200] + '…') if len(content) > 200 else content
        sent = 0
        for rid in recipient_ids:
            try:
                notifier.create_notification(
                    user_id=rid,
                    notification_type='announcement',
                    title=title,
                    message=preview,
                    link='/notifications',
                    metadata={'announcement_id': announcement_id, 'audiences': audiences},
                    organization_id=org_id,
                )
                sent += 1
            except Exception as ne:
                logger.warning(f"Announcement notify failed for {rid}: {ne}")

        # Email fan-out (best-effort, fire-and-forget). Parents who never open
        # the app still get the announcement in their inbox. Runs in a daemon
        # thread — the established fire-and-forget pattern (routes/quest/classes.py).
        if recipient_ids:
            app = current_app._get_current_object()
            email_recipients = list(recipient_ids)

            def _email_fanout():
                with app.app_context():
                    try:
                        from services.announcement_email_service import send_announcement_emails
                        send_announcement_emails(org_id, title, content, email_recipients)
                    except Exception as ee:  # noqa: BLE001
                        logger.error(f"Announcement email fan-out failed: {ee}", exc_info=True)

            threading.Thread(target=_email_fanout, daemon=True).start()

        logger.info(f"Announcement '{title[:40]}' by {user_id[:8]} sent to {sent} ({','.join(audiences)})")
        return jsonify({'success': True, 'sent': sent, 'announcement_id': announcement_id})

    except Exception as e:
        logger.error(f"Error creating announcement: {e}")
        return jsonify({'success': False, 'error': 'Failed to send announcement'}), 500


@bp.route('/api/announcements', methods=['GET'])
@require_role('org_admin', 'advisor', 'superadmin', 'student', 'parent')
def list_announcements(user_id):
    """List recent announcements for the caller's organization."""
    try:
        admin = get_supabase_admin_client()
        sender = admin.table('users').select('organization_id')\
            .eq('id', user_id).single().execute().data
        org_id = request.args.get('organization_id') or (sender.get('organization_id') if sender else None)
        if not org_id:
            return jsonify({'success': True, 'announcements': []})

        rows = admin.table('announcements')\
            .select('id, title, message, target_audience, author_id, created_at')\
            .eq('organization_id', org_id)\
            .order('created_at', desc=True)\
            .limit(50).execute()
        announcements = [
            {**row, 'content': row.get('message')}
            for row in (rows.data or [])
        ]
        return jsonify({'success': True, 'announcements': announcements})
    except Exception as e:
        logger.error(f"Error listing announcements: {e}")
        return jsonify({'success': False, 'error': 'Failed to load announcements'}), 500


def _resolve_member_org(admin, user_id, user_row):
    """
    Resolve which org's announcements a user may read.

    Org members carry organization_id directly. Platform parents (organization_id
    NULL) are members-by-proxy of their children's org: check dependents
    (managed_by_parent_id) and approved parent_student_links.
    Returns an org id or None.
    """
    if user_row and user_row.get('organization_id'):
        return user_row['organization_id']

    # Parent path: find a child who belongs to an org.
    try:
        deps = admin.table('users').select('organization_id')\
            .eq('managed_by_parent_id', user_id)\
            .not_.is_('organization_id', 'null').limit(1).execute().data
        if deps:
            return deps[0]['organization_id']
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Archive org resolution (dependents) failed for {user_id[:8]}: {e}")

    try:
        links = admin.table('parent_student_links').select('student_user_id')\
            .eq('parent_user_id', user_id).eq('status', 'approved').execute().data or []
        student_ids = [l['student_user_id'] for l in links if l.get('student_user_id')]
        if student_ids:
            students = admin.table('users').select('organization_id')\
                .in_('id', student_ids[:100])\
                .not_.is_('organization_id', 'null').limit(1).execute().data
            if students:
                return students[0]['organization_id']
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Archive org resolution (links) failed for {user_id[:8]}: {e}")

    return None


@bp.route('/api/announcements/archive', methods=['GET'])
@require_role('org_admin', 'advisor', 'superadmin', 'student', 'parent')
def announcements_archive(user_id):
    """
    Paginated, searchable communications archive for the caller's org.

    Any member of the org can read it: students and parents see announcements
    targeted at their role (or org-wide); org_admin/advisor/superadmin see all.
    Platform parents of org students count as members (resolved via their kids).
    """
    try:
        admin = get_supabase_admin_client()

        user_row = admin.table('users')\
            .select('id, role, org_role, org_roles, organization_id')\
            .eq('id', user_id).single().execute().data
        effective_role = get_effective_role(user_row) if user_row else None

        member_org = _resolve_member_org(admin, user_id, user_row)
        requested_org = request.args.get('organization_id')
        if effective_role == 'superadmin':
            org_id = requested_org or member_org
        else:
            org_id = member_org
            if requested_org and requested_org != member_org:
                return jsonify({'success': False, 'error': 'Access denied'}), 403
        if not org_id:
            return jsonify({'success': True, 'announcements': [], 'total': 0,
                            'organization_name': None})

        try:
            limit = min(max(int(request.args.get('limit', 20)), 1), 50)
        except (TypeError, ValueError):
            limit = 20
        try:
            offset = max(int(request.args.get('offset', 0)), 0)
        except (TypeError, ValueError):
            offset = 0

        query = admin.table('announcements')\
            .select('id, title, message, target_audience, author_id, created_at',
                    count='exact')\
            .eq('organization_id', org_id)

        # Audience visibility: students/parents only see announcements that
        # target their role or the whole org. target_audience is 'everyone' or
        # a comma-joined role list (e.g. 'parents,students').
        audience_token = {'student': 'students', 'parent': 'parents'}.get(effective_role)
        if audience_token:
            query = query.or_(
                f"target_audience.eq.everyone,target_audience.ilike.%{audience_token}%"
            )

        q = (request.args.get('q') or '').strip()
        if q:
            # Strip PostgREST or= syntax characters so the filter can't break.
            safe = re.sub(r'[,()]', ' ', q)[:100].strip()
            if safe:
                query = query.or_(f"title.ilike.%{safe}%,message.ilike.%{safe}%")

        result = query.order('created_at', desc=True)\
            .range(offset, offset + limit - 1).execute()

        org_name = None
        try:
            org = admin.table('organizations').select('name')\
                .eq('id', org_id).single().execute().data
            org_name = org.get('name') if org else None
        except Exception:  # noqa: BLE001
            pass

        announcements = [
            {**row, 'content': row.get('message')}
            for row in (result.data or [])
        ]
        return jsonify({
            'success': True,
            'announcements': announcements,
            'total': result.count or 0,
            'organization_name': org_name,
            'limit': limit,
            'offset': offset,
        })
    except Exception as e:
        logger.error(f"Error loading announcements archive: {e}")
        return jsonify({'success': False, 'error': 'Failed to load archive'}), 500


def _resolve_admin_org(admin, user_id):
    """(org_id, effective_role, error_response) for the templates endpoints."""
    user_row = admin.table('users')\
        .select('id, role, org_role, org_roles, organization_id')\
        .eq('id', user_id).single().execute().data
    effective_role = get_effective_role(user_row) if user_row else None
    body = request.get_json(silent=True) or {}
    requested_org = request.args.get('organization_id') or body.get('organization_id')

    if effective_role == 'superadmin':
        org_id = requested_org or (user_row.get('organization_id') if user_row else None)
    else:
        org_id = user_row.get('organization_id') if user_row else None
        if requested_org and requested_org != org_id:
            return None, effective_role, (jsonify({'success': False, 'error': 'Access denied'}), 403)
    if not org_id:
        return None, effective_role, (jsonify({'success': False, 'error': 'No organization context'}), 400)
    return org_id, effective_role, None


@bp.route('/api/announcements/templates', methods=['GET'])
@require_role('org_admin', 'superadmin')
def get_announcement_templates(user_id):
    """Reusable message templates, stored in feature_flags.sis_settings.message_templates."""
    try:
        admin = get_supabase_admin_client()
        org_id, _, err = _resolve_admin_org(admin, user_id)
        if err:
            return err

        org = admin.table('organizations').select('feature_flags')\
            .eq('id', org_id).single().execute().data or {}
        settings = ((org.get('feature_flags') or {}).get('sis_settings') or {})
        templates = settings.get('message_templates') or []
        if not isinstance(templates, list):
            templates = []
        return jsonify({'success': True, 'templates': templates})
    except Exception as e:
        logger.error(f"Error loading announcement templates: {e}")
        return jsonify({'success': False, 'error': 'Failed to load templates'}), 500


@bp.route('/api/announcements/templates', methods=['PUT'])
@require_role('org_admin', 'superadmin')
def put_announcement_templates(user_id):
    """Replace the org's template list: [{id, name, title, body}]."""
    try:
        admin = get_supabase_admin_client()
        org_id, _, err = _resolve_admin_org(admin, user_id)
        if err:
            return err

        raw = (request.get_json(silent=True) or {}).get('templates')
        if not isinstance(raw, list):
            return jsonify({'success': False, 'error': 'templates must be a list'}), 400
        if len(raw) > 50:
            return jsonify({'success': False, 'error': 'Too many templates (max 50)'}), 400

        templates = []
        for item in raw:
            if not isinstance(item, dict):
                return jsonify({'success': False, 'error': 'Each template must be an object'}), 400
            name = str(item.get('name') or '').strip()[:120]
            if not name:
                return jsonify({'success': False, 'error': 'Each template needs a name'}), 400
            templates.append({
                'id': str(item.get('id') or uuid.uuid4()),
                'name': name,
                'title': str(item.get('title') or '').strip()[:300],
                'body': str(item.get('body') or '')[:10000],
            })

        org = admin.table('organizations').select('feature_flags')\
            .eq('id', org_id).single().execute().data or {}
        flags = org.get('feature_flags') or {}
        settings = flags.get('sis_settings') or {}
        admin.table('organizations').update({
            'feature_flags': {**flags, 'sis_settings': {**settings, 'message_templates': templates}}
        }).eq('id', org_id).execute()

        return jsonify({'success': True, 'templates': templates})
    except Exception as e:
        logger.error(f"Error saving announcement templates: {e}")
        return jsonify({'success': False, 'error': 'Failed to save templates'}), 500
