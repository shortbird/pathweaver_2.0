"""
Volunteer hours, one number per family.

iCreate 01082b30: "Could we make a way for parents to be able to see how many
volunteer hours they have completed? We can keep it updated, but ... keep it
private so not everyone sees everyone elses."

Pinned here:
  - staff set the number through PATCH /api/sis/households/<id>, validated
    (a number from 0 to 9999) and stamped; a parent is refused and nothing is
    written
  - a guardian reads their OWN family's number; another family's guardian and
    a stranger cannot read it, and the family directory never carries it
  - the line shows when the family has hours or the school tracks hours for
    anyone, and stays hidden at a school that never uses it
"""

import inspect
from unittest.mock import patch

import pytest
from flask import Flask

from tests.crm_fakes import FakeSupabase

ORG = '11111111-1111-4111-8111-111111111111'
OTHER_ORG = '99999999-9999-4999-8999-999999999999'
HH_SMITH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
HH_JONES = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
SMITH_PARENT = '22222222-2222-4222-8222-222222222221'
JONES_PARENT = '22222222-2222-4222-8222-222222222222'
SMITH_KID = '33333333-3333-4333-8333-333333333331'
STRANGER = '44444444-4444-4444-8444-444444444444'


def _household(hid, name, hours=0, org=ORG):
    return {'id': hid, 'organization_id': org, 'name': name, 'phone': '555',
            'address_line1': '1 Main', 'city': 'Town', 'carpool_interest': False,
            'directory_opt_in': True, 'directory_opted_out': False,
            'directory_share_email': True, 'directory_share_phone': True,
            'directory_share_address': False, 'registration_hold': False,
            'volunteer_hours': hours, 'volunteer_hours_updated_at': None}


def _db(smith_hours=12.5, jones_hours=0):
    return FakeSupabase({
        'households': [_household(HH_SMITH, 'Smith Family', smith_hours),
                       _household(HH_JONES, 'Jones Family', jones_hours)],
        'household_members': [
            {'household_id': HH_SMITH, 'user_id': SMITH_PARENT, 'relationship': 'guardian'},
            {'household_id': HH_SMITH, 'user_id': SMITH_KID, 'relationship': 'student'},
            {'household_id': HH_JONES, 'user_id': JONES_PARENT, 'relationship': 'guardian'},
        ],
        'users': [
            {'id': SMITH_PARENT, 'first_name': 'Sam', 'last_name': 'Smith', 'email': 's@x.test',
             'display_name': 'Sam Smith'},
            {'id': JONES_PARENT, 'first_name': 'Jo', 'last_name': 'Jones', 'email': 'j@x.test',
             'display_name': 'Jo Jones'},
            {'id': SMITH_KID, 'first_name': 'Kit', 'last_name': 'Smith', 'display_name': 'Kit Smith'},
        ],
    })


def _hours(db, hid):
    return next(h for h in db.data['households'] if h['id'] == hid)['volunteer_hours']


# --------------------------------------------------------------------------
# Staff write the number
# --------------------------------------------------------------------------

def _patch(db, body):
    import routes.sis as sis_routes
    view = inspect.unwrap(sis_routes.update_household)
    app = Flask(__name__)
    with app.test_request_context(f'/api/sis/households/{HH_SMITH}', method='PATCH', json=body), \
         patch('services.sis_service.org_or_error', return_value=(ORG, None)), \
         patch.object(sis_routes, 'get_supabase_admin_client', return_value=db):
        resp = view('admin-1', HH_SMITH)
    body, status = resp if isinstance(resp, tuple) else (resp, 200)
    return status, body.get_json()


@pytest.mark.unit
def test_staff_set_a_familys_hours_and_the_change_is_stamped():
    """iCreate 01082b30: "We can keep it updated" -- staff enter the number."""
    db = _db()
    status, body = _patch(db, {'volunteer_hours': '20.25'})
    assert status == 200, body
    row = next(h for h in db.data['households'] if h['id'] == HH_SMITH)
    assert row['volunteer_hours'] == 20.25
    assert row['volunteer_hours_updated_at']
    # Only the family being edited changed.
    assert _hours(db, HH_JONES) == 0


@pytest.mark.unit
def test_clearing_the_field_sets_zero():
    """iCreate 01082b30: an emptied box means no hours, not an error."""
    db = _db()
    status, _ = _patch(db, {'volunteer_hours': ''})
    assert status == 200
    assert _hours(db, HH_SMITH) == 0


