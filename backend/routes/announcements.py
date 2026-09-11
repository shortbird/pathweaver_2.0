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

import uuid

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.roles import get_effective_role
from utils.sis_roles import ADMIN_ROLES, STAFF_ROLES
from utils.validation.sanitizers import pgrst_pattern
from database import get_supabase_admin_client
from services import announcement_service, sis_service
from utils.db_fetch import fetch_all_rows
from utils.pagination import fetch_range
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('announcements', __name__)

ROLE_AUDIENCES = announcement_service.ROLE_AUDIENCES


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

        # Whose view this is. An SIS admin on "View portal" is reading the
        # teacher chrome and expects the teacher's answer, so the filter below
        # runs against the PREVIEWED staff member: their role decides the
        # audience token, their id decides the received-snapshot list.
        # Without this the preview answered as the admin, and org_admin is in
        # _ARCHIVE_SEES_ALL — so "as a teacher" showed every announcement in
        # the school, including a send addressed to five named teachers read as
        # a teacher who was not one of them (iCreate, 2026-08-31, 0a10f2ae).
        # resolve_preview_target enforces the portal's rule: admin caller, target
        # in the same org, reads only.
        viewer_id = sis_service.resolve_preview_target(
            user_id, org_id, request.args.get('teacher_id')) or user_id

        # Staff see everything; a student or parent calling this endpoint gets
        # the same audience filter the archive applies — without it, a
        # teachers-only notice was readable by any family that hit the API.
        caller = admin.table('users').select('role, org_role, org_roles')\
            .eq('id', viewer_id).single().execute().data or {}
        # ?view_as, honoured exactly as the archive honours it. Without this
        # the two routes answered the same caller differently: an admin
        # previewing a teacher's portal reads this list, and org_admin is in
        # _ARCHIVE_SEES_ALL, so the preview showed every announcement in the
        # school -- including a send addressed to five named teachers, being
        # read "as" a teacher who was not one of them (iCreate, 2026-08-31,
        # 0a10f2ae: "I sent this announcement to only 5 teachers but it's
        # showing up in my preview for a teacher I didn't send it to").
        #
        # It can only ever NARROW: _archive_audience_token returns a token for
        # the previewed role, and a token means the audience filter runs where
        # it previously did not.
        audience_token = _archive_audience_token(get_effective_role(caller),
                                                 request.args.get('view_as'))
        query = admin.table('announcements')\
            .select('id, title, message, target_audience, author_id, created_at, '
                    'last_nudged_at, source_announcement_id, in_app, attachments')\
            .eq('organization_id', org_id)
        if audience_token:
            # Email-only sends never reach the app: families must not read one
            # in-app that the office chose to keep out of the app.
            query = query.eq('in_app', True)
            # Targeted sends are snapshot-only, same as the archive: the role
            # token inside "parents (1 class)" must not widen a narrowed send
            # to every parent in the org.
            clauses = [
                'target_audience.eq.everyone',
                f'and(target_audience.ilike.%{pgrst_pattern(audience_token)}%,'
                f'is_targeted.eq.false)',
            ]
            received = _received_announcement_ids(admin, viewer_id)
            if received:
                clauses.append(f'id.in.({",".join(received)})')
            query = query.or_(','.join(clauses))
        rows = query.order('created_at', desc=True).limit(50).execute()
        announcements = [
            {**row, 'content': row.get('message')}
            for row in (rows.data or [])
        ]
        # Attachment pointers are private-bucket URLs; hand out signed twins.
        from services import messaging_extras_service as msg_extras
        msg_extras.sign_attachments(announcements)
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
            # Sender names, for the history's "by who sent them" filter on the
            # SIS inbox composer (iCreate, 2026-08-31). One query for the page.
            author_ids = list({a['author_id'] for a in announcements
                               if a.get('author_id')})
            names = {}
            if author_ids:
                try:
                    urows = admin.table('users')\
                        .select('id, display_name, first_name, last_name')\
                        .in_('id', author_ids).execute().data or []
                    names = {
                        u['id']: (u.get('display_name')
                                  or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip())
                        for u in urows
                    }
                except Exception as ne:  # noqa: BLE001 — names must not sink the list
                    logger.warning(f"Announcement author names unavailable: {ne}")
            for a in announcements:
                a['author_name'] = names.get(a.get('author_id')) or None
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

        # Deletes the row and sweeps the bell notifications that point at it,
        # so the message doesn't survive its own deletion in everyone's list.
        announcement_service.retract(announcement_id)
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
                # not a uuid: drop it, do not fail the batch
                continue
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
        #
        # Both reads are one row per announcement, never one row per recipient:
        # pulling the whole snapshot for a batch of ids is an org-sized read
        # that PostgREST truncates at 1000 rows without saying so, and the
        # dropped tail reads as "no snapshot", silently handing the caller
        # read credit for sends they were never on.
        if valid:
            stats = admin.table('announcement_read_stats')\
                .select('announcement_id, recipient_count')\
                .in_('announcement_id', valid).execute().data or []
            # recipient_count is NULL for sends made before snapshots existed.
            snapshotted = {r['announcement_id'] for r in stats if r.get('recipient_count')}
            # PK is (announcement_id, user_id), so this is at most one row per id.
            mine = {r['announcement_id'] for r in (
                admin.table('announcement_recipients').select('announcement_id')
                .in_('announcement_id', valid).eq('user_id', user_id)
                .execute().data or [])}
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


