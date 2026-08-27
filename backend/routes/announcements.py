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
import uuid

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.roles import get_effective_role
from utils.sis_roles import ADMIN_ROLES, STAFF_ROLES
from utils.validation.sanitizers import pgrst_pattern
from database import get_supabase_admin_client
from services import announcement_service, sis_service
from utils.db_fetch import fetch_all_rows
from utils import rich_text
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('announcements', __name__)

ROLE_AUDIENCES = announcement_service.ROLE_AUDIENCES


# The tiers, not hand-written tuples: campus_coordinator reached `archive` and
# nothing else here, so a coordinator on the Messaging page could read the
# history of announcements and neither send one nor see the current list. That
# is the failure utils/sis_roles.py exists to stop — one literal updated, the
# neighbours missed.
@bp.route('/api/announcements', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_announcement(user_id):
    """Create an announcement and fan it out as notifications to the chosen audience.

    The storing/fan-out itself lives in services/announcement_service.py, because
    the SIS Community Hub composer publishes through the same path.
    """
    try:
        # admin client justified: role-gated org broadcast — sender's effective role/org is resolved here and the fan-out writes notifications to every member of the org
        admin = get_supabase_admin_client()
        data = request.json or {}
        title = (data.get('title') or '').strip()
        content = (data.get('content') or data.get('message') or '').strip()
        org_id = data.get('organization_id')

        # An empty editor still posts markup ("<p></p>"), so emptiness is judged
        # on the text, not the string.
        if not title or not rich_text.to_text(content).strip():
            return jsonify({'success': False, 'error': 'Title and message are required'}), 400

        audiences = announcement_service.normalize_audiences(
            data.get('audiences'), fallback=data.get('audience'))
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

        # Targeting is optional and ANDed: classes, teachers, an age range.
        # Absent all of them this is the school-wide send it has always been.
        def _int(v):
            try:
                return int(v)
            except (TypeError, ValueError):
                return None

        class_ids = [c for c in (data.get('class_ids') or []) if c]
        teacher_ids = [t for t in (data.get('teacher_ids') or []) if t]

        # An advisor sends to their OWN classes, nothing wider. The sidebar
        # hides the Messaging page from teachers but the route and this POST
        # were reachable, and the send was unscoped — any advisor could email
        # the whole school. class_scope is the same fence every other
        # teacher-facing SIS read uses: None means unrestricted (admin tier);
        # a list means "these classes and no others". Targeting other teachers
        # stays an admin move.
        scope = sis_service.class_scope(user_id, org_id) \
            if sender_role != 'superadmin' else None
        if scope is not None:
            if teacher_ids:
                return jsonify({'success': False,
                                'error': 'Only the front office can message other teachers'}), 403
            if not class_ids:
                return jsonify({'success': False,
                                'error': 'Pick one of your classes to message'}), 403
            if not set(class_ids) <= set(scope):
                return jsonify({'success': False,
                                'error': 'You can only message classes you teach'}), 403
        min_age, max_age = _int(data.get('min_age')), _int(data.get('max_age'))
        student_ids = announcement_service.targeted_student_ids(
            org_id, class_ids=class_ids, teacher_ids=teacher_ids,
            min_age=min_age, max_age=max_age)
        advisor_ids = announcement_service.targeted_advisor_ids(
            org_id, class_ids=class_ids, teacher_ids=teacher_ids)
        nobody_students = student_ids is not None and not student_ids
        nobody_advisors = advisor_ids is not None and not advisor_ids
        # "Nobody matches" is judged against the audiences actually chosen: a
        # teachers-only send to a class with no students is still a real send.
        wants_students = bool({'students', 'parents'} & set(audiences))
        wants_advisors = 'advisors' in audiences
        if ((not wants_advisors and nobody_students)
                or (not wants_students and nobody_advisors)
                or (nobody_students and nobody_advisors)):
            return jsonify({'success': False,
                            'error': 'Nobody matches that selection'}), 400

        # Default True: every existing caller (Community Hub, scripts) keeps
        # emailing. The SIS Messaging composer sends the flag explicitly.
        send_email = data.get('send_email')
        send_email = True if send_email is None else bool(send_email)

        result = announcement_service.publish(
            org_id, user_id, title, content, audiences,
            student_ids=student_ids, send_email=send_email,
            advisor_ids=advisor_ids,
            target_label=announcement_service.target_label(
                audiences, class_ids, teacher_ids, min_age, max_age))
        return jsonify({'success': True, **result})

    except Exception as e:
        logger.error(f"Error creating announcement: {e}")
        return jsonify({'success': False, 'error': 'Failed to send announcement'}), 500


@bp.route('/api/announcements', methods=['GET'])
@require_role(*STAFF_ROLES, 'student', 'parent')
def list_announcements(user_id):
    """List recent announcements for the caller's organization."""
    try:
        # admin client justified: reads the org-level announcements table for the caller's org; org resolved from the caller's own users row
        admin = get_supabase_admin_client()
        sender = admin.table('users').select('organization_id')\
            .eq('id', user_id).single().execute().data
        org_id = request.args.get('organization_id') or (sender.get('organization_id') if sender else None)
        if not org_id:
            return jsonify({'success': True, 'announcements': []})

        # Staff see everything; a student or parent calling this endpoint gets
        # the same audience filter the archive applies — without it, a
        # teachers-only notice was readable by any family that hit the API.
        caller = admin.table('users').select('role, org_role, org_roles')\
            .eq('id', user_id).single().execute().data or {}
        audience_token = _archive_audience_token(get_effective_role(caller), None)
        query = admin.table('announcements')\
            .select('id, title, message, target_audience, author_id, created_at, '
                    'last_nudged_at')\
            .eq('organization_id', org_id)
        if audience_token:
            query = query.or_(
                f'target_audience.eq.everyone,'
                f'target_audience.ilike.%{pgrst_pattern(audience_token)}%'
            )
        rows = query.order('created_at', desc=True).limit(50).execute()
        announcements = [
            {**row, 'content': row.get('message')}
            for row in (rows.data or [])
        ]
        # Read stats, for the staff view only (audience_token is None exactly
        # for the staff tiers + superadmin). One query against the aggregate
        # view for the whole page — never a count per row, never raw read rows
        # into Python. recipient_count is None for sends that predate the
        # snapshot; the UI shows those as "no data", not "nobody".
        if audience_token is None and announcements:
            stats = {}
            try:
                srows = admin.table('announcement_read_stats')\
                    .select('announcement_id, recipient_count, read_count')\
                    .in_('announcement_id', [a['id'] for a in announcements])\
                    .execute().data or []
                stats = {s['announcement_id']: s for s in srows}
            except Exception as se:  # noqa: BLE001 — stats must not sink the list
                logger.warning(f"Announcement read stats unavailable: {se}")
            for a in announcements:
                s = stats.get(a['id']) or {}
                a['read_count'] = s.get('read_count') or 0
                a['recipient_count'] = s.get('recipient_count')
        return jsonify({'success': True, 'announcements': announcements})
    except Exception as e:
        logger.error(f"Error listing announcements: {e}")
        return jsonify({'success': False, 'error': 'Failed to load announcements'}), 500


@bp.route('/api/announcements/<announcement_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def delete_announcement(user_id, announcement_id):
    """Delete a sent announcement's durable row (and its bell notifications).

    Until this existed there was no way to take a sent announcement down: the
    Community Hub delete removes the sis_announcements board copy only, so the
    row published from the Messaging page stayed in "Recent announcements" and
    in the family archive forever (iCreate, 2026-08-22). Admin tier may delete
    anything in their org; an advisor only their own."""
    try:
        # admin client justified: org-scoped delete, role + author checks below
        admin = get_supabase_admin_client()
        caller = admin.table('users')\
            .select('role, org_role, org_roles, organization_id')\
            .eq('id', user_id).single().execute().data or {}
        effective_role = get_effective_role(caller)

        row = admin.table('announcements')\
            .select('id, organization_id, author_id')\
            .eq('id', announcement_id).limit(1).execute().data
        if not row:
            return jsonify({'success': False, 'error': 'Announcement not found'}), 404
        row = row[0]

        if effective_role != 'superadmin' and \
                row.get('organization_id') != caller.get('organization_id'):
            return jsonify({'success': False, 'error': 'Access denied'}), 403
        if effective_role not in (*ADMIN_ROLES, 'superadmin') and \
                row.get('author_id') != user_id:
            return jsonify({'success': False, 'error': 'Only the sender or an admin can delete this'}), 403

        admin.table('announcements').delete().eq('id', announcement_id).execute()
        # Best-effort: pull the bell notifications that point at it, so the
        # message doesn't survive its own deletion in everyone's notification
        # list. Failure here still leaves the announcement gone.
        try:
            admin.table('notifications').delete()\
                .eq('notification_type', 'announcement')\
                .filter('metadata->>announcement_id', 'eq', announcement_id).execute()
        except Exception as ne:  # noqa: BLE001
            logger.warning(f"Announcement {announcement_id} deleted but notifications not swept: {ne}")
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error deleting announcement: {e}")
        return jsonify({'success': False, 'error': 'Failed to delete announcement'}), 500


@bp.route('/api/announcements/mark-read', methods=['POST'])
@require_role(*STAFF_ROLES, 'student', 'parent')
def mark_announcements_read(user_id):
    """Record that the caller has read these announcements. Idempotent.

    Body: {announcement_ids: [uuid, ...]} — at most 50 per call. Same role
    gate and org resolution as the archive (member_org_id, so a platform
    parent counts through their children); ids outside the caller's org are
    silently dropped rather than erroring, since a stale id in a batch should
    not lose the rest.
    """
    try:
        data = request.json or {}
        raw_ids = data.get('announcement_ids')
        if not isinstance(raw_ids, list) or not raw_ids:
            return jsonify({'success': False,
                            'error': 'announcement_ids must be a non-empty list'}), 400
        if len(raw_ids) > 50:
            return jsonify({'success': False,
                            'error': 'At most 50 announcement_ids per call'}), 400
        ids = []
        for raw in raw_ids:
            try:
                ids.append(str(uuid.UUID(str(raw))))
            except (TypeError, ValueError, AttributeError):
                continue  # not a uuid — drop it, don't fail the batch
        if not ids:
            return jsonify({'success': False,
                            'error': 'No valid announcement ids'}), 400

        # admin client justified: announcement_reads is deny-all RLS (backend
        # only); the caller writes only rows keyed to their own user_id, and
        # ids are fenced to their org first.
        admin = get_supabase_admin_client()
        caller = admin.table('users').select('role, org_role, org_roles')\
            .eq('id', user_id).single().execute().data or {}

        query = admin.table('announcements').select('id').in_('id', ids)
        if get_effective_role(caller) != 'superadmin':
            org_id = sis_service.member_org_id(user_id)
            if not org_id:
                return jsonify({'success': True, 'marked': 0})
            query = query.eq('organization_id', org_id)
        valid = [r['id'] for r in (query.execute().data or [])]

        # Only a person the announcement was actually sent to can register as
        # having read it. Being in the org was enough before, so anyone opening
        # the school page added to the numerator of a send they were never part
        # of -- iCreate has announcements sitting at 71 reads against 0
        # recipients. Sends made before recipient snapshots existed have no
        # snapshot to check, so they keep the old behaviour; the read view
        # reports no ratio for those anyway.
        if valid:
            snapshot = admin.table('announcement_recipients')\
                .select('announcement_id, user_id').in_('announcement_id', valid)\
                .execute().data or []
            snapshotted = {r['announcement_id'] for r in snapshot}
            mine = {r['announcement_id'] for r in snapshot if r.get('user_id') == user_id}
            valid = [i for i in valid if i not in snapshotted or i in mine]

        if valid:
            admin.table('announcement_reads').upsert(
                [{'announcement_id': aid, 'user_id': user_id} for aid in valid],
                on_conflict='announcement_id,user_id', ignore_duplicates=True,
            ).execute()
        return jsonify({'success': True, 'marked': len(valid)})
    except Exception as e:
        logger.error(f"Error marking announcements read: {e}")
        return jsonify({'success': False, 'error': 'Failed to mark as read'}), 500


@bp.route('/api/announcements/<announcement_id>/nudge', methods=['POST'])
@require_role(*STAFF_ROLES)
def nudge_announcement(user_id, announcement_id):
    """Remind everyone who was sent this announcement and hasn't read it.

    Admin tier (org_admin, campus_coordinator, superadmin) may nudge any of
    the org's sends; an advisor only their own — the same ownership fence as
    DELETE. The service refuses (409) inside a 24h cooldown or when no
    recipient snapshot exists (messages sent before read receipts)."""
    try:
        # admin client justified: org-scoped fan-out; role + author checks below
        admin = get_supabase_admin_client()
        caller = admin.table('users')\
            .select('role, org_role, org_roles, organization_id')\
            .eq('id', user_id).single().execute().data or {}
        effective_role = get_effective_role(caller)

        row = admin.table('announcements')\
            .select('id, organization_id, author_id, title, message, last_nudged_at')\
            .eq('id', announcement_id).limit(1).execute().data
        if not row:
            return jsonify({'success': False, 'error': 'Announcement not found'}), 404
        row = row[0]

        if effective_role != 'superadmin' and \
                row.get('organization_id') != caller.get('organization_id'):
            return jsonify({'success': False, 'error': 'Access denied'}), 403
        if effective_role not in (*ADMIN_ROLES, 'superadmin') and \
                row.get('author_id') != user_id:
            return jsonify({'success': False,
                            'error': 'Only the sender or an admin can send reminders for this'}), 403

        result = announcement_service.nudge(row)
        if result.get('error'):
            return jsonify({'success': False, 'error': result['error']}), \
                result.get('status', 400)
        return jsonify({'success': True, **result})
    except Exception as e:
        logger.error(f"Error nudging announcement: {e}")
        return jsonify({'success': False, 'error': 'Failed to send reminders'}), 500


_AUDIENCE_TOKENS = {'student': 'students', 'parent': 'parents',
                    'advisor': 'advisors'}

# Who keeps the unfiltered view: the front office. They are the people who SEND
# announcements and field the questions about them, and a coordinator's
# restriction is financial, not scope-based. A teacher is not front office.
_ARCHIVE_SEES_ALL = ('superadmin', 'org_admin', 'campus_coordinator')


def _archive_audience_token(effective_role, view_as):
    """Audience filter for the archive.

    Members are filtered by their own role; a superadmin previewing a school
    page (?view_as) is filtered by the previewed role, and with no view_as sees
    everything, as before. Nobody else's view_as is honored.

    Teachers used to be in the sees-everything set too, which meant a message
    sent to ten named students turned up in a teacher's announcements
    (iCreate, 2026-08-26: Emerson Gowdy received a students-only send; she was
    not among its ten recipients). They are now filtered like any other member,
    and reach anything actually addressed to them through the recipient
    snapshot instead.
    """
    if effective_role == 'superadmin':
        return _AUDIENCE_TOKENS.get(view_as)
    if effective_role in _ARCHIVE_SEES_ALL:
        return None
    return _AUDIENCE_TOKENS.get(effective_role)


def _received_announcement_ids(admin, user_id):
    """Announcements this user was actually sent, from the recipient snapshot.

    Targeting is finer than the role label: a send narrowed to one class writes
    a snapshot naming exactly those people, while target_audience only records
    'parents (1 class)'. Without this, a class-targeted message would be missing
    from its own recipients' archive as soon as the role token stopped matching.
    """
    try:
        rows = fetch_all_rows(lambda: (
            admin.table('announcement_recipients')
            .select('announcement_id')
            .eq('user_id', user_id)
        ))
        return [r['announcement_id'] for r in rows if r.get('announcement_id')]
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not read announcement recipients for {user_id}: {e}')
        return []


@bp.route('/api/announcements/archive', methods=['GET'])
@require_role(*STAFF_ROLES, 'student', 'parent')
def announcements_archive(user_id):
    """
    Paginated, searchable communications archive for the caller's org.

    Any member of the org can read it: students and parents see announcements
    targeted at their role (or org-wide); org_admin, campus_coordinator,
    advisor and superadmin see all (no audience token), so staff always see a
    superset of what any family member sees.
    Platform parents of org students count as members (resolved via their kids).
    """
    try:
        # admin client justified: org archive read incl. platform parents with no organization_id (membership resolved via their children); audience filtering applied in-query
        admin = get_supabase_admin_client()

        user_row = admin.table('users')\
            .select('id, role, org_role, org_roles, organization_id')\
            .eq('id', user_id).single().execute().data
        effective_role = get_effective_role(user_row) if user_row else None

        # Platform parents have no organization_id of their own; they are
        # members through their children (shared with the Community feed).
        member_org = sis_service.member_org_id(user_id)
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
        audience_token = _archive_audience_token(effective_role,
                                                 request.args.get('view_as'))
        if audience_token:
            clauses = [
                'target_audience.eq.everyone',
                f'target_audience.ilike.%{pgrst_pattern(audience_token)}%',
            ]
            # ...plus anything actually addressed to them, which the role label
            # alone cannot express for a narrowed send.
            received = _received_announcement_ids(admin, user_id)
            if received:
                clauses.append(f'id.in.({",".join(received)})')
            query = query.or_(','.join(clauses))

        q = (request.args.get('q') or '').strip()
        if q:
            # pgrst_pattern strips the PostgREST filter metacharacters, so the
            # value cannot end the ilike clause and start another one.
            safe = pgrst_pattern(q)
            if safe:
                query = query.or_(
                    f'title.ilike.%{pgrst_pattern(safe)}%,'
                    f'message.ilike.%{pgrst_pattern(safe)}%'
                )

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
@require_role(*ADMIN_ROLES)
def get_announcement_templates(user_id):
    """Reusable message templates, stored in feature_flags.sis_settings.message_templates."""
    try:
        # admin client justified: org_admin/superadmin-gated read of organizations.feature_flags (org row, not caller-owned); org pinned by _resolve_admin_org
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
@require_role(*ADMIN_ROLES)
def put_announcement_templates(user_id):
    """Replace the org's template list: [{id, name, title, body}]."""
    try:
        # admin client justified: org_admin/superadmin-gated write to organizations.feature_flags for the caller's own org (pinned by _resolve_admin_org)
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
