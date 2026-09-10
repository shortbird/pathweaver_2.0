"""Parent -> dependent "act as" — the two endpoints that enter and leave it.

Split out of routes/dependents.py on 2026-09-07, when FU-05's cookie work put
that file over the 1400-line route cap. It is a coherent unit on its own: these
two are the only endpoints that change WHO the caller is, and the pair has to be
read together, because the failure mode lives between them — a cookie set by
/act-as and not cleared by /stop-acting-as leaves a parent inside their child's
account with the exit button already pressed.

Registered onto the dependents blueprint by register(bp), so every URL, method
and decorator is exactly what it was before the move.
"""

from flask import jsonify, make_response

from database import get_supabase_admin_client
from repositories.base_repository import NotFoundError, PermissionError
from repositories.dependent_repository import DependentRepository
from routes.auth.token_delivery import acting_as_body_tokens, refresh_body_tokens
from middleware.error_handler import AuthorizationError
from utils.auth.decorators import authorizing_user_id, require_auth, validate_uuid_param
from utils.auth.relationships import require_relationship_to
from utils.logger import get_logger
from utils.session_manager import session_manager

logger = get_logger(__name__)


def register(bp):
    """Attach the acting-as routes to the dependents blueprint."""

    @bp.route('/<string:dependent_id>/act-as', methods=['POST'])
    @require_auth
    @validate_uuid_param('dependent_id')
    @require_relationship_to('dependent_id', allow=('parent',))
    def generate_acting_as_token(user_id, dependent_id):
        """
        Generate an acting-as token for a parent to act as their dependent.
        This allows the parent to use the platform as if they were the dependent,
        similar to admin masquerade functionality.

        Returns:
            200: Token generated successfully with acting_as_token
            403: User is not a parent or doesn't own this dependent
            404: Dependent not found
        """
        # WHO IS ASKING is not the id @require_auth hands us. That one is the
        # EFFECTIVE user, and inside an acting-as session the effective user is
        # the CHILD -- so a parent already acting as their dependent arrives
        # here as the dependent. This endpoint is re-entered on every page
        # reload (services/actingAsRestore re-mints the token), so the second
        # call asked "is this child a parent?", got no, and answered 403.
        # The frontend reads that as "no longer authorized", drops the session,
        # and the parent lands back in their own account -- every reload, for
        # every family using act-as (Sentry OPTIO-WEB-3: 80 reports, 45 people).
        #
        # authorizing_user_id() is what the relationship gate above already
        # used, which is why the gate PASSED while the body below failed: it
        # resolves to the parent behind an acting-as session. Minting from
        # `user_id` would have been worse than the 403 if it had succeeded --
        # a token naming the child as its own guardian.
        parent_id = authorizing_user_id()
        try:
            # Deferred: routes.dependents imports this module to call
            # register(), so importing at module scope would close the cycle.
            # It also keeps the patch target where existing tests point.
            from routes.dependents import verify_parent_role
            verify_parent_role(parent_id)

            # admin client justified: see file docstring; verify_parent_role + dependent ownership check gate access
            supabase = get_supabase_admin_client()
            dependent_repo = DependentRepository(client=supabase)

            # Verify that this dependent belongs to this parent
            # get_dependent() will raise NotFoundError or PermissionError if not valid
            dependent = dependent_repo.get_dependent(dependent_id, parent_id)

            # Generate acting-as token (+ refresh token so native sessions survive the
            # 401-refresh cycle without reverting to the parent's own identity).
            acting_as_token = session_manager.generate_acting_as_token(parent_id, dependent_id)
            acting_as_refresh_token = session_manager.generate_acting_as_refresh_token(parent_id, dependent_id)

            logger.info(f"Parent {parent_id} generated acting-as token for dependent {dependent_id}")

            # FU-05: the acting-as session rides an httpOnly cookie now, the way
            # masquerade has since SEC-03. Body tokens go only to clients that
            # cannot use it; for everyone else the same JWT in readable JSON would
            # only widen what an XSS can take.
            response = make_response(jsonify({
                'success': True,
                **acting_as_body_tokens(acting_as_token, acting_as_refresh_token),
                'dependent_id': dependent_id,
                'dependent_display_name': dependent.get('display_name'),
                'message': f"Now acting as {dependent.get('display_name')}"
            }), 200)
            session_manager.set_acting_as_cookie(response, acting_as_token)
            return response

        except AuthorizationError as e:
            logger.warning(f"Authorization error for user {parent_id}: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 403
        except (NotFoundError, PermissionError) as e:
            logger.warning(f"Error accessing dependent {dependent_id} for user {parent_id}: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 403
        except Exception as e:
            logger.error(f"Error generating acting-as token for dependent {dependent_id}: {str(e)}")
            return jsonify({'success': False, 'error': 'Failed to generate token'}), 500


    @bp.route('/stop-acting-as', methods=['POST'])
    def stop_acting_as():
        """
        Stop acting as a dependent and return fresh tokens for the parent.

        This endpoint is called when a parent wants to switch back from viewing
        the platform as their dependent. It generates new access and refresh tokens
        for the parent, bypassing any sessionStorage issues in cross-origin production
        environments.

        Uses get_actual_admin_id() to extract the parent's ID from the acting-as token,
        since @require_auth's get_effective_user_id() would return the dependent's ID.

        Returns:
            200: Fresh tokens for the parent
            401: Not authenticated or not in acting-as mode
            404: Parent user not found
            500: Server error
        """
        try:
            # Get the parent's ID from the acting-as token (not the dependent's ID).
            # De-escalation resolver: acting-as tokens expire after 24h, and a
            # parent whose token died still has their own session cookie and still
            # needs the way out. This endpoint only ever hands someone back their
            # own identity.
            user_id = session_manager.get_deescalation_user_id()

            if not user_id:
                return jsonify({'success': False, 'error': 'Authentication required'}), 401

            # admin client justified: see file docstring; verify_parent_role + dependent ownership check gate access
            supabase = get_supabase_admin_client()

            # Verify the parent user exists
            user_response = supabase.table('users').select('*').eq('id', user_id).single().execute()

            if not user_response.data:
                logger.warning(f"Parent user not found when stopping acting-as: {user_id}")
                return jsonify({'success': False, 'error': 'Parent user not found'}), 404

            # Generate fresh access and refresh tokens for the parent
            access_token = session_manager.generate_access_token(user_id)
            refresh_token = session_manager.generate_refresh_token(user_id)

            logger.info(f"Parent {user_id} stopped acting as dependent, fresh tokens generated")

            # SEC-03's gate, for the same reason it was applied to masquerade's
            # /exit next door: these are the parent's OWN tokens and the refresh
            # token lives 30 days. refresh_body_tokens() hands them only to clients
            # that cannot use cookies; everyone else gets the cookies below, which
            # this endpoint never set at all before -- so a cookie-capable browser
            # was relying entirely on the body copy reaching tokenStore.
            response = make_response(jsonify({
                'success': True,
                **refresh_body_tokens(access_token, refresh_token),
                'user': user_response.data
            }), 200)
            session_manager.set_auth_cookies(response, user_id, access_token, refresh_token)
            # Clear the acting-as cookie LAST. get_effective_user_id() reads it
            # ahead of access_token, so one left behind means the parent pressed
            # Stop and is still their child (tests/unit/test_acting_as_cookie.py).
            session_manager.clear_acting_as_cookie(response)
            return response

        except Exception as e:
            logger.error(f"Error stopping acting-as for parent {user_id}: {str(e)}")
            return jsonify({'success': False, 'error': 'Failed to restore parent session'}), 500
