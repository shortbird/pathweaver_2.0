"""
The curriculum quest round trip.

iCreate, 2026-07-31: "I like the idea of quests in here, but I'm wondering if we
can add the ability to add an in-house course that is tied to the curriculum.
That way we don't have to start anew with the quests every year? And maybe some
teachers want to fill it in in advance."

`class_quests` hangs off a section — this year's Tuesday 10:30 Reading Workshop.
Next year's section is a different row, so it starts empty. `sis_curriculum` is
the durable thing (one entry already backs four sections), so the reusable set
lives there and sections copy from it.

The behaviours worth pinning down are the ones that would quietly lose a
teacher's work: the copy must be additive (never clobber a section's own dates),
idempotent (a second click does nothing), and it must re-check every saved quest
at copy time, because a curriculum outlives the quests it names.
"""

from unittest.mock import Mock, patch

import pytest

from routes.sis import class_quests


ORG = 'org-1'


def _quest(qid, org=ORG, public=False, active=True):
    return {'id': qid, 'organization_id': org, 'is_public': public, 'is_active': active}


@pytest.mark.unit
class TestWhichSavedQuestsSurviveTheCopy:
    """_assignable is the re-check. A curriculum can name a quest that has since
    been deleted, archived, or that belongs to another school."""

    def _run(self, ids, quests):
        admin = Mock()
        t = Mock()
        t.select.return_value = t
        t.in_.return_value = t
        t.execute.return_value = Mock(data=quests)
        admin.table.return_value = t
        return class_quests._assignable(admin, ids, ORG)

    def test_the_schools_own_quest_copies(self):
        assert self._run(['q1'], [_quest('q1')]) == ['q1']

    def test_a_public_optio_library_quest_copies(self):
        assert self._run(['q1'], [_quest('q1', org=None, public=True)]) == ['q1']

    def test_another_schools_quest_does_not(self):
        assert self._run(['q1'], [_quest('q1', org='org-2')]) == []

    def test_a_private_global_quest_does_not(self):
        assert self._run(['q1'], [_quest('q1', org=None, public=False)]) == []

    def test_an_archived_quest_does_not(self):
        assert self._run(['q1'], [_quest('q1', active=False)]) == []

    def test_a_quest_deleted_since_it_was_saved_is_simply_dropped(self):
        """The row is gone from `quests` entirely — this must not raise."""
        assert self._run(['q1', 'gone'], [_quest('q1')]) == ['q1']

    def test_the_saved_order_is_preserved(self):
        out = self._run(['q3', 'q1', 'q2'],
                        [_quest('q1'), _quest('q2'), _quest('q3')])
        assert out == ['q3', 'q1', 'q2']

    def test_nothing_saved_means_nothing_to_check(self):
        admin = Mock()
        assert class_quests._assignable(admin, [], ORG) == []
        admin.table.assert_not_called()


@pytest.mark.unit
class TestAssistantsCanManageTheirClassQuests:
    """An assistant now sees the class in their portal, so they must not be
    handed a Quests tab where every button 403s."""

    def _mod(self, class_row, user='kate'):
        admin = Mock()
        t = Mock()
        for chained in ('select', 'eq', 'limit'):
            getattr(t, chained).return_value = t
        t.execute.return_value = Mock(data=[])
        admin.table.return_value = t
        with patch('routes.sis.class_quests.sis_service.caller_is_admin', return_value=False):
            return class_quests._is_moderator(user, class_row, admin)

    def test_a_named_assistant_is_a_moderator(self):
        assert self._mod({'id': 'c1', 'organization_id': ORG,
                          'primary_instructor_id': 'nate',
                          'assistant_instructor_ids': ['kate']})

    def test_the_primary_teacher_still_is(self):
        assert self._mod({'id': 'c1', 'organization_id': ORG,
                          'primary_instructor_id': 'kate',
                          'assistant_instructor_ids': []})

    def test_someone_unconnected_is_not(self):
        assert not self._mod({'id': 'c1', 'organization_id': ORG,
                              'primary_instructor_id': 'nate',
                              'assistant_instructor_ids': ['jules']})

    def test_a_class_with_no_assistants_at_all_does_not_crash(self):
        assert not self._mod({'id': 'c1', 'organization_id': ORG,
                              'primary_instructor_id': 'nate',
                              'assistant_instructor_ids': None})
