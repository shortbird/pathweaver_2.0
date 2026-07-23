"""
Unit tests for the iCreate registration funnel's public config — specifically
the paperwork single-source-of-truth rule: a paperwork item's doc_url comes
from its linked org_resource when one exists, else the configured doc_url —
plus the per-student question answers and the post-registration flow config.
"""

import pytest

from routes.icreate_registration import _public_config, _validate_answers

ORG = {'id': 'org1', 'name': 'iCreate', 'slug': 'icreate', 'branding_config': {}}
CFG = {
    'fee_mode': 'flat',
    'paperwork': [
        {'key': 'guidebook', 'label': 'Family Guidebook', 'doc_url': 'https://x/old-guide.pdf'},
        {'key': 'contract', 'label': 'Student Contract'},
    ],
}


@pytest.mark.unit
class TestPaperworkSourceOfTruth:
    def _paperwork(self, urls=None):
        return {p['key']: p for p in _public_config(ORG, CFG, urls)['paperwork']}

    def test_linked_resource_overrides_configured_doc_url(self):
        pw = self._paperwork({'guidebook': 'https://x/new-guide-v2.pdf'})
        assert pw['guidebook']['doc_url'] == 'https://x/new-guide-v2.pdf'

    def test_unlinked_items_keep_configured_doc_url(self):
        pw = self._paperwork({'guidebook': 'https://x/new-guide-v2.pdf'})
        assert pw['contract']['doc_url'] == ''

    def test_no_links_falls_back_to_config(self):
        pw = self._paperwork(None)
        assert pw['guidebook']['doc_url'] == 'https://x/old-guide.pdf'


@pytest.mark.unit
class TestPublicConfigFlags:
    def test_per_student_defaults_false_and_is_exposed(self):
        cfg = {'questions': [
            {'key': 'fam', 'label': 'Family question'},
            {'key': 'goals', 'label': 'Per-kid question', 'per_student': True},
        ]}
        qs = {q['key']: q for q in _public_config(ORG, cfg)['questions']}
        assert qs['fam']['per_student'] is False
        assert qs['goals']['per_student'] is True

    def test_post_registration_flow_defaults_to_schedule(self):
        assert _public_config(ORG, CFG)['post_registration_flow'] == 'schedule'

    def test_post_registration_flow_reads_sis_settings(self):
        org = {**ORG, 'feature_flags': {'sis_settings': {'post_registration_flow': 'goals'}}}
        assert _public_config(org, CFG)['post_registration_flow'] == 'goals'


@pytest.mark.unit
class TestValidateAnswers:
    KIDS = [
        {'user_id': 'kid1', 'first_name': 'Ana', 'name': 'Ana Sample'},
        {'user_id': 'kid2', 'first_name': 'Ben', 'name': 'Ben Sample'},
    ]
    QUESTIONS = [
        {'key': 'consent', 'label': 'Media consent', 'type': 'select', 'required': True},
        {'key': 'direction', 'label': 'Direction for the year', 'type': 'text',
         'required': True, 'per_student': True},
        {'key': 'interests', 'label': 'Interests', 'type': 'multi', 'per_student': True},
    ]

    def test_per_student_happy_path_stores_object_shape(self):
        answers, err = _validate_answers(self.QUESTIONS, {
            'consent': 'Yes',
            'direction': {'kid1': 'Learn to weld', 'kid2': 'Ship a game'},
            'interests': {'kid1': ['Art', 'Music'], 'kid2': []},
        }, self.KIDS)
        assert err is None
        assert answers['consent'] == 'Yes'
        assert answers['direction'] == {'kid1': 'Learn to weld', 'kid2': 'Ship a game'}
        assert answers['interests'] == {'kid1': ['Art', 'Music'], 'kid2': []}

    def test_required_per_student_missing_for_one_kid_fails_with_name(self):
        answers, err = _validate_answers(self.QUESTIONS, {
            'consent': 'Yes',
            'direction': {'kid1': 'Learn to weld'},
        }, self.KIDS)
        assert answers is None
        assert 'Ben' in err and 'Direction for the year' in err

    def test_junk_kid_keys_are_dropped(self):
        answers, err = _validate_answers(self.QUESTIONS, {
            'consent': 'Yes',
            'direction': {'kid1': 'A', 'kid2': 'B', 'intruder': 'X'},
        }, self.KIDS)
        assert err is None
        assert set(answers['direction']) == {'kid1', 'kid2'}

    def test_family_level_behavior_unchanged(self):
        answers, err = _validate_answers(
            [{'key': 'consent', 'label': 'Media consent', 'required': True}],
            {'consent': ''}, self.KIDS)
        assert answers is None
        assert err == 'Please answer: Media consent'
