"""
The staff directory: class counts and duplicate detection on list_org_staff.

iCreate, 2026-08-01: "It'd be nice to have a list view for staff. And I also
would like a list of teachers I've invited but haven't accepted yet. And I also
messed up and invited Julia 'ADD TEACHER' instead of inviting her from her card
that was already created!"

The list view and the invited-not-accepted filter are frontend work over flags
that already existed (`is_placeholder`, `login_pending`). What the data was
missing: how many classes each person teaches — the number that makes the Julia
duplicate obvious, since the placeholder holds twelve and the invited account
holds none — and any statement that the two rows are the same person.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_service


PH_EMAIL = 'julia@icreate-staff.placeholder.optioeducation.com'


def _user(uid, name, email, **over):
    row = {'id': uid, 'first_name': name.split()[0], 'last_name': name.split()[-1],
           'display_name': name, 'email': email, 'username': None,
           'role': 'org_managed', 'org_role': 'advisor', 'org_roles': ['advisor'],
           'last_active': None, 'created_at': '2026-07-20T00:00:00Z',
           'bio': None, 'avatar_url': None}
    row.update(over)
    return row


def _list(users, classes=(), org='org-1'):
    """Run list_org_staff over a scripted users table and org_classes table."""
    def table(name):
        t = Mock()
        for chained in ('select', 'eq', 'order', 'range', 'limit', 'not_', 'is_'):
            getattr(t, chained).return_value = t
        t.not_.is_.return_value = t
        data = {'users': users, 'org_classes': list(classes)}.get(name, [])
        t.execute.return_value = Mock(data=data)
        return t

    client = Mock()
    client.table.side_effect = table
    with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
         patch('services.sis_service.org_messaging_email', return_value='school@x.io'), \
         patch('services.sis_service._archived_staff_ids', return_value=set()):
        return sis_service.list_org_staff(org)


@pytest.mark.unit
class TestClassCounts:
    def test_each_teacher_carries_their_class_count(self):
        staff = _list(
            [_user('ph', 'Julia Connor', PH_EMAIL),
             _user('real', 'Nate Vance', 'nate@example.com')],
            classes=[{'primary_instructor_id': 'ph'}] * 12 + [{'primary_instructor_id': 'real'}],
        )
        counts = {s['name']: s['class_count'] for s in staff}
        assert counts == {'Julia Connor': 12, 'Nate Vance': 1}

    def test_a_teacher_with_no_classes_reads_zero_not_missing(self):
        staff = _list([_user('a', 'Ana Diaz', 'ana@example.com')])
        assert staff[0]['class_count'] == 0

    def test_unassigned_classes_are_not_counted_against_anyone(self):
        staff = _list([_user('a', 'Ana Diaz', 'ana@example.com')],
                      classes=[{'primary_instructor_id': None}])
        assert staff[0]['class_count'] == 0

    def test_a_failed_count_still_returns_the_directory(self):
        """A directory that can't count classes is still a directory."""
        with patch('utils.db_fetch.fetch_all_rows', side_effect=RuntimeError('down')):
            staff = _list([_user('a', 'Ana Diaz', 'ana@example.com')])
        assert [s['name'] for s in staff] == ['Ana Diaz']
        assert staff[0]['class_count'] == 0


@pytest.mark.unit
class TestInvitePending:
    def test_an_invited_account_that_never_signed_in_is_pending(self):
        staff = _list([_user('e', 'Julia Connor', 'juliaconnor03@gmail.com')])
        assert staff[0]['login_pending'] is True
        assert staff[0]['is_placeholder'] is False
        # Dating the invite is what turns the list into "how long has this sat".
        assert staff[0]['created_at'] == '2026-07-20T00:00:00Z'

    def test_someone_who_has_signed_in_is_not_pending(self):
        staff = _list([_user('e', 'Nate Vance', 'nate@example.com',
                             last_active='2026-07-31T12:00:00Z')])
        assert staff[0]['login_pending'] is False

    def test_a_placeholder_is_not_counted_as_an_unaccepted_invite(self):
        """Nobody was ever emailed — it's a different kind of incomplete."""
        staff = _list([_user('ph', 'Julia Connor', PH_EMAIL)])
        assert staff[0]['is_placeholder'] is True
        assert staff[0]['login_pending'] is False


@pytest.mark.unit
class TestDuplicateDetection:
    def _julia(self):
        return _list(
            [_user('ph', 'Julia Connor', PH_EMAIL),
             _user('inv', 'Julia Connor', 'juliaconnor03@gmail.com')],
            classes=[{'primary_instructor_id': 'ph'}] * 12,
        )

    def test_the_placeholder_points_at_the_invited_account(self):
        by_id = {s['id']: s for s in self._julia()}
        assert by_id['ph']['duplicate_of']['id'] == 'inv'
        assert by_id['ph']['duplicate_of']['email'] == 'juliaconnor03@gmail.com'
        assert by_id['ph']['duplicate_of']['is_placeholder'] is False

    def test_the_invited_account_points_back(self):
        by_id = {s['id']: s for s in self._julia()}
        assert by_id['inv']['duplicate_of']['id'] == 'ph'
        # The classes stranded on the wrong record — the reason to merge.
        assert by_id['inv']['duplicate_of']['class_count'] == 12

    def test_a_name_that_differs_in_spacing_or_case_still_matches(self):
        staff = _list([_user('ph', 'Julia Connor', PH_EMAIL, display_name='julia  connor'),
                       _user('inv', 'Julia Connor', 'juliaconnor03@gmail.com')])
        assert all(s.get('duplicate_of') for s in staff)

    def test_two_real_accounts_with_the_same_name_are_left_alone(self):
        """Two teachers really can share a name; only a placeholder/real pair is
        a merge candidate, because only that pair has classes to rescue."""
        staff = _list([_user('a', 'Sam Lee', 'sam.lee@example.com'),
                       _user('b', 'Sam Lee', 'slee@example.com')])
        assert not any(s.get('duplicate_of') for s in staff)

    def test_two_placeholders_are_not_proposed_for_a_merge(self):
        staff = _list([_user('a', 'Sam Lee', 'sam@icreate-staff.placeholder.optioeducation.com'),
                       _user('b', 'Sam Lee', 'sam.lee@icreate-staff.placeholder.optioeducation.com')])
        assert not any(s.get('duplicate_of') for s in staff)

    def test_different_people_are_not_flagged(self):
        staff = _list([_user('ph', 'Julia Connor', PH_EMAIL),
                       _user('inv', 'Nate Vance', 'nate@example.com')])
        assert not any(s.get('duplicate_of') for s in staff)
