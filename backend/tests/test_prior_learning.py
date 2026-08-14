"""
Prior learning records — the guardian-submitted evidence of learning done before
or outside Optio, and the credit award that comes out of review.

The properties that matter are the ones where being wrong puts a number on a
transcript, or shows a family something the school didn't decide:

1. An award may only name real school subjects, and may not be absurd. The
   credits box feeds a high-school transcript; a fat-fingered 100 must not
   reach it, and a subject the transcript has never heard of must fail loudly
   rather than be silently dropped (the reviewer would think they'd awarded it).
2. A guardian can't set their own status, review notes or credits by posting
   them alongside the fields they own.
3. Rejecting a record takes back any credit an earlier acceptance granted.
4. The AI payload is a SUGGESTION input, carries no student identity, and never
   writes the award column.
"""

import pytest

from services import sis_prior_learning_ai as ai
from services import sis_prior_learning_service as prior
from utils.school_subjects import SCHOOL_SUBJECTS


@pytest.mark.unit
class TestAwardedCreditsAreTranscriptSafe:
    def test_a_real_subject_survives(self):
        assert prior.clean_awarded_credits({'math': 1}) == {'math': 1.0}

    def test_quarter_credits_survive_because_schools_award_them(self):
        assert prior.clean_awarded_credits({'fine_arts': 0.25}) == {'fine_arts': 0.25}

    def test_an_unknown_subject_raises_rather_than_vanishing(self):
        """Dropping it silently would tell the reviewer they awarded credit they
        didn't."""
        with pytest.raises(ValueError, match='Unknown subject'):
            prior.clean_awarded_credits({'underwater_basket_weaving': 1})

    def test_a_typo_of_one_hundred_credits_is_refused(self):
        with pytest.raises(ValueError, match='between 0 and'):
            prior.clean_awarded_credits({'math': 100})

    def test_negative_credit_is_refused(self):
        with pytest.raises(ValueError, match='between 0 and'):
            prior.clean_awarded_credits({'math': -1})

    def test_non_numeric_credit_is_refused(self):
        with pytest.raises(ValueError, match='must be a number'):
            prior.clean_awarded_credits({'math': 'one'})

    def test_zero_is_dropped_so_an_empty_box_is_not_an_award(self):
        assert prior.clean_awarded_credits({'math': 0, 'science': 1}) == {'science': 1.0}

    def test_a_non_dict_is_no_award_at_all(self):
        assert prior.clean_awarded_credits(None) == {}
        assert prior.clean_awarded_credits([['math', 1]]) == {}


@pytest.mark.unit
class TestGuardiansCannotWriteTheOfficesColumns:
    POSTED = {
        'title': 'Algebra I at Riverside Co-op',
        'description': 'A full year.',
        'provider': 'Riverside Co-op',
        'subject_hint': 'math',
        # Everything below is the office's to set, posted by a hopeful client.
        'status': 'accepted',
        'awarded_credits': {'math': 4},
        'review_notes': 'Looks great to me!',
        'reviewed_by': 'some-user-id',
        'ai_suggestion': {'subjects': [{'subject': 'math', 'credits': 4}]},
    }

    def test_only_the_family_half_is_kept(self):
        fields = prior._record_fields(self.POSTED)
        assert fields['title'] == 'Algebra I at Riverside Co-op'
        for owned_by_staff in ('status', 'awarded_credits', 'review_notes',
                               'reviewed_by', 'ai_suggestion'):
            assert owned_by_staff not in fields

    def test_a_subject_hint_must_be_a_real_subject(self):
        assert prior._record_fields({'subject_hint': 'math'})['subject_hint'] == 'math'
        assert prior._record_fields({'subject_hint': 'vibes'})['subject_hint'] is None

    def test_a_half_typed_date_is_dropped_not_fatal(self):
        """It's one optional box on a form a parent fills out once."""
        assert prior._record_fields({'started_on': '2024-09-01'})['started_on'] == '2024-09-01'
        assert prior._record_fields({'started_on': '2024-13-45'})['started_on'] is None
        assert prior._record_fields({'started_on': 'last fall'})['started_on'] is None

    def test_nonsense_hours_are_dropped(self):
        assert prior._record_fields({'hours_estimate': '120'})['hours_estimate'] == 120.0
        assert prior._record_fields({'hours_estimate': -5})['hours_estimate'] is None
        assert prior._record_fields({'hours_estimate': 'lots'})['hours_estimate'] is None

    def test_a_blank_title_becomes_none_so_the_route_can_refuse_it(self):
        assert prior._record_fields({'title': '   '})['title'] is None


