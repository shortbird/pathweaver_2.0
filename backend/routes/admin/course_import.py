"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses IMSCCParserService for IMSCC file parsing (service layer pattern)
- LMS integration/import functionality
- Service layer essential for complex file parsing and mapping logic
- Integration endpoints don't benefit from repository abstraction

Admin Course Import Routes

Handles importing LMS course packages (IMSCC format) and previewing
how they would map to badges and quests in the Optio system.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from services.imscc_parser_service import IMSCCParserService

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_course_import', __name__, url_prefix='/api/admin/courses')

parser_service = IMSCCParserService()


@bp.route('/import/preview', methods=['POST'])
@require_admin
def preview_imscc_import(user_id):
    """
    Parse IMSCC file and preview what would be created

    Accepts a .imscc or .zip file and returns a preview of:
    - Badge that would be created
    - Quests that would be created
    - Statistics about the import

    Does NOT create any database records - just shows preview.

    Expected form data:
    - imscc_file: File upload (.imscc or .zip)

    Returns:
        JSON with success flag and preview data
    """
    try:
        # Check if file was uploaded
        if 'imscc_file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file uploaded. Please upload an IMSCC file.'
            }), 400

        file = request.files['imscc_file']

        # Check if file has a filename
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400

        # Check file extension
        if not file.filename.lower().endswith(('.imscc', '.zip')):
            return jsonify({
                'success': False,
                'error': 'Invalid file type. Please upload a .imscc or .zip file.'
            }), 400

        # Read file content
        file_content = file.read()

        # Validate file size (max 100MB)
        max_size = 100 * 1024 * 1024  # 100MB
        if len(file_content) > max_size:
            return jsonify({
                'success': False,
                'error': f'File too large. Maximum size is 100MB.'
            }), 400

        # Validate IMSCC format
        is_valid, error_msg = parser_service.validate_imscc_file(file_content)
        if not is_valid:
            return jsonify({
                'success': False,
                'error': f'Invalid IMSCC file: {error_msg}'
            }), 400

        # Parse the file
        logger.info(f"Admin {user_id} parsing IMSCC file: {file.filename}")
        result = parser_service.parse_imscc_file(file_content)

        if not result['success']:
            return jsonify(result), 400

        # Add metadata about the upload
        result['upload_info'] = {
            'filename': file.filename,
            'file_size_mb': round(len(file_content) / (1024 * 1024), 2),
            'uploaded_by': user_id
        }

        logger.info(f"Successfully parsed IMSCC file: {result['stats']}")

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error in IMSCC preview: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to process file: {str(e)}'
        }), 500


@bp.route('/import/confirm', methods=['POST'])
@require_admin
def confirm_imscc_import(user_id):
    """
    Create quest and tasks from IMSCC preview data

    Expected JSON body:
    - quest: Quest object with title, description, cover_image, etc.
    - tasks: List of task objects with title, description, pillar, xp_value, etc.

    Returns:
        JSON with created quest_id and success status
    """
    try:
        data = request.get_json()

        quest_data = data.get('quest')
        tasks_data = data.get('tasks')

        if not quest_data:
            return jsonify({
                'success': False,
                'error': 'quest data is required'
            }), 400

        if not tasks_data or len(tasks_data) == 0:
            return jsonify({
                'success': False,
                'error': 'At least one task is required'
            }), 400

        supabase = get_supabase_admin_client()

        # Create the quest
        quest_insert = {
            'title': quest_data['title'],
            'description': quest_data.get('description', ''),
            'quest_type': quest_data.get('quest_type', 'course'),
            'lms_platform': quest_data.get('lms_platform'),
            'lms_course_id': quest_data.get('lms_course_id'),
            'image_url': quest_data.get('cover_image'),  # Frontend uses 'cover_image', DB uses 'image_url'
            'is_active': quest_data.get('is_active', False),
            'is_public': quest_data.get('is_public', False),
            'metadata': quest_data.get('metadata', {})
        }

        quest_result = supabase.table('quests').insert(quest_insert).execute()

        if not quest_result.data or len(quest_result.data) == 0:
            raise Exception("Failed to create quest")

        quest_id = quest_result.data[0]['id']

        logger.info(f"Created quest {quest_id}: {quest_data['title']}")

        # Create sample tasks for the quest
        # Note: In Optio, tasks are created per-user when they enroll in a quest
        # Here we create "sample tasks" that serve as templates
        sample_tasks = []
        for task in tasks_data:
            sample_task = {
                'quest_id': quest_id,
                'title': task['title'],
                'description': task.get('description', ''),
                'pillar': task['pillar'],
                'xp_value': task['xp_value'],
                'order_index': task.get('order_index', 0),
                'is_required': task.get('is_required', True),
                'is_manual': task.get('is_manual', False),
                'metadata': task.get('metadata', {})
            }
            sample_tasks.append(sample_task)

        # Insert all sample tasks
        if sample_tasks:
            tasks_result = supabase.table('sample_quest_tasks').insert(sample_tasks).execute()
            logger.info(f"Created {len(sample_tasks)} sample tasks for quest {quest_id}")

        return jsonify({
            'success': True,
            'quest_id': quest_id,
            'tasks_created': len(sample_tasks),
            'message': f'Quest "{quest_data["title"]}" imported successfully with {len(sample_tasks)} tasks'
        }), 200

    except Exception as e:
        logger.error(f"Error confirming IMSCC import: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to import quest: {str(e)}'
        }), 500


@bp.route('/import/validate', methods=['POST'])
@require_admin
def validate_imscc_file_endpoint(user_id):
    """
    Quick validation endpoint to check if file is valid IMSCC

    Expected form data:
    - imscc_file: File upload

    Returns:
        JSON with is_valid flag and error message if invalid
    """
    try:
        if 'imscc_file' not in request.files:
            return jsonify({
                'is_valid': False,
                'error': 'No file uploaded'
            }), 400

        file = request.files['imscc_file']

        if file.filename == '':
            return jsonify({
                'is_valid': False,
                'error': 'No file selected'
            }), 400

        # Read file content
        file_content = file.read()

        # Validate
        is_valid, error_msg = parser_service.validate_imscc_file(file_content)

        if is_valid:
            return jsonify({
                'is_valid': True,
                'message': 'Valid IMSCC file'
            }), 200
        else:
            return jsonify({
                'is_valid': False,
                'error': error_msg
            }), 200  # 200 because validation succeeded, file is just invalid

    except Exception as e:
        logger.error(f"Error validating IMSCC file: {str(e)}")
        return jsonify({
            'is_valid': False,
            'error': f'Validation error: {str(e)}'
        }), 500


@bp.route('/import/status', methods=['GET'])
@require_admin
def get_import_status(user_id):
    """
    Get status of recent course imports

    THIS IS A PLACEHOLDER FOR FUTURE FUNCTIONALITY
    In Phase 2, this would track import history and job status

    Returns:
        JSON with import history
    """
    return jsonify({
        'imports': [],
        'message': 'Import tracking not yet implemented'
    }), 200
