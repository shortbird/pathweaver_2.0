"""
AI Cost Analytics Routes
========================

Admin routes for viewing AI usage costs and token analytics.

All routes require superadmin role.

Endpoints:
    GET  /api/admin/ai/costs/summary     - Get cost summary for date range
    GET  /api/admin/ai/costs/by-service  - Get costs broken down by service
    GET  /api/admin/ai/costs/trends      - Get daily cost trends
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_superadmin
from database import get_supabase_admin_client
from utils.logger import get_logger
from datetime import datetime, timedelta

logger = get_logger(__name__)

ai_costs_bp = Blueprint('ai_costs', __name__)


@ai_costs_bp.route('/costs/summary', methods=['GET'])
@require_superadmin
def get_cost_summary(user_id):
    """
    Get AI usage cost summary for a date range.

    Query params:
        - days: Number of days to look back (default: 30)

    Returns:
        Summary with total costs, tokens, and request counts
    """
    try:
        days = int(request.args.get('days', 30))
        days = min(max(days, 1), 365)  # Clamp between 1 and 365

        supabase = get_supabase_admin_client()
        date_threshold = (datetime.utcnow() - timedelta(days=days)).isoformat()

        # Get aggregated summary
        result = supabase.table('ai_usage_logs')\
            .select('input_tokens, output_tokens, estimated_cost, success')\
            .gte('created_at', date_threshold)\
            .execute()

        if not result.data:
            return jsonify({
                'period_days': days,
                'total_requests': 0,
                'successful_requests': 0,
                'failed_requests': 0,
                'total_input_tokens': 0,
                'total_output_tokens': 0,
                'total_tokens': 0,
                'total_cost_usd': 0.0,
                'avg_cost_per_request': 0.0,
                'avg_tokens_per_request': 0
            })

        # Calculate aggregates
        total_requests = len(result.data)
        successful = sum(1 for r in result.data if r.get('success', True))
        failed = total_requests - successful
        total_input = sum(r.get('input_tokens', 0) for r in result.data)
        total_output = sum(r.get('output_tokens', 0) for r in result.data)
        total_cost = sum(r.get('estimated_cost', 0) for r in result.data)

        return jsonify({
            'period_days': days,
            'total_requests': total_requests,
            'successful_requests': successful,
            'failed_requests': failed,
            'total_input_tokens': total_input,
            'total_output_tokens': total_output,
            'total_tokens': total_input + total_output,
            'total_cost_usd': round(total_cost, 6),
            'avg_cost_per_request': round(total_cost / total_requests, 8) if total_requests > 0 else 0,
            'avg_tokens_per_request': round((total_input + total_output) / total_requests) if total_requests > 0 else 0
        })

    except Exception as e:
        logger.error(f"Error fetching cost summary: {e}")
        return jsonify({'error': str(e)}), 500


@ai_costs_bp.route('/costs/by-service', methods=['GET'])
@require_superadmin
def get_costs_by_service(user_id):
    """
    Get AI usage costs broken down by service.

    Query params:
        - days: Number of days to look back (default: 30)

    Returns:
        List of services with their usage stats
    """
    try:
        days = int(request.args.get('days', 30))
        days = min(max(days, 1), 365)

        supabase = get_supabase_admin_client()
        date_threshold = (datetime.utcnow() - timedelta(days=days)).isoformat()

        # Get all logs for the period
        result = supabase.table('ai_usage_logs')\
            .select('service_name, input_tokens, output_tokens, estimated_cost, response_time_ms')\
            .gte('created_at', date_threshold)\
            .execute()

        if not result.data:
            return jsonify({'services': [], 'period_days': days})

        # Group by service
        by_service = {}
        for log in result.data:
            service = log.get('service_name', 'unknown')
            if service not in by_service:
                by_service[service] = {
                    'service_name': service,
                    'requests': 0,
                    'input_tokens': 0,
                    'output_tokens': 0,
                    'total_cost_usd': 0.0,
                    'total_response_time_ms': 0,
                    'response_count': 0
                }
            by_service[service]['requests'] += 1
            by_service[service]['input_tokens'] += log.get('input_tokens', 0)
            by_service[service]['output_tokens'] += log.get('output_tokens', 0)
            by_service[service]['total_cost_usd'] += log.get('estimated_cost', 0)
            if log.get('response_time_ms'):
                by_service[service]['total_response_time_ms'] += log['response_time_ms']
                by_service[service]['response_count'] += 1

        # Calculate averages and format
        services = []
        for service_data in by_service.values():
            avg_response_time = 0
            if service_data['response_count'] > 0:
                avg_response_time = round(
                    service_data['total_response_time_ms'] / service_data['response_count']
                )

            services.append({
                'service_name': service_data['service_name'],
                'requests': service_data['requests'],
                'input_tokens': service_data['input_tokens'],
                'output_tokens': service_data['output_tokens'],
                'total_tokens': service_data['input_tokens'] + service_data['output_tokens'],
                'total_cost_usd': round(service_data['total_cost_usd'], 6),
                'avg_response_time_ms': avg_response_time
            })

        # Sort by cost descending
        services.sort(key=lambda x: x['total_cost_usd'], reverse=True)

        return jsonify({
            'services': services,
            'period_days': days
        })

    except Exception as e:
        logger.error(f"Error fetching costs by service: {e}")
        return jsonify({'error': str(e)}), 500


@ai_costs_bp.route('/costs/trends', methods=['GET'])
@require_superadmin
def get_cost_trends(user_id):
    """
    Get daily cost trends for charting.

    Query params:
        - days: Number of days to look back (default: 30)

    Returns:
        Daily aggregated costs for trend visualization
    """
    try:
        days = int(request.args.get('days', 30))
        days = min(max(days, 1), 90)  # Max 90 days for trends

        supabase = get_supabase_admin_client()
        date_threshold = (datetime.utcnow() - timedelta(days=days)).isoformat()

        # Get all logs for the period
        result = supabase.table('ai_usage_logs')\
            .select('created_at, input_tokens, output_tokens, estimated_cost')\
            .gte('created_at', date_threshold)\
            .order('created_at')\
            .execute()

        if not result.data:
            return jsonify({'trends': [], 'period_days': days})

        # Group by date
        by_date = {}
        for log in result.data:
            # Extract date from timestamp
            created_at = log.get('created_at', '')
            date_str = created_at[:10] if created_at else 'unknown'

            if date_str not in by_date:
                by_date[date_str] = {
                    'date': date_str,
                    'requests': 0,
                    'tokens': 0,
                    'cost_usd': 0.0
                }
            by_date[date_str]['requests'] += 1
            by_date[date_str]['tokens'] += log.get('input_tokens', 0) + log.get('output_tokens', 0)
            by_date[date_str]['cost_usd'] += log.get('estimated_cost', 0)

        # Convert to sorted list
        trends = sorted(by_date.values(), key=lambda x: x['date'])

        # Round costs
        for trend in trends:
            trend['cost_usd'] = round(trend['cost_usd'], 6)

        return jsonify({
            'trends': trends,
            'period_days': days
        })

    except Exception as e:
        logger.error(f"Error fetching cost trends: {e}")
        return jsonify({'error': str(e)}), 500
