"""
A SIS preset task carries the diploma subjects its work earns credit toward.

Until 2026-09-09 it carried none. The class and curriculum task editors wrote
`pillar` and `xp_value` and nothing else, and both task tables DEFAULT
diploma_subjects to ['Electives'] -- so every task a school typed in was
credited as an elective whatever it actually was. Gryffin found it by asking a
different question ("how do we give them credit for multiple subjects?"): their
US History unit, their Latin unit and their Earth Science unit were all filed
under Electives, along with 1041 XP of one student's pending credit.

These tests pin the three things that made it silent:
  - a task written with no subject falls back to its PILLAR, never to Electives
  - a duplicated task keeps the subjects of the task it copied
  - an XP change rescales the split, so shown credit and paid credit agree
"""
from unittest.mock import MagicMock

import pytest

from services.sis_quest_authoring import (
    DEFAULT_XP,
    MAX_SUBJECTS,
    _copy_task_fields,
    clean_subjects,
    clean_task,
    subject_updates,
)
from utils.school_subjects import default_subjects_for_pillar
from utils.template_tasks import subjects_for_copy


class TestDefaultsComeFromThePillar:
    """The bug itself: no subject must never mean 'Electives'."""

    @pytest.mark.parametrize('pillar,expected', [
        ('civics', 'social_studies'),
        ('communication', 'language_arts'),
        ('art', 'fine_arts'),
        ('wellness', 'health'),
        ('stem', 'science'),
    ])
    def test_each_pillar_has_a_subject(self, pillar, expected):
        assert default_subjects_for_pillar(pillar) == [expected]

    def test_unknown_pillar_falls_back_to_electives(self):
        assert default_subjects_for_pillar('nonsense') == ['electives']
        assert default_subjects_for_pillar(None) == ['electives']

    def test_a_typed_task_with_no_subject_is_not_an_elective(self):
        task = clean_task(
            {'title': 'Read Land of Hope, pages 7-13', 'pillar': 'civics', 'xp_value': 50}, 0)
        assert task['diploma_subjects'] == ['social_studies']
        assert task['subject_xp_distribution'] == {'social_studies': 50}

    def test_the_columns_are_always_written(self):
        """Explicitly, so the table's ['Electives'] default cannot fire."""
        task = clean_task({'title': 'Anything'}, 0)
        assert 'diploma_subjects' in task
        assert 'subject_xp_distribution' in task
        assert task['diploma_subjects'] != ['Electives']


class TestOneTaskAcrossSeveralSubjects:
    """Katie's actual question: an essay about history is both."""

    def test_two_subjects_split_the_xp_evenly(self):
        subjects, split = clean_subjects(
            ['social_studies', 'language_arts'], None, 100, 'civics')
        assert subjects == ['social_studies', 'language_arts']
        assert split == {'social_studies': 50, 'language_arts': 50}

    def test_an_explicit_split_is_kept(self):
        _, split = clean_subjects(
            ['Social Studies', 'Language Arts'],
            {'Social Studies': 150, 'Language Arts': 50}, 200, 'civics')
        assert split == {'social_studies': 150, 'language_arts': 50}

    def test_display_names_normalize_to_keys(self):
        subjects, _ = clean_subjects(['Social Studies'], None, 100, 'art')
        assert subjects == ['social_studies']

    def test_the_parts_always_sum_to_the_task_xp(self):
        """A transcript adds these up, so a split that does not sum is credit
        invented or lost."""
        for xp in (25, 50, 75, 100, 150, 200):
            _, split = clean_subjects(
                ['math', 'science', 'cte'], None, xp, 'stem')
            assert sum(split.values()) == xp, xp

    def test_a_split_that_does_not_sum_is_scaled_by_share(self):
        """By share, not by dumping the difference on the largest entry. That
        correction is right for a rounding remainder and wrong for a rescale:
        it turned a 3:1 split into 19:1."""
        _, split = clean_subjects(
            ['math', 'science'], {'math': 30, 'science': 10}, 200, 'stem')
        assert split == {'math': 150, 'science': 50}

    def test_unknown_subjects_are_dropped_not_stored(self):
        subjects, _ = clean_subjects(['nonsense'], None, 100, 'communication')
        assert subjects == ['language_arts']

    def test_no_more_than_the_cap(self):
        subjects, _ = clean_subjects(
            ['math', 'science', 'health', 'pe', 'cte', 'fine_arts'], None, 300, 'stem')
        assert len(subjects) == MAX_SUBJECTS

    def test_amounts_for_subjects_not_chosen_are_ignored(self):
        """A stale entry for a subject just removed must not keep drawing XP."""
        _, split = clean_subjects(
            ['math'], {'math': 50, 'science': 50}, 100, 'stem')
        assert split == {'math': 100}

    def test_the_ai_drafters_field_name_is_accepted(self):
        task = clean_task({
            'title': 'Write about Winthrop', 'pillar': 'civics', 'xp_value': 100,
            'school_subjects': ['Social Studies', 'Language Arts'],
        }, 0)
        assert task['diploma_subjects'] == ['social_studies', 'language_arts']


