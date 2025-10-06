"""
Admin Quest Management Routes

Handles CRUD operations for quests including creation, editing, deletion,
and quest validation functionality.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.pillar_utils import normalize_pillar_key, is_valid_pillar
from utils.school_subjects import validate_school_subjects, normalize_subject_key
from datetime import datetime, timedelta
import json
import uuid

bp = Blueprint('admin_quest_management', __name__, url_prefix='/api/v3/admin')

@bp.route('/quests/school-subjects', methods=['GET'])
def get_school_subjects_v3():
    """
    Get all available school subjects for task creation.
    Public endpoint - no auth required for getting subject list.
    """
    try:
        from utils.school_subjects import get_all_subjects_with_info
        subjects = get_all_subjects_with_info()

        return jsonify({
            'success': True,
            'school_subjects': subjects
        })

    except Exception as e:
        print(f"Error getting school subjects: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch school subjects'
        }), 500

@bp.route('/quests/create-v3', methods=['POST'])
@require_admin
def create_quest_v3_clean(user_id):
    """
    Create a new quest (title + idea only).
    Tasks are now created individually per student by advisors or AI.
    """
    print(f"CREATE QUEST V3: admin_user_id={user_id}")
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        print(f"Received quest data: {json.dumps(data, indent=2)}")

        # Validate required fields
        if not data.get('title'):
            return jsonify({'success': False, 'error': 'Title is required'}), 400

        # Create quest record
        quest_data = {
            'title': data['title'].strip(),
            'big_idea': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'description': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'is_v3': True,
            'is_active': data.get('is_active', True),
            'source': 'optio',  # Always optio for new personalized quests
            'header_image_url': data.get('header_image_url'),
            'created_at': datetime.utcnow().isoformat()
        }

        # Insert quest
        quest_result = supabase.table('quests').insert(quest_data).execute()

        if not quest_result.data:
            return jsonify({'success': False, 'error': 'Failed to create quest'}), 500

        quest_id = quest_result.data[0]['id']
        print(f"Successfully created quest {quest_id}: {quest_data['title']}")

        return jsonify({
            'success': True,
            'message': 'Quest created successfully. Tasks can now be added per student.',
            'quest_id': quest_id,
            'quest': quest_result.data[0]
        })

    except Exception as e:
        print(f"Error creating quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to create quest: {str(e)}'
        }), 500

@bp.route('/quests/<quest_id>', methods=['PUT'])
@require_admin
def update_quest(user_id, quest_id):
    """Update an existing quest"""
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        # Validate quest exists
        quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Update quest data
        update_data = {}
        if 'title' in data:
            update_data['title'] = data['title'].strip()
        if 'description' in data:
            update_data['description'] = data['description'].strip()
        if 'header_image_url' in data:
            update_data['header_image_url'] = data['header_image_url']
        if 'is_active' in data:
            update_data['is_active'] = data['is_active']

        if update_data:
            update_data['updated_at'] = datetime.utcnow().isoformat()
            supabase.table('quests').update(update_data).eq('id', quest_id).execute()

        return jsonify({
            'success': True,
            'message': 'Quest updated successfully'
        })

    except Exception as e:
        print(f"Error updating quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update quest: {str(e)}'
        }), 500

@bp.route('/quests/<quest_id>', methods=['DELETE'])
@require_admin
def delete_quest(user_id, quest_id):
    """Delete a quest and all its associated data"""
    supabase = get_supabase_admin_client()

    try:
        # Check if quest exists
        quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Step 1: Clear quest_submissions references (NO ACTION constraint)
        submissions = supabase.table('quest_submissions')\
            .select('id', count='exact')\
            .eq('approved_quest_id', quest_id)\
            .execute()

        if submissions.count and submissions.count > 0:
            supabase.table('quest_submissions')\
                .update({'approved_quest_id': None})\
                .eq('approved_quest_id', quest_id)\
                .execute()

        # Step 2: Delete quest_task_completions (blocks user_quest_tasks deletion)
        # This has NO ACTION constraint on user_quest_task_id
        supabase.table('quest_task_completions')\
            .delete()\
            .eq('quest_id', quest_id)\
            .execute()

        # Step 3: Delete evidence documents (has CASCADE but delete manually to be safe)
        supabase.table('user_task_evidence_documents')\
            .delete()\
            .eq('quest_id', quest_id)\
            .execute()

        # Step 4: Delete user_quest_tasks (CASCADE from quests, but blocked by completions)
        supabase.table('user_quest_tasks')\
            .delete()\
            .eq('quest_id', quest_id)\
            .execute()

        # Step 5: Delete user_quests (CASCADE from quests)
        supabase.table('user_quests')\
            .delete()\
            .eq('quest_id', quest_id)\
            .execute()

        # Step 6: Finally delete the quest itself
        supabase.table('quests').delete().eq('id', quest_id).execute()

        return jsonify({
            'success': True,
            'message': 'Quest deleted successfully'
        })

    except Exception as e:
        print(f"Error deleting quest: {str(e)}")
        error_message = str(e)

        # Provide helpful error message for foreign key constraints
        if '409' in error_message or 'conflict' in error_message.lower():
            return jsonify({
                'success': False,
                'error': 'Cannot delete quest: it is still referenced by other data. Please contact support.'
            }), 409

        return jsonify({
            'success': False,
            'error': f'Failed to delete quest: {error_message}'
        }), 500

@bp.route('/quests', methods=['GET'])
@require_admin
def get_admin_quests(user_id):
    """Get all quests for admin management"""
    supabase = get_supabase_admin_client()

    try:
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 100)
        offset = (page - 1) * per_page

        # Get quests
        # Note: In V3 personalized system, quests don't have quest_tasks (that table is archived)
        # Task counts would need to be calculated from user_quest_tasks if needed
        quests = supabase.table('quests')\
            .select('*', count='exact')\
            .order('created_at', desc=True)\
            .range(offset, offset + per_page - 1)\
            .execute()

        return jsonify({
            'success': True,
            'quests': quests.data,
            'total': quests.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (quests.count + per_page - 1) // per_page
        })

    except Exception as e:
        print(f"Error getting admin quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve quests'
        }), 500

@bp.route('/quests/<quest_id>/task-templates', methods=['GET'])
@require_admin
def get_quest_task_templates(user_id, quest_id):
    """
    Get reusable task templates for a quest.
    Returns tasks created by other students that can be copied.
    Optionally filters out tasks already assigned to a specific student.
    """
    from flask import request
    supabase = get_supabase_admin_client()

    try:
        # Get target_user_id from query params (student we're adding tasks for)
        target_user_id = request.args.get('target_user_id')

        # Get existing task titles for this student if target_user_id provided
        existing_titles = set()
        if target_user_id:
            existing_tasks = supabase.table('user_quest_tasks')\
                .select('title')\
                .eq('user_id', target_user_id)\
                .eq('quest_id', quest_id)\
                .execute()
            existing_titles = {t['title'].strip().lower() for t in existing_tasks.data if t.get('title')}

        # Get all tasks for this quest from user_quest_tasks
        # Group by title to find commonly used tasks
        tasks = supabase.table('user_quest_tasks')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .execute()

        if not tasks.data:
            return jsonify({
                'success': True,
                'templates': [],
                'message': 'No task templates available yet for this quest'
            })

        # Aggregate tasks by similarity (using title as primary key)
        template_map = {}
        for task in tasks.data:
            title = task.get('title', '').strip().lower()
            if not title:
                continue

            # Skip tasks already assigned to this student
            if title in existing_titles:
                continue

            if title not in template_map:
                subject_xp_dist = task.get('subject_xp_distribution', {})
                total_xp = sum(subject_xp_dist.values()) if subject_xp_dist else task.get('xp_value', 100)

                template_map[title] = {
                    'id': task['id'],  # Use first occurrence ID as template
                    'title': task.get('title'),
                    'description': task.get('description', ''),
                    'pillar': task.get('pillar'),
                    'subject_xp_distribution': subject_xp_dist or {"Electives": total_xp},
                    'xp_value': int(total_xp),
                    'usage_count': 0,
                    'created_at': task.get('created_at')
                }

            template_map[title]['usage_count'] += 1

        # Convert to list and sort by usage count (most popular first)
        templates = sorted(
            template_map.values(),
            key=lambda x: (x['usage_count'], x['created_at']),
            reverse=True
        )

        return jsonify({
            'success': True,
            'templates': templates,
            'total': len(templates)
        })

    except Exception as e:
        print(f"Error getting task templates: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve task templates'
        }), 500