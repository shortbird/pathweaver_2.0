from flask import Blueprint, jsonify
from database import get_supabase_client
import time

bp = Blueprint('health', __name__)

@bp.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint for monitoring and warm-up"""
    start_time = time.time()
    
    health_status = {
        'status': 'healthy',
        'service': 'optio-backend',
        'timestamp': time.time()
    }
    
    # Optional: Check database connection
    try:
        supabase = get_supabase_client()
        # Simple query to verify connection
        supabase.table('users').select('id').limit(1).execute()
        health_status['database'] = 'connected'
    except Exception as e:
        health_status['database'] = 'error'
        health_status['status'] = 'degraded'
    
    health_status['response_time_ms'] = round((time.time() - start_time) * 1000, 2)
    
    return jsonify(health_status), 200 if health_status['status'] == 'healthy' else 503

@bp.route('/ping', methods=['GET'])
def ping():
    """Ultra-lightweight endpoint for quick checks"""
    return jsonify({'pong': True}), 200