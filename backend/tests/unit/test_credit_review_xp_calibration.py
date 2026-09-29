"""Tuning the AI credit reviewer's XP without a deploy.

The scale is a prompt component and the worked examples are rows; both are
edited in the grader's Tune AI XP popup and read on every review. These tests hold the
two places that made that promise false or unsafe.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest


def _db(rows):
    q = MagicMock()
    for m in ('select', 'eq', 'limit', 'order'):
        getattr(q, m).return_value = q
    q.execute.return_value.data = rows
    client = MagicMock()
    client.table.return_value = q
    return client


@pytest.mark.unit
class TestAnEditedScaleIsRead:
    def test_the_database_row_wins_over_the_default(self, monkeypatch):
        """The read used `.maybeSingle()`, a JavaScript client method. In Python
        it raised, the except swallowed it, and every edit was ignored."""
        from services import prompt_management_service as pms

        monkeypatch.setattr(pms, 'get_supabase_admin_client', lambda: _db([
            {'name': 'CREDIT_REVIEW_XP_GUIDE', 'content': '- 25: my own scale'}]))
        component = pms.PromptManagementService().get_component('CREDIT_REVIEW_XP_GUIDE')
        assert component['content'] == '- 25: my own scale'
        assert component['source'] == 'database'
        assert component['has_modifications'] is True

    def test_no_row_means_the_default(self, monkeypatch):
        from prompts.credit_review_xp import CREDIT_REVIEW_XP_GUIDE
        from services import prompt_management_service as pms

        monkeypatch.setattr(pms, 'get_supabase_admin_client', lambda: _db([]))
        content = pms.PromptManagementService().get_component_content('CREDIT_REVIEW_XP_GUIDE')
        assert content == CREDIT_REVIEW_XP_GUIDE


@pytest.mark.unit
class TestExampleValidation:
    def _clean(self, app, data, partial=False):
        from routes.credit_dashboard.xp_calibration import _clean_example
        with app.test_request_context():
            changes, error = _clean_example(data, partial=partial)
        return changes, (error[1] if error else None)

    def test_a_good_example_is_tidied(self, app):
        changes, status = self._clean(app, {'work': '  Two-sentence\n discussion  post ',
                                            'xp': '25', 'note': ' short '})
        assert status is None
        assert changes == {'work': 'Two-sentence discussion post', 'xp': 25, 'note': 'short'}

    @pytest.mark.parametrize('data', [
        {'work': 'ab', 'xp': 25},
        {'work': 'A poem', 'xp': 'lots'},
        {'work': 'A poem', 'xp': 10},
        {'work': 'A poem'},
        {'work': 'x' * 301, 'xp': 25},
    ])
    def test_a_bad_example_is_refused(self, app, data):
        _, status = self._clean(app, data)
        assert status == 400

    def test_a_partial_edit_touches_only_what_it_names(self, app):
        changes, status = self._clean(app, {'status': 'paused'}, partial=True)
        assert status is None
        assert changes == {'status': 'paused'}

    def test_a_suggestion_cannot_be_set_back_to_suggested(self, app):
        _, status = self._clean(app, {'status': 'suggested'}, partial=True)
        assert status == 400

    @pytest.mark.parametrize('xp', [30, 60, 125, 250])
    def test_only_task_sizes_are_accepted(self, app, xp):
        _, status = self._clean(app, {'work': 'A poem', 'xp': xp})
        assert status == 400

    def test_subjects_are_stored_as_percentages(self, app):
        changes, status = self._clean(app, {'work': 'A poem', 'xp': 50,
                                            'subjects': {'language_arts': 30, 'fine_arts': 20}})
        assert status is None
        assert changes['subjects'] == {'language_arts': 60, 'fine_arts': 40}


@pytest.mark.unit
class TestSubjectMix:
    def test_amounts_become_percentages_that_sum_to_100(self):
        from services.credit_ai_review.subject_mix import to_percent
        out = to_percent({'math': 25, 'science': 25, 'electives': 25})
        assert sum(out.values()) == 100
        assert set(out) == {'math', 'science', 'electives'}

    def test_the_models_list_shape_and_junk_are_handled(self):
        from services.credit_ai_review.subject_mix import to_percent
        assert to_percent([{'subject': 'math', 'percent': 70},
                           {'subject': 'basket_weaving', 'percent': 30}]) == {'math': 100}
        assert to_percent('math') == {}
        assert to_percent({'math': -5}) == {}

    def test_rounding_noise_is_not_a_difference(self):
        from services.credit_ai_review.subject_mix import differs
        assert not differs({'math': 67, 'science': 33}, {'math': 60, 'science': 40})
        assert differs({'math': 100}, {'math': 50, 'science': 50})

    @pytest.mark.parametrize('value, ceiling, expected', [
        (60, 200, 50), (63, 200, 75), (130, 150, 150), (180, 150, 150),
        (10, 100, 25), (100, 20, None),
    ])
    def test_snap_down_stays_on_the_scale_and_under_the_claim(self, value, ceiling, expected):
        from services.credit_ai_review.subject_mix import snap_xp_down
        assert snap_xp_down(value, ceiling) == expected


def _capture(monkeypatch, *, review, final_xp, approved, task=None, exists=False):
    """Run capture_from_approval against a stubbed AI review and repository."""
    from services.credit_ai_review import calibration_capture, store
    from repositories import credit_review_xp_example_repository as repo_mod

    monkeypatch.setattr(store, 'latest_for_completions', lambda admin, ids: {
        'c-1': {'status': 'complete', 'review': review}} if review is not None else {})
    added = []
    monkeypatch.setattr(repo_mod.CreditReviewXpExampleRepository, 'exists_for_completion',
                        lambda self, cid: exists)
    monkeypatch.setattr(repo_mod.CreditReviewXpExampleRepository, 'add',
                        lambda self, **kw: added.append(kw) or kw)
    calibration_capture.capture_from_approval(
        MagicMock(), completion_id='c-1',
        task=task or {'title': 'Discussion post', 'xp_value': final_xp,
                      'subject_xp_distribution': {'language_arts': final_xp}},
        final_xp=final_xp, approved_subjects=approved, reviewer_id='r-1')
    return added


@pytest.mark.unit
class TestSuggestedExamples:
    REVIEW = {'xp': {'recommended': 100}, 'subjects': {'language_arts': 100},
              'work': 'a two-sentence comment in an online discussion'}

    def test_a_different_xp_queues_a_suggestion(self, monkeypatch):
        added = _capture(monkeypatch, review=self.REVIEW, final_xp=25,
                         approved={'language_arts': 25})
        assert len(added) == 1
        row = added[0]
        assert row['status'] == 'suggested'
        assert row['xp'] == 25 and row['ai_xp'] == 100
        assert row['work'] == 'a two-sentence comment in an online discussion'
        assert row['subjects'] == {'language_arts': 100}
        assert row['completion_id'] == 'c-1'

    def test_a_different_subject_split_queues_a_suggestion(self, monkeypatch):
        added = _capture(monkeypatch, review=self.REVIEW, final_xp=100,
                         approved={'language_arts': 50, 'social_studies': 50})
        assert len(added) == 1
        assert added[0]['subjects'] == {'language_arts': 50, 'social_studies': 50}
        assert added[0]['ai_subjects'] == {'language_arts': 100}

    def test_agreement_queues_nothing(self, monkeypatch):
        assert _capture(monkeypatch, review=self.REVIEW, final_xp=100,
                        approved={'language_arts': 100}) == []

    def test_no_ai_review_queues_nothing(self, monkeypatch):
        assert _capture(monkeypatch, review=None, final_xp=25,
                        approved={'language_arts': 25}) == []

    def test_a_hand_saved_example_is_not_duplicated(self, monkeypatch):
        assert _capture(monkeypatch, review=self.REVIEW, final_xp=25,
                        approved={'language_arts': 25}, exists=True) == []

    def test_an_older_review_is_compared_with_the_task_split(self, monkeypatch):
        """Reviews before 2026-09-29 carry no subjects; the grader showed the task's."""
        review = {'xp': {'recommended': 100}}
        added = _capture(monkeypatch, review=review, final_xp=100,
                         approved={'math': 100},
                         task={'title': 'Budget worksheet', 'xp_value': 100,
                               'subject_xp_distribution': {'financial_literacy': 100}})
        assert len(added) == 1
        assert added[0]['work'] == 'Budget worksheet'
        assert added[0]['ai_subjects'] == {'financial_literacy': 100}

    def test_a_failure_never_reaches_the_approval(self, monkeypatch):
        from services.credit_ai_review import calibration_capture, store

        def boom(*a, **k):
            raise RuntimeError('db down')
        monkeypatch.setattr(store, 'latest_for_completions', boom)
        assert calibration_capture.capture_from_approval(
            MagicMock(), completion_id='c-1', task={}, final_xp=25,
            approved_subjects={}, reviewer_id='r-1') is None


@pytest.mark.unit
class TestReviewerAwardsATaskSize:
    def _apply(self, app, xp_value, current=100):
        from routes.credit_dashboard.reviewer_xp import apply_reviewer_xp
        with app.test_request_context():
            return apply_reviewer_xp(MagicMock(), {'xp_value': xp_value},
                                     completion={'id': 'c-1'}, task={'id': 't-1', 'xp_value': current},
                                     student_id='s-1', reviewer_id='r-1')

    @pytest.mark.parametrize('xp', [60, 95, 125, 300])
    def test_an_off_scale_award_is_refused(self, app, xp):
        result, error = self._apply(app, xp)
        assert result is None
        assert error[1] == 400

    def test_keeping_a_legacy_off_scale_claim_is_not_a_change(self, app):
        assert self._apply(app, 120, current=120) == (None, None)
