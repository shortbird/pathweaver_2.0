"""Org-neutral registration-funnel config in organizations.feature_flags.

The parent registration funnel began as iCreate-only, so its config lived at
feature_flags.icreate_registration. The funnel is org-neutral now (Optio
Academy and others), so the canonical key is feature_flags.registration.

Reads prefer the new key and fall back to the legacy one; writes mirror BOTH
keys, because the currently-deployed prod backend reads only the legacy key
and the local dev backend shares the prod database. Once the rename is live
in prod: drop the mirror + fallback here, and delete the legacy key from the
org rows that still carry it.
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
    """A new feature_flags dict with `cfg` stored under both keys (see module
    docstring for why the legacy key is mirrored)."""
    flags = dict(feature_flags if isinstance(feature_flags, dict) else {})
    flags[REGISTRATION_FLAG] = cfg
    flags[LEGACY_REGISTRATION_FLAG] = cfg
    return flags
