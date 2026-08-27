"""
The Community Hub, seen from the family side.

iCreate, 2026-08-01: "I can't see the shoutouts or lost and found or other
things from the non-admin side of things." Answered by Molly the same day: the
hub is meant for families too, and lost & found carries the item rather than the
child — "just the item that was lost so parents can see it and know to come pick
it up."

So the board is family-readable. What must NOT cross over is the office's
working state on it: who claimed an item, who wrote the post, posts scheduled
for next week, and the birthday list. These tests hold that line — the feed is a
projection onto an explicit field list, so a column added to any of these tables
later cannot quietly become public.
"""

from unittest.mock import patch

import pytest

from services import sis_community_service as community


ANNOUNCEMENT = {
    'id': 'a1', 'organization_id': 'org-1', 'title': 'Early dismissal',
    'body': '<p>Friday at noon</p>', 'pinned': True, 'priority': 'urgent',
    'publish_at': None, 'expires_at': None, 'created_by': 'staff-1',
    'created_at': '2026-08-01T10:00:00', 'updated_at': None,
}
LOST_ITEM = {
    'id': 'l1', 'organization_id': 'org-1', 'description': 'Blue water bottle',
    'image_url': 'https://cdn/x.jpg', 'category': 'Bottles', 'date_found': '2026-07-28',
    'location_found': 'Gym', 'status': 'unclaimed', 'claimed_by': None,
    'created_by': 'staff-1', 'created_at': '2026-07-28T10:00:00', 'updated_at': None,
}
SHOUT_OUT = {
    'id': 'r1', 'organization_id': 'org-1', 'type': 'student_spotlight',
    'recipient_name': 'Van S.', 'recipient_user_id': 'stu-1',
    'message': 'Built the whole robot arm himself.', 'created_by': 'staff-1',
    'created_at': '2026-07-30T10:00:00', 'updated_at': None,
}
EVENT = {
    'id': 'e1', 'organization_id': 'org-1', 'title': 'Open house',
    'description': 'Come see the studios', 'location': 'Main hall',
    'start_at': '2026-08-10T17:00:00', 'end_at': None, 'all_day': False,
    'audience': 'school', 'category': 'Community', 'categories': ['Community'],
    'created_by': 'staff-1', 'created_at': '2026-07-01T10:00:00', 'updated_at': None,
}


CARPOOL_POST = {
    'id': 'c1', 'organization_id': 'org-1', 'created_by': 'parent-1',
    'author_name': 'Dana C.', 'type': 'offer',
    'message': 'Two seats from Lehi, Tue & Thu mornings.',
    'area': 'Lehi', 'days': 'Tue & Thu', 'contact': 'text me: 555-0100',
    'status': 'active', 'created_at': '2026-08-05T10:00:00',
}


def _feed(announcements=(ANNOUNCEMENT,), lost=(LOST_ITEM,), recognition=(SHOUT_OUT,),
          events=(EVENT,), carpool=(CARPOOL_POST,), viewer_id=None):
    with patch.object(community, 'list_announcements', return_value=list(announcements)) as la, \
         patch.object(community, 'list_lost_found', return_value=list(lost)) as lf, \
         patch.object(community, 'list_recognition', return_value=list(recognition)), \
         patch.object(community, 'upcoming_events', return_value=list(events)), \
         patch.object(community, 'list_carpool', return_value=list(carpool)):
        out = community.family_feed('org-1', viewer_id=viewer_id)
    return out, la, lf


@pytest.mark.unit
class TestWhatFamiliesSee:
    def test_every_module_of_the_board_is_there(self):
        feed, _, _ = _feed()
        assert feed['announcements'][0]['title'] == 'Early dismissal'
        assert feed['lost_found'][0]['description'] == 'Blue water bottle'
        assert feed['recognition'][0]['recipient_name'] == 'Van S.'
        assert feed['events'][0]['title'] == 'Open house'

    def test_a_formatted_announcement_keeps_its_formatting(self):
        feed, _, _ = _feed()
        assert feed['announcements'][0]['body'] == '<p>Friday at noon</p>'

    def test_the_donation_clock_comes_along(self):
        """The useful part for a parent: how long before the item is given away."""
        item = {**LOST_ITEM}
        community._decorate_lost_found(item)
        feed, _, _ = _feed(lost=(item,))
        assert 'days_until_donation' in feed['lost_found'][0]
        assert 'donation_deadline' in feed['lost_found'][0]


