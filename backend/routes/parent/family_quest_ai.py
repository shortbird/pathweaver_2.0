"""
Family Quest AI Routes
======================

AI-powered family quest idea generation for parents.

Endpoints:
- POST /api/parent/family-quest-ideas/generate - Generate 3 AI quest ideas
- POST /api/parent/family-quest-ideas/refine   - Refine a selected idea
- POST /api/parent/family-quest-ideas/accept    - Create quest and enroll children
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone

from database import get_supabase_admin_client
from routes.dependents import verify_parent_role
from routes.family_quests import verify_parent_has_access_to_child
from services.family_quest_ai_service import FamilyQuestAIService
from services.image_service import search_quest_image
from utils.auth.decorators import require_auth

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('family_quest_ai', __name__, url_prefix='/api/parent')


@bp.route('/family-quest-ideas/generate', methods=['POST'])
@require_auth
def generate_family_quest_ideas(user_id):
    """Generate 3 AI-powered family quest ideas based on family context and parent preferences."""
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        # Extract preferences
        preferences = {
            'activity_types': data.get('activity_types', data.get('activity_type', ['any'])),
            'time_commitment': data.get('time_commitment', 'afternoon'),
            'theme_preference': data.get('theme_preference', ''),
            'focus_areas': data.get('focus_areas', []),
            'constraints': data.get('constraints', ''),
        }

        service = FamilyQuestAIService()

        # Aggregate family context
        family_context = service.aggregate_family_context(user_id)

        if not family_context.get('children'):
            return jsonify({
                'success': False,
                'error': 'No children found. Add a dependent or link a student first.'
            }), 400

        # Generate ideas
        result = service.generate_family_quest_ideas(family_context, preferences)

        logger.info(
            f"Generated {len(result.get('quest_ideas', []))} family quest ideas "
            f"for parent {user_id[:8]} with {family_context['family_summary']['child_count']} children"
        )

        return jsonify({
            'success': True,
            'quest_ideas': result.get('quest_ideas', []),
            'family_summary': family_context.get('family_summary', {}),
            'children': [
                {
                    'id': c['id'],
                    'name': c['name'],
                    'age': c.get('age'),
                    'age_bracket': c.get('age_bracket'),
                }
                for c in family_context.get('children', [])
            ]
        })

    except Exception as e:
        logger.error(f"Error generating family quest ideas for {user_id}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f'Failed to generate quest ideas: {str(e)}'}), 500


@bp.route('/family-quest-ideas/refine', methods=['POST'])
@require_auth
def refine_family_quest_idea(user_id):
    """Refine a selected quest idea based on parent feedback."""
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        quest_idea = data.get('quest_idea')
        feedback = data.get('feedback', '').strip()
        preferences = data.get('preferences', {})

        if not quest_idea:
            return jsonify({'success': False, 'error': 'quest_idea is required'}), 400
        if not feedback:
            return jsonify({'success': False, 'error': 'feedback is required'}), 400

        service = FamilyQuestAIService()

        # Re-aggregate family context for refinement
        family_context = service.aggregate_family_context(user_id)

        result = service.refine_quest_idea(quest_idea, feedback, family_context, preferences)

        logger.info(f"Refined family quest idea for parent {user_id[:8]}")

        return jsonify({
            'success': True,
            'refined_idea': result.get('refined_idea', quest_idea),
        })

    except Exception as e:
        logger.error(f"Error refining family quest idea for {user_id}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f'Failed to refine quest idea: {str(e)}'}), 500


@bp.route('/family-quest-ideas/accept', methods=['POST'])
@require_auth
def accept_family_quest_idea(user_id):
    """
    Create a quest from an accepted AI-generated idea and enroll selected children.

    Creates the quest, inserts shared + individual tasks as template tasks,
    enrolls each selected child, and copies appropriate tasks to each child.
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        quest_idea = data.get('quest_idea')
        selected_children = data.get('selected_children', [])

        if not quest_idea:
            return jsonify({'success': False, 'error': 'quest_idea is required'}), 400
        if not selected_children:
            return jsonify({'success': False, 'error': 'selected_children is required'}), 400

        # admin client justified: family quest AI generation reads parent + child profiles to ground prompts; cross-user read gated by parent role + parent->child verification
        supabase = get_supabase_admin_client()

        # Verify parent has access to all selected children
        for child_id in selected_children:
            if not verify_parent_has_access_to_child(user_id, child_id):
                return jsonify({
                    'success': False,
                    'error': f'No access to child {child_id}'
                }), 403

        # Build a map of child_id -> child_name for task assignment
        children_resp = supabase.table('users').select(
            'id, display_name'
        ).in_('id', selected_children).execute()
        child_name_map = {
            c['id']: c.get('display_name', 'Child')
            for c in (children_resp.data or [])
        }

        # Auto-fetch cover image
        quest_desc = quest_idea.get('description', '')
        image_url = search_quest_image(quest_idea.get('title', 'Family Quest'), quest_desc)

        # Create the quest
        quest_data = {
            'title': quest_idea.get('title', 'Family Quest'),
            'big_idea': quest_desc,
            'description': quest_desc,
            'is_v3': True,
            'is_active': True,
            'is_public': False,
            'quest_type': 'optio',
            'header_image_url': image_url,
            'image_url': image_url,
            'allow_custom_tasks': True,
            'created_by': user_id,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }

        quest_result = supabase.table('quests').insert(quest_data).execute()
        if not quest_result.data:
            return jsonify({'success': False, 'error': 'Failed to create quest'}), 500

        quest_id = quest_result.data[0]['id']

        # Build task lists per child
        shared_tasks = quest_idea.get('shared_tasks', [])
        individual_tasks_map = quest_idea.get('individual_tasks', {})

        # Enroll each child and create their tasks
        from repositories.quest_repository import QuestRepository
        quest_repo = QuestRepository()

        enrolled = []
        failed = []

        for child_id in selected_children:
            try:
                child_name = child_name_map.get(child_id, 'Child')

                # Enroll child
                enrollment = quest_repo.enroll_user(child_id, quest_id)
                enrollment_id = enrollment['id']

                # Build tasks for this child: shared tasks + their individual tasks
                tasks_to_insert = []
                order_idx = 0

                # Add shared tasks
                for task in shared_tasks:
                    tasks_to_insert.append({
                        'user_id': child_id,
                        'quest_id': quest_id,
                        'user_quest_id': enrollment_id,
                        'title': task.get('title', 'Family Task'),
                        'description': task.get('description', ''),
                        'pillar': task.get('pillar', 'stem'),
                        'xp_value': int(task.get('xp_value', 100)),
                        'order_index': order_idx,
                        'is_required': False,
                        'is_manual': False,
                        'approval_status': 'approved',
                        'diploma_subjects': ['Electives'],
                    })
                    order_idx += 1

                # Add individual tasks for this child (match by name)
                child_individual = individual_tasks_map.get(child_name, [])
                # Also try matching by case-insensitive first name
                if not child_individual:
                    for key, tasks in individual_tasks_map.items():
                        if key.lower() == child_name.lower() or key.lower().startswith(child_name.split()[0].lower()):
                            child_individual = tasks
                            break

                for task in child_individual:
                    tasks_to_insert.append({
                        'user_id': child_id,
                        'quest_id': quest_id,
                        'user_quest_id': enrollment_id,
                        'title': task.get('title', 'My Task'),
                        'description': task.get('description', ''),
                        'pillar': task.get('pillar', 'stem'),
                        'xp_value': int(task.get('xp_value', 100)),
                        'order_index': order_idx,
                        'is_required': False,
                        'is_manual': False,
                        'approval_status': 'approved',
                        'diploma_subjects': ['Electives'],
                    })
                    order_idx += 1

                if tasks_to_insert:
                    supabase.table('user_quest_tasks').insert(tasks_to_insert).execute()

                # Mark personalization as complete
                supabase.table('user_quests').update({
                    'personalization_completed': True
                }).eq('id', enrollment_id).execute()

                enrolled.append({
                    'child_id': child_id,
                    'child_name': child_name,
                    'enrollment_id': enrollment_id,
                    'task_count': len(tasks_to_insert),
                })

                logger.info(
                    f"Enrolled child {child_id[:8]} in AI-generated family quest "
                    f"{quest_id[:8]} with {len(tasks_to_insert)} tasks"
                )

            except Exception as child_error:
                logger.error(f"Failed to enroll child {child_id} in quest {quest_id}: {str(child_error)}")
                failed.append({'child_id': child_id, 'error': str(child_error)})

        return jsonify({
            'success': True,
            'quest_id': quest_id,
            'quest_title': quest_idea.get('title', 'Family Quest'),
            'enrolled': enrolled,
            'failed': failed,
            'message': f'Quest created and assigned to {len(enrolled)} children',
        })

    except Exception as e:
        logger.error(f"Error accepting family quest idea for {user_id}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f'Failed to create quest: {str(e)}'}), 500
