from flask import Blueprint, jsonify, request
from database import get_supabase_client
from backend.repositories import (
    UserRepository,
    QuestRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
from datetime import datetime
import time
import os

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('health', __name__)

@bp.route('/health', methods=['GET'])
def health_check():
    """
    Comprehensive health check endpoint for monitoring

    Query params:
    - full=true: Include checks for external services (slower)

    Returns 200 if healthy, 503 if degraded/unhealthy
    """
    start_time = time.time()

    health_status = {
        'status': 'healthy',
        'service': 'optio-backend',
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'environment': os.environ.get('FLASK_ENV', 'production'),
        'version': os.environ.get('APP_VERSION', 'unknown')
    }

    checks = {}
    overall_healthy = True

    # Database connectivity check
    try:
        supabase = get_supabase_client()
        db_start = time.time()
        supabase.table('users').select('id').limit(1).execute()
        db_time = int((time.time() - db_start) * 1000)

        checks['database'] = {
            'status': 'healthy',
            'response_time_ms': db_time
        }

        # Warn if database is slow
        if db_time > 1000:
            checks['database']['warning'] = 'Slow response time'

    except Exception as e:
        checks['database'] = {
            'status': 'unhealthy',
            'error': str(e)
        }
        overall_healthy = False

    # Optional full health check (includes external services)
    if request.args.get('full') == 'true':
        # Stripe connectivity check (optional, don't fail overall health)
        try:
            if os.environ.get('STRIPE_SECRET_KEY'):
                import stripe
                stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
                stripe_start = time.time()
                stripe.Balance.retrieve()
                checks['stripe'] = {
                    'status': 'healthy',
                    'response_time_ms': int((time.time() - stripe_start) * 1000)
                }
        except Exception as e:
            checks['stripe'] = {
                'status': 'degraded',
                'error': str(e)
            }
            # Don't mark overall as unhealthy for Stripe

    health_status['checks'] = checks
    health_status['status'] = 'healthy' if overall_healthy else 'unhealthy'
    health_status['response_time_ms'] = round((time.time() - start_time) * 1000, 2)

    status_code = 200 if overall_healthy else 503
    return jsonify(health_status), status_code

@bp.route('/ping', methods=['GET'])
def ping():
    """Ultra-lightweight endpoint for quick checks"""
    return jsonify({'pong': True}), 200