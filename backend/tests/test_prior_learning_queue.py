"""
The prior-learning review queue (services/sis_prior_learning_queue.py).

The properties that matter:

1. Approve validates everything BEFORE the record changes. Accept and
   transcribe became one step so a record can no longer sit accepted but off
   the transcript; a bad course total must not recreate that half-state.
2. Sending a record back needs a family to send it to, a reason, and a record
   that is still waiting. Sending again returns it to the queue.
3. Overlap warnings name what matched: a course already on the transcript
   (Algebra I and algebra 1 are one course), a school already on it, a subject
   already full.
4. Alerts reach the superadmins. Optio Academy has no office staff, so before
   this a submission there notified nobody.
5. The digest is silent when nothing waits.
6. Transferred credit is priced from pricing.json: accredited is free, the
   rest costs the student's credit price, half for a school that uses Optio.
   Only the reviewing office may mark a school accredited.
"""

from datetime import datetime, timezone

import pytest

from services import sis_prior_learning_queue as queue
from services import sis_prior_learning_service as prior
from services import transfer_credit_service as credit


@pytest.fixture(autouse=True)
def _quiet(monkeypatch):
    logged = []
    monkeypatch.setattr(queue, 'log_event',
                        lambda rid, kind, actor=None, **kw: logged.append((rid, kind, kw)))
    monkeypatch.setattr(queue, 'queue_analysis', lambda *a, **k: None)
    return logged


def _record(**kw):
    base = {'id': 'r1', 'organization_id': 'o1', 'reviewer_org_id': 'o1',
            'student_user_id': 's1', 'submitted_by': 'p1', 'source': 'family',
            'status': 'under_review', 'title': 'Lincoln High transcript', 'evidence': [{'id': 'e1'}]}
    base.update(kw)
    return base


@pytest.mark.unit
class TestApproveIsOneStepAndValidatesFirst:
    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        self.reviews = []
        self.converts = []
        monkeypatch.setattr(prior, 'get_record', lambda rid, oid: _record())
        monkeypatch.setattr(credit, 'already_converted', lambda rid: None)

        def fake_review(rid, oid, uid, status, notes=None, awarded_credits=None):
            self.reviews.append((status, awarded_credits))
            return {'record': _record(status=status, awarded_credits=awarded_credits)}
        monkeypatch.setattr(prior, 'review', fake_review)
        # The fee is stored on the record as it is approved.
        self.fees = []
        fees = self.fees

        class _FeeRepo:
            def update_record(self, rid, fields):
                fees.append(fields)
                return fields

            def funding_sources(self, sid, oid):
                return []
        monkeypatch.setattr(queue, '_repo', lambda: _FeeRepo())

        def fake_convert(record, award, uid):
            self.converts.append(award)
            return {'transfer_credit': {'id': 't1', 'school_name': award['school_name']},
                    'action': 'created'}
        monkeypatch.setattr(credit, 'convert_prior_learning', fake_convert)

    def test_it_accepts_and_transcribes(self, _quiet):
        result = queue.approve('r1', 'o1', 'staff', {
            'school_name': 'Lincoln High', 'subject_credits': {'math': 1.0},
            'course_names': {'math': [{'name': 'Algebra I', 'credits': 1.0}]},
        })
        assert result['record']['transfer_credit']['id'] == 't1'
        assert self.reviews == [('accepted', {'math': 1.0})]
        assert self.converts[0]['school_name'] == 'Lincoln High'
        assert ('r1', 'transcribed') in [(r, k) for r, k, _ in _quiet]

    def test_courses_that_do_not_add_up_change_nothing(self):
        result = queue.approve('r1', 'o1', 'staff', {
            'school_name': 'Lincoln High', 'subject_credits': {'math': 1.0},
            'course_names': {'math': [{'name': 'Algebra I', 'credits': 0.5}]},
        })
        assert 'must equal' in result['error']
        assert self.reviews == [] and self.converts == []

    def test_a_missing_school_changes_nothing(self):
        result = queue.approve('r1', 'o1', 'staff', {'subject_credits': {'math': 1}})
        assert 'Name the school' in result['error']
        assert self.reviews == []

    def test_an_absurd_credit_changes_nothing(self):
        result = queue.approve('r1', 'o1', 'staff', {'school_name': 'X', 'subject_credits': {'math': 40}})
        assert 'error' in result
        assert self.reviews == []

    def test_no_credit_at_all_is_not_an_approval(self):
        result = queue.approve('r1', 'o1', 'staff', {'school_name': 'X', 'subject_credits': {}})
        assert 'at least one subject' in result['error']

    def test_a_record_already_on_the_transcript_is_refused(self, monkeypatch):
        monkeypatch.setattr(credit, 'already_converted', lambda rid: {'id': 't0'})
        result = queue.approve('r1', 'o1', 'staff', {'school_name': 'X', 'subject_credits': {'math': 1}})
        assert result['status'] == 409

    def test_the_watching_microschool_cannot_approve(self, monkeypatch):
        monkeypatch.setattr(prior, 'get_record', lambda rid, oid: _record(reviewer_org_id='academy'))
        result = queue.approve('r1', 'o1', 'staff', {'school_name': 'X', 'subject_credits': {'math': 1}})
        assert result['status'] == 403


