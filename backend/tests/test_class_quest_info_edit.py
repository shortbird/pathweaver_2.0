"""
A teacher edits the quest itself from the class page, and does not save the
class's list over the curriculum.

iCreate, 93af5014, 2026-09-22: "Teachers can't seem to edit the quests. Once
they can edit, they should be able to select whether or not students can add
tasks. I don't think we want the 'Save this class's quests to the curriculum.'"

Tasks, attachments and XP were already editable from the class; the title and
description were reachable only from the admin-only library. The new route
reuses the preset-task gate (_authorize_editable_quest), so a quest from the
shared Optio library is never renamed from one school's class, and it takes
only the three fields a teacher is given -- not xp_threshold, which
update_class_quest already writes.
"""

from unittest.mock import Mock, patch

import pytest

from routes.sis import class_quests
from services import sis_quest_task_editing as task_editing


ORG = '11111111-1111-4111-8111-111111111111'
CLASS = '22222222-2222-4222-8222-222222222222'
QUEST = '33333333-3333-4333-8333-333333333333'
USER = '44444444-4444-4444-8444-444444444444'
CURR = '55555555-5555-4555-8555-555555555555'


class _FakeTable:
    def __init__(self, name, rows, log):
        self.name, self._rows, self._log = name, rows, log

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def update(self, payload):
        self._log.append(('update', self.name, payload))
        self._rows = [{**(self._rows[0] if self._rows else {}), **payload}]
        return self

    def delete(self):
        self._log.append(('delete', self.name, None))
        return self

    def insert(self, payload):
        self._log.append(('insert', self.name, payload))
        return self

    def upsert(self, payload, **_k):
        self._log.append(('upsert', self.name, payload))
        return self

    def execute(self):
        return Mock(data=self._rows)


def _client(tables, log):
    c = Mock()
    c.table.side_effect = lambda name: _FakeTable(name, tables.get(name, []), log)
    return c


def _call(fn, *args, body=None):
    with patch.object(class_quests, 'request',
                      Mock(get_json=lambda silent=True: body or {}, args={})):
        from flask import Flask
        app = Flask(__name__)
        with app.app_context():
            fn = getattr(fn, '__wrapped__', fn)
            resp = fn(USER, *args)
    payload = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return payload, status


@pytest.mark.unit
class TestTheTeacherEditsTheQuest:

    def _run(self, body, gate_err=None):
        log = []
        client = _client({'quests': [{'id': QUEST, 'title': 'Old', 'description': 'Old text',
                                      'allow_custom_tasks': True}]}, log)
        gate = (None, None, None, gate_err) if gate_err else ({'id': CLASS}, client, {'id': QUEST}, None)
        with patch.object(class_quests, '_authorize_editable_quest', return_value=gate):
            payload, status = _call(class_quests.update_class_quest_info, CLASS, QUEST, body=body)
        return payload, status, log

    def test_title_description_and_student_tasks_are_saved(self):
        payload, status, log = self._run(
            {'title': ' Week 5 THINK ', 'description': 'Fractions.', 'allow_custom_tasks': False})
        assert status == 200 and payload['success'] is True
        assert log == [('update', 'quests', {'title': 'Week 5 THINK', 'description': 'Fractions.',
                                             'big_idea': 'Fractions.', 'allow_custom_tasks': False})]
        assert payload['quest']['allow_custom_tasks'] is False

    def test_fields_a_teacher_is_not_given_are_dropped(self):
        payload, status, log = self._run({'xp_threshold': 500, 'organization_id': 'x'})
        assert status == 400 and payload['error'] == 'Nothing to update'
        assert not log

    def test_a_blank_title_is_refused(self):
        payload, status, log = self._run({'title': '   '})
        assert status == 400 and not log

    def test_student_tasks_must_be_a_real_boolean(self):
        payload, status, log = self._run({'allow_custom_tasks': 'no'})
        assert status == 400 and not log

    def test_the_preset_task_gate_decides_who_and_which_quest(self):
        """A library quest, a quest not on this class, or a caller who is not
        the class's teacher: the gate's refusal is returned and nothing is written."""
        _, status, log = self._run({'title': 'New'},
                                   gate_err=(_json({'success': False, 'error': 'no'}), 403))
        assert status == 403 and not log

    def test_it_uses_the_preset_task_gate(self):
        import inspect
        assert '_authorize_editable_quest(' in inspect.getsource(class_quests.update_class_quest_info)


def _json(obj):
    from flask import Flask, jsonify
    with Flask(__name__).app_context():
        return jsonify(obj)


@pytest.mark.unit
class TestSavingTheClassListToTheCurriculumIsOfficeOnly:

    def _run(self, is_admin):
        log = []
        client = _client({'sis_curriculum_classes': [{'curriculum_id': CURR}],
                          'sis_curriculum': [{'id': CURR, 'title': 'ALD', 'is_active': True}],
                          'class_quests': [{'quest_id': QUEST, 'sequence_order': 0}]}, log)
        with patch.object(class_quests, '_authorize',
                          return_value=({'id': CLASS, 'organization_id': ORG}, client, None)), \
             patch.object(class_quests.sis_service, 'caller_is_admin', return_value=is_admin):
            payload, status = _call(class_quests.save_quests_to_curriculum, CLASS,
                                    body={'curriculum_id': CURR})
        return payload, status, log

    def test_a_teacher_is_refused_and_the_curriculum_is_untouched(self):
        payload, status, log = self._run(is_admin=False)
        assert status == 403 and 'office' in payload['error']
        assert not log

    def test_the_office_still_can(self):
        _, status, log = self._run(is_admin=True)
        assert status == 200
        assert ('delete', 'sis_curriculum_quests', None) in log


