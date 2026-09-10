"""What we refuse to believe about an AI credit review.

The failure this guards is not "the model is wrong". It is "the model was
confidently wrong and the checklist looked tidy" -- a reviewer working a queue
reads a row of green ticks faster than they read the evidence, which is the whole
point of the feature and also the whole risk of it.

So every test here is about an answer that PARSED FINE and still must not reach a
reviewer as an approval.
"""

from __future__ import annotations

import pytest

from services.credit_ai_review.evidence_loader import EvidencePart, LoadResult
from services.credit_ai_review.normalize import normalize_review, skipped_review

CRITERIA = ['Built the bridge', 'Tested it with weight', 'Wrote what you learned']


def _load(read=(1, 2), skipped=()):
    """A LoadResult with the given block numbers readable and unreadable."""
    result = LoadResult(block_count=len(read) + len(skipped))
    for i in read:
        result.parts.append(EvidencePart(
            block_index=i, item_index=1, block_id=f'b{i}', block_type='image',
            label=f'photo{i}.jpg', source='upload', kind='inline'))
    for i in skipped:
        result.parts.append(EvidencePart(
            block_index=i, item_index=1, block_id=f'b{i}', block_type='document',
            label=f'doc{i}.pdf', source='upload', kind='skipped',
            skip_reason='the file could not be opened'))
    return result


def _answer(**overrides):
    base = {
        'criteria': [
            {'index': 1, 'verdict': 'met', 'evidence_refs': [1], 'note': 'The photo shows it.'},
            {'index': 2, 'verdict': 'met', 'evidence_refs': [2], 'note': 'Weights are visible.'},
            {'index': 3, 'verdict': 'met', 'evidence_refs': [1], 'note': 'They wrote it up.'},
        ],
        'recommendation': 'approve',
        'confidence': 0.9,
        'summary': 'All three criteria are met.',
        'xp': {'recommended': 150, 'proportionate': True, 'rationale': 'Fits the work.'},
        'feedback': {'celebrate': 'You tested it properly.', 'grow_this': 'Add the numbers.'},
        'concerns': [],
    }
    base.update(overrides)
    return base


def _normalize(raw, *, load=None, requested_xp=150, criteria=None):
    return normalize_review(
        raw, criteria=criteria or CRITERIA, criteria_source='success_criteria',
        load=load or _load(), requested_xp=requested_xp)


@pytest.mark.unit
class TestApprovalMustBeConsistent:
    """An approval that contradicts its own working is not an approval."""

    def test_a_clean_approval_survives(self):
        assert _normalize(_answer())['recommendation'] == 'approve'

    def test_approve_alongside_not_met_becomes_needs_human(self):
        raw = _answer()
        raw['criteria'][1]['verdict'] = 'not_met'
        out = _normalize(raw)
        assert out['recommendation'] == 'needs_human'
        assert any('not met' in f for f in out['flags'])

    def test_approve_with_nothing_verified_becomes_needs_human(self):
        raw = _answer()
        for c in raw['criteria']:
            c['verdict'] = 'cannot_verify'
        assert _normalize(raw)['recommendation'] == 'needs_human'

    def test_approve_with_low_confidence_becomes_needs_human(self):
        """The model told us it was guessing. Take it at its word."""
        out = _normalize(_answer(confidence=0.4))
        assert out['recommendation'] == 'needs_human'
        assert any('low confidence' in f for f in out['flags'])

    def test_approve_with_no_readable_evidence_becomes_needs_human(self):
        out = _normalize(_answer(), load=_load(read=(), skipped=(1, 2)))
        assert out['recommendation'] == 'needs_human'

    def test_grow_this_is_left_alone_by_the_guards(self):
        """Only approvals are second-guessed. Returning work needs no defence."""
        raw = _answer(recommendation='grow_this', confidence=0.3)
        raw['criteria'][0]['verdict'] = 'not_met'
        assert _normalize(raw)['recommendation'] == 'grow_this'

    def test_an_unrecognized_recommendation_becomes_needs_human(self):
        out = _normalize(_answer(recommendation='definitely_yes'))
        assert out['recommendation'] == 'needs_human'


