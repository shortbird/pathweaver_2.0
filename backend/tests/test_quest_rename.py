"""
The person who created a quest must be able to fix its title.

Gryffin Learning Center, 2026-08-31: "my son did a quest today on changing the
van brake light. I accidentally typed battery, there is no way to change the
title." Every quest UPDATE path in the app lives under routes/admin/* or the
SIS, so the creator of a personal quest could not correct their own typo. The
tasks underneath were right; only the name was wrong, and the name is what
everyone reads.

These pin the predicate rather than the route, because the whole question is
"whose title is this?": the creator's while the quest is still theirs alone,
an admin's once it is public or someone else has enrolled.
"""

import pytest

import app  # noqa: F401 — import graph ordering
from routes.quest.detail import _may_rename, MAX_QUEST_TITLE_LEN

CREATOR = 'user-1'
SOMEONE_ELSE = 'user-2'


class _Result:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    """Minimal PostgREST chain stub: every filter returns self."""

    def __init__(self, rows, count=None):
        self._rows = rows
        self._count = count

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def neq(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        return _Result(self._rows, self._count)


class _Supabase:
    """Stubs only the table the predicate reads: other people's enrollments."""

    def __init__(self, other_enrollments=0):
        self.other_enrollments = other_enrollments

    def table(self, name):
        if name == 'user_quests':
            return _Query([], count=self.other_enrollments)
        raise AssertionError(f'unexpected table {name}')


def _quest(**over):
    q = {'id': 'quest-1', 'title': 'Change van battery life',
         'created_by': CREATOR, 'is_public': False}
    q.update(over)
    return q


def test_creator_may_rename_their_own_private_quest():
    assert _may_rename(_Supabase(), CREATOR, _quest()) is None


def test_a_stranger_may_not_rename_someone_elses_quest():
    denied = _may_rename(_Supabase(), SOMEONE_ELSE, _quest())
    assert denied is not None
    code, _message, status = denied
    assert (code, status) == ('FORBIDDEN', 403)


def test_a_public_library_quest_is_not_the_creators_to_rename():
    """Once an admin promotes it, the title is everyone's."""
    denied = _may_rename(_Supabase(), CREATOR, _quest(is_public=True))
    assert denied is not None
    code, _message, status = denied
    assert (code, status) == ('QUEST_IS_PUBLIC', 409)


def test_a_quest_someone_else_joined_is_not_renamed_under_them():
    denied = _may_rename(_Supabase(other_enrollments=1), CREATOR, _quest())
    assert denied is not None
    code, _message, status = denied
    assert (code, status) == ('QUEST_SHARED', 409)


def test_the_creators_own_enrollment_does_not_block_the_rename():
    """create_user_quest auto-enrols the creator, so their own row is expected;
    the count query excludes it with .neq('user_id', ...)."""
    assert _may_rename(_Supabase(other_enrollments=0), CREATOR, _quest()) is None


def test_enrollment_count_never_tallies_rows_in_python():
    """PostgREST truncates at 1000 rows, so a fetch-and-len() would silently
    call a popular quest 'unshared'. The predicate must ask Postgres to count."""
    seen = {}

    class _Counting(_Supabase):
        def table(self, name):
            q = super().table(name)
            original = q.select

            def select(*a, **k):
                seen['count_kwarg'] = k.get('count')
                return original(*a, **k)

            q.select = select
            return q

    _may_rename(_Counting(), CREATOR, _quest())
    assert seen['count_kwarg'] == 'exact'


class TestTitleValidation:
    """The route's own input rules, exercised through the Flask test client."""

    @pytest.fixture
    def client(self):
        from app import app as flask_app
        flask_app.config['TESTING'] = True
        with flask_app.test_client() as c:
            yield c

    def test_max_title_length_is_a_title_not_an_essay(self):
        assert 0 < MAX_QUEST_TITLE_LEN <= 500

    def test_rename_requires_authentication(self, client):
        r = client.patch('/api/quests/quest-1', json={'title': 'Fix brake light'})
        assert r.status_code in (401, 403)
