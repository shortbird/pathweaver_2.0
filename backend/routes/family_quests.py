"""
Parent on-behalf-of-child quest routes.

Lets a parent set up and manage a quest for any child they are a guardian of:
create a private quest, enroll the child, and add, remove or uncomplete tasks
on their behalf. The former multi-child "Family Quest" feature (shared quest
across several children + AI idea generation) was removed 2026-06-30; these
endpoints remain under the historical /api/family prefix for client
compatibility.

Until 2026-09-15 delete and uncomplete were managed-dependents only -- the
child had to have been created by THIS parent (managed_by_parent_id) -- on the
theory that a student with their own login owns their work. The owner's
decision: a parent may do everything the child can do, whatever the child's
age or login. All four routes now share one gate,
verify_parent_has_access_to_child (utils.portfolio_access.is_parent_of), and
every row a parent writes records them (created_by_user_id /
enrolled_by_user_id; migration 20260915120000).

Endpoints:
- GET  /api/family/quests - The family's quests, with who is on each (2026-09-15)
- POST /api/family/quests/create - Create a private quest as a parent
- POST /api/family/quests/<quest_id>/enroll-children - Enroll child(ren) in a quest
- POST /api/family/quests/<quest_id>/tasks - Create a task for a child
- DELETE /api/family/quests/<quest_id>/tasks/<task_id> - Remove a child's task
- POST /api/family/quests/<quest_id>/tasks/<task_id>/uncomplete - Uncomplete a child's task
"""
from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from routes.dependents import verify_parent_role
from utils.auth.decorators import require_auth
from utils.pillar_utils import is_valid_pillar, normalize_pillar_name
from utils.storage_urls import sign_stored_url
from services.image_service import search_quest_image
from datetime import datetime, timezone

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('family_quests', __name__, url_prefix='/api/family')


def verify_parent_has_access_to_child(parent_id: str, child_id: str) -> bool:
    """Whether a parent may act on this child's quests.

    All three links: managed_by_parent_id (a dependent), an approved
    parent_student_links row (a student with their own login), and a shared
    household (how the SIS registration funnel builds a family). One definition,
    in utils.portfolio_access.is_parent_of -- this used to inline the first two.
    """
    from utils.portfolio_access import is_parent_of
    return is_parent_of(parent_id, child_id)



