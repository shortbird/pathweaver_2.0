"""Task CRUD endpoints (update + drop).

Split from ``routes/tasks.py`` on 2026-04-14.
"""

from datetime import datetime

from flask import jsonify, request

from database import get_supabase_admin_client
from repositories.base_repository import NotFoundError
from routes.tasks import bp
from utils.auth.decorators import require_auth
from utils.auth.relationships import student_scope
from utils.logger import get_logger

logger = get_logger(__name__)


def _mark_enrollment_emptied_if_last_task(user_quest_id, user_id: str) -> bool:
    """
    After a task is dropped, record that the student meant to empty the quest.

    Returns True when the enrollment now has no approved tasks left. In that
    case ``personalization_completed`` is set so the empty list reads as a
    deliberate state rather than an enrollment that was never seeded — the
    distinction the old quest-detail self-heal could not make, which is why a
    deleted last task used to reappear on the next page load.

    Never raises: dropping the task already succeeded, so a bookkeeping failure
    must not turn into a 500 for the caller.
    """
    if not user_quest_id:
        return False

    try:
        # admin client justified: bookkeeping write to user_quests for the
        # caller (self), already ownership-checked by drop_task, under @require_auth
        admin = get_supabase_admin_client()

        remaining = admin.table('user_quest_tasks')\
            .select('id', count='exact')\
            .eq('user_quest_id', user_quest_id)\
            .eq('approval_status', 'approved')\
            .limit(1)\
            .execute()

        if (remaining.count or 0) > 0:
            return False

        admin.table('user_quests')\
            .update({'personalization_completed': True})\
            .eq('id', user_quest_id)\
            .eq('user_id', user_id)\
            .execute()

        logger.info(
            f"Enrollment {user_quest_id} emptied by user {user_id}; "
            f"marked personalization_completed so tasks are not re-seeded"
        )
        return True
    except Exception as e:
        logger.error(
            f"Failed to mark enrollment {user_quest_id} as emptied: {e}",
            exc_info=True,
        )
        return False


def _user_who_may_edit(supabase, user_id: str, task_data: dict):
    """The caller's users row when they may edit this task, else None.

    - Superadmins can edit any task
    - Users can edit tasks they own (user_id matches; under @student_scope a
      parent acting for a child is the child here)
    - Org admins/advisors can edit tasks in quests belonging to their organization

    One rule for PUT /<task_id> and POST /<task_id>/duplicate, so a copy is
    possible exactly where an edit is.
    """
    from utils.roles import get_effective_role

    user_result = supabase.table('users')\
        .select('role, org_role, org_roles, organization_id')\
        .eq('id', user_id)\
        .single()\
        .execute()
    if not user_result.data:
        return None

    user = user_result.data
    user_role = get_effective_role(user)
    user_org = user.get('organization_id')

    if user_role == 'superadmin':
        return user
    if task_data.get('user_id') == user_id:
        return user
    if user_role in ('org_admin', 'advisor') and user_org:
        # Org admin/advisor can edit tasks in their organization's quests
        quest_id = task_data.get('quest_id')
        if quest_id:
            quest_result = supabase.table('quests')\
                .select('organization_id')\
                .eq('id', quest_id)\
                .single()\
                .execute()
            if quest_result.data and quest_result.data.get('organization_id') == user_org:
                return user
    return None


