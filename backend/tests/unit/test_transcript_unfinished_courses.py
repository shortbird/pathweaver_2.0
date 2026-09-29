"""Ticket 9200a103, item 1: a course goes on the transcript only when it is finished.

Optio awards only an A. A planned credit is a course not yet finished, so no
planned credit reaches the shared (public) transcript, whatever its status, and
none counts toward the credit totals or the unweighted GPA. A finished course
comes from a class, a quest or a transfer. Tanner, 2026-09-29: "a planned credit
can't be marked complete" -- so the editor no longer offers "Completed", and the
routes refuse it. The five prod rows saved as 'completed' before that stay in
the editor and never print. The editor side is covered on the web.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest
from flask import Flask

from utils.transcript_grades import compute_gpa

pytestmark = pytest.mark.unit

STUDENT_ID = '7a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d'

PLANNED = [
    {'school_subject': 'fine_arts', 'course_name': 'Ceramics I', 'credits': 0.5,
     'status': 'in_progress', 'source': 'Optio'},
    {'school_subject': 'science', 'course_name': 'Chemistry', 'credits': 1.0,
     'status': 'dropped', 'source': 'Optio'},
    {'school_subject': 'language_arts', 'course_name': 'Creative Writing', 'credits': 0.5,
     'status': 'completed', 'source': 'Optio'},
]


class _Query:
    def __init__(self, rows: List[Dict[str, Any]]):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        return type('R', (), {'data': self._rows})()


class _Client:
    TABLES = {
        'transcript_overrides': [{'overrides': {}}],
        'users': [{'id': STUDENT_ID, 'first_name': 'Ada', 'last_name': 'Lovelace',
                   'created_at': '2025-08-01T00:00:00+00:00', 'organization_id': None}],
        'transfer_credits': [],
        # 2000 XP = 1.0 credit of Optio math, which is an A.
        'user_subject_xp': [{'school_subject': 'math', 'xp_amount': 2000}],
        'planned_credits': PLANNED,
    }

    def __init__(self):
        self.tables_read: List[str] = []

    def table(self, name):
        self.tables_read.append(name)
        return _Query(list(self.TABLES.get(name, [])))


@pytest.fixture
def shared_transcript(monkeypatch):
    import routes.public as public
    from repositories.courses_and_credits_repository import CoursesAndCreditsRepository
    from services import transcript_sharing_service

    monkeypatch.setattr(transcript_sharing_service, 'verify_transcript_token', lambda t, u: True)
    client = _Client()
    monkeypatch.setattr(public, 'get_supabase_admin_client', lambda: client)
    monkeypatch.setattr(public.academy_enrollment, 'is_academy_student', lambda *a, **k: False)
    monkeypatch.setattr(CoursesAndCreditsRepository, 'awarded_class_credits', lambda self, uid: [])

    app = Flask(__name__)
    app.register_blueprint(public.bp)
    resp = app.test_client().get(f'/api/public/transcript/{STUDENT_ID}?token=t')
    assert resp.status_code == 200, resp.get_data(as_text=True)
    data = resp.get_json()['data']
    data['_tables_read'] = client.tables_read
    return data


class TestSharedTranscript:
    def test_ticket_9200a103_no_planned_credit_is_shared(self, shared_transcript):
        """Ticket 9200a103 item 1: the old route sent every planned credit, so
        the shared page printed Ceramics I with "In Progress" in the Grade
        column. Not even the row saved as 'completed' goes: a planned credit is
        never finished, and the table is not read at all."""
        assert shared_transcript['planned_credits'] == []
        assert 'planned_credits' not in shared_transcript['_tables_read']

    def test_ticket_9200a103_totals_carry_no_in_progress_figure(self, shared_transcript):
        totals = shared_transcript['totals']
        assert 'planned_credits' not in totals
        # Completed credit is the 1.0 of Optio math only: unfinished courses add nothing.
        assert totals['total_completed'] == 1.0

    def test_ticket_9200a103_gpa_ignores_unfinished_courses(self, shared_transcript):
        assert shared_transcript['totals']['gpa'] == 4.0


class TestGpa:
    def test_gpa_is_computed_without_planned_credit(self):
        # compute_gpa takes no planned credit at all; a B transfer course and
        # an Optio A give 3.5 whatever is in progress.
        transfer = [{'subjects': {'science': {'credits': 1.0}},
                     'course_names': {'science': [{'name': 'Biology', 'credits': 1.0, 'grade': 'B'}]}}]
        assert compute_gpa({'math': {'credits': 1.0}}, [], transfer) == 3.5


def _call_planned(view_name, body, *args):
    """Drive a planned-credit route past its gates with the database stubbed."""
    import routes.admin.transcript_generator as tg

    view = getattr(tg, view_name)
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    written: List[Dict[str, Any]] = []

    class _Write(_Query):
        def insert(self, row):
            written.append(row)
            return _Query([{**row, 'id': 'pc-new'}])

        def update(self, row):
            written.append(row)
            return _Query([{**row, 'id': 'pc-1'}])

    class _WClient:
        def table(self, name):
            return _Write([])

    app = Flask(__name__)
    with app.test_request_context(json=body), \
            pytest.MonkeyPatch.context() as mp:
        mp.setattr(tg, 'get_supabase_admin_client', lambda: _WClient())
        resp = view('admin-1', STUDENT_ID, *args)
    body_, status = resp if isinstance(resp, tuple) else (resp, resp.status_code)
    return status, written


class TestPlannedCreditCannotBeCompleted:
    """Tanner, 2026-09-29: "a planned credit can't be marked complete"."""

    def test_add_refuses_completed_and_writes_nothing(self):
        status, written = _call_planned('add_planned_credit', {
            'school_subject': 'math', 'course_name': 'Algebra I', 'credits': 1,
            'status': 'completed'})
        assert status == 400
        assert written == []

    def test_update_refuses_completed_and_writes_nothing(self):
        status, written = _call_planned('update_planned_credit', {'status': 'completed'}, 'pc-1')
        assert status == 400
        assert written == []

    @pytest.mark.parametrize('status_value', ['in_progress', 'dropped'])
    def test_in_progress_and_dropped_are_still_accepted(self, status_value):
        status, written = _call_planned('update_planned_credit', {'status': status_value}, 'pc-1')
        assert status == 200
        assert written == [{'status': status_value}]

    def test_add_defaults_to_in_progress(self):
        status, written = _call_planned('add_planned_credit', {
            'school_subject': 'math', 'course_name': 'Algebra I', 'credits': 1})
        assert status == 200
        assert written[0]['status'] == 'in_progress'
