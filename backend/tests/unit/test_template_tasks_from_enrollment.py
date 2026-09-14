"""
A quest's page and its enroll button must agree on whether it has tasks, and
a teacher's own task list must be something students can be given.

Apogee Odessa, 2026-09-14. An org admin created six quests, picked each one
up, took the AI paths she liked and added more from the wizard. The quest
page then listed those tasks under "Quest Tasks" for anyone not enrolled --
because get_template_tasks() fell back to quest_sample_tasks, the AI task
library, which is where the wizard files every accepted suggestion. But the
enroll endpoint counts quest_template_tasks only, found zero, and sent her
student to the build-your-own wizard. "Those steps don't follow, and it
prompts me to generate new tasks."

Two fixes, both guarded here:

  * the library is never the quest's task list (test_get_template_tasks_*);
  * one POST turns the caller's enrollment into the quest's template, in the
    shape the template editor saves (the rest).
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import app  # noqa: F401 — import graph ordering

from routes.admin.course_quest_management import (
    _deny_unless_may_edit_quest,
    _prepare_template_tasks,
    template_tasks_from_my_tasks,
)
from routes.quest_types import _get_legacy_tasks, get_template_tasks
from utils.template_from_enrollment import enrollment_tasks_as_template

QUEST = '206da6b5-09b5-4686-8750-235460550e04'
ADMIN = 'cc8f3996-1c07-41b2-9bfe-404e3ae8ce69'
ORG = '4ec5967d-ea3c-4e9e-bb1d-17519c26ecb9'
ENROLLMENT = 'e2427509-8870-45a2-97d7-e44a82addcde'


# --------------------------------------------------------------------------
# The library is not the quest's task list
# --------------------------------------------------------------------------

def _admin_client_with_tables(rows_by_table):
    admin = MagicMock()
    touched = []

    def table(name):
        touched.append(name)
        chain = MagicMock()
        for m in ('select', 'eq', 'order'):
            getattr(chain, m).return_value = chain
        chain.execute.return_value = SimpleNamespace(data=rows_by_table.get(name, []))
        return chain

    admin.table.side_effect = table
    return admin, touched


class TestGetTemplateTasksIgnoresTheLibrary:
    def test_no_authored_tasks_means_no_tasks_even_with_library_rows(self):
        admin, touched = _admin_client_with_tables({
            'quest_sample_tasks': [{'id': 's1', 'title': 'Make Paintbrushes from Twigs'}],
        })
        with patch('routes.quest_types.get_supabase_admin_client', return_value=admin), \
             patch('routes.quest_types.QuestTemplateTaskRepository') as repo:
            repo.return_value.get_template_tasks.return_value = []
            assert get_template_tasks(QUEST, filter_type='all') == []
        assert 'quest_sample_tasks' not in touched

    def test_legacy_course_tasks_still_count_as_required(self):
        admin, _ = _admin_client_with_tables({
            'course_quest_tasks': [{'id': 'c1', 'title': 'Unit 1', 'order_index': 0}],
        })
        with patch('routes.quest_types.get_supabase_admin_client', return_value=admin):
            tasks = _get_legacy_tasks(QUEST, 'all')
        assert [t['id'] for t in tasks] == ['c1']
        assert tasks[0]['is_required'] is True

    def test_optional_filter_has_nothing_legacy_to_offer(self):
        admin, touched = _admin_client_with_tables({
            'quest_sample_tasks': [{'id': 's1'}],
        })
        with patch('routes.quest_types.get_supabase_admin_client', return_value=admin):
            assert _get_legacy_tasks(QUEST, 'optional') == []
        assert touched == []


# --------------------------------------------------------------------------
# Enrollment rows -> template payload
# --------------------------------------------------------------------------

def _row(title, *, order_index, created_at='2026-09-13T16:21:28Z', pillar='art',
         xp=75, subjects=None, split=None, status='approved'):
    return {
        'id': title.lower().replace(' ', '-'),
        'title': title,
        'description': f'{title} description',
        'pillar': pillar,
        'xp_value': xp,
        'order_index': order_index,
        'created_at': created_at,
        'approval_status': status,
        'diploma_subjects': subjects,
        'subject_xp_distribution': split,
        'is_required': False,
    }


class TestEnrollmentTasksAsTemplate:
    def test_keeps_the_order_the_teacher_sees_and_renumbers(self):
        rows = [
            _row('Third', order_index=9),
            _row('First', order_index=0),
            _row('Second', order_index=1),
        ]
        out = enrollment_tasks_as_template(rows)
        assert [t['title'] for t in out] == ['First', 'Second', 'Third']
        assert [t['order_index'] for t in out] == [0, 1, 2]

    def test_rows_sharing_an_order_index_fall_back_to_creation_time(self):
        rows = [
            _row('Later', order_index=0, created_at='2026-09-13T16:23:00Z'),
            _row('Earlier', order_index=0, created_at='2026-09-13T16:21:00Z'),
        ]
        assert [t['title'] for t in enrollment_tasks_as_template(rows)] == ['Earlier', 'Later']

    def test_wizard_shape_display_name_dict_becomes_keys_and_split(self):
        """{'Fine Arts': 75} + {'fine_arts': 75} is what the wizard writes."""
        row = _row('Press Nature Shapes into Clay Stamps', order_index=4,
                   subjects={'Fine Arts': 75}, split={'fine_arts': 75})
        (out,) = enrollment_tasks_as_template([row])
        assert out['diploma_subjects'] == ['fine_arts']
        assert out['subject_xp_distribution'] == {'fine_arts': 75}

    def test_two_subject_split_survives(self):
        row = _row('Make Natural Paint', order_index=5, pillar='stem',
                   subjects={'Science': 25, 'Fine Arts': 50},
                   split={'science': 25, 'fine_arts': 50})
        (out,) = enrollment_tasks_as_template([row])
        assert out['subject_xp_distribution'] == {'science': 25, 'fine_arts': 50}
        assert sorted(out['diploma_subjects']) == ['fine_arts', 'science']

    def test_path_shape_list_with_no_split_shares_xp_across_the_named_subjects(self):
        """['Electives'] + {} is what an AI path writes: the subject is named
        but the XP is not split. Split it the way the editor does on load."""
        row = _row('Collect natural materials', order_index=0, pillar='stem',
                   xp=60, subjects=['Electives'], split={})
        (out,) = enrollment_tasks_as_template([row])
        assert out['diploma_subjects'] == ['electives']
        assert out['subject_xp_distribution'] == {'electives': 60}

    def test_uneven_split_puts_the_remainder_on_the_first_subject(self):
        row = _row('T', order_index=0, xp=75, subjects=['math', 'science'], split=None)
        (out,) = enrollment_tasks_as_template([row])
        assert out['subject_xp_distribution'] == {'math': 38, 'science': 37}

    def test_nothing_named_leaves_the_split_empty_for_the_classifier(self):
        row = _row('T', order_index=0, subjects=None, split=None)
        (out,) = enrollment_tasks_as_template([row])
        assert out['diploma_subjects'] == []
        assert out['subject_xp_distribution'] == {}

    def test_unrecognised_subject_names_are_dropped_not_guessed(self):
        row = _row('T', order_index=0, subjects=['Underwater Basketweaving', 'Math'], split=None)
        (out,) = enrollment_tasks_as_template([row])
        assert out['diploma_subjects'] == ['math']

    def test_pending_and_untitled_rows_are_not_handed_to_students(self):
        rows = [
            _row('Approved', order_index=0),
            _row('Waiting', order_index=1, status='pending'),
            {**_row('Blank', order_index=2), 'title': ''},
        ]
        assert [t['title'] for t in enrollment_tasks_as_template(rows)] == ['Approved']

    def test_empty_in_empty_out(self):
        assert enrollment_tasks_as_template([]) == []
        assert enrollment_tasks_as_template(None) == []


class TestPrepareTemplateTasks:
    def test_subject_list_follows_the_classifier_when_none_was_named(self):
        with patch('routes.admin.course_quest_management.get_subject_service') as svc:
            svc.return_value.classify_task_subjects.return_value = {'science': 60}
            (out,) = _prepare_template_tasks([{
                'title': 'Collect natural materials', 'pillar': 'stem', 'xp_value': 60,
                'diploma_subjects': [], 'subject_xp_distribution': {},
            }])
        assert out['subject_xp_distribution'] == {'science': 60}
        assert out['diploma_subjects'] == ['science']

    def test_a_named_split_is_not_reclassified(self):
        with patch('routes.admin.course_quest_management.get_subject_service') as svc:
            (out,) = _prepare_template_tasks([{
                'title': 'T', 'pillar': 'art', 'xp_value': 75,
                'diploma_subjects': ['fine_arts'], 'subject_xp_distribution': {'fine_arts': 75},
            }])
        svc.assert_not_called()
        assert out['diploma_subjects'] == ['fine_arts']

    def test_none_description_does_not_crash(self):
        (out,) = _prepare_template_tasks([{
            'title': 'T', 'pillar': 'art', 'xp_value': 75, 'description': None,
            'diploma_subjects': ['fine_arts'], 'subject_xp_distribution': {'fine_arts': 75},
        }])
        assert out['description'] == ''


# --------------------------------------------------------------------------
# The endpoint
# --------------------------------------------------------------------------

def _supabase_for_access(quest_org, user_org, role='org_managed', org_role='org_admin'):
    admin = MagicMock()

    def table(name):
        chain = MagicMock()
        for m in ('select', 'eq', 'single'):
            getattr(chain, m).return_value = chain
        if name == 'quests':
            chain.execute.return_value = SimpleNamespace(
                data={'organization_id': quest_org} if quest_org != 'missing' else None)
        elif name == 'users':
            chain.execute.return_value = SimpleNamespace(
                data={'organization_id': user_org, 'role': role, 'org_role': org_role})
        return chain

    admin.table.side_effect = table
    return admin


class TestDenyUnlessMayEditQuest:
    def test_org_admin_on_own_org_quest_is_allowed(self):
        with app.app.test_request_context():
            assert _deny_unless_may_edit_quest(_supabase_for_access(ORG, ORG), ADMIN, QUEST) is None

    def test_other_orgs_quest_is_denied(self):
        with app.app.test_request_context():
            resp, status = _deny_unless_may_edit_quest(_supabase_for_access('other-org', ORG), ADMIN, QUEST)
        assert status == 403

    def test_global_quest_is_denied_to_org_staff(self):
        """IDOR-H8: NULL-org content is Optio's, not the org's."""
        with app.app.test_request_context():
            resp, status = _deny_unless_may_edit_quest(_supabase_for_access(None, ORG), ADMIN, QUEST)
        assert status == 403

    def test_missing_quest_is_404(self):
        with app.app.test_request_context():
            resp, status = _deny_unless_may_edit_quest(_supabase_for_access('missing', ORG), ADMIN, QUEST)
        assert status == 404


def _call_endpoint(*, template_total, enrollments, my_tasks):
    """Run the undecorated view with the repositories stubbed."""
    view = template_tasks_from_my_tasks.__wrapped__
    saved = {}

    def save(supabase, quest_id, tasks_data):
        saved['quest_id'] = quest_id
        saved['tasks'] = tasks_data
        return [{'id': f'tmpl-{i}', **t} for i, t in enumerate(tasks_data)], {'inserted': 1}

    with app.app.test_request_context(), \
         patch('routes.admin.course_quest_management.get_supabase_admin_client',
               return_value=_supabase_for_access(ORG, ORG)), \
         patch('repositories.quest_template_task_repository.QuestTemplateTaskRepository') as tmpl_repo, \
         patch('repositories.quest_repository.QuestRepository') as quest_repo, \
         patch('repositories.task_repository.TaskRepository') as task_repo, \
         patch('routes.admin.course_quest_management._save_template_tasks', side_effect=save), \
         patch('routes.admin.course_quest_management.get_subject_service') as svc:
        svc.return_value.classify_task_subjects.return_value = {'fine_arts': 75}
        tmpl_repo.return_value.get_quest_task_summary.return_value = {'total_tasks': template_total}
        quest_repo.return_value.get_user_enrollments.return_value = enrollments
        task_repo.return_value.find_by_quest.return_value = my_tasks
        result = view(ADMIN, QUEST)
    if isinstance(result, tuple):
        resp, status = result
    else:
        resp, status = result, 200
    return status, resp.get_json(), saved


class TestTemplateTasksFromMyTasks:
    def test_promotes_the_callers_active_enrollment_and_resyncs(self):
        mine = [
            _row('Make Paintbrushes from Twigs and Plants', order_index=3,
                 subjects={'Fine Arts': 75}, split={'fine_arts': 75}),
            _row('Collect natural materials', order_index=0, pillar='stem', xp=60,
                 subjects=['Electives'], split={}),
        ]
        for r in mine:
            r['user_quest_id'] = ENROLLMENT
        status, body, saved = _call_endpoint(
            template_total=0,
            enrollments=[{'id': ENROLLMENT, 'quest_id': QUEST, 'is_active': True}],
            my_tasks=mine,
        )
        assert status == 200, body
        assert body['success'] is True
        assert body['total'] == 2
        assert body['resynced'] == {'inserted': 1}
        assert saved['quest_id'] == QUEST
        assert [t['title'] for t in saved['tasks']] == [
            'Collect natural materials', 'Make Paintbrushes from Twigs and Plants']
        assert saved['tasks'][0]['subject_xp_distribution'] == {'electives': 60}
        assert saved['tasks'][1]['diploma_subjects'] == ['fine_arts']

    def test_tasks_from_an_old_enrollment_on_the_same_quest_are_not_included(self):
        current = _row('Current', order_index=0)
        current['user_quest_id'] = ENROLLMENT
        stale = _row('From last year', order_index=0)
        stale['user_quest_id'] = 'old-enrollment'
        status, body, saved = _call_endpoint(
            template_total=0,
            enrollments=[{'id': ENROLLMENT, 'quest_id': QUEST, 'is_active': True}],
            my_tasks=[stale, current],
        )
        assert status == 200
        assert [t['title'] for t in saved['tasks']] == ['Current']

    def test_refuses_when_the_quest_already_has_a_template(self):
        status, body, saved = _call_endpoint(
            template_total=3,
            enrollments=[{'id': ENROLLMENT, 'quest_id': QUEST, 'is_active': True}],
            my_tasks=[_row('T', order_index=0)],
        )
        assert status == 409
        assert saved == {}

    def test_refuses_when_the_caller_has_nothing_to_give(self):
        status, body, saved = _call_endpoint(
            template_total=0,
            enrollments=[],
            my_tasks=[],
        )
        assert status == 400
        assert saved == {}
