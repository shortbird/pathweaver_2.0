"""
Each child misses their own classes in one absence report.

Siblings rarely share a timetable. The web page could only offer the classes
every selected child shared -- for most families none -- so a parent with
three children out of different blocks had to file three reports. Now the
POST takes `selections: [{student_user_id, class_ids}]`; the older
student_user_ids + class_id shape (mobile) keeps working.
"""

import json
from unittest.mock import patch

import pytest

from services import sis_parent_service


def _fake_create(calls, fail_on=()):
    """Stand in for create_absence: record (sid, class_id), fail some pairs."""
    def create(user_id, org_id, sid, absence_date, class_id=None, reason=None, end_date=None):
        calls.append((sid, class_id, absence_date, end_date, reason))
        if (sid, class_id) in fail_on:
            return {'error': 'This absence has already been reported'}
        return {'absence': {'id': f'{sid}:{class_id or "day"}', 'student_user_id': sid, 'class_id': class_id}}
    return create


@pytest.mark.unit
class TestSelectionsService:
    def test_one_report_per_child_per_class_and_whole_day_when_none(self):
        calls = []
        with patch.object(sis_parent_service, 'create_absence', _fake_create(calls)):
            out = sis_parent_service.create_absence_selections('p1', 'org1', [
                {'student_user_id': 'dax', 'class_ids': ['art', 'math']},
                {'student_user_id': 'riv', 'class_ids': []},
                {'student_user_id': 'zay', 'class_ids': None},
            ], '2026-09-18', reason='dentist', end_date=None)
        assert [(c[0], c[1]) for c in calls] == [('dax', 'art'), ('dax', 'math'), ('riv', None), ('zay', None)]
        assert all(c[2] == '2026-09-18' and c[4] == 'dentist' for c in calls)
        assert [a['id'] for a in out['absences']] == ['dax:art', 'dax:math', 'riv:day', 'zay:day']
        assert out['errors'] == {}

    def test_a_duplicate_on_one_class_does_not_block_the_others(self):
        calls = []
        with patch.object(sis_parent_service, 'create_absence', _fake_create(calls, fail_on={('dax', 'art')})):
            out = sis_parent_service.create_absence_selections('p1', 'org1', [
                {'student_user_id': 'dax', 'class_ids': ['art', 'math']},
            ], '2026-09-18')
        assert [a['id'] for a in out['absences']] == ['dax:math']
        assert out['errors'] == {'dax': 'This absence has already been reported'}

    def test_repeated_class_ids_and_blank_children_are_dropped(self):
        calls = []
        with patch.object(sis_parent_service, 'create_absence', _fake_create(calls)):
            sis_parent_service.create_absence_selections('p1', 'org1', [
                {'student_user_id': 'dax', 'class_ids': ['art', 'art', '']},
                {'student_user_id': '', 'class_ids': ['art']},
            ], '2026-09-18')
        assert [(c[0], c[1]) for c in calls] == [('dax', 'art')]


@pytest.mark.unit
class TestSelectionsRoute:
    def test_selections_body(self, client, auth_headers, mock_verify_token):
        with patch('services.sis_parent_service.create_absence_selections',
                   return_value={'absences': [{'id': 'a1', 'student_user_id': 'dax'}],
                                 'errors': {}}) as create:
            resp = client.post('/api/sis/parent/absences', headers=auth_headers, json={
                'organization_id': 'org1', 'absence_date': '2026-09-18', 'end_date': '2026-09-19',
                'reason': 'trip',
                'selections': [{'student_user_id': 'dax', 'class_ids': ['art', 7, '']},
                               {'student_user_id': 'riv', 'class_ids': None},
                               {'student_user_id': 'zay'},
                               {'nonsense': True}],
            })
        assert resp.status_code == 201, resp.data
        args, kwargs = create.call_args
        assert args[2] == [{'student_user_id': 'dax', 'class_ids': ['art']},
                           {'student_user_id': 'riv', 'class_ids': []},
                           {'student_user_id': 'zay', 'class_ids': []}]
        assert args[3] == '2026-09-18'
        assert kwargs == {'reason': 'trip', 'end_date': '2026-09-19'}
        assert json.loads(resp.data)['absences'][0]['id'] == 'a1'

    def test_class_ids_must_be_a_list(self, client, auth_headers, mock_verify_token):
        resp = client.post('/api/sis/parent/absences', headers=auth_headers, json={
            'organization_id': 'org1', 'absence_date': '2026-09-18',
            'selections': [{'student_user_id': 'dax', 'class_ids': 'art'}],
        })
        assert resp.status_code == 400

    def test_empty_selections_is_a_400(self, client, auth_headers, mock_verify_token):
        resp = client.post('/api/sis/parent/absences', headers=auth_headers, json={
            'organization_id': 'org1', 'absence_date': '2026-09-18', 'selections': [{'nonsense': 1}],
        })
        assert resp.status_code == 400

    def test_the_older_shape_still_works(self, client, auth_headers, mock_verify_token):
        with patch('services.sis_parent_service.create_absences',
                   return_value={'absences': [{'id': 'a1', 'student_user_id': 'dax'}], 'errors': {}}) as create:
            resp = client.post('/api/sis/parent/absences', headers=auth_headers, json={
                'organization_id': 'org1', 'absence_date': '2026-09-18',
                'student_user_ids': ['dax', 'riv'], 'class_id': 'art',
            })
        assert resp.status_code == 201
        assert create.call_args.args[2] == ['dax', 'riv']
        assert create.call_args.kwargs['class_id'] == 'art'
