"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED - Admin Utility
- Masquerade functionality (admin impersonation for debugging)
- Uses session_manager for session handling
- Minimal database access (user lookup only)
- Admin utility endpoints don't benefit from repository abstraction
- Security-focused code should remain simple and transparent

Admin masquerade routes - Allow admins to view platform as other users
"""
from flask import Blueprint, jsonify, request
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.session_manager import session_manager
from utils.logger import get_logger
from datetime import datetime, timezone

logger = get_logger(__name__)

masquerade_bp = Blueprint('masquerade', __name__, url_prefix='/api/admin/masquerade')

@masquerade_bp.route('/<target_user_id>', methods=['POST'])
@require_admin
def start_masquerade(admin_id, target_user_id):
    """
    Start a masquerade session as another user

    Request body (optional):
    {
        "reason": "Debugging user issue with quest completion"
    }

    Returns masquerade token and target user info
    """
    try:
        supabase = get_supabase_admin_client()

        # Validate target user exists
        target_user = supabase.table('users').select('*').eq('id', target_user_id).execute()

        if not target_user.data:
            return jsonify({'error': 'Target user not found'}), 404

        target_user_data = target_user.data[0]

        # Check if requesting user is superadmin
        admin_user = supabase.table('users').select('role').eq('id', admin_id).execute()
        admin_role = admin_user.data[0].get('role') if admin_user.data else None

        # DEBUG logging
        logger.info(f"[Masquerade] admin_id={admin_id}, admin_role={admin_role}, target_role={target_user_data.get('role')}")

        # Prevent non-superadmins from masquerading as admins
        # Superadmins can masquerade as anyone for testing/debugging
        if target_user_data.get('role') == 'superadmin' and admin_role != 'superadmin':
            logger.warning(f"[Masquerade] Blocked: admin_role={admin_role} tried to masquerade as {target_user_data.get('role')}")
            return jsonify({'error': 'Only superadmins can masquerade as other admins'}), 403

        # Get request metadata
        ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
        user_agent = request.headers.get('User-Agent', '')
        reason = request.json.get('reason', '') if request.json else ''

        # Generate masquerade token
        masquerade_token = session_manager.generate_masquerade_token(admin_id, target_user_id)

        # Log masquerade session start
        log_entry = {
            'admin_id': admin_id,
            'target_user_id': target_user_id,
            'started_at': datetime.now(timezone.utc).isoformat(),
            'ip_address': ip_address,
            'user_agent': user_agent,
            'reason': reason
        }

        result = supabase.table('admin_masquerade_log').insert(log_entry).execute()
        log_id = result.data[0]['id'] if result.data else None

        logger.info(f"[Masquerade] Admin {admin_id} started masquerading as {target_user_id} (log_id: {log_id})")

        # Return masquerade token and target user info
        return jsonify({
            'masquerade_token': masquerade_token,
            'log_id': log_id,
            'target_user': {
                'id': target_user_data['id'],
                'display_name': target_user_data.get('display_name'),
                'email': target_user_data.get('email'),
                'role': target_user_data.get('role'),
                'avatar_url': target_user_data.get('avatar_url')
            },
            'expires_in': 3600  # 1 hour in seconds
        }), 200

    except Exception as e:
        logger.error(f"[Masquerade] Error starting masquerade: {str(e)}")
        return jsonify({'error': 'Failed to start masquerade session'}), 500


@masquerade_bp.route('/exit', methods=['POST'])
def exit_masquerade():
    """
    Exit masquerade session and return admin's original token

    Returns new admin access token
    """
    try:
        # Get masquerade info from current token
        masquerade_info = session_manager.get_masquerade_info()

        if not masquerade_info:
            return jsonify({'error': 'Not currently masquerading'}), 400

        admin_id = masquerade_info['admin_id']
        target_user_id = masquerade_info['target_user_id']

        supabase = get_supabase_admin_client()

        # Update masquerade log with end time
        ended_at = datetime.now(timezone.utc).isoformat()

        # Find the most recent unended masquerade session
        log_result = supabase.table('admin_masquerade_log')\
            .select('id')\
            .eq('admin_id', admin_id)\
            .eq('target_user_id', target_user_id)\
            .is_('ended_at', 'null')\
            .order('started_at', desc=True)\
            .limit(1)\
            .execute()

        if log_result.data:
            log_id = log_result.data[0]['id']
            supabase.table('admin_masquerade_log')\
                .update({'ended_at': ended_at})\
                .eq('id', log_id)\
                .execute()

            logger.info(f"[Masquerade] Admin {admin_id} ended masquerade as {target_user_id} (log_id: {log_id})")

        # Generate new admin access token
        admin_access_token = session_manager.generate_access_token(admin_id)
        admin_refresh_token = session_manager.generate_refresh_token(admin_id)

        # Get admin user info
        admin_user = supabase.table('users').select('*').eq('id', admin_id).execute()
        admin_data = admin_user.data[0] if admin_user.data else {}

        return jsonify({
            'access_token': admin_access_token,
            'refresh_token': admin_refresh_token,
            'user': {
                'id': admin_data['id'],
                'display_name': admin_data.get('display_name'),
                'email': admin_data.get('email'),
                'role': admin_data.get('role'),
                'avatar_url': admin_data.get('avatar_url')
            }
        }), 200

    except Exception as e:
        logger.error(f"[Masquerade] Error exiting masquerade: {str(e)}")
        return jsonify({'error': 'Failed to exit masquerade session'}), 500


@masquerade_bp.route('/history', methods=['GET'])
@require_admin
def get_masquerade_history(admin_id):
    """
    Get masquerade history for audit purposes

    Query params:
    - limit: Number of records to return (default 50)
    - offset: Pagination offset (default 0)
    - admin_id: Filter by specific admin (optional)
    - target_user_id: Filter by specific target user (optional)
    """
    try:
        supabase = get_supabase_admin_client()

        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))
        filter_admin_id = request.args.get('admin_id')
        filter_target_id = request.args.get('target_user_id')

        # Build query
        query = supabase.table('admin_masquerade_log')\
            .select('''
                *,
                admin:admin_id(id, display_name, email),
                target_user:target_user_id(id, display_name, email)
            ''')

        if filter_admin_id:
            query = query.eq('admin_id', filter_admin_id)

        if filter_target_id:
            query = query.eq('target_user_id', filter_target_id)

        # Execute with pagination
        result = query.order('started_at', desc=True)\
            .range(offset, offset + limit - 1)\
            .execute()

        # Get total count
        count_query = supabase.table('admin_masquerade_log').select('id', count='exact')
        if filter_admin_id:
            count_query = count_query.eq('admin_id', filter_admin_id)
        if filter_target_id:
            count_query = count_query.eq('target_user_id', filter_target_id)

        count_result = count_query.execute()
        total_count = count_result.count if hasattr(count_result, 'count') else len(result.data)

        return jsonify({
            'sessions': result.data,
            'total': total_count,
            'limit': limit,
            'offset': offset
        }), 200

    except Exception as e:
        logger.error(f"[Masquerade] Error fetching history: {str(e)}")
        return jsonify({'error': 'Failed to fetch masquerade history'}), 500


@masquerade_bp.route('/status', methods=['GET'])
def get_masquerade_status():
    """
    Get current masquerade session status

    Returns masquerade info if currently masquerading, else null
    """
    try:
        masquerade_info = session_manager.get_masquerade_info()

        if masquerade_info:
            supabase = get_supabase_admin_client()

            # Get target user info
            target_user = supabase.table('users')\
                .select('id, display_name, email, role, avatar_url')\
                .eq('id', masquerade_info['target_user_id'])\
                .execute()

            target_data = target_user.data[0] if target_user.data else {}

            return jsonify({
                'is_masquerading': True,
                'admin_id': masquerade_info['admin_id'],
                'target_user': target_data
            }), 200

        return jsonify({'is_masquerading': False}), 200

    except Exception as e:
        logger.error(f"[Masquerade] Error checking status: {str(e)}")
        return jsonify({'error': 'Failed to check masquerade status'}), 500
