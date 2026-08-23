"""Org-neutral registration-funnel config in organizations.feature_flags.

The parent registration funnel began as iCreate-only, so its config lived at
feature_flags.icreate_registration. The funnel is org-neutral now (Optio
Academy and others), so the canonical key is feature_flags.registration.

Reads prefer the new key and fall back to the legacy one. The write MIRROR is
gone (blocks P4): the dual-read shipped to prod on 2026-08-10 and many deploys
have followed, so nothing deployed reads only the legacy key any more. The
read FALLBACK stays until the legacy `icreate_registration` keys are scrubbed
from the org rows that still carry them (docs/blocks/P4_NOTES.md) — drop it
in the same change as the scrub, never before.
"""

REGISTRATION_FLAG = 'registration'
LEGACY_REGISTRATION_FLAG = 'icreate_registration'


def get_registration_config(feature_flags):
    """The org's registration-funnel config dict ({} when absent/malformed)."""
    flags = feature_flags if isinstance(feature_flags, dict) else {}
    cfg = flags.get(REGISTRATION_FLAG)
    if not isinstance(cfg, dict):
        cfg = flags.get(LEGACY_REGISTRATION_FLAG)
    return cfg if isinstance(cfg, dict) else {}


def with_registration_config(feature_flags, cfg):
    """A new feature_flags dict with `cfg` stored under the canonical key.

    Also refreshes the legacy key IF the row still carries one — two keys that
    disagree would make the read fallback a trap — but never creates it."""
    flags = dict(feature_flags if isinstance(feature_flags, dict) else {})
    flags[REGISTRATION_FLAG] = cfg
    if LEGACY_REGISTRATION_FLAG in flags:
        flags[LEGACY_REGISTRATION_FLAG] = cfg
    return flags