class _Repo:
    def __init__(self, **data):
        self.data = data
        self.updates = []

    def update_record(self, rid, fields):
        self.updates.append(fields)
        return {**_record(), **fields}

    def users(self, ids, columns):
        return [{'id': i, 'first_name': 'Pat', 'email': 'pat@example.com'} for i in ids]

    def superadmins(self):
        return self.data.get('superadmins', [])

    def count_by_status(self, statuses):
        return sum(self.data.get('counts', {}).get(s, 0) for s in statuses)

    def count_created_since(self, since):
        return 0

    def accepted_with_credit(self):
        return []

    def oldest_waiting(self, statuses):
        return None


@pytest.mark.unit
class TestSendingARecordBack:
    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        self.repo = _Repo()
        self.notified = []
        monkeypatch.setattr(queue, '_repo', lambda: self.repo)
        monkeypatch.setattr(queue, '_notify_family_info_request', self.notified.append)
        monkeypatch.setattr(prior, 'get_record', lambda rid, oid: _record())

    def test_it_unlocks_the_record_and_tells_the_family(self, _quiet):
        result = queue.request_info('r1', 'o1', 'staff', 'Page 2 is missing.')
        assert result['record']['status'] == 'needs_info'
        assert self.repo.updates[0]['review_notes'] == 'Page 2 is missing.'
        assert self.notified and self.notified[0]['status'] == 'needs_info'
        assert ('r1', 'info_requested') in [(r, k) for r, k, _ in _quiet]

    def test_a_reason_is_required(self):
        assert 'error' in queue.request_info('r1', 'o1', 'staff', '   ')
        assert self.repo.updates == []

    def test_an_office_filed_record_has_no_family_to_ask(self, monkeypatch):
        monkeypatch.setattr(prior, 'get_record', lambda rid, oid: _record(source='staff'))
        assert 'no family' in queue.request_info('r1', 'o1', 'staff', 'More please')['error']

    def test_a_decided_record_cannot_be_sent_back(self, monkeypatch):
        monkeypatch.setattr(prior, 'get_record', lambda rid, oid: _record(status='accepted'))
        assert 'error' in queue.request_info('r1', 'o1', 'staff', 'More please')


@pytest.mark.unit
class TestSendingAgain:
    def test_a_sent_back_record_returns_to_the_queue(self, monkeypatch, _quiet):
        sent = []
        monkeypatch.setattr(prior, 'get_own_record',
                            lambda *a, **k: _record(status='needs_info'))
        monkeypatch.setattr(prior, 'notify_reviewers', lambda rec, resent=False: sent.append(resent))

        class _Table:
            def update(self, fields):
                self.fields = fields
                return self

            def eq(self, *a):
                return self

            def execute(self):
                return type('R', (), {'data': [_record(**self.fields)]})()

        monkeypatch.setattr(prior, '_admin', lambda: type('C', (), {'table': lambda s, n: _Table()})())
        result = prior.submit_record('r1', 'o1', 'p1')
        assert result['record']['status'] == 'submitted'
        assert sent == [True]
        assert ('r1', 'resubmitted') in [(r, k) for r, k, _ in _quiet]

    def test_a_record_in_review_cannot_be_sent_again(self, monkeypatch):
        monkeypatch.setattr(prior, 'get_own_record', lambda *a, **k: _record(status='under_review'))
        assert 'already been submitted' in prior.submit_record('r1', 'o1', 'p1')['error']


