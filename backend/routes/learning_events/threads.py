"""Threaded moments: chain, user threads, related, detect, narrative.

Split from routes/learning_events.py on 2026-04-14 (Q1).
"""

"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses LearningEventsService exclusively (service layer pattern)
- Only 1 direct database call for file upload verification (line 293-304, acceptable)
- Service layer properly encapsulates all CRUD operations
- File upload endpoint uses get_user_client for RLS enforcement (correct pattern)

Learning Events Routes
API endpoints for spontaneous learning moment capture
"""
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from services.learning_events_service import LearningEventsService
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)



from routes.learning_events import learning_events_bp


@learning_events_bp.route('/api/learning-events/<event_id>/thread', methods=['GET'])
@require_auth
def get_thread_chain(user_id, event_id):
    """Get the full thread chain for a moment (parent and children)."""
    try:
        from database import get_supabase_admin_client
        # admin client justified: learning event reads/writes scoped to caller (self) under @require_auth
        supabase = get_supabase_admin_client()

        # Get the moment to find its place in the thread
        moment_response = supabase.table('learning_events') \
            .select('*') \
            .eq('id', event_id) \
            .eq('user_id', user_id) \
            .single() \
            .execute()

        if not moment_response.data:
            return jsonify({
                'success': False,
                'error': 'Moment not found'
            }), 404

        moment = moment_response.data

        # Find the root of the thread
        root_id = event_id
        current = moment
        ancestors = []

        while current.get('parent_moment_id'):
            parent_response = supabase.table('learning_events') \
                .select('*') \
                .eq('id', current['parent_moment_id']) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if parent_response.data:
                ancestors.insert(0, parent_response.data)
                current = parent_response.data
                root_id = current['id']
            else:
                break

        # Get all descendants from the root
        def get_descendants(moment_id, depth=0, max_depth=10):
            if depth >= max_depth:
                return []

            children_response = supabase.table('learning_events') \
                .select('*') \
                .eq('parent_moment_id', moment_id) \
                .eq('user_id', user_id) \
                .order('created_at') \
                .execute()

            children = children_response.data or []
            result = []

            for child in children:
                child['depth'] = depth + 1
                result.append(child)
                result.extend(get_descendants(child['id'], depth + 1, max_depth))

            return result

        descendants = get_descendants(event_id)

        return jsonify({
            'success': True,
            'thread': {
                'root_id': root_id,
                'current_moment': moment,
                'ancestors': ancestors,
                'descendants': descendants,
                'total_moments': len(ancestors) + 1 + len(descendants)
            }
        }), 200

    except Exception as e:
        logger.error(f"Error in get_thread_chain: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/threads', methods=['GET'])
@require_auth
def get_user_threads(user_id):
    """List all threads (root moments that have children) for a user."""
    try:
        from database import get_supabase_admin_client
        # admin client justified: learning event reads/writes scoped to caller (self) under @require_auth
        supabase = get_supabase_admin_client()

        # Get all moments with children
        all_moments_response = supabase.table('learning_events') \
            .select('id, title, description, pillars, created_at, parent_moment_id') \
            .eq('user_id', user_id) \
            .order('created_at', desc=True) \
            .execute()

        all_moments = all_moments_response.data or []

        # Find all parent IDs
        parent_ids = set(m['parent_moment_id'] for m in all_moments if m['parent_moment_id'])

        # Find root moments (have children but no parent)
        threads = []
        for moment in all_moments:
            if moment['id'] in parent_ids and not moment['parent_moment_id']:
                # This is a root of a thread
                # Count descendants
                child_count = sum(1 for m in all_moments if m['parent_moment_id'] == moment['id'])

                threads.append({
                    'root_moment': moment,
                    'child_count': child_count,
                    'is_root': True
                })

        return jsonify({
            'success': True,
            'threads': threads,
            'total_threads': len(threads)
        }), 200

    except Exception as e:
        logger.error(f"Error in get_user_threads: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>/find-related', methods=['POST'])
@require_auth
def find_related_moments(user_id, event_id):
    """Use AI to find moments related to a given moment."""
    try:
        from database import get_supabase_admin_client
        from services.thread_ai_service import ThreadAIService

        # admin client justified: learning event reads/writes scoped to caller (self) under @require_auth
        supabase = get_supabase_admin_client()

        # Get the source moment
        moment_response = supabase.table('learning_events') \
            .select('*') \
            .eq('id', event_id) \
            .eq('user_id', user_id) \
            .single() \
            .execute()

        if not moment_response.data:
            return jsonify({
                'success': False,
                'error': 'Moment not found'
            }), 404

        moment = moment_response.data

        # Get other moments
        other_response = supabase.table('learning_events') \
            .select('id, title, description, pillars, created_at') \
            .eq('user_id', user_id) \
            .neq('id', event_id) \
            .order('created_at', desc=True) \
            .limit(50) \
            .execute()

        other_moments = other_response.data or []

        if not other_moments:
            return jsonify({
                'success': True,
                'related_moments': []
            }), 200

        # Use AI to find related moments
        ai_service = ThreadAIService()
        result = ai_service.find_related_moments(
            moment=moment,
            all_moments=other_moments,
            limit=5
        )

        if result['success']:
            return jsonify({
                'success': True,
                'related_moments': result['related_moments']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to find related moments')
            }), 500

    except Exception as e:
        logger.error(f"Error in find_related_moments: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/detect-threads', methods=['GET'])
@require_auth
def detect_hidden_threads(user_id):
    """Use AI to detect potential threads in unlinked moments."""
    try:
        from database import get_supabase_admin_client
        from services.thread_ai_service import ThreadAIService

        # admin client justified: learning event reads/writes scoped to caller (self) under @require_auth
        supabase = get_supabase_admin_client()

        # Get unlinked moments (no parent and no children)
        all_response = supabase.table('learning_events') \
            .select('id, title, description, pillars, created_at, parent_moment_id') \
            .eq('user_id', user_id) \
            .is_('parent_moment_id', 'null') \
            .order('created_at', desc=True) \
            .limit(40) \
            .execute()

        moments = all_response.data or []

        if len(moments) < 3:
            return jsonify({
                'success': True,
                'hidden_threads': [],
                'message': 'Not enough moments to detect threads'
            }), 200

        # Use AI to detect hidden threads
        ai_service = ThreadAIService()
        result = ai_service.detect_hidden_threads(moments=moments)

        if result['success']:
            return jsonify({
                'success': True,
                'hidden_threads': result['hidden_threads']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to detect threads')
            }), 500

    except Exception as e:
        logger.error(f"Error in detect_hidden_threads: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>/thread-narrative', methods=['GET'])
@require_auth
def get_thread_narrative(user_id, event_id):
    """Generate an AI narrative for a thread."""
    try:
        from database import get_supabase_admin_client
        from services.thread_ai_service import ThreadAIService

        # admin client justified: learning event reads/writes scoped to caller (self) under @require_auth
        supabase = get_supabase_admin_client()

        # Get the thread chain
        # First, find the root
        moment_response = supabase.table('learning_events') \
            .select('*') \
            .eq('id', event_id) \
            .eq('user_id', user_id) \
            .single() \
            .execute()

        if not moment_response.data:
            return jsonify({
                'success': False,
                'error': 'Moment not found'
            }), 404

        # Traverse to root
        current = moment_response.data
        thread_moments = [current]

        while current.get('parent_moment_id'):
            parent_response = supabase.table('learning_events') \
                .select('*') \
                .eq('id', current['parent_moment_id']) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if parent_response.data:
                thread_moments.insert(0, parent_response.data)
                current = parent_response.data
            else:
                break

        # Get children of current moment
        def get_children_flat(moment_id):
            children_response = supabase.table('learning_events') \
                .select('*') \
                .eq('parent_moment_id', moment_id) \
                .eq('user_id', user_id) \
                .order('created_at') \
                .execute()

            children = children_response.data or []
            result = []
            for child in children:
                result.append(child)
                result.extend(get_children_flat(child['id']))
            return result

        descendants = get_children_flat(event_id)
        thread_moments.extend(descendants)

        if len(thread_moments) < 2:
            return jsonify({
                'success': True,
                'narrative': None,
                'message': 'Thread needs at least 2 moments for narrative'
            }), 200

        # Generate narrative
        ai_service = ThreadAIService()
        result = ai_service.generate_thread_narrative(thread_moments)

        if result['success']:
            return jsonify({
                'success': True,
                'narrative': {
                    'text': result['narrative'],
                    'theme': result['theme'],
                    'growth_pattern': result['growth_pattern'],
                    'key_insight': result['key_insight'],
                    'potential_next_step': result['potential_next_step']
                },
                'moment_count': len(thread_moments)
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to generate narrative')
            }), 500

    except Exception as e:
        logger.error(f"Error in get_thread_narrative: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


# ──────────────────────────────────────────
# Mobile Capture Endpoints (March 2026)
# ──────────────────────────────────────────
