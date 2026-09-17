"""The one writer of organizations.feature_flags from a settings screen.

Thirteen SIS components used to read the whole blob, spread it, change one
key and PUT the whole thing back through the admin console's organization
route -- last write wins, so two cards open in two tabs erased each other,
and every card re-implemented the spread
(docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, H2). The read-modify-write
now happens here, server-side, one key at a time:

    patch_feature_flags(org_id, {'sis_settings': {'rooms': [...]}}, ...)

merges the patch onto the STORED blob (a nested dict merges one level down;
a null removes the key; anything else replaces), runs the same guards the
whole-blob PUT always ran -- superadmin-owned `modules` restored, finance
paths held for non-finance writers, the Stripe key diverted to
organization_secrets, credential-shaped keys refused -- and writes. The
registration-funnel config goes through utils.registration_config, so a row
still carrying the legacy `icreate_registration` key stays in step without
the browser ever writing it.

`clean_feature_flags` is that guard set on its own, shared with the admin
console's PUT (routes/admin/organization_management.py), which is the other
door onto this column and must refuse the same things.
"""

import re
from typing import Any, Dict, Optional, Tuple

from repositories import organization_repository
from utils.org_finance_flags import guard_org_flags_write
from utils.org_secrets import (
    STRIPE_SECRET_KEY,
    secret_shaped_keys,
    set_org_secret,
    strip_secrets_from_feature_flags,
)
from utils.registration_config import (
    LEGACY_REGISTRATION_FLAG,
    REGISTRATION_FLAG,
    get_registration_config,
    with_registration_config,
)

#: Keys a settings PATCH may name at the top of the blob. `modules` is the
#: superadmin's (the Blocks panel writes it); everything else the settings
#: screens own is here.
PATCHABLE_TOP_KEYS = frozenset({
    'sis_settings', 'registration', 'oea_settings',
    'hide_pillars', 'step_printing', 'hide_public_bounties', 'lock_xp_editing',
    'xp_goals', 'sis_enabled', 'community_enabled',
})

_STRIPE_KEY_RE = re.compile(r'^(sk|rk)_[A-Za-z0-9_]{20,}$')


class FlagsRejected(Exception):
    """A write the guards refuse: `status` and `body` are the HTTP answer."""

    def __init__(self, status: int, body: Dict[str, Any]):
        super().__init__(body.get('error', 'rejected'))
        self.status = status
        self.body = body


def clean_feature_flags(
    org_id: str,
    incoming: Dict[str, Any],
    *,
    sees_finance: bool,
    is_superadmin: bool,
    stored: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], Optional[str]]:
    """The blob as it may be stored, and the Stripe key the caller submitted.

    Returns (flags, submitted_key): submitted_key is None when the field was
    absent (leave the stored secret alone) and '' when the admin explicitly
    cleared it. Raises FlagsRejected with the same status and body the admin
    console's PUT has always answered.
    """
    flags = dict(incoming)

    # Guarded blob write: restores superadmin-owned `modules`, merges the
    # finance paths for non-finance writers -- org_finance_flags.guard_org_flags_write.
    if not is_superadmin:
        if stored is None:
            stored = (organization_repository.OrganizationRepository().find_by_id(org_id) or {}).get('feature_flags') or {}
        flags, blocked = guard_org_flags_write(stored, flags, sees_finance)
        if blocked:
            raise FlagsRejected(403, {
                'error': 'Tuition and registration fees are managed by an organization admin.',
                'fields': blocked})

    # The Stripe secret key is submitted through the same feature_flags blob
    # the settings UI round-trips, but it must never be STORED there:
    # organizations.feature_flags is anon-readable by row policy (RLS filters
    # rows, not columns) and is echoed to clients, which is how a live key
    # reached the public internet -- AUDIT.md C1. Divert it to
    # organization_secrets and strip it from the blob before any write.
    submitted_key = None
    for reg_key in (REGISTRATION_FLAG, LEGACY_REGISTRATION_FLAG):
        reg = flags.get(reg_key)
        if isinstance(reg, dict) and STRIPE_SECRET_KEY in reg:
            submitted_key = (reg.get(STRIPE_SECRET_KEY) or '').strip()
            break

    # The card-payment credential is finance: a coordinator may not set it,
    # and may not clear it either.
    if submitted_key is not None and not sees_finance:
        raise FlagsRejected(403, {'error': 'Card payment settings are managed by an '
                                           'organization admin.'})

    # A malformed Stripe key breaks the registration funnel at the "Pay
    # securely" step, so reject it at save time. Secret keys are sk_... (or
    # restricted rk_...); loose enough for legacy keys without live/test.
    if submitted_key and not _STRIPE_KEY_RE.match(submitted_key):
        raise FlagsRejected(400, {
            'error': "That doesn't look like a Stripe secret key — it should start with "
                     "sk_live_ or rk_live_. Copy the full key from Stripe Dashboard -> "
                     "Developers -> API keys."})

    # Always strip, even when nothing was submitted: a stale tab can PUT back
    # a blob that still carries the pre-migration nested key.
    cleaned = strip_secrets_from_feature_flags(flags)

    # Refuse to store any OTHER credential-shaped key. This is the guard that
    # stops the next stripe_secret_key: feature_flags is anon-readable by row
    # policy and is echoed to every org member, so a credential in here is
    # public by construction. Named explicitly so the admin knows what to
    # remove rather than seeing a generic 400.
    suspicious = secret_shaped_keys(cleaned)
    if suspicious:
        raise FlagsRejected(400, {
            'error': 'Credentials cannot be stored in organization settings.',
            'message': (
                'These fields look like secrets and would be readable by '
                'everyone in the organization: '
                + ', '.join(suspicious)
                + '. Secrets belong in organization_secrets — ask an Optio '
                  'admin to add a dedicated field for this credential.'
            ),
            'fields': suspicious,
        })

    return cleaned, submitted_key