def _progress(**earned):
    subjects = []
    for key, req in (('math', 3.0), ('science', 3.0), ('electives', 6.0)):
        subjects.append({'subject': key, 'name': key.title(), 'required': req,
                         'earned': earned.get(key, 0.0), 'pending': 0.0})
    return {'subjects': subjects}


@pytest.mark.unit
class TestOverlapWarnings:
    TRANSFER = [{'school_name': 'Lincoln High School',
                 'course_names': {'math': [{'name': 'Algebra 1', 'credits': 1.0}]},
                 'subject_xp': {'math': 2000}}]

    def _rec(self, courses, school='Riverside Academy', subject='math', credits=1.0, **kw):
        return _record(ai_suggestion={'school_name': school, 'subjects': [
            {'subject': subject, 'credits': credits,
             'courses': [{'name': c, 'credits': 1.0} for c in courses]}]}, **kw)

    def test_the_same_course_written_two_ways_is_caught(self):
        rec = self._rec(['Algebra I'])
        kinds = [o['kind'] for o in queue.overlaps_for(rec, [rec], self.TRANSFER, _progress())]
        assert 'course_on_transcript' in kinds

    def test_a_different_course_is_not_flagged(self):
        rec = self._rec(['Geometry'])
        assert queue.overlaps_for(rec, [rec], self.TRANSFER, _progress()) == []

    def test_a_course_in_another_open_record_is_caught(self):
        rec = self._rec(['Biology'], subject='science')
        other = self._rec(['Biology'], subject='science', id='r2', title='Co-op science')
        found = queue.overlaps_for(rec, [rec, other], [], _progress())
        assert found[0]['kind'] == 'course_in_other_record'
        assert 'Co-op science' in found[0]['message']

    def test_a_school_already_on_the_transcript_is_named(self):
        rec = self._rec(['Geometry'], school='Lincoln High School')
        kinds = [o['kind'] for o in queue.overlaps_for(rec, [rec], self.TRANSFER, _progress())]
        assert 'school_on_transcript' in kinds

    def test_a_full_subject_is_named_but_electives_never_fill(self):
        rec = self._rec(['Geometry'])
        found = queue.overlaps_for(rec, [rec], [], _progress(math=3.0))
        assert [o['kind'] for o in found] == ['subject_full']
        elective = self._rec(['Pottery'], subject='electives')
        assert queue.overlaps_for(elective, [elective], [], _progress(electives=9.0)) == []

    def test_a_transcribed_record_has_nothing_left_to_check(self):
        rec = self._rec(['Algebra I'], transfer_credit={'id': 't1'})
        assert queue.overlaps_for(rec, [rec], self.TRANSFER, _progress()) == []


@pytest.mark.unit
class TestDiplomaProgress:
    def test_transfer_optio_pending_and_suggested_are_kept_apart(self, monkeypatch):
        class R:
            def subject_xp(self, sid):
                return [{'school_subject': 'math', 'xp_amount': 4000}]
        monkeypatch.setattr(queue, '_repo', lambda: R())
        records = [
            {'status': 'accepted', 'awarded_credits': {'math': 0.5}, 'transfer_credit': None},
            {'status': 'submitted', 'ai_suggestion': {'subjects': [{'subject': 'science', 'credits': 1}]}},
        ]
        transfer = [{'subject_xp': {'math': 2000}}]
        out = queue.diploma_progress('s1', records, transfer)
        math = next(s for s in out['subjects'] if s['subject'] == 'math')
        science = next(s for s in out['subjects'] if s['subject'] == 'science')
        assert (math['earned'], math['transfer'], math['optio'], math['pending']) == (2.0, 1.0, 1.0, 0.5)
        assert math['remaining'] == 0.5
        assert science['suggested'] == 1.0


