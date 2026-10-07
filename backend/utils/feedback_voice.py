"""How a feedback author is named: the credit thread, its notification and the
student's quest banner (ticket 4ea811d6) all call these, so they cannot
disagree. Moved out of routes/credit_messages.py so services can use them
without importing a route module."""


def _author_name(user):
    return (user.get('display_name')
            or ' '.join(filter(None, [user.get('first_name'), user.get('last_name')])).strip()
            or 'User')


def _is_optio_voice(author_role):
    """Whether a reviewer speaks as "Optio" rather than as themselves.

    Only Optio's own review (superadmin; 'reviewer' is the legacy row value)
    is branded. A school's teacher shows their real name -- the student knows
    them, and "Optio replied to your work" gave them no reason to connect the
    feedback to the person who wrote it (Gryffin, 2026-08-31).

    The thread display and the notification MUST agree, so both call this.
    """
    return author_role in ('superadmin', 'reviewer')
