"""
Credit Review feedback thread.

Two-way conversation on a task's credit submission: the reviewer's "Grow This"
feedback lives in diploma_review_rounds, but this thread lets the student reply and
ask questions (and the reviewer answer) without resubmitting evidence.

Accessible to the student who owns the completion and to reviewers (superadmin, or
an org_admin/advisor in the student's organization). Student-facing copy is branded
"Optio" rather than naming the org admin.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from utils.roles import get_effective_role, get_effective_roles
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('credit_messages', __name__)

REVIEWER_ROLES = {'advisor', 'org_admin', 'campus_coordinator', 'superadmin'}

# Reviewer roles that reach every student in their org without a per-student
# assignment. Coordinators run the campus, so they sit with org_admin here --
# the coordinator restriction is financial, not scope-based (see sis_roles.py).
ORG_WIDE_REVIEWER_ROLES = {'org_admin', 'campus_coordinator'}


def _author_name(user):
    return (user.get('display_name')
            or ' '.join(filter(None, [user.get('first_name'), user.get('last_name')])).strip()
            or 'User')


def _is_optio_voice(author_role):
    """Whether a reviewer speaks as "Optio" rather than as themselves.

    Only Optio's own review (superadmin; 'reviewer' is the legacy row value)
    is branded. A school's teacher shows their real name -- the student knows
    them, and "Optio replied to your work" gave them no reason to connect the
    feedback to the person who wrote it (Gryffin, 2026-08-31).

    The thread display and the notification MUST agree, so both call this.
    """
    return author_role in ('superadmin', 'reviewer')


def _load_context(user_id, completion_id, admin):
    comp = admin.table('quest_task_completions')\
        .select('id, user_id, quest_id, user_quest_task_id, credit_reviewer_id, org_reviewer_id')\
        .eq('id', completion_id).single().execute()
    if not comp.data:
        return None, None, None
    # org_roles (plural) is required, not decorative: a teacher who is also a
    # parent at the school carries org_role='parent' with 'advisor' only in the
    # array. Selecting the singular column alone resolved such an account to
    # 'parent' and 403'd them out of their own students' threads, on read AND on
    # post (Sentry OPTIO-WEB-7/8).
    u = admin.table('users')\
        .select('id, role, org_role, org_roles, organization_id, display_name, '
                'first_name, last_name')\
        .eq('id', user_id).single().execute()
    roles = get_effective_roles(u.data) if u.data else []
    return comp.data, u.data, roles


def _can_access(completion, user, roles, admin):
    """Whether `user` may read/post in this completion's thread.

    `roles` is the caller's FULL effective role list, so an account holding more
    than one org role is judged on its most capable one rather than on whichever
    happens to sit first in the array.
    """
    if not completion or not user:
        return False
    if completion['user_id'] == user['id']:
        return True  # the student who owns the work
    if 'superadmin' in roles:
        return True
    # A reviewer specifically designated on THIS completion always has access,
    # even if not otherwise assigned to the student.
    if user['id'] in (completion.get('credit_reviewer_id'), completion.get('org_reviewer_id')):
        return True
    if any(r in REVIEWER_ROLES for r in roles):
        student = admin.table('users').select('organization_id')\
            .eq('id', completion['user_id']).single().execute()
        student_org = student.data.get('organization_id') if student.data else None
        if not (student_org and student_org == user.get('organization_id')):
            return False
        if any(r in ORG_WIDE_REVIEWER_ROLES for r in roles):
            return True  # org admins/coordinators manage the whole organization
        # Advisors (teachers) may only reach students they are actively assigned
        # to — mirrors the credit dashboard (credit_dashboard/items.py). Same-org
        # alone let an unassigned advisor read AND post in any student's private
        # credit-review thread (delivered to the student as reviewer feedback).
        assignment = admin.table('advisor_student_assignments').select('id')\
            .eq('advisor_id', user['id'])\
            .eq('student_id', completion['user_id'])\
            .eq('is_active', True).limit(1).execute()
        if assignment.data:
            return True
        # Teaching the student is the same relationship. Schools that onboarded
        # through class rosters never populate advisor_student_assignments, so
        # assignment alone locked their teachers out of their own students' work.
        from utils.class_membership import shares_class
        return shares_class(user['id'], completion['user_id'])
    return False


@bp.route('/api/credit/<completion_id>/messages', methods=['GET'])
@require_auth
def get_credit_messages(user_id, completion_id):
    """List the feedback thread for a completion."""
    try:
        # admin client justified: cross-user thread read (student <-> reviewer) gated by _can_access (owner / superadmin / designated reviewer / same-org admin / assigned advisor)
        admin = get_supabase_admin_client()
        completion, user, roles = _load_context(user_id, completion_id, admin)
        if not completion:
            return jsonify({'success': False, 'error': 'Not found'}), 404
        if not _can_access(completion, user, roles, admin):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        rows = admin.table('credit_review_messages')\
            .select('id, author_id, author_role, body, created_at')\
            .eq('completion_id', completion_id)\
            .order('created_at')\
            .execute()
        messages = rows.data or []

        # Enrich author names (reviewers shown as "Optio" to students)
        author_ids = list({m['author_id'] for m in messages})
        names = {}
        if author_ids:
            people = admin.table('users').select('id, display_name, first_name, last_name')\
                .in_('id', author_ids).execute()
            names = {p['id']: _author_name(p) for p in (people.data or [])}

        for m in messages:
            m['author_name'] = ('Optio' if _is_optio_voice(m.get('author_role'))
                                else names.get(m['author_id'], 'User'))
            m['is_mine'] = m['author_id'] == user_id

        return jsonify({'success': True, 'messages': messages})
    except Exception as e:
        logger.error(f"Error loading credit messages: {e}")
        return jsonify({'success': False, 'error': 'Failed to load messages'}), 500


@bp.route('/api/credit/<completion_id>/messages', methods=['POST'])
@require_auth
def post_credit_message(user_id, completion_id):
    """Post a message to the feedback thread + notify the other party."""
    try:
        # admin client justified: cross-user thread write + notifications to the other party, gated by _can_access (owner / superadmin / designated reviewer / same-org admin / assigned advisor)
        admin = get_supabase_admin_client()
        completion, user, roles = _load_context(user_id, completion_id, admin)
        if not completion:
            return jsonify({'success': False, 'error': 'Not found'}), 404
        if not _can_access(completion, user, roles, admin):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        body = (request.json or {}).get('body', '').strip()
        if not body:
            return jsonify({'success': False, 'error': 'Message body is required'}), 400
        if len(body) > 4000:
            return jsonify({'success': False, 'error': 'Message is too long'}), 400

        is_student = completion['user_id'] == user_id
        # Store the author's effective role so the thread can brand superadmin as
        # "Optio" while showing org teachers (org_admin/advisor) by name.
        author_role = get_effective_role(user) or ('student' if is_student else 'reviewer')

        inserted = admin.table('credit_review_messages').insert({
            'completion_id': completion_id,
            'author_id': user_id,
            'author_role': author_role,
            'body': body,
        }).execute()
        message = inserted.data[0] if inserted.data else None

        # Notify the other side
        try:
            from services.notification_service import NotificationService
            notifier = NotificationService()
            quest_id = completion.get('quest_id', '')
            task_id = completion.get('user_quest_task_id', '')
            if is_student:
                # Notify the reviewer(s) who handled this credit
                reviewer_ids = [r for r in [completion.get('credit_reviewer_id'),
                                            completion.get('org_reviewer_id')] if r]
                for rid in set(reviewer_ids):
                    notifier.create_notification(
                        user_id=rid,
                        notification_type='message_received',
                        title='New reply on credit review',
                        message='A student replied on their submitted work.',
                        link='/credit-review',
                        metadata={'completion_id': completion_id},
                    )
            else:
                # Name the sender the same way the thread itself does: only
                # Optio's own (superadmin) review is branded "Optio"; a school's
                # teacher shows their real name. A student who is told "Optio
                # replied" has no reason to connect it to the teacher sitting
                # across from them (Gryffin, 2026-08-31).
                sender = ('Optio' if _is_optio_voice(author_role)
                          else _author_name(user))
                link = f'/quests/{quest_id}?task={task_id}' if quest_id else '/dashboard'
                notifier.create_notification(
                    user_id=completion['user_id'],
                    notification_type='message_received',
                    title=f'{sender} left feedback on your work',
                    message=f'{sender} left feedback on your submitted work.',
                    link=link,
                    metadata={'completion_id': completion_id},
                )
        except Exception as notify_err:
            logger.warning(f"Failed to notify credit message recipient: {notify_err}")

        if message:
            message['author_name'] = 'You'
            message['is_mine'] = True
        return jsonify({'success': True, 'message': message}), 201
    except Exception as e:
        logger.error(f"Error posting credit message: {e}")
        return jsonify({'success': False, 'error': 'Failed to post message'}), 500