@bp.route('/quests', methods=['GET'])
@require_auth
def list_family_quests(user_id):
    """
    The family's quests, for the family dashboard (/family).

    Two kinds of quest belong to a family rather than to one child:

      - a quest the parent SET UP -- created_by is the parent (the create
        route below), private, worked on by whichever children the parent
        enrolled through enroll-children;
      - a quest the parent is themselves enrolled in. A school can assign a
        training quest straight onto a guardian's account, and a parent who
        used the ordinary /api/quests/create route is its first learner
        (that is how "New Zealand 101" came to sit on Paige's own account).

    Each quest carries `members`: every family member -- the parent and each
    child of children_of_parent -- holding an active enrollment, with that
    member's own task progress. The card can then say who is on the quest and
    how far each of them is, and offer the children who are not on it yet.
    A child's OWN quests (ones they picked or made themselves) are not here;
    those are the child's dashboard, reached by opening the child.
    """
    verify_parent_role(user_id)

    from utils.class_membership import children_of_parent
    from routes.parent.engagement import quest_rhythm

    # admin client justified: family digest read across the parent and their children; the family is derived server-side from children_of_parent, so no row outside it can be asked for
    supabase = get_supabase_admin_client()

    family_ids = [user_id] + sorted(children_of_parent(user_id))

    mine = supabase.table('quests') \
        .select('id, title, description, big_idea, image_url, header_image_url, created_by, created_at') \
        .eq('created_by', user_id).eq('is_active', True).is_('archived_at', 'null') \
        .execute().data or []
    quests = {q['id']: q for q in mine}

    own_enrollments = supabase.table('user_quests') \
        .select('quest_id, quests(id, title, description, big_idea, image_url, header_image_url, created_by, created_at)') \
        .eq('user_id', user_id).eq('is_active', True) \
        .execute().data or []
    for uq in own_enrollments:
        q = uq.get('quests')
        if q and q['id'] not in quests:
            quests[q['id']] = q

    if not quests:
        return jsonify({'success': True, 'quests': []})

    quest_ids = list(quests.keys())

    members_by_quest = {}
    enrollments = supabase.table('user_quests') \
        .select('id, user_id, quest_id, started_at, completed_at') \
        .in_('user_id', family_ids).in_('quest_id', quest_ids).eq('is_active', True) \
        .execute().data or []

    enrollment_ids = [e['id'] for e in enrollments]
    tasks_by_enrollment = {}
    if enrollment_ids:
        tasks = supabase.table('user_quest_tasks') \
            .select('id, user_quest_id') \
            .in_('user_quest_id', enrollment_ids).eq('approval_status', 'approved') \
            .execute().data or []
        for t in tasks:
            tasks_by_enrollment.setdefault(t['user_quest_id'], set()).add(t['id'])

    done_by_user_quest = {}
    if enrollments:
        completions = supabase.table('quest_task_completions') \
            .select('user_id, quest_id, user_quest_task_id') \
            .in_('user_id', family_ids).in_('quest_id', quest_ids) \
            .execute().data or []
        for c in completions:
            if c.get('user_quest_task_id'):
                done_by_user_quest.setdefault((c['user_id'], c['quest_id']), set()).add(c['user_quest_task_id'])

    people = {}
    rows = supabase.table('users') \
        .select('id, first_name, display_name, avatar_url') \
        .in_('id', family_ids).execute().data or []
    for u in rows:
        people[u['id']] = {
            'user_id': u['id'],
            'first_name': u.get('first_name') or (u.get('display_name') or 'Student').split(' ')[0],
            'avatar_url': sign_stored_url(u.get('avatar_url')),
            'is_self': u['id'] == user_id,
        }

    for e in enrollments:
        person = people.get(e['user_id'])
        if not person:
            continue
        task_ids = tasks_by_enrollment.get(e['id'], set())
        done = done_by_user_quest.get((e['user_id'], e['quest_id']), set()) & task_ids
        total = len(task_ids)
        members_by_quest.setdefault(e['quest_id'], []).append({
            **person,
            'enrollment_id': e['id'],
            'started_at': e.get('started_at'),
            'completed_at': e.get('completed_at'),
            'progress': {
                'completed_tasks': len(done),
                'total_tasks': total,
                'percentage': round(len(done) / total * 100) if total else 0,
            },
            # This member's rhythm on the quest: the card shows it instead of
            # a progress bar.
            'rhythm': quest_rhythm(supabase, e['user_id'], e['quest_id']),
        })

    out = []
    for qid, q in quests.items():
        members = members_by_quest.get(qid, [])
        # The parent first, then the children in family order.
        members.sort(key=lambda m: (not m['is_self'], family_ids.index(m['user_id'])))
        out.append({
            'id': qid,
            'title': q.get('title'),
            'description': q.get('description') or q.get('big_idea'),
            'image_url': q.get('image_url') or q.get('header_image_url'),
            'created_by': q.get('created_by'),
            'is_family_quest': q.get('created_by') == user_id,
            'created_at': q.get('created_at'),
            'members': members,
        })

    # Most recently started first; a quest nobody has started yet sits by its
    # creation date.
    out.sort(key=lambda q: max([m['started_at'] or '' for m in q['members']] + [q['created_at'] or '']), reverse=True)

    return jsonify({'success': True, 'quests': out})

