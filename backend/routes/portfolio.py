"""
REPOSITORY MIGRATION: COMPLETE
- Uses PortfolioService for all data operations
- Service orchestrates multiple repositories/tables
- Routes are thin controllers handling HTTP concerns only
"""

from flask import Blueprint, jsonify, request
from flask_cors import cross_origin
from services.portfolio_service import PortfolioService
from utils.auth.decorators import require_auth
from utils.api_response_v1 import success_response, error_response
from utils.session_manager import session_manager
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('portfolio', __name__)


@bp.route('/public/<portfolio_slug>', methods=['GET'])
@cross_origin()
def get_public_portfolio(portfolio_slug):
    """
    Public endpoint (no auth required) to view a student's portfolio.
    Returns: user info, completed quests with evidence, skill XP totals
    """
    try:
        portfolio_service = PortfolioService()
        result = portfolio_service.get_public_portfolio_data(portfolio_slug)

        if 'error' in result:
            return error_response(
                code='PORTFOLIO_NOT_FOUND',
                message=result['error'],
                status=404
            )

        return success_response(data=result)

    except Exception as e:
        import traceback
        logger.error(f"Error fetching portfolio: {str(e)}")
        logger.info(f"Full traceback: {traceback.format_exc()}")
        return error_response(
            code='PORTFOLIO_ERROR',
            message='Failed to fetch portfolio',
            status=500
        )


@bp.route('/user/<user_id>', methods=['GET'])
@cross_origin()
@require_auth
def get_user_portfolio(auth_user_id: str, user_id: str):
    """
    Get portfolio data for a specific user.

    Requires a relationship to the student. This check was absent until
    2026-08: `auth_user_id` was accepted and never compared to `user_id`, so
    any signed-in account could read any other user's portfolio summary --
    including their curated portfolio picks and the evidence snippets inside
    them -- regardless of whether that portfolio was private.
    """
    try:
        from utils.portfolio_access import can_view_portfolio

        if not can_view_portfolio(auth_user_id, user_id):
            return error_response(
                code='PERMISSION_DENIED',
                message='You do not have access to this portfolio',
                status=403
            )

        logger.info(f"Getting portfolio for user_id: {user_id}")
        portfolio_service = PortfolioService()
        result = portfolio_service.get_portfolio_summary(user_id)

        return jsonify(result), 200

    except Exception as e:
        import traceback
        logger.error(f"Error fetching user portfolio: {str(e)}")
        logger.info(f"Full traceback: {traceback.format_exc()}")
        # Degraded response on error. is_public is False here on purpose: when
        # we cannot determine a portfolio's visibility, the safe answer is the
        # private one. This previously reported True, so a transient database
        # error made the UI announce that a private portfolio was public.
        return jsonify({
            'diploma': {
                'portfolio_slug': f"user{user_id[:8]}",
                'issued_date': None,
                'is_public': False
            },
            'user': {'id': user_id},
            'skill_xp': [],
            'total_quests_completed': 0,
            'total_xp': 0,
            'portfolio_url': None
        }), 200


