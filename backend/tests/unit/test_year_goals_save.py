"""The staff year-goal write, shared by the goals blueprint and the weekly
goals door (PUT /api/sis/weekly-goals/students/<id>/year, 2026-10-08), so a
school that runs weekly goals without the parents' goal flow can set them."""

from unittest.mock import patch

from flask import Flask

import app  # noqa: F401 -- import graph ordering
from routes.sis import goals

ORG = 'org-1'


class FakeRepo:
    def __init__(self, existing=None, student_org=ORG):
        self.existing = existing
        self.student_org = student_org
        self.writes = []

    def user_row(self, user_id):
        return {'id': user_id, 'organization_id': self.student_org}

    def org_row(self, org_id):
        return {'id': ORG, 'feature_flags': {'sis_settings': {
            'goal_subjects': ['Reading', 'Math'], 'school_year': '2026-2027'}}}

    def annual_goal_for_year(self, org_id, student_id, school_year):
        return self.existing

    def write_annual_goal(self, existing_id, payload):
        self.writes.append((existing_id, payload))
        return payload


def _save(repo, body, student_id='s1'):
    with Flask(__name__).test_request_context('/'), \
         patch('repositories.sis_weekly_goal_repository.SisWeeklyGoalRepository', return_value=repo):
        return goals.save_year_goals('coach-1', ORG, student_id, body)


def test_a_first_save_creates_a_reviewed_row_in_subject_order():
    repo = FakeRepo()
    _save(repo, {'subjects': [{'subject': 'Math', 'year_goal': 'Fractions'}]})
    existing_id, payload = repo.writes[0]
    assert existing_id is None
    assert payload['status'] == 'reviewed'
    assert [(s['subject'], s['year_goal']) for s in payload['subjects']] == [
        ('Reading', ''), ('Math', 'Fractions')]


def test_a_later_save_keeps_what_a_parent_wrote():
    repo = FakeRepo(existing={'id': 'g1', 'subjects': [
        {'subject': 'Reading', 'year_goal': 'Old', 'long_term': 'Be a writer'}]})
    _save(repo, {'subjects': [{'subject': 'Reading', 'year_goal': 'Read 20 books'}]})
    existing_id, payload = repo.writes[0]
    assert existing_id == 'g1'
    reading = payload['subjects'][0]
    assert (reading['year_goal'], reading['long_term']) == ('Read 20 books', 'Be a writer')


def test_another_schools_student_is_not_found():
    resp = _save(FakeRepo(student_org='org-2'), {'subjects': []})
    assert resp[1] == 404
