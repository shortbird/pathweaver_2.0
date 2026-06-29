"""Optio platform staff.

Designated Optio staff / cofounder accounts that are treated as the "Optio"
platform identity for the activity feed: they get the global activity feed and
their views/comments are surfaced as "Optio" (collapsed into a single "Optio"
entry), WITHOUT being granted full superadmin powers.

Superadmins always qualify. Additional accounts are listed by email so a
cofounder can be onboarded as Optio-on-the-feed without elevating them to a
full superadmin (which would also grant user management, quest admin, etc.).
"""

# Lowercase emails. Superadmins are covered by the role check below, but the
# canonical superadmin email is kept here too so this set is the single source
# of "who is Optio" for feed surfaces (also used to hide these accounts'
# personal details from students in the my-observers viewers list).
OPTIO_STAFF_EMAILS = frozenset({
    'tannerbowman@gmail.com',   # superadmin
    'tyler@zionforge.com',      # Tyler Tiberius, cofounder (feed access only)
})


def is_optio_platform_user(user) -> bool:
    """Return True if this user should be presented/treated as "Optio".

    Args:
        user: a dict with at least 'role' and/or 'email' (e.g. a users row).

    Superadmin role always qualifies; designated staff emails qualify without
    requiring superadmin.
    """
    if not user:
        return False
    if user.get('role') == 'superadmin':
        return True
    email = (user.get('email') or '').strip().lower()
    return email in OPTIO_STAFF_EMAILS
