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