@pytest.mark.unit
class TestEveryCriterionIsAnswered:
    """A checklist with a row missing reads as a shorter checklist."""

    def test_a_missing_criterion_becomes_cannot_verify(self):
        raw = _answer()
        raw['criteria'] = raw['criteria'][:2]
        out = _normalize(raw)
        assert len(out['criteria']) == 3
        assert out['criteria'][2]['verdict'] == 'cannot_verify'
        assert any('did not answer criterion 3' in f for f in out['flags'])

    def test_a_missing_criterion_blocks_the_approval(self):
        """An unanswered criterion is a defect in the answer, not a judgment.

        The model saying "cannot_verify" is a reading of evidence it could not
        open, and a reviewer can act on that. A criterion it simply skipped is a
        row of the checklist nobody checked, and approving on the strength of the
        other two is the tidy-looking lie this module exists to refuse.
        """
        raw = _answer()
        raw['criteria'] = raw['criteria'][:2]
        out = _normalize(raw)
        assert out['recommendation'] == 'needs_human'
        assert any('without answering every criterion' in f for f in out['flags'])

    def test_an_invented_criterion_is_dropped(self):
        raw = _answer()
        raw['criteria'].append({'index': 9, 'verdict': 'met',
                                'evidence_refs': [], 'note': 'x'})
        out = _normalize(raw)
        assert [c['index'] for c in out['criteria']] == [1, 2, 3]
        assert any('does not exist' in f for f in out['flags'])

    def test_an_unrecognized_verdict_becomes_cannot_verify(self):
        raw = _answer()
        raw['criteria'][0]['verdict'] = 'sort of'
        out = _normalize(raw)
        assert out['criteria'][0]['verdict'] == 'cannot_verify'

    def test_the_criterion_text_comes_from_the_task_not_the_model(self):
        """The model does not get to restate what it was asked to check."""
        raw = _answer()
        raw['criteria'][0]['criterion'] = 'Something else entirely'
        out = _normalize(raw)
        assert out['criteria'][0]['criterion'] == CRITERIA[0]

    def test_no_criteria_at_all_becomes_needs_human(self):
        out = _normalize(_answer(criteria=[]), criteria=[])
        assert out['recommendation'] == 'needs_human'


@pytest.mark.unit
class TestEvidenceCitations:
    """A citation of something nobody read would render as a clickable lie."""

    def test_a_ref_to_unread_evidence_is_dropped(self):
        raw = _answer()
        raw['criteria'][0]['evidence_refs'] = [1, 3]
        out = _normalize(raw, load=_load(read=(1, 2), skipped=(3,)))
        assert out['criteria'][0]['evidence_refs'] == [1]
        assert any('could not read' in f for f in out['flags'])

    def test_a_ref_to_nothing_at_all_is_dropped_quietly(self):
        raw = _answer()
        raw['criteria'][0]['evidence_refs'] = [1, 99]
        out = _normalize(raw)
        assert out['criteria'][0]['evidence_refs'] == [1]

    def test_duplicate_refs_are_collapsed(self):
        raw = _answer()
        raw['criteria'][0]['evidence_refs'] = [1, 1, 2]
        assert _normalize(raw)['criteria'][0]['evidence_refs'] == [1, 2]

    def test_junk_refs_do_not_raise(self):
        raw = _answer()
        raw['criteria'][0]['evidence_refs'] = ['one', None, {'a': 1}, 2]
        assert _normalize(raw)['criteria'][0]['evidence_refs'] == [2]


