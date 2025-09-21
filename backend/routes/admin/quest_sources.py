"""
Admin Quest Sources Management Routes

Handles quest source management including listing sources and their usage statistics.
"""

from flask import Blueprint, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin

bp = Blueprint('admin_quest_sources', __name__, url_prefix='/api/v3/admin')

@bp.route('/quest-sources', methods=['GET'])
@require_admin
def get_quest_sources(user_id):
    """Get all quest sources with their usage count."""
    supabase = get_supabase_admin_client()
    try:
        # Get all sources
        sources_response = supabase.table('quest_sources').select('*').execute()
        if not sources_response.data:
            return jsonify({'sources': []})

        sources = sources_response.data

        # Get valid enum values for quest_source to avoid constraint errors
        valid_sources = {'khan_academy', 'optio', 'brilliant', 'custom'}  # Known valid enum values

        # Get quest counts for each source
        for source in sources:
            try:
                # Use the source identifier (name/key) instead of UUID id
                source_identifier = source.get('name') or source.get('key') or source.get('id')
                print(f"Counting quests for source: {source_identifier}")

                # Only query if this is a valid enum value to avoid constraint errors
                if source_identifier in valid_sources:
                    count_response = supabase.table('quests').select('id', count='exact').eq('source', source_identifier).execute()
                    source['quest_count'] = count_response.count if count_response.count else 0
                else:
                    # For new sources not in enum, set count to 0 until enum is updated
                    print(f"Source {source_identifier} not in valid enum values - setting count to 0")
                    source['quest_count'] = 0

                print(f"Source {source_identifier}: {source['quest_count']} quests")

            except Exception as source_error:
                error_message = str(source_error)
                print(f"Error counting quests for source {source.get('name', 'unknown')}: {error_message}")
                source['quest_count'] = 0

        return jsonify({'sources': sources})
    except Exception as e:
        print(f"Error fetching quest sources: {str(e)}")
        return jsonify({'error': 'Failed to fetch quest sources'}), 500