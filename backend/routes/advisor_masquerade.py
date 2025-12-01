"""
Advisor masquerade routes - Allow advisors to view platform as their assigned students
"""
from flask import Blueprint, jsonify, request
from database import get_supabase_admin_client
from utils.auth.decorators import require_role
from utils.session_manager import session_manager
from utils.logger import get_logger
from datetime import datetime, timezone

logger = get_logger(__name__)

advisor_masquerade_bp = Blueprint('advisor_masquerade', __name__, url_prefix='/api/advisor/masquerade')

@advisor_masquerade_bp.route('/<target_student_id>', methods=['POST'])
@require_role('advisor', 'admin')
def start_advisor_masquerade(advisor_id, target_student_id):
    """
    Start a masquerade session as an assigned student

    Advisors can only masquerade as students assigned to them.
    Admins can masquerade as any student (bypass relationship check).

    Request body (optional):
    {
        "reason": "Helping student with quest completion issue"
    }

    Returns masquerade token and target student info
    """
    try:
        supabase = get_supabase_admin_client()

        # Get advisor/admin user info
        advisor_user = supabase.table('users').select('role').eq('id', advisor_id).execute()
        if not advisor_user.data:
            return jsonify({'error': 'User not found'}), 404

        advisor_role = advisor_user.data[0].get('role')

        # Validate target student exists
        target_student = supabase.table('users').select('*').eq('id', target_student_id).execute()

        if not target_student.data:
            return jsonify({'error': 'Target student not found'}), 404

        target_student_data = target_student.data[0]

        # Verify target is a student
        if target_student_data.get('role') != 'student':
            return jsonify({'error': 'Can only masquerade as students'}), 403

        # For advisors (not admins), verify they have access to this student
        if advisor_role == 'advisor':
            relationship = supabase.table('advisor_students').select('id').eq(
                'advisor_id', advisor_id
            ).eq('student_id', target_student_id).execute()

            if not relationship.data:
                return jsonify({'error': 'You do not have access to this student'}), 403

        # Get request metadata
        ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
        user_agent = request.headers.get('User-Agent', '')
        reason = request.json.get('reason', '') if request.json else ''

        # Generate masquerade token
        masquerade_token = session_manager.generate_masquerade_token(advisor_id, target_student_id)

        # Log masquerade session start
        log_entry = {
            'admin_id': advisor_id,  # Using admin_id field for both admins and advisors
            'target_user_id': target_student_id,
            'started_at': datetime.now(timezone.utc).isoformat(),
            'ip_address': ip_address,
            'user_agent': user_agent,
            'reason': reason
        }

        result = supabase.table('admin_masquerade_log').insert(log_entry).execute()
        log_id = result.data[0]['id'] if result.data else None

        logger.info(f"[Advisor Masquerade] {advisor_role.capitalize()} {advisor_id} started masquerading as student {target_student_id} (log_id: {log_id})")

        # Return masquerade token and target student info
        return jsonify({
            'masquerade_token': masquerade_token,
            'log_id': log_id,
            'target_user': {
                'id': target_student_data['id'],
                'display_name': target_student_data.get('display_name'),
                'email': target_student_data.get('email'),
                'role': target_student_data.get('role'),
                'avatar_url': target_student_data.get('avatar_url')
            },
            'expires_in': 3600  # 1 hour in seconds
        }), 200

    except Exception as e:
        logger.error(f"[Advisor Masquerade] Error starting masquerade: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to start masquerade session'}), 500


@advisor_masquerade_bp.route('/exit', methods=['POST'])
def exit_advisor_masquerade():
    """
    Exit masquerade session and return advisor's original token

    Returns new advisor access token
    """
    try:
        # Get masquerade info from current token
        masquerade_info = session_manager.get_masquerade_info()

        if not masquerade_info:
            return jsonify({'error': 'Not currently masquerading'}), 400

        advisor_id = masquerade_info['admin_id']  # Field name is admin_id but could be advisor
        target_student_id = masquerade_info['target_user_id']

        supabase = get_supabase_admin_client()

        # Update masquerade log with end time
        ended_at = datetime.now(timezone.utc).isoformat()

        # Find the most recent unended masquerade session
        log_result = supabase.table('admin_masquerade_log')\
            .select('id')\
            .eq('admin_id', advisor_id)\
            .eq('target_user_id', target_student_id)\
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

            logger.info(f"[Advisor Masquerade] Advisor {advisor_id} ended masquerade as student {target_student_id} (log_id: {log_id})")

        # Generate new advisor access token
        advisor_access_token = session_manager.generate_access_token(advisor_id)
        advisor_refresh_token = session_manager.generate_refresh_token(advisor_id)

        # Get advisor user info
        advisor_user = supabase.table('users').select('*').eq('id', advisor_id).execute()
        advisor_data = advisor_user.data[0] if advisor_user.data else {}

        return jsonify({
            'access_token': advisor_access_token,
            'refresh_token': advisor_refresh_token,
            'user': {
                'id': advisor_data['id'],
                'display_name': advisor_data.get('display_name'),
                'email': advisor_data.get('email'),
                'role': advisor_data.get('role'),
                'avatar_url': advisor_data.get('avatar_url')
            }
        }), 200

    except Exception as e:
        logger.error(f"[Advisor Masquerade] Error exiting masquerade: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to exit masquerade session'}), 500