@pytest.mark.unit
class TestWhatStaysInTheOffice:
    def test_who_claimed_an_item_is_never_published(self):
        """claimed_by names a family; the board is for finding the owner, not
        announcing who came for it."""
        feed, _, _ = _feed(lost=({**LOST_ITEM, 'status': 'claimed',
                                  'claimed_by': 'The Larson family'},))
        assert 'claimed_by' not in feed['lost_found'][0]

    def test_only_unclaimed_items_are_requested(self):
        _, _, list_lost_found = _feed()
        assert list_lost_found.call_args.kwargs['status'] == 'unclaimed'

    def test_scheduled_and_expired_announcements_are_excluded(self):
        _, list_announcements, _ = _feed()
        assert list_announcements.call_args[1]['include_hidden'] is False

    def test_the_author_of_a_post_is_not_shown(self):
        feed, _, _ = _feed()
        for key in ('announcements', 'lost_found', 'recognition', 'events'):
            assert all('created_by' not in row for row in feed[key])

    def test_a_shout_outs_account_id_stays_internal(self):
        feed, _, _ = _feed()
        assert 'recipient_user_id' not in feed['recognition'][0]

    def test_admin_and_teacher_events_do_not_reach_families(self):
        feed, _, _ = _feed(events=(EVENT, {**EVENT, 'id': 'e2', 'title': 'Staff meeting',
                                           'audience': 'teachers'}))
        assert [e['title'] for e in feed['events']] == ['Open house']

    def test_admin_and_teacher_announcements_do_not_reach_families(self):
        """Events have always carried an audience; board announcements did not,
        so a post written for staff was readable by every family in the app
        (iCreate, 2026-08-26: "things Sent to teachers should not be showing up
        for Families")."""
        feed, _, _ = _feed(announcements=(
            ANNOUNCEMENT,
            {**ANNOUNCEMENT, 'id': 'a2', 'title': 'Staff PD Friday', 'audience': 'teachers'},
            {**ANNOUNCEMENT, 'id': 'a3', 'title': 'Payroll cutoff', 'audience': 'admins'},
        ))
        assert [a['title'] for a in feed['announcements']] == ['Early dismissal']

    def test_an_announcement_with_no_audience_still_reaches_families(self):
        """Every row predating the column is one families could already read;
        the migration defaults them to 'school' and this holds that default."""
        feed, _, _ = _feed(announcements=({**ANNOUNCEMENT, 'audience': None},))
        assert [a['title'] for a in feed['announcements']] == ['Early dismissal']

    def test_birthdays_are_not_part_of_the_family_feed(self):
        """Highlights shows them to the office; a broadcast of children's
        birthdays to every family in the school is a different thing."""
        feed, _, _ = _feed()
        assert 'birthdays' not in feed

    def test_a_new_column_on_a_table_does_not_leak(self):
        feed, _, _ = _feed(lost=({**LOST_ITEM, 'internal_note': 'parent was rude'},))
        assert 'internal_note' not in feed['lost_found'][0]


@pytest.mark.unit
class TestEmptyBoard:
    def test_a_school_with_nothing_posted_returns_empty_lists(self):
        feed, _, _ = _feed(announcements=(), lost=(), recognition=(), events=(), carpool=())
        assert feed == {'announcements': [], 'lost_found': [], 'recognition': [],
                        'events': [], 'carpool': []}


@pytest.mark.unit
class TestWhichSchoolsBoard:
    """A parent usually has no organization_id of their own — they are a member
    through their child. Resolving on organization_id alone shows every parent
    in the school an empty board."""

    def _client(self, dependents=(), links=(), students=()):
        from unittest.mock import Mock
        tables = {
            'users': [list(dependents), list(students)],   # dependents, then link targets
            'parent_student_links': [list(links)],
        }

        # One mock per table, reused across calls, so the users table answers
        # "dependents" the first time and "the linked students" the second.
        built = {}

        def table(name):
            if name not in built:
                t = Mock()
                for chained in ('select', 'eq', 'in_', 'limit', 'not_'):
                    getattr(t, chained).return_value = t
                t.not_.is_.return_value = t
                queue = tables.get(name, [])
                t.execute.side_effect = [Mock(data=d) for d in queue] + [Mock(data=[])] * 5
                built[name] = t
            return built[name]

        client = Mock()
        client.table.side_effect = table
        return client

    def _resolve(self, ctx, client):
        from services import sis_service
        with patch('services.sis_service.get_user_org_context', return_value=ctx), \
             patch('services.sis_service.get_supabase_admin_client', return_value=client):
            return sis_service.member_org_id('user-1')

    def test_an_org_member_uses_their_own_organization(self):
        assert self._resolve({'organization_id': 'org-1'}, self._client()) == 'org-1'

    def test_a_parent_is_found_through_their_dependent(self):
        client = self._client(dependents=[{'organization_id': 'org-1'}])
        assert self._resolve({'organization_id': None}, client) == 'org-1'

    def test_a_parent_is_found_through_an_approved_link(self):
        client = self._client(dependents=[], links=[{'student_user_id': 'stu-1'}],
                              students=[{'organization_id': 'org-1'}])
        assert self._resolve({'organization_id': None}, client) == 'org-1'

    def test_someone_with_no_school_gets_nothing(self):
        assert self._resolve({'organization_id': None}, self._client()) is None

    def test_a_lookup_failure_is_not_an_error_page(self):
        from unittest.mock import Mock
        client = Mock()
        client.table.side_effect = RuntimeError('db down')
        assert self._resolve({'organization_id': None}, client) is None


