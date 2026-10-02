"""Create an account by email, from /admin/users.

One route on the admin user-management blueprint (registered from
routes/admin/user_management.py, which sits at the route-file size cap). The
work is in services/account_invite_service.py.
"""

from flask import jsonify, request

from utils.auth.decorators import require_admin
from utils.logger import get_logger

logger = get_logger(__name__)


def register(bp):
    @bp.route('/users/create-by-email', methods=['POST'])
    @require_admin
    def admin_create_account_by_email(user_id):
        """Create an account and email the person a link to finish setup
        (superadmin only). Body: email, role, organization_id?, first_name?,
        last_name?."""
        from services.account_invite_service import AccountInviteError, create_account_invite

        data = request.json or {}
        try:
            result = create_account_invite(
                email=data.get('email'),
                role=data.get('role'),
                organization_id=data.get('organization_id'),
                first_name=data.get('first_name') or '',
                last_name=data.get('last_name') or '',
            )
        except AccountInviteError as e:
            return jsonify({'success': False, 'error': str(e)}), e.status

        logger.info(f"Admin {user_id} created account {result['user_id']} by email")
        message = (f"Account created. A setup email went to {result['email']}."
                   if result['email_sent'] else
                   f"Account created, but the email to {result['email']} did not send. "
                   "Use Send Login Info to try again.")
        return jsonify({'success': True, 'message': message, **result}), 201
