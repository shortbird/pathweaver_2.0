"""
Teacher Verification Routes - API endpoints for diploma subject verification
Handles teacher/advisor verification of student task completions for accreditation.
Part of Phase 2: Teacher verification workflow for diploma subject alignment.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_advisor
from middleware.error_handler import ValidationError, NotFoundError
from datetime import datetime

from utils.logger import get_logger
from utils.storage_urls import sign_in_place
from services import sis_service
# The console's Submissions tab already answers "whose work is this teacher's
# to review"; this queue asks the same question and must get the same answer.
from routes.sis.submissions import _scope_classes, _class_maps, _match_class

logger = get_logger(__name__)

bp = Blueprint('teacher_verification', __name__, url_prefix='/api/teacher')


def _review_scope(user_id, org_id):
    """None = the whole school (org admin, coordinator, superadmin). Otherwise
    (class_ids, enrolled, attached) for the classes this teacher teaches.

    A teacher reviews work a student did in one of the teacher's classes: the
    student is enrolled in it AND the quest is attached to it. The same rule as
    the console's Submissions tab (routes/sis/submissions.py).

    This queue used to be the whole school. iCreate, ticket aa7c8e19
    (2026-09-30), from a teacher: "I'm seeing submissions from classes and
    students I'm not responsible for." It had been org-wide all along, but it
    matched no students until 2026-09-25, so nobody saw it until then.
    """
    if sis_service.caller_is_admin(user_id):
        return None
    classes = _scope_classes(user_id, org_id)
    class_ids = list(classes.keys())
    if not class_ids:
        return [], {}, {}
    enrolled, attached = _class_maps(class_ids)
    return class_ids, enrolled, attached


@bp.route('/pending-verifications', methods=['GET'])
@require_advisor
def get_pending_verifications(user_id):
    """
    Task completions awaiting teacher verification: the teacher's own classes
    (see _review_scope), or the whole school for an org admin.
    """
    try:
        # admin client justified: teacher verification reads cross-user student task completions for advisor's org students under @require_role(advisor/superadmin)
        admin = get_supabase_admin_client()

        # Get advisor's organization
        advisor_response = admin.table('users')\
            .select('organization_id')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not advisor_response.data or not advisor_response.data.get('organization_id'):
            return jsonify({
                'success': True,
                'pending_verifications': [],
                'count': 0,
                'message': 'No organization assigned'
            }), 200

        org_id = advisor_response.data['organization_id']

        empty = jsonify({'success': True, 'pending_verifications': [], 'count': 0}), 200
        scope = _review_scope(user_id, org_id)

        if scope is None:
            # The whole school. An org member's role is 'org_managed' and the
            # student part lives in org_role, so asking for role='student'
            # alone found nobody at a school.
            students = admin.table('users')\
                .select('id, display_name, email')\
                .eq('organization_id', org_id)\
                .or_('role.eq.student,org_role.eq.student')\
                .execute().data or []
            quest_ids = None
        else:
            class_ids, enrolled, attached = scope
            enrolled_ids = set().union(*enrolled.values()) if enrolled else set()
            quest_ids = set().union(*attached.values()) if attached else set()
            if not enrolled_ids or not quest_ids:
                return empty
            from repositories.user_repository import UserRepository
            students = list(UserRepository(client=admin).find_by_ids(
                sorted(enrolled_ids), 'id, display_name, email').values())

        if not students:
            return empty

        student_ids = [s['id'] for s in students]
        students_map = {s['id']: s for s in students}

        # Task completions no teacher has reviewed yet. subject_verified_at is
        # set by an approve or a reject (migration 20260925120000).
        completions_query = admin.table('quest_task_completions')\
            .select('id, user_id, task_id, quest_id, user_quest_task_id, completed_at, evidence_url, evidence_text')\
            .in_('user_id', student_ids)
        if quest_ids is not None:
            completions_query = completions_query.in_('quest_id', sorted(quest_ids))
        completions_response = completions_query\
            .is_('subject_verified_at', 'null')\
            .order('completed_at', desc=True)\
            .limit(100)\
            .execute()

        completions = completions_response.data or []
        if scope is not None:
            # Enrolled in one class and the quest attached to another is not
            # this teacher's work: both must meet in the same class.
            completions = [c for c in completions
                           if _match_class(c, class_ids, enrolled, attached)]

        # The tasks behind them, with their quest's title, in one read. This
        # was a query per completion (a hundred round trips for a full queue).
        task_ids = list({c.get('user_quest_task_id') or c.get('task_id')
                         for c in completions if c.get('user_quest_task_id') or c.get('task_id')})
        tasks_map = {}
        if task_ids:
            tasks_response = admin.table('user_quest_tasks')\
                .select('id, title, description, pillar, xp_value, subject_xp_distribution, quests(title)')\
                .in_('id', task_ids)\
                .execute()
            tasks_map = {t['id']: t for t in (tasks_response.data or [])}

        pending_tasks = []
        for completion in completions:
            task_id = completion.get('user_quest_task_id') or completion.get('task_id')
            task_data = tasks_map.get(task_id, {})
            student = students_map.get(completion.get('user_id'), {})

            pending_tasks.append({
                'completion_id': completion['id'],
                'student_id': completion.get('user_id'),
                'student_name': student.get('display_name') or student.get('email', 'Unknown'),
                'task_id': task_id,
                'task_title': task_data.get('title', 'Unknown Task'),
                'description': task_data.get('description'),
                'pillar': task_data.get('pillar'),
                'quest_id': completion.get('quest_id'),
                'quest_title': (task_data.get('quests') or {}).get('title'),
                'completed_at': completion.get('completed_at'),
                'xp_awarded': task_data.get('xp_value', 0),
                'subject_distribution': task_data.get('subject_xp_distribution'),
                'evidence_url': completion.get('evidence_url'),
                'evidence_text': completion.get('evidence_text')
            })

        # `quest-evidence` is private: the stored evidence_url is a pointer, not
        # a link. Sign the whole verification queue in one batched call.
        sign_in_place(pending_tasks, ['evidence_url'])

        return jsonify({
            'success': True,
            'pending_verifications': pending_tasks,
            'count': len(pending_tasks)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching pending verifications: {str(e)}", exc_info=True)
        raise


@bp.route('/verification-history', methods=['GET'])
@require_advisor
def get_verification_history(user_id):
    """
    Get history of all verifications completed by this teacher.
    Includes both approved and rejected verifications.
    """
    try:
        # admin client justified: teacher verification reads cross-user student task completions for advisor's org students under @require_role(advisor/superadmin)
        admin = get_supabase_admin_client()

        # Get verification history (completions verified by this advisor)
        history_response = admin.table('quest_task_completions')\
            .select('*, user_quest_tasks!inner(title, pillar, quest_id, user_id)')\
            .eq('verified_by_advisor_id', user_id)\
            .not_.is_('subject_verified_at', 'null')\
            .order('subject_verified_at', desc=True)\
            .limit(100)\
            .execute()

        history = []
        for completion in history_response.data:
            task_data = completion.get('user_quest_tasks', {})
            history.append({
                'completion_id': completion['id'],
                'student_id': task_data.get('user_id'),
                'task_title': task_data.get('title'),
                'pillar': task_data.get('pillar'),
                'quest_id': task_data.get('quest_id'),
                'completed_at': completion.get('completed_at'),
                'verified_at': completion.get('subject_verified_at'),
                'subject_distribution': completion.get('subject_distribution'),
                'verification_notes': completion.get('verification_notes'),
                'xp_awarded': completion.get('xp_awarded', 0)
            })

        return jsonify({
            'success': True,
            'verification_history': history,
            'count': len(history)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching verification history: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch verification history'
        }), 500


@bp.route('/verify/<task_completion_id>', methods=['POST'])
@require_advisor
def verify_task_completion(user_id, task_completion_id):
    """
    Verify a task completion and assign subject distribution for diploma credits.

    Request body:
        action: 'approve' or 'reject'
        subject_distribution: dict with subject keys and percentage values (only for approve)
        notes: optional verification notes
    """
    try:
        data = request.get_json()

        if not data:
            raise ValidationError('Request body is required')

        action = data.get('action')
        if action not in ['approve', 'reject']:
            raise ValidationError('Action must be "approve" or "reject"')

        subject_distribution = data.get('subject_distribution')
        notes = data.get('notes', '')

        if action == 'approve' and not subject_distribution:
            raise ValidationError('Subject distribution is required for approval')

        # admin client justified: teacher verification reads cross-user student task completions for advisor's org students under @require_role(advisor/superadmin)
        admin = get_supabase_admin_client()

        # Get the task completion
        completion_response = admin.table('quest_task_completions')\
            .select('id, user_id, quest_id')\
            .eq('id', task_completion_id)\
            .limit(1)\
            .execute()

        if not completion_response.data:
            raise NotFoundError('Task completion not found')

        completion = completion_response.data[0]
        student_id = completion.get('user_id')

        # The student belongs to the reviewer's organization (a superadmin may
        # review anyone). This read users.advisor_id, a column that has never
        # existed, so every approve failed.
        people = admin.table('users')\
            .select('id, role, organization_id')\
            .in_('id', [user_id, student_id])\
            .execute()
        by_id = {p['id']: p for p in (people.data or [])}
        reviewer = by_id.get(user_id) or {}
        student = by_id.get(student_id) or {}
        same_school = bool(reviewer.get('organization_id')) and \
            reviewer.get('organization_id') == student.get('organization_id')
        if not (reviewer.get('role') == 'superadmin' or same_school):
            return jsonify({
                'success': False,
                'error': 'You are not authorized to verify this student\'s work'
            }), 403

        # And, for a teacher, the work was done in one of their own classes:
        # the same scope the queue shows (ticket aa7c8e19).
        if reviewer.get('role') != 'superadmin':
            scope = _review_scope(user_id, reviewer['organization_id'])
            if scope is not None:
                class_ids, enrolled, attached = scope
                if not _match_class(completion, class_ids, enrolled, attached):
                    return jsonify({
                        'success': False,
                        'error': 'You are not authorized to verify this student\'s work'
                    }), 403

        # Update the completion with verification data
        update_data = {
            'subject_verified_at': datetime.utcnow().isoformat(),
            'verified_by_advisor_id': user_id,
            'verification_notes': notes
        }

        if action == 'approve':
            update_data['subject_distribution'] = subject_distribution

        admin.table('quest_task_completions')\
            .update(update_data)\
            .eq('id', task_completion_id)\
            .execute()

        return jsonify({
            'success': True,
            'message': f'Task completion {action}d successfully'
        }), 200

    except ValidationError as e:
        logger.warning(f"Validation error in verification: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except NotFoundError as e:
        logger.warning(f"Not found error in verification: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Error verifying task completion: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to verify task completion'
        }), 500
