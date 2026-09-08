"""
Public Organization Routes

Handles public-facing organization endpoints like signup pages.
No authentication required for these routes.
"""

from flask import Blueprint, jsonify
from services.organization_service import OrganizationService
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('organizations', __name__)


@bp.route('/join/<slug>', methods=['GET'])
def get_organization_for_signup(slug):
    """
    Get organization details for signup page by slug.
    Public endpoint - no authentication required.

    Used by frontend to display org name and branding on signup page.
    Example: GET /api/organizations/join/school-name

    Returns:
        200: Organization details (id, name, slug, branding_config)
        404: Organization not found or inactive
    """
    try:
        service = OrganizationService()
        org = service.get_organization_by_slug(slug)

        if not org:
            return jsonify({
                'error': 'Organization not found',
                'code': 'ORG_NOT_FOUND'
            }), 404

        # Return only public information needed for signup page
        return jsonify({
            'id': org['id'],
            'name': org['name'],
            'slug': org['slug'],
            'branding_config': org.get('branding_config', {})
        }), 200

    except Exception as e:
        logger.error(f"Error fetching organization for signup (slug={slug}): {e}")
        return jsonify({
            'error': 'Failed to fetch organization details',
            'code': 'FETCH_ERROR'
        }), 500
