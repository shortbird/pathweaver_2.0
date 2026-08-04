"""
The campus coordinator role.

iCreate, 2026-08-01: "I think we will need a campus coordinator role. Right now
Kate is an admin, but it'll probably make more sense to have this as a role
because we don't want the cc's to have access to all the financial stuff and
maybe block other things too. We also will have Julia as a campus coordinator
too."

The role is an org_admin minus the money — expressed as a subtraction, because
that is what was asked for. So the tests that matter are the negative ones: not
"can a coordinator open the People page" (they're an admin, of course they can)
but "is there any route left through which they reach a pay figure".

Three doors to the money, and each is checked here:
  1. Whole modules  — billing, timesheets, payroll (FINANCE_ROLES).
  2. Pay fields on an operational record — the employment profile, which also
     carries the emergency contact a coordinator legitimately needs.
  3. The staff roster CSV, which carried Pay Type and Payroll ID columns.
"""

import pytest

from utils import sis_roles
from utils.roles import (VALID_ORG_ROLES, ROLE_DISPLAY_NAMES, get_effective_roles,
                         has_any_role)
from services import sis_staff_service as staff


def _user(*org_roles):
    return {'id': 'kate', 'role': 'org_managed', 'org_roles': list(org_roles)}


@pytest.mark.unit
class TestTheRoleExists:
    def test_it_is_assignable_as_an_org_role(self):
        assert 'campus_coordinator' in VALID_ORG_ROLES

    def test_it_has_a_human_readable_name(self):
        assert ROLE_DISPLAY_NAMES['campus_coordinator'] == 'Campus Coordinator'

    def test_it_is_never_a_platform_role(self):
        """There is no campus coordinator without a campus. Keeping it out of
        UserRole means it can never end up in users.role."""
        from utils.roles import UserRole
        assert 'campus_coordinator' not in {r.value for r in UserRole}

    def test_it_resolves_as_an_effective_role(self):
        assert get_effective_roles(_user('campus_coordinator')) == ['campus_coordinator']


@pytest.mark.unit
class TestWhatTheyCanReach:
    def test_they_pass_the_staff_tier(self):
        assert has_any_role(_user('campus_coordinator'), list(sis_roles.STAFF_ROLES))

    def test_they_pass_the_admin_tier(self):
        assert has_any_role(_user('campus_coordinator'), list(sis_roles.ADMIN_ROLES))

    def test_they_do_not_pass_the_finance_tier(self):
        assert not has_any_role(_user('campus_coordinator'), list(sis_roles.FINANCE_ROLES))

    def test_a_teacher_still_cannot_pass_the_admin_tier(self):
        """The new tier must not have widened the old one."""
        assert not has_any_role(_user('advisor'), list(sis_roles.ADMIN_ROLES))

    def test_an_org_admin_still_reaches_the_money(self):
        assert has_any_role(_user('org_admin'), list(sis_roles.FINANCE_ROLES))


@pytest.mark.unit
class TestHoldingBothRoles:
    """Kate might be made a coordinator without her admin role being removed.
    The higher role has to win, or promoting someone would quietly demote them.
    """

    def test_admin_plus_coordinator_is_not_treated_as_a_coordinator(self):
        assert not sis_roles.is_campus_coordinator(['org_admin', 'campus_coordinator'])

    def test_admin_plus_coordinator_still_reaches_the_money(self):
        assert has_any_role(_user('campus_coordinator', 'org_admin'),
                            list(sis_roles.FINANCE_ROLES))

    def test_a_superadmin_is_never_a_coordinator(self):
        assert not sis_roles.is_campus_coordinator(['superadmin', 'campus_coordinator'])

    def test_a_plain_coordinator_is_one(self):
        assert sis_roles.is_campus_coordinator(['campus_coordinator'])

    def test_a_teacher_is_not_one(self):
        assert not sis_roles.is_campus_coordinator(['advisor'])

    def test_no_roles_at_all_is_not_one(self):
        assert not sis_roles.is_campus_coordinator([])
        assert not sis_roles.is_campus_coordinator(None)


