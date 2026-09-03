"""
Credit Partner Program, phase 1: Optio Academy enrollment + records destination.

Covers the two rules that decide what a partner participant's transcript says
and where it goes:

- accreditation resolves from the ENROLLMENT, not from "has no organization".
  A soccer club's participant is org-managed under the club, so the old proxy
  under-claimed and dropped the accreditation statement off their transcript.
- a records destination is stored clean: a school needs a name, a homeschool
  answer clears any school fields left behind by an earlier answer, and consent
  to auto-send cannot survive without somewhere to send.
"""

import pytest

from utils.accreditation import resolve_transcript_accreditation
from routes.registration_funnel import _public_config
from services.academy_enrollment_service import validate_destination

ORG = {'id': 'org1', 'name': 'Utah Elite Sports', 'slug': 'ues', 'branding_config': {}}


@pytest.mark.unit
class TestAccreditationFromEnrollment:
    def test_academy_enrollment_wins_over_org_with_no_accreditation(self):
        """The credit partner case: org-managed under the partner, enrolled in
        Optio Academy. Every org in prod carries accreditation_source='none',
        so without the enrollment this student's transcript claims nothing."""
        out = resolve_transcript_accreditation(
            'partner-org', {'accreditation_source': 'none'}, academy_enrolled=True)
        assert out == {'source': 'optio'}

    def test_org_managed_without_enrollment_still_inherits_the_org(self):
        out = resolve_transcript_accreditation(
            'partner-org', {'accreditation_source': 'none'}, academy_enrolled=False)
        assert out == {'source': 'none'}

    def test_platform_direct_student_unchanged(self):
        """The pre-existing rule has to keep working: every transcript sent so
        far belonged to a student with no organization."""
        assert resolve_transcript_accreditation(None, None) == {'source': 'optio'}

    def test_org_with_its_own_accreditation_is_not_overridden_by_default(self):
        out = resolve_transcript_accreditation('org1', {'accreditation_source': 'self'})
        assert out == {'source': 'self'}

    def test_enrollment_does_not_leak_when_flag_omitted(self):
        """Callers that never pass the flag behave exactly as before."""
        assert resolve_transcript_accreditation('org1', {}) == {'source': 'none'}


@pytest.mark.unit
class TestRecordsDestinationValidation:
    def test_school_requires_a_name(self):
        fields, err = validate_destination({'destination_type': 'school', 'school_city': 'Logan'})
        assert fields is None and 'name of the school' in err

    def test_school_keeps_registrar_details(self):
        fields, err = validate_destination({
            'destination_type': 'school',
            'school_name': 'Green Canyon High School',
            'school_city': 'North Logan', 'school_state': 'UT',
            'registrar_name': 'Pat Lee', 'registrar_email': 'Registrar@Example.COM',
            'auto_send_consent': True,
        })
        assert err is None
        assert fields['school_name'] == 'Green Canyon High School'
        assert fields['registrar_email'] == 'registrar@example.com'
        assert fields['auto_send_consent'] is True
        assert fields['consent_captured_at']

    def test_consent_without_an_email_is_not_consent(self):
        """Nothing can be auto-sent with no address, so storing the consent
        would misrepresent what the family agreed to."""
        fields, err = validate_destination({
            'destination_type': 'school', 'school_name': 'A School',
            'auto_send_consent': True,
        })
        assert err is None
        assert fields['auto_send_consent'] is False
        assert fields['consent_captured_at'] is None

    def test_bad_registrar_email_is_refused(self):
        fields, err = validate_destination({
            'destination_type': 'school', 'school_name': 'A School',
            'registrar_email': 'not-an-email',
        })
        assert fields is None and 'registrar email' in err

    def test_homeschool_clears_stale_school_fields(self):
        """A family correcting their answer must not leave a registrar address
        behind for a later bulk send to pick up."""
        fields, err = validate_destination({
            'destination_type': 'homeschool',
            'school_name': 'Old School', 'registrar_email': 'old@example.com',
            'auto_send_consent': True,
        })
        assert err is None
        assert fields['school_name'] is None
        assert fields['registrar_email'] is None
        assert fields['auto_send_consent'] is False

    def test_unknown_destination_type_is_refused(self):
        fields, err = validate_destination({'destination_type': 'somewhere'})
        assert fields is None and err

    def test_missing_payload_is_refused(self):
        assert validate_destination(None)[0] is None


@pytest.mark.unit
class TestFunnelConfigFlags:
    def test_credit_partner_switches_default_off(self):
        cfg = _public_config(ORG, {})
        assert cfg['records_destination'] is False
        assert cfg['academy_enrollment'] is False
        assert cfg['academy_pathway'] == 'partner_credit'

    def test_switches_are_exposed_when_enabled(self):
        cfg = _public_config(ORG, {'records_destination': True, 'academy_enrollment': True})
        assert cfg['records_destination'] is True
        assert cfg['academy_enrollment'] is True

    def test_truthy_but_not_true_does_not_enable(self):
        """Config comes out of a JSONB blob edited by several surfaces; only an
        explicit boolean turns a step on."""
        cfg = _public_config(ORG, {'records_destination': 'yes', 'academy_enrollment': 1})
        assert cfg['records_destination'] is False
        assert cfg['academy_enrollment'] is False


