"""Typed text and documents become quotations; the file itself stays private.

A `text` block is the student's own words and becomes a `quote` item with no
caption. A document the loader reduced to text (docx, doc, txt, csv, or a PDF
too long to inline) becomes a `quote` labelled "From <title>". Both are
scrubbed, capped at 1500 characters on a sentence boundary, and leak-scanned
once more; a leak that survives the one re-scrub excludes the quote with a
concern, never the story.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pytest

from services.credit_ai_review import evidence_loader
from services.stories import safety
from services.stories import source as source_mod
from services.stories import source_completion
from services.stories.anonymize import Scrubber
from services.stories.drafter import DraftResult, assemble
from services.stories.source import MAX_QUOTE_CHARS, QuoteCandidate, clip_quote

pytestmark = pytest.mark.unit

STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
QUEST_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
USER_QUEST_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

DOC_URL = ('https://auth.optioeducation.com/storage/v1/object/public/quest-evidence/'
           'evidence-tasks/11111111-1111-1111-1111-111111111111/'
           '22222222-2222-2222-2222-222222222222_Maya%20Reyes%20reflection.txt')
PDF_URL = DOC_URL.replace('reflection.txt', 'Lab%20report.pdf')


def _text_block(text: str, block_id: str = 'b1') -> Dict[str, Any]:
    return {'id': block_id, 'block_type': 'text', 'content': {'text': text}}


def _document_block(url: str, title: str, block_id: str = 'd1') -> Dict[str, Any]:
    return {'id': block_id, 'block_type': 'document',
            'content': {'items': [{'url': url, 'title': title, 'filename': title}]}}


class FakeRepo:
    def __init__(self, snapshot: List[Dict[str, Any]]):
        self.snapshot = snapshot

    def completion(self, cid):
        if cid != COMPLETION_ID:
            return None
        return {'id': cid, 'user_id': STUDENT_ID, 'quest_id': QUEST_ID, 'task_id': None,
                'user_quest_task_id': 't1', 'completed_at': '2026-09-01', 'is_confidential': False,
                'diploma_status': 'finalized', 'revision_number': 1,
                'finalized_at': '2026-09-05T00:00:00+00:00', 'merged_into': None}

    def rounds_for_completion(self, cid):
        return [{'id': 'r1', 'completion_id': cid, 'round_number': 1,
                 'evidence_snapshot': self.snapshot, 'submitted_at': '2026-09-02T00:00:00+00:00',
                 'reviewer_action': 'approved', 'reviewer_feedback': None,
                 'approved_subjects': None, 'reviewed_at': '2026-09-05'}]

    def task(self, tid):
        return {'id': tid, 'user_id': STUDENT_ID, 'quest_id': QUEST_ID,
                'user_quest_id': USER_QUEST_ID, 'title': 'Write it up',
                'description': 'Write a reflection.', 'pillar': 'arts', 'xp_value': 100,
                'diploma_subjects': {'Fine Arts': 100}, 'subject_xp_distribution': None,
                'success_criteria': ['Wrote it'], 'source_moment_id': None}

    def quest(self, qid): return {'id': qid, 'title': 'Dance', 'description': '', 'big_idea': ''}
    def user_quest(self, uid): return {'id': uid, 'reflection_notes': None, 'completed_at': None}
    def student(self, uid):
        return {'id': uid, 'first_name': 'Maya', 'last_name': 'Reyes', 'display_name': None,
                'preferred_name': None, 'role': 'student', 'organization_id': None,
                'date_of_birth': None} if uid == STUDENT_ID else None
    def parent_rows(self, student): return []
    def org_name(self, org_id): return None
    def active_academy_enrollment(self, uid): return None


class FakeBucket:
    def __init__(self, objects: Dict[str, bytes]):
        self.objects = objects

    def download(self, path):
        for url, blob in self.objects.items():
            if url.endswith(path.replace(' ', '%20')) or url.endswith(path):
                return blob
        raise RuntimeError('not found')


class FakeAdmin:
    """The loader's storage client: `admin.storage.from_(bucket).download(path)`."""

    def __init__(self, objects: Dict[str, bytes]):
        self.bucket = FakeBucket(objects)

    @property
    def storage(self): return self
    def from_(self, name): return self.bucket


@pytest.fixture(autouse=True)
def _no_ai_review(monkeypatch):
    monkeypatch.setattr(
        'repositories.credit_ai_review_repository.CreditAIReviewRepository.latest_complete_for_completion',
        lambda self, cid: None)


