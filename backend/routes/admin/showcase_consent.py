"""Admin Showcase Consent routes.

Lets superadmin manage the per-student tiered consent state. The legal doc URL,
signed date, and the boolean tier flags are recorded here.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_admin, validate_uuid_param
from middleware.error_handler import ValidationError
from repositories.showcase_repository import ShowcaseRepository, CONSENT_FIELDS
from utils.logger import get_logger

logger = get_logger(__name__)
bp = Blueprint('admin_showcase_consent', __name__)


@bp.route('/api/admin/showcase/consent', methods=['GET'])
@require_admin
def list_consent(user_id: str):
    """Paginated list of students with their current consent state.

    Query params:
        page (default 1), limit (default 50, max 100)
        search: partial match on email/first/last name
        active_only: '1' to filter to currently consenting only
    """
    try:
        page = max(1, int(request.args.get('page', 1)))
        limit = min(100, max(1, int(request.args.get('limit', 50))))
        offset = (page - 1) * limit
        search = request.args.get('search') or None
        active_only = request.args.get('active_only') == '1'

        repo = ShowcaseRepository()
        out = repo.list_students_with_consent(search=search, active_only=active_only,
                                              limit=limit, offset=offset)
        return jsonify({
            'students': out['students'],
            'pagination': {
                'page': page,
                'limit': limit,
                'total': out['total'],
                'pages': (out['total'] + limit - 1) // limit if out['total'] else 1,
            }
        }), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"list_consent failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to list students'}), 500


@bp.route('/api/admin/showcase/consent/<student_id>', methods=['GET'])
@require_admin
@validate_uuid_param('student_id')
def get_consent(user_id: str, student_id: str):
    """Detail: current consent + history."""
    try:
        repo = ShowcaseRepository()
        return jsonify({
            'consent': repo.get_consent(student_id),
            'history': repo.get_consent_history(student_id),
        }), 200
    except Exception as e:
        logger.error(f"get_consent failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to load consent'}), 500


@bp.route('/api/admin/showcase/consent/<student_id>', methods=['PUT'])
@require_admin
@validate_uuid_param('student_id')
def upsert_consent(user_id: str, student_id: str):
    """Set/update the tiered consent state."""
    try:
        body = request.get_json() or {}
        # Strict allowlist: only documented consent fields + doc metadata
        allowed = set(CONSENT_FIELDS) | {'consent_doc_url', 'consent_signed_date'}
        fields = {k: v for k, v in body.items() if k in allowed}
        if not fields:
            raise ValidationError("No consent fields provided")

        # Bool coercion
        for k in CONSENT_FIELDS:
            if k in fields and not isinstance(fields[k], bool):
                fields[k] = bool(fields[k])

        repo = ShowcaseRepository()
        out = repo.upsert_consent(student_id, fields, recorded_by=user_id)
        return jsonify(out), 200
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"upsert_consent failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to update consent'}), 500


@bp.route('/api/admin/showcase/consent/<student_id>/revoke', methods=['POST'])
@require_admin
@validate_uuid_param('student_id')
def revoke_consent(user_id: str, student_id: str):
    """Admin-driven revocation. Cascades take-down flag + dismisses queue items."""
    try:
        body = request.get_json() or {}
        reason = body.get('reason') or 'admin revoked'
        repo = ShowcaseRepository()
        result = repo.revoke_consent(student_id, revoked_by=user_id, reason=reason, source='admin')
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"revoke_consent failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to revoke consent'}), 500


# Toggle the can_view_showcase permission flag for a user
@bp.route('/api/admin/showcase/permission/<target_user_id>', methods=['POST'])
@require_admin
@validate_uuid_param('target_user_id')
def set_permission(user_id: str, target_user_id: str):
    """Grant/revoke marketer access via users.can_view_showcase."""
    try:
        body = request.get_json() or {}
        if 'can_view_showcase' not in body:
            raise ValidationError("can_view_showcase boolean is required")
        flag = bool(body['can_view_showcase'])

        from database import get_supabase_admin_client
        # admin client justified: superadmin-only route — needs RLS bypass to grant marketer access
        admin = get_supabase_admin_client()
        res = admin.table('users').update({'can_view_showcase': flag}).eq('id', target_user_id).execute()
        if not res.data:
            return jsonify({'error': 'User not found'}), 404
        return jsonify({'user_id': target_user_id, 'can_view_showcase': flag}), 200
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"set_permission failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to update permission'}), 500
