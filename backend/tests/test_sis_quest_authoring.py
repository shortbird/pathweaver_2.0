"""
Authoring a school's own quest, and drafting one from material it already has.

Two screens now create quests (a class's Quests tab, the curriculum library) off
one helper, and an AI draft can fill either form. What is worth pinning down is
the part a second copy or a bad generation would quietly get wrong: the shape
that reaches the database.

The XP rounding is the sharpest edge. The form's picker steps in 25s, so a
generated 137 would be a value the teacher cannot reproduce or nudge by hand —
it has to land on the same grid the humans are given.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_quest_authoring as authoring
from services.sis_quest_authoring import QuestAuthoringError


def _admin(quest_id='q-new'):
    """A Supabase mock whose quests insert returns one row."""
    admin = Mock()
    table = Mock()
    table.insert.return_value = table
    table.execute.return_value = Mock(data=[{'id': quest_id}])
    admin.table.return_value = table
    return admin, table


@pytest.mark.unit
class TestTheTaskRowsThatReachTheDatabase:
    def test_a_blank_row_is_dropped_not_rejected(self):
        """The form ships with an empty row; saving must not fail on it."""
        assert authoring.clean_task({'title': '   '}, 0) is None

    def test_xp_below_the_floor_is_raised_to_it(self):
        assert authoring.clean_task({'title': 'a', 'xp_value': 5}, 0)['xp_value'] == 25

    def test_junk_xp_falls_back_rather_than_raising(self):
        assert authoring.clean_task({'title': 'a', 'xp_value': 'lots'}, 0)['xp_value'] == 100

    def test_a_friendly_pillar_alias_becomes_the_stored_key(self):
        assert authoring.clean_task({'title': 'a', 'pillar': 'creativity'}, 0)['pillar'] == 'art'

    def test_an_unknown_pillar_does_not_reach_the_column(self):
        """quest_template_tasks.pillar is constrained; an unknown value is a 500."""
        assert authoring.clean_task({'title': 'a', 'pillar': 'wizardry'}, 0)['pillar'] == 'art'

    def test_order_index_follows_the_form_order(self):
        assert authoring.clean_task({'title': 'a'}, 3)['order_index'] == 3


@pytest.mark.unit
class TestCreatingTheQuest:
    def test_a_draft_with_no_title_is_refused_before_anything_is_written(self):
        admin, _ = _admin()
        with pytest.raises(QuestAuthoringError) as e:
            authoring.create_org_quest(admin, org_id='o1', user_id='u1',
                                       title='  ', description='x')
        assert e.value.status == 400
        admin.table.assert_not_called()

    def test_more_tasks_than_the_cap_is_refused(self):
        admin, _ = _admin()
        tasks = [{'title': f't{i}'} for i in range(authoring.MAX_TASKS + 1)]
        with pytest.raises(QuestAuthoringError):
            authoring.create_org_quest(admin, org_id='o1', user_id='u1',
                                       title='T', raw_tasks=tasks, description='')
        admin.table.assert_not_called()

    @patch('services.image_service.search_quest_image', return_value=None)
    def test_the_quest_belongs_to_the_school_and_stays_out_of_the_library(self, _img):
        admin, table = _admin()
        authoring.create_org_quest(admin, org_id='o1', user_id='u1',
                                   title='Watercolor Basics', description='d')
        written = table.insert.call_args_list[0][0][0]
        assert written['organization_id'] == 'o1'
        assert written['is_public'] is False

    @patch('services.image_service.search_quest_image', side_effect=Exception('boom'))
    def test_a_failed_image_lookup_does_not_lose_the_quest(self, _img):
        """The image is decoration; the quest is the work."""
        admin, _ = _admin()
        out = authoring.create_org_quest(admin, org_id='o1', user_id='u1',
                                         title='T', description='')
        assert out['quest_id'] == 'q-new'

    @patch('services.image_service.search_quest_image', return_value=None)
    def test_blank_task_rows_are_not_counted_as_created(self, _img):
        admin, _ = _admin()
        out = authoring.create_org_quest(
            admin, org_id='o1', user_id='u1', title='T', description='',
            raw_tasks=[{'title': 'Real one'}, {'title': ''}])
        assert out['task_count'] == 1


@pytest.mark.unit
class TestTheAiDraftIsForcedIntoTheFormsShape:
    """Whatever the model returns, staff must get something they can edit."""

    def _norm(self, data, count=4):
        from services.quest_ai_service import QuestAIService
        return QuestAIService.__new__(QuestAIService)._normalize_quest_draft.__func__(
            _FakeService(), data, count)

    def test_xp_lands_on_the_pickers_25_step(self):
        out = self._norm({'title': 'T', 'tasks': [{'title': 'a', 'xp_value': 137}]})
        assert out['tasks'][0]['xp_value'] == 125

    def test_xp_below_the_floor_is_raised_to_it(self):
        out = self._norm({'title': 'T', 'tasks': [{'title': 'a', 'xp_value': 5}]})
        assert out['tasks'][0]['xp_value'] == 25

    def test_xp_is_capped_at_the_forms_ceiling(self):
        out = self._norm({'title': 'T', 'tasks': [{'title': 'a', 'xp_value': 9000}]})
        assert out['tasks'][0]['xp_value'] == 150

    def test_an_invented_pillar_is_replaced_with_a_real_one(self):
        out = self._norm({'title': 'T', 'tasks': [{'title': 'a', 'pillar': 'history'}]})
        assert out['tasks'][0]['pillar'] == 'art'

    def test_a_task_with_no_title_is_dropped(self):
        out = self._norm({'title': 'T', 'tasks': [{'title': ''}, {'title': 'ok'}]})
        assert [t['title'] for t in out['tasks']] == ['ok']

    def test_more_tasks_than_asked_for_are_trimmed(self):
        out = self._norm({'title': 'T', 'tasks': [{'title': f't{i}'} for i in range(9)]}, count=3)
        assert len(out['tasks']) == 3

    def test_big_idea_is_accepted_where_description_is_expected(self):
        """Other generators in this service name the field big_idea."""
        out = self._norm({'title': 'T', 'big_idea': 'the point', 'tasks': [{'title': 'a'}]})
        assert out['description'] == 'the point'


class _FakeService:
    """Just the attribute _normalize_quest_draft reads, without booting Gemini."""
    valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