@bp.route('/<task_id>', methods=['PUT'])
@require_auth
@student_scope()
def update_task(user_id: str, task_id: str):
    """
    Update a task's details (title, description, pillar, xp_value, evidence_prompt).

    Permission check:
    - Superadmins can edit any task
    - Users can edit tasks they created (user_id matches)
    - Org admins/advisors can edit tasks in quests belonging to their organization
    """
    try:
        from repositories.task_repository import TaskRepository
        from utils.roles import get_effective_role
        from utils.pillar_utils import is_valid_pillar

        # admin client justified: task reads scoped to caller (self) under @require_auth
        supabase = get_supabase_admin_client()
        task_repo = TaskRepository()

        # Get task data
        try:
            task_data = task_repo.find_by_id(task_id)
        except NotFoundError:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404

        if not task_data:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404

        # Permission check, shared with POST /<task_id>/duplicate.
        user = _user_who_may_edit(supabase, user_id, task_data)
        if user is None:
            logger.warning(f"User {user_id} denied permission to edit task {task_id}")
            return jsonify({
                'success': False,
                'error': 'You do not have permission to edit this task'
            }), 403
        user_role = get_effective_role(user)

        # Get and validate update data
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400

        # Block edits while a credit request is in flight: pending_xp / xp_amount
        # were calculated against the task's current values, and changing
        # title/pillar/xp mid-review desyncs the reviewer's view from what the
        # student sees. Owner-as-student can edit again once the request is
        # returned (grow_this) or finalized. Non-owner roles
        # (superadmin / org_admin / advisor) are not gated -- they edit
        # in-flight tasks all the time as part of credit review.
        is_owner_only = user_role not in ('superadmin', 'org_admin', 'advisor')
        if is_owner_only:
            try:
                completion = supabase.table('quest_task_completions') \
                    .select('diploma_status') \
                    .eq('user_id', user_id) \
                    .eq('user_quest_task_id', task_id) \
                    .order('created_at', desc=True) \
                    .limit(1) \
                    .execute()
                if completion.data:
                    diploma_status = completion.data[0].get('diploma_status')
                    if diploma_status in ('pending_review', 'pending_org_approval'):
                        return jsonify({
                            'success': False,
                            'error': "This task has a credit request in review. Wait for it to be returned or finalized before editing."
                        }), 409
            except Exception as gate_err:
                logger.warning(f"crud: in-flight check failed for task {task_id}: {gate_err}")

        # Build update payload with only allowed fields
        update_payload = {}

        if 'title' in data:
            title = data['title'].strip() if data['title'] else ''
            if not title:
                return jsonify({
                    'success': False,
                    'error': 'Task title cannot be empty'
                }), 400
            update_payload['title'] = title

        if 'description' in data:
            update_payload['description'] = data['description'].strip() if data['description'] else ''

        if 'success_criteria' in data:
            # The Definition of Done (services/task_rules.py). Teachers and
            # reviewers edit it freely; a family cannot change it once the task
            # has been sent for credit, and cannot clear it where the school
            # requires one. Only an actual change is gated, because the edit
            # modal sends every field together.
            from utils.personalization_helpers import sanitize_success_criteria
            from services.task_rules import (
                CRITERIA_LOCKED_MESSAGE,
                CRITERIA_REQUIRED_MESSAGE,
                criteria_locked,
                requires_success_criteria,
            )
            from utils.xp_permissions import is_xp_guide_user

            new_criteria = sanitize_success_criteria(data['success_criteria'])
            old_criteria = sanitize_success_criteria(task_data.get('success_criteria'))
            if new_criteria != old_criteria:
                if not is_xp_guide_user(user):
                    if criteria_locked(task_id):
                        return jsonify({
                            'success': False,
                            'error': CRITERIA_LOCKED_MESSAGE,
                            'code': 'success_criteria_locked',
                        }), 409
                    if not new_criteria and requires_success_criteria(task_data.get('user_id')):
                        return jsonify({
                            'success': False,
                            'error': CRITERIA_REQUIRED_MESSAGE,
                            'code': 'success_criteria_required',
                        }), 400
                update_payload['success_criteria'] = new_criteria or None

        if 'pillar' in data:
            pillar = data['pillar'].lower().strip() if data['pillar'] else 'stem'
            if not is_valid_pillar(pillar):
                return jsonify({
                    'success': False,
                    'error': f'Invalid pillar: {pillar}. Valid pillars are: stem, wellness, communication, civics, art'
                }), 400
            update_payload['pillar'] = pillar

        if 'xp_value' in data:
            try:
                xp_value = int(data['xp_value'])
            except (ValueError, TypeError):
                return jsonify({
                    'success': False,
                    'error': 'XP value must be a valid number'
                }), 400

            # Org-level lock: schools can restrict XP to teachers
            # (organizations.feature_flags.lock_xp_editing). Only reject when the
            # value actually changes -- the edit modal submits pillar, subjects,
            # and XP together, so an unchanged XP must not block a pillar edit.
            #
            # Deliberately NOT keyed off is_owner_only: that comes from
            # get_effective_role, which reports only the PRIMARY role, so a
            # teacher who is also a parent would be denied their own XP control.
            # is_xp_guide_user checks every role the user holds.
            from utils.xp_permissions import (
                XP_LOCKED_MESSAGE,
                is_xp_guide_user,
                xp_locked_for_learner,
            )
            if not is_xp_guide_user(user) and xp_value != (task_data.get('xp_value') or 0):
                if xp_locked_for_learner(task_data.get('user_id')):
                    logger.info(
                        f"User {user_id} blocked from changing XP on task {task_id} "
                        f"(org has lock_xp_editing enabled)"
                    )
                    return jsonify({
                        'success': False,
                        'error': XP_LOCKED_MESSAGE,
                        'code': 'xp_editing_locked'
                    }), 403

            # Owner edits are capped at 200 XP per task. Privileged roles can
            # still set higher values during quest authoring / credit review.
            max_xp = 200 if is_owner_only else 1000
            if xp_value < 1 or xp_value > max_xp:
                return jsonify({
                    'success': False,
                    'error': f'XP value must be between 1 and {max_xp}'
                }), 400
            update_payload['xp_value'] = xp_value

            # Rescale subject_xp_distribution so per-subject totals stay in
            # proportion with the new xp_value. Without this, a student who
            # bumps a 100 XP task to 200 keeps a {math: 100} distribution that
            # downstream code (get_subject_xp_distribution) would patch by
            # dumping the entire delta into the largest subject.
            existing_dist = task_data.get('subject_xp_distribution') or {}
            old_xp = task_data.get('xp_value') or 0
            if existing_dist and old_xp and old_xp != xp_value:
                try:
                    scale = xp_value / old_xp
                    rescaled = {
                        s: max(5, 5 * round((v * scale) / 5))
                        for s, v in existing_dist.items()
                        if isinstance(v, (int, float))
                    }
                    if rescaled:
                        # Adjust the largest entry so the total matches xp_value exactly.
                        diff = xp_value - sum(rescaled.values())
                        if diff != 0:
                            largest = max(rescaled.items(), key=lambda kv: kv[1])[0]
                            rescaled[largest] += diff
                        update_payload['subject_xp_distribution'] = rescaled
                except Exception as rescale_err:
                    logger.warning(f"crud: failed to rescale subject_xp_distribution for task {task_id}: {rescale_err}")

        if 'is_required' in data:
            update_payload['is_required'] = bool(data['is_required'])

        # Diploma (transcript) subjects this task contributes toward. Students can
        # retag a task's subject(s) from the quest screen (feature: "edit the
        # pillar and diploma subject on a task").
        if 'diploma_subjects' in data:
            subjects = data['diploma_subjects'] or []
            if not isinstance(subjects, list) or not all(isinstance(s, str) for s in subjects):
                return jsonify({
                    'success': False,
                    'error': 'diploma_subjects must be a list of subject names'
                }), 400
            cleaned = [s.strip() for s in subjects if s and s.strip()]
            # Dedupe (preserve order) and cap to a sane count.
            seen = set()
            deduped = [s for s in cleaned if not (s in seen or seen.add(s))]
            update_payload['diploma_subjects'] = deduped[:10]

            # Keep credit attribution in sync: get_subject_xp_distribution reads
            # subject_xp_distribution FIRST, so a stored distribution built from
            # the old subject(s) would silently win over the student's new
            # choice at credit time. Rebuild it as an even split of the task's
            # XP across the chosen subjects (credit review can refine later).
            chosen = update_payload['diploma_subjects']
            final_xp = update_payload.get('xp_value') or task_data.get('xp_value') or 0
            if chosen and final_xp:
                per = max(5, 5 * round(final_xp / len(chosen) / 5))
                dist = {s: per for s in chosen}
                diff = final_xp - sum(dist.values())
                if diff:
                    dist[chosen[0]] = max(5, dist[chosen[0]] + diff)
                update_payload['subject_xp_distribution'] = dist
            else:
                # No subjects chosen: clear the stored distribution so the
                # pillar-based fallback applies instead of stale data.
                update_payload['subject_xp_distribution'] = None

            # A form with no pillar picker (the learner is 13+, or the school
            # hides the pillars) re-tags the subject without a pillar. Derive
            # the pillar from the new first subject so the two stay in step, the
            # same rule task creation uses (utils/school_subjects.py).
            if 'pillar' not in data and chosen:
                from utils.org_features import user_org_has_feature
                from utils.school_subjects import pillar_for_subject
                from services.task_rules import pillars_hidden_by_age
                owner = task_data.get('user_id')
                if pillars_hidden_by_age(owner) or user_org_has_feature(owner, 'hide_pillars'):
                    update_payload['pillar'] = pillar_for_subject(chosen[0])

        if not update_payload:
            return jsonify({
                'success': False,
                'error': 'No valid fields to update'
            }), 400

        update_payload['updated_at'] = datetime.utcnow().isoformat()

        result = supabase.table('user_quest_tasks')\
            .update(update_payload)\
            .eq('id', task_id)\
            .execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to update task'
            }), 500

        updated_task = result.data[0]
        logger.info(f"User {user_id} updated task {task_id}: {list(update_payload.keys())}")

        return jsonify({
            'success': True,
            'task': updated_task,
            'message': 'Task updated successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error updating task {task_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update task'
        }), 500