@bp.route('/diploma/<user_id>', methods=['GET'])
@cross_origin(supports_credentials=True)
def get_public_diploma_by_user_id(user_id):
    """
    Public endpoint to view a student's diploma by user ID.
    This is the route called by the diploma page when viewing /diploma/:userId
    """
    try:
        logger.info(f"=== DIPLOMA ENDPOINT CALLED FOR USER: {user_id} ===")

        portfolio_service = PortfolioService()

        # Get viewer for access check
        viewer_user_id = session_manager.get_current_user_id()
        logger.info(f"[FERPA] Viewer check: viewer_user_id={viewer_user_id}")

        # LTI SpeedGrader carve-out: a signed evidence token authorizes the
        # (unauthenticated) grading teacher to view this student's diploma
        # regardless of its public/private setting.
        lti_token = request.args.get('lti_token')
        lti_authorized = False
        if lti_token:
            from services.lti_service import verify_evidence_token
            lti_authorized = verify_evidence_token(lti_token, user_id)
            logger.info(f"[LTI] Evidence token presented; valid={lti_authorized}")

        result = portfolio_service.get_diploma_data(
            user_id, viewer_user_id, lti_authorized=lti_authorized
        )

        if 'error' in result:
            error_msg = result['error']
            if error_msg == 'User not found':
                logger.error(f"ERROR: User not found for ID: {user_id}")
                return jsonify({'error': 'User not found'}), 404
            else:
                logger.info(f"[FERPA] Access DENIED: viewer={viewer_user_id}, owner={user_id}")
                return jsonify({'error': 'Portfolio not found or private'}), 404

        logger.info(f"[FERPA] Access GRANTED: viewer={viewer_user_id}, owner={user_id}")
        logger.info("=== RETURNING DIPLOMA DATA ===")
        logger.info(f"Student: {result.get('student')}")
        logger.info(f"Achievements: {len(result.get('achievements', []))}")
        logger.info(f"Total XP: {result.get('total_xp')}")

        return jsonify(result), 200

    except Exception as e:
        import traceback
        logger.error("=== ERROR IN DIPLOMA ENDPOINT ===")
        logger.error(f"Error fetching diploma: {str(e)}")
        logger.info(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Failed to fetch diploma'}), 500


# =============================================================================
# PORTFOLIO CURATION ("Portfolio picks")
# =============================================================================

def _can_curate_for(caller_id: str, student_id: str) -> bool:
    """May the caller curate this student's portfolio?
    Allowed: the student themselves, their parent (parent_student_links or
    managed_by_parent_id), an org_admin of the student's org, and superadmin."""
    if caller_id == student_id:
        return True
    from database import get_supabase_admin_client
    # admin client justified: relationship/role verification before a cross-user
    # write (parent link, org admin, superadmin) — the write itself is a single
    # boolean flag on the student's own completion row.
    admin = get_supabase_admin_client()

    caller_rows = admin.table('users').select(
        'id, role, org_role, org_roles, organization_id'
    ).eq('id', caller_id).limit(1).execute().data
    if not caller_rows:
        return False
    caller = caller_rows[0]
    if caller.get('role') == 'superadmin':
        return True

    student_rows = admin.table('users').select(
        'id, organization_id, managed_by_parent_id'
    ).eq('id', student_id).limit(1).execute().data
    if not student_rows:
        return False
    student = student_rows[0]

    # Parent of a dependent
    if student.get('managed_by_parent_id') == caller_id:
        return True

    # Linked parent (statuses vary historically: approved / active)
    links = admin.table('parent_student_links').select('id, status')\
        .eq('parent_user_id', caller_id).eq('student_user_id', student_id).execute().data or []
    if any(l.get('status') in ('approved', 'active') for l in links):
        return True

    # Org admin of the student's org
    caller_org_roles = set(caller.get('org_roles') or [])
    if caller.get('org_role'):
        caller_org_roles.add(caller['org_role'])
    if ('org_admin' in caller_org_roles
            and caller.get('organization_id')
            and caller.get('organization_id') == student.get('organization_id')):
        return True
    return False


@bp.route('/completions/<completion_id>/curate', methods=['PATCH'])
@require_auth
def curate_completion(user_id, completion_id):
    """Toggle a completed task in/out of the curated "Portfolio picks" section.

    Body: {"in_portfolio": true|false}
    Allowed: the completion's student, their parent, an org_admin of the
    student's org, or superadmin.
    """
    try:
        data = request.json or {}
        if 'in_portfolio' not in data:
            return error_response(
                code='VALIDATION_ERROR',
                message='in_portfolio (boolean) is required',
                status=400
            )
        in_portfolio = bool(data.get('in_portfolio'))

        from database import get_supabase_admin_client
        # admin client justified: completion ownership + relationship checks done
        # in _can_curate_for before this single-flag write
        admin = get_supabase_admin_client()
        rows = admin.table('quest_task_completions').select('id, user_id')\
            .eq('id', completion_id).limit(1).execute().data
        if not rows:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)
        student_id = rows[0]['user_id']

        if not _can_curate_for(user_id, student_id):
            return error_response(
                code='PERMISSION_DENIED',
                message='You cannot curate this portfolio',
                status=403
            )

        admin.table('quest_task_completions').update(
            {'in_portfolio': in_portfolio}
        ).eq('id', completion_id).execute()

        return success_response(data={'completion_id': completion_id,
                                      'in_portfolio': in_portfolio})
    except Exception as e:
        logger.error(f"Error curating completion {completion_id}: {str(e)}")
        return error_response(code='CURATE_ERROR', message='Failed to update portfolio', status=500)


