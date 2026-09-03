"""
The SIS console's access tiers, in one place.

Every route module used to declare its own `STAFF_ROLES` / `ADMIN_ROLES` tuple —
26 literals across 20 files, all spelling out the same two or three shapes. That
was survivable while there were two staff roles. It stopped being survivable the
moment a third arrived: adding `campus_coordinator` by hand to 26 tuples is 26
chances to miss one, and a missed one is a silent 403 on a page the coordinator
is supposed to run.

Three tiers:

  STAFF_ROLES    Everyone who works at the school, teachers included. Class
                 scope still applies — a teacher sees their own classes.
  ADMIN_ROLES    The front office: the whole console except the money.
  FINANCE_ROLES  Tuition, invoices, Stripe, timesheets, payroll, pay rates.

A campus coordinator is an admin in every tier but the last. That is the whole
of the role, and it is why it is expressed as a subtraction rather than as a
fourth tier: iCreate's ask was "Right now Kate is an admin, but ... we don't want
the cc's to have access to all the financial stuff", i.e. an org_admin minus
one thing, not a new permission model.

Some pay data lives on records a coordinator does need (a staff employment
profile carries both an emergency contact and an hourly rate). Blocking the
whole endpoint would take the operational half away with the financial half, so
those fields are redacted per-field instead — see `sis_staff_service.redact_pay`.
"""

CAMPUS_COORDINATOR = 'campus_coordinator'

# Anyone on staff. Teachers included; their reads stay class-scoped downstream.
STAFF_ROLES = ('org_admin', CAMPUS_COORDINATOR, 'advisor', 'superadmin')

# The front office. Everything a school administrator does, money aside.
ADMIN_ROLES = ('org_admin', CAMPUS_COORDINATOR, 'superadmin')

# The money. Deliberately excludes campus coordinators.
FINANCE_ROLES = ('org_admin', 'superadmin')

# Who may change somebody else's role. Deliberately excludes campus
# coordinators, and this is the one tier that is not about the money directly:
# the whole point of the coordinator role is to withhold finance access, and a
# coordinator who can grant roles can grant themselves org_admin and take it
# back. Same membership as FINANCE_ROLES, different reason — kept separate so
# neither can be widened by accident on the other's behalf.
ROLE_GRANT_ROLES = ('org_admin', 'superadmin')

# HR-confidential records: the secure-documents store (contracts, background
# checks, custody/medical files). iCreate's coordinator requirements (2026-08-09)
# are explicit that coordinators see operational information, not employment
# paperwork. Same membership as FINANCE_ROLES, different reason again — HR
# confidentiality, not money — so it gets its own name for the same
# don't-widen-by-accident logic as ROLE_GRANT_ROLES.
HR_ROLES = ('org_admin', 'superadmin')


def is_campus_coordinator(roles) -> bool:
    """True when this set of effective roles is a coordinator and NOT an admin.

    The `not org_admin` half matters: someone can hold both roles, and holding
    the higher one means the pay redaction below must not apply to them.
    """
    roles = set(roles or ())
    if 'superadmin' in roles or 'org_admin' in roles:
        return False
    return CAMPUS_COORDINATOR in roles


# Staff who may ALSO register their own children through the family
# registration funnel, keeping their staff role primary and gaining 'parent'
# alongside it (services/registration_identity_service.attach_and_resume).
#
# Not an access tier: it answers "does this person plausibly have kids at this
# school", which is true of anyone on staff. Coordinators were missing until
# 2026-08-25 — the funnel predated the role and its tuple was written by hand as
# ('org_admin', 'advisor'), so a coordinator enrolling their own child was told
# "This is not a parent account. Please register with a parent email."
#
# No superadmin: it is not an org_role, and the funnel refuses superadmins
# outright a few lines earlier. Same membership as TARGETABLE_STAFF_ROLES below,
# separate name for the same don't-widen-by-accident reason as FINANCE_ROLES /
# ROLE_GRANT_ROLES / HR_ROLES — who may be narrowed a resource to and who may
# enroll a child are unrelated questions that happen to have the same answer.
FAMILY_REGISTRATION_STAFF_ROLES = ('org_admin', CAMPUS_COORDINATOR, 'advisor')

# The roles a resource / training item can be narrowed to (org_resources.
# visible_to_roles, sis_staff_training.visible_to_roles). Mirrors the CHECK
# constraints added in 20260809_campus_coordinator_portal.sql — widening one
# without the other leaves the value validating in the app and dying at the
# write, which is exactly how campus_coordinator itself first shipped.
TARGETABLE_STAFF_ROLES = ('org_admin', CAMPUS_COORDINATOR, 'advisor')


def clean_visible_roles(value):
    """Normalise a visible_to_roles payload.

    Returns (roles, error): roles is None for "everyone" (null/empty input),
    otherwise a de-duped list; error is set when a value is not a targetable
    staff role.
    """
    if not value:
        return None, None
    if not isinstance(value, (list, tuple)):
        return None, 'visible_to_roles must be a list of staff roles'
    out = []
    for r in value:
        if r not in TARGETABLE_STAFF_ROLES:
            return None, f'Unknown staff role: {r}'
        if r not in out:
            out.append(r)
    return (out or None), None
