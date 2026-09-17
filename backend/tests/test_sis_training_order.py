"""
The creator's order of the training catalog, quests and links together.

Molly (iCreate, 2026-09-17, b26c05e3): "It would be nice to be able to order
the trainings in the order I want. I entered them in numerical order but then
they ..." The Training page lists quest-backed and link-backed rows in one
list; the order is one shared scale written to sequence_order (quests) and
sort_order (links), each row's index in the list the admin arranged.

Pinned here: both kinds get their index; a row that is not this org's is
skipped rather than written; the body is validated.
"""

from unittest.mock import Mock, patch

import pytest

import routes.sis.staff_training as training

ORG = '11111111-1111-4111-8111-111111111111'
OTHER = '99999999-9999-4999-8999-999999999999'
Q1 = '22222222-2222-4222-8222-222222222221'
Q2 = '22222222-2222-4222-8222-222222222222'
L1 = '33333333-3333-4333-8333-333333333331'
L2 = '33333333-3333-4333-8333-333333333332'


def _call(body):
    view = training.set_training_order
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    quests_repo = Mock()
    quests_repo.set_sequence_order.side_effect = lambda org, ids, positions: len(ids)
    links_repo = Mock()
    # L2 belongs to another school: get_owned answers None for it.
    links_repo.get_owned.side_effect = lambda org, link_id: (
        {'id': link_id, 'organization_id': org} if link_id == L1 else None)
    links_repo.update_link.return_value = {'id': L1}

    from flask import Flask
    app = Flask(__name__)
    with app.test_request_context('/api/sis/training/order', method='PUT', json=body), \
         patch('services.sis_service.org_or_error', return_value=(ORG, None)), \
         patch.object(training, '_admin', return_value=Mock()), \
         patch('repositories.staff_training_repository.StaffTrainingRepository', return_value=quests_repo), \
         patch('repositories.training_link_repository.TrainingLinkRepository', return_value=links_repo):
        resp = view('admin-1')
    payload = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return status, payload, quests_repo, links_repo


@pytest.mark.unit
def test_each_row_gets_its_place_in_the_arranged_list_on_one_scale():
    status, body, quests_repo, links_repo = _call({'items': [
        {'kind': 'link', 'id': L1}, {'kind': 'quest', 'id': Q1}, {'kind': 'quest', 'id': Q2},
    ]})
    assert status == 200
    org, ids, positions = quests_repo.set_sequence_order.call_args[0]
    assert org == ORG and ids == [Q1, Q2]
    assert positions == {L1: 0, Q1: 1, Q2: 2}
    links_repo.update_link.assert_called_once_with(L1, {'sort_order': 0})
    assert body['ordered'] == 3


@pytest.mark.unit
def test_a_link_from_another_school_is_skipped_not_written():
    status, body, _, links_repo = _call({'items': [{'kind': 'link', 'id': L2}, {'kind': 'quest', 'id': Q1}]})
    assert status == 200
    links_repo.update_link.assert_not_called()
    assert body['ordered'] == 1


@pytest.mark.unit
@pytest.mark.parametrize('body', [
    {}, {'items': []}, {'items': 'q1'},
    {'items': [{'kind': 'quest', 'id': 'nope'}]},
    {'items': [{'kind': 'course', 'id': Q1}]},
])
def test_a_malformed_body_is_a_400_and_nothing_is_written(body):
    status, _, quests_repo, links_repo = _call(body)
    assert status == 400
    quests_repo.set_sequence_order.assert_not_called()
    links_repo.update_link.assert_not_called()
