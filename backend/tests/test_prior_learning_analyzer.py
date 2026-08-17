"""
The prior-learning analyzer's normalization step.

The model is asked for a credit split and cannot be trusted to return one. What
matters is not that the prompt is good but that a bad answer degrades into a
smaller honest one plus a flag — never into a tidy table that invents credit a
reviewer then rubber-stamps.

So: unknown subjects vanish (loudly), impossible credit is capped (loudly),
missing confidence reads as no confidence rather than certainty, and the
reviewer is told when the suggestion was made without reading the files.
"""

import pytest

from services import sis_prior_learning_analyzer as analyzer


def _normalize(raw, skipped=None, attachments=1, locked=None):
    return analyzer._normalize(raw, skipped=skipped or [], attachments=attachments,
                               locked=locked or [])


GOOD = {
    'summary': 'A junior year transcript from Cava Academy.',
    'school_name': 'Cava Academy',
    'started_on': '2024-08-20',
    'ended_on': '2025-05-30',
    'subjects': [{
        'subject': 'social_studies', 'credits': 1.0, 'confidence': 0.94,
        'rationale': 'US History appears with a passing grade.',
        'courses': [{'name': 'US History', 'credits': 1.0, 'term': 'full_year'}],
    }],
    'flags': [],
}


@pytest.mark.unit
class TestNormalize:
    def test_a_clean_suggestion_survives_intact(self):
        out = _normalize(GOOD)
        assert out['school_name'] == 'Cava Academy'
        assert out['started_on'] == '2024-08-20'
        assert out['subjects'][0]['credits'] == 1.0
        assert out['subjects'][0]['courses'][0]['name'] == 'US History'
        assert out['flags'] == []

    def test_an_invented_subject_is_dropped_and_the_reviewer_is_told(self):
        out = _normalize({**GOOD, 'subjects': [
            {'subject': 'underwater_basket_weaving', 'credits': 1.0}]})
        assert out['subjects'] == []
        assert any('unknown subject' in f for f in out['flags'])

    def test_impossible_credit_is_capped_rather_than_proposed(self):
        """A misread decimal ('10.0' for '1.0') is the realistic failure. Capping
        silently would hide it, so the cap comes with a flag."""
        out = _normalize({**GOOD, 'subjects': [
            {'subject': 'math', 'credits': 40, 'confidence': 0.9}]})
        assert out['subjects'][0]['credits'] == analyzer.MAX_CREDITS_PER_SUBJECT
        assert any('more than a student can earn' in f for f in out['flags'])

    def test_missing_confidence_is_no_confidence_not_full_confidence(self):
        out = _normalize({**GOOD, 'subjects': [{'subject': 'math', 'credits': 1.0}]})
        assert out['subjects'][0]['confidence'] == 0.0

    def test_courses_that_disagree_with_the_subject_total_are_flagged_not_fixed(self):
        out = _normalize({**GOOD, 'subjects': [{
            'subject': 'math', 'credits': 1.0, 'confidence': 0.8,
            'courses': [{'name': 'Algebra II', 'credits': 0.5, 'term': 'semester'}],
        }]})
        assert out['subjects'][0]['credits'] == 1.0
        assert out['subjects'][0]['courses'][0]['credits'] == 0.5
        assert any('add up to' in f for f in out['flags'])

    def test_a_text_only_record_says_no_files_were_read(self):
        out = _normalize(GOOD, attachments=0)
        assert any('No files were read' in f for f in out['flags'])

    def test_unread_evidence_is_named(self):
        out = _normalize(GOOD, skipped=['page3.pdf'])
        assert any('page3.pdf' in f for f in out['flags'])

    def test_a_junk_date_becomes_null_rather_than_reaching_a_transcript(self):
        out = _normalize({**GOOD, 'started_on': 'sometime in the fall'})
        assert out['started_on'] is None

    def test_a_course_with_an_unreadable_credit_falls_back_to_its_term(self):
        out = _normalize({**GOOD, 'subjects': [{
            'subject': 'math', 'credits': 0.5, 'confidence': 0.7,
            'courses': [{'name': 'Geometry', 'credits': 'half', 'term': 'semester'}],
        }]})
        assert out['subjects'][0]['courses'][0]['credits'] == 0.5

    def test_an_empty_answer_produces_no_subjects_rather_than_an_error(self):
        out = _normalize({})
        assert out['subjects'] == []
        assert out['summary'] == ''


