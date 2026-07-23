"""
Shared helper for materializing a quest's facilitator-authored template tasks
into a student's enrollment. Every path that creates a user_quests row outside
the student-initiated enroll endpoint (advisor direct assignment, invitation
accept) must use this so assigned students land on the creator's task list
instead of the personalization wizard.
"""
import logging

logger = logging.getLogger(__name__)


def get_valid_source_template_ids(admin, template_tasks):
    """
    Return the subset of the given tasks' ids that currently exist in
    quest_template_tasks.

    user_quest_tasks.source_template_task_id has a foreign key to
    quest_template_tasks(id), but get_template_tasks() can return rows from the
    legacy fallback tables (course_quest_tasks / quest_sample_tasks) whose ids
    don't exist there, and a concurrent bulk task edit deletes-and-recreates a
    quest's template tasks, invalidating ids fetched moments earlier. Any id
    not returned here must be inserted as NULL or the whole insert fails with
    an FK violation (source_task_id has no FK and still records provenance).
    """
    candidate_ids = [t.get('id') for t in (template_tasks or []) if t.get('id')]
    if not candidate_ids:
        return set()
    try:
        result = admin.table('quest_template_tasks')\
            .select('id')\
            .in_('id', candidate_ids)\
            .execute()
        return {r['id'] for r in (result.data or [])}
    except Exception as e:
        logger.warning(f"Could not validate template task ids, inserting without source refs: {e}")
        return set()


def copy_template_tasks_to_enrollment(admin, quest_id, user_id, user_quest_id,
                                      template_tasks=None):
    """
    Copy a quest's template tasks into user_quest_tasks for one enrollment and,
    when any were copied, mark the enrollment's personalization as complete so
    the wizard never shows. Returns the number of tasks inserted.

    template_tasks may be passed in when the caller already loaded them (bulk
    assignment loads once per quest); otherwise they are fetched here.
    """
    from routes.quest_types import get_template_tasks

    if template_tasks is None:
        template_tasks = get_template_tasks(quest_id, filter_type='all') or []
    if not template_tasks:
        return 0

    valid_template_ids = get_valid_source_template_ids(admin, template_tasks)

    tasks_to_insert = [{
        'user_id': user_id,
        'quest_id': quest_id,
        'user_quest_id': user_quest_id,
        'title': t['title'],
        'description': t.get('description', ''),
        'pillar': t['pillar'],
        'xp_value': t.get('xp_value', 100),
        'order_index': t.get('order_index', 0),
        'is_required': t.get('is_required', False),
        'is_manual': False,
        'approval_status': 'approved',
        'diploma_subjects': t.get('diploma_subjects', ['Electives']),
        'subject_xp_distribution': t.get('subject_xp_distribution'),
        'source_template_task_id': t.get('id') if t.get('id') in valid_template_ids else None,
        'source_task_id': t.get('id'),
    } for t in template_tasks]

    try:
        admin.table('user_quest_tasks').insert(tasks_to_insert).execute()
    except Exception as task_err:
        logger.error(
            f"Error copying template tasks for user {user_id} on quest {quest_id}: {task_err}",
            exc_info=True,
        )
        return 0

    try:
        admin.table('user_quests')\
            .update({'personalization_completed': True})\
            .eq('id', user_quest_id)\
            .execute()
    except Exception as e:
        logger.warning(f"Failed to mark personalization complete for enrollment {user_quest_id}: {e}")

    return len(tasks_to_insert)