def _load(snapshot, *, objects=None, sniff: Optional[str] = 'text/plain'):
    if sniff is not None:
        import services.credit_ai_review.evidence_loader as loader_mod
        original = loader_mod.sniff_mime
        fixed_sniff = sniff

        def _sniff(blob: bytes, *, declared: Optional[str] = None,
                   filename: Optional[str] = None) -> str:
            return fixed_sniff

        loader_mod.sniff_mime = _sniff
        try:
            return source_completion.load(COMPLETION_ID, repo=FakeRepo(snapshot),
                                          admin=FakeAdmin(objects or {}))
        finally:
            loader_mod.sniff_mime = original
    return source_completion.load(COMPLETION_ID, repo=FakeRepo(snapshot),
                                  admin=FakeAdmin(objects or {}))


class TestTypedText:
    def test_a_text_block_becomes_a_quote_in_the_students_words(self):
        source = _load([_text_block('Maya danced for three minutes. It was hard.')])
        task = source.tasks[0]
        assert task.evidence_texts == ['[name] danced for three minutes. It was hard.']
        assert len(task.quotes) == 1
        quote = task.quotes[0]
        assert isinstance(quote, QuoteCandidate)
        assert quote.index == 1 and quote.task_index == 1
        assert quote.block_id == 'b1' and quote.item_index == 1
        assert quote.text == '[name] danced for three minutes. It was hard.'
        assert quote.caption is None
        assert quote.origin == 'text'
        assert quote.text_index == 0
        assert source.quote_candidates == [quote]

    def test_quotes_keep_the_order_the_student_wrote_them(self):
        source = _load([_text_block('First.', 'b1'), _text_block('Second.', 'b2'),
                        _text_block('Third.', 'b3')])
        assert [q.text for q in source.tasks[0].quotes] == ['First.', 'Second.', 'Third.']
        assert [q.index for q in source.tasks[0].quotes] == [1, 2, 3]
        assert [q.text_index for q in source.tasks[0].quotes] == [0, 1, 2]

    def test_the_cap_ends_on_a_sentence_with_an_ellipsis(self):
        sentence = 'I practised the turn until it held. '
        long_text = sentence * 80                                  # ~2900 characters
        source = _load([_text_block(long_text)])
        quote = source.tasks[0].quotes[0]
        assert len(quote.text) <= MAX_QUOTE_CHARS + 3
        assert quote.text.endswith('held....')                    # the sentence, then ...
        assert quote.text[:-3].endswith('.')
        # The full text still reaches the drafter, untruncated by the quote cap.
        assert len(source.tasks[0].evidence_texts[0]) > MAX_QUOTE_CHARS

    def test_a_safe_quote_is_included_after_assembly(self):
        source = _load([_text_block('It held 12 kg.')])
        out = _assemble(source)
        evidence = next(s for s in out['story']['body']['sections'] if s['kind'] == 'evidence')
        assert evidence['items'] == [{
            'type': 'quote', 'text': 'It held 12 kg.', 'caption': None,
            'source_block_id': 'b1', 'source_item_index': 1,
            'included': True, 'safety': {'verdict': 'safe', 'reason': None},
        }]
        assert out['story']['concerns'] == []


