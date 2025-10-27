"""
Pillars API - Public endpoint for pillar configuration data

This endpoint serves pillar definitions to the frontend, eliminating
the need for duplicate pillar mapping files across the codebase.
"""

from flask import Blueprint, jsonify
from config.pillars import (
    PILLARS,
    get_all_pillar_keys,
    is_valid_pillar,
    get_pillar_data,
)

from utils.logger import get_logger

logger = get_logger(__name__)

pillars_bp = Blueprint('pillars', __name__)


@pillars_bp.route('/pillars', methods=['GET'])
def get_all_pillars():
    """
    Get all pillar definitions.

    Returns complete pillar configuration including:
    - Display names
    - Descriptions
    - Colors and gradients
    - Icons
    - Subcategories

    This is a public endpoint (no authentication required) as pillar
    data is non-sensitive configuration information.

    Response format:
    {
        "pillars": {
            "stem": {
                "display_name": "STEM",
                "description": "...",
                "color": "#2469D1",
                "gradient": "from-[#2469D1] to-[#1B4FA3]",
                "icon": "BeakerIcon",
                "subcategories": [...]
            },
            ...
        },
        "keys": ["stem", "wellness", "communication", "civics", "art"]
    }
    """
    try:
        return jsonify({
            'pillars': PILLARS,
            'keys': get_all_pillar_keys(),
        }), 200
    except Exception as e:
        return jsonify({
            'error': 'Failed to retrieve pillar data',
            'message': str(e)
        }), 500


@pillars_bp.route('/pillars/<pillar_key>', methods=['GET'])
def get_pillar(pillar_key):
    """
    Get data for a specific pillar.

    Args:
        pillar_key: The pillar key (stem, wellness, communication, civics, art)

    Returns:
        Pillar data object or 404 if invalid pillar key
    """
    if not is_valid_pillar(pillar_key):
        return jsonify({
            'error': 'Invalid pillar key',
            'message': f'Pillar "{pillar_key}" does not exist. Valid keys: {get_all_pillar_keys()}'
        }), 404

    try:
        return jsonify({
            'pillar': get_pillar_data(pillar_key),
            'key': pillar_key.lower()
        }), 200
    except Exception as e:
        return jsonify({
            'error': 'Failed to retrieve pillar data',
            'message': str(e)
        }), 500


@pillars_bp.route('/pillars/validate/<pillar_key>', methods=['GET'])
def validate_pillar(pillar_key):
    """
    Validate if a pillar key is valid.

    Args:
        pillar_key: The pillar key to validate

    Returns:
        {"valid": true/false}
    """
    return jsonify({
        'valid': is_valid_pillar(pillar_key),
        'pillar_key': pillar_key.lower()
    }), 200
