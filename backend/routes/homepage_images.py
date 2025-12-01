"""
Homepage image management routes.
Fetches optimized images from Pexels for homepage sections.
"""
from flask import Blueprint, jsonify, request
from services.image_service import search_quest_image
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('homepage_images', __name__)

# Image specifications for all homepage sections
IMAGE_SPECS = [
    # What Optio Provides Section (6 images)
    {
        "key": "portfolio",
        "query": "teenager student reviewing online portfolio laptop proud",
        "orientation": "landscape",
        "section": "features"
    },
    {
        "key": "journaling",
        "query": "teen hands writing journal colorful planner desk plants",
        "orientation": "portrait",
        "section": "features"
    },
    {
        "key": "badge_achievement",
        "query": "teenager holding up completed project proud smile creative",
        "orientation": "square",
        "section": "features"
    },
    {
        "key": "quest_library",
        "query": "diverse student learning activities montage education collage",
        "orientation": "landscape",
        "section": "features"
    },
    {
        "key": "ai_tutor",
        "query": "teenager laptop studying desk warm light focused expression",
        "orientation": "portrait",
        "section": "features"
    },
    {
        "key": "connections",
        "query": "diverse group teenagers portrait headshots multicultural community",
        "orientation": "square",
        "section": "features"
    },

    # How It Works Section (4 images)
    {
        "key": "choose_quest",
        "query": "teenager browsing tablet learning options excited bright room",
        "orientation": "landscape",
        "section": "process"
    },
    {
        "key": "complete_tasks",
        "query": "teenager hands building project focused concentration tools materials",
        "orientation": "square",
        "section": "process"
    },
    {
        "key": "submit_evidence",
        "query": "teen student photographing completed work smartphone camera documenting",
        "orientation": "portrait",
        "section": "process"
    },
    {
        "key": "earn_recognition",
        "query": "teenager viewing completed diploma screen satisfied proud accomplishment",
        "orientation": "landscape",
        "section": "process"
    },

    # Philosophy Section (1 image)
    {
        "key": "philosophy_hero",
        "query": "teenager reading book deeply focused natural light candid authentic",
        "orientation": "landscape",
        "section": "philosophy"
    },

    # Final CTA Section (1 image)
    {
        "key": "success_collage",
        "query": "diverse students celebrating learning achievements education success",
        "orientation": "landscape",
        "section": "cta"
    }
]


@bp.route('/api/homepage/images', methods=['GET'])
def get_homepage_images():
    """
    Fetch all homepage images from Pexels API.

    Query params:
        - section: Optional filter by section (features, process, philosophy, cta)
        - keys: Optional comma-separated list of specific image keys to fetch

    Returns:
        JSON object with image URLs keyed by image identifier
    """
    try:
        # Get optional filters
        section_filter = request.args.get('section')
        keys_filter = request.args.get('keys', '').split(',') if request.args.get('keys') else None

        # Filter image specs based on query params
        specs_to_fetch = IMAGE_SPECS

        if section_filter:
            specs_to_fetch = [s for s in specs_to_fetch if s['section'] == section_filter]

        if keys_filter:
            specs_to_fetch = [s for s in specs_to_fetch if s['key'] in keys_filter]

        results = {}
        errors = []

        logger.info(f"Fetching {len(specs_to_fetch)} homepage images from Pexels")

        for spec in specs_to_fetch:
            try:
                logger.info(f"Searching Pexels for '{spec['key']}' with query: '{spec['query']}'")

                # Use existing image service to search Pexels
                image_url = search_quest_image(
                    quest_title=spec['query'],
                    quest_description=None,
                    pillar=None
                )

                if image_url:
                    results[spec['key']] = {
                        'url': image_url,
                        'orientation': spec['orientation'],
                        'section': spec['section'],
                        'query': spec['query']
                    }
                    logger.info(f"✓ Found image for '{spec['key']}'")
                else:
                    errors.append({
                        'key': spec['key'],
                        'error': 'No image found',
                        'query': spec['query']
                    })
                    logger.warning(f"✗ No image found for '{spec['key']}'")

            except Exception as e:
                error_msg = str(e)
                errors.append({
                    'key': spec['key'],
                    'error': error_msg,
                    'query': spec['query']
                })
                logger.error(f"Error fetching image for '{spec['key']}': {error_msg}")

        response_data = {
            'success': True,
            'images': results,
            'total_requested': len(specs_to_fetch),
            'total_found': len(results),
            'errors': errors if errors else None
        }

        logger.info(f"Homepage images fetch complete: {len(results)}/{len(specs_to_fetch)} successful")

        return jsonify(response_data), 200

    except Exception as e:
        logger.error(f"Error in get_homepage_images: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch homepage images',
            'details': str(e)
        }), 500


@bp.route('/api/homepage/images/specs', methods=['GET'])
def get_image_specs():
    """
    Get the specifications for all homepage images without fetching them.
    Useful for documentation and planning.

    Returns:
        JSON array of image specifications
    """
    return jsonify({
        'success': True,
        'specs': IMAGE_SPECS,
        'total': len(IMAGE_SPECS)
    }), 200