class _FakeTable:
    """Minimal PostgREST-shaped stub: records inserts, returns canned selects."""

    def __init__(self, store, name):
        self.store, self.name = store, name
        self._filters = {}

    def select(self, *_a, **_k):
        return self

    def insert(self, row):
        self.store['inserts'].append((self.name, row))
        # PostgREST chains .insert(...).execute(); the insert itself returns a
        # builder, not the result.
        return _FakeInsert([{**row, 'id': f'row-{len(self.store["inserts"])}'}])

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def in_(self, col, vals):
        self._filters[col] = vals
        return self

    def limit(self, _n):
        return self

    def execute(self):
        rows = self.store['rows'].get(self.name, [])
        for col, val in self._filters.items():
            wanted = val if isinstance(val, list) else [val]
            rows = [r for r in rows if r.get(col) in wanted]
        return _FakeResult(rows)


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeInsert:
    def __init__(self, data):
        self._data = data

    def execute(self):
        return _FakeResult(self._data)


class _FakeClient:
    def __init__(self, rows=None):
        self.store = {'rows': rows or {}, 'inserts': []}

    def table(self, name):
        return _FakeTable(self.store, name)


@pytest.mark.unit
class TestEnrollRegistrationKids:
    REG = {
        'id': 'reg-1', 'organization_id': 'ues', 'parent_user_id': 'parent-1',
        'kids': [{'user_id': 'k1'}, {'user_id': 'k2'}],
        'answers': {'grade_level': {'k1': '10th'}},
    }

    def test_does_nothing_when_the_org_does_not_enroll(self):
        from services.academy_enrollment_service import enroll_registration_kids
        client = _FakeClient()
        assert enroll_registration_kids(self.REG, {}, client=client) == 0
        assert client.store['inserts'] == []

    def test_enrolls_every_kid_with_the_partner_and_grade(self):
        from services.academy_enrollment_service import enroll_registration_kids
        client = _FakeClient()
        n = enroll_registration_kids(self.REG, {'academy_enrollment': True}, client=client)
        assert n == 2
        rows = [r for t, r in client.store['inserts'] if t == 'academy_enrollments']
        assert {r['user_id'] for r in rows} == {'k1', 'k2'}
        assert all(r['pathway'] == 'partner_credit' for r in rows)
        assert all(r['partner_org_id'] == 'ues' for r in rows)
        assert next(r for r in rows if r['user_id'] == 'k1')['grade_level'] == '10th'
        assert next(r for r in rows if r['user_id'] == 'k2')['grade_level'] is None

    def test_already_enrolled_kid_is_not_enrolled_twice(self):
        """Re-entering completion (retried webhook, resumed funnel) must be a
        no-op, not a second enrollment."""
        from services.academy_enrollment_service import enroll_registration_kids
        client = _FakeClient({'academy_enrollments': [
            {'id': 'e1', 'user_id': 'k1', 'status': 'active', 'pathway': 'partner_credit'},
        ]})
        n = enroll_registration_kids(self.REG, {'academy_enrollment': True}, client=client)
        assert n == 2  # both reported enrolled...
        inserted = [r for t, r in client.store['inserts'] if t == 'academy_enrollments']
        assert [r['user_id'] for r in inserted] == ['k2']  # ...but only k2 was written

    def test_unknown_pathway_falls_back_instead_of_raising(self):
        from services.academy_enrollment_service import enroll_registration_kids
        client = _FakeClient()
        enroll_registration_kids(
            self.REG, {'academy_enrollment': True, 'academy_pathway': 'nonsense'}, client=client)
        rows = [r for t, r in client.store['inserts'] if t == 'academy_enrollments']
        assert all(r['pathway'] == 'partner_credit' for r in rows)

    def test_kids_without_a_user_id_are_skipped(self):
        from services.academy_enrollment_service import enroll_registration_kids
        client = _FakeClient()
        reg = {**self.REG, 'kids': [{'user_id': 'k1'}, {'first_name': 'no account'}]}
        assert enroll_registration_kids(reg, {'academy_enrollment': True}, client=client) == 1


@pytest.mark.unit
class TestDestinationsForKids:
    def test_keys_by_user_id(self):
        from services.academy_enrollment_service import destinations_for_kids
        client = _FakeClient({'student_records_destination': [
            {'user_id': 'k1', 'destination_type': 'school', 'school_name': 'A School'},
        ]})
        out = destinations_for_kids([{'user_id': 'k1'}, {'user_id': 'k2'}], client=client)
        assert out['k1']['school_name'] == 'A School'
        assert 'k2' not in out

    def test_empty_roster_does_not_query(self):
        from services.academy_enrollment_service import destinations_for_kids
        assert destinations_for_kids([], client=_FakeClient()) == {}
        assert destinations_for_kids(None, client=_FakeClient()) == {}