@pytest.mark.unit
@pytest.mark.parametrize('value', [-1, 10000, 'lots', True, [3], float('nan')])
def test_a_bad_number_is_a_400_and_nothing_is_written(value):
    """iCreate 01082b30: the number a parent reads must be a real count of hours."""
    db = _db()
    status, _ = _patch(db, {'volunteer_hours': value})
    assert status == 400
    assert _hours(db, HH_SMITH) == 12.5


@pytest.mark.unit
def test_a_parent_cannot_set_hours():
    """iCreate 01082b30: staff keep the number; a parent only reads it."""
    import routes.sis as sis_routes
    from middleware.error_handler import AuthorizationError

    db = _db()
    db.data['users'].append({'id': 'p-org', 'role': 'org_managed', 'org_role': 'parent',
                             'org_roles': ['parent'], 'organization_id': ORG})
    app = Flask(__name__)
    with app.test_request_context(f'/api/sis/households/{HH_SMITH}', method='PATCH',
                                  json={'volunteer_hours': 500}), \
         patch('utils.auth.decorators.session_manager.get_effective_user_id', return_value='p-org'), \
         patch('database.get_supabase_admin_client', return_value=db), \
         patch.object(sis_routes, 'get_supabase_admin_client', return_value=db), \
         patch('utils.auth.decorators.apply_role_view', side_effect=lambda u, **k: u):
        with pytest.raises(AuthorizationError):
            sis_routes.update_household(HH_SMITH)
    assert _hours(db, HH_SMITH) == 12.5


# --------------------------------------------------------------------------
# A family reads its own number, and nobody else's
# --------------------------------------------------------------------------

def _read(db, user_id, org=ORG):
    from services import sis_parent_service as parent
    with patch.object(parent, '_admin', return_value=db):
        return parent.family_volunteer_hours(user_id, org)


@pytest.mark.unit
def test_a_guardian_sees_their_own_familys_hours():
    """iCreate 01082b30: "a way for parents to be able to see how many volunteer
    hours they have completed" """
    result = _read(_db(), SMITH_PARENT)
    assert result['volunteer_hours'] == 12.5
    assert result['shown'] is True


@pytest.mark.unit
def test_another_family_sees_only_their_own_number():
    """iCreate 01082b30: "keep it private so not everyone sees everyone elses." """
    result = _read(_db(smith_hours=12.5, jones_hours=3), JONES_PARENT)
    assert result['volunteer_hours'] == 3


@pytest.mark.unit
def test_a_student_or_stranger_has_no_family_number():
    """iCreate 01082b30: the number is the guardians' to read."""
    db = _db()
    assert _read(db, SMITH_KID) is None
    assert _read(db, STRANGER) is None
    # A guardian at one school reads nothing for another school.
    assert _read(db, SMITH_PARENT, org=OTHER_ORG) is None


@pytest.mark.unit
def test_a_family_at_zero_sees_zero_when_the_school_tracks_hours():
    """iCreate 01082b30: a school that tracks hours shows a family its 0."""
    result = _read(_db(smith_hours=12.5, jones_hours=0), JONES_PARENT)
    assert result == {'volunteer_hours': 0, 'updated_at': None, 'shown': True}


@pytest.mark.unit
def test_nothing_is_shown_at_a_school_that_never_uses_hours():
    """iCreate 01082b30: other schools never asked for this line."""
    result = _read(_db(smith_hours=0, jones_hours=0), SMITH_PARENT)
    assert result['shown'] is False


@pytest.mark.unit
def test_the_family_directory_never_carries_hours():
    """iCreate 01082b30: "keep it private so not everyone sees everyone elses."
    The directory is the one family-to-family view of a household."""
    from services import sis_parent_service as parent
    db = _db(smith_hours=12.5, jones_hours=7)
    with patch.object(parent, '_admin', return_value=db), \
         patch.object(parent, 'is_guardian_or_staff', return_value=True), \
         patch.object(parent, 'directory_default_in', return_value=False):
        families = parent.family_directory(JONES_PARENT, ORG)
    assert {f['family_name'] for f in families} == {'Smith Family', 'Jones Family'}
    assert 'volunteer' not in str(families)
    assert '12.5' not in str(families)


@pytest.mark.unit
def test_the_route_answers_404_for_a_non_guardian():
    """iCreate 01082b30: a non-guardian gets no number at all."""
    import routes.sis.parent as parent_routes
    view = inspect.unwrap(parent_routes.family_volunteer_hours)
    app = Flask(__name__)
    with app.test_request_context(f'/api/sis/parent/volunteer-hours?organization_id={ORG}'), \
         patch('services.sis_parent_service._admin', return_value=_db()):
        resp = view(STRANGER)
    body, status = resp if isinstance(resp, tuple) else (resp, 200)
    assert status == 404
    assert 'volunteer_hours' not in body.get_json()
