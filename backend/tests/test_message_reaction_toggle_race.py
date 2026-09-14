"""
Two taps on one reaction pill must not 500.

OPTIO-BACKEND-8W, 2026-09-14: a heart on a group message. Two toggles arrived
together, both read "no row", both inserted, and the second insert hit the
(message_type, message_id, user_id, emoji) unique key. The route turned the
APIError into a 500 and the pill flashed an error for a reaction that was
already on the message.

The row the other request wrote is exactly the state this request asked for,
so the unique violation is absorbed and the caller gets the same answer the
first tap got. Any other insert failure still raises.
"""

from unittest.mock import Mock, patch

import pytest
from postgrest.exceptions import APIError

from services import messaging_extras_service as extras


USER = 'u-tapper'
MESSAGE = 'm-1'
GROUP = 'g-1'


def _duplicate():
    return APIError({
        'message': 'duplicate key value violates unique constraint '
                   '"message_reactions_message_type_message_id_user_id_emoji_key"',
        'code': '23505', 'hint': None,
        'details': 'Key (message_type, message_id, user_id, emoji)=(...) already exists.',
    })


def _run(insert_error):
    """Drive toggle_reaction with an empty pre-read and a failing insert."""
    inserts = []

    def _table(name):
        chain = Mock()
        for m in ('select', 'eq', 'in_', 'limit', 'delete', 'order'):
            getattr(chain, m).return_value = chain
        if name == 'message_reactions':
            # The pre-read finds nothing; the insert is the race.
            chain.execute.return_value = Mock(data=[])

            def _insert(row):
                inserts.append(row)
                failing = Mock()
                failing.execute.side_effect = insert_error
                return failing
            chain.insert.side_effect = _insert
        elif name == 'users':
            chain.execute.return_value = Mock(data=[])
        return chain

    admin = Mock()
    admin.table.side_effect = _table
    msg = {'id': MESSAGE, 'group_id': GROUP}
    with patch.object(extras, '_admin', return_value=admin), \
            patch.object(extras, '_can_touch', return_value=msg), \
            patch.object(extras, 'reactions_for_messages',
                         return_value={MESSAGE: [{'emoji': '❤️', 'count': 1,
                                                  'reacted': True, 'names': ['You']}]}), \
            patch.object(extras, 'broadcast_group') as broadcast:
        out = extras.toggle_reaction(USER, 'group', MESSAGE, '❤️')
    return out, inserts, broadcast


@pytest.mark.unit
class TestReactionToggleRace:
    def test_the_second_tap_of_a_pair_answers_like_the_first(self):
        out, inserts, broadcast = _run(_duplicate())
        assert len(inserts) == 1
        assert out['added'] is True
        assert out['reactions'][0]['reacted'] is True
        broadcast.assert_called_once()

    def test_any_other_insert_failure_still_raises(self):
        with pytest.raises(APIError):
            _run(APIError({'message': 'permission denied for table message_reactions',
                           'code': '42501', 'hint': None, 'details': None}))
