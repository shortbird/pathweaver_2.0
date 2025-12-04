"""
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
    Create badge and quests from IMSCC preview data

    THIS ENDPOINT IS NOT YET IMPLEMENTED - PLACEHOLDER FOR PHASE 2

    Expected JSON body:
    - badge_data: Badge object from preview
    - quests_data: List of quest objects from preview
    - pillar_primary: Admin-selected primary pillar

    Returns:
        JSON with created badge_id, quest_ids, and success status
    """
    return jsonify({
        'success': False,
        'error': 'Import confirmation not yet implemented. This is Phase 2 of development.'
    }), 501  # Not Implemented


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