@pytest.mark.unit
class TestUnreadableAttachments:
    """One bad file must not cost the reviewer the whole analysis.

    Found on the first real record: a family uploaded five transcripts, one of
    which was a permissions-encrypted export from their old school. Gemini
    answers a bare "400 Request contains an invalid argument" naming no file, so
    the entire analysis returned nothing and a reviewer had no idea why.
    """

    def test_a_permissions_encrypted_pdf_is_detected(self):
        assert analyzer._is_encrypted_pdf(b'%PDF-1.7\r\n7 0 obj /Encrypt 9 0 R')

    def test_an_ordinary_pdf_is_not(self):
        assert not analyzer._is_encrypted_pdf(b'%PDF-1.4\r\n1 0 obj <</Type/Catalog>>')

    def test_a_non_pdf_is_left_alone(self):
        """An image whose bytes happen to contain /Encrypt is still readable."""
        assert not analyzer._is_encrypted_pdf(b'\x89PNG\r\n\x1a\n/Encrypt')

    def test_a_skipped_file_is_named_with_its_reason(self):
        out = _normalize(GOOD, skipped=['transcript.pdf (password-protected)'])
        flag = next(f for f in out['flags'] if 'transcript.pdf' in f)
        assert 'password-protected' in flag

    def test_locked_files_are_reported_separately_from_the_flag_text(self):
        """The page asks for a password against the file that needs one, so the
        names have to arrive as data and not only inside prose."""
        out = _normalize(GOOD, skipped=['t.pdf (password-protected)'], locked=['t.pdf'])
        assert out['locked_files'] == ['t.pdf']

    def test_nothing_locked_means_no_password_prompt(self):
        assert _normalize(GOOD)['locked_files'] == []


@pytest.mark.unit
class TestUnlockingPdfs:
    """A password turns an unreadable transcript into a readable one.

    Two kinds of "locked" arrive here and only one needs a human: an official
    export with permissions encryption and an EMPTY user password (every viewer
    opens it, so the family doesn't know it's locked), and a genuinely sealed
    file. The first must need no password at all.
    """

    @staticmethod
    def _pdf(**encryption):
        import fitz
        doc = fitz.open()
        doc.new_page().insert_text((72, 72), 'Algebra II A 1.0 credit')
        return doc.tobytes(**encryption)

    def test_a_plain_pdf_needs_no_password(self):
        out = analyzer.unlock_pdf(self._pdf())
        assert out and b'/Encrypt' not in out

    def test_a_permissions_locked_export_opens_with_no_password(self):
        """The common case, and the one worth getting right: nobody is asked."""
        import fitz
        blob = self._pdf(encryption=fitz.PDF_ENCRYPT_AES_256,
                         owner_pw='owner', user_pw='')
        assert analyzer._is_encrypted_pdf(blob)
        out = analyzer.unlock_pdf(blob)
        assert out and b'/Encrypt' not in out

    def test_a_sealed_pdf_opens_with_the_right_password(self):
        import fitz
        blob = self._pdf(encryption=fitz.PDF_ENCRYPT_AES_256,
                         owner_pw='owner', user_pw='hunter2')
        out = analyzer.unlock_pdf(blob, ['nope', 'hunter2'])
        assert out and b'/Encrypt' not in out

    def test_a_sealed_pdf_stays_shut_on_the_wrong_password(self):
        import fitz
        blob = self._pdf(encryption=fitz.PDF_ENCRYPT_AES_256,
                         owner_pw='owner', user_pw='hunter2')
        assert analyzer.unlock_pdf(blob, ['wrong', '']) is None

    def test_no_password_offered_leaves_a_sealed_pdf_shut(self):
        import fitz
        blob = self._pdf(encryption=fitz.PDF_ENCRYPT_AES_256,
                         owner_pw='owner', user_pw='hunter2')
        assert analyzer.unlock_pdf(blob) is None

    def test_junk_bytes_do_not_raise(self):
        assert analyzer.unlock_pdf(b'not a pdf at all') is None

    def test_the_decrypted_copy_keeps_every_page(self):
        """The decrypted copy REPLACES the family's upload, so a re-save that
        dropped pages would destroy the original with no way back."""
        import fitz
        doc = fitz.open()
        for n in range(4):
            doc.new_page().insert_text((72, 72), f'page {n}')
        blob = doc.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256,
                           owner_pw='owner', user_pw='pw')
        out = analyzer.unlock_pdf(blob, ['pw'])
        with fitz.open(stream=out, filetype='pdf') as check:
            assert check.page_count == 4
            assert not check.needs_pass

    def test_a_failed_round_trip_is_refused_rather_than_written_back(self, monkeypatch):
        """If re-serializing produced something unopenable, returning it would
        overwrite a good encrypted file with a broken plain one."""
        import fitz
        doc = fitz.open()
        doc.new_page()
        blob = doc.tobytes()
        monkeypatch.setattr(fitz.Document, 'tobytes', lambda self, **k: b'garbage')
        assert analyzer.unlock_pdf(blob) is None