@pytest.mark.unit
class TestStudentQueueOrder:
    def test_the_longest_wait_comes_first_and_finished_students_last(self, monkeypatch):
        rows = [
            {'id': 'a', 'student_user_id': 'done', 'organization_id': 'o1', 'status': 'accepted',
             'awarded_credits': {}, 'created_at': '2026-01-01', 'updated_at': '2026-10-12'},
            {'id': 'b', 'student_user_id': 'new', 'organization_id': 'o1', 'status': 'submitted',
             'awarded_credits': {}, 'created_at': '2026-10-12', 'updated_at': '2026-10-12'},
            {'id': 'c', 'student_user_id': 'old', 'organization_id': 'o1', 'status': 'under_review',
             'awarded_credits': {}, 'created_at': '2026-09-01', 'updated_at': '2026-09-01'},
            {'id': 'd', 'student_user_id': 'paper', 'organization_id': 'o1', 'status': 'accepted',
             'awarded_credits': {'math': 1}, 'created_at': '2026-08-01', 'updated_at': '2026-08-02'},
        ]

        class R:
            client = None

            def queue_rows(self, org_ids):
                return rows

            def users(self, ids, cols):
                return [{'id': i, 'first_name': i} for i in ids]
        monkeypatch.setattr(queue, '_repo', lambda: R())
        monkeypatch.setattr(queue, 'queue_org_ids', lambda org: ['o1'])
        monkeypatch.setattr(credit, 'conversions_for_records', lambda ids: {})
        from repositories.organization_repository import OrganizationRepository
        monkeypatch.setattr(OrganizationRepository, 'names_for', lambda self, ids: {'o1': 'Optio Academy'})

        out = queue.student_queue('o1')
        assert [s['student_id'] for s in out['students']] == ['old', 'new', 'paper', 'done']
        paper = out['students'][2]
        assert paper['not_transcribed'] == 1 and paper['needs_action']
        assert out['totals']['waiting'] == 2


@pytest.mark.unit
class TestAlerts:
    def test_superadmins_hear_about_a_submission_with_a_console_link(self, monkeypatch):
        sent = []

        class N:
            def create_notification(self, **kw):
                sent.append(kw)
        import services.notification_service as ns
        import services.school_inbox_service as inbox
        monkeypatch.setattr(ns, 'NotificationService', N)
        monkeypatch.setattr(inbox, 'admin_recipient_ids', lambda org: [])
        monkeypatch.setattr(queue, 'superadmin_ids', lambda: ['tanner'])
        monkeypatch.setattr(prior, '_attach_names',
                            lambda recs: [{**r, 'student_name': 'Ada', 'organization_name': 'Optio Academy'}
                                          for r in recs])
        prior.notify_reviewers(_record())
        assert [n['user_id'] for n in sent] == ['tanner']
        assert sent[0]['link'].startswith('https://sis.optioeducation.com/prior-learning?organization_id=')
        assert sent[0]['link'].endswith('&student=s1')

    def test_the_digest_is_silent_when_nothing_waits(self, monkeypatch):
        mailed = []
        monkeypatch.setattr(queue, '_repo', lambda: _Repo(superadmins=[{'email': 't@x.com'}]))
        monkeypatch.setattr(credit, 'conversions_for_records', lambda ids: {})
        import services.email_service as es
        monkeypatch.setattr(es.email_service, 'send_templated_email', lambda **kw: mailed.append(kw) or True)
        assert queue.daily_digest()['sent'] == 0
        assert mailed == []

    def test_the_digest_goes_to_every_superadmin_when_something_waits(self, monkeypatch):
        mailed = []
        monkeypatch.setattr(queue, '_repo', lambda: _Repo(
            superadmins=[{'email': 't@x.com'}, {'email': None}], counts={'submitted': 2}))
        monkeypatch.setattr(credit, 'conversions_for_records', lambda ids: {})
        import services.email_service as es
        monkeypatch.setattr(es.email_service, 'send_templated_email', lambda **kw: mailed.append(kw) or True)
        out = queue.daily_digest(datetime(2026, 10, 13, 14, tzinfo=timezone.utc))
        assert out['sent'] == 1 and out['waiting'] == 2
        assert mailed[0]['template_name'] == 'prior_learning_daily_digest'


