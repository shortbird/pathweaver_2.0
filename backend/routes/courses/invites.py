"""
Courses Module - Invite Tokens

Shareable signup tokens for student-curated classes. The class creator (or
superadmin) generates a token, shares the resulting link with friends, and the
registration flow consumes the token to enroll the new account in the class.
"""

import secrets
from datetime import datetime
from flask import request, jsonify
from utils.auth.decorators import require_auth
from database import get_supabase_admin_client
from utils.session_manager import session_manager
from utils.logger import get_logger
from utils.roles import get_effective_role
from routes.courses import can_manage_course

logger = get_logger(__name__)


def _generate_token() -> str:
    """22-char URL-safe token. Collision space is huge; we still rely on the
    UNIQUE index to reject any duplicate."""
    return secrets.token_urlsafe(16)


def register_routes(bp):
    """Register invite-token routes on the courses blueprint."""

    @bp.route('/<course_id>/invites', methods=['POST'])
    @require_auth
    def create_invite(user_id, course_id: str):
        """
        Create a shareable invite token for a course.

        Body (all optional):
            - expires_at: ISO 8601 timestamp; NULL = never expires
            - max_uses: positive integer; NULL = unlimited
        """
        try:
            user_id = session_manager.get_effective_user_id()
            client = get_supabase_admin_client()

            course_result = client.table('courses').select('created_by').eq('id', course_id).execute()
            if not course_result.data:
                return jsonify({'error': 'Course not found'}), 404
            course = course_result.data[0]

            user_result = client.table('users').select('role, org_role').eq('id', user_id).execute()
            if not user_result.data:
                return jsonify({'error': 'User not found'}), 404
            user_data = {**user_result.data[0], 'id': user_id}

            if not can_manage_course(user_data, course):
                return jsonify({'error': 'Only the class creator or an admin can create invite links'}), 403

            data = request.get_json(silent=True) or {}
            expires_at = data.get('expires_at')
            max_uses = data.get('max_uses')

            if max_uses is not None:
                try:
                    max_uses = int(max_uses)
                    if max_uses <= 0:
                        return jsonify({'error': 'max_uses must be a positive integer'}), 400
                except (TypeError, ValueError):
                    return jsonify({'error': 'max_uses must be a positive integer'}), 400

            # Retry once on UNIQUE collision (extremely unlikely with 16 bytes of entropy)
            for attempt in range(2):
                token = _generate_token()
                try:
                    insert_result = client.table('course_invites').insert({
                        'course_id': course_id,
                        'token': token,
                        'created_by': user_id,
                        'expires_at': expires_at,
                        'max_uses': max_uses,
                    }).execute()
                    if insert_result.data:
                        logger.info(f"Invite token created for course {course_id} by {user_id}")
                        return jsonify({'success': True, 'invite': insert_result.data[0]}), 201
                except Exception as insert_err:
                    if attempt == 0 and ('duplicate' in str(insert_err).lower() or '23505' in str(insert_err)):
                        continue
                    raise

            return jsonify({'error': 'Failed to create invite token'}), 500

        except Exception as e:
            logger.error(f"Error creating invite for course {course_id}: {str(e)}")
            return jsonify({'error': str(e)}), 500


    @bp.route('/<course_id>/invites', methods=['GET'])
    @require_auth
    def list_invites(user_id, course_id: str):
        """List all invite tokens for a course (creator or superadmin only)."""
        try:
            user_id = session_manager.get_effective_user_id()
            client = get_supabase_admin_client()

            course_result = client.table('courses').select('created_by').eq('id', course_id).execute()
            if not course_result.data:
                return jsonify({'error': 'Course not found'}), 404
            course = course_result.data[0]

            user_result = client.table('users').select('role, org_role').eq('id', user_id).execute()
            if not user_result.data:
                return jsonify({'error': 'User not found'}), 404
            user_data = {**user_result.data[0], 'id': user_id}

            if not can_manage_course(user_data, course):
                return jsonify({'error': 'Only the class creator or an admin can view invite links'}), 403

            invites = client.table('course_invites')\
                .select('*')\
                .eq('course_id', course_id)\
                .order('created_at', desc=True)\
                .execute()

            return jsonify({'success': True, 'invites': invites.data or []}), 200

        except Exception as e:
            logger.error(f"Error listing invites for course {course_id}: {str(e)}")
            return jsonify({'error': str(e)}), 500


    @bp.route('/invites/<invite_id>', methods=['DELETE'])
    @require_auth
    def revoke_invite(user_id, invite_id: str):
        """Revoke an invite token (sets is_active=false, records revoked_at)."""
        try:
            user_id = session_manager.get_effective_user_id()
            client = get_supabase_admin_client()

            invite_result = client.table('course_invites')\
                .select('id, course_id, created_by')\
                .eq('id', invite_id)\
                .execute()
            if not invite_result.data:
                return jsonify({'error': 'Invite not found'}), 404
            invite = invite_result.data[0]

            course_result = client.table('courses').select('created_by').eq('id', invite['course_id']).execute()
            course = course_result.data[0] if course_result.data else {'created_by': invite['created_by']}

            user_result = client.table('users').select('role, org_role').eq('id', user_id).execute()
            user_data = {**(user_result.data[0] if user_result.data else {}), 'id': user_id}

            if not can_manage_course(user_data, course):
                return jsonify({'error': 'Only the class creator or an admin can revoke invite links'}), 403

            client.table('course_invites').update({
                'is_active': False,
                'revoked_at': datetime.utcnow().isoformat(),
            }).eq('id', invite_id).execute()

            logger.info(f"Invite {invite_id} revoked by {user_id}")
            return jsonify({'success': True}), 200

        except Exception as e:
            logger.error(f"Error revoking invite {invite_id}: {str(e)}")
            return jsonify({'error': str(e)}), 500


    @bp.route('/invites/<token>/preview', methods=['GET'])
    def preview_invite(token: str):
        """
        Public endpoint (no auth) — returns minimal class info for the signup
        landing page. Validates that the token is active, unexpired, and under
        its max_uses cap.
        """
        try:
            client = get_supabase_admin_client()

            invite_result = client.table('course_invites')\
                .select('id, course_id, expires_at, max_uses, uses_count, is_active, created_by')\
                .eq('token', token)\
                .execute()

            if not invite_result.data:
                return jsonify({'error': 'invite_not_found', 'message': 'This invite link is not valid.'}), 404

            invite = invite_result.data[0]

            if not invite['is_active']:
                return jsonify({'error': 'invite_revoked', 'message': 'This invite link has been revoked.'}), 410

            if invite.get('expires_at'):
                try:
                    exp = datetime.fromisoformat(invite['expires_at'].replace('Z', '+00:00'))
                    if datetime.now(exp.tzinfo) > exp:
                        return jsonify({'error': 'invite_expired', 'message': 'This invite link has expired.'}), 410
                except (ValueError, AttributeError):
                    pass

            if invite.get('max_uses') is not None and invite['uses_count'] >= invite['max_uses']:
                return jsonify({'error': 'invite_full', 'message': 'This invite link has reached its sign-up limit.'}), 410

            course_result = client.table('courses')\
                .select('id, slug, title, description, cover_image_url, status, course_source, '
                        'teacher_of_record_id, teacher_bio, teacher_credentials, '
                        'kickoff_at, kickoff_meeting_url, credit_subject, credit_amount, '
                        'max_cohort_size')\
                .eq('id', invite['course_id'])\
                .execute()

            if not course_result.data:
                return jsonify({'error': 'class_not_found'}), 404

            course = course_result.data[0]

            if course['status'] != 'published':
                return jsonify({'error': 'class_not_published', 'message': 'This class is not yet open for sign-ups.'}), 409

            inviter_result = client.table('users')\
                .select('first_name, last_name, display_name')\
                .eq('id', invite['created_by'])\
                .execute()
            inviter = inviter_result.data[0] if inviter_result.data else {}
            inviter_name = (
                inviter.get('display_name')
                or f"{inviter.get('first_name', '')} {inviter.get('last_name', '')}".strip()
                or 'A friend'
            )

            return jsonify({
                'success': True,
                'class': course,
                'inviter_name': inviter_name,
                'invite': {
                    'expires_at': invite.get('expires_at'),
                    'seats_remaining': (
                        invite['max_uses'] - invite['uses_count']
                        if invite.get('max_uses') is not None else None
                    ),
                },
            }), 200

        except Exception as e:
            logger.error(f"Error previewing invite {token}: {str(e)}")
            return jsonify({'error': str(e)}), 500