@bp.route('/quests/create', methods=['POST'])
@require_auth
def create_family_quest(user_id):
    """
    Create a new quest as a parent.
    Always creates a private, active quest owned by the parent.
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        if not data.get('title'):
            return jsonify({'success': False, 'error': 'Title is required'}), 400

        # admin client justified: parent creates a private quest for a dependent; cross-user writes (quests + user_quests for children) gated by parent role + parent->child verification
        supabase = get_supabase_admin_client()

        # Auto-fetch image if not provided
        image_url = data.get('header_image_url')
        if not image_url:
            quest_desc = data.get('big_idea', '').strip() or data.get('description', '').strip()
            image_url = search_quest_image(data['title'].strip(), quest_desc)

        quest_data = {
            'title': data['title'].strip(),
            'big_idea': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'description': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'is_v3': True,
            'is_active': True,
            'is_public': False,
            'quest_type': 'optio',
            'header_image_url': image_url,
            'image_url': image_url,
            'material_link': data.get('material_link', '').strip() if data.get('material_link') else None,
            'allow_custom_tasks': data.get('allow_custom_tasks', True),
            'created_by': user_id,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }

        quest_result = supabase.table('quests').insert(quest_data).execute()

        if not quest_result.data:
            return jsonify({'success': False, 'error': 'Failed to create quest'}), 500

        quest_id = quest_result.data[0]['id']
        logger.info(f"Parent {user_id} created quest {quest_id} for a dependent: {quest_data['title']}")

        return jsonify({
            'success': True,
            'message': 'Quest created successfully',
            'quest_id': quest_id,
            'quest': quest_result.data[0]
        })

    except Exception as e:
        logger.error(f"Error creating quest for user {user_id}: {str(e)}")
        raise


@bp.route('/quests/<quest_id>/enroll-children', methods=['POST'])
@require_auth
def enroll_children_in_family_quest(user_id, quest_id):
    """
    Enroll one or more dependents in a quest.
    Copies template tasks (if any) to each child's user_quest_tasks.
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data or not data.get('child_ids'):
            return jsonify({'success': False, 'error': 'child_ids array is required'}), 400

        child_ids = data['child_ids']
        if not isinstance(child_ids, list) or len(child_ids) == 0:
            return jsonify({'success': False, 'error': 'child_ids must be a non-empty array'}), 400

        # admin client justified: parent enrolls a dependent in a quest; cross-user writes (user_quests for children) gated by parent role + parent->child verification
        supabase = get_supabase_admin_client()

        # Verify quest exists. A parent may enroll their child in:
        #   - a quest they own (created_by == parent),
        #   - any public/catalog quest (is_public), or
        #   - anything, if superadmin.
        # Private quests owned by other families stay blocked. Per-child access
        # is still verified below via verify_parent_has_access_to_child().
        quest = supabase.table('quests').select('id, created_by, is_public').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        if quest.data.get('created_by') != user_id and not quest.data.get('is_public'):
            user_check = supabase.table('users').select('role').eq('id', user_id).single().execute()
            if not user_check.data or user_check.data.get('role') != 'superadmin':
                return jsonify({'success': False, 'error': 'Permission denied'}), 403

        # Fetch template tasks for this quest
        from routes.quest_types import get_template_tasks
        from utils.template_tasks import get_valid_source_template_ids
        template_tasks = get_template_tasks(quest_id, filter_type='all')
        valid_template_ids = get_valid_source_template_ids(supabase, template_tasks)

        enrolled = []
        failed = []

        for child_id in child_ids:
            try:
                # Verify parent has access to this child
                if not verify_parent_has_access_to_child(user_id, child_id):
                    failed.append({'child_id': child_id, 'error': 'No access to this child'})
                    continue

                # Enroll child using QuestRepository (no args = admin client)
                from repositories.quest_repository import QuestRepository
                quest_repo = QuestRepository()
                enrollment = quest_repo.enroll_user(child_id, quest_id, enrolled_by_user_id=user_id)

                enrollment_id = enrollment['id']

                # Copy template tasks to user_quest_tasks
                if template_tasks:
                    tasks_to_insert = []
                    for task in template_tasks:
                        tasks_to_insert.append({
                            'user_id': child_id,
                            'quest_id': quest_id,
                            'user_quest_id': enrollment_id,
                            'title': task['title'],
                            'description': task.get('description', ''),
                            'pillar': task['pillar'],
                            'xp_value': task.get('xp_value', 100),
                            'order_index': task.get('order_index', 0),
                            'is_required': task.get('is_required', False),
                            'is_manual': False,
                            'approval_status': 'approved',
                            'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                            'subject_xp_distribution': task.get('subject_xp_distribution'),
                            'source_template_task_id': task.get('id') if task.get('id') in valid_template_ids else None,
                            'source_task_id': task.get('id'),
                            'created_by_user_id': user_id,
                        })

                    if tasks_to_insert:
                        supabase.table('user_quest_tasks').insert(tasks_to_insert).execute()

                # Mark personalization as complete
                supabase.table('user_quests').update({
                    'personalization_completed': True
                }).eq('id', enrollment_id).execute()

                enrolled.append({'child_id': child_id, 'enrollment_id': enrollment_id})
                logger.info(f"Enrolled child {child_id[:8]} in quest {quest_id[:8]} with {len(template_tasks)} tasks")

            except Exception as child_error:
                logger.error(f"Failed to enroll child {child_id} in quest {quest_id}: {str(child_error)}")
                failed.append({'child_id': child_id, 'error': str(child_error)})

        return jsonify({
            'success': True,
            'enrolled': enrolled,
            'failed': failed,
            'message': f'Quest assigned to {len(enrolled)} children'
        })

    except Exception as e:
        logger.error(f"Error enrolling children in quest: {str(e)}")
        raise


