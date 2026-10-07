"""
Volunteer hours note, one short message per family under the hours.

iCreate b98a167f: "Can a note section be added just below that for the
building manager cc can add a little message with dates". Owner decision
(2026-10-07): the note has the same visibility as the hours number (01082b30)
-- staff write it on the family record, the family's own guardians read it on
their School page.

Pinned here:
  - staff save the note through PATCH /api/sis/households/<id>, tags stripped,
    line breaks kept, capped at 1000 characters, cleared to null; saving it
    does not re-stamp the hours
  - a parent is refused and nothing is written
  - the guardian read carries the note (None when there is none)
  - another family's guardian never reads it
"""

import inspect
from unittest.mock import patch

import pytest
from flask import Flask

from tests.test_sis_volunteer_hours import (
    _db, _patch, _read, ORG, HH_SMITH, HH_JONES, SMITH_PARENT, JONES_PARENT,
    SMITH_KID, STRANGER,
)


def _row(db, hid):
    return next(h for h in db.data['households'] if h['id'] == hid)


def _db_with_note(note='Spring cleanup May 3', jones_note=None):
    db = _db()
    _row(db, HH_SMITH)['volunteer_hours_note'] = note
    _row(db, HH_JONES)['volunteer_hours_note'] = jones_note
    return db


# --------------------------------------------------------------------------
# Staff write the note
# --------------------------------------------------------------------------

@pytest.mark.unit
def test_staff_save_the_note_with_its_dates():
    """iCreate b98a167f: "a little message with dates" is saved on the family."""
    db = _db()
    status, body = _patch(db, {'volunteer_hours_note': 'Aug 12 setup: 3h\nSep 4 <b>book fair</b>: 2h'})
    assert status == 200, body
    assert _row(db, HH_SMITH)['volunteer_hours_note'] == 'Aug 12 setup: 3h\nSep 4 book fair: 2h'
    # The note does not re-stamp when the hours were last updated.
    assert _row(db, HH_SMITH)['volunteer_hours_updated_at'] is None
    assert _row(db, HH_JONES).get('volunteer_hours_note') is None


@pytest.mark.unit
def test_clearing_the_note_stores_null():
    """iCreate b98a167f: an emptied note means no note, so parents see none."""
    db = _db_with_note()
    status, _ = _patch(db, {'volunteer_hours_note': '   '})
    assert status == 200
    assert _row(db, HH_SMITH)['volunteer_hours_note'] is None


@pytest.mark.unit
@pytest.mark.parametrize('value', ['x' * 1001, 12, ['a'], {'a': 1}])
def test_a_bad_note_is_a_400_and_nothing_is_written(value):
    """iCreate b98a167f: the note is short text, capped at 1000 characters."""
    db = _db_with_note()
    status, _ = _patch(db, {'volunteer_hours_note': value})
    assert status == 400
    assert _row(db, HH_SMITH)['volunteer_hours_note'] == 'Spring cleanup May 3'


@pytest.mark.unit
def test_a_parent_cannot_write_the_note():
    """iCreate b98a167f: staff keep the note; a parent only reads it."""
    import routes.sis as sis_routes
    from middleware.error_handler import AuthorizationError

    db = _db_with_note()
    db.data['users'].append({'id': 'p-org', 'role': 'org_managed', 'org_role': 'parent',
                             'org_roles': ['parent'], 'organization_id': ORG})
    app = Flask(__name__)
    with app.test_request_context(f'/api/sis/households/{HH_SMITH}', method='PATCH',
                                  json={'volunteer_hours_note': 'I did 500 hours'}), \
         patch('utils.auth.decorators.session_manager.get_effective_user_id', return_value='p-org'), \
         patch('database.get_supabase_admin_client', return_value=db), \
         patch.object(sis_routes, 'get_supabase_admin_client', return_value=db), \
         patch('utils.auth.decorators.apply_role_view', side_effect=lambda u, **k: u):
        with pytest.raises(AuthorizationError):
            sis_routes.update_household(HH_SMITH)
    assert _row(db, HH_SMITH)['volunteer_hours_note'] == 'Spring cleanup May 3'


# --------------------------------------------------------------------------
# A family reads its own note, and nobody else's
# --------------------------------------------------------------------------

@pytest.mark.unit
def test_a_guardian_reads_their_own_familys_note():
    """iCreate b98a167f: the note sits under the hours on the School page."""
    result = _read(_db_with_note(), SMITH_PARENT)
    assert result['note'] == 'Spring cleanup May 3'
    assert result['volunteer_hours'] == 12.5


@pytest.mark.unit
def test_no_note_reads_as_none():
    """iCreate b98a167f: a family without a note gets None, so nothing draws."""
    assert _read(_db(), SMITH_PARENT)['note'] is None
    assert _read(_db_with_note(note=None), SMITH_PARENT)['note'] is None


@pytest.mark.unit
def test_a_note_alone_shows_the_line():
    """iCreate b98a167f: a family at 0 hours with a note still sees the note."""
    db = _db_with_note()
    _row(db, HH_SMITH)['volunteer_hours'] = 0
    result = _read(db, SMITH_PARENT)
    assert result['shown'] is True
    assert result['note'] == 'Spring cleanup May 3'


@pytest.mark.unit
def test_another_family_never_reads_the_note():
    """iCreate b98a167f: same privacy as the hours -- "keep it private so not
    everyone sees everyone elses" (01082b30)."""
    db = _db_with_note(note='Smith only: May 3', jones_note=None)
    result = _read(db, JONES_PARENT)
    assert result['note'] is None
    assert 'Smith only' not in str(result)
    assert _read(db, SMITH_KID) is None
    assert _read(db, STRANGER) is None


@pytest.mark.unit
def test_the_route_returns_the_note_to_its_guardian_only():
    """iCreate b98a167f: GET /api/sis/parent/volunteer-hours carries the note
    for the family's guardian and 404s for anyone else."""
    import routes.sis.parent as parent_routes
    view = inspect.unwrap(parent_routes.family_volunteer_hours)
    app = Flask(__name__)
    db = _db_with_note()
    with app.test_request_context(f'/api/sis/parent/volunteer-hours?organization_id={ORG}'), \
         patch('services.sis_parent_service._admin', return_value=db):
        resp = view(SMITH_PARENT)
        body, status = resp if isinstance(resp, tuple) else (resp, 200)
        assert status == 200
        assert body.get_json()['note'] == 'Spring cleanup May 3'
        resp = view(STRANGER)
        body, status = resp if isinstance(resp, tuple) else (resp, 200)
        assert status == 404
        assert 'Spring cleanup' not in str(body.get_json())


@pytest.mark.unit
def test_the_family_directory_never_carries_the_note():
    """iCreate b98a167f: the directory is the family-to-family view."""
    from services import sis_parent_service as parent
    db = _db_with_note(note='Smith only: May 3')
    with patch.object(parent, '_admin', return_value=db), \
         patch.object(parent, 'is_guardian_or_staff', return_value=True), \
         patch.object(parent, 'directory_default_in', return_value=False):
        families = parent.family_directory(JONES_PARENT, ORG)
    assert 'Smith only' not in str(families)
