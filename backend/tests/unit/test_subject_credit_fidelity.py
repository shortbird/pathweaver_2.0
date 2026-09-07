"""The diploma credit a learner is SHOWN is the credit they get.

Two independent defects let a task pay out a subject split the learner never
agreed to. Both silently rewrote transcripts, and both are pinned here.

1. ``persist_accepted_task`` ran a SECOND, independent Gemini classification
   (``classify_task_subjects``) over a task that already carried the subjects
   the personalization wizard had rendered on the accept card. That shadow
   answer landed in ``subject_xp_distribution``, which ``get_subject_xp_
   distribution`` reads FIRST -- so it beat the learner-visible
   ``diploma_subjects`` at credit time.

2. The ``diploma_subjects`` fallback read its dict values as PERCENTAGES, but
   every current producer writes raw XP amounts. A 200 XP task tagged
   {'Social Studies': 150, 'Financial Literacy': 50} scaled to 300/100, and the
   sum-to-xp_value correction then took the whole 200 XP overflow out of the
   largest subject alone, crediting 100/100.

3. ``PersonalizationService.finalize_personalization`` -- the batch sibling of
   defect 1 -- kept its own unconditional ``classify_task_subjects`` call after
   the accept-task path was fixed, so the same shadow answer still reached any
   client using ``POST /finalize-tasks``.

Found 2026-09-05 when a student reconciled his own transcript: three tasks he
accepted as 600 Social Studies paid out 465 Social Studies + 60 Language Arts
+ 75 Financial Literacy. Defect 3 found 2026-09-07 reviewing the same report.
"""

from unittest.mock import MagicMock, patch

import pytest

from routes.tasks.xp_helpers import get_subject_xp_distribution


class TestDiplomaSubjectsAreXpAmounts:
    """Defect 2: the fallback must not read XP amounts as percentages."""

    def test_two_subject_split_is_preserved_exactly(self):
        dist = get_subject_xp_distribution(
            {'diploma_subjects': {'Social Studies': 150, 'Financial Literacy': 50}},
            200,
        )
        assert dist == {'social_studies': 150, 'financial_literacy': 50}

    def test_three_subject_split_is_preserved_exactly(self):
        dist = get_subject_xp_distribution(
            {'diploma_subjects': {'CTE': 125, 'Fine Arts': 50, 'Digital Literacy': 25}},
            200,
        )
        assert dist == {'cte': 125, 'fine_arts': 50, 'digital_literacy': 25}

    def test_legacy_percentages_still_scale_correctly(self):
        """Older rows stored shares summing to 100; weights handle both units."""
        dist = get_subject_xp_distribution(
            {'diploma_subjects': {'Social Studies': 75, 'Math': 25}}, 200
        )
        assert dist == {'social_studies': 150, 'math': 50}

    @pytest.mark.parametrize('xp', [50, 100, 150, 200])
    def test_distribution_always_sums_to_the_task_xp(self, xp):
        dist = get_subject_xp_distribution(
            {'diploma_subjects': {'Social Studies': 175, 'Language Arts': 25}}, xp
        )
        assert sum(dist.values()) == xp

    def test_explicit_distribution_still_wins_over_the_fallback(self):
        dist = get_subject_xp_distribution(
            {
                'subject_xp_distribution': {'math': 100},
                'diploma_subjects': {'Social Studies': 100},
            },
            100,
        )
        assert dist == {'math': 100}


def _persist(task, classifier_result=None):
    """Run persist_accepted_task, returning (inserted row, subject_service)."""
    from routes import quest_personalization as qp

    captured = {}

    def insert(row):
        captured['row'] = row
        chain = MagicMock()
        chain.execute.return_value = MagicMock(data=[row])
        return chain

    supabase = MagicMock()
    supabase.table.return_value.insert.side_effect = insert
    subject_service = MagicMock()
    subject_service.classify_task_subjects.return_value = classifier_result or {}

    with patch.object(qp, 'get_or_create_enrollment', return_value='uq-1'), \
            patch.object(qp, 'get_next_order_index', return_value=0), \
            patch.object(qp, '_class_subject_override', return_value=(None, None)), \
            patch('utils.xp_permissions.resolve_learner_task_xp',
                  return_value=(task.get('xp_value', 100), False)):
        qp.persist_accepted_task(
            supabase, subject_service, 'user-1', 'quest-1', dict(task),
            save_to_library=False, caller_role='student',
        )
    return captured['row'], subject_service