@pytest.mark.unit
class TestPayFieldRedaction:
    PROFILE = {
        'position': 'Art teacher', 'staff_type': 'employee',
        'pay_type': 'hourly', 'payroll_id': 'EMP-14', 'hourly_rate_cents': 2200,
        'emergency_contact_name': 'Dana', 'emergency_contact_phone': '555-0100',
        'work_schedule': 'Tue & Thu 9–3', 'is_active': True,
    }

    def test_pay_is_stripped_when_redacting(self):
        out = staff.redact_pay(dict(self.PROFILE), True)
        for f in staff.PAY_FIELDS:
            assert f not in out

    def test_the_operational_half_survives(self):
        """Blocking the endpoint would have taken these too — that's the whole
        reason this is a per-field redaction."""
        out = staff.redact_pay(dict(self.PROFILE), True)
        assert out['emergency_contact_name'] == 'Dana'
        assert out['emergency_contact_phone'] == '555-0100'
        assert out['work_schedule'] == 'Tue & Thu 9–3'
        assert out['position'] == 'Art teacher'

    def test_an_admin_sees_everything(self):
        assert staff.redact_pay(dict(self.PROFILE), False) == self.PROFILE

    def test_a_list_of_profiles_is_redacted_row_by_row(self):
        out = staff.redact_pay([dict(self.PROFILE), dict(self.PROFILE)], True)
        assert len(out) == 2
        assert all('hourly_rate_cents' not in p for p in out)

    def test_nothing_blows_up_on_an_empty_profile(self):
        assert staff.redact_pay(None, True) is None
        assert staff.redact_pay({}, True) == {}

    def test_pay_fields_are_exactly_the_money(self):
        """If a pay column is added to the profile and not listed here, it leaks."""
        assert set(staff.PAY_FIELDS) == {'pay_type', 'payroll_id', 'hourly_rate_cents'}


@pytest.mark.unit
class TestTheFinanceModulesAreActuallyGated:
    """Belt and braces: assert the decorators on the money routes, so a future
    edit that swaps FINANCE_ROLES back to ADMIN_ROLES fails here rather than in
    production."""

    def _roles_on(self, module, view_name):
        """The role tuple `require_role` was given for a view, read off the
        blueprint's registered function."""
        import inspect
        src = inspect.getsource(module)
        # Find the decorator line immediately preceding the view function.
        lines = src.split('\n')
        for i, line in enumerate(lines):
            if line.startswith(f'def {view_name}('):
                for back in range(i - 1, max(0, i - 5), -1):
                    if 'require_role' in lines[back]:
                        return lines[back]
        raise AssertionError(f'no require_role found for {view_name}')

    def test_timesheets_are_finance_gated(self):
        from routes.sis import staff_admin
        assert 'FINANCE_ROLES' in self._roles_on(staff_admin, 'timesheets')

    def test_time_entry_edits_are_finance_gated(self):
        from routes.sis import staff_admin
        assert 'FINANCE_ROLES' in self._roles_on(staff_admin, 'edit_time_entry')

    def test_timesheet_approval_is_finance_gated(self):
        from routes.sis import staff_admin
        assert 'FINANCE_ROLES' in self._roles_on(staff_admin, 'approve_timesheet')

    def test_payroll_export_is_finance_gated(self):
        from routes.sis import staff_admin
        assert 'FINANCE_ROLES' in self._roles_on(staff_admin, 'payroll_csv')

    def test_the_whole_billing_module_is_finance_gated(self):
        """billing.py imports FINANCE_ROLES under the name STAFF_ROLES, so every
        @require_role(*STAFF_ROLES) in it is a finance gate."""
        from routes.sis import billing
        assert billing.STAFF_ROLES == sis_roles.FINANCE_ROLES

    def test_onboarding_stays_open_to_coordinators(self):
        """The point of splitting staff_admin per-route: the operational half
        must NOT have been dragged into the finance tier with the payroll half."""
        from routes.sis import staff_admin
        assert 'ADMIN_ROLES' in self._roles_on(staff_admin, 'list_templates')
        assert 'ADMIN_ROLES' in self._roles_on(staff_admin, 'list_forms')
        assert 'ADMIN_ROLES' in self._roles_on(staff_admin, 'get_profile')
