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

from unittest.mock import patch

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


@pytest.mark.unit
class TestTheHrTier:
    """The fourth door to confidential data, found in the iCreate requirements
    review (2026-08-09): the secure-documents store holds contracts, background
    checks and HR files, and was gated on ADMIN_ROLES — which a coordinator
    passes. iCreate's requirements are explicit that coordinators do not see
    contracts or HR documentation, so the store gets its own tier. Not
    FINANCE_ROLES, because the reason is different (HR confidentiality, not
    money) and neither tier should be widened on the other's behalf.
    """

    def test_hr_roles_exclude_coordinators(self):
        assert 'campus_coordinator' not in sis_roles.HR_ROLES
        assert not has_any_role(_user('campus_coordinator'), list(sis_roles.HR_ROLES))

    def test_hr_roles_admit_admins(self):
        assert has_any_role(_user('org_admin'), list(sis_roles.HR_ROLES))

    def test_the_whole_secure_documents_module_is_hr_gated(self):
        """secure_documents.py imports its role tuple under the name STAFF_ROLES,
        so asserting the alias covers every @require_role in the module."""
        from routes.sis import secure_documents
        assert secure_documents.STAFF_ROLES == sis_roles.HR_ROLES


@pytest.mark.unit
class TestOnboardingOffersCoordinators:
    """The onboarding recipient list predated the role: it filtered staff to
    advisor/org_admin, so 'Campus Coordinator onboarding' (iCreate Phase 1)
    could not be assigned to the one role it is named after."""

    def _client_with(self, rows):
        from unittest.mock import Mock
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'limit', 'in_', 'order'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=rows)
        return client

    def test_a_coordinator_is_offered_staff_onboarding(self):
        from unittest.mock import patch
        from services import sis_onboarding_service as onboarding
        rows = [
            {'id': 'cc-1', 'display_name': 'Kate', 'email': 'kate@icreate.com',
             'org_role': 'campus_coordinator', 'role': 'org_managed', 'org_roles': None},
        ]
        with patch('services.sis_onboarding_service.get_supabase_admin_client',
                   return_value=self._client_with(rows)):
            people = onboarding.list_recipients('org-1', 'staff')
        assert [p['id'] for p in people] == ['cc-1']

    def test_the_org_roles_array_is_honoured_too(self):
        """Role assignment writes org_roles; org_role is the legacy mirror. A
        recipient whose truth lives only in the array must still be offered."""
        from unittest.mock import patch
        from services import sis_onboarding_service as onboarding
        rows = [
            {'id': 'cc-2', 'display_name': 'Julia', 'email': 'julia@icreate.com',
             'org_role': None, 'role': 'org_managed',
             'org_roles': ['campus_coordinator']},
            {'id': 'p-1', 'display_name': 'A Parent', 'email': 'p@x.com',
             'org_role': None, 'role': 'org_managed', 'org_roles': ['parent']},
        ]
        with patch('services.sis_onboarding_service.get_supabase_admin_client',
                   return_value=self._client_with(rows)):
            people = onboarding.list_recipients('org-1', 'staff')
        assert [p['id'] for p in people] == ['cc-2']


# The shared tiers (utils/sis_roles.py) all contain campus_coordinator, so a
# decorator that names one admits them just as surely as spelling the role out —
# and is the form that stops the next missed literal.
_COORDINATOR_TIERS = ('STAFF_ROLES', 'ADMIN_ROLES')


def _admits_coordinator(module, view_name):
    line = _require_role_line(module, view_name)
    return 'campus_coordinator' in line or any(t in line for t in _COORDINATOR_TIERS)


def _require_role_line(module, view_name):
    """The @require_role(...) line above a view, read off the module source —
    the same trick TestTheFinanceModulesAreActuallyGated uses."""
    import inspect
    lines = inspect.getsource(module).split('\n')
    for i, line in enumerate(lines):
        if line.startswith(f'def {view_name}('):
            for back in range(i - 1, max(0, i - 5), -1):
                if 'require_role' in lines[back]:
                    return lines[back]
    raise AssertionError(f'no require_role found for {view_name}')


