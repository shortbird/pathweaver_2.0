"""Which school a story says the student is at.

Production on 2026-09-12 had twelve students in the Optio Academy org and
zero `academy_enrollments` rows, and the first live story called one of them
"Homeschool". The rule now reads the org too: an enrollment OR membership of
the org whose slug is `optio-academy` is `academy`; any other org is `org`
(a partner school the page must not name); no org is `homeschool`. Optio
Academy's own name is never scrubbed, a partner's always is.
"""

from __future__ import annotations

import pytest

from services.stories.source import OPTIO_ACADEMY_ORG_SLUG, build_student, student_setting

pytestmark = pytest.mark.unit

STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
ACADEMY = {'id': '8ee22671-6e38-473c-a326-90ff86460310', 'name': 'Optio Academy',
           'slug': OPTIO_ACADEMY_ORG_SLUG}
PARTNER = {'id': 'org-2', 'name': 'Hearthwood Academy', 'slug': 'hearthwood'}
ENROLLMENT = {'id': 'e1', 'status': 'active', 'grade_level': '10'}


class FakeRepo:
    def __init__(self, *, org=None, enrollment=None):
        self.org, self.enrollment = org, enrollment

    def student(self, uid):
        return {'id': uid, 'first_name': 'Anna', 'last_name': 'Lindqvist',
                'organization_id': (self.org or {}).get('id'), 'date_of_birth': '2010-04-09'}

    def parent_rows(self, student): return []
    def org_row(self, org_id): return self.org if self.org and self.org['id'] == org_id else None
    def active_academy_enrollment(self, uid): return self.enrollment


class TestTheRule:
    def test_an_enrollment_is_academy_whatever_the_org(self):
        assert student_setting(enrollment=ENROLLMENT, org=None) == 'academy'
        assert student_setting(enrollment=ENROLLMENT, org=PARTNER) == 'academy'

    def test_the_optio_academy_org_is_academy_without_an_enrollment(self):
        assert student_setting(enrollment=None, org=ACADEMY) == 'academy'

    def test_any_other_org_is_org(self):
        assert student_setting(enrollment=None, org=PARTNER) == 'org'

    def test_nobody_is_homeschool(self):
        assert student_setting(enrollment=None, org=None) == 'homeschool'


class TestBuildStudent:
    def test_optio_academy_member(self):
        student = build_student(FakeRepo(org=ACADEMY), STUDENT_ID)
        assert student.setting == 'academy'
        assert student.is_org_student is True
        assert student.org_names == []                          # our school; not scrubbed
        assert student.grade_band == 'high'                     # from the date of birth

    def test_partner_school_member(self):
        student = build_student(FakeRepo(org=PARTNER), STUDENT_ID)
        assert student.setting == 'org'
        assert student.org_names == ['Hearthwood Academy']      # scrubbed from every text

    def test_enrolled_partner_member_is_academy_and_still_scrubs_the_partner(self):
        student = build_student(FakeRepo(org=PARTNER, enrollment=ENROLLMENT), STUDENT_ID)
        assert student.setting == 'academy'
        assert student.org_names == ['Hearthwood Academy']
        assert student.grade_level == '10'

    def test_platform_student(self):
        student = build_student(FakeRepo(), STUDENT_ID)
        assert student.setting == 'homeschool'
        assert student.is_org_student is False
        assert student.org_names == []
