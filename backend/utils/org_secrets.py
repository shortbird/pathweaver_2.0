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

ENCRYPTION AT REST (SEC-16, 2026-09-03). Values are Fernet-encrypted under
`Config.ORG_SECRETS_ENCRYPTION_KEY` and stored with an `enc:v1:` envelope. The
key being UNSET is a supported state and is what production runs today: values
are then read and written in the clear, exactly as before. Setting the key
starts encrypting writes and lazily re-encrypts each row as it is read, so the
migration needs no backfill and has no window where a row is unreadable.

This is defence in depth, not the primary control. `organization_secrets` is
already unreachable through PostgREST -- RLS on, no policies, grants revoked --
so what encryption adds is protection when something reads the TABLE rather
than the API: a database backup, a support query, a leaked service-role key.
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
    # admin client justified: org credentials are deliberately unreadable by any
    #   client — that is the point of the table
    return get_supabase_admin_client()


#: Envelope prefix. Versioned so a key id can be added later without having to
#: guess what an existing row was encrypted with.
_ENVELOPE = 'enc:v1:'


def _fernet():
    """The cipher, or None when no key is configured.

    None is a supported state and is what production runs today -- see
    Config.ORG_SECRETS_ENCRYPTION_KEY. Values are then stored in the clear,
    exactly as before this change.
    """
    from app_config import Config
    key = getattr(Config, 'ORG_SECRETS_ENCRYPTION_KEY', '')
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet
        return Fernet(key.encode())
    except Exception as e:
        # A malformed key must not read as "no key". Silently falling back to
        # plaintext would write cleartext secrets to a database the operator
        # believes is encrypted, which is worse than the error.
        logger.error(f"[OrgSecrets] ORG_SECRETS_ENCRYPTION_KEY is not a valid "
                     f"Fernet key; refusing to fall back to plaintext: {e}")
        raise


def _encrypt(value: str) -> str:
    f = _fernet()
    if f is None:
        return value
    return _ENVELOPE + f.encrypt(value.encode()).decode()


def _decrypt(stored: str, organization_id: str, name: str) -> Optional[str]:
    """Plaintext for a stored value, or None if it cannot be recovered.

    Legacy plaintext rows pass through untouched -- that is what makes turning
    the key on a no-downtime change rather than a backfill.
    """
    if not stored.startswith(_ENVELOPE):
        return stored
    f = _fernet()
    if f is None:
        # Encrypted rows and no key: the key was removed, or this process has a
        # different environment than the one that wrote them. Returning the
        # ciphertext would hand `enc:v1:...` to Stripe as an API key and produce
        # an unreadable failure a long way from the cause.
        logger.error(f"[OrgSecrets] {name} for org={str(organization_id)[:8]} is "
                     f"encrypted but ORG_SECRETS_ENCRYPTION_KEY is not set")
        return None
    try:
        return f.decrypt(stored[len(_ENVELOPE):].encode()).decode()
    except Exception as e:
        logger.error(f"[OrgSecrets] could not decrypt {name} for "
                     f"org={str(organization_id)[:8]}: {e}")
        return None


def _reencrypt_in_place(organization_id: str, name: str, value: str) -> None:
    """Best-effort upgrade of a legacy plaintext row on read. Never raises.

    This is the whole migration: no backfill script, no window where a row is
    unreadable, and a read that fails to upgrade still returned the right value.
    """
    try:
        _admin().table(TABLE).update({'value': _encrypt(value)}) \
            .eq('organization_id', organization_id).eq('name', name).execute()
        logger.info(f"[OrgSecrets] encrypted {name} for org={str(organization_id)[:8]} on read")
    except Exception as e:
        logger.warning(f"[OrgSecrets] could not encrypt {name} for "
                       f"org={str(organization_id)[:8]} on read: {e}")


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
    stored = (rows[0].get('value') or None) if rows else None
    if stored is None:
        return None

    value = _decrypt(stored, organization_id, name)
    if value is not None and not stored.startswith(_ENVELOPE) and _fernet() is not None:
        _reencrypt_in_place(organization_id, name, value)
    return value


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
        'value': _encrypt(value),
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

    # The registration funnel config lives at 'registration' (org-neutral key)
    # and, during the rename window, is mirrored at the legacy key too.
    for reg_key in ('registration', 'icreate_registration'):
        reg = cleaned.get(reg_key)
        if isinstance(reg, dict) and STRIPE_SECRET_KEY in reg:
            reg = dict(reg)
            reg.pop(STRIPE_SECRET_KEY, None)
            cleaned[reg_key] = reg

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