class TestEditingATask:
    CURRENT = {
        'xp_value': 100, 'pillar': 'civics',
        'diploma_subjects': ['social_studies'],
        'subject_xp_distribution': {'social_studies': 100},
    }

    def test_an_unrelated_edit_leaves_the_subjects_alone(self):
        assert subject_updates(self.CURRENT, {'title': 'New title'}, {'title': 'New title'}) == {}

    def test_changing_the_xp_rescales_the_split(self):
        """Amounts, not percentages, are stored -- so a 100 XP split on a task
        edited to 200 XP would pay half the credit the task now says."""
        updates = subject_updates(self.CURRENT, {'xp_value': 200}, {'xp_value': 200})
        assert updates['subject_xp_distribution'] == {'social_studies': 200}

    def test_changing_the_xp_keeps_the_ratio(self):
        current = dict(self.CURRENT,
                       diploma_subjects=['social_studies', 'language_arts'],
                       subject_xp_distribution={'social_studies': 75, 'language_arts': 25})
        updates = subject_updates(current, {'xp_value': 200}, {'xp_value': 200})
        assert updates['subject_xp_distribution'] == {'social_studies': 150,
                                                      'language_arts': 50}

    def test_adding_a_subject_gives_it_a_share(self):
        """Not zero. A subject added and left at nothing is dropped on write,
        which looks on screen exactly like one that is earning credit."""
        updates = subject_updates(
            self.CURRENT, {'diploma_subjects': ['social_studies', 'language_arts']}, {})
        assert updates['subject_xp_distribution'] == {'social_studies': 50,
                                                      'language_arts': 50}

    def test_changing_only_the_split_keeps_the_subjects(self):
        current = dict(self.CURRENT,
                       diploma_subjects=['social_studies', 'language_arts'],
                       subject_xp_distribution={'social_studies': 50, 'language_arts': 50})
        updates = subject_updates(
            current,
            {'subject_xp_distribution': {'social_studies': 75, 'language_arts': 25}}, {})
        assert updates['diploma_subjects'] == ['social_studies', 'language_arts']
        assert updates['subject_xp_distribution'] == {'social_studies': 75,
                                                      'language_arts': 25}

    def test_a_task_written_before_this_shipped_is_repaired_on_edit(self):
        current = {'xp_value': 100, 'pillar': 'civics',
                   'diploma_subjects': None, 'subject_xp_distribution': None}
        updates = subject_updates(current, {'xp_value': 150}, {'xp_value': 150})
        assert updates['diploma_subjects'] == ['social_studies']


class TestDuplicatingATask:
    def test_a_copy_keeps_the_subjects(self):
        copy = _copy_task_fields({
            'title': 'Essay', 'pillar': 'civics', 'xp_value': 200,
            'diploma_subjects': ['social_studies', 'language_arts'],
            'subject_xp_distribution': {'social_studies': 150, 'language_arts': 50},
        })
        assert copy['diploma_subjects'] == ['social_studies', 'language_arts']
        assert copy['subject_xp_distribution'] == {'social_studies': 150,
                                                   'language_arts': 50}

    def test_copying_a_task_with_no_subjects_does_not_write_null(self):
        """An explicit NULL skips the column default and reads back as no credit
        at all, which is worse than the wrong credit."""
        copy = _copy_task_fields({
            'title': 'Old task', 'pillar': 'communication', 'xp_value': 50,
            'diploma_subjects': None, 'subject_xp_distribution': None,
        })
        assert copy['diploma_subjects'] == ['language_arts']
        assert copy['subject_xp_distribution'] == {'language_arts': 50}

    def test_a_copy_of_a_task_with_no_xp_still_balances(self):
        copy = _copy_task_fields({'title': 'x', 'pillar': 'stem'})
        assert sum(copy['subject_xp_distribution'].values()) == DEFAULT_XP


