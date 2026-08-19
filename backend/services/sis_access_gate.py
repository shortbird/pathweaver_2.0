"""
The paperwork hold, as the service layer sees it.

The check itself lives in utils/signature_hold.py, because middleware asks it
before any route runs and middleware may not import services. What lives HERE
is the half that needs the rest of the SIS: turning "this person is held" into
the documents that lift the hold, which means the onboarding service's items,
signature statement and document lookups.

Everything else is re-exported so callers in the service and route layers have
one name for the feature rather than two.
"""

from typing import Any, Dict

from utils.signature_hold import (  # noqa: F401 -- re-exported as this module's API
    blocking_assignments,
    clear_cache,
    is_blocked,
    is_staff,
    release,
)


def status(user_id: str) -> Dict[str, Any]:
    """What the web app needs to render the hold: whether it applies, and the
    documents that lift it.

    The items are returned whole -- the signing UI is the same component the
    family portal uses, so it wants the same shape.
    """
    from services import sis_onboarding_service as onboarding

    outstanding = blocking_assignments(user_id)
    if not outstanding:
        return {'blocked': False, 'assignments': []}
    if is_staff(user_id):
        # Staff see the paperwork on their portal; they are just not stopped.
        return {'blocked': False, 'assignments': []}

    org_id = outstanding[0].get('organization_id')
    # Same enrichment the family portal gets, so a "read it before you sign it"
    # item knows which document it is waiting on.
    same_org = [a for a in outstanding if a.get('organization_id') == org_id]
    for a in same_org:
        items = a.get('items') or []
        a['done_count'] = len([i for i in items
                               if i.get('status') in ('complete', 'approved')])
        a['total_count'] = len(items)
        a['signature_statement'] = onboarding.SIGNATURE_STATEMENT
    onboarding._attach_sign_docs(org_id, user_id, same_org)
    return {'blocked': True, 'organization_id': org_id, 'assignments': same_org}