@pytest.mark.unit
class TestReviewLifecycle:
    def test_a_record_the_family_has_not_submitted_is_not_reviewable(self, monkeypatch):
        monkeypatch.setattr(prior, 'get_record',
                            lambda rid, oid: {'id': rid, 'status': 'draft'})
        result = prior.review('r1', 'o1', 'staff1', 'accepted')
        assert 'not submitted' in result['error']

    def test_an_unknown_review_status_is_refused(self):
        assert 'Unknown review status' in prior.review('r1', 'o1', 'staff1', 'submitted')['error']

    def test_rejecting_takes_back_credit_an_earlier_acceptance_granted(self, monkeypatch):
        """Otherwise the transcript keeps counting a record the school withdrew."""
        captured = {}
        monkeypatch.setattr(prior, 'get_record', lambda rid, oid: {
            'id': rid, 'status': 'accepted', 'awarded_credits': {'math': 1.0}, 'evidence': [],
        })
        monkeypatch.setattr(prior, '_admin', lambda: _FakeClient(captured))

        prior.review('r1', 'o1', 'staff1', 'rejected', notes='Evidence did not match.')

        assert captured['update']['awarded_credits'] == {}
        assert captured['update']['credited_at'] is None
        assert captured['update']['credited_by'] is None

    def test_accepting_with_empty_boxes_is_recognition_without_credit(self, monkeypatch):
        captured = {}
        monkeypatch.setattr(prior, 'get_record',
                            lambda rid, oid: {'id': rid, 'status': 'submitted', 'evidence': []})
        monkeypatch.setattr(prior, '_admin', lambda: _FakeClient(captured))

        prior.review('r1', 'o1', 'staff1', 'accepted', awarded_credits={})

        assert captured['update']['awarded_credits'] == {}
        # No award means nothing was credited, so the credit stamps stay empty.
        assert captured['update']['credited_at'] is None

    def test_a_bad_award_fails_the_whole_accept(self, monkeypatch):
        """Half-accepting — status moved, credit refused — is the worst outcome."""
        monkeypatch.setattr(prior, 'get_record',
                            lambda rid, oid: {'id': rid, 'status': 'submitted', 'evidence': []})
        result = prior.review('r1', 'o1', 'staff1', 'accepted',
                              awarded_credits={'astrology': 1})
        assert 'Unknown subject' in result['error']


@pytest.mark.unit
class TestFamilyEditWindow:
    def test_the_family_may_still_change_a_record_the_office_has_not_picked_up(self):
        assert set(prior.FAMILY_EDITABLE) == {'draft', 'submitted'}

    def test_once_in_review_it_is_frozen_for_the_family(self):
        for status in ('under_review', 'accepted', 'rejected'):
            assert status not in prior.FAMILY_EDITABLE


@pytest.mark.unit
class TestEvidenceMatchesTaskEvidence:
    def test_the_five_kinds_are_the_ones_a_task_accepts(self):
        """A parent's upload and a student's task evidence are the same artifact
        in the portfolio, so the vocabularies must not drift."""
        assert set(prior.EVIDENCE_TYPES) == {'text', 'link', 'video', 'image', 'document'}

    def test_a_csv_export_is_accepted_as_a_document(self):
        """2026-08-14: a parent's first real upload was two Skill Struck CSV
        exports and both were refused. The paperwork another school hands you is
        as often an export as a scan.

        Both gates have to pass — the extension allowlist AND the magic-byte MIME
        check, which reports a comma-separated file as text/csv, not text/plain.
        """
        from config.constants import ALLOWED_DOCUMENT_EXTENSIONS, ALLOWED_FILE_EXTENSIONS
        from utils.file_validator import ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES
        assert 'csv' in ALLOWED_DOCUMENT_EXTENSIONS
        assert '.csv' in ALLOWED_FILE_EXTENSIONS
        assert 'csv' in ALLOWED_EXTENSIONS
        assert 'text/csv' in ALLOWED_MIME_TYPES

    def test_a_real_csv_passes_the_whole_validator(self):
        """The allowlists agreeing on paper is not the same as a file getting
        through — this runs an actual export past the real magic-byte check."""
        from utils.file_validator import FileValidator
        result = FileValidator().validate_file(
            'skill-struck-export.csv',
            b'Student,Course,Grade,Credits\nAda Byron,Algebra I,A,1.0\n')
        assert result.is_valid, result.error_message

    def test_a_spreadsheet_is_still_refused_and_says_so(self):
        """xlsx is a zip to libmagic, so accepting it would mean accepting
        application/zip for every upload on the platform. Refused on purpose —
        and the message names the extension, which is what the family needs."""
        from utils.file_validator import FileValidator
        result = FileValidator().validate_file('grades.xlsx', b'PK\x03\x04rest')
        assert not result.is_valid
        assert '.xlsx' in result.error_message

    def test_prior_learning_uploads_land_in_the_task_evidence_bucket(self):
        from services.media_upload_service import DEFAULT_BUCKETS, STORAGE_PATH_TEMPLATES
        assert DEFAULT_BUCKETS['prior_learning'] == DEFAULT_BUCKETS['task_evidence']
        assert 'prior_learning' in STORAGE_PATH_TEMPLATES