class TestDocuments:
    def test_a_text_document_becomes_a_quote_labelled_by_file(self):
        source = _load([_document_block(DOC_URL, 'Maya Reyes reflection.txt')],
                       objects={DOC_URL: b'I learned to count the beats. Maya'})
        task = source.tasks[0]
        assert task.images == []                                   # the file is not published
        assert len(task.quotes) == 1
        quote = task.quotes[0]
        assert quote.origin == 'document'
        assert quote.text == 'I learned to count the beats. [name]'
        assert quote.caption == 'From [name] [name] reflection'   # scrubbed, no extension
        assert quote.block_id == 'd1'
        assert task.evidence_texts == ['I learned to count the beats. [name]']

    def test_a_pdf_the_loader_reduced_to_text_becomes_a_quote(self, monkeypatch):
        monkeypatch.setattr('utils.pdf_tools.pdf_page_count', lambda blob: 5000)
        monkeypatch.setattr('utils.pdf_tools.is_encrypted_pdf', lambda blob: False)
        monkeypatch.setattr(evidence_loader, '_pdf_text',
                            lambda blob: 'Load test results. The bridge held 12 kg.')
        source = _load([_document_block(PDF_URL, 'Lab report.pdf')],
                       objects={PDF_URL: b'%PDF-1.4 long'}, sniff='application/pdf')
        task = source.tasks[0]
        assert task.images == []
        assert [q.caption for q in task.quotes] == ['From Lab report']
        assert task.quotes[0].text == 'Load test results. The bridge held 12 kg.'

    def test_a_pdf_the_loader_kept_whole_becomes_a_document_candidate(self, monkeypatch):
        """Bytes that sniff as a PDF and fit inline are a file to publish: the
        candidate carries the bytes for the safety pass and a scrubbed excerpt
        for the drafter, and no quote is made of it."""
        monkeypatch.setattr('utils.pdf_tools.pdf_page_count', lambda blob: 3)
        monkeypatch.setattr(evidence_loader, '_pdf_text',
                            lambda blob: 'Lab report by Maya Reyes.\nThe bridge held 12 kg.')
        source = _load([_document_block(PDF_URL, 'Lab report.pdf')],
                       objects={PDF_URL: b'%PDF-1.4 small'}, sniff='application/pdf')
        task = source.tasks[0]
        assert task.quotes == []
        assert len(task.images) == 1
        doc = task.images[0]
        assert doc.kind == 'document' and doc.is_document and not doc.is_image
        assert doc.mime_type == 'application/pdf'
        assert doc.data == b'%PDF-1.4 small'
        assert doc.label == 'Lab report'
        assert doc.file_name == 'Lab report.pdf'
        assert doc.excerpt == 'Lab report by [name] [name]. The bridge held 12 kg.'
        assert doc.index == 1 and doc.block_id == 'd1'
        assert source.document_candidates == [doc]
        source.release_videos()
        assert doc.data is None and doc.excerpt                   # bytes go, the excerpt stays

    def test_a_document_quote_caption_is_from_the_scrubbed_title(self):
        source = _load([_document_block(DOC_URL, 'notes.txt')],
                       objects={DOC_URL: b'Some notes.'})
        assert source.tasks[0].quotes[0].caption == 'From notes'


class TestLeaks:
    def test_a_leak_after_one_rescrub_excludes_the_quote_with_a_concern(self, monkeypatch):
        """The scrubber's own regexes normally agree with themselves; when a
        string defeats the re-scrub, the quote goes, the story stays."""
        source = _load([_text_block('It held 12 kg.'), _text_block('Ask Anna about it.', 'b2')])
        # Two quotes: the second still names someone (as if the scrub missed it).
        source.tasks[0].quotes[1].text = 'Ask Anna about it.'
        scrubber = Scrubber(['Anna'])
        monkeypatch.setattr(scrubber, 'scrub', lambda text: text)   # the re-scrub changes nothing

        verdicts = safety.check_quotes(source.quote_candidates, scrubber)
        assert [(v.index, v.verdict, v.reason) for v in verdicts] == [
            (1, 'safe', None), (2, 'excluded', 'text_leak')]
        assert verdicts[1].leaks == ['Anna']

        out = _assemble(source, scrubber=scrubber, quote_verdicts=verdicts)
        evidence = next(s for s in out['story']['body']['sections'] if s['kind'] == 'evidence')
        assert [(i['included'], i['safety']['verdict']) for i in evidence['items']] == [
            (True, 'safe'), (False, 'excluded')]
        assert evidence['items'][1]['safety'] == {'verdict': 'excluded', 'reason': 'text_leak',
                                                  'leaks': ['Anna']}
        assert out['story']['concerns'] == [
            'Quote [Q2] left out: the text still identified someone after a re-scrub.']

    def test_a_leak_the_rescrub_removes_keeps_the_quote(self):
        scrubber = Scrubber(['Anna'])
        text, leaks = safety.check_quote('Ask Anna about it.', scrubber)
        assert text == 'Ask [name] about it.' and leaks == []

    def test_an_excluded_quote_does_not_block_the_story_text(self):
        """check_text scans the story; an item already excluded is not the story."""
        scrubber = Scrubber(['Anna'])
        fields = {
            'title': 'A bridge', 'dek': 'It held.',
            'body': {'sections': [{'kind': 'evidence', 'items': [
                {'type': 'quote', 'text': 'Anna wrote this.', 'included': False,
                 'safety': {'verdict': 'excluded', 'reason': 'text_leak'}},
                {'type': 'quote', 'text': 'It held 12 kg.', 'included': True,
                 'safety': {'verdict': 'safe', 'reason': None}},
            ]}]},
        }

        class Quiet:
            def identifying_phrases(self, text):
                assert 'Anna' not in text                          # never sent to the model
                return [], 'gemini-test'

        cleaned, report = safety.check_text(fields, scrubber, checker=Quiet())
        assert report['leaks_found'] == [] and report['blockers'] == []
        items = cleaned['body']['sections'][0]['items']
        assert items[0]['text'] == 'Anna wrote this.'             # put back untouched
        assert items[0]['included'] is False
        assert items[1]['text'] == 'It held 12 kg.'

    def test_the_model_phrase_list_never_rewrites_a_url(self):
        scrubber = Scrubber([])

        class Flagging:
            def identifying_phrases(self, text):
                return ['annasbridges'], 'gemini-test'

        fields = {'body': {'sections': [{'kind': 'evidence', 'items': [
            {'type': 'link', 'url': 'https://annasbridges.example.com/test',
             'alt': 'annasbridges', 'included': True, 'safety': {'verdict': 'safe'}}]}]}}
        cleaned, _ = safety.check_text(fields, scrubber, checker=Flagging())
        item = cleaned['body']['sections'][0]['items'][0]
        assert item['url'] == 'https://annasbridges.example.com/test'
        assert item['alt'] == '[removed]'


