"""
Philosophy Mind Map Routes
Public API endpoint for the interactive philosophy mind map shown on the
public /philosophy marketing page. Content in philosophy_nodes /
philosophy_edges is static; the admin editor was removed in Aug 2026.

Public endpoints (no auth):
- GET /api/public/philosophy/map    - all visible nodes + edges in one payload
"""

from flask import Blueprint, jsonify
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

public_philosophy_bp = Blueprint('public_philosophy', __name__, url_prefix='/api/public/philosophy')


@public_philosophy_bp.route('/map', methods=['GET'])
def get_philosophy_map():
    """Return all visible nodes and edges in one payload."""
    try:
        # admin client justified: philosophy content is public read-only global data
        client = get_supabase_admin_client()

        nodes_result = client.table('philosophy_nodes').select(
            'id, slug, label, summary, detail_content, image_url, color, '
            'level, parent_node_id, position_x, position_y, sort_order'
        ).eq('is_visible', True).order('sort_order').execute()

        edges_result = client.table('philosophy_edges').select(
            'id, source_node_id, target_node_id, edge_type, label_text'
        ).eq('is_visible', True).execute()

        return jsonify({
            'success': True,
            'nodes': nodes_result.data or [],
            'edges': edges_result.data or []
        }), 200

    except Exception as e:
        logger.error(f"Error loading philosophy map: {str(e)}")
        return jsonify({'error': 'Failed to load philosophy map'}), 500