class TestAcceptedCreditIsNotReclassified:
    """Defect 1: an accepted subject split is a promise, not a suggestion."""

    def test_accepted_subjects_are_not_overridden_by_the_classifier(self):
        row, subject_service = _persist(
            {
                'title': 'Argue an Online Free Speech Court Case',
                'pillar': 'civics',
                'xp_value': 200,
                'diploma_subjects': {'Social Studies': 200},
            },
            # What the shadow call used to return, and credit.
            classifier_result={'language_arts': 60, 'social_studies': 140},
        )

        assert row['subject_xp_distribution'] == {'social_studies': 200}
        assert 'language_arts' not in row['subject_xp_distribution']
        subject_service.classify_task_subjects.assert_not_called()

    def test_multi_subject_accepted_split_survives_persistence(self):
        row, _ = _persist(
            {
                'title': 'Audit Gig Worker Security Against Historical Labor Laws',
                'pillar': 'civics',
                'xp_value': 200,
                'diploma_subjects': {'Social Studies': 175, 'Financial Literacy': 25},
            },
            classifier_result={'social_studies': 125, 'financial_literacy': 75},
        )
        assert row['subject_xp_distribution'] == {
            'social_studies': 175,
            'financial_literacy': 25,
        }

    def test_the_two_stored_fields_agree_with_each_other(self):
        """diploma_subjects is displayed; subject_xp_distribution is credited."""
        row, _ = _persist({
            'title': 'Write a Verified Labor Rights Guide',
            'pillar': 'communication',
            'xp_value': 200,
            'diploma_subjects': {'Language Arts': 25, 'Social Studies': 175},
        })
        displayed = get_subject_xp_distribution(
            {'diploma_subjects': row['diploma_subjects']}, row['xp_value']
        )
        assert displayed == row['subject_xp_distribution']

    def test_classifier_still_runs_when_the_task_has_no_subjects(self):
        """The AI fallback is the point of the classifier; keep it for untagged tasks."""
        row, subject_service = _persist(
            {'title': 'Untagged task', 'pillar': 'stem', 'xp_value': 100},
            classifier_result={'math': 100},
        )
        subject_service.classify_task_subjects.assert_called_once()
        assert row['subject_xp_distribution'] == {'math': 100}


def _finalize(tasks, classifier_result=None):
    """Run finalize_personalization, returning (inserted rows, subject_service)."""
    from services.personalization_service import PersonalizationService

    service = PersonalizationService()
    captured = {}

    def table(name):
        chain = MagicMock()
        if name == 'user_quest_tasks':
            def insert(rows):
                captured['rows'] = rows
                inner = MagicMock()
                inner.execute.return_value = MagicMock(
                    data=[dict(r, id=f'task-{i}') for i, r in enumerate(rows)])
                return inner
            chain.insert.side_effect = insert
        return chain

    subject_service = MagicMock()
    subject_service.classify_task_subjects.return_value = classifier_result or {}

    supabase = MagicMock()
    supabase.table.side_effect = table

    library = MagicMock()
    library.sanitize_library.return_value = {'success': True, 'async': True}

    with patch.object(PersonalizationService, 'supabase', supabase), \
            patch('services.subject_classification_service.SubjectClassificationService',
                  return_value=subject_service), \
            patch('services.task_library_service.TaskLibraryService', return_value=library):
        result = service.finalize_personalization(
            session_id='s-1', user_id='user-1', quest_id='quest-1',
            user_quest_id='uq-1', selected_tasks=[dict(t) for t in tasks],
        )
    assert result['success'], result
    return captured['rows'], subject_service


class TestBatchFinalizeIsNotReclassified:
    """Defect 3: the batch path must honor the accepted split like accept-task."""

    def test_accepted_subjects_survive_the_batch_path(self):
        rows, subject_service = _finalize(
            [{
                'title': 'Build a Legal Case Against Monopolies',
                'pillar': 'civics',
                'xp_value': 200,
                'diploma_subjects': {'Social Studies': 200},
            }],
            classifier_result={'language_arts': 60, 'social_studies': 140},
        )
        assert rows[0]['subject_xp_distribution'] == {'social_studies': 200}
        subject_service.classify_task_subjects.assert_not_called()

    def test_batch_path_still_classifies_an_untagged_task(self):
        rows, subject_service = _finalize(
            [{'title': 'Untagged task', 'pillar': 'stem', 'xp_value': 100}],
            classifier_result={'math': 100},
        )
        subject_service.classify_task_subjects.assert_called_once()
        assert rows[0]['subject_xp_distribution'] == {'math': 100}

    def test_the_two_stored_fields_agree_in_the_batch_path(self):
        rows, _ = _finalize([{
            'title': 'Analyze the Historical Value of Paper Money',
            'pillar': 'civics',
            'xp_value': 200,
            'diploma_subjects': {'Social Studies': 150, 'Financial Literacy': 50},
        }])
        displayed = get_subject_xp_distribution(
            {'diploma_subjects': rows[0]['diploma_subjects']}, rows[0]['xp_value']
        )
        assert displayed == rows[0]['subject_xp_distribution']


