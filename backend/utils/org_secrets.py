"""Org-scoped credentials, kept out of anything a client can read.

Why this module exists (audit 2026-08-01, AUDIT.md C1):

Per-org Stripe secret keys and calendar feed tokens used to live in
`organizations.feature_flags`. That column is covered by an RLS policy of the
form `USING (is_active = true OR ...)` -- and Postgres RLS filters ROWS, not
COLUMNS. Every active org row was therefore returned to the `anon` role in full,
so the org's live Stripe secret key was readable over the public anon key that
ships in the JS bundle, with no login at all. The same blob was also echoed
verbatim to every org member by `GET /api/auth/me`.

Two properties make the fix hold rather than just move the problem:

  * Secrets live in `organization_secrets`, which has RLS on with **no policies**
    and all grants revoked. It is unreachable through PostgREST by construction,
    not by remembering to write a correct policy.
  * `feature_flags` stays a plain, fully-serializable config blob. The org
    settings UI does a read-modify-write of that whole object
    (frontend/src/components/sis/*.jsx), so anything stored in it must be safe to
    round-trip through a browser. Keeping secrets out means a future serializer
    cannot leak one by forgetting to strip a field, and the settings UI cannot
    wipe one by PUTting back a blob it never received.

Never return these values in an HTTP response. Callers want either the value (to
talk to a third party server-side) or `has_org_secret` (to tell a client whether
a feature is configured).
"""

from typing import Optional

from utils.logger import get_logger

logger = get_logger(__name__)

TABLE = 'organization_secrets'

# Known secret names, so a typo fails loudly instead of silently reading None
# and disabling card payment for a whole school.
STRIPE_SECRET_KEY = 'stripe_secret_key'
CALENDAR_FEED_TOKEN = 'calendar_feed_token'
# The family variant of the calendar feed token: same public .ics endpoint, but
# it only ever serves school-audience events (staff tokens also see teacher
# ones). Handed out to any member of the school via /api/sis/parent/events/feed.
CALENDAR_FEED_TOKEN_FAMILY = 'calendar_feed_token_family'

KNOWN_SECRETS = frozenset({STRIPE_SECRET_KEY, CALENDAR_FEED_TOKEN,
                           CALENDAR_FEED_TOKEN_FAMILY})


def _admin():
    # admin client justified: organization_secrets is deny-all under RLS by
    # design; the service-role client is the only way to reach it. Callers have
    # already been authorized (org_admin/superadmin routes, or a server-side
    # payment path that never returns the value).
    #
    # Imported lazily so the pure helpers below (strip_secrets_from_feature_flags,
    # secret_shaped_keys) can be imported and tested without database config --
    # they are the ones CI enforces on every push.
    from database import get_supabase_admin_client
    return get_supabase_admin_client()


def _check_name(name: str) -> None:
    if name not in KNOWN_SECRETS:
        raise ValueError(
            f"Unknown org secret {name!r}. Add it to KNOWN_SECRETS in "
            f"utils/org_secrets.py so it is covered by the leak tests."
        )


def get_org_secret(organization_id: str, name: str) -> Optional[str]:
    """The secret's value, or None when unset.

    Returns None on read failure rather than raising: the callers are payment
    and calendar paths that already treat "not configured" as a clean, explained
    refusal ("Card payment is not set up for this school"). Raising here would
    turn a misconfigured org into a 500.
    """
    _check_name(name)
    if not organization_id:
        return None
    try:
        rows = (_admin().table(TABLE)
                .select('value')
                .eq('organization_id', organization_id)
                .eq('name', name)
                .limit(1)
                .execute()).data or []
    except Exception as e:
        # Never log the value, and never log enough to identify the credential
        # beyond which org/name failed.
        logger.error(f"[OrgSecrets] read failed for org={str(organization_id)[:8]} name={name}: {e}")
        return None
    return (rows[0].get('value') or None) if rows else None


def has_org_secret(organization_id: str, name: str) -> bool:
    """Whether the secret is set. This is the only form safe to send to a client
    (e.g. `stripe_enabled`), because it discloses configuration, not credentials."""
    return bool(get_org_secret(organization_id, name))