@bp.route('/completions/by-task/<task_id>', methods=['GET'])
@require_auth
def get_completion_by_task(user_id, task_id):
    """Resolve the caller's (or, with ?student_id=, their child's) completion row
    for a task — used by the "Include in portfolio" toggle to find completion_id.
    Returns {has_completion, completion_id, in_portfolio}."""
    try:
        student_id = request.args.get('student_id') or user_id
        if student_id != user_id and not _can_curate_for(user_id, student_id):
            return error_response(code='PERMISSION_DENIED',
                                  message='Not allowed for this student', status=403)
        from database import get_supabase_admin_client
        # admin client justified: read scoped to caller (or verified child) only
        admin = get_supabase_admin_client()
        rows = admin.table('quest_task_completions').select('id, in_portfolio')\
            .eq('user_quest_task_id', task_id).eq('user_id', student_id)\
            .limit(1).execute().data
        if not rows:
            return success_response(data={'has_completion': False})
        return success_response(data={
            'has_completion': True,
            'completion_id': rows[0]['id'],
            'in_portfolio': bool(rows[0].get('in_portfolio')),
        })
    except Exception as e:
        logger.error(f"Error fetching completion for task {task_id}: {str(e)}")
        return error_response(code='FETCH_ERROR', message='Failed to load completion', status=500)


@bp.route('/completions/curated', methods=['GET'])
@require_auth
def get_curated_completions(user_id):
    """The caller's curated "Portfolio picks" list (or a linked student's via
    ?student_id=, using the same permission rules as curation)."""
    try:
        student_id = request.args.get('student_id') or user_id
        if student_id != user_id and not _can_curate_for(user_id, student_id):
            return error_response(code='PERMISSION_DENIED',
                                  message='Not allowed for this student', status=403)
        curated = PortfolioService().get_curated_completions(student_id)
        return success_response(data={'curated': curated})
    except Exception as e:
        logger.error(f"Error fetching curated completions: {str(e)}")
        return error_response(code='FETCH_ERROR', message='Failed to load portfolio picks', status=500)


# =============================================================================
# FERPA COMPLIANCE: Privacy and Consent Management
# =============================================================================

@bp.route('/user/<user_id>/visibility-status', methods=['GET'])
@require_auth
def get_visibility_status(authenticated_user_id, user_id):
    """
    Get portfolio visibility status including consent and minor status.
    Used by frontend to determine what UI to show for privacy controls.
    """
    try:
        # The student, and anyone who may act on their behalf. Parents could
        # not read this before, which is why the parent dashboard fell back to
        # a hardcoded "private" and told families the opposite of the truth.
        from utils.portfolio_access import can_manage_privacy

        if authenticated_user_id != user_id:
            allowed, _ = can_manage_privacy(authenticated_user_id, user_id)
            if not allowed:
                return error_response(
                    code='UNAUTHORIZED',
                    message='You do not have access to this visibility status',
                    status=403
                )

        portfolio_service = PortfolioService()
        result = portfolio_service.get_visibility_status(user_id)

        if 'error' in result:
            return error_response(
                code='USER_NOT_FOUND',
                message=result['error'],
                status=404
            )

        return success_response(result)

    except Exception as e:
        import traceback
        logger.error(f"Error fetching visibility status: {str(e)}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return error_response(
            code='VISIBILITY_STATUS_ERROR',
            message=f'Failed to fetch visibility status: {str(e)}',
            status=500
        )