@pytest.mark.unit
class TestXPOnlyEverGoesDown:
    """The AI may say a student asked for too much. Never too little."""

    def test_a_lower_recommendation_stands(self):
        raw = _answer(xp={'recommended': 100, 'proportionate': False, 'rationale': 'One photo.'})
        xp = _normalize(raw, requested_xp=150)['xp']
        assert xp['recommended'] == 100
        assert xp['changed'] is True

    def test_a_higher_recommendation_is_refused(self):
        raw = _answer(xp={'recommended': 500, 'proportionate': False, 'rationale': 'Great work.'})
        out = _normalize(raw, requested_xp=150)
        assert out['xp']['recommended'] == 150
        assert out['xp']['changed'] is False
        assert any('raising the XP' in f for f in out['flags'])

    def test_it_cannot_go_below_the_platform_floor(self):
        raw = _answer(xp={'recommended': 5, 'proportionate': False, 'rationale': 'Thin.'})
        assert _normalize(raw, requested_xp=150)['xp']['recommended'] == 25

    def test_the_floor_never_exceeds_the_request(self):
        """A 25 XP task cannot be trimmed to 25 and called a change."""
        raw = _answer(xp={'recommended': 1, 'proportionate': False, 'rationale': 'x'})
        xp = _normalize(raw, requested_xp=25)['xp']
        assert xp['recommended'] == 25
        assert xp['changed'] is False

    def test_it_rounds_to_a_multiple_of_five(self):
        """The subject split rounds to fives; an odd total lands somewhere nobody chose."""
        raw = _answer(xp={'recommended': 113, 'proportionate': False, 'rationale': 'x'})
        assert _normalize(raw, requested_xp=150)['xp']['recommended'] % 5 == 0

    def test_a_missing_figure_leaves_the_request_standing(self):
        out = _normalize(_answer(xp={'rationale': 'unsure'}), requested_xp=150)
        assert out['xp']['recommended'] == 150
        assert any('usable XP figure' in f for f in out['flags'])

    def test_a_junk_figure_leaves_the_request_standing(self):
        raw = _answer(xp={'recommended': 'a lot', 'proportionate': False, 'rationale': 'x'})
        assert _normalize(raw, requested_xp=150)['xp']['recommended'] == 150


@pytest.mark.unit
class TestFeedbackProse:
    def test_markdown_is_stripped(self):
        raw = _answer(feedback={'celebrate': 'You **tested** it properly.',
                                'grow_this': '- Add the numbers'})
        fb = _normalize(raw)['feedback']
        assert '**' not in fb['celebrate']
        assert not fb['grow_this'].startswith('-')

    def test_newlines_are_collapsed_into_one_paragraph(self):
        raw = _answer(feedback={'celebrate': 'One.\n\nTwo.', 'grow_this': 'x'})
        assert '\n' not in _normalize(raw)['feedback']['celebrate']

    def test_missing_feedback_is_flagged_not_faked(self):
        out = _normalize(_answer(feedback={}))
        assert out['feedback']['celebrate'] is None
        assert any('did not draft' in f for f in out['flags'])


@pytest.mark.unit
class TestDegradingSafely:
    def test_a_non_dict_answer_does_not_raise(self):
        out = _normalize('the model wrote prose')
        assert out['recommendation'] == 'needs_human'

    def test_an_empty_answer_does_not_raise(self):
        assert _normalize({})['recommendation'] == 'needs_human'

    def test_confidence_is_clamped(self):
        assert _normalize(_answer(confidence=7))['confidence'] == 1.0
        assert _normalize(_answer(confidence=-3))['confidence'] == 0.0
        assert _normalize(_answer(confidence='high'))['confidence'] == 0.0

    def test_loader_flags_survive_into_the_stored_review(self):
        load = _load(read=(1,), skipped=(2,))
        load.flags.append('[E2] doc2.pdf: the file could not be opened')
        out = _normalize(_answer(), load=load)
        assert any('doc2.pdf' in f for f in out['flags'])

    def test_a_description_only_task_says_so(self):
        out = normalize_review(
            _answer(), criteria=['Do the thing'], criteria_source='task_description',
            load=_load(), requested_xp=150)
        assert out['criteria_source'] == 'task_description'
        assert any('no written Definition of Done' in f for f in out['flags'])

    def test_the_evidence_manifest_carries_no_storage_url(self):
        out = _normalize(_answer())
        blob = repr(out['evidence'])
        assert '/storage/v1/' not in blob


@pytest.mark.unit
class TestSkippedReviews:
    def test_a_skipped_review_never_recommends_approval(self):
        out = skipped_review(reason='ai_disabled_for_student')
        assert out['recommendation'] == 'needs_human'
        assert out['xp'] is None

    def test_a_skipped_review_still_says_what_it_could_not_read(self):
        load = _load(read=(), skipped=(1, 2))
        load.flags.append('[E1] photo1.jpg: the file could not be opened')
        out = skipped_review(reason='no_readable_evidence', load=load)
        assert out['evidence_read']['skipped'] == 2
        assert any('photo1.jpg' in f for f in out['flags'])
