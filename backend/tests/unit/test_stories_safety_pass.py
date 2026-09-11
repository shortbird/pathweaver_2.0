"""The AI safety pass: the model reports, Python decides.

Every rule that keeps a face or a name off the site is asserted here against
canned model output, so a prompt change cannot quietly relax one.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pytest

from services.stories import safety
from services.stories.anonymize import Scrubber
from services.stories.source import ImageCandidate

pytestmark = pytest.mark.unit

REF = ('https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/'
       'quest-evidence/task-evidence/x/{n}.jpg')


def _img(n: int, data: bytes = b'\xff\xd8') -> ImageCandidate:
    return ImageCandidate(index=n, task_index=1, block_id=f'b{n}', item_index=1,
                          source_ref=REF.format(n=n), mime_type='image/jpeg', data=data)


VIDEO_REF = ('https://auth.optioeducation.com/storage/v1/object/public/'
             'quest-evidence/evidence-tasks/x/{n}_Dream.MP4')
CLEAN_MP4 = b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 64
LOCATED_MP4 = b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 16 + b'\xa9xyz+40.7128-074.0060/' + b'\x00' * 16


def _video(n: int, data: bytes = CLEAN_MP4, mime: str = 'video/mp4') -> ImageCandidate:
    return ImageCandidate(index=n, task_index=1, block_id=f'v{n}', item_index=1,
                          source_ref=VIDEO_REF.format(n=n), mime_type=mime, data=data,
                          label='Dream', kind='video')


class FakeFileApi:
    """Stands in for fetchers.upload_to_file_api / delete_file, and remembers."""

    def __init__(self, fail_upload: bool = False):
        self.fail_upload = fail_upload
        self.uploads: List[Dict[str, Any]] = []
        self.deleted: List[Any] = []

    def upload(self, blob, *, mime_type, display_name):
        self.uploads.append({'size': len(blob), 'mime_type': mime_type,
                             'display_name': display_name})
        if self.fail_upload:
            return None, 'the file could not be uploaded for review'
        handle = {'name': f'files/handle-{len(self.uploads)}'}
        return handle, None

    def delete(self, handle):
        self.deleted.append(handle)


@pytest.fixture
def file_api(monkeypatch) -> FakeFileApi:
    fake = FakeFileApi()
    monkeypatch.setattr(safety.fetchers, 'upload_to_file_api', fake.upload)
    monkeypatch.setattr(safety.fetchers, 'delete_file', fake.delete)
    return fake


def _report(index: int, **over) -> Dict[str, Any]:
    base = {'index': index, 'faces': 0, 'readable_text': [], 'names_person': [],
            'names_place_or_team': [], 'identifying_detail': [], 'confidence': 0.95,
            'verdict': 'safe'}
    base.update(over)
    return base


class FakeChecker:
    """Answers each batch from a queue; a queued Exception is raised."""

    def __init__(self, answers: List[Any], phrases: Optional[List[str]] = None):
        self.answers = list(answers)
        self.calls: List[List[Any]] = []
        self.phrases = phrases or []
        self.text_calls: List[str] = []

    def inspect_images(self, parts):
        self.calls.append(parts)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer, 'gemini-test'

    def identifying_phrases(self, text):
        self.text_calls.append(text)
        return list(self.phrases), 'gemini-test'


class TestDecide:
    def test_clean_image_is_safe(self):
        assert safety.decide(_report(1), tier='anonymized', scope={}) == ('safe', None)

    def test_faces_excluded_in_anonymized_tier(self):
        assert safety.decide(_report(1, faces=1), tier='anonymized', scope={}) == ('excluded', 'faces')

    def test_faces_excluded_in_named_tier_without_image_voice(self):
        assert safety.decide(_report(1, faces=1), tier='named',
                             scope={'first_name': True}) == ('excluded', 'faces')

    def test_faces_kept_only_named_with_image_voice(self):
        assert safety.decide(_report(1, faces=2), tier='named',
                             scope={'image_voice': True}) == ('safe', None)

    def test_any_name_excluded_in_both_tiers(self):
        for tier in ('anonymized', 'named'):
            assert safety.decide(_report(1, names_person=['Anna']), tier=tier,
                                 scope={'image_voice': True}) == ('excluded', 'names_person')
            assert safety.decide(_report(1, names_place_or_team=['Lincoln Middle School']),
                                 tier=tier, scope={'image_voice': True}) == \
                ('excluded', 'names_place_or_team')

    def test_identifying_detail_excluded(self):
        assert safety.decide(_report(1, identifying_detail=['a licence plate']),
                             tier='named', scope={'image_voice': True}) == \
            ('excluded', 'identifying_detail')

    def test_school_name_in_readable_text_excluded_in_both_tiers(self):
        scrubber = Scrubber([], ['Hearthwood Academy'])
        for tier in ('anonymized', 'named'):
            assert safety.decide(_report(1, readable_text=['HEARTHWOOD ACADEMY 2026']),
                                 tier=tier, scope={'image_voice': True},
                                 scrubber=scrubber) == ('excluded', 'readable_text')

    def test_readable_text_that_names_nobody_is_fine(self):
        scrubber = Scrubber(['Anna'], ['Hearthwood Academy'])
        assert safety.decide(_report(1, readable_text=['Chapter 3', 'Load: 12 kg']),
                             tier='anonymized', scope={}, scrubber=scrubber) == ('safe', None)

    def test_uncertain_excluded(self):
        assert safety.decide(_report(1, verdict='uncertain'), tier='anonymized', scope={}) == \
            ('excluded', 'model_uncertain')

    def test_low_confidence_excluded(self):
        assert safety.decide(_report(1, confidence=0.79), tier='anonymized', scope={},
                             min_confidence=0.8) == ('excluded', 'low_confidence')
        assert safety.decide(_report(1, confidence=0.8), tier='anonymized', scope={},
                             min_confidence=0.8) == ('safe', None)

    def test_unreadable_face_count_is_not_zero_faces(self):
        assert safety.decide(_report(1, faces='many'), tier='anonymized', scope={}) == \
            ('excluded', 'faces')

    def test_the_floor_comes_from_config(self, monkeypatch):
        from app_config import Config
        monkeypatch.setattr(Config, 'STORY_SAFETY_MIN_CONFIDENCE', 0.99)
        assert safety.decide(_report(1, confidence=0.95), tier='anonymized', scope={}) == \
            ('excluded', 'low_confidence')


class TestCheckImages:
    def test_batches_of_eight_one_call_each(self):
        images = [_img(n) for n in range(1, 11)]
        checker = FakeChecker([[_report(n) for n in range(1, 9)], [_report(9), _report(10)]])
        verdicts = safety.check_images(images, tier='anonymized', scope={}, checker=checker)
        assert len(checker.calls) == 2
        assert [v.index for v in verdicts] == list(range(1, 11))
        assert all(v.safe for v in verdicts)
        # Each batch: the prompt, then a label and bytes per image.
        assert checker.calls[0][0].startswith('You are checking photographs')
        assert checker.calls[0][1] == '[I1]:'
        assert checker.calls[0][2] == {'mime_type': 'image/jpeg', 'data': b'\xff\xd8'}
        assert len(checker.calls[0]) == 1 + 2 * 8

    def test_model_error_excludes_the_whole_batch_and_not_the_next(self):
        images = [_img(n) for n in range(1, 10)]
        checker = FakeChecker([RuntimeError('overloaded'), [_report(9)]])
        verdicts = safety.check_images(images, tier='anonymized', scope={}, checker=checker)
        assert [v.verdict for v in verdicts[:8]] == ['excluded'] * 8
        assert {v.reason for v in verdicts[:8]} == {'safety_check_failed'}
        assert verdicts[8].safe

    def test_unreported_image_is_excluded(self):
        checker = FakeChecker([[_report(1)]])
        verdicts = safety.check_images([_img(1), _img(2)], tier='anonymized', scope={},
                                       checker=checker)
        assert verdicts[0].safe
        assert (verdicts[1].verdict, verdicts[1].reason) == ('excluded', 'not_reported')

    def test_no_bytes_means_no_call(self):
        checker = FakeChecker([])
        verdicts = safety.check_images([_img(1, data=b'')], tier='anonymized', scope={},
                                       checker=checker)
        assert (verdicts[0].verdict, verdicts[0].reason) == ('excluded', 'no_bytes')
        assert checker.calls == []

    def test_verdict_record_carries_what_the_model_saw(self):
        checker = FakeChecker([[_report(1, faces=1, readable_text=['GO TIGERS'],
                                        names_place_or_team=['Tigers'], confidence=0.9)]])
        v = safety.check_images([_img(1)], tier='anonymized', scope={}, checker=checker)[0]
        record = v.safety_record()
        assert record['verdict'] == 'excluded'
        assert record['reason'] == 'faces'
        assert record['faces'] == 1
        assert record['names_place_or_team'] == ['Tigers']
        assert record['checked_by'] == 'gemini-test'
        assert record['checked_at']

    def test_no_source_ref_in_any_part(self):
        checker = FakeChecker([[_report(1)]])
        safety.check_images([_img(1)], tier='anonymized', scope={}, checker=checker)
        for part in checker.calls[0]:
            if isinstance(part, str):
                assert 'quest-evidence' not in part and '/storage/' not in part


class TestCheckVideos:
    def test_location_atom_excludes_before_any_upload(self, file_api):
        checker = FakeChecker([])
        verdicts = safety.check_images([_video(1, data=LOCATED_MP4)], tier='named',
                                       scope={'image_voice': True}, checker=checker)
        assert (verdicts[0].verdict, verdicts[0].reason) == ('excluded', 'video_location_metadata')
        assert file_api.uploads == []
        assert checker.calls == []
        assert safety.has_location_metadata(LOCATED_MP4) is True
        assert safety.has_location_metadata(CLEAN_MP4) is False

    def test_upload_failure_excludes_with_safety_check_failed(self, monkeypatch):
        fake = FakeFileApi(fail_upload=True)
        monkeypatch.setattr(safety.fetchers, 'upload_to_file_api', fake.upload)
        monkeypatch.setattr(safety.fetchers, 'delete_file', fake.delete)
        checker = FakeChecker([])
        verdicts = safety.check_images([_video(1)], tier='anonymized', scope={}, checker=checker)
        assert (verdicts[0].verdict, verdicts[0].reason) == ('excluded', 'safety_check_failed')
        assert checker.calls == []
        assert fake.deleted == []                                  # nothing to delete

    def test_clean_video_with_no_faces_is_safe_and_the_handle_is_deleted(self, file_api):
        checker = FakeChecker([[_report(1)]])
        verdicts = safety.check_images([_video(1, mime='video/quicktime')], tier='anonymized',
                                       scope={}, checker=checker)
        assert verdicts[0].safe
        assert verdicts[0].checked_by == 'gemini-test'
        assert file_api.uploads == [{'size': len(CLEAN_MP4), 'mime_type': 'video/quicktime',
                                     'display_name': 'evidence video'}]
        # One call: the image prompt, the video sentence, the label, the handle.
        parts = checker.calls[0]
        assert parts[0].startswith('You are checking photographs')
        assert parts[1].startswith('This is a video. Report across every frame')
        assert parts[2] == '[I1]:'
        assert parts[3] == {'name': 'files/handle-1'}
        assert file_api.deleted == [{'name': 'files/handle-1'}]

    def test_the_handle_is_deleted_even_when_the_model_call_raises(self, file_api):
        checker = FakeChecker([RuntimeError('overloaded')])
        verdicts = safety.check_images([_video(1)], tier='anonymized', scope={}, checker=checker)
        assert (verdicts[0].verdict, verdicts[0].reason) == ('excluded', 'safety_check_failed')
        assert file_api.deleted == [{'name': 'files/handle-1'}]

    def test_decide_applies_unchanged_to_a_video(self, file_api):
        checker = FakeChecker([[_report(1, faces=2)], [_report(2, faces=2)]])
        anonymized = safety.check_images([_video(1)], tier='anonymized', scope={}, checker=checker)
        named = safety.check_images([_video(2)], tier='named', scope={'image_voice': True},
                                    checker=checker)
        assert (anonymized[0].verdict, anonymized[0].reason) == ('excluded', 'faces')
        assert named[0].safe and named[0].faces == 2

    def test_images_batch_and_videos_go_one_at_a_time_in_index_order(self, file_api):
        candidates = [_img(1), _video(2), _img(3), _video(4)]
        checker = FakeChecker([[_report(1), _report(3)], [_report(2)], [_report(4)]])
        verdicts = safety.check_images(candidates, tier='anonymized', scope={}, checker=checker)
        assert [v.index for v in verdicts] == [1, 2, 3, 4]
        assert all(v.safe for v in verdicts)
        assert len(checker.calls) == 3
        assert len(file_api.uploads) == 2
        assert len(file_api.deleted) == 2

    def test_no_source_ref_or_filename_in_any_video_part(self, file_api):
        checker = FakeChecker([[_report(1)]])
        safety.check_images([_video(1)], tier='anonymized', scope={}, checker=checker)
        for part in checker.calls[0]:
            if isinstance(part, str):
                assert 'quest-evidence' not in part and '/storage/' not in part
                assert 'Dream' not in part


PDF_REF = ('https://auth.optioeducation.com/storage/v1/object/public/'
           'quest-evidence/evidence-tasks/x/{n}_Lab%20report.pdf')
PDF = b'%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n'


def _doc(n: int, data: bytes = PDF) -> ImageCandidate:
    return ImageCandidate(index=n, task_index=1, block_id=f'd{n}', item_index=1,
                          source_ref=PDF_REF.format(n=n), mime_type='application/pdf',
                          data=data, label='Lab report', kind='document')


class TestCheckDocuments:
    """A PDF: the scrubber reads its text first, then the model reads its pages."""

    @pytest.fixture(autouse=True)
    def pdf_text(self, monkeypatch):
        state = {'text': 'Load test results. The bridge held 12 kg.', 'meta': ''}
        monkeypatch.setattr('services.credit_ai_review.evidence_loader._pdf_text',
                            lambda blob: state['text'])
        monkeypatch.setattr(safety, '_pdf_metadata_text', lambda blob: state['meta'])
        return state

    def test_a_name_in_the_extracted_text_excludes_before_the_model_call(self, pdf_text):
        pdf_text['text'] = 'Lab report by Anna Lindqvist. The bridge held 12 kg.'
        checker = FakeChecker([])
        verdicts = safety.check_images([_doc(1)], tier='named', scope={'image_voice': True},
                                       scrubber=Scrubber(['Anna Lindqvist']), checker=checker)
        assert (verdicts[0].verdict, verdicts[0].reason) == ('excluded', 'text_leak')
        assert verdicts[0].readable_text == ['Anna', 'Lindqvist']
        assert checker.calls == []                                 # the model never saw it

    def test_a_name_in_the_pdf_metadata_excludes_too(self, pdf_text):
        pdf_text['meta'] = 'Anna Lindqvist'
        checker = FakeChecker([])
        verdicts = safety.check_images([_doc(1)], tier='anonymized', scope={},
                                       scrubber=Scrubber(['Anna Lindqvist']), checker=checker)
        assert (verdicts[0].verdict, verdicts[0].reason) == ('excluded', 'text_leak')
        assert checker.calls == []

    def test_a_clean_pdf_is_safe_after_one_inline_model_call(self):
        checker = FakeChecker([[_report(1)]])
        verdicts = safety.check_images([_doc(1)], tier='anonymized', scope={},
                                       scrubber=Scrubber(['Anna Lindqvist']), checker=checker)
        assert verdicts[0].safe
        assert verdicts[0].checked_by == 'gemini-test'
        parts = checker.calls[0]
        assert parts[0].startswith('You are checking photographs')
        assert parts[1].startswith('This is a document. Report every person\'s name')
        assert parts[2] == '[I1]:'
        assert parts[3] == {'mime_type': 'application/pdf', 'data': PDF}
        for part in parts:
            if isinstance(part, str):
                assert 'quest-evidence' not in part and '/storage/' not in part
                assert 'Lab report' not in part

    def test_model_failure_excludes(self):
        checker = FakeChecker([RuntimeError('overloaded')])
        verdicts = safety.check_images([_doc(1)], tier='anonymized', scope={}, checker=checker)
        assert (verdicts[0].verdict, verdicts[0].reason) == ('excluded', 'safety_check_failed')

    def test_the_model_report_is_decided_by_the_same_rules(self):
        checker = FakeChecker([[_report(1, names_place_or_team=['Lincoln Middle School'])],
                               [_report(2, faces=1)]])
        named = safety.check_images([_doc(1)], tier='named', scope={'image_voice': True},
                                    checker=checker)
        assert (named[0].verdict, named[0].reason) == ('excluded', 'names_place_or_team')
        anonymized = safety.check_images([_doc(2)], tier='anonymized', scope={}, checker=checker)
        assert (anonymized[0].verdict, anonymized[0].reason) == ('excluded', 'faces')

    def test_an_oversized_pdf_is_excluded_without_a_call(self, monkeypatch):
        monkeypatch.setattr(safety, 'MAX_DOCUMENT_SIZE', len(PDF) - 1)
        checker = FakeChecker([])
        verdicts = safety.check_images([_doc(1)], tier='anonymized', scope={}, checker=checker)
        assert (verdicts[0].verdict, verdicts[0].reason) == ('excluded', 'document_too_large')
        assert checker.calls == []

    def test_images_videos_and_documents_in_index_order(self, file_api):
        candidates = [_img(1), _doc(2), _video(3)]
        checker = FakeChecker([[_report(1)], [_report(3)], [_report(2)]])
        verdicts = safety.check_images(candidates, tier='anonymized', scope={}, checker=checker)
        assert [v.index for v in verdicts] == [1, 2, 3]
        assert all(v.safe for v in verdicts)
        assert len(checker.calls) == 3


class TestCheckText:
    FIELDS = {
        'title': 'A bridge that held',
        'dek': 'Anna tested it at Hearthwood Academy.',
        'body': {'sections': [{'kind': 'what_they_did', 'body_md': 'The student built it.'}],
                 'faq': [{'q': 'Does it count?', 'a': 'Yes, with a reviewer.'}]},
    }

    def test_scrubber_leaks_are_removed_and_reported(self):
        scrubber = Scrubber(['Anna Lindqvist'], ['Hearthwood Academy'])
        cleaned, report = safety.check_text(self.FIELDS, scrubber, checker=FakeChecker([]))
        assert cleaned['dek'] == '[name] tested it at [school].'
        assert report['leaks_found'] == ['Anna', 'Hearthwood Academy']
        assert report['leaks_after'] == []
        assert report['blockers'] == []
        assert report['model'] == 'gemini-test'

    def test_model_phrases_are_removed_once(self):
        scrubber = Scrubber([])
        checker = FakeChecker([], phrases=['Hearthwood Academy', 'the student'])
        cleaned, report = safety.check_text(self.FIELDS, scrubber, checker=checker)
        assert cleaned['dek'] == 'Anna tested it at [removed].'
        # "the student" is generic and the prompt says not to list it; when the
        # model does anyway it is still a phrase, and one rescrub is the budget.
        assert cleaned['body']['sections'][0]['body_md'] == 'The student built it.' or \
            cleaned['body']['sections'][0]['body_md'] == '[removed] built it.'
        assert report['ai_phrases'] == ['Hearthwood Academy', 'the student']
        assert 'text_leak' not in report['blockers']

    def test_a_second_leak_is_a_hard_blocker(self, monkeypatch):
        """If the scrubber still finds something after the one rescrub, stop."""
        scrubber = Scrubber(['Anna'])
        # Simulate a scrub that cannot remove what find_leaks sees.
        monkeypatch.setattr(scrubber, 'scrub_structure', lambda value: value)
        cleaned, report = safety.check_text(self.FIELDS, scrubber, checker=FakeChecker([]))
        assert report['leaks_after'] == ['Anna']
        assert report['blockers'] == ['text_leak']

    def test_model_failure_is_recorded_not_raised(self):
        class Broken:
            def identifying_phrases(self, text):
                raise RuntimeError('down')
        cleaned, report = safety.check_text(self.FIELDS, Scrubber(['Anna']), checker=Broken())
        assert cleaned['dek'].startswith('[name]')
        assert report['error'] == 'down'
        assert report['blockers'] == []
