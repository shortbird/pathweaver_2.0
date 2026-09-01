"""
Add/drop requests — the one action a family still has once the Schedule Builder
goes read-only (iCreate, 2026-09-01: "on the schedule builder page, have an
add/drop button there that sends a request... then we get the task in the task
center").

The window is the school's own add/drop period: a date in
feature_flags.sis_settings.add_drop_deadline, measured in the ORG's timezone so
the deadline day ends at the school's midnight rather than the server's.
"""

from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from services import sis_forms_service as forms
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


@pytest.mark.unit
class TestScheduleChangeFormType:
    def test_is_a_family_form_type(self):
        assert 'schedule_change' in forms.PARENT_FORM_TYPES
        assert forms.PARENT_FORM_TYPES['schedule_change'] == 'Add/drop request'

    def test_staff_cannot_file_one(self):
        """Staff have their own 'task' type; this one is the family's."""
        assert 'schedule_change' not in forms.FORM_TYPES

    def test_resolves_a_label_like_every_other_type(self):
        assert forms.ALL_FORM_TYPES['schedule_change'] == 'Add/drop request'


# ── The route gate ───────────────────────────────────────────────────────────
# The views are called through their undecorated __wrapped__ with an explicit
# user_id, which is what @require_auth would have injected; a real Flask
# request context supplies the body.
import json  # noqa: E402

from flask import Flask  # noqa: E402

import app  # noqa: F401,E402 — import graph ordering
from routes.sis import parent_forms  # noqa: E402

GUARDIAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
STUDENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
ORG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
MINE = [{'student_id': STUDENT, 'org_id': ORG, 'name': 'Charlotte Myers'}]

create_view = parent_forms.create_form.__wrapped__
list_view = parent_forms.list_forms.__wrapped__


def _post(body, *, window_open):
    flask_app = Flask(__name__)
    with flask_app.test_request_context(
            '/api/sis/parent/forms', method='POST',
            data=json.dumps(body), content_type='application/json'), \
        patch.object(parent_forms.parent, 'registerable_students', return_value=MINE), \
        patch.object(parent_forms.parent, 'add_drop_open', return_value=window_open), \
        patch.object(parent_forms.forms, 'submit',
                     return_value={'submission': {'id': 'sub-1'}}) as submit:
        response = create_view(GUARDIAN)
    payload = response[0].get_json() if isinstance(response, tuple) else response.get_json()
    status = response[1] if isinstance(response, tuple) else 200
    return status, payload, submit


@pytest.mark.unit
class TestFilingAnAddDropRequest:
    def test_files_into_the_staff_queue_while_the_window_is_open(self):
        status, payload, submit = _post({
            'organization_id': ORG, 'form_type': 'schedule_change',
            'title': 'Add/drop — Charlotte Myers',
            'body': 'Drop: Pottery (Mon 9:00am)', 'student_user_id': STUDENT,
        }, window_open=True)
        assert status == 201 and payload['success'] is True
        org_arg, user_arg, data, kwargs = (*submit.call_args.args, submit.call_args.kwargs)
        assert (org_arg, user_arg) == (ORG, GUARDIAN)
        assert data['form_type'] == 'schedule_change'
        assert data['student_user_id'] == STUDENT
        # Tagged as a family request, so the office sees who it came from.
        assert kwargs['submitter_role'] == 'parent'

    def test_rejected_once_the_deadline_has_passed(self):
        status, payload, submit = _post({
            'organization_id': ORG, 'form_type': 'schedule_change',
            'body': 'Drop: Pottery', 'student_user_id': STUDENT,
        }, window_open=False)
        assert status == 400
        assert 'add/drop window is closed' in payload['error']
        submit.assert_not_called()

    def test_other_family_requests_are_unaffected_by_the_window(self):
        """Closing add/drop must not close records requests with it."""
        status, payload, submit = _post({
            'organization_id': ORG, 'form_type': 'records_request',
            'body': 'Transcript for a transfer',
        }, window_open=False)
        assert status == 201 and payload['success'] is True
        submit.assert_called_once()


@pytest.mark.unit
class TestOfferedFormTypes:
    def _types(self, *, window_open):
        flask_app = Flask(__name__)
        with flask_app.test_request_context(f'/api/sis/parent/forms?organization_id={ORG}'), \
            patch.object(parent_forms.parent, 'registerable_students', return_value=MINE), \
            patch.object(parent_forms.parent, 'add_drop_open', return_value=window_open), \
            patch.object(parent_forms.forms, 'list_mine', return_value=[]):
            return list_view(GUARDIAN).get_json()['form_types']

    def test_offered_during_the_window(self):
        assert 'schedule_change' in self._types(window_open=True)

    def test_withdrawn_after_it(self):
        """Not offered rather than offered-and-rejected: the family should not
        fill out a request the office is not taking."""
        types = self._types(window_open=False)
        assert 'schedule_change' not in types
        assert 'records_request' in types