@bp.route('/quests/<quest_id>/tasks', methods=['POST'])
@require_auth
def create_task_for_dependent(user_id, quest_id):
    """
    Create a task for a child in a quest. Any verified guardian of the child.
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        child_id = data.get('child_id')
        if not child_id:
            return jsonify({'success': False, 'error': 'child_id is required'}), 400

        # Verify parent has access to this child
        if not verify_parent_has_access_to_child(user_id, child_id):
            return jsonify({'success': False, 'error': 'No access to this child'}), 403

        # admin client justified: parent creates a task for a dependent; cross-user write (user_quest_tasks for child) gated by parent role + parent->child verification
        supabase = get_supabase_admin_client()

        # Any child the parent is verified against above: managed dependents,
        # approved parent_student_links (students who keep their own login),
        # and household guardians. Delete and uncomplete below use the same
        # gate since 2026-09-15.

        # Validate required fields
        if not data.get('title'):
            return jsonify({'success': False, 'error': 'Task title is required'}), 400

        # Pillar is optional: a school that hides the pillars
        # (feature_flags.hide_pillars) sends none, and persist_accepted_task
        # derives one from the diploma credit. Requiring it here stranded a
        # Hearthwood parent behind an error naming a control that no longer
        # exists on their form (2026-08-25).
        pillar = (data.get('pillar') or '').lower().strip() or None
        if pillar and not is_valid_pillar(pillar):
            pillar = normalize_pillar_name(pillar)

        xp_value = int(data.get('xp_value', 100))
        if xp_value <= 0:
            return jsonify({'success': False, 'error': 'XP value must be greater than 0'}), 400

        # A parent is not a guide: if the child's school has locked XP editing
        # (organizations.feature_flags.lock_xp_editing), the value is replaced by
        # the platform default below. persist_accepted_task applies the policy --
        # and the 200 XP ceiling -- against the CHILD's org, not the parent's.
        from utils.xp_permissions import get_effective_role_for

        # Persist via the SHARED helper so a parent-added task stores exactly what
        # a student self-accepted task does — including success_criteria (the
        # Definition of Done) and AI subject classification. `child_id` is the
        # write target; parent authorization was verified above.
        from routes.quest_personalization import persist_accepted_task
        from services.subject_classification_service import SubjectClassificationService

        task = {
            'title': data['title'].strip(),
            'description': data.get('description', '').strip(),
            'pillar': pillar,
            'xp_value': xp_value,
            'success_criteria': data.get('success_criteria'),
            'diploma_subjects': data.get('diploma_subjects') or {},
        }

        inserted = persist_accepted_task(
            supabase, SubjectClassificationService(), child_id, quest_id, task,
            caller_role=get_effective_role_for(user_id),
            created_by_user_id=user_id,
        )
        if inserted is None:
            return jsonify({'success': False, 'error': 'Failed to create task'}), 500

        logger.info(f"Parent {user_id[:8]} created task for child {child_id[:8]} in quest {quest_id[:8]}")

        return jsonify({
            'success': True,
            'task': inserted,
            'message': 'Task created successfully'
        })

    except Exception as e:
        logger.error(f"Error creating task for dependent: {str(e)}")
        raise


@bp.route('/quests/<quest_id>/tasks/<task_id>', methods=['DELETE'])
@require_auth
def delete_task_for_dependent(user_id, quest_id, task_id):
    """
    Delete a task from a child's quest enrollment (parent on-behalf-of).
    Mirrors the student drop_task rules: completed tasks cannot be removed.
    `child_id` is passed as a query param. Any verified guardian of the child.
    """
    try:
        verify_parent_role(user_id)

        child_id = request.args.get('child_id')
        if not child_id:
            return jsonify({'success': False, 'error': 'child_id is required'}), 400

        # Verify parent has access to this child
        if not verify_parent_has_access_to_child(user_id, child_id):
            return jsonify({'success': False, 'error': 'No access to this child'}), 403

        # admin client justified: parent deletes a child's task; cross-user write (user_quest_tasks for child) gated by parent role + parent->child verification
        supabase = get_supabase_admin_client()

        # Verify the task belongs to THIS child and quest before deleting
        task = supabase.table('user_quest_tasks').select('id, title, user_id, quest_id').eq('id', task_id).single().execute()
        if not task.data or task.data.get('user_id') != child_id or task.data.get('quest_id') != quest_id:
            return jsonify({'success': False, 'error': 'Task not found for this child'}), 404

        # Don't delete completed tasks (mirrors student drop_task)
        completion = supabase.table('quest_task_completions').select('id').eq(
            'user_id', child_id
        ).eq('user_quest_task_id', task_id).execute()
        if completion.data:
            return jsonify({'success': False, 'error': 'Cannot remove a completed task'}), 400

        supabase.table('user_quest_tasks').delete().eq('id', task_id).execute()

        logger.info(f"Parent {user_id[:8]} deleted task {task_id[:8]} for child {child_id[:8]} in quest {quest_id[:8]}")
        return jsonify({'success': True, 'message': f"Task '{task.data['title']}' removed"}), 200

    except Exception as e:
        logger.error(f"Error deleting task for dependent: {str(e)}")
        raise


@bp.route('/quests/<quest_id>/tasks/<task_id>/uncomplete', methods=['POST'])
@require_auth
def uncomplete_task_for_dependent(user_id, quest_id, task_id):
    """
    Mark a completed task as incomplete for a child.
    Reverses XP awarded. Any verified guardian of the child.
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        child_id = data.get('child_id')
        if not child_id:
            return jsonify({'success': False, 'error': 'child_id is required'}), 400

        # Verify parent has access to this child
        if not verify_parent_has_access_to_child(user_id, child_id):
            return jsonify({'success': False, 'error': 'No access to this child'}), 403

        # admin client justified: parent reverses a child's task completion; cross-user writes (completions + XP for child) gated by parent role + parent->child verification
        supabase = get_supabase_admin_client()

        # Find the completion record
        # Note: quest_task_completions has no xp_awarded column; XP is derived from
        # the task's current xp_value, which is what we reverse below.
        completion = supabase.table('quest_task_completions').select('id').eq(
            'user_id', child_id
        ).eq('user_quest_task_id', task_id).execute()

        if not completion.data:
            return jsonify({'success': False, 'error': 'Task completion not found'}), 404

        completion_id = completion.data[0]['id']

        # Get task details for pillar info
        task = supabase.table('user_quest_tasks').select('pillar, xp_value').eq('id', task_id).single().execute()
        if not task.data:
            return jsonify({'success': False, 'error': 'Task not found'}), 404

        pillar = task.data['pillar']
        xp_to_remove = task.data.get('xp_value', 0)

        # Reverse pillar XP from user_skill_xp
        if xp_to_remove > 0 and pillar:
            try:
                current_pillar = supabase.table('user_skill_xp').select('id, xp_amount').eq(
                    'user_id', child_id
                ).eq('pillar', pillar).execute()

                if current_pillar.data:
                    current_xp = current_pillar.data[0].get('xp_amount', 0)
                    new_xp = max(0, current_xp - xp_to_remove)
                    supabase.table('user_skill_xp').update({
                        'xp_amount': new_xp
                    }).eq('id', current_pillar.data[0]['id']).execute()
            except Exception as xp_err:
                logger.warning(f"Could not reverse pillar XP for {pillar}: {xp_err}")

            # Subtract from user's total_xp
            try:
                user_data = supabase.table('users').select('total_xp').eq('id', child_id).single().execute()
                if user_data.data:
                    current_total = user_data.data.get('total_xp', 0)
                    new_total = max(0, current_total - xp_to_remove)
                    supabase.table('users').update({
                        'total_xp': new_total
                    }).eq('id', child_id).execute()
            except Exception as total_err:
                logger.warning(f"Could not reverse total XP: {total_err}")

        # Delete the completion record
        from repositories.task_repository import TaskCompletionRepository
        completion_repo = TaskCompletionRepository(client=supabase)
        completion_repo.delete_completion(completion_id)

        logger.info(f"Parent {user_id[:8]} uncompleted task {task_id[:8]} for child {child_id[:8]}, reversed {xp_to_remove} XP")

        return jsonify({
            'success': True,
            'message': 'Task marked as incomplete, XP reversed',
            'xp_reversed': xp_to_remove
        })

    except Exception as e:
        logger.error(f"Error uncompleting task for dependent: {str(e)}")
        raise