@bp.route('/user/<user_id>/privacy', methods=['PUT'])
@require_auth
def update_portfolio_privacy(authenticated_user_id, user_id):
    """Set who can see this portfolio.

    Two callers reach this endpoint:

    * Someone entitled to decide -- an adult student for their own work, a
      parent for their child's, or an org approver for a student with no
      parent. Their instruction is carried out directly, in both directions.
      Making a portfolio private is always permitted and always immediate;
      un-publishing must never be harder than publishing.

    * A minor asking about their own portfolio. They cannot publish, so the
      request becomes an approval request routed to whoever is accountable
      for them. If nobody is, the honest answer is that this work cannot be
      published -- not a silent success.

    Before 2026-08 this endpoint accepted only the student themselves, which
    meant a parent could neither publish nor un-publish their own child's
    work: approval was one-way and permanent, and revocation was impossible
    through any supported path.
    """
    try:
        from utils.portfolio_access import can_manage_privacy, find_approver

        portfolio_service = PortfolioService()
        data = request.json or {}
        is_public = data.get('is_public', False)
        consent_acknowledged = data.get('consent_acknowledged', False)

        allowed, denial_reason = can_manage_privacy(authenticated_user_id, user_id)

        # ---------------------------------------------------------------
        # Not entitled to decide. A student asking about their own work gets
        # the approval flow; anyone else gets a flat refusal.
        # ---------------------------------------------------------------
        if not allowed:
            if authenticated_user_id != user_id:
                return error_response(
                    code='PERMISSION_DENIED',
                    message=denial_reason or 'Not authorized',
                    status=403
                )

            if not is_public:
                # A minor asking for privacy is always granted it. Withholding
                # this would mean a child cannot withdraw their own work.
                portfolio_service.make_portfolio_private(user_id)
                logger.info(f"[FERPA] Student {user_id[:8]} made their own portfolio private")
                return success_response({
                    'message': 'Portfolio is now private',
                    'is_public': False
                })

            if not consent_acknowledged:
                return error_response(
                    code='CONSENT_REQUIRED',
                    message='Must acknowledge consent to request public visibility.',
                    status=400
                )

            approver = find_approver(user_id)
            if not approver:
                return error_response(
                    code='APPROVER_REQUIRED',
                    message='Your portfolio can only be shared publicly with approval '
                            'from a parent or guardian. Ask a parent to link their '
                            'account, then request again.',
                    status=400
                )

            result = portfolio_service.create_parent_approval_request(
                user_id, approver['user_id']
            )
            if 'error' in result:
                code = result['error']
                if code == 'REQUEST_PENDING':
                    return error_response(
                        code='REQUEST_PENDING',
                        message='A request is already waiting for approval.',
                        status=400
                    )
                if code == 'REQUEST_DENIED_RECENTLY':
                    return error_response(
                        code='REQUEST_DENIED_RECENTLY',
                        message=result['message'],
                        status=400
                    )

            _notify_approver(user_id, approver)

            return success_response({
                'message': f"Request sent to {approver['first_name']} for approval",
                'is_public': False,
                'pending_parent_approval': True,
                'parent_name': approver['first_name'],
                'approver_kind': approver['kind'],
            })

        # ---------------------------------------------------------------
        # Entitled to decide.
        # ---------------------------------------------------------------
        if not is_public:
            portfolio_service.make_portfolio_private(user_id)
            logger.info(
                f"[FERPA] Portfolio {user_id[:8]} made private by {authenticated_user_id[:8]}"
            )
            return success_response({
                'message': 'Portfolio is now private',
                'is_public': False
            })

        if not consent_acknowledged:
            return error_response(
                code='CONSENT_REQUIRED',
                message='Must acknowledge consent to make portfolio public. '
                        'Set consent_acknowledged=true to confirm you understand '
                        'these educational records will be publicly accessible.',
                status=400
            )

        result = portfolio_service.make_portfolio_public(
            user_id, consented_by=authenticated_user_id
        )

        if result.get('success'):
            logger.info(
                f"[FERPA] Portfolio {user_id[:8]} made public, consent by {authenticated_user_id[:8]}"
            )
            return success_response({
                'message': 'Portfolio is now public',
                'is_public': True,
                'consent_given': True
            })

        return error_response(
            code='UPDATE_FAILED',
            message='Failed to update privacy setting',
            status=400
        )

    except Exception as e:
        logger.error(f"Error updating privacy: {str(e)}")
        return error_response(
            code='PRIVACY_UPDATE_ERROR',
            message='Failed to update privacy setting',
            status=500
        )