class TestClipQuote:
    def test_short_text_is_untouched(self):
        assert clip_quote('Short. Sweet.') == 'Short. Sweet.'

    def test_cut_falls_back_to_a_word_boundary_without_sentences(self):
        text = 'word ' * 400
        out = clip_quote(text, limit=100)
        assert out.endswith('...') and len(out) <= 103
        assert not out[:-3].endswith(' ')

    def test_whitespace_is_normalised(self):
        assert clip_quote('one\n\ntwo   three') == 'one two three'


DRAFT = {
    'title': 'A dance that counted', 'title_options': [], 'dek': 'Three minutes.',
    'activity_slug': 'other', 'activity_label': 'A dance', 'receipt': {},
    'what_they_did': 'They danced.', 'tasks': [], 'what_it_counted_for': 'Credit.',
    'faq': [], 'images': [], 'hero_index': 0, 'search_phrases': [], 'concerns': [],
}


def _assemble(source, *, scrubber=None, quote_verdicts=None, link_verdicts=None):
    result = DraftResult(data=dict(DRAFT), model='gemini-test', prompt_version='story-draft/test',
                         usage={}, drafted_at='2026-09-11T00:00:00+00:00')
    return assemble(source, result, student_label='A student', tier='anonymized', verdicts=[],
                    scrubber=scrubber or Scrubber(['Maya Reyes']), slug_exists=lambda s: False,
                    story_id='story-1', quote_verdicts=quote_verdicts, link_verdicts=link_verdicts)


def test_the_prompt_labels_quotes_and_does_not_print_them_twice():
    from services.stories import prompt as prompt_mod
    source = _load([_text_block('It held 12 kg.'), _document_block(DOC_URL, 'notes.txt')],
                   objects={DOC_URL: b'Some notes.'})
    text = prompt_mod.build_prompt(source, student_label='A student', safe_images=[])
    assert "[Q1] (the student's own words, quoted on the page)" in text
    assert '[Q2] (From notes, quoted on the page)' in text
    assert text.count('It held 12 kg.') == 1
    assert text.count('Some notes.') == 1
    assert 'Do not invent quotations.' in text
    assert prompt_mod.PROMPT_VERSION == 'story-draft/2026-09-11.3'


def test_strip_extension_and_hostname_helpers():
    assert source_mod._strip_extension('Lab report.pdf') == 'Lab report'
    assert source_mod.hostname_of('https://www.youtube.com/watch?v=x') == 'youtube.com'
    assert source_mod.hostname_of('not a url') == ''


def test_document_title_drops_the_storage_stamp_and_the_extension():
    assert source_mod.document_title('Lab report.pdf') == 'Lab report'
    assert source_mod.document_title(
        '22222222-2222-2222-2222-222222222222_20260901_101500_Lab%20report.pdf') == 'Lab report'
    assert source_mod.document_title('evidence-tasks/x/notes.txt') == 'notes'
    assert source_mod.document_title('') == ''


def test_a_document_without_a_recorded_name_is_titled_from_its_path():
    url = ('https://auth.optioeducation.com/storage/v1/object/public/quest-evidence/'
           'evidence-tasks/11111111-1111-1111-1111-111111111111/'
           '22222222-2222-2222-2222-222222222222_20260901_101500_Reflection%20week%203.txt')
    block = {'id': 'd1', 'block_type': 'document', 'content': {'items': [{'url': url}]}}
    source = _load([block], objects={url: b'Some notes.'})
    assert source.tasks[0].quotes[0].caption == 'From Reflection week 3'
