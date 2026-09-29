"""
A student's class history on the SIS student record.

iCreate, ticket fee0d486: "Could we get a place where we can see the history of
when classes were added and/or dropped by any particular student?"

class_enrollments kept one row per (class, student) and a drop only flipped its
status, so nothing said when or by whom. Migration 20260929145429 adds
class_enrollment_events, written by triggers, and
class_enrollments.status_changed_by, which the drop and re-add paths write so
the trigger can name the person. These tests cover the read side (service +
route + gates) and that the drop paths hand over the actor.
"""

from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import class_history_service

STUDENT = 'student-1'
ORG = 'org-1'


class FakeRepo:
    def __init__(self, events=(), waits=(), names=None, users=None):
        self._events = list(events)
        self._waits = list(waits)
        self._names = names or {}
        self._users = users or {}
        self.calls = []

    def events_for_student(self, org_id, student_id):
        self.calls.append(('events', org_id, student_id))
        return self._events

    def waitlist_entries_for_student(self, org_id, student_id):
        self.calls.append(('waits', org_id, student_id))
        return self._waits

    def class_names(self, ids):
        return {i: self._names[i] for i in ids if i in self._names}

    def users(self, ids):
        return {i: self._users[i] for i in ids if i in self._users}


ADDED = {'id': 'e1', 'class_id': 'c-art', 'class_name': 'Art', 'event': 'added',
         'actor_id': 'u-office', 'occurred_at': '2026-08-01T10:00:00+00:00',
         'date_known': True, 'backfilled': True}
DROPPED = {'id': 'e2', 'class_id': 'c-art', 'class_name': 'Art', 'event': 'dropped',
           'actor_id': 'u-parent', 'occurred_at': '2026-09-20T15:30:00+00:00',
           'date_known': True, 'backfilled': False}
USERS = {
    'u-office': {'id': 'u-office', 'first_name': 'Marika', 'last_name': 'Office'},
    'u-parent': {'id': 'u-parent', 'first_name': 'Kayla', 'last_name': 'Rose'},
}


@pytest.mark.unit
class TestHistoryService:
    def test_added_and_dropped_both_appear_newest_first_with_who(self):
        repo = FakeRepo([ADDED, DROPPED], names={'c-art': 'Art'}, users=USERS)
        history = class_history_service.get_student_class_history(ORG, STUDENT, repo=repo)

        assert [h['event'] for h in history] == ['dropped', 'added']
        assert history[0]['actor_name'] == 'Kayla Rose'
        assert history[1]['actor_name'] == 'Marika Office'
        assert all(h['class_name'] == 'Art' for h in history)
        assert ('events', ORG, STUDENT) in repo.calls

    def test_empty_history_is_an_empty_list(self):
        assert class_history_service.get_student_class_history(
            ORG, STUDENT, repo=FakeRepo()) == []

    def test_an_undated_backfilled_drop_says_so_and_sorts_after_its_add(self):
        """Most drops before the migration have no time. occurred_at is then the
        add's time, only so the row sorts after it; date_known is the truth."""
        undated = {**DROPPED, 'id': 'e3', 'actor_id': None,
                   'occurred_at': ADDED['occurred_at'], 'date_known': False,
                   'backfilled': True}
        history = class_history_service.get_student_class_history(
            ORG, STUDENT, repo=FakeRepo([ADDED, undated], users=USERS))

        assert [h['event'] for h in history] == ['dropped', 'added']
        assert history[0]['date_known'] is False
        assert history[0]['actor_name'] is None

    def test_a_deleted_class_keeps_the_name_it_had(self):
        gone = {**ADDED, 'class_id': None, 'class_name': 'Pottery'}
        history = class_history_service.get_student_class_history(
            ORG, STUDENT, repo=FakeRepo([gone]))
        assert history[0]['class_name'] == 'Pottery'

    def test_waitlist_rows_appear_as_waitlisted(self):
        wait = {'id': 'w1', 'class_id': 'c-lego', 'status': 'waiting',
                'created_at': '2026-09-01T09:00:00+00:00'}
        history = class_history_service.get_student_class_history(
            ORG, STUDENT, repo=FakeRepo([ADDED], [wait], names={'c-lego': 'Lego'}))
        assert history[0]['event'] == 'waitlisted'
        assert history[0]['class_name'] == 'Lego'


@pytest.mark.unit
class TestRepositoryScoping:
    def test_events_are_read_for_one_student_in_one_school(self):
        from repositories.class_enrollment_event_repository import (
            ClassEnrollmentEventRepository,
        )
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'order', 'range'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[])

        ClassEnrollmentEventRepository(client=client).events_for_student(ORG, STUDENT)

        client.table.assert_any_call('class_enrollment_events')
        eqs = [c.args for c in table.eq.call_args_list]
        assert ('organization_id', ORG) in eqs
        assert ('student_id', STUDENT) in eqs


