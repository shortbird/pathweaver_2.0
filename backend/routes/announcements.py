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

from flask import Blueprint, request, jsonify

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
                'content': content,
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
            .select('id, title, content, target_audience, author_id, created_at')\
            .eq('organization_id', org_id)\
            .order('created_at', desc=True)\
            .limit(50).execute()
        return jsonify({'success': True, 'announcements': rows.data or []})
    except Exception as e:
        logger.error(f"Error listing announcements: {e}")
        return jsonify({'success': False, 'error': 'Failed to load announcements'}), 500