#: What a copy of a task keeps. Everything that describes the work, nothing
#: that records doing it (completions and evidence live in other tables and
#: stay with the original). diploma_subjects is listed on purpose: the column
#: defaults to ["Electives"], so a copy that left it out would quietly move
#: the credit to Electives.
DUPLICATED_TASK_FIELDS = (
    'title', 'description', 'success_criteria', 'pillar', 'xp_value',
    'diploma_subjects', 'subject_xp_distribution', 'ai_suggested_xp',
)


@bp.route('/<task_id>/duplicate', methods=['POST'])
@require_auth
@student_scope()
def duplicate_task(user_id: str, task_id: str):
    """Copy a task into the same enrollment, titled "<title> (copy)".

    Ticket 4476c061, Karen Boyd (parent, Optio Academy): "copy an existing task
    to create a new one by just changing the title while keeping the same task
    description and evidence requirements." The copy keeps the description,
    the Definition of Done, the pillar, the XP and the diploma subjects. It is
    not completed and carries no evidence. The client then opens the copy's
    edit dialog so the title can change.

    Allowed exactly where editing the task is (_user_who_may_edit). Refused
    where the quest's author turned off "Let people add their own tasks", for
    everyone but a guide, the same gate as every other family add-task path.
    A copy added to a finished quest reopens it, as any added task does
    (ticket 8a0beab1).
    """
    try:
        from repositories.task_repository import TaskRepository
        from repositories.quest_repository import QuestRepository
        from utils.personalization_helpers import get_next_order_index
        from utils.auth.relationships import current_student_scope
        from utils.xp_permissions import is_xp_guide_user

        # admin client justified: copies one user_quest_tasks row the caller may
        # edit (checked by _user_who_may_edit) under @require_auth
        supabase = get_supabase_admin_client()

        try:
            source = TaskRepository().find_by_id(task_id)
        except NotFoundError:
            source = None
        if not source:
            return jsonify({'success': False, 'error': 'Task not found'}), 404

        user = _user_who_may_edit(supabase, user_id, source)
        if user is None:
            logger.warning(f"User {user_id} denied permission to duplicate task {task_id}")
            return jsonify({
                'success': False,
                'error': 'You do not have permission to copy this task'
            }), 403

        if not is_xp_guide_user(user):
            from routes.quest_personalization import _custom_tasks_blocked
            blocked = _custom_tasks_blocked(supabase, source['quest_id'])
            if blocked:
                return blocked

        copy = {field: source.get(field) for field in DUPLICATED_TASK_FIELDS}
        copy['title'] = f"{(source.get('title') or 'Task').strip()} (copy)"
        if copy.get('diploma_subjects') is None:
            # Keep the column default out of it: no subjects stays no subjects.
            copy['diploma_subjects'] = []
        if copy.get('subject_xp_distribution') is None:
            copy.pop('subject_xp_distribution')

        scope = current_student_scope()
        caller_id = scope.caller_id if scope and scope.delegated else user_id
        owner_id = source['user_id']
        copy.update({
            'user_id': owner_id,
            'quest_id': source['quest_id'],
            'user_quest_id': source['user_quest_id'],
            'order_index': get_next_order_index(owner_id, source['quest_id']),
            'is_required': False,
            'is_manual': True,
            'approval_status': 'approved',
            # NULL = the student themselves (migration 20260915120000).
            'created_by_user_id': None if caller_id == owner_id else caller_id,
            'created_at': datetime.utcnow().isoformat(),
        })

        created = TaskRepository(client=supabase).create_task(copy)

        # A new task on a finished quest means it is not finished.
        QuestRepository(client=supabase).reopen_if_finished(source['user_quest_id'])

        logger.info(f"User {caller_id} duplicated task {task_id} as {created.get('id')}")
        return jsonify({
            'success': True,
            'task': created,
            'message': 'Task copied'
        }), 201

    except Exception as e:
        logger.error(f"Error duplicating task {task_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to copy task'}), 500


@bp.route('/<task_id>', methods=['DELETE'])
@require_auth
@student_scope()
def drop_task(user_id: str, task_id: str):
    """
    Drop/remove a task from user's active quest.

    This is a hard delete of the user_quest_tasks row; the task can be added
    back later from the task library or the personalization wizard.

    When it removes the *last* remaining task, the enrollment is marked
    personalization_completed so nothing treats the empty task list as an
    enrollment that never got seeded. The response says so via
    `quest_now_empty` and the client opens the quest-completion flow.
    """
    try:
        from repositories.task_repository import TaskRepository, TaskCompletionRepository
        task_repo = TaskRepository()
        completion_repo = TaskCompletionRepository()

        # Verify task belongs to user
        try:
            task_data = task_repo.find_by_id(task_id)
            if not task_data or task_data.get('user_id') != user_id:
                logger.warning(f"Task {task_id} not found for user {user_id}")
                return jsonify({
                    'success': False,
                    'error': 'Task not found or not owned by you'
                }), 404
        except NotFoundError:
            logger.warning(f"Task {task_id} not found for user {user_id}")
            return jsonify({
                'success': False,
                'error': 'Task not found or not owned by you'
            }), 404

        # Check if task is already completed
        if completion_repo.check_existing_completion(user_id, task_id):
            logger.warning(f"Cannot drop completed task {task_id} for user {user_id}")
            return jsonify({
                'success': False,
                'error': 'Cannot remove completed tasks'
            }), 400

        logger.info(f"Deleting task {task_id} ({task_data['title']}) for user {user_id}")
        task_repo.delete_task(task_id)

        logger.info(f"User {user_id} dropped task {task_id} ({task_data['title']}) from quest {task_data['quest_id']}")

        quest_now_empty = _mark_enrollment_emptied_if_last_task(
            task_data.get('user_quest_id'), user_id
        )

        return jsonify({
            'success': True,
            'message': f"Task '{task_data['title']}' removed from your quest",
            'quest_now_empty': quest_now_empty
        }), 200

    except Exception as e:
        logger.error(f"Error dropping task {task_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to remove task'
        }), 500