@pytest.mark.unit
class TestTheSchoolPageAdmitsCoordinators:
    """/school renders from member reads that list their roles literally
    (they admit students and parents, so the SIS staff tiers don't fit), and
    campus_coordinator was missing from every list: a coordinator opening
    their own school's page got no community board and a failed message
    archive (found 2026-08-10). The school-context read is @require_auth and
    needs no entry here.
    """

    def test_the_community_feed_admits_coordinators(self):
        from routes.sis import community
        assert _admits_coordinator(community, 'family_feed')

    def test_the_carpool_writes_admit_coordinators(self):
        """canPost/canModerate are True for a coordinator (caller_is_admin),
        so the routes behind those buttons must not 403 them."""
        from routes.sis import community
        for view in ('create_carpool', 'message_carpool_author', 'delete_carpool'):
            assert _admits_coordinator(community, view), view

    def test_the_announcements_archive_admits_coordinators(self):
        from routes import announcements
        assert _admits_coordinator(announcements, 'announcements_archive')

    def test_they_can_read_and_send_announcements_at_all(self):
        """The archive was the ONLY announcements route that named them, so the
        Messaging page a coordinator is shown could read its history and neither
        list the current messages nor send one (found 2026-08-18)."""
        from routes import announcements
        for view in ('create_announcement', 'list_announcements',
                     'get_announcement_templates', 'put_announcement_templates'):
            assert _admits_coordinator(announcements, view), view

    def test_the_attendance_kiosks_are_theirs_too(self):
        """Kiosk devices are provisioned from the Settings page a coordinator
        sees, and check-in is attendance — front office, not finance."""
        from routes import kiosk
        for view in ('create_device', 'list_devices', 'deactivate_device'):
            assert _admits_coordinator(kiosk, view), view

    def test_a_coordinator_reads_the_archive_unfiltered_like_an_admin(self):
        """No audience token means no filter: the front office sees every sent
        message — a superset of what any family member sees. The coordinator's
        restriction is financial, not scope-based.

        A TEACHER is not front office, and used to be in this set: a message
        sent to ten named students turned up in an advisor's announcements
        (iCreate, 2026-08-26 — Emerson Gowdy was not one of its ten
        recipients). Advisors are filtered like any other member now, and reach
        what is actually addressed to them through the recipient snapshot.
        """
        from routes.announcements import _archive_audience_token
        assert _archive_audience_token('campus_coordinator', None) is None
        assert _archive_audience_token('org_admin', None) is None
        assert _archive_audience_token('parent', None) == 'parents'
        assert _archive_audience_token('advisor', None) == 'advisors'


@pytest.mark.unit
class TestClassReportMoneyRedaction:
    """The class report is ADMIN_ROLES, which includes campus coordinators — the
    role whose whole definition is the money subtraction. Two of its price
    columns were on by default, so a coordinator could export every class price
    and supply fee as a spreadsheet while the revenue tile beside it was hidden
    from them."""

    CLASSES = [{'id': 'c1', 'name': 'Choir (Tuesday)', 'price_cents': 25000,
                'supply_fee': 15, 'meetings': []}]

    def _report(self, sees_money):
        from services import sis_reports_service as reports
        with patch('services.sis_catalog_service.list_classes', return_value=self.CLASSES), \
             patch.object(reports, '_curriculum_by_class', return_value={}), \
             patch.object(reports, '_materials_by_class', return_value={}):
            return reports.class_report('org-1', sees_money=sees_money)

    def test_an_admin_still_gets_the_price_columns(self):
        from services import sis_reports_service as reports
        report = self._report(True)
        keys = {f['key'] for f in report['fields']}
        assert set(reports.CLASS_REPORT_MONEY_KEYS) <= keys

    def test_a_coordinator_is_not_offered_the_price_columns(self):
        from services import sis_reports_service as reports
        keys = {f['key'] for f in self._report(False)['fields']}
        assert not (set(reports.CLASS_REPORT_MONEY_KEYS) & keys)

    def test_a_coordinators_rows_do_not_carry_the_money(self):
        from services import sis_reports_service as reports
        for row in self._report(False)['rows']:
            assert not (set(reports.CLASS_REPORT_MONEY_KEYS) & set(row))

    def test_the_operational_columns_survive_the_redaction(self):
        """The point of the role is the money, not the job — a coordinator still
        runs the class report."""
        keys = {f['key'] for f in self._report(False)['fields']}
        assert {'name', 'teacher', 'room', 'enrolled', 'capacity'} <= keys
