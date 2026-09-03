"""
Building a quest from the Quests page.

iCreate, 2026-08-06, looking at the family-quest screen: "where does the quest
get built? This page should have the shared quest builder form."

Fair: the page could only attach a quest that already existed somewhere else,
which is a dead end if you have not made one — and "go to the learning app,
author a quest, come back, find it in a dropdown" is not a flow people finish.

The rules here are the same ones the class-quest builder enforces, because they
are rules about what a quest IS and a second, subtly different copy of them is
how the two screens drift apart.
"""

from unittest.mock import Mock, patch

import pytest

import routes.sis.staff_training as training


ORG = 'org-1'


class _FakeTable:
    def __init__(self, name, rows, log):
        self.name, self._rows, self._log = name, rows, log

    def __getattr__(self, _n):
        return lambda *a, **k: self

    def insert(self, payload):
        self._log.append((self.name, payload))
        return self

    def execute(self):
        return Mock(data=self._rows)


def _create(body, tables=None):
    """Drive POST /training/create with a stubbed DB. Returns (json, status, inserts)."""
    log = []
    tables = tables or {}
    rows = {'quests': [{'id': 'new-quest'}], **tables}
    client = Mock()
    client.table.side_effect = lambda n: _FakeTable(n, rows.get(n, []), log)
    from flask import Flask
    app = Flask(__name__)
    with patch.object(training, '_admin', return_value=client), \
         patch.object(training, '_org_or_error', return_value=(ORG, None)), \
         patch('services.image_service.search_quest_image', return_value=None), \
         app.test_request_context(json=body):
        fn = getattr(training.create_training_quest, '__wrapped__', training.create_training_quest)
        resp = fn('user-1')
    body_json = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return body_json, status, log


def _inserted(log, table):
    return [p for (n, p) in log if n == table]


@pytest.mark.unit
class TestBuildingOne:
    def test_it_creates_the_quest_and_sets_it(self):
        body, status, log = _create({'title': 'Back to school night', 'audience': 'family'})
        assert status == 201 and body['quest_id'] == 'new-quest'
        assert _inserted(log, 'quests')
        assert _inserted(log, 'sis_staff_training')

    def test_the_quest_belongs_to_the_school(self):
        _, _, log = _create({'title': 'Back to school night'})
        assert _inserted(log, 'quests')[0]['organization_id'] == ORG

    def test_it_is_not_pushed_into_the_shared_library(self):
        """A school's own quest. is_public would put iCreate's back-to-school
        night in front of every other school on the platform."""
        _, _, log = _create({'title': 'Back to school night'})
        assert _inserted(log, 'quests')[0]['is_public'] is False

    def test_it_lands_on_the_audience_being_edited(self):
        _, _, log = _create({'title': 'Back to school night', 'audience': 'family'})
        assert _inserted(log, 'sis_staff_training')[0]['audience'] == 'family'

    def test_it_defaults_to_staff_like_everything_else(self):
        _, _, log = _create({'title': 'Classroom management'})
        assert _inserted(log, 'sis_staff_training')[0]['audience'] == 'staff'

    def test_preset_tasks_come_along(self):
        _, _, log = _create({'title': 'Q', 'tasks': [
            {'title': 'Watch the intro video', 'pillar': 'communication', 'xp_value': 50},
            {'title': 'Sign the handbook', 'pillar': 'civics'},
        ]})
        tasks = _inserted(log, 'quest_template_tasks')[0]
        assert [t['title'] for t in tasks] == ['Watch the intro video', 'Sign the handbook']
        assert [t['order_index'] for t in tasks] == [0, 1]

    def test_category_and_required_carry_through(self):
        _, _, log = _create({'title': 'Q', 'category': 'Onboarding', 'is_required': True})
        row = _inserted(log, 'sis_staff_training')[0]
        assert row['category'] == 'Onboarding' and row['is_required'] is True


@pytest.mark.unit
class TestTheQuestRules:
    def test_a_blank_task_row_is_dropped_not_saved(self):
        """The form starts with one empty row; submitting without touching it
        must not create a nameless task."""
        _, _, log = _create({'title': 'Q', 'tasks': [{'title': '   '}]})
        assert _inserted(log, 'quest_template_tasks') == []

    def test_xp_cannot_go_below_the_floor(self):
        """25 since the scale was halved on 2026-06-15."""
        _, _, log = _create({'title': 'Q', 'tasks': [{'title': 'T', 'xp_value': 5}]})
        assert _inserted(log, 'quest_template_tasks')[0][0]['xp_value'] == 25

    def test_an_unknown_pillar_falls_back_rather_than_failing(self):
        _, _, log = _create({'title': 'Q', 'tasks': [{'title': 'T', 'pillar': 'nonsense'}]})
        assert _inserted(log, 'quest_template_tasks')[0][0]['pillar'] == 'art'

    def test_a_friendly_pillar_alias_is_understood(self):
        _, _, log = _create({'title': 'Q', 'tasks': [{'title': 'T', 'pillar': 'critical_thinking'}]})
        assert _inserted(log, 'quest_template_tasks')[0][0]['pillar'] == 'stem'

    def test_the_limits_match_the_shared_authoring_rules(self):
        """Two screens build quests. Different limits between them would mean a
        quest you can make on one and not the other.

        staff_training holds its OWN copies of these constants; the class
        builder delegates to services.sis_quest_authoring, which owns them.
        This compares the duplicate against that source directly. It used to
        compare it against routes.sis.class_quests, which merely re-imported
        the same constants without using them -- so the check passed through a
        module that had no stake in it, and broke the moment an unused-import
        sweep removed the re-export (CI-01, 2026-09-03).
        """
        from services import sis_quest_authoring as shared
        assert training._MAX_TITLE_LEN == shared.MAX_TITLE_LEN
        assert training._MAX_TASKS == shared.MAX_TASKS
        assert training._MIN_XP == shared.MIN_XP
        assert training._PILLAR_ALIASES == shared.PILLAR_ALIASES


@pytest.mark.unit
class TestWhatItRefuses:
    def test_no_title(self):
        body, status, log = _create({'title': '  '})
        assert status == 400 and 'title is required' in body['error']
        assert log == []

    def test_a_title_that_is_too_long(self):
        body, status, _ = _create({'title': 'x' * 400})
        assert status == 400 and 'too long' in body['error']

    def test_more_tasks_than_a_quest_can_hold(self):
        body, status, log = _create({'title': 'Q', 'tasks': [{'title': 't'}] * 41})
        assert status == 400 and 'at most 40' in body['error']
        assert log == []