def merge_patch(stored: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    """`patch` onto `stored`, one level down.

    A dict value merges into the stored dict of the same key (a null inside
    removes that key); a null at the top removes the key; anything else
    replaces. The registration config is stored through
    utils.registration_config so the legacy mirror, where a row still has
    one, keeps agreeing with it.
    """
    out = dict(stored or {})
    for key, value in patch.items():
        if key == REGISTRATION_FLAG:
            current = get_registration_config(out)
            if value is None:
                out.pop(REGISTRATION_FLAG, None)
                out.pop(LEGACY_REGISTRATION_FLAG, None)
                continue
            merged = dict(current)
            for k, v in (value if isinstance(value, dict) else {}).items():
                if v is None:
                    merged.pop(k, None)
                else:
                    merged[k] = v
            out = with_registration_config(out, merged)
            continue
        if value is None:
            out.pop(key, None)
        elif isinstance(value, dict) and isinstance(out.get(key), dict):
            merged = dict(out[key])
            for k, v in value.items():
                if v is None:
                    merged.pop(k, None)
                else:
                    merged[k] = v
            out[key] = merged
        else:
            out[key] = value
    return out


def patch_feature_flags(
    org_id: str,
    patch: Dict[str, Any],
    *,
    caller_id: str,
    sees_finance: bool,
    is_superadmin: bool,
) -> Dict[str, Any]:
    """Merge `patch` onto the stored blob, guard it, write it, return it clean."""
    unknown = sorted(k for k in patch if k not in PATCHABLE_TOP_KEYS)
    if unknown:
        raise FlagsRejected(400, {'error': 'Not a settings key: ' + ', '.join(unknown),
                                  'fields': unknown})
    # Resolved at call time so a test that patches the repository class sees it.
    repo = organization_repository.OrganizationRepository()
    stored = (repo.find_by_id(org_id) or {}).get('feature_flags') or {}
    merged = merge_patch(stored, patch)
    cleaned, submitted_key = clean_feature_flags(
        org_id, merged, sees_finance=sees_finance, is_superadmin=is_superadmin, stored=stored)
    org = repo.update_organization(org_id, {'feature_flags': cleaned})
    # Persist the credential only after the org row itself saved cleanly, so a
    # failed update never leaves a key pointing at a state that was rolled back.
    if submitted_key is not None:
        set_org_secret(org_id, STRIPE_SECRET_KEY, submitted_key or None, updated_by=caller_id)
    flags = (org or {}).get('feature_flags') if isinstance(org, dict) else None
    return strip_secrets_from_feature_flags(flags if isinstance(flags, dict) else cleaned)
