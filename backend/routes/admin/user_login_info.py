"""Email a user their login information, from /admin/users.

Two routes on the admin user-management blueprint (registered from
routes/admin/user_management.py, which was at the route-file size cap when
this arrived). Never a password: the mail carries the address they sign in
with, a single-use set-your-password link and the steps --
services/login_info_service.py.
"""

from flask import jsonify, request

from utils.auth.decorators import require_admin
from utils.logger import get_logger

logger = get_logger(__name__)


def register(bp):
    @bp.route('/users/<target_user_id>/login-info', methods=['POST'])
    @require_admin
    def admin_send_login_info(user_id, target_user_id):
        """Email a user their login information (admin only).

        Sends the address they sign in with, a single-use set-your-password link
        and the sign-in steps. Never a password: services/login_info_service.py.
        """
        from middleware.error_handler import ExternalServiceError
        from services.login_info_service import LoginInfoError, send_login_info

        try:
            result = send_login_info(target_user_id)
        except LoginInfoError as e:
            status = 404 if str(e) == 'User not found' else 400
            return jsonify({'success': False, 'error': str(e)}), status
        except RuntimeError as e:
            # Token mint or SendGrid failed: a 503 that says so, not a generic 500.
            raise ExternalServiceError('Email', str(e), e) from e

        logger.info(f"Admin {user_id} sent login info to user {target_user_id}")
        return jsonify({
            'success': True,
            'message': f"Login information sent to {result['email']}",
            **result,
        })


    @bp.route('/users/bulk-login-info', methods=['POST'])
    @require_admin
    def admin_send_login_info_bulk(user_id):
        """Email login information to each selected user (admin only).

        One failure never stops the rest; the response names each account that
        could not be emailed and why, so the admin can act on it.
        """
        from services.login_info_service import send_login_info_bulk

        data = request.json or {}
        user_ids = data.get('user_ids')
        if not isinstance(user_ids, list) or not user_ids:
            return jsonify({'success': False, 'error': 'No users selected'}), 400
        if len(user_ids) > 100:
            return jsonify({'success': False, 'error': 'Select at most 100 users at a time'}), 400

        result = send_login_info_bulk([str(uid) for uid in user_ids])
        logger.info(
            f"Admin {user_id} sent login info to {result['sent']} of {len(user_ids)} users")
        return jsonify({'success': True, **result})
