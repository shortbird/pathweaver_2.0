"""
Analytics Spark Logs Endpoint

Provides Spark integration communication logs for admin review.
"""

from flask import jsonify, request
from datetime import datetime, timedelta
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.logger import get_logger

from . import bp

logger = get_logger(__name__)


@bp.route('/spark-logs', methods=['GET'])
@require_admin
def get_spark_communication_logs(admin_id):
    """
    Get chronological Spark integration communication logs.

    Query params:
    - start_date: Start date (ISO format, default: 7 days ago)
    - end_date: End date (ISO format, default: now)
    - event_type: Filter by specific Spark event type (optional)
    - status: Filter by success/failed (optional)
    - limit: Max results (default: 100, max: 500)
    """
    supabase = get_supabase_admin_client()

    try:
        # Parse query parameters
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        event_type_filter = request.args.get('event_type')
        status_filter = request.args.get('status')
        limit = min(int(request.args.get('limit', 100)), 500)

        # Default date range: 7 days ago to now
        if not start_date_str:
            start_date_str = (datetime.utcnow() - timedelta(days=7)).isoformat()
        if not end_date_str:
            end_date_str = datetime.utcnow().isoformat()

        # Build query - filter by LMS category
        query = supabase.table('user_activity_events').select(
            'id, user_id, event_type, event_category, event_data, page_url, duration_ms, created_at'
        ).eq('event_category', 'lms')

        query = query.gte('created_at', start_date_str)
        query = query.lte('created_at', end_date_str)

        if event_type_filter:
            query = query.eq('event_type', event_type_filter)

        response = query.order('created_at', desc=True).limit(limit).execute()
        events = response.data or []

        # Filter by status if requested
        if status_filter:
            if status_filter == 'success':
                events = [e for e in events if 'success' in e['event_type'] or 'sso_success' in e['event_type']]
            elif status_filter == 'failed':
                events = [e for e in events if 'failed' in e['event_type'] or 'invalid' in e['event_type'] or 'expired' in e['event_type'] or 'replay' in e['event_type']]

        # Collect user IDs for bulk name lookup
        user_ids = set()
        for event in events:
            if event.get('user_id'):
                user_ids.add(event['user_id'])

        # Bulk fetch user names
        user_names = {}
        if user_ids:
            users_response = supabase.table('users').select(
                'id, display_name, first_name, last_name, email'
            ).in_('id', list(user_ids)).execute()

            for user in users_response.data or []:
                user_id = user.get('id')
                display_name = user.get('display_name')
                first_name = user.get('first_name', '')
                last_name = user.get('last_name', '')

                if display_name:
                    user_names[user_id] = display_name
                elif first_name or last_name:
                    user_names[user_id] = f"{first_name} {last_name}".strip()
                else:
                    user_names[user_id] = user.get('email', 'Unknown User')

        # Format events
        formatted_events = []
        for event in events:
            user_id = event.get('user_id')

            formatted_events.append({
                'id': event['id'],
                'timestamp': event['created_at'],
                'event_type': event['event_type'],
                'event_category': event['event_category'],
                'user_id': user_id,
                'user_name': user_names.get(user_id, 'Anonymous'),
                'duration_ms': event.get('duration_ms'),
                'event_data': event.get('event_data', {}),
                'description': _format_spark_event_description(event),
                'status': 'success' if 'success' in event['event_type'] else 'failed'
            })

        # Calculate summary stats
        total_events = len(formatted_events)
        success_count = len([e for e in formatted_events if e['status'] == 'success'])
        failed_count = total_events - success_count

        event_type_counts = {}
        for event in formatted_events:
            event_type = event['event_type']
            event_type_counts[event_type] = event_type_counts.get(event_type, 0) + 1

        return jsonify({
            'success': True,
            'data': {
                'events': formatted_events,
                'total_count': total_events,
                'summary': {
                    'success_count': success_count,
                    'failed_count': failed_count,
                    'success_rate': round((success_count / total_events * 100) if total_events > 0 else 0, 1),
                    'event_type_counts': event_type_counts
                },
                'filters_applied': {
                    'start_date': start_date_str,
                    'end_date': end_date_str,
                    'event_type': event_type_filter,
                    'status': status_filter,
                    'limit': limit
                }
            }
        })

    except Exception as e:
        logger.error(f"Error fetching Spark communication logs: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch Spark communication logs'
        }), 500


def _format_spark_event_description(event: dict) -> str:
    """Format Spark event into human-readable description."""
    event_type = event.get('event_type', '')
    event_data = event.get('event_data', {})

    descriptions = {
        'spark_sso_success': f"Spark SSO login successful for {event_data.get('email', 'unknown user')}",
        'spark_sso_failed': f"Spark SSO login failed: {event_data.get('error_type', 'unknown error')}",
        'spark_sso_token_expired': "Spark SSO token expired",
        'spark_sso_invalid_token': "Spark SSO invalid token signature",
        'spark_token_exchange_success': f"OAuth token exchange successful (code age: {event_data.get('code_age_seconds', 'unknown')}s)",
        'spark_token_exchange_failed': f"OAuth token exchange failed: {event_data.get('error_type', 'unknown error')}",
        'spark_token_code_expired': "OAuth authorization code expired",
        'spark_token_code_reuse': "OAuth authorization code reuse attempt blocked",
        'spark_webhook_success': f"Webhook submission processed (assignment: {event_data.get('spark_assignment_id', 'unknown')}, {event_data.get('file_count', 0)} files, {event_data.get('processing_time_ms', 0)}ms)",
        'spark_webhook_failed': f"Webhook submission failed: {event_data.get('error_type', 'unknown error')}",
        'spark_webhook_invalid_signature': "Webhook HMAC signature validation failed",
        'spark_webhook_replay_attack': f"Webhook replay attack blocked (old timestamp: {event_data.get('submitted_at', 'unknown')})",
        'spark_file_download_success': f"File downloaded successfully: {event_data.get('filename', 'unknown')} ({event_data.get('file_type', 'unknown type')})",
        'spark_file_download_failed': f"File download failed: {event_data.get('filename', 'unknown')} - {event_data.get('error_message', 'unknown error')}"
    }

    return descriptions.get(event_type, event_type.replace('_', ' ').title())