# --- route ------------------------------------------------------------------

def _caller_client(role='org_managed', org_role='org_admin'):
    """Admin client answering require_role's users lookup with this caller."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'order', 'single', 'maybe_single'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{
        'role': role, 'org_role': org_role,
        'org_roles': [org_role] if org_role else None,
    }])
    return client


@contextmanager
def _route(caller, can_access=True, in_org=True, history=None):
    svc = Mock(return_value=history if history is not None else [])
    with patch('database.get_supabase_admin_client', return_value=caller), \
         patch('utils.auth.org_scope.caller_can_access_user', return_value=can_access), \
         patch('modules.gate.check_module', return_value=None), \
         patch('services.sis_service.resolve_org_id', return_value=ORG), \
         patch('services.sis_service.student_in_org', return_value=in_org), \
         patch('services.class_history_service.get_student_class_history', svc):
        yield svc


URL = f'/api/sis/students/{STUDENT}/class-history'


@pytest.mark.unit
def test_an_admin_of_the_school_sees_the_history(client, auth_headers, mock_verify_token):
    rows = [{'id': 'e2', 'event': 'dropped', 'class_name': 'Art',
             'occurred_at': DROPPED['occurred_at'], 'date_known': True,
             'actor_name': 'Kayla Rose'},
            {'id': 'e1', 'event': 'added', 'class_name': 'Art',
             'occurred_at': ADDED['occurred_at'], 'date_known': True,
             'actor_name': 'Marika Office'}]
    with _route(_caller_client(), history=rows) as svc:
        resp = client.get(URL, headers=auth_headers)
    assert resp.status_code == 200
    assert [h['event'] for h in resp.get_json()['history']] == ['dropped', 'added']
    svc.assert_called_once_with(ORG, STUDENT)


@pytest.mark.unit
def test_the_empty_case_is_an_empty_list(client, auth_headers, mock_verify_token):
    with _route(_caller_client(), history=[]):
        resp = client.get(URL, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()['history'] == []


@pytest.mark.unit
def test_a_parent_is_refused_and_nothing_is_read(client, auth_headers, mock_verify_token):
    """A family member is not front office. The history names staff and other
    guardians, so it must not reach them even for their own child."""
    with _route(_caller_client(role='parent', org_role=None),
                history=[{'id': 'leak'}]) as svc:
        resp = client.get(URL, headers=auth_headers)
    assert resp.status_code == 403
    assert 'leak' not in resp.get_data(as_text=True)
    svc.assert_not_called()


@pytest.mark.unit
def test_staff_of_another_school_are_refused_and_nothing_is_read(
        client, auth_headers, mock_verify_token):
    with _route(_caller_client(), can_access=False, history=[{'id': 'leak'}]) as svc:
        resp = client.get(URL, headers=auth_headers)
    assert resp.status_code == 403
    assert 'leak' not in resp.get_data(as_text=True)
    svc.assert_not_called()


@pytest.mark.unit
def test_a_student_outside_the_school_is_not_found(client, auth_headers, mock_verify_token):
    with _route(_caller_client(), in_org=False, history=[{'id': 'leak'}]) as svc:
        resp = client.get(URL, headers=auth_headers)
    assert resp.status_code == 404
    svc.assert_not_called()


# --- drop paths hand the actor to the trigger --------------------------------

def _writes_client():
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'delete', 'update', 'upsert', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'id': 'enr-1', 'class_id': 'c-art',
                                             'status': 'active'}])
    return client, table


@pytest.mark.unit
def test_removing_a_person_names_who_released_their_seats():
    from services import sis_person_service
    client, table = _writes_client()
    with patch('services.sis_person_service._admin', return_value=client), \
         patch('services.class_group_sync_service.sync_class_group'):
        sis_person_service._release_class_seats(ORG, STUDENT, 'u-office')
    table.update.assert_any_call({'status': 'withdrawn', 'status_changed_by': 'u-office'})


@pytest.mark.unit
def test_a_parent_drop_names_the_parent():
    from services import sis_parent_service
    client, table = _writes_client()
    with patch('services.sis_parent_service._admin', return_value=client), \
         patch('services.sis_parent_service._can_register', return_value=True), \
         patch('services.sis_parent_service._changes_locked', return_value=False), \
         patch('services.class_group_sync_service.sync_class_group'), \
         patch('services.sis_waitlist_service.restore_entry_for_withdrawal'), \
         patch('services.sis_waitlist_service.alert_admins_seat_opened'), \
         patch('services.sis_parent_service._reprice_after_change'):
        result = sis_parent_service.drop_class('u-parent', ORG, STUDENT, 'c-art')
    assert result['dropped'] is True
    table.update.assert_any_call({'status': 'withdrawn', 'status_changed_by': 'u-parent'})
