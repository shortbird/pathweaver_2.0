"""
The one-time repair that moves the notes a school "sent" to its own front
office into personal threads (scripts/move_office_school_threads.py).

Only the mapping is tested: which message goes to whom. It is the part that
decides where a real person's words end up.
"""

import importlib.util
from pathlib import Path

import pytest

_PATH = Path(__file__).resolve().parents[1] / 'scripts' / 'move_office_school_threads.py'
_spec = importlib.util.spec_from_file_location('move_office_school_threads', _PATH)
assert _spec and _spec.loader
script = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(script)

INBOX, MARIKA, BECKY, MOLLY = 'inbox', 'marika', 'becky', 'molly'


def _note(i, author):
    return {'id': i, 'sender_id': INBOX, 'recipient_id': MARIKA, 'sent_by_user_id': author}


def _reply(i, forwarded_by=None):
    return {'id': i, 'sender_id': MARIKA, 'recipient_id': INBOX, 'sent_by_user_id': forwarded_by}


def _plan(messages):
    return {m['id']: (m['kind'], m['sender_id'], m['recipient_id'])
            for m in script.plan_moves(messages, INBOX, MARIKA)}


@pytest.mark.unit
class TestWhereEachMessageGoes:
    def test_a_note_comes_from_the_colleague_who_wrote_it(self):
        assert _plan([_note(1, BECKY)]) == {1: ('note', BECKY, MARIKA)}

    def test_a_reply_goes_to_whoever_wrote_last(self):
        plan = _plan([_note(1, BECKY), _reply(2), _note(3, MOLLY), _reply(4), _reply(5)])
        assert plan[2] == ('reply', MARIKA, BECKY)
        assert plan[4] == ('reply', MARIKA, MOLLY)
        assert plan[5] == ('reply', MARIKA, MOLLY)

    def test_mail_to_the_office_before_anyone_wrote_stays_where_it_is(self):
        """It was written to the school, not to a person; there is nobody to
        hand it to."""
        assert _plan([_reply(1), _note(2, BECKY)]) == {2: ('note', BECKY, MARIKA)}

    def test_a_reply_typed_as_the_school_into_her_own_thread_is_still_her_reply(self):
        plan = _plan([_note(1, BECKY), _note(2, MARIKA)])
        assert plan[2] == ('reply', MARIKA, BECKY)

    def test_her_own_note_with_nobody_to_answer_stays(self):
        assert _plan([_note(1, MARIKA)]) == {}

    def test_a_school_message_with_no_author_stays(self):
        assert _plan([_note(1, None)]) == {}

    def test_the_author_column_is_cleared_only_where_it_meant_the_school(self):
        """On a member's own message sent_by_user_id is a forwarder, which is
        still true after the move."""
        moves = script.plan_moves([_note(1, BECKY), _reply(2, forwarded_by='tanner')],
                                  INBOX, MARIKA)
        assert [m['clear_author'] for m in moves] == [True, False]

    def test_a_second_run_after_the_replies_moved_plans_the_notes_the_same(self):
        """Replies move first, so a run that stops halfway still has the notes
        to match the remaining replies against."""
        assert _plan([_note(1, BECKY), _note(3, MOLLY)]) == {
            1: ('note', BECKY, MARIKA), 3: ('note', MOLLY, MARIKA)}


@pytest.mark.unit
class TestAnOfficeMembersThreadWithAFamilyBecomesTheSchools:
    """Repair 2: the office and a family have one thread, the school's."""

    def test_what_the_office_wrote_is_the_schools_with_their_name_on_it(self):
        moves = script.plan_family_moves(
            [{'id': 1, 'sender_id': MARIKA, 'recipient_id': 'mum'}], MARIKA, 'mum', INBOX)
        assert moves == [{'id': 1, 'sender_id': INBOX, 'recipient_id': 'mum',
                          'sent_by_user_id': MARIKA}]

    def test_what_the_family_wrote_is_mail_to_the_school(self):
        moves = script.plan_family_moves(
            [{'id': 2, 'sender_id': 'mum', 'recipient_id': MARIKA}], MARIKA, 'mum', INBOX)
        assert moves == [{'id': 2, 'sender_id': 'mum', 'recipient_id': INBOX,
                          'sent_by_user_id': None}]

    def test_every_message_moves_in_order(self):
        thread = [{'id': 1, 'sender_id': 'mum'}, {'id': 2, 'sender_id': MARIKA},
                  {'id': 3, 'sender_id': 'mum'}]
        assert [m['id'] for m in script.plan_family_moves(thread, MARIKA, 'mum', INBOX)] == [1, 2, 3]


@pytest.mark.unit
class TestOldBellRowsBecomeOneRowPerChat:
    """Repair 3: a chat rings again only once its one bell row is read, so a
    pile of old unread rows would silence it."""

    def _row(self, i, user='mum', group='g1', title='New message in Art', link='/communication?group=g1',
             count=None):
        meta = {'group_id': group}
        if count:
            meta['count'] = count
        return {'id': i, 'user_id': user, 'title': title, 'link': link, 'metadata': meta,
                'created_at': f'2026-09-2{i}T10:00:00+00:00'}

    def test_the_newest_row_keeps_the_count_and_the_rest_are_read(self):
        plan = script.plan_bell_collapse([self._row(1), self._row(3), self._row(2)])
        assert plan == [{'keep': 3, 'count': 3, 'title': '3 new messages in Art',
                         'metadata': {'group_id': 'g1', 'count': 3}, 'read': [2, 1]}]

    def test_one_row_is_left_alone(self):
        assert script.plan_bell_collapse([self._row(1), self._row(2, group='g2')]) == []

    def test_another_member_or_chat_is_another_pile(self):
        rows = [self._row(1), self._row(2), self._row(3, user='dad'), self._row(4, user='dad')]
        assert sorted(p['keep'] for p in script.plan_bell_collapse(rows)) == [2, 4]

    def test_the_offices_row_for_a_school_group_does_not_merge_with_a_members(self):
        office = dict(link='/inbox?tab=school&group=g1', title='iCreate inbox: Art')
        rows = [self._row(1), self._row(2), self._row(3, **office), self._row(4, **office)]
        titles = sorted(p['title'] for p in script.plan_bell_collapse(rows))
        assert titles == ['2 new messages in Art', 'iCreate inbox: 2 new messages in Art']

    def test_a_row_that_already_counts_adds_its_count(self):
        rows = [self._row(1), self._row(2, title='4 new messages in Art', count=4)]
        plan = script.plan_bell_collapse(rows)
        assert plan[0]['count'] == 5
        assert plan[0]['title'] == '5 new messages in Art'

    def test_the_wording_survives_being_collapsed_twice(self):
        assert script.collapsed_title('iCreate inbox: 3 new messages in Art', 7) \
            == 'iCreate inbox: 7 new messages in Art'

    def test_a_dm_bell_row_is_not_a_chat_row(self):
        dm = {'id': 9, 'user_id': 'mum', 'metadata': {'sender_id': 'x'}, 'created_at': 'z'}
        assert script.plan_bell_collapse([dm, dict(dm, id=10)]) == []

