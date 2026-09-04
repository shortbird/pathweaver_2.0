"""Registration funnel: session, org lookup, and the money-adjacent lookups.

Split out of routes/registration_funnel.py on 2026-09-03 (QB-04), which was
2,149 lines and carried the last standing exemption from the 1,400-line route
cap.

These are the helpers every step of the funnel reaches for: resolve the admin
client, load an invitation or a registration row, check the funnel access_token,
read the org's Stripe key, and apply a prepaid directive. They live in services/
rather than beside the routes for one concrete reason -- the funnel's route
handlers are being split across several modules, and a helper that lives in one
route module and is imported by another produces an import cycle the first time
anything imports the child directly. services/ has no such edge.

`_load_registration_invite` returns a jsonified error as its second element.
That is a route concern living in a service and it is not an improvement; it is
preserved exactly because this was a code move, and changing the calling
convention of a helper used by every funnel step is a separate risk from
relocating it.
"""

import re
import secrets
from datetime import datetime

from flask import jsonify

from database import get_supabase_admin_client
from utils.validation import validate_uuid
from utils.registration_config import get_registration_config
from utils.logger import get_logger

logger = get_logger(__name__)

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


LINK_PLACEHOLDER_SUFFIX = '@pending.optio.local'


def _admin():
    # admin client justified: the registration funnel runs pre-session — the
    #   family has no account yet, so there is no caller for RLS to scope to
    return get_supabase_admin_client()


def _valid_email(v):
    return bool(v and EMAIL_RE.match(v.strip()))


def _load_registration_invite(code):
    """
    Resolve an invitation code to (invitation, organization, config) if it is a
    valid, pending, link-based parent invite for a registration-funnel org.

    Returns (data_dict, None) on success or (None, (json, status)) on failure.
    """
    admin = _admin()
    res = admin.table('org_invitations') \
        .select('id, organization_id, email, role, status, expires_at, '
                'organizations(id, name, slug, branding_config, feature_flags)') \
        .eq('invitation_code', code) \
        .single() \
        .execute()
    inv = res.data
    if not inv:
        return None, (jsonify({'error': 'Invalid registration link'}), 404)
    if inv['status'] != 'pending':
        return None, (jsonify({'error': f"This link has been {inv['status']}"}), 400)
    if inv['role'] != 'parent':
        return None, (jsonify({'error': 'This is not a parent registration link'}), 400)

    org = inv.get('organizations') or {}
    cfg = get_registration_config(org.get('feature_flags'))
    if not cfg.get('enabled'):
        return None, (jsonify({'error': 'This organization does not use the registration funnel'}), 400)

    is_link_based = str(inv.get('email', '')).endswith(LINK_PLACEHOLDER_SUFFIX)
    if not is_link_based:
        return None, (jsonify({'error': 'This is not a shareable registration link'}), 400)

    return {'invitation': inv, 'organization': org, 'config': cfg}, None


def _load_registration(reg_id):
    """Registration row or None. Tolerates unknown and malformed ids (probes hit
    this route with junk UUIDs) — callers treat None as unauthorized, not a 500."""
    is_valid, _err = validate_uuid(str(reg_id or ''))
    if not is_valid:
        return None
    admin = _admin()
    rows = (admin.table('registrations').select('*')
            .eq('id', reg_id).limit(1).execute()).data
    return rows[0] if rows else None


def _authz(reg, token):
    return reg and token and secrets.compare_digest(str(reg.get('access_token')), str(token))


def _org_stripe_key(org_id):
    """The org's Stripe secret key. Server-side use only -- never serialize it.
    Use _org_stripe_enabled() when a client just needs to know if card payment is on."""
    from utils.org_secrets import get_org_secret, STRIPE_SECRET_KEY
    return get_org_secret(org_id, STRIPE_SECRET_KEY)


def _org_stripe_enabled(org_id):
    from utils.org_secrets import has_org_secret, STRIPE_SECRET_KEY
    return has_org_secret(org_id, STRIPE_SECRET_KEY)


def _parent_row(admin, parent_id):
    r = admin.table('users').select('id, email, first_name, last_name, avatar_url, phone_number').eq('id', parent_id).maybe_single().execute()
    return (r.data if r else None) or {}


def _family_directive(admin, org_id, email):
    """Pre-staged settings for this parent email (sis_family_directives): fee
    already paid on the school's legacy form, registration hold, priority tier.
    Loaded from the legacy registration spreadsheet before families re-register."""
    if not email:
        return None
    try:
        rows = (admin.table('sis_family_directives').select('*')
                .eq('organization_id', org_id)
                .eq('email', email.strip().lower())
                .limit(1).execute()).data or []
        return rows[0] if rows else None
    except Exception as e:  # noqa: BLE001
        logger.warning(f'registration: family-directive lookup failed for org {org_id}: {e}')
        return None


def _apply_prepaid_directive(admin, reg):
    """Honor a fee_prepaid directive staged AFTER the family step computed the fee.

    The family step zeroes the fee for directives that already exist, but the
    school often imports its legacy prepaid list late. Without this, a prepaid
    family whose registration already stored fee_cents > 0 is stuck at the fee
    step ("Please pay the registration fee by card to finish") with no way
    through. Re-check on resume/fee/checkout and zero the stored fee.
    Returns the (possibly updated) registration row.
    """
    try:
        if reg.get('status') == 'completed' or int(reg.get('fee_cents') or 0) <= 0:
            return reg
        parent = _parent_row(admin, reg['parent_user_id'])
        directive = _family_directive(admin, reg['organization_id'], parent.get('email'))
        if directive and directive.get('fee_prepaid'):
            admin.table('registrations').update({
                'fee_cents': 0, 'updated_at': datetime.utcnow().isoformat(),
            }).eq('id', reg['id']).execute()
            reg = {**reg, 'fee_cents': 0}
            logger.info(f"registration: prepaid directive zeroed fee for registration {reg['id']}")
    except Exception as e:  # noqa: BLE001
        logger.warning(f"registration: prepaid-directive check failed for registration {reg.get('id')}: {e}")
    return reg


# ── Endpoints ────────────────────────────────────────────────────────────────