@pytest.mark.unit
class TestTheSchoolOnTheProfile:
    """/me carries `school`, which is what the web platform uses to decide
    whether this user has a school page at all. For a parent that answer cannot
    come from organization_id."""

    def _school(self, org_id, org_row):
        from unittest.mock import Mock
        from routes.auth.login.core import _member_school
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'maybe_single'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=org_row)
        with patch('services.sis_service.member_org_id', return_value=org_id):
            return _member_school(client, 'user-1')

    def test_a_member_gets_their_school_by_name(self):
        # `homepage` rides along for the post-login landing (school-homepage
        # opt-in); `hide_pillars` for the per-org pillars opt-out, which a
        # platform parent can only learn about through `school`.
        assert self._school('org-1', {'id': 'org-1', 'name': 'iCreate'}) == {
            'id': 'org-1', 'name': 'iCreate', 'homepage': False, 'hide_pillars': False}

    def test_no_school_means_no_school_page(self):
        assert self._school(None, None) is None

    def test_a_lookup_failure_hides_the_page_rather_than_breaking_the_profile(self):
        from unittest.mock import Mock
        from routes.auth.login.core import _member_school
        client = Mock()
        client.table.side_effect = RuntimeError('db down')
        with patch('services.sis_service.member_org_id', return_value='org-1'):
            assert _member_school(client, 'user-1') is None


@pytest.mark.unit
class TestCarpoolBoard:
    """The first family-AUTHORED module: posts carry an author display name, the
    author's account (so "Message them" can link into Messages) and a computed
    `mine` — never a phone number. Contact happens through in-app messaging."""

    def test_posts_reach_the_family_feed(self):
        feed, _, _ = _feed()
        post = feed['carpool'][0]
        assert post['message'] == 'Two seats from Lehi, Tue & Thu mornings.'
        assert post['author_name'] == 'Dana C.'

    def test_no_phone_number_ever_reaches_the_board(self):
        feed, _, _ = _feed()
        assert 'contact' not in feed['carpool'][0]
        assert 'phone' not in feed['carpool'][0]

    def test_the_author_is_addressable_for_a_dm(self):
        """`author_id` is what the "Message Dana" link is built from. It is the
        raw created_by under a name that says what the client may do with it."""
        feed, _, _ = _feed()
        assert feed['carpool'][0]['author_id'] == 'parent-1'

    def test_the_viewer_sees_which_posts_are_theirs(self):
        feed, _, _ = _feed(viewer_id='parent-1')
        assert feed['carpool'][0]['mine'] is True
        feed, _, _ = _feed(viewer_id='parent-2')
        assert feed['carpool'][0]['mine'] is False

    def test_a_post_needs_a_message(self):
        assert community.create_carpool_post('org-1', 'u1', {})['error']
        assert community.create_carpool_post(
            'org-1', 'u1', {'message': 'x' * 501})['error']


@pytest.mark.unit
class TestOrgAdultMessagingRule:
    """Every adult of a school can message every other — the DM-permission
    clause behind "Message this person" on the carpool board, and behind the
    school's other families appearing in Messages at all.

    It replaced a narrower rule that required an ACTIVE carpool post: parents
    could only reach the families already advertising a ride, and never each
    other for anything else."""

    def _connected(self, org_a='org-1', org_b='org-1',
                   sender_role='parent', target_role='parent'):
        from unittest.mock import patch as _patch
        from services.direct_message_service import DirectMessageService
        svc = DirectMessageService.__new__(DirectMessageService)
        with _patch('services.sis_service.member_org_id',
                    side_effect=lambda uid: org_a if uid == 'a' else org_b):
            return svc._org_adult_connection('a', 'b', sender_role=sender_role,
                                             target_role=target_role)

    def test_two_parents_of_the_same_school_connect(self):
        assert self._connected() is True

    def test_a_parent_and_a_teacher_of_the_same_school_connect(self):
        assert self._connected(target_role='advisor') is True
        assert self._connected(sender_role='org_admin') is True
        assert self._connected(sender_role='campus_coordinator') is True

    def test_different_schools_never_connect(self):
        assert self._connected(org_b='org-2') is False

    def test_no_school_no_connection(self):
        """A platform user with no membership to resolve — not everyone in the
        product is in a school."""
        assert self._connected(org_a=None, org_b=None) is False

    def test_students_never_qualify_in_either_direction(self):
        assert self._connected(sender_role='student') is False
        assert self._connected(target_role='student') is False

    def test_observers_keep_their_narrower_linked_student_rule(self):
        """An observer is somebody's grandparent or mentor, linked to one
        student — not a member of the school's parent body."""
        assert self._connected(sender_role='observer') is False
        assert self._connected(target_role='observer') is False
