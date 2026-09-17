"""
One age for a student, everywhere in the SIS (services/sis_age.py).

A child's school-year age is judged as of the org's first day of school; the
enrollment gates and the parent's builder already did, and the roster, CLP,
teacher pages, reports and training catalog now do too (M11, decided
2026-09-17). Without a first day, today.
"""
from datetime import date
from unittest.mock import patch

import pytest

from services import sis_age


@pytest.mark.unit
class TestSchoolAge:
    def test_as_of_the_first_day_of_school(self):
        with patch('services.sis_age.school_year_start', return_value=date(2026, 8, 24)):
            assert sis_age.school_age('org', '2017-08-25') == 8
            assert sis_age.school_age('org', '2017-08-24') == 9
            assert sis_age.school_age('org', date(2011, 1, 1)) == 15

    def test_today_when_no_first_day_is_set(self):
        today = date.today()
        dob = today.replace(year=today.year - 7)
        with patch('services.sis_age.school_year_start', return_value=None):
            assert sis_age.school_age('org', dob.isoformat()) == 7

    def test_unknown_birthday_is_none(self):
        with patch('services.sis_age.school_year_start', return_value=date(2026, 8, 24)):
            assert sis_age.school_age('org', None) is None
            assert sis_age.school_age('org', '') is None
            assert sis_age.school_age('org', 'not-a-date') is None

    def test_ages_for_reads_the_first_day_once(self):
        with patch('services.sis_age.school_year_start', return_value=date(2026, 8, 24)) as start:
            age = sis_age.ages_for('org')
            assert [age('2017-08-25'), age('2017-08-24'), age(None)] == [8, 9, None]
        assert start.call_count == 1


@pytest.mark.unit
class TestSchoolYearStart:
    def _org(self, flags):
        return {'id': 'org', 'feature_flags': flags}

    def test_reads_the_setting(self):
        with patch('services.sis_age.OrganizationRepository') as repo:
            repo.return_value.find_by_id.return_value = self._org(
                {'sis_settings': {'first_day_of_school': '2026-08-24'}})
            assert sis_age.school_year_start('org') == date(2026, 8, 24)

    def test_none_when_unset_or_unreadable(self):
        with patch('services.sis_age.OrganizationRepository') as repo:
            repo.return_value.find_by_id.return_value = self._org({'sis_settings': {}})
            assert sis_age.school_year_start('org') is None
            repo.return_value.find_by_id.return_value = self._org(
                {'sis_settings': {'first_day_of_school': 'soon'}})
            assert sis_age.school_year_start('org') is None
            repo.return_value.find_by_id.side_effect = RuntimeError('db down')
            assert sis_age.school_year_start('org') is None


@pytest.mark.unit
def test_no_sis_module_keeps_its_own_year_subtraction():
    """The arithmetic lives in sis_eligibility.age_on; the SIS modules that
    kept a copy (sis_service, sis_clp_service, sis_reports_service,
    sis_staff_service, sis_attendance_service, sis_waitlist_service,
    routes/sis/catalog.py) call sis_age instead. shared/sisConcepts.json row
    `student_age` holds the platform-wide count."""
    import re
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    offenders = []
    for sub in ('services', 'routes/sis'):
        for path in (root / sub).rglob('*.py'):
            if path.name in ('sis_eligibility.py',) or not path.name.startswith(('sis_', 'catalog', '__init__', 'staff_')):
                continue
            if 'sis' not in str(path.relative_to(root)):
                continue
            if re.search(r'\.year - \w+\.year', path.read_text(encoding='utf-8')):
                offenders.append(str(path.relative_to(root)))
    assert offenders == []