class TestCopyingToAStudent:
    """What a learner's credit is actually computed from."""

    def test_a_template_tasks_subjects_reach_the_student(self):
        assert subjects_for_copy({
            'pillar': 'civics',
            'diploma_subjects': ['social_studies', 'language_arts'],
        }) == ['social_studies', 'language_arts']

    @pytest.mark.parametrize('subjects', [None, [], [None]])
    def test_a_template_task_with_no_subjects_uses_its_pillar(self, subjects):
        assert subjects_for_copy(
            {'pillar': 'civics', 'diploma_subjects': subjects}) == ['social_studies']

    def test_the_copy_never_lands_as_electives(self):
        assert subjects_for_copy({'pillar': 'stem'}) != ['Electives']


class TestTheRoutesWriteThem:
    """The columns have to survive the serializer, or the editor cannot show
    what it is about to change."""

    def test_the_class_editor_returns_the_subjects(self):
        from routes.sis.class_quests import _serialize_task
        out = _serialize_task({
            'id': 'a', 'title': 't', 'pillar': 'civics', 'xp_value': 100,
            'diploma_subjects': ['social_studies'],
            'subject_xp_distribution': {'social_studies': 100},
        })
        assert out['diploma_subjects'] == ['social_studies']
        assert out['subject_xp_distribution'] == {'social_studies': 100}

    def test_the_curriculum_editor_returns_the_same_shape(self):
        from routes.sis.class_quests import _serialize_task
        from routes.sis.curriculum import _serialize_template_task
        row = {'id': 'a', 'title': 't', 'pillar': 'civics', 'xp_value': 100,
               'diploma_subjects': ['social_studies'],
               'subject_xp_distribution': {'social_studies': 100}}
        assert set(_serialize_task(row)) == set(_serialize_template_task(row))

    def test_a_null_column_serializes_as_empty_not_null(self):
        from routes.sis.class_quests import _serialize_task
        out = _serialize_task({'id': 'a', 'title': 't', 'pillar': 'civics',
                               'xp_value': 100})
        assert out['diploma_subjects'] == []
        assert out['subject_xp_distribution'] == {}


class TestTheAiDraftCarriesSubjects:
    def test_a_generated_task_names_its_credit(self):
        from services.quest_ai_service import QuestAIService

        service = QuestAIService.__new__(QuestAIService)
        service.gemini_model = MagicMock()
        from utils.school_subjects import (
            SCHOOL_SUBJECTS, SCHOOL_SUBJECT_DISPLAY_NAMES)
        service.school_subjects = SCHOOL_SUBJECTS
        service.school_subject_display_names = SCHOOL_SUBJECT_DISPLAY_NAMES
        service.valid_pillars = ['art', 'stem', 'communication', 'wellness', 'civics']

        draft = service._normalize_quest_draft({
            'title': 'Lesson 2',
            'tasks': [{'title': 'Annotate Winthrop', 'pillar': 'civics',
                       'school_subjects': ['Social Studies', 'Language Arts'],
                       'xp_value': 50}],
        }, 4)
        assert draft['tasks'][0]['diploma_subjects'] == ['social_studies',
                                                         'language_arts']

    def test_a_generated_task_that_named_none_still_gets_one(self):
        from services.quest_ai_service import QuestAIService

        service = QuestAIService.__new__(QuestAIService)
        from utils.school_subjects import (
            SCHOOL_SUBJECTS, SCHOOL_SUBJECT_DISPLAY_NAMES)
        service.school_subjects = SCHOOL_SUBJECTS
        service.school_subject_display_names = SCHOOL_SUBJECT_DISPLAY_NAMES
        service.valid_pillars = ['art', 'stem', 'communication', 'wellness', 'civics']

        draft = service._normalize_quest_draft({
            'tasks': [{'title': 'Read the chapter', 'pillar': 'civics', 'xp_value': 50}],
        }, 4)
        assert draft['tasks'][0]['diploma_subjects']
        assert 'electives' not in draft['tasks'][0]['diploma_subjects']
