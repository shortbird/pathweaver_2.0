"""
Philosophy Mind Map Routes
Public and admin API endpoints for the interactive philosophy mind map.

Public endpoints (no auth):
- GET /api/public/philosophy/map    - all visible nodes + edges in one payload

Admin endpoints (superadmin only):
- GET    /api/admin/philosophy/nodes           - all nodes (including hidden)
- POST   /api/admin/philosophy/nodes           - create node
- PUT    /api/admin/philosophy/nodes/<id>      - update node
- DELETE /api/admin/philosophy/nodes/<id>      - delete node (cascades edges)
- PUT    /api/admin/philosophy/nodes/positions  - bulk update positions
- GET    /api/admin/philosophy/edges           - all edges
- POST   /api/admin/philosophy/edges           - create edge
- PUT    /api/admin/philosophy/edges/<id>      - update edge
- DELETE /api/admin/philosophy/edges/<id>      - delete edge
"""

from flask import Blueprint, request, jsonify
import re
from database import get_supabase_admin_client
from utils.auth.decorators import require_superadmin
from utils.logger import get_logger

logger = get_logger(__name__)

# Two blueprints: one public, one admin
public_philosophy_bp = Blueprint('public_philosophy', __name__, url_prefix='/api/public/philosophy')
admin_philosophy_bp = Blueprint('admin_philosophy', __name__, url_prefix='/api/admin/philosophy')


def generate_slug(label):
    """Generate a URL-friendly slug from a label."""
    slug = label.lower().strip()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')


# ============================================================
# PUBLIC ENDPOINTS (no auth required)
# ============================================================

@public_philosophy_bp.route('/map', methods=['GET'])
def get_philosophy_map():
    """Return all visible nodes and edges in one payload."""
    try:
        # admin client justified: philosophy content is public read + admin-gated writes; admin client used for both since philosophy_nodes/edges are global
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


# ============================================================
# ADMIN ENDPOINTS (superadmin only)
# ============================================================

# --- Nodes ---

@admin_philosophy_bp.route('/nodes', methods=['GET'])
@require_superadmin
def admin_list_nodes(user_id):
    """List all nodes including hidden ones."""
    try:
        # admin client justified: philosophy content is public read + admin-gated writes; admin client used for both since philosophy_nodes/edges are global
        client = get_supabase_admin_client()
        result = client.table('philosophy_nodes').select('*').order('sort_order').execute()
        return jsonify({'success': True, 'nodes': result.data or []}), 200
    except Exception as e:
        logger.error(f"Error listing philosophy nodes: {str(e)}")
        return jsonify({'error': 'Failed to load nodes'}), 500


@admin_philosophy_bp.route('/nodes', methods=['POST'])
@require_superadmin
def admin_create_node(user_id):
    """Create a new philosophy node."""
    try:
        data = request.get_json()
        if not data or not data.get('label'):
            return jsonify({'error': 'Label is required'}), 400

        # admin client justified: philosophy content is public read + admin-gated writes; admin client used for both since philosophy_nodes/edges are global
        client = get_supabase_admin_client()

        node = {
            'label': data['label'],
            'slug': data.get('slug') or generate_slug(data['label']),
            'summary': data.get('summary', ''),
            'detail_content': data.get('detail_content', ''),
            'image_url': data.get('image_url'),
            'color': data.get('color', '#6D469B'),
            'level': data.get('level', 1),
            'parent_node_id': data.get('parent_node_id'),
            'position_x': data.get('position_x', 0),
            'position_y': data.get('position_y', 0),
            'sort_order': data.get('sort_order', 0),
            'is_visible': data.get('is_visible', True),
        }

        result = client.table('philosophy_nodes').insert(node).execute()
        return jsonify({'success': True, 'node': result.data[0]}), 201

    except Exception as e:
        logger.error(f"Error creating philosophy node: {str(e)}")
        return jsonify({'error': 'Failed to create node'}), 500


@admin_philosophy_bp.route('/nodes/positions', methods=['PUT'])
@require_superadmin
def admin_update_positions(user_id):
    """Bulk update node positions (for drag-to-reposition)."""
    try:
        data = request.get_json()
        if not data or not isinstance(data.get('positions'), list):
            return jsonify({'error': 'positions array is required'}), 400

        # admin client justified: philosophy content is public read + admin-gated writes; admin client used for both since philosophy_nodes/edges are global
        client = get_supabase_admin_client()

        for pos in data['positions']:
            if not pos.get('id'):
                continue
            client.table('philosophy_nodes').update({
                'position_x': pos.get('position_x', 0),
                'position_y': pos.get('position_y', 0),
            }).eq('id', pos['id']).execute()

        return jsonify({'success': True}), 200

    except Exception as e:
        logger.error(f"Error updating node positions: {str(e)}")
        return jsonify({'error': 'Failed to update positions'}), 500


