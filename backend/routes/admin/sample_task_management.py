"""
Admin Sample Task Management Routes
====================================

Handles CRUD operations for quest sample tasks (Optio quests only).
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from services.sample_task_generator import generate_sample_tasks, validate_sample_tasks_quality
from datetime import datetime
import json

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_sample_task_management', __name__, url_prefix='/api/admin')


@bp.route('/quests/<quest_id>/sample-tasks/generate', methods=['POST'])
@require_admin
def generate_sample_tasks_for_quest(user_id, quest_id):
    """
    Generate AI-powered sample tasks for an Optio quest.

    Request body (optional):
    {
        "count": 20,  // Number of tasks to generate
        "regenerate": false  // If true, delete existing and regenerate
    }
    """
    supabase = get_supabase_admin_client()

    try:
        data = request.json or {}
        count = data.get('count', 20)
        regenerate = data.get('regenerate', False)

        # Validate count
        if not isinstance(count, int) or count < 5 or count > 50:
            return jsonify({
                'success': False,
                'error': 'Count must be between 5 and 50'
            }), 400

        # Get quest details
        quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Verify quest is Optio type
        if quest.data.get('quest_type') != 'optio':
            return jsonify({
                'success': False,
                'error': 'Sample tasks can only be generated for Optio quests'
            }), 400

        # If regenerate, delete existing sample tasks
        if regenerate:
            supabase.table('quest_sample_tasks').delete().eq('quest_id', quest_id).execute()
            logger.info(f"Deleted existing sample tasks for quest {quest_id}")

        # Generate tasks using AI
        quest_title = quest.data['title']
        quest_description = quest.data.get('big_idea') or quest.data.get('description', '')

        logger.info(f"Generating {count} sample tasks for quest: {quest_title}")

        tasks = generate_sample_tasks(quest_title, quest_description, count)

        if not tasks or len(tasks) == 0:
            return jsonify({
                'success': False,
                'error': 'Failed to generate sample tasks'
            }), 500

        # Validate quality
        quality_report = validate_sample_tasks_quality(tasks)

        if quality_report['quality_score'] < 60:
            logger.warning(f"Low quality score: {quality_report['quality_score']}")
            logger.warning(f"Issues: {quality_report['issues']}")

        # Insert tasks into database
        sample_tasks_data = []
        for i, task in enumerate(tasks):
            sample_tasks_data.append({
                'quest_id': quest_id,
                'title': task['title'],
                'description': task.get('description', ''),
                'pillar': task['pillar'],
                'xp_value': task.get('xp_value', 100),
                'order_index': i,
                'ai_generated': True,
                'diploma_subjects': ['Electives'],
                'subject_xp_distribution': {},
                'created_at': datetime.utcnow().isoformat()
            })

        result = supabase.table('quest_sample_tasks').insert(sample_tasks_data).execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to save sample tasks'
            }), 500

        logger.info(f"Successfully created {len(result.data)} sample tasks for quest {quest_id}")

        return jsonify({
            'success': True,
            'message': f'Generated {len(result.data)} sample tasks',
            'tasks': result.data,
            'quality_report': quality_report
        })

    except Exception as e:
        logger.error(f"Error generating sample tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to generate sample tasks: {str(e)}'
        }), 500


@bp.route('/quests/<quest_id>/sample-tasks', methods=['GET'])
@require_admin
def get_sample_tasks(user_id, quest_id):
    """Get all sample tasks for a quest"""
    supabase = get_supabase_admin_client()

    try:
        tasks = supabase.table('quest_sample_tasks')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .order('order_index')\
            .execute()

        return jsonify({
            'success': True,
            'tasks': tasks.data,
            'total': len(tasks.data)
        })

    except Exception as e:
        logger.error(f"Error getting sample tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve sample tasks'
        }), 500


@bp.route('/quests/<quest_id>/sample-tasks', methods=['POST'])
@require_admin
def create_sample_task(user_id, quest_id):
    """
    Manually create a sample task.

    Request body:
    {
        "title": "Task title",
        "description": "Task description",
        "pillar": "stem|wellness|communication|civics|art",
        "xp_value": 100,
        "order_index": 0
    }
    """
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        # Validate required fields
        if not data.get('title'):
            return jsonify({'success': False, 'error': 'Title is required'}), 400

        if not data.get('pillar'):
            return jsonify({'success': False, 'error': 'Pillar is required'}), 400

        # Validate pillar
        valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
        pillar = data['pillar'].lower().strip()
        if pillar not in valid_pillars:
            return jsonify({
                'success': False,
                'error': f'Invalid pillar. Must be one of: {", ".join(valid_pillars)}'
            }), 400

        # Verify quest exists and is Optio type
        quest = supabase.table('quests').select('quest_type').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        if quest.data.get('quest_type') != 'optio':
            return jsonify({
                'success': False,
                'error': 'Sample tasks can only be added to Optio quests'
            }), 400

        # Create sample task
        task_data = {
            'quest_id': quest_id,
            'title': data['title'].strip(),
            'description': data.get('description', '').strip(),
            'pillar': pillar,
            'xp_value': int(data.get('xp_value', 100)),
            'order_index': int(data.get('order_index', 0)),
            'ai_generated': False,
            'diploma_subjects': data.get('diploma_subjects', ['Electives']),
            'subject_xp_distribution': data.get('subject_xp_distribution', {}),
            'created_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('quest_sample_tasks').insert(task_data).execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to create sample task'
            }), 500

        return jsonify({
            'success': True,
            'message': 'Sample task created successfully',
            'task': result.data[0]
        })

    except Exception as e:
        logger.error(f"Error creating sample task: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to create sample task: {str(e)}'
        }), 500


@bp.route('/quests/<quest_id>/sample-tasks/<task_id>', methods=['PUT'])
@require_admin
def update_sample_task(user_id, quest_id, task_id):
    """Update a sample task"""
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        # Build update data
        update_data = {}

        if 'title' in data:
            update_data['title'] = data['title'].strip()
        if 'description' in data:
            update_data['description'] = data['description'].strip()
        if 'pillar' in data:
            valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
            pillar = data['pillar'].lower().strip()
            if pillar not in valid_pillars:
                return jsonify({
                    'success': False,
                    'error': f'Invalid pillar. Must be one of: {", ".join(valid_pillars)}'
                }), 400
            update_data['pillar'] = pillar
        if 'xp_value' in data:
            update_data['xp_value'] = int(data['xp_value'])
        if 'order_index' in data:
            update_data['order_index'] = int(data['order_index'])
        if 'diploma_subjects' in data:
            update_data['diploma_subjects'] = data['diploma_subjects']
        if 'subject_xp_distribution' in data:
            update_data['subject_xp_distribution'] = data['subject_xp_distribution']

        if not update_data:
            return jsonify({
                'success': False,
                'error': 'No valid fields to update'
            }), 400

        update_data['updated_at'] = datetime.utcnow().isoformat()

        # Update task
        result = supabase.table('quest_sample_tasks')\
            .update(update_data)\
            .eq('id', task_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Sample task not found or update failed'
            }), 404

        return jsonify({
            'success': True,
            'message': 'Sample task updated successfully',
            'task': result.data[0]
        })

    except Exception as e:
        logger.error(f"Error updating sample task: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update sample task: {str(e)}'
        }), 500


@bp.route('/quests/<quest_id>/sample-tasks/<task_id>', methods=['DELETE'])
@require_admin
def delete_sample_task(user_id, quest_id, task_id):
    """Delete a sample task"""
    supabase = get_supabase_admin_client()

    try:
        result = supabase.table('quest_sample_tasks')\
            .delete()\
            .eq('id', task_id)\
            .eq('quest_id', quest_id)\
            .execute()

        return jsonify({
            'success': True,
            'message': 'Sample task deleted successfully'
        })

    except Exception as e:
        logger.error(f"Error deleting sample task: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to delete sample task: {str(e)}'
        }), 500