# =============================================================================
# TRANSCRIPT SHARE LINKS
# =============================================================================

@bp.route('/user/<user_id>/transcript-shares', methods=['GET'])
@require_auth
def list_transcript_shares(authenticated_user_id, user_id):
    """Every transcript link issued for this student, so whoever is
    accountable can see exactly who holds one and revoke it."""
    try:
        from services.transcript_sharing_service import list_transcript_grants
        from utils.portfolio_access import can_manage_privacy

        allowed, reason = can_manage_privacy(authenticated_user_id, user_id)
        if not allowed:
            return error_response(code='PERMISSION_DENIED',
                                  message=reason or 'Not authorized', status=403)

        return success_response(data={'shares': list_transcript_grants(user_id)})
    except Exception as e:
        logger.error(f"Error listing transcript shares: {str(e)}")
        return error_response(code='FETCH_ERROR',
                              message='Failed to load transcript links', status=500)


@bp.route('/user/<user_id>/transcript-shares', methods=['POST'])
@require_auth
def create_transcript_share(authenticated_user_id, user_id):
    """Issue a revocable transcript link. Body: {"label": "State University"}"""
    try:
        from services.transcript_sharing_service import issue_transcript_token
        from utils.portfolio_access import can_manage_privacy
        from app_config import Config

        allowed, reason = can_manage_privacy(authenticated_user_id, user_id)
        if not allowed:
            return error_response(code='PERMISSION_DENIED',
                                  message=reason or 'Not authorized', status=403)

        data = request.json or {}
        grant = issue_transcript_token(
            student_id=user_id,
            issued_by=authenticated_user_id,
            label=data.get('label'),
        )

        base = Config.FRONTEND_URL.rstrip('/')
        grant['share_url'] = f"{base}/public/transcript/{user_id}?token={grant['token']}"
        return success_response(data=grant)
    except Exception as e:
        logger.error(f"Error creating transcript share: {str(e)}")
        return error_response(code='CREATE_ERROR',
                              message='Failed to create transcript link', status=500)


@bp.route('/user/<user_id>/transcript-shares/<grant_id>', methods=['DELETE'])
@require_auth
def revoke_transcript_share(authenticated_user_id, user_id, grant_id):
    """Revoke a transcript link. Takes effect on the next request."""
    try:
        from services.transcript_sharing_service import revoke_transcript_token
        from utils.portfolio_access import can_manage_privacy

        allowed, reason = can_manage_privacy(authenticated_user_id, user_id)
        if not allowed:
            return error_response(code='PERMISSION_DENIED',
                                  message=reason or 'Not authorized', status=403)

        if not revoke_transcript_token(grant_id, user_id, authenticated_user_id):
            return error_response(code='NOT_FOUND',
                                  message='Link not found or already revoked', status=404)

        return success_response(data={'revoked': True, 'grant_id': grant_id})
    except Exception as e:
        logger.error(f"Error revoking transcript share: {str(e)}")
        return error_response(code='REVOKE_ERROR',
                              message='Failed to revoke transcript link', status=500)


def _notify_approver(student_id: str, approver: dict) -> None:
    """Tell the approver a request is waiting. Never fails the request."""
    try:
        from database import get_supabase_admin_client
        from services.notification_service import NotificationService

        # admin client justified: reads the student's own name/org to address
        # the notification; the approver relationship was verified upstream.
        admin = get_supabase_admin_client()
        rows = admin.table('users').select('first_name, organization_id') \
            .eq('id', student_id).limit(1).execute().data or []
        student_name = rows[0].get('first_name') if rows else 'Your child'
        org_id = rows[0].get('organization_id') if rows else None

        NotificationService().notify_parent_approval_required(
            parent_user_id=approver['user_id'],
            student_name=student_name or 'Your child',
            student_id=student_id,
            organization_id=org_id
        )
    except Exception as e:
        logger.warning(f"Failed to notify approver for {student_id[:8]}: {e}")