_AUDIENCE_TOKENS = {'student': 'students', 'parent': 'parents',
                    'advisor': 'advisors'}

# Who keeps the unfiltered view: the front office. They are the people who SEND
# announcements and field the questions about them, and a coordinator's
# restriction is financial, not scope-based. A teacher is not front office.
_ARCHIVE_SEES_ALL = ('superadmin', 'org_admin', 'campus_coordinator')


def _family_audience_token(user_row):
    """The archive token for the caller's FAMILY role, if they hold one.

    Staff who are also parents at the school read two different pages out of one
    endpoint. The front office keeps the unfiltered view on the SIS side, but
    the family home is that same person's parent view, and a staff-only notice
    surfacing there reads as a leak: a coordinator posted a teachers-only
    message and found it on her own parent dashboard (iCreate, 2026-08-28 —
    "I created an announcement and said to mark it visible to only teachers.
    It still sent to me as a parent"). Callers that ARE a family surface ask for
    this with ?family_view=1; it can only narrow what they would otherwise see.
    """
    if not user_row:
        return None
    held = {user_row.get('role'), user_row.get('org_role')}
    held |= set(user_row.get('org_roles') or [])
    for role in ('parent', 'student'):
        if role in held:
            return _AUDIENCE_TOKENS[role]
    return None


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

    Any member of the org can read it: students, parents AND teachers see
    announcements targeted at their role (or org-wide) plus anything addressed
    to them by name; the front office (org_admin, campus_coordinator,
    superadmin) sees all. This said "advisor" was in the sees-all set long after
    it was taken out of _ARCHIVE_SEES_ALL for sending a students-only notice to
    a teacher, and a stale docstring is how that comes back.
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

        # Audience visibility: students/parents only see announcements that
        # target their role or the whole org. target_audience is 'everyone' or
        # a comma-joined role list (e.g. 'parents,students').
        audience_token = _archive_audience_token(effective_role,
                                                 request.args.get('view_as'))
        # A family surface asking for the family view: narrow to the caller's
        # own parent/student role even when their staff role would see all.
        if request.args.get('family_view') in ('1', 'true', 'yes'):
            audience_token = _family_audience_token(user_row) or audience_token
        audience_or = None
        if audience_token:
            # The role token matches only UNTARGETED sends: "parents (1 class;
            # ages 15+)" contains 'parents', and without the is_targeted guard
            # every parent in the org read a one-class notice in their archive
            # (iCreate, 2026-08-26). Targeted rows reach exactly their snapshot
            # recipients through the id list below.
            clauses = [
                'target_audience.eq.everyone',
                f'and(target_audience.ilike.%{pgrst_pattern(audience_token)}%,'
                f'is_targeted.eq.false)',
            ]
            # ...plus anything actually addressed to them, which the role label
            # alone cannot express for a narrowed send.
            received = _received_announcement_ids(admin, user_id)
            if received:
                clauses.append(f'id.in.({",".join(received)})')
            audience_or = ','.join(clauses)

        q = (request.args.get('q') or '').strip()
        search_or = None
        if q:
            # pgrst_pattern strips the PostgREST filter metacharacters, so the
            # value cannot end the ilike clause and start another one.
            safe = pgrst_pattern(q)
            if safe:
                search_or = (f'title.ilike.%{pgrst_pattern(safe)}%,'
                             f'message.ilike.%{pgrst_pattern(safe)}%')

        # Built by a factory, not once: fetch_range needs a fresh builder if
        # ?offset= turns out to start past the last row.
        def build_query():
            query = admin.table('announcements')\
                .select('id, title, message, target_audience, author_id, created_at, '
                        'source_announcement_id, attachments',
                        count='exact')\
                .eq('organization_id', org_id)\
                .eq('in_app', True)
            if audience_or:
                query = query.or_(audience_or)
            if search_or:
                query = query.or_(search_or)
            return query.order('created_at', desc=True)

        # ?offset= is the client's, so it can point past the end of a filtered
        # archive. PostgREST answers that with 416, not an empty page.
        result = fetch_range(build_query, offset, limit)

        org_name = None
        try:
            org = admin.table('organizations').select('name')\
                .eq('id', org_id).single().execute().data
            org_name = org.get('name') if org else None
        except Exception as _exc:  # noqa: BLE001
            logger.debug("org name lookup failed: %s", _exc, exc_info=True)

        announcements = [
            {**row, 'content': row.get('message')}
            for row in (result.data or [])
        ]
        # Attachment pointers are private-bucket URLs; hand out signed twins.
        from services import messaging_extras_service as msg_extras
        msg_extras.sign_attachments(announcements)
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