@pytest.mark.unit
def test_update_quest_info_reports_student_tasks_default_on():
    log = []
    client = _client({'quests': [{'id': QUEST, 'title': 'T'}]}, log)
    out = task_editing.update_quest_info(client, QUEST, {'title': 'T'})
    assert out['quest']['allow_custom_tasks'] is True


@pytest.mark.unit
def test_the_class_list_reports_the_student_tasks_switch():
    """The checkbox opens on the saved value. Null is the column default, on."""
    rows = [
        {'quest_id': 'qa', 'sequence_order': 0, 'student_ids': None,
         'quests': {'title': 'A', 'organization_id': ORG, 'allow_custom_tasks': False}},
        {'quest_id': 'qb', 'sequence_order': 1, 'student_ids': None,
         'quests': {'title': 'B', 'organization_id': ORG, 'allow_custom_tasks': None}},
    ]
    client = _client({'class_quests': rows}, [])
    with patch.object(class_quests, '_authorize',
                      return_value=({'id': CLASS, 'organization_id': ORG}, client, None)), \
         patch.object(class_quests, '_template_task_count', return_value={}), \
         patch.object(class_quests, '_roster', return_value=[]):
        payload, status = _call(class_quests.list_class_quests, CLASS)
    assert status == 200
    assert {q['quest_id']: q['allow_custom_tasks'] for q in payload['quests']} == {'qa': False, 'qb': True}


@pytest.mark.unit
class TestTeachersMayChangeXp:
    """The office's lock on a quest's XP to finish. Molly (iCreate, 3d926fc3,
    2026-09-22): "I think it'd be good to click on 'teachers may change' if we
    want teachers to change it." update_quest_info writes it for the office's
    editors; the class /info route must never pass it through."""

    def _service(self, body, row=None):
        log = []
        client = _client({'quests': [row or {'id': QUEST, 'title': 'T'}]}, log)
        out = task_editing.update_quest_info(client, QUEST, body)
        return out, log

    def test_false_is_written_and_returned(self):
        out, log = self._service({'teachers_may_change_xp': False})
        assert log == [('update', 'quests', {'teachers_may_change_xp': False})]
        assert out['quest']['teachers_may_change_xp'] is False

    def test_true_is_written_and_returned(self):
        out, log = self._service({'teachers_may_change_xp': True},
                                 row={'id': QUEST, 'teachers_may_change_xp': False})
        assert log == [('update', 'quests', {'teachers_may_change_xp': True})]
        assert out['quest']['teachers_may_change_xp'] is True

    def test_a_string_is_refused_and_nothing_written(self):
        """"false" as a string is truthy; coercing it would unlock the quest."""
        for bad in ('false', 0, None):
            with pytest.raises(task_editing.QuestTaskEditError):
                self._service({'teachers_may_change_xp': bad})

    def test_absent_leaves_it_alone_and_reads_as_the_default(self):
        out, log = self._service({'title': 'T'})
        assert 'teachers_may_change_xp' not in log[0][2]
        assert out['quest']['teachers_may_change_xp'] is True

    def test_the_class_info_route_ignores_it(self):
        """A teacher must not unlock the XP they were locked out of."""
        log = []
        client = _client({'quests': [{'id': QUEST, 'title': 'Old'}]}, log)
        with patch.object(class_quests, '_authorize_editable_quest',
                          return_value=({'id': CLASS}, client, {'id': QUEST}, None)):
            payload, status = _call(class_quests.update_class_quest_info, CLASS, QUEST,
                                    body={'teachers_may_change_xp': True})
        assert status == 400 and payload['error'] == 'Nothing to update'
        assert not log
        assert 'teachers_may_change_xp' not in class_quests._CLASS_QUEST_INFO_FIELDS

    def test_the_class_list_reports_it(self):
        """The class page opens on the saved lock. Null is the default, on."""
        rows = [
            {'quest_id': 'qa', 'sequence_order': 0, 'student_ids': None,
             'quests': {'title': 'A', 'organization_id': ORG, 'teachers_may_change_xp': False}},
            {'quest_id': 'qb', 'sequence_order': 1, 'student_ids': None,
             'quests': {'title': 'B', 'organization_id': ORG, 'teachers_may_change_xp': None}},
        ]
        client = _client({'class_quests': rows}, [])
        with patch.object(class_quests, '_authorize',
                          return_value=({'id': CLASS, 'organization_id': ORG}, client, None)), \
             patch.object(class_quests, '_template_task_count', return_value={}), \
             patch.object(class_quests, '_roster', return_value=[]):
            payload, status = _call(class_quests.list_class_quests, CLASS)
        assert status == 200
        assert {q['quest_id']: q['teachers_may_change_xp'] for q in payload['quests']} == \
            {'qa': False, 'qb': True}