@admin_philosophy_bp.route('/nodes/<node_id>', methods=['PUT'])
@require_superadmin
def admin_update_node(user_id, node_id):
    """Update a philosophy node."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # admin client justified: philosophy content is public read + admin-gated writes; admin client used for both since philosophy_nodes/edges are global
        client = get_supabase_admin_client()

        allowed_fields = [
            'label', 'slug', 'summary', 'detail_content', 'image_url',
            'color', 'level', 'parent_node_id', 'position_x', 'position_y',
            'sort_order', 'is_visible'
        ]
        update_data = {k: v for k, v in data.items() if k in allowed_fields}

        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400

        result = client.table('philosophy_nodes').update(
            update_data
        ).eq('id', node_id).execute()

        if not result.data:
            return jsonify({'error': 'Node not found'}), 404

        return jsonify({'success': True, 'node': result.data[0]}), 200

    except Exception as e:
        logger.error(f"Error updating philosophy node {node_id}: {str(e)}")
        return jsonify({'error': 'Failed to update node'}), 500


@admin_philosophy_bp.route('/nodes/<node_id>', methods=['DELETE'])
@require_superadmin
def admin_delete_node(user_id, node_id):
    """Delete a philosophy node. Edges cascade automatically."""
    try:
        # admin client justified: philosophy content is public read + admin-gated writes; admin client used for both since philosophy_nodes/edges are global
        client = get_supabase_admin_client()
        result = client.table('philosophy_nodes').delete().eq('id', node_id).execute()

        if not result.data:
            return jsonify({'error': 'Node not found'}), 404

        return jsonify({'success': True}), 200

    except Exception as e:
        logger.error(f"Error deleting philosophy node {node_id}: {str(e)}")
        return jsonify({'error': 'Failed to delete node'}), 500


# --- Edges ---

@admin_philosophy_bp.route('/edges', methods=['GET'])
@require_superadmin
def admin_list_edges(user_id):
    """List all edges."""
    try:
        # admin client justified: philosophy content is public read + admin-gated writes; admin client used for both since philosophy_nodes/edges are global
        client = get_supabase_admin_client()
        result = client.table('philosophy_edges').select('*').execute()
        return jsonify({'success': True, 'edges': result.data or []}), 200
    except Exception as e:
        logger.error(f"Error listing philosophy edges: {str(e)}")
        return jsonify({'error': 'Failed to load edges'}), 500


@admin_philosophy_bp.route('/edges', methods=['POST'])
@require_superadmin
def admin_create_edge(user_id):
    """Create a new philosophy edge."""
    try:
        data = request.get_json()
        if not data or not data.get('source_node_id') or not data.get('target_node_id'):
            return jsonify({'error': 'source_node_id and target_node_id are required'}), 400

        # admin client justified: philosophy content is public read + admin-gated writes; admin client used for both since philosophy_nodes/edges are global
        client = get_supabase_admin_client()

        edge = {
            'source_node_id': data['source_node_id'],
            'target_node_id': data['target_node_id'],
            'edge_type': data.get('edge_type', 'includes'),
            'label_text': data.get('label_text'),
            'is_visible': data.get('is_visible', True),
        }

        result = client.table('philosophy_edges').insert(edge).execute()
        return jsonify({'success': True, 'edge': result.data[0]}), 201

    except Exception as e:
        logger.error(f"Error creating philosophy edge: {str(e)}")
        return jsonify({'error': 'Failed to create edge'}), 500


@admin_philosophy_bp.route('/edges/<edge_id>', methods=['PUT'])
@require_superadmin
def admin_update_edge(user_id, edge_id):
    """Update a philosophy edge."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # admin client justified: philosophy content is public read + admin-gated writes; admin client used for both since philosophy_nodes/edges are global
        client = get_supabase_admin_client()

        allowed_fields = [
            'source_node_id', 'target_node_id', 'edge_type', 'label_text', 'is_visible'
        ]
        update_data = {k: v for k, v in data.items() if k in allowed_fields}

        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400

        result = client.table('philosophy_edges').update(
            update_data
        ).eq('id', edge_id).execute()

        if not result.data:
            return jsonify({'error': 'Edge not found'}), 404

        return jsonify({'success': True, 'edge': result.data[0]}), 200

    except Exception as e:
        logger.error(f"Error updating philosophy edge {edge_id}: {str(e)}")
        return jsonify({'error': 'Failed to update edge'}), 500


@admin_philosophy_bp.route('/edges/<edge_id>', methods=['DELETE'])
@require_superadmin
def admin_delete_edge(user_id, edge_id):
    """Delete a philosophy edge."""
    try:
        # admin client justified: philosophy content is public read + admin-gated writes; admin client used for both since philosophy_nodes/edges are global
        client = get_supabase_admin_client()
        result = client.table('philosophy_edges').delete().eq('id', edge_id).execute()

        if not result.data:
            return jsonify({'error': 'Edge not found'}), 404

        return jsonify({'success': True}), 200

    except Exception as e:
        logger.error(f"Error deleting philosophy edge {edge_id}: {str(e)}")
        return jsonify({'error': 'Failed to delete edge'}), 500
