"""PUT /api/users/profile lets an under-13 or locked student save a bio.

The web profile forms submit every field, so a bio-only save carries the
stored date of birth back. The date-of-birth rules treated that resubmission
as an edit and refused it: an under-13 student was told their account must
be parent-managed, and a locked student that their birthday was on file, so
neither could save anything (Horizon admin, 2026-09-28). An unchanged date is
now dropped before the rules run; a changed one still meets every rule.
"""

from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from middleware.error_handler import ValidationError
from routes.users import profile

STUDENT = '4e038b63-02ed-4b53-87a2-000000000013'
UNDER_13_DOB = '2015-09-28'


def _innermost(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


@pytest.fixture
def app():
    return Flask(__name__)


def _put(app, body, current):
    admin = MagicMock()
    admin.table.return_value.select.return_value.eq.return_value.limit.return_value \
        .execute.return_value.data = [current]
    repo = MagicMock()
    repo.update.side_effect = lambda _id, data: dict(data)
    with app.test_request_context('/api/users/profile', method='PUT', json=body), \
            patch.object(profile, 'get_supabase_admin_client', return_value=admin), \
            patch.object(profile, 'UserRepository', return_value=repo):
        response = _innermost(profile.update_profile)(STUDENT)
    return response, repo


def test_an_under_13_student_saves_a_bio_with_their_stored_birthday(app):
    current = {'is_dependent': False, 'date_of_birth': UNDER_13_DOB, 'date_of_birth_locked_at': None}
    body = {'first_name': 'Ava', 'last_name': 'Lee', 'bio': 'I like frogs.', 'date_of_birth': UNDER_13_DOB}
    (_, status), repo = _put(app, body, current)
    assert status == 200
    written = repo.update.call_args.args[1]
    assert written['bio'] == 'I like frogs.'
    assert 'date_of_birth' not in written


def test_a_locked_student_saves_a_bio_with_their_stored_birthday(app):
    current = {'is_dependent': False, 'date_of_birth': '2010-01-01', 'date_of_birth_locked_at': '2026-01-01'}
    (_, status), repo = _put(app, {'bio': 'Hi', 'date_of_birth': '2010-01-01'}, current)
    assert status == 200
    assert 'date_of_birth' not in repo.update.call_args.args[1]


def test_an_under_13_date_is_still_refused_when_it_changes(app):
    current = {'is_dependent': False, 'date_of_birth': '2010-01-01', 'date_of_birth_locked_at': None}
    with pytest.raises(ValidationError, match='under 13'):
        _put(app, {'bio': 'Hi', 'date_of_birth': UNDER_13_DOB}, current)


def test_a_locked_date_is_still_refused_when_it_changes_or_clears(app):
    current = {'is_dependent': False, 'date_of_birth': '2010-01-01', 'date_of_birth_locked_at': '2026-01-01'}
    for new_value in ('2009-01-01', ''):
        with pytest.raises(ValidationError, match='already on file'):
            _put(app, {'date_of_birth': new_value}, current)
