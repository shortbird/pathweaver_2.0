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

Found 2026-09-05 when a student reconciled his own transcript: three tasks he
accepted as 600 Social Studies paid out 465 Social Studies + 60 Language Arts
+ 75 Financial Literacy.
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