class TestSubjectLock:
    """A student finishing one credit can demand tasks that pay only into it."""

    def _validate(self, tasks, subjects, strict, level='standard'):
        from services.personalization_service import personalization_service
        return personalization_service._validate_tasks(
            [dict(t) for t in tasks], [], subjects,
            challenge_level=level, strict_subjects=strict,
        )

    TASK = {
        'title': 'Analyze a Museum Exhibit',
        'pillar': 'art',
        'xp_value': 100,
        'diploma_subjects': {'Fine Arts': 50, 'Language Arts': 50},
    }

    def test_unselected_subjects_are_dropped_and_their_xp_reassigned(self):
        out = self._validate([self.TASK], ['fine_arts'], strict=True)
        assert out[0]['diploma_subjects'] == {'Fine Arts': 100}

    def test_xp_total_is_unchanged_by_the_lock(self):
        out = self._validate([self.TASK], ['fine_arts'], strict=True)
        assert sum(out[0]['diploma_subjects'].values()) == out[0]['xp_value']

    def test_a_task_ignoring_the_lock_entirely_goes_to_the_first_selection(self):
        """The prompt asks; the clamp is what makes it true."""
        out = self._validate(
            [{'title': 'Off-target', 'pillar': 'stem', 'xp_value': 100,
              'diploma_subjects': {'Math': 75, 'Science': 25}}],
            ['fine_arts'], strict=True,
        )
        assert out[0]['diploma_subjects'] == {'Fine Arts': 100}

    def test_several_selected_subjects_are_all_allowed(self):
        out = self._validate([self.TASK], ['fine_arts', 'language_arts'], strict=True)
        assert out[0]['diploma_subjects'] == {'Fine Arts': 50, 'Language Arts': 50}

    def test_without_the_lock_the_mixed_split_is_left_alone(self):
        out = self._validate([self.TASK], ['fine_arts'], strict=False)
        assert out[0]['diploma_subjects'] == {'Fine Arts': 50, 'Language Arts': 50}

    def test_lock_composes_with_the_challenge_flat_rate(self):
        out = self._validate([self.TASK], ['fine_arts'], strict=True, level='challenge')
        assert out[0]['xp_value'] == 200
        assert out[0]['diploma_subjects'] == {'Fine Arts': 200}

    def test_a_strict_batch_never_reuses_a_loose_cached_batch(self):
        from services.personalization_service import TaskCacheService
        cache = TaskCacheService()
        loose = cache.build_cache_key(['museums'], ['fine_arts'])
        strict = cache.build_cache_key(['museums'], ['fine_arts'], strict_subjects=True)
        assert loose != strict


class TestClassQuestsGenerateWhatTheyStore:
    """A class already forces 100% of every task into its transcript_subject.

    ``_class_subject_override`` applies that at persist time, but generation
    still produced mixed-subject cards -- so the accept card showed a split
    ("Social Studies 150 / Financial Literacy 50") that persistence then threw
    away. Harmless to the transcript, dishonest on screen, and the same
    shown-is-not-stored gap as the defects above. Class generation is now
    locked to the class subject, so the card matches the row.
    """

    # 150 is the Standard ceiling; a 200 here would be clamped and then rescaled,
    # which is correct but tests the challenge-level band rather than the lock.
    def _locked_split(self, transcript_subject, ai_split, xp=150):
        from services.personalization_service import personalization_service
        out = personalization_service._validate_tasks(
            [{'title': 'A task', 'pillar': 'civics', 'xp_value': xp,
              'diploma_subjects': dict(ai_split)}],
            [], [transcript_subject],
            challenge_level='standard', strict_subjects=True,
        )
        return out[0]

    def test_a_class_task_pays_only_the_class_subject(self):
        task = self._locked_split(
            'social_studies',
            {'Social Studies': 100, 'Financial Literacy': 50},
        )
        assert task['diploma_subjects'] == {'Social Studies': 150}

    def test_the_card_and_the_stored_row_agree(self):
        """What persist_accepted_task would store, vs what the card renders."""
        from routes.quest_personalization import _class_subject_override
        from unittest.mock import MagicMock

        task = self._locked_split('fine_arts', {'Fine Arts': 75, 'Language Arts': 75})

        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value \
            .single.return_value.execute.return_value = MagicMock(
                data={'quest_type': 'class', 'transcript_subject': 'fine_arts'})
        _, class_sxd = _class_subject_override(supabase, 'q-1', task['xp_value'])

        shown = get_subject_xp_distribution(
            {'diploma_subjects': task['diploma_subjects']}, task['xp_value'])
        assert shown == class_sxd