@pytest.mark.unit
class TestReplacingTheStoredFile:
    """Overwriting in place, at the same path, so every URL already recorded
    against the evidence keeps working and no row needs editing."""

    def _client(self, fail=False):
        from unittest.mock import Mock
        client = Mock()
        store = client.storage.from_.return_value
        if fail:
            store.update.side_effect = RuntimeError('storage down')
        return client, store

    def test_it_writes_the_decrypted_bytes_to_the_same_path(self):
        client, store = self._client()
        ok = analyzer._replace_stored_file(client, 'quest-evidence',
                                           'prior-learning/g/x.pdf', b'%PDF-clean',
                                           'application/pdf')
        assert ok
        args = store.update.call_args[0]
        assert args[0] == 'prior-learning/g/x.pdf'
        assert args[1] == b'%PDF-clean'

    def test_a_storage_failure_costs_the_run_nothing(self):
        """Best effort: the analysis continues on the in-memory copy, and the
        reviewer is simply asked for the password again next time."""
        client, _ = self._client(fail=True)
        assert analyzer._replace_stored_file(client, 'quest-evidence', 'p.pdf',
                                             b'x', None) is False


@pytest.mark.unit
class TestTermUnits:
    def test_a_full_year_is_one_credit_and_a_semester_is_half(self):
        """The unit the whole feature rests on: 1.0 = 2000 XP, 0.5 = 1000."""
        from services.sis_prior_learning_ai import TERM_CREDITS
        from services.transfer_credit_service import credits_to_xp
        assert credits_to_xp(TERM_CREDITS['full_year']) == 2000
        assert credits_to_xp(TERM_CREDITS['semester']) == 1000


@pytest.mark.unit
class TestSuggestionIsNeverAnAward:
    def test_storing_a_suggestion_cannot_write_awarded_credits(self, monkeypatch):
        """The safety property behind 'always propose, never apply': whatever the
        model returns, the columns a transcript reads are untouched."""
        from unittest.mock import Mock
        from services import sis_prior_learning_ai as ai

        written = {}
        chain = Mock()
        chain.update.side_effect = lambda row: written.update(row) or chain
        chain.eq.return_value = chain
        chain.execute.return_value = Mock(data=[{'id': 'r1'}])
        client = Mock()
        client.table.return_value = chain
        monkeypatch.setattr(ai, 'get_supabase_admin_client', lambda: client)

        ai.store_suggestion('r1', 'org1', {'subjects': [], 'awarded_credits': {'math': 99}},
                            'gemini-test')

        assert 'awarded_credits' not in written
        assert 'credited_at' not in written
        assert written['ai_status'] == 'complete'

    def test_the_analyzer_never_writes_transfer_credit(self):
        import inspect
        source = inspect.getsource(analyzer)
        assert 'transfer_credit_service' not in source
