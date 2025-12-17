"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- 15+ direct database calls for quest pickup/set down workflow
- Mix of get_user_client() and get_supabase_admin_client() usage
- Complex logic for course quest task auto-loading (lines 62-138, 168-239)
- Could create QuestLifecycleRepository with methods:
  - pickup_quest(user_id, quest_id) -> handles enrollment + course task loading
  - set_down_quest(user_id, quest_id, reflection_note, prompt_id)
  - get_pickup_history(user_id, quest_id)
  - save_reflection(user_quest_id, note, prompt_id)
- Task auto-loading logic should remain in service layer (QuestLifecycleService)

Quest Lifecycle Routes
Handles pick up/set down workflow and reflection system.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from database import get_user_client, get_supabase_admin_client
from services.badge_service import BadgeService
from datetime import datetime
from utils.logger import get_logger

logger = get_logger(__name__)

quest_lifecycle_bp = Blueprint('quest_lifecycle', __name__)


@quest_lifecycle_bp.route('/quests/<quest_id>/pickup', methods=['POST'])
@require_auth
def pickup_quest(user_id, quest_id):
    """
    Pick up a quest (start engaging with it).
    If quest was previously set down, increment times_picked_up.
    """
    try:
        supabase = get_user_client()

        # Check if quest exists
        quest_check = supabase.table('quests').select('id, title, quest_type').eq('id', quest_id).single().execute()
        if not quest_check.data:
            return jsonify({'error': 'Quest not found'}), 404

        # Check if user already has this quest
        existing = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if existing.data:
            # Quest exists - update status to picked_up
            user_quest = existing.data[0]

            # Increment times_picked_up if it was previously set down
            times_picked_up = user_quest.get('times_picked_up', 0) + 1 if user_quest.get('status') == 'set_down' else user_quest.get('times_picked_up', 1)

            updated = supabase.table('user_quests')\
                .update({
                    'status': 'picked_up',
                    'is_active': True,  # For backward compatibility
                    'last_picked_up_at': datetime.utcnow().isoformat(),
                    'times_picked_up': times_picked_up
                })\
                .eq('id', user_quest['id'])\
                .execute()

            # Check if this is a course quest that needs tasks loaded
            quest_type = quest_check.data.get('quest_type', 'optio')
            skip_wizard = False

            # If course quest and no tasks exist, auto-load preset tasks
            if quest_type == 'course' and not user_quest.get('personalization_completed'):
                logger.info(f"[PICKUP_COURSE_EXISTING] Course quest detected with no tasks - auto-copying preset tasks")

                try:
                    from routes.quest_types import get_course_tasks_for_quest
                    from services.subject_classification_service import SubjectClassificationService

                    # Check if tasks already exist
                    admin_client = get_supabase_admin_client()
                    existing_tasks = admin_client.table('user_quest_tasks')\
                        .select('id')\
                        .eq('user_quest_id', user_quest['id'])\
                        .execute()

                    if not existing_tasks.data:
                        preset_tasks = get_course_tasks_for_quest(quest_id)
                        logger.info(f"[PICKUP_COURSE_EXISTING] Found {len(preset_tasks)} preset tasks to copy")

                        if preset_tasks:
                            classification_service = SubjectClassificationService(client=admin_client)

                            # Copy all preset tasks to user_quest_tasks
                            user_tasks_data = []
                            for task in preset_tasks:
                                xp_value = task.get('xp_value', 100)

                                # Auto-generate subject distribution if not present
                                subject_distribution = task.get('subject_xp_distribution', {})
                                if not subject_distribution:
                                    try:
                                        subject_distribution = classification_service.classify_task_subjects(
                                            task['title'],
                                            task.get('description', ''),
                                            task['pillar'],
                                            xp_value
                                        )
                                    except Exception as e:
                                        logger.warning(f"[PICKUP_COURSE_EXISTING] Failed to classify task, using fallback: {str(e)}")
                                        subject_distribution = classification_service._fallback_subject_mapping(
                                            task['pillar'],
                                            xp_value
                                        )

                                task_data = {
                                    'user_id': user_id,
                                    'quest_id': quest_id,
                                    'user_quest_id': user_quest['id'],
                                    'title': task['title'],
                                    'description': task.get('description', ''),
                                    'pillar': task['pillar'],
                                    'xp_value': xp_value,
                                    'order_index': task.get('order_index', 0),
                                    'is_required': task.get('is_required', True),
                                    'is_manual': False,
                                    'approval_status': 'approved',
                                    'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                                    'subject_xp_distribution': subject_distribution
                                }
                                user_tasks_data.append(task_data)

                            # Bulk insert tasks using admin client
                            if user_tasks_data:
                                logger.info(f"[PICKUP_COURSE_EXISTING] Inserting {len(user_tasks_data)} tasks into user_quest_tasks")
                                admin_client.table('user_quest_tasks').insert(user_tasks_data).execute()
                                logger.info(f"[PICKUP_COURSE_EXISTING] Successfully inserted {len(user_tasks_data)} tasks")

                            # Mark personalization as completed (no wizard needed)
                            admin_client.table('user_quests')\
                                .update({'personalization_completed': True})\
                                .eq('id', user_quest['id'])\
                                .execute()

                            skip_wizard = True

                except Exception as task_error:
                    logger.error(f"[PICKUP_COURSE_EXISTING] ERROR copying tasks: {str(task_error)}", exc_info=True)
                    # Don't fail the pickup, but log the error

            return jsonify({
                'message': 'Quest picked up again',
                'user_quest': updated.data[0],
                'is_returning': times_picked_up > 1,
                'times_picked_up': times_picked_up,
                'skip_wizard': skip_wizard,
                'quest_type': quest_type
            }), 200

        # Create new user_quest record
        new_user_quest = {
            'user_id': user_id,
            'quest_id': quest_id,
            'status': 'picked_up',
            'is_active': True,
            'times_picked_up': 1,
            'last_picked_up_at': datetime.utcnow().isoformat(),
            'started_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('user_quests').insert(new_user_quest).execute()

        if not result.data:
            return jsonify({'error': 'Failed to pick up quest'}), 500

        enrollment = result.data[0]
        skip_wizard = False

        # Check if this is a course quest and auto-copy preset tasks
        quest_type = quest_check.data.get('quest_type', 'optio')
        if quest_type == 'course':
            logger.info(f"[PICKUP_COURSE] Course quest detected - auto-copying preset tasks for user {user_id[:8]}, quest {quest_id[:8]}")

            try:
                from routes.quest_types import get_course_tasks_for_quest
                from services.subject_classification_service import SubjectClassificationService

                preset_tasks = get_course_tasks_for_quest(quest_id)
                logger.info(f"[PICKUP_COURSE] Found {len(preset_tasks)} preset tasks")

                if preset_tasks:
                    admin_client = get_supabase_admin_client()
                    classification_service = SubjectClassificationService(client=admin_client)

                    # Copy all preset tasks to user_quest_tasks
                    user_tasks_data = []
                    for task in preset_tasks:
                        xp_value = task.get('xp_value', 100)

                        # Auto-generate subject distribution if not present
                        subject_distribution = task.get('subject_xp_distribution', {})
                        if not subject_distribution:
                            try:
                                subject_distribution = classification_service.classify_task_subjects(
                                    task['title'],
                                    task.get('description', ''),
                                    task['pillar'],
                                    xp_value
                                )
                            except Exception as e:
                                logger.warning(f"[PICKUP_COURSE] Failed to classify task, using fallback: {str(e)}")
                                subject_distribution = classification_service._fallback_subject_mapping(
                                    task['pillar'],
                                    xp_value
                                )

                        task_data = {
                            'user_id': user_id,
                            'quest_id': quest_id,
                            'user_quest_id': enrollment['id'],
                            'title': task['title'],
                            'description': task.get('description', ''),
                            'pillar': task['pillar'],
                            'xp_value': xp_value,
                            'order_index': task.get('order_index', 0),
                            'is_required': task.get('is_required', True),
                            'is_manual': False,
                            'approval_status': 'approved',
                            'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                            'subject_xp_distribution': subject_distribution
                        }
                        user_tasks_data.append(task_data)

                    # Bulk insert tasks using admin client
                    if user_tasks_data:
                        logger.info(f"[PICKUP_COURSE] Inserting {len(user_tasks_data)} tasks into user_quest_tasks")
                        admin_client.table('user_quest_tasks').insert(user_tasks_data).execute()
                        logger.info(f"[PICKUP_COURSE] Successfully inserted {len(user_tasks_data)} tasks")

                    # Mark personalization as completed (no wizard needed)
                    admin_client.table('user_quests')\
                        .update({'personalization_completed': True})\
                        .eq('id', enrollment['id'])\
                        .execute()

                    skip_wizard = True

            except Exception as task_error:
                logger.error(f"[PICKUP_COURSE] ERROR copying tasks: {str(task_error)}", exc_info=True)
                # Don't fail the pickup, but log the error

        return jsonify({
            'message': 'Quest picked up successfully',
            'user_quest': enrollment,
            'is_returning': False,
            'times_picked_up': 1,
            'skip_wizard': skip_wizard,
            'quest_type': quest_type
        }), 201

    except Exception as e:
        logger.error(f"Error picking up quest {quest_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quest_lifecycle_bp.route('/quests/<quest_id>/setdown', methods=['POST'])
@require_auth
def set_down_quest(user_id, quest_id):
    """
    Set down a quest (consciously move on).
    Optionally save reflection note.
    """
    try:
        data = request.get_json() or {}
        reflection_note = data.get('reflection_note')
        prompt_id = data.get('prompt_id')

        supabase = get_user_client()

        # Get user's quest record
        user_quest_result = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not user_quest_result.data:
            return jsonify({'error': 'Quest not found for this user'}), 404

        user_quest = user_quest_result.data[0]

        # Prepare update
        update_data = {
            'status': 'set_down',
            'is_active': False,  # For backward compatibility
            'last_set_down_at': datetime.utcnow().isoformat()
        }

        # Add reflection note if provided
        if reflection_note:
            existing_reflections = user_quest.get('reflection_notes', [])
            if not isinstance(existing_reflections, list):
                existing_reflections = []

            new_reflection = {
                'note': reflection_note,
                'prompt_id': prompt_id,
                'created_at': datetime.utcnow().isoformat()
            }
            existing_reflections.append(new_reflection)
            update_data['reflection_notes'] = existing_reflections

        # Update user_quest
        updated = supabase.table('user_quests')\
            .update(update_data)\
            .eq('id', user_quest['id'])\
            .execute()

        if not updated.data:
            return jsonify({'error': 'Failed to set down quest'}), 500

        # NOTE: Database trigger will automatically check badge eligibility
        # when status changes to 'set_down'

        return jsonify({
            'message': 'Quest set down successfully',
            'user_quest': updated.data[0],
            'reflection_saved': bool(reflection_note)
        }), 200

    except Exception as e:
        logger.error(f"Error setting down quest {quest_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quest_lifecycle_bp.route('/quests/<quest_id>/pickup-history', methods=['GET'])
@require_auth
def get_pickup_history(user_id, quest_id):
    """
    Get quest pickup history for a user.
    Shows times_picked_up, reflections, and dates.
    """
    try:
        supabase = get_user_client()

        user_quest = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not user_quest.data:
            return jsonify({'error': 'Quest not found for this user'}), 404

        quest_data = user_quest.data[0]

        return jsonify({
            'quest_id': quest_id,
            'status': quest_data.get('status'),
            'times_picked_up': quest_data.get('times_picked_up', 0),
            'last_picked_up_at': quest_data.get('last_picked_up_at'),
            'last_set_down_at': quest_data.get('last_set_down_at'),
            'started_at': quest_data.get('started_at'),
            'reflections': quest_data.get('reflection_notes', [])
        }), 200

    except Exception as e:
        logger.error(f"Error getting pickup history for quest {quest_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quest_lifecycle_bp.route('/reflection-prompts', methods=['GET'])
@require_auth
def get_reflection_prompts(user_id):
    """
    Get random reflection prompts for set down flow.
    Optional category filter via query param.
    """
    try:
        category = request.args.get('category')
        limit = int(request.args.get('limit', 5))

        prompts = BadgeService.get_reflection_prompts(category=category, limit=limit)

        return jsonify({
            'prompts': prompts,
            'count': len(prompts)
        }), 200

    except Exception as e:
        logger.error(f"Error getting reflection prompts: {str(e)}")
        return jsonify({'error': str(e)}), 500
