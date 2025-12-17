"""
Image search routes for quest cover images

REPOSITORY MIGRATION: NO MIGRATION NEEDED
- This route uses ImageService (service layer pattern) - already following best practices
- No direct database calls
- Service layer is the preferred pattern over direct repository usage
"""
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from services.image_service import search_quest_image

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('images', __name__, url_prefix='/api/images')


@bp.route('/search-quest', methods=['POST'])
@require_auth
def search_quest_image_route(user_id):
    """
    Search for a quest cover image using Pexels API

    Expected JSON body:
    - quest_title: Title of the quest
    - quest_description: Optional description

    Returns:
        JSON with image_url if found
    """
    try:
        data = request.get_json()

        quest_title = data.get('quest_title')
        if not quest_title:
            return jsonify({
                'success': False,
                'error': 'quest_title is required'
            }), 400

        quest_description = data.get('quest_description')

        # Search for image
        image_url = search_quest_image(quest_title, quest_description)

        if image_url:
            return jsonify({
                'success': True,
                'image_url': image_url
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'No suitable image found'
            }), 404

    except Exception as e:
        logger.error(f"Error searching for quest image: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to search for image: {str(e)}'
        }), 500
