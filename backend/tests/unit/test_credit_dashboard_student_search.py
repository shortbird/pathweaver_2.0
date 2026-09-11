"""The credit dashboard's student box searches by name.

It used to send the typed text as student_id, which the route compared to the
uuid. A name can never equal a uuid, so the box found nobody, ever.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from repositories.user_repository import UserRepository


def _client(rows):
    q = MagicMock()
    for m in ('select', 'ilike', 'or_', 'in_', 'limit'):
        getattr(q, m).return_value = q
    q.execute.return_value.data = rows
    client = MagicMock()
    client.table.return_value = q
    return client, q


@pytest.mark.unit
class TestIdsMatchingName:
    def test_one_word_matches_any_name_field(self):
        client, q = _client([{'id': 'u1'}, {'id': 'u2'}])
        out = UserRepository(client=client).ids_matching_name('penny')
        assert out == ['u1', 'u2']
        (clause,), _ = q.or_.call_args
        for field in ('first_name', 'last_name', 'preferred_name', 'display_name', 'email'):
            assert f'{field}.ilike.%penny%' in clause
        q.in_.assert_not_called()

    def test_two_words_are_first_and_last_name(self):
        client, q = _client([{'id': 'u1'}])
        UserRepository(client=client).ids_matching_name('Sam Peters')
        calls = [c.args for c in q.ilike.call_args_list]
        assert ('first_name', '%Sam%') in calls
        assert ('last_name', '%Peters%') in calls
        q.or_.assert_not_called()

    def test_stays_inside_the_callers_scope(self):
        client, q = _client([{'id': 'u1'}])
        UserRepository(client=client).ids_matching_name('sam', within_ids=['u1', 'u9'])
        q.in_.assert_called_once_with('id', ['u1', 'u9'])

    def test_an_empty_scope_finds_nobody_without_asking(self):
        client, q = _client([{'id': 'u1'}])
        assert UserRepository(client=client).ids_matching_name('sam', within_ids=[]) == []
        q.execute.assert_not_called()

    def test_a_blank_term_finds_nobody(self):
        client, q = _client([{'id': 'u1'}])
        assert UserRepository(client=client).ids_matching_name('   ') == []
        q.execute.assert_not_called()