@pytest.mark.unit
class TestPortfolio:
    """Accepted prior learning shows in the portfolio with its documents; a
    document the family marked private never does (Tanner, 2026-10-13)."""

    def _repo(self, monkeypatch, docs):
        asked = {}

        class R:
            def accepted_for_portfolio(self, sid):
                return [{'id': 'r1', 'title': 'Algebra', 'awarded_credits': {'math': 1, 'science': 0.5}}]

            def public_evidence(self, ids):
                asked['ids'] = ids
                return [dict(d) for d in docs]
        monkeypatch.setattr(queue, '_repo', lambda: R())
        import utils.storage_urls as su
        monkeypatch.setattr(su, 'sign_in_place', lambda rows, keys: None)
        return asked

    def test_documents_ride_with_their_record(self, monkeypatch):
        self._repo(monkeypatch, [{'id': 'e1', 'record_id': 'r1', 'url': 'u'}])
        out = queue.portfolio_entries('s1')
        assert out[0]['evidence'] == [{'id': 'e1', 'url': 'u'}]
        assert out[0]['total_credits'] == 1.5

    def test_the_read_asks_only_for_public_documents(self):
        """The filter lives in the query: the repository method reads
        is_private = false, so a private file is never fetched to be dropped."""
        import inspect
        from repositories.prior_learning_repository import PriorLearningRepository
        assert ".eq('is_private', False)" in inspect.getsource(PriorLearningRepository.public_evidence)

    def test_a_failure_leaves_the_portfolio_standing(self, monkeypatch):
        def boom():
            raise RuntimeError('db down')
        monkeypatch.setattr(queue, '_repo', boom)
        assert queue.portfolio_entries('s1') == []

    def test_privacy_on_a_document_from_another_record_is_refused(self, monkeypatch):
        class R:
            def set_evidence_private(self, rid, eid, value):
                return False
        monkeypatch.setattr(queue, '_repo', lambda: R())
        assert queue.set_evidence_privacy({'id': 'r1'}, 'e9', True)['status'] == 404


@pytest.mark.unit
class TestTransferCreditCost:
    """Record-backed credit costs what was stored when it was approved; a
    hand-entered row is priced from its own accredited mark."""

    RECORDS = [{'id': 'r1', 'fee_cents': 7500, 'source_accredited': False, 'awarded_credits': {'math': 1.5}},
               {'id': 'r2', 'fee_cents': 0, 'source_accredited': True, 'awarded_credits': {'pe': 1}},
               {'id': 'r3', 'fee_cents': None, 'source_accredited': None, 'awarded_credits': {'art': 1}}]

    def _row(self, rid=None, **kw):
        return {'id': kw.pop('id', 't'), 'school_name': 'X', 'credits': kw.pop('credits', {'math': 1}),
                'prior_learning_record_ids': [rid] if rid else [], **kw}

    def test_record_backed_credit_uses_the_stored_fee(self):
        from generated.pricing import PRICING
        cost = queue.transfer_cost([self._row('r1', credits={'math': 1.5})], self.RECORDS, 'private')
        assert cost['lines'][0]['cost_cents'] == 7500                     # stored, not recomputed
        assert cost['unaccredited_rate_cents'] == PRICING['academy']['creditCents']

    def test_a_record_from_before_fees_were_stored_is_priced_now(self):
        cost = queue.transfer_cost([self._row('r3')], self.RECORDS, 'licensed')
        assert cost['lines'][0]['cost_cents'] == queue.fee_for('licensed', {'art': 1}, False)

    def test_a_school_with_mixed_records_has_no_single_rate(self):
        row = {**self._row(), 'prior_learning_record_ids': ['r1', 'r2']}
        line = queue.transfer_cost([row], self.RECORDS, 'private')['lines'][0]
        assert line['accredited'] is None and line['rate_cents'] is None
        assert line['cost_cents'] == 7500

    def test_a_hand_entered_row_is_priced_from_its_own_mark(self):
        rows = [self._row(id='a', accredited=True, credits={'math': 2}),
                self._row(id='b', accredited=False, credits={'math': 2})]
        cost = queue.transfer_cost(rows, [], 'licensed')
        assert [line['cost_cents'] for line in cost['lines']] == [0, queue.fee_for('licensed', 2, False)]
        assert cost['total_cents'] == queue.fee_for('licensed', 2, False)


