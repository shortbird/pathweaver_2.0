"""
Under-13 students are never pushed into Brevo marketing lists, whichever door
they came in through.

Self-signup already refused them (routes/auth/registration.py blocks under-13
registration outright; google_oauth's _sync_oauth_signup_to_brevo checks
requires_parental_consent). The org path did not: an admin registering a roster
of nine-year-olds for a purchased course sent every one of their names and email
addresses to Brevo. An org admin's enrollment is not verifiable parental
consent, so sync_course_student now applies the same gate — and fails closed
when it cannot establish the student's age.
"""

from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest

from services import brevo_service


def _db(rows):
    db = MagicMock()
    (db.table.return_value.select.return_value.ilike.return_value
     .limit.return_value.execute.return_value.data) = rows
    return db


def _sync(rows=None, error=None):
    """Run sync_course_student against a stubbed users lookup.

    Returns (result, upsert_mock) — upsert_mock.called is the thing that
    matters: it is what actually puts a child into a marketing list.
    """
    patcher = (patch('database.get_supabase_admin_client', side_effect=error)
               if error else
               patch('database.get_supabase_admin_client', return_value=_db(rows)))
    with patcher, \
         patch.object(brevo_service.Config, 'BREVO_API_KEY', 'test-key'), \
         patch.object(brevo_service, '_upsert_contact', return_value=True) as upsert:
        result = brevo_service.sync_course_student('student@example.com', 'Ada', 'Byron')
    return result, upsert


def _dob(years_ago):
    return (date.today() - timedelta(days=int(years_ago * 365.25))).isoformat()


@pytest.mark.unit
class TestCourseStudentAgeGate:
    def test_under_13_by_consent_flag_is_not_synced(self):
        _, upsert = _sync([{'requires_parental_consent': True, 'date_of_birth': None}])
        assert not upsert.called

    def test_under_13_by_date_of_birth_is_not_synced(self):
        # Catches accounts created before the flag existed, or by a path that
        # only stored the DOB.
        _, upsert = _sync([{'requires_parental_consent': False, 'date_of_birth': _dob(9)}])
        assert not upsert.called

    def test_teenager_is_synced(self):
        result, upsert = _sync([{'requires_parental_consent': False, 'date_of_birth': _dob(15)}])
        assert upsert.called
        # Course Student Onboarding isn't live yet, so no automation name.
        assert result is brevo_service.automation_for_list(brevo_service.LIST_COURSE_STUDENTS)

    def test_account_with_no_dob_on_file_is_synced(self):
        # Blocking every DOB-less account would silence onboarding for most org
        # rosters; nothing here says this is a child.
        _, upsert = _sync([{'requires_parental_consent': False, 'date_of_birth': None}])
        assert upsert.called

    def test_just_turned_13_is_synced(self):
        _, upsert = _sync([{'requires_parental_consent': False, 'date_of_birth': _dob(13.2)}])
        assert upsert.called

    def test_unknown_address_fails_closed(self):
        _, upsert = _sync([])
        assert not upsert.called

    def test_lookup_failure_fails_closed(self):
        _, upsert = _sync(error=RuntimeError('no app context'))
        assert not upsert.called

    def test_unparseable_dob_fails_closed(self):
        _, upsert = _sync([{'requires_parental_consent': False, 'date_of_birth': 'someday'}])
        assert not upsert.called
