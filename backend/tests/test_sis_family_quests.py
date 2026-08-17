"""
Quests a school sets for its families.

iCreate, 2026-08-06: "admin need to be able to create quests for all their
teachers and families. they're doing teacher training through quests and back to
school night with families will be a quest."

The teacher half already worked, so the build was an `audience` on the existing
catalog rather than a parallel table. Two things that follow from that are worth
holding down:

  - every existing row means what it meant. A catalog read with no audience is
    a staff read, because that is what every row was before today.
  - a family quest belongs to the GUARDIAN. Their own account holds it and their
    own progress is reported. Back to school night is not a child's homework,
    and nothing here should touch a student record.
"""

from unittest.mock import Mock, patch

import pytest

import routes.sis.staff_training as training
from services import sis_parent_service as parent


ORG = 'org-1'
GUARDIAN = 'dana'


@pytest.mark.unit
class TestTheAudience:
    def test_it_defaults_to_staff(self):
        """Every row predates the family audience, so a missing or unknown value
        has to keep meaning teacher training."""
        assert training._audience(None) == 'staff'
        assert training._audience('') == 'staff'
        assert training._audience('nonsense') == 'staff'

    def test_family_is_recognised(self):
        assert training._audience('family') == 'family'
        assert training._audience('  FAMILY  ') == 'family'

    def test_students_joined_them(self):
        """iCreate, 2026-08-17: "12+ students and all parents". Students were a
        group the catalog could not name at all."""
        assert training._audience('student') == 'student'
        assert training.AUDIENCES == ('staff', 'family', 'student')

    def test_a_row_can_be_for_several_groups_at_once(self):
        assert training._audiences(['student', 'family']) == ['family', 'student']

    def test_a_row_written_before_the_column_still_means_what_it_meant(self):
        assert training._audiences(None, 'family') == ['family']
        assert training._audiences([], None) == ['staff']


def _quest_row(quest_id='q1', title='Back to school night', active=True):
    return {'quest_id': quest_id, 'category': 'Community', 'is_required': True,
            'sequence_order': 0,
            'quests': {'id': quest_id, 'title': title, 'description': 'Come and meet us',
                       'is_active': active, 'header_image_url': None}}


class _Tables:
    """Answers each table's query with canned rows, ignoring the filters."""

    def __init__(self, rows):
        self.rows = rows
        self.queried = []

    def __call__(self, name):
        self.queried.append(name)
        t = Mock()
        for chained in ('select', 'eq', 'in_', 'contains', 'order', 'limit', 'range'):
            getattr(t, chained).return_value = t
        t.execute.return_value = Mock(data=self.rows.get(name, []))
        return t


def _school_quests(rows, is_member=True):
    tables = _Tables(rows)
    client = Mock()
    client.table.side_effect = tables
    with patch.object(parent, '_is_org_member', return_value=is_member), \
         patch.object(parent, 'get_supabase_admin_client', return_value=client):
        return parent.school_quests(GUARDIAN, ORG), tables


@pytest.mark.unit
class TestWhatAGuardianSees:
    def test_the_school_s_family_quests(self):
        out, _ = _school_quests({'sis_staff_training': [_quest_row()]})
        assert [q['title'] for q in out] == ['Back to school night']

    def test_a_quest_not_yet_started(self):
        out, _ = _school_quests({'sis_staff_training': [_quest_row()]})
        assert out[0]['progress'] == {'started': False, 'completed': False,
                                      'done': 0, 'total': 0}

    def test_progress_comes_from_the_ordinary_quest_tables(self):
        """Not a second bookkeeping system — the same records that drive the
        guardian's own dashboard, so there is nothing to keep in step."""
        out, tables = _school_quests({
            'sis_staff_training': [_quest_row()],
            'user_quests': [{'id': 'uq1', 'quest_id': 'q1', 'completed_at': None}],
            'user_quest_tasks': [{'id': 't1', 'user_quest_id': 'uq1'},
                                 {'id': 't2', 'user_quest_id': 'uq1'}],
            'quest_task_completions': [{'task_id': 't1'}],
        })
        assert out[0]['progress'] == {'started': True, 'completed': False,
                                      'done': 1, 'total': 2}
        assert 'user_quests' in tables.queried

    def test_a_finished_quest_reads_complete(self):
        out, _ = _school_quests({
            'sis_staff_training': [_quest_row()],
            'user_quests': [{'id': 'uq1', 'quest_id': 'q1', 'completed_at': '2026-08-06T00:00:00Z'}],
        })
        assert out[0]['progress']['completed'] is True

    def test_a_deactivated_quest_drops_out(self):
        """A quest deleted or deactivated out from under the catalog must not
        show up as a broken row."""
        out, _ = _school_quests({'sis_staff_training': [_quest_row(active=False)]})
        assert out == []

    def test_a_school_with_none_set_gets_an_empty_list(self):
        out, _ = _school_quests({'sis_staff_training': []})
        assert out == []

    def test_the_list_it_returns_is_the_guardians_own(self):
        """Back to school night is the parent's, not their child's.

        The household IS read now — a quest a school sets for its students has
        no page of its own to enroll them from, so that catch-up runs here, over
        this guardian's children (see catch_up_students). What must not change
        is whose list this is: the rows returned are the guardian's quests and
        the guardian's progress, and nothing a child has done appears in them.
        """
        out, tables = _school_quests({
            'sis_staff_training': [_quest_row()],
            'user_quests': [{'id': 'uq1', 'quest_id': 'q1', 'completed_at': None}],
            'user_quest_tasks': [{'id': 't1', 'user_quest_id': 'uq1'}],
        })
        assert [q['quest_id'] for q in out] == ['q1']
        assert out[0]['progress'] == {'started': True, 'completed': False,
                                      'done': 0, 'total': 1}
        # Nothing about a child's school day belongs in a guardian's quest list.
        assert 'class_enrollments' not in tables.queried
        assert 'quest_task_completions' in tables.queried


@pytest.mark.unit
class TestWhoMayRead:
    def test_somebody_outside_the_school_gets_nothing(self):
        out, _ = _school_quests({'sis_staff_training': [_quest_row()]}, is_member=False)
        assert out is None

    def test_the_route_turns_that_into_a_refusal(self):
        """None means "not your school", which is a 403 and not an empty list —
        an empty list would read as "your school has set nothing"."""
        import routes.sis.parent as parent_routes
        from flask import Flask
        app = Flask(__name__)
        with app.test_request_context('/?organization_id=org-1'), \
             patch.object(parent_routes.parent, 'school_quests', return_value=None):
            resp = parent_routes.my_school_quests.__wrapped__('stranger') \
                if hasattr(parent_routes.my_school_quests, '__wrapped__') \
                else parent_routes.my_school_quests('stranger')
        assert resp[1] == 403
