"""
Registration-funnel data access (blocks P4).

The funnel's table began iCreate-only and was renamed to `registrations` on
2026-08-25 (20260825160000 expand + 20260825160100 contract); the compatibility
view is gone, so `icreate_registrations` no longer resolves at all. This
repository owns the name in ONE constant so nothing new hardcodes it.

ARCHITECTURE_BLOCKS §7 deferred that rename; main did it anyway while this
branch was parked, and the branch's references were swept to match at the
2026-09-03 merge. backend/tests/test_registration_fk_hints.py guards the
regression, including the PostgREST FK embed hint, which moved with the
constraint names.
"""



# The one place the physical table name lives.
REGISTRATIONS_TABLE = 'registrations'
