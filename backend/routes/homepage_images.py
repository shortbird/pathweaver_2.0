"""
Homepage image management routes.
Serves static Pexels image URLs for homepage sections.
"""
from flask import Blueprint, jsonify, request
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('homepage_images', __name__)

# Static Pexels URLs for homepage images (high resolution, CDN-hosted)
# These URLs are stable and don't require API calls
HOMEPAGE_IMAGE_URLS = {
    'portfolio': 'https://images.pexels.com/photos/8472950/pexels-photo-8472950.jpeg?auto=compress&cs=tinysrgb&w=1920',
    'journaling': 'https://images.pexels.com/photos/5190600/pexels-photo-5190600.jpeg?auto=compress&cs=tinysrgb&w=1920',
    'badge_achievement': 'https://images.pexels.com/photos/7606222/pexels-photo-7606222.jpeg?auto=compress&cs=tinysrgb&w=1920',
    'quest_library': 'https://images.pexels.com/photos/7869245/pexels-photo-7869245.jpeg?auto=compress&cs=tinysrgb&w=1920',
    'ai_tutor': 'https://images.pexels.com/photos/8005651/pexels-photo-8005651.jpeg?auto=compress&cs=tinysrgb&w=1920',
    'connections': 'https://images.pexels.com/photos/8034611/pexels-photo-8034611.jpeg?auto=compress&cs=tinysrgb&w=1920',
    'choose_quest': 'https://images.pexels.com/photos/4473784/pexels-photo-4473784.jpeg?auto=compress&cs=tinysrgb&w=1920',
    'complete_tasks': 'https://images.pexels.com/photos/6790763/pexels-photo-6790763.jpeg?auto=compress&cs=tinysrgb&w=1920',
    'submit_evidence': 'https://images.pexels.com/photos/7221277/pexels-photo-7221277.jpeg?auto=compress&cs=tinysrgb&w=1920',
    'earn_recognition': 'https://images.pexels.com/photos/1134188/pexels-photo-1134188.jpeg?auto=compress&cs=tinysrgb&w=1920',
    'philosophy_hero': 'https://images.pexels.com/photos/3768121/pexels-photo-3768121.jpeg?auto=compress&cs=tinysrgb&w=1920',
    'success_collage': 'https://images.pexels.com/photos/7692994/pexels-photo-7692994.jpeg?auto=compress&cs=tinysrgb&w=1920'
}

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
    Get all homepage images (static Pexels URLs).

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
        specs_to_return = IMAGE_SPECS

        if section_filter:
            specs_to_return = [s for s in specs_to_return if s['section'] == section_filter]

        if keys_filter:
            specs_to_return = [s for s in specs_to_return if s['key'] in keys_filter]

        results = {}

        logger.info(f"Serving {len(specs_to_return)} homepage image URLs")

        for spec in specs_to_return:
            # Get static URL from dictionary
            image_url = HOMEPAGE_IMAGE_URLS.get(spec['key'])

            if image_url:
                results[spec['key']] = {
                    'url': image_url,
                    'orientation': spec['orientation'],
                    'section': spec['section'],
                    'query': spec['query']
                }

        response_data = {
            'success': True,
            'images': results,
            'total_requested': len(specs_to_return),
            'total_found': len(results),
            'errors': None
        }

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
