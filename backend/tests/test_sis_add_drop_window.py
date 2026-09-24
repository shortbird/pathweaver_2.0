"""
The add/drop window -- when a family may still ask for a schedule change once
the Schedule Builder goes read-only (iCreate, 2026-09-01). The ask itself is a
message to the school since forms were retired (iCreate meeting 2026-09-23);
the office turns it into a task. The window decides whether the page offers it.

The window is the school's own add/drop period: a date in
feature_flags.sis_settings.add_drop_deadline, measured in the ORG's timezone so
the deadline day ends at the school's midnight rather than the server's.
"""

from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from services import sis_parent_service as parent


def _org_rows(rows):
    """A client whose organizations table returns `rows`."""
    table = MagicMock()
    for meth in ('select', 'eq', 'limit'):
        getattr(table, meth).return_value = table
    table.execute.return_value = MagicMock(data=rows)
    client = MagicMock()
    client.table.return_value = table
    return client


@pytest.mark.unit
class TestAddDropWindow:
    def test_no_deadline_configured_means_closed(self):
        """A school that never opened an add/drop period gets no button — a
        request nobody agreed to work is worse than no request."""
        with patch('services.sis_parent_service._sis_settings', return_value={}):
            assert parent.add_drop_open('org1') is False

    def test_open_before_the_deadline(self):
        with patch('services.sis_parent_service._sis_settings',
                   return_value={'add_drop_deadline': '2026-09-08'}), \
             patch('services.sis_parent_service._org_today', return_value=date(2026, 9, 1)):
            assert parent.add_drop_open('org1') is True

    def test_the_deadline_day_itself_still_counts(self):
        with patch('services.sis_parent_service._sis_settings',
                   return_value={'add_drop_deadline': '2026-09-08'}), \
             patch('services.sis_parent_service._org_today', return_value=date(2026, 9, 8)):
            assert parent.add_drop_open('org1') is True

    def test_closed_the_next_morning(self):
        with patch('services.sis_parent_service._sis_settings',
                   return_value={'add_drop_deadline': '2026-09-08'}), \
             patch('services.sis_parent_service._org_today', return_value=date(2026, 9, 9)):
            assert parent.add_drop_open('org1') is False

    def test_unparseable_deadline_is_closed_not_crashing(self):
        with patch('services.sis_parent_service._sis_settings',
                   return_value={'add_drop_deadline': 'whenever'}), \
             patch('services.sis_parent_service._org_today', return_value=date(2026, 9, 1)):
            assert parent.add_drop_open('org1') is False


@pytest.mark.unit
class TestOrgToday:
    def test_uses_the_orgs_timezone(self):
        """01:00 UTC on Sept 9 is still Sept 8 in Denver — the button has to
        survive the evening of the deadline day for a Mountain-time school."""
        one_am_utc_sept_9 = datetime(2026, 9, 9, 1, 0, tzinfo=timezone.utc)
        with patch('services.sis_parent_service._admin',
                   return_value=_org_rows([{'timezone': 'America/Denver'}])):
            assert parent._org_today('org1', now=one_am_utc_sept_9) == date(2026, 9, 8)

    def test_unknown_timezone_falls_back(self):
        one_am_utc_sept_9 = datetime(2026, 9, 9, 1, 0, tzinfo=timezone.utc)
        with patch('services.sis_parent_service._admin',
                   return_value=_org_rows([{'timezone': 'Mars/Olympus'}])):
            assert parent._org_today('org1', now=one_am_utc_sept_9) == date(2026, 9, 8)

    def test_org_with_no_timezone_uses_the_sis_default(self):
        one_am_utc_sept_9 = datetime(2026, 9, 9, 1, 0, tzinfo=timezone.utc)
        with patch('services.sis_parent_service._admin', return_value=_org_rows([{}])):
            assert parent._org_today('org1', now=one_am_utc_sept_9) == date(2026, 9, 8)