def set_org_secret(organization_id: str, name: str, value: Optional[str],
                   updated_by: Optional[str] = None) -> None:
    """Upsert the secret. An empty/None value deletes it (how an admin clears a key).

    Raises on failure -- unlike reads, a silent write failure would leave an
    admin believing they had rotated a compromised key.
    """
    _check_name(name)
    if not organization_id:
        raise ValueError('organization_id is required')

    client = _admin()
    if not value:
        client.table(TABLE).delete() \
            .eq('organization_id', organization_id).eq('name', name).execute()
        logger.info(f"[OrgSecrets] cleared {name} for org={str(organization_id)[:8]}")
        return

    client.table(TABLE).upsert({
        'organization_id': organization_id,
        'name': name,
        'value': value,
        'updated_by': updated_by,
    }, on_conflict='organization_id,name').execute()
    logger.info(f"[OrgSecrets] updated {name} for org={str(organization_id)[:8]}")


def strip_secrets_from_feature_flags(feature_flags: Optional[dict]) -> dict:
    """Remove the known credential paths from a feature_flags blob.

    The org settings UI read-modify-writes the whole `feature_flags` object
    (frontend/src/components/sis/*.jsx), so a stale browser tab -- or any client
    loaded before this change -- can still PUT a blob carrying the old nested
    secret. Accepting it would silently re-open C1.

    Deliberately a DENYLIST, not an allowlist. `feature_flags` is round-tripped
    by the settings UI, so dropping unrecognised keys here would silently delete
    an org's configuration the first time an admin saved any setting. The safety
    property comes from elsewhere: secrets are structurally absent from this
    column (the migration moved them out, the write path diverts them, and
    `secret_shaped_keys` rejects new ones), so there is nothing left to allowlist
    against.

    Returns a new dict; does not mutate the input.
    """
    if not isinstance(feature_flags, dict):
        return {}

    cleaned = dict(feature_flags)

    icreate = cleaned.get('icreate_registration')
    if isinstance(icreate, dict) and STRIPE_SECRET_KEY in icreate:
        icreate = dict(icreate)
        icreate.pop(STRIPE_SECRET_KEY, None)
        cleaned['icreate_registration'] = icreate

    sis = cleaned.get('sis_settings')
    if isinstance(sis, dict) and (CALENDAR_FEED_TOKEN in sis
                                  or CALENDAR_FEED_TOKEN_FAMILY in sis):
        sis = dict(sis)
        sis.pop(CALENDAR_FEED_TOKEN, None)
        sis.pop(CALENDAR_FEED_TOKEN_FAMILY, None)
        cleaned['sis_settings'] = sis

    return cleaned


# Substrings that mark a config key as credential-shaped. Kept deliberately
# narrow: this rejects an admin's save, so a false positive is a support ticket.
_SECRET_KEY_MARKERS = (
    'secret', 'password', 'passwd', 'private_key', 'privatekey',
    'api_key', 'apikey', 'access_key', 'client_secret', 'webhook_secret',
    'auth_token', 'bearer',
)


def secret_shaped_keys(value, _path=()) -> list:
    """Dotted paths of credential-shaped keys anywhere in a config blob.

    This is what stops the NEXT credential from landing in `feature_flags`. The
    original mistake was not that someone chose a bad column -- it was that
    nothing objected when a key named `stripe_secret_key` was written into a blob
    that is anon-readable and echoed to clients. Now something objects.

    Call it AFTER strip_secrets_from_feature_flags, so the credentials this
    system already knows how to relocate do not trip it.
    """
    found = []
    if isinstance(value, dict):
        for k, v in value.items():
            key_l = str(k).lower()
            path = _path + (str(k),)
            if any(m in key_l for m in _SECRET_KEY_MARKERS):
                found.append('.'.join(path))
            else:
                found.extend(secret_shaped_keys(v, path))
    elif isinstance(value, list):
        for i, item in enumerate(value):
            found.extend(secret_shaped_keys(item, _path + (str(i),)))
    return found