@pytest.mark.unit
class TestMarkingAHandEnteredSchoolAccredited:
    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        self.saved = []
        self.row = {'id': 't1', 'user_id': 's1', 'prior_learning_record_ids': []}
        test = self

        class R:
            def transfer_credit(self, tid):
                return test.row

            def records_for_student(self, sid, org_ids):
                return [_record()]

            def set_transfer_accredited(self, tid, value):
                test.saved.append(value)
                return {'id': tid, 'accredited': value}
        monkeypatch.setattr(queue, '_repo', lambda: R())
        monkeypatch.setattr(prior, 'annotate_reviewer', lambda rs: rs)
        monkeypatch.setattr(queue, 'queue_org_ids', lambda oid: [oid])

    def test_the_reviewing_office_may(self):
        assert queue.set_transfer_accredited('o1', 't1', True)['transfer_credit']['accredited'] is True

    def test_another_office_may_not(self):
        assert queue.set_transfer_accredited('elsewhere', 't1', True)['status'] == 404
        assert self.saved == []

    def test_credit_from_a_record_keeps_the_records_call(self):
        self.row['prior_learning_record_ids'] = ['r1']
        assert 'set when it was approved' in queue.set_transfer_accredited('o1', 't1', True)['error']
        assert self.saved == []


@pytest.mark.unit
class TestPriorLearningFees:
    """The fee for awarded prior learning, from shared/data/pricing.json
    (Tanner, 2026-10-13)."""

    @staticmethod
    def _funding(monkeypatch, sources):
        class R:
            def funding_sources(self, sid, oid):
                return sources
        monkeypatch.setattr(queue, '_repo', lambda: R())

    def test_an_academy_student_pays_the_private_price(self, monkeypatch):
        monkeypatch.setattr(prior, 'academy_org_id', lambda: 'academy')
        self._funding(monkeypatch, [])
        assert queue.price_list_for({'organization_id': 'academy', 'student_user_id': 's'}) == 'private'
        assert queue.fee_for('private', {'math': 1, 'science': 0.5}, False) == 15000

    def test_a_microschool_student_pays_the_licensed_price(self, monkeypatch):
        monkeypatch.setattr(prior, 'academy_org_id', lambda: 'academy')
        assert queue.price_list_for({'organization_id': 'apogee'}) == 'licensed'
        assert queue.fee_for('licensed', {'math': 1, 'science': 0.5}, False) == 7500

    def test_an_opened_family_is_shown_no_price(self, monkeypatch):
        """OpenEd families buy through OpenEd, which pays Optio (Tanner,
        2026-10-13): no price on the platform, no fee recorded."""
        monkeypatch.setattr(prior, 'academy_org_id', lambda: 'academy')
        self._funding(monkeypatch, ['opened'])
        assert queue.price_list_for({'organization_id': 'academy', 'student_user_id': 's'}) == 'opened'
        assert queue.credit_price_cents('opened') == 0
        assert queue.fee_for('opened', {'math': 3}, False) == 0

    def test_credit_from_an_accredited_transcript_is_free(self):
        assert queue.fee_for('private', {'math': 3}, True) == 0

    def test_the_prices_are_the_price_lists(self):
        from generated.pricing import PRICING
        assert queue.credit_price_cents('private') == PRICING['academy']['creditCents']
        assert queue.credit_price_cents('licensed') == PRICING['licensed']['creditCents']

    def test_approve_stores_the_fee_the_reviewer_saw(self, monkeypatch):
        monkeypatch.setattr(prior, 'academy_org_id', lambda: 'o1')
        monkeypatch.setattr(prior, 'get_record', lambda rid, oid: _record())
        monkeypatch.setattr(credit, 'already_converted', lambda rid: None)
        monkeypatch.setattr(prior, 'review', lambda *a, **k: {'record': _record(status='accepted')})
        monkeypatch.setattr(credit, 'convert_prior_learning',
                            lambda r, a, u: {'transfer_credit': {'id': 't1'}, 'action': 'created'})
        stored = []

        class R:
            def update_record(self, rid, fields):
                stored.append(fields)
                return fields

            def funding_sources(self, sid, oid):
                return []
        monkeypatch.setattr(queue, '_repo', lambda: R())
        out = queue.approve('r1', 'o1', 'staff', {'school_name': 'Home', 'subject_credits': {'math': 2},
                                                  'source_accredited': False})
        assert stored == [{'source_accredited': False, 'fee_price_list': 'private', 'fee_cents': 20000}]
        assert out['record']['fee_cents'] == 20000
