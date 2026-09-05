"""
Who reacted, not just how many.

Nicole Connole, 2026-09-05 (d4233d4e): "Is there a way to see who reacts with an
emoji?" A pill said "👍 5" and the names were in the table the aggregate threw
away.

The aggregate now carries them. What matters here is that it stays ONE query for
a whole page of messages, that the viewer is named as themselves, and that a
class-wide reaction does not turn the payload into a roster.
"""

from unittest.mock import Mock, patch

import pytest

from services import messaging_extras_service as extras


VIEWER = 'u-viewer'


def _rows(*triples):
    return [{'message_id': m, 'user_id': u, 'emoji': e} for m, u, e in triples]


USERS = [
    {'id': 'u-sam', 'display_name': 'Sam Lee', 'first_name': 'Sam', 'last_name': 'Lee'},
    {'id': 'u-kate', 'display_name': None, 'first_name': 'Kate', 'last_name': 'Myers'},
    {'id': VIEWER, 'display_name': 'Nicole Connole', 'first_name': None, 'last_name': None},
]


def _run(rows, users=USERS, message_ids=('m1',)):
    """Stub the two reads reactions_for_messages makes and count them."""
    calls = []

    def _table(name):
        calls.append(name)
        chain = Mock()
        for m in ('select', 'eq', 'in_'):
            getattr(chain, m).return_value = chain
        chain.execute.return_value = Mock(
            data=rows if name == 'message_reactions' else users)
        return chain

    admin = Mock()
    admin.table.side_effect = _table
    with patch.object(extras, '_admin', return_value=admin):
        out = extras.reactions_for_messages('group', list(message_ids), VIEWER)
    return out, calls


@pytest.mark.unit
class TestReactorNames:
    def test_a_pill_carries_the_names_behind_it(self):
        out, _ = _run(_rows(('m1', 'u-sam', '👍'), ('m1', 'u-kate', '👍')))
        assert out['m1'][0]['names'] == ['Sam Lee', 'Kate Myers']

    def test_a_person_with_no_display_name_falls_back_to_their_real_one(self):
        out, _ = _run(_rows(('m1', 'u-kate', '👍')))
        assert out['m1'][0]['names'] == ['Kate Myers']

    def test_the_viewer_is_named_you_and_leads(self):
        out, _ = _run(_rows(('m1', 'u-sam', '👍'), ('m1', VIEWER, '👍')))
        assert out['m1'][0]['names'] == ['You', 'Sam Lee']
        assert out['m1'][0]['reacted'] is True

    def test_a_whole_class_reacting_does_not_become_a_roster(self):
        many = [('m1', f'u-{i}', '👍') for i in range(40)]
        out, _ = _run(_rows(*many), users=[])
        pill = out['m1'][0]
        assert pill['count'] == 40
        assert len(pill['names']) == extras.MAX_REACTOR_NAMES

    def test_a_name_we_could_not_resolve_still_counts_as_somebody(self):
        out, _ = _run(_rows(('m1', 'u-ghost', '👍')), users=[])
        assert out['m1'][0] == {'emoji': '👍', 'count': 1, 'reacted': False,
                                'names': ['Someone']}

    def test_names_are_looked_up_once_for_the_whole_page(self):
        """Never one query per pill: this runs on every message list load."""
        _, calls = _run(
            _rows(('m1', 'u-sam', '👍'), ('m2', 'u-kate', '❤️'), ('m2', 'u-sam', '👍')),
            message_ids=('m1', 'm2'))
        assert calls.count('users') == 1

    def test_nothing_is_looked_up_when_nobody_reacted(self):
        _, calls = _run([])
        assert 'users' not in calls

    def test_a_failed_name_lookup_does_not_lose_the_reaction(self):
        """The count is the feature; the names are the nicety."""
        admin = Mock()

        def _table(name):
            chain = Mock()
            for m in ('select', 'eq', 'in_'):
                getattr(chain, m).return_value = chain
            if name == 'users':
                chain.execute.side_effect = RuntimeError('users unavailable')
            else:
                chain.execute.return_value = Mock(data=_rows(('m1', 'u-sam', '👍')))
            return chain

        admin.table.side_effect = _table
        with patch.object(extras, '_admin', return_value=admin):
            out = extras.reactions_for_messages('group', ['m1'], VIEWER)
        assert out['m1'][0]['count'] == 1
        assert out['m1'][0]['names'] == ['Someone']
