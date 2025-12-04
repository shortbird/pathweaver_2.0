"""
Organization Detection Middleware
Detects organization from domain/subdomain and stores in Flask g context.
"""

from flask import request, g
from repositories.organization_repository import OrganizationRepository, OPTIO_ORG_ID
from utils.logger import get_logger

logger = get_logger(__name__)


def detect_organization_from_domain():
    """
    Detect organization from request domain and store in Flask g.

    Called before each request to identify which organization the request is for.
    Supports:
    - Full domain matching (ignite.optioeducation.com)
    - Subdomain matching (ignite)
    - Fallback to Optio default

    Stores in g.organization for use by routes.
    """
    try:
        # Get host from request
        host = request.host.lower()  # e.g., 'ignite.optioeducation.com' or 'localhost:5173'

        # Remove port if present
        if ':' in host:
            host = host.split(':')[0]

        logger.debug(f"[ORG DETECTION] Host: {host}")

        # Initialize organization repository
        org_repo = OrganizationRepository()

        # Skip detection for localhost (always use Optio)
        if host in ['localhost', '127.0.0.1', '0.0.0.0']:
            logger.debug(f"[ORG DETECTION] Localhost detected, using Optio default")
            g.organization = org_repo.get_optio_organization()
            g.organization_id = OPTIO_ORG_ID
            return

        # Try full domain match first (most specific)
        org = org_repo.find_by_domain(host)
        if org:
            logger.info(f"[ORG DETECTION] Matched full domain: {host} -> {org['name']}")
            g.organization = org
            g.organization_id = org['id']
            return

        # Try subdomain match (extract first part)
        if '.' in host:
            subdomain = host.split('.')[0]

            # Skip 'www' subdomain (use default)
            if subdomain != 'www':
                org = org_repo.find_by_subdomain(subdomain)
                if org:
                    logger.info(f"[ORG DETECTION] Matched subdomain: {subdomain} -> {org['name']}")
                    g.organization = org
                    g.organization_id = org['id']
                    return

        # Fallback to Optio default
        logger.debug(f"[ORG DETECTION] No match for {host}, using Optio default")
        g.organization = org_repo.get_optio_organization()
        g.organization_id = OPTIO_ORG_ID

    except Exception as e:
        logger.error(f"[ORG DETECTION] Error detecting organization: {e}", exc_info=True)
        # Always fallback to Optio on error
        try:
            org_repo = OrganizationRepository()
            g.organization = org_repo.get_optio_organization()
            g.organization_id = OPTIO_ORG_ID
        except Exception as fallback_error:
            logger.error(f"[ORG DETECTION] Critical: Cannot load Optio org: {fallback_error}")
            # Set minimal fallback
            g.organization = {
                'id': OPTIO_ORG_ID,
                'name': 'Optio Education',
                'slug': 'optio'
            }
            g.organization_id = OPTIO_ORG_ID


def get_current_organization():
    """
    Get the current organization from Flask g context.

    Returns:
        Dict with organization data

    Note: This should only be called after detect_organization_from_domain()
    has run (which happens automatically via before_request).
    """
    if not hasattr(g, 'organization'):
        logger.warning("[ORG] get_current_organization called before detection, running detection now")
        detect_organization_from_domain()

    return g.organization


def get_current_organization_id():
    """
    Get the current organization ID from Flask g context.

    Returns:
        Organization UUID string
    """
    if not hasattr(g, 'organization_id'):
        logger.warning("[ORG] get_current_organization_id called before detection, running detection now")
        detect_organization_from_domain()

    return g.organization_id


def is_optio_organization():
    """
    Check if current request is for the Optio parent organization.

    Returns:
        Boolean
    """
    return get_current_organization_id() == OPTIO_ORG_ID
