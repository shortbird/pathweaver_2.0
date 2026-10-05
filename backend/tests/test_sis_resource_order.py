"""
The admin's order of the SIS document library (PUT /api/sis/resources/order).

iCreate 07b646fa: "It'd be nice if I could rearrange the resources to put them
in a certain order (like move them up or down.)" and 48531900: "I just
realized the docs are alphabetical! I would still like to sort if possible."

org_resources has always had sort_order (default 0) and every read sorts by it
before title, but nothing wrote it, so the library read as alphabetical. The
Documents tab now sends the whole list in its arranged order and each row gets
its index.

Pinned here: an admin's order is written and read back; a teacher or a parent
is refused before anything is written; another school's ids and training
links are skipped; a malformed body is a 400 that writes nothing.
"""

import inspect
from unittest.mock import patch

import pytest
from flask import Flask

import routes.sis.resources as resources
from tests.crm_fakes import FakeSupabase

ORG = '11111111-1111-4111-8111-111111111111'
OTHER_ORG = '99999999-9999-4999-8999-999999999999'
A = '22222222-2222-4222-8222-222222222221'
B = '22222222-2222-4222-8222-222222222222'
C = '22222222-2222-4222-8222-222222222223'
FOREIGN = '33333333-3333-4333-8333-333333333331'
TRAINING = '44444444-4444-4444-8444-444444444441'


def _row(rid, title, org=ORG, is_training=False):
    return {'id': rid, 'organization_id': org, 'title': title, 'sort_order': 0,
            'is_training': is_training, 'audience': 'families', 'url': None,
            'visible_to_roles': None, 'visible_to_user_ids': None}


def _db():
    return FakeSupabase({'org_resources': [
        _row(A, 'Alpha'), _row(B, 'Bravo'), _row(C, 'Charlie'),
        _row(FOREIGN, 'Other school', org=OTHER_ORG),
        _row(TRAINING, 'Training video', is_training=True),
    ], 'sis_resource_acks': []})


def _order(db, body):
    view = inspect.unwrap(resources.set_resource_order)
    app = Flask(__name__)
    with app.test_request_context('/api/sis/resources/order', method='PUT', json=body), \
         patch('services.sis_service.org_or_error', return_value=(ORG, None)), \
         patch.object(resources, 'get_supabase_admin_client', return_value=db):
        resp = view('admin-1')
    body, status = resp if isinstance(resp, tuple) else (resp, 200)
    return status, body.get_json()


def _sort_orders(db):
    return {r['id']: r['sort_order'] for r in db.data['org_resources']}


@pytest.mark.unit
def test_admin_order_is_written_as_each_rows_index():
    """iCreate 07b646fa: move them up or down."""
    db = _db()
    status, body = _order(db, {'ids': [C, A, B]})
    assert status == 200 and body['ordered'] == 3
    orders = _sort_orders(db)
    assert (orders[C], orders[A], orders[B]) == (0, 1, 2)


@pytest.mark.unit
def test_list_returns_the_saved_order_not_the_alphabet():
    """iCreate 48531900: "I just realized the docs are alphabetical!" """
    db = _db()
    _order(db, {'ids': [C, A, B]})
    view = inspect.unwrap(resources.list_resources)
    app = Flask(__name__)
    with app.test_request_context('/api/sis/resources'), \
         patch('services.sis_service.org_or_error', return_value=(ORG, None)), \
         patch('services.sis_service.caller_is_admin', return_value=True), \
         patch.object(resources, 'get_supabase_admin_client', return_value=db), \
         patch.object(resources, 'sign_in_place', lambda *a, **k: None), \
         patch.object(resources, '_org_paperwork', return_value=[]):
        resp = view('admin-1')
    titles = [r['title'] for r in resp.get_json()['resources']]
    assert titles == ['Charlie', 'Alpha', 'Bravo']


@pytest.mark.unit
def test_another_schools_id_and_a_training_link_are_skipped():
    """iCreate 07b646fa: the order is the school's own library, nothing else."""
    db = _db()
    status, body = _order(db, {'ids': [FOREIGN, TRAINING, B, A]})
    assert status == 200 and body['ordered'] == 2
    orders = _sort_orders(db)
    assert orders[FOREIGN] == 0 and orders[TRAINING] == 0
    assert (orders[B], orders[A]) == (2, 3)


@pytest.mark.unit
@pytest.mark.parametrize('body', [
    {}, {'ids': []}, {'ids': 'abc'}, {'ids': ['nope']}, {'ids': [A, A]},
])
def test_a_malformed_body_is_a_400_and_nothing_is_written(body):
    """iCreate 07b646fa: a bad request must not half-reorder the library."""
    db = _db()
    status, _ = _order(db, body)
    assert status == 400
    assert set(_sort_orders(db).values()) == {0}


@pytest.mark.unit
@pytest.mark.parametrize('role, org_role', [('org_managed', 'advisor'), ('org_managed', 'parent'),
                                            ('student', None)])
def test_a_non_admin_is_refused_and_nothing_is_written(role, org_role):
    """iCreate 07b646fa: arranging the library is an admin's job, the same
    tier that may edit a resource."""
    from middleware.error_handler import AuthorizationError

    db = _db()
    db.data['users'] = [{'id': 'teacher-1', 'role': role, 'org_role': org_role,
                         'org_roles': [org_role] if org_role else None,
                         'organization_id': ORG}]
    app = Flask(__name__)
    with app.test_request_context('/api/sis/resources/order', method='PUT', json={'ids': [C, A, B]}), \
         patch('utils.auth.decorators.session_manager.get_effective_user_id', return_value='teacher-1'), \
         patch('database.get_supabase_admin_client', return_value=db), \
         patch.object(resources, 'get_supabase_admin_client', return_value=db), \
         patch('utils.auth.decorators.apply_role_view', side_effect=lambda u, **k: u):
        with pytest.raises(AuthorizationError):
            resources.set_resource_order()
    assert set(_sort_orders(db).values()) == {0}
