"""
Credit Review feedback thread.

Two-way conversation on a task's credit submission: the reviewer's "Grow This"
feedback lives in diploma_review_rounds, but this thread lets the student reply and
ask questions (and the reviewer answer) without resubmitting evidence.

Accessible to the student who owns the completion, to the student's parent (a
guardian working in family scope opens the child's completed task and reads the
thread with them), and to reviewers (superadmin, or an org_admin/advisor in the
student's organization). Student-facing copy is branded "Optio" rather than
naming the org admin.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from utils.auth.relationships import relationship_between
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


def _is_guardian(caller_id, student_id):
    """Whether `caller_id` is the student's parent, by any of the three links
    `utils.portfolio_access.is_parent_of` knows -- the same answer the
    student-scoped quest routes give when the parent opened this task."""
    return relationship_between(caller_id, student_id, allow=('parent',)) == 'parent'


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
    # The student's parent. Family scope (2026-09-15) renders the child's own
    # quest page for the parent, and a completed task there carries this
    # thread; the page loaded and the thread answered 403 (Hearthwood parent,
    # Sentry OPTIO-WEB-1Y on read, OPTIO-WEB-23 on post). A parent may do
    # everything the child can do, so they read and reply on the family's side
    # of the conversation.
    if _is_guardian(user['id'], completion['user_id']):
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


def _task_title(admin, completion):
    from repositories.task_repository import TaskRepository
    task_id = completion.get('user_quest_task_id')
    task = TaskRepository(client=admin).find_by_id(task_id) if task_id else None
    return (task or {}).get('title') or 'a task'


def _notify_guardians_of_feedback(admin, notifier, completion, author, sender):
    """Tell every guardian that a teacher left feedback on their child's work.

    iCreate, ticket 41474658: "I talked with a mom, and she was not getting a
    notification when I left feedback on the task submitted. Can we have a
    notification for that?" Feedback told the student only. It now also goes
    to each guardian as child_task_reviewed (action 'feedback'), the same type
    and link the SIS accept sends, so the parent's "Work reviewed" toggle
    covers both. Best-effort: the message is saved already.
    """
    try:
        _send_feedback_to_guardians(admin, notifier, completion, author, sender)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'guardian feedback notices skipped for {completion.get("id")}: {e}')


def _send_feedback_to_guardians(admin, notifier, completion, author, sender):
    from utils.class_membership import guardians_by_student

    student_id = completion['user_id']
    guardians = set(guardians_by_student([student_id]).get(student_id) or ())
    # A teacher who is also the child's parent wrote the feedback; they do
    # not need to be told about it.
    guardians.discard(author['id'])
    if not guardians:
        return
    from repositories.user_repository import UserRepository
    student = UserRepository(client=admin).find_by_id(student_id) or {}
    first = (student.get('first_name') or (student.get('display_name') or '').split(' ')[0]
             or 'your child')
    task_title = _task_title(admin, completion)
    for guardian_id in sorted(guardians):
        try:
            notifier.create_notification(
                user_id=guardian_id,
                notification_type='child_task_reviewed',
                title=f'Feedback on {first}\'s work',
                message=f'{sender} left feedback on {first}\'s "{task_title}".',
                link=f'/parent/quest/{student_id}/{completion.get("quest_id")}',
                metadata={'student_id': student_id, 'completion_id': completion.get('id'),
                          'action': 'feedback'},
                organization_id=author.get('organization_id'),
            )
        except Exception as e:  # noqa: BLE001 -- one failed send must not lose the rest
            logger.warning(f'feedback notice to guardian {guardian_id[:8]} failed: {e}')


def _reply_recipients(admin, completion):
    """{staff_id: link} for a reply from the student or a parent.

    Replies used to go only to credit_reviewer_id / org_reviewer_id. The SIS
    submissions review never sets either, so a teacher who left feedback from
    the Submissions tab never heard the family answer (iCreate, ticket
    41474658, 2026-09-23). The SIS reviewer now hears it; when nobody has
    reviewed the submission in the SIS, the teachers of the class that holds
    the quest do. The Optio credit reviewers keep their notice as before.
    """
    from repositories.sis_submission_repository import SisSubmissionRepository
    from utils.class_membership import class_teacher_ids, student_class_ids

    completion_id = completion['id']
    sis_link = f'/submissions?completion_id={completion_id}'
    recipients = {}
    repo = SisSubmissionRepository(admin)
    reviewer = repo.reviewer_of(completion_id)
    if reviewer:
        recipients[reviewer] = sis_link
    else:
        held_by = repo.classes_holding_quest(completion.get('quest_id'),
                                             student_class_ids(completion['user_id']))
        for cid in sorted(held_by):
            for tid in class_teacher_ids(cid):
                recipients[tid] = sis_link
    for rid in (completion.get('credit_reviewer_id'), completion.get('org_reviewer_id')):
        if rid and rid not in recipients:
            recipients[rid] = '/credit-review'
    return recipients


def _notify_staff_of_reply(admin, notifier, completion, replier):
    """Tell the staff on this submission that the family replied. Never the
    replier: a teacher who is also the child's parent posts on the family's
    side, and must not be told about their own message."""
    recipients = _reply_recipients(admin, completion)
    recipients.pop(replier['id'], None)
    if not recipients:
        return
    name = _author_name(replier)
    task_title = _task_title(admin, completion)
    for rid, link in recipients.items():
        try:
            notifier.create_notification(
                user_id=rid,
                notification_type='message_received',
                title='New reply on submitted work',
                message=f'{name} replied on "{task_title}".',
                link=link,
                metadata={'completion_id': completion['id']},
            )
        except Exception as e:  # noqa: BLE001 -- one failed send must not lose the rest
            logger.warning(f'reply notice to {rid[:8]} failed: {e}')


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

        # The family's side of the thread: the student, or a parent replying
        # for them. Either way the reviewer is the one to notify.
        is_student = (completion['user_id'] == user_id
                      or _is_guardian(user_id, completion['user_id']))
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
                _notify_staff_of_reply(admin, notifier, completion, user)
            else:
                # Name the sender the same way the thread itself does: only
                # Optio's own (superadmin) review is branded "Optio"; a school's
                # teacher shows their real name. A student who is told "Optio
                # replied" has no reason to connect it to the teacher sitting
                # across from them (Gryffin, 2026-08-31).
                sender = ('Optio' if _is_optio_voice(author_role)
                          else _author_name(user))
                link = f'/quests/{quest_id}?task={task_id}' if quest_id else '/dashboard'
                try:
                    notifier.create_notification(
                        user_id=completion['user_id'],
                        notification_type='message_received',
                        title=f'{sender} left feedback on your work',
                        message=f'{sender} left feedback on your submitted work.',
                        link=link,
                        metadata={'completion_id': completion_id},
                    )
                finally:
                    # The parents hear about it even if the student's notice failed.
                    _notify_guardians_of_feedback(admin, notifier, completion, user, sender)
        except Exception as notify_err:
            logger.warning(f"Failed to notify credit message recipient: {notify_err}")

        if message:
            message['author_name'] = 'You'
            message['is_mine'] = True
        return jsonify({'success': True, 'message': message}), 201
    except Exception as e:
        logger.error(f"Error posting credit message: {e}")
        return jsonify({'success': False, 'error': 'Failed to post message'}), 500
