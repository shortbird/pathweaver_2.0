"""
A classroom tablet can list a hand-picked set of students (student_ids).

Apogee Cache Valley, 2026-10-13: the school does not use classes, and a device
could only be narrowed to one class, so the tablet their youngest students
share listed every student in the school, teenagers included. These tests pin
the roster filter and the write-side validation that keeps a device from
listing a student of another school.
"""

from unittest.mock import Mock, patch

import pytest

ORG = '11111111-1111-4111-8111-111111111111'
OTHER_ORG = '99999999-9999-4999-8999-999999999999'
KID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
KID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
TEEN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
TEACHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'


def _user(uid, org=ORG, org_role='student'):
    return {'id': uid, 'organization_id': org, 'first_name': uid[:4], 'last_name': '',
            'display_name': None, 'avatar_url': None,
            'role': 'org_managed', 'org_role': org_role, 'org_roles': None}


ORG_USERS = [_user(KID_A), _user(KID_B), _user(TEEN), _user(TEACHER, org_role='advisor')]


def _client(rows):
    m = Mock()
    for name in ('table', 'select', 'eq', 'limit', 'in_'):
        getattr(m, name).return_value = m
    m.execute.return_value = Mock(data=rows)
    return m


@pytest.mark.unit
class TestTheRoster:
    def _scope(self, device):
        from routes.kiosk import _device_scope_students
        with patch('routes.kiosk.fetch_all_rows', side_effect=[ORG_USERS, []]):
            return {s['id'] for s in _device_scope_students(Mock(), device)}

    def test_no_scope_lists_every_student_in_the_school(self):
        device = {'organization_id': ORG, 'class_id': None, 'student_ids': None}
        assert self._scope(device) == {KID_A, KID_B, TEEN}

    def test_a_hand_picked_list_shows_only_those_students(self):
        device = {'organization_id': ORG, 'class_id': None, 'student_ids': [KID_A, KID_B]}
        assert self._scope(device) == {KID_A, KID_B}

    def test_a_picked_student_who_left_the_school_drops_off(self):
        gone = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
        device = {'organization_id': ORG, 'class_id': None, 'student_ids': [KID_A, gone]}
        assert self._scope(device) == {KID_A}

    def test_an_empty_list_means_no_hand_picked_roster(self):
        device = {'organization_id': ORG, 'class_id': None, 'student_ids': []}
        assert self._scope(device) == {KID_A, KID_B, TEEN}


@pytest.mark.unit
class TestTheWriteValidation:
    def _check(self, ids, rows):
        from routes.kiosk import _students_in_org
        return _students_in_org(_client(rows), ids, ORG)

    def test_students_of_this_school_are_accepted_once_each(self, app):
        with app.test_request_context():
            ids, err = self._check([KID_A, KID_B, KID_A], [_user(KID_A), _user(KID_B)])
        assert err is None and ids == [KID_A, KID_B]

    def test_a_student_of_another_school_is_refused(self, app):
        with app.test_request_context():
            ids, err = self._check([KID_A, TEEN], [_user(KID_A), _user(TEEN, org=OTHER_ORG)])
        assert ids is None and err[1] == 400

    def test_a_staff_member_is_refused(self, app):
        with app.test_request_context():
            ids, err = self._check([TEACHER], [_user(TEACHER, org_role='advisor')])
        assert ids is None and err[1] == 400

    def test_a_non_list_is_refused(self, app):
        with app.test_request_context():
            ids, err = self._check(KID_A, [])
        assert ids is None and err[1] == 400

    def test_an_empty_list_clears_the_roster(self, app):
        with app.test_request_context():
            ids, err = self._check([], [])
        assert err is None and ids == []