@pytest.mark.unit
class TestAnalysisPayload:
    RECORD = {
        'title': 'Four years of piano',
        'description': 'Weekly lessons.',
        'provider': 'Mrs. Alvarez',
        'subject_hint': 'fine_arts',
        'started_on': '2021-09-01',
        'hours_estimate': 300.0,
        'student_user_id': 'student-uuid',
        'awarded_credits': {'fine_arts': 1.0},
        'evidence': [
            {'evidence_type': 'text', 'content': 'She plays Chopin now.', 'title': None},
            {'evidence_type': 'document', 'url': 'https://x/recital.pdf',
             'file_name': 'recital.pdf', 'content_type': 'application/pdf', 'title': 'Recital'},
            {'evidence_type': 'link', 'url': 'https://x/portfolio', 'title': 'Portfolio'},
        ],
    }

    def test_the_family_claim_is_carried_verbatim(self):
        claim = ai.build_analysis_payload(self.RECORD)['claim']
        assert claim['title'] == 'Four years of piano'
        assert claim['family_subject_guess'] == 'fine_arts'
        assert claim['hours_estimate'] == 300.0

    def test_the_student_is_never_named_in_the_payload(self):
        """What learning is worth doesn't depend on whose it is, and identity
        left out of the payload stays out of a third party's logs."""
        import json
        assert 'student-uuid' not in json.dumps(ai.build_analysis_payload(self.RECORD))

    def test_the_existing_award_is_not_shown_to_the_analyzer(self):
        """A suggestion that just parrots the award back is worthless."""
        payload = ai.build_analysis_payload(self.RECORD)
        assert 'awarded_credits' not in payload
        assert 'awarded_credits' not in payload['claim']

    def test_readable_evidence_arrives_inline_and_files_arrive_as_urls(self):
        entries = ai.build_analysis_payload(self.RECORD)['evidence']
        assert entries[0]['text'] == 'She plays Chopin now.'
        assert entries[1]['file_url'] == 'https://x/recital.pdf'
        assert entries[2]['url'] == 'https://x/portfolio'

    def test_a_parents_note_on_a_file_reaches_the_analyzer(self):
        """Often the only thing that says which year a scanned report card is
        from, so it must not be dropped on the way in."""
        payload = ai.build_analysis_payload({'evidence': [
            {'evidence_type': 'document', 'url': 'https://x/rc.pdf',
             'content': '10th grade, first semester'},
        ]})
        assert payload['evidence'][0]['note'] == '10th grade, first semester'

    def test_a_file_with_no_note_carries_no_empty_note_key(self):
        payload = ai.build_analysis_payload({'evidence': [
            {'evidence_type': 'document', 'url': 'https://x/rc.pdf', 'content': None},
        ]})
        assert 'note' not in payload['evidence'][0]

    def test_attachments_are_counted_so_a_caller_knows_it_needs_vision(self):
        assert ai.build_analysis_payload(self.RECORD)['attachment_count'] == 1

    def test_the_analyzer_is_handed_the_same_subject_vocabulary_the_award_uses(self):
        keys = [s['key'] for s in ai.build_analysis_payload(self.RECORD)['subjects']]
        assert keys == SCHOOL_SUBJECTS

    def test_a_record_with_no_evidence_still_builds(self):
        payload = ai.build_analysis_payload({'title': 'Bare'})
        assert payload['evidence'] == []
        assert payload['attachment_count'] == 0

    def test_storing_a_suggestion_never_touches_the_award(self, monkeypatch):
        captured = {}
        monkeypatch.setattr(ai, 'get_supabase_admin_client', lambda: _FakeClient(captured))
        ai.store_suggestion('r1', 'o1', {'subjects': []}, model='some-model')
        assert 'awarded_credits' not in captured['update']
        assert captured['update']['ai_status'] == 'complete'


class _FakeClient:
    """Captures the single update() a service call makes."""

    def __init__(self, captured):
        self._captured = captured

    def table(self, name):
        self._captured['table'] = name
        return self

    def update(self, values):
        self._captured['update'] = values
        return self

    def eq(self, *_args):
        return self

    def execute(self):
        return type('R', (), {'data': [{'id': 'r1'}]})()
