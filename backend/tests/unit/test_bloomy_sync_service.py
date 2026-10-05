"""Bloomy sync: which days it reads, what a day becomes, and that a re-run
writes nothing twice."""

from datetime import datetime

import pytest

from services import bloomy_sync_service as svc
from services.bloomy_client import BloomyClient, BloomyError

ORG = 'org-1'
KAYA = 'user-kaya'
BEN = 'user-ben'
LINKS = [
    {'user_id': KAYA, 'lms_user_id': 'b-kaya', 'sync_enabled': True},
    {'user_id': BEN, 'lms_user_id': 'b-ben', 'sync_enabled': True},
]


def _rec(student, subject, task_id, mastered=False, title=None):
    return {'student_id': student, 'subject': subject, 'task_id': task_id,
            'task_title': title or f'Skill {task_id}', 'task_mastered_on_date': mastered}


class FakeRepo:
    def __init__(self, existing=None):
        self.rows = list(existing or [])
        self.deleted = []
        self.attached = {}
        self.synced = []

    def links(self, org_id, platform):
        return LINKS

    def days(self, org_id, platform, user_ids, date_from, date_to):
        return [r for r in self.rows if date_from <= r['activity_date'] <= date_to]

    def insert_day(self, row):
        key = (row['user_id'], row['subject'], row['activity_date'])
        if any((r['user_id'], r['subject'], r['activity_date']) == key for r in self.rows):
            return None
        row = {**row, 'id': f'day-{len(self.rows)}'}
        self.rows.append(row)
        return row

    def attach_task(self, day_id, task_id):
        self.attached[day_id] = task_id

    def delete_day(self, day_id):
        self.deleted.append(day_id)
        self.rows = [r for r in self.rows if r.get('id') != day_id]

    def mark_synced(self, org_id, platform, status='active'):
        self.synced.append(status)

    def latest_hours_before(self, org_id, platform, user_ids, before):
        return {}


class FakeClient:
    def __init__(self, days, hours=None):
        self.days = days
        self.hours = hours or {}

    def students(self):
        return [{'student_id': k, 'learning_hours': v} for k, v in self.hours.items()]

    def student_progress(self, activity_date):
        return self.days.get(activity_date, [])

    def skills(self, student_id):
        self.skill_reads = getattr(self, 'skill_reads', []) + [student_id]
        return [{'task_id': 'M1', 'task_title': 'Skill M1', 'grade': 2, 'domain': 'number_base_ten',
                 'mastery_tier': 'proficient', 'best_passing_summit_score_pct': 80}]


@pytest.fixture
def made_tasks(monkeypatch):
    made = []

    def fake_make_task(repo, org_id, user_id, subject, activity_date, skills, quest_ids):
        made.append((user_id, subject, activity_date, sorted(k['code'] for k in skills)))
        return f'task-{len(made)}'

    monkeypatch.setattr(svc, '_make_task', fake_make_task)
    return made


class TestWindow:
    def test_seven_finished_days_and_never_today(self):
        today = datetime(2026, 10, 5, 9, 0, tzinfo=svc.PACIFIC)
        dates = svc.replay_dates(today)
        assert dates == ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01',
                         '2026-10-02', '2026-10-03', '2026-10-04']

    def test_xp_is_25_a_skill_and_a_heavy_day_stops_at_100(self):
        assert [svc.day_xp(n) for n in (1, 2, 3, 4, 18)] == [25, 50, 75, 100, 100]


class TestGroupDay:
    def test_a_skill_in_two_classrooms_counts_once(self):
        linked = {'b-kaya': KAYA}
        groups = svc._group_day([
            _rec('b-kaya', 'math', 'M1', mastered=True),
            _rec('b-kaya', 'math', 'M1', mastered=True),
            _rec('b-kaya', 'math', 'M2'),
        ], linked)
        g = groups[(KAYA, 'math')]
        assert len(g['worked']) == 2
        assert list(g['mastered']) == ['M1']

    def test_unlinked_students_and_no_activity_records_add_nothing(self):
        groups = svc._group_day([
            _rec('b-stranger', 'math', 'M1', mastered=True),
            {'student_id': 'b-kaya', 'subject': 'reading', 'task_id': None,
             'task_title': None, 'task_mastered_on_date': False},
        ], {'b-kaya': KAYA})
        assert groups == {}


class TestSync:
    def _client(self):
        return FakeClient({
            '2026-09-30': [
                _rec('b-kaya', 'math', 'M1', mastered=True),
                _rec('b-kaya', 'math', 'M2', mastered=True),
                _rec('b-ben', 'reading', 'R1'),            # worked, mastered nothing
            ],
            '2026-10-04': [_rec('b-ben', 'math', 'M9', mastered=True)],
        }, hours={'b-kaya': 12.5, 'b-ben': 3.0})

    def test_a_day_with_mastery_becomes_one_task(self, made_tasks, monkeypatch):
        monkeypatch.setattr(svc, 'replay_dates', lambda today=None: ['2026-09-30', '2026-10-04'])
        repo = FakeRepo()
        summary = svc.sync_org(ORG, client=self._client(), repo=repo)

        assert made_tasks == [(KAYA, 'math', '2026-09-30', ['M1', 'M2']),
                              (BEN, 'math', '2026-10-04', ['M9'])]
        assert summary['tasks'] == 2
        assert summary['days_new'] == 3
        worked_only = [r for r in repo.rows if r['user_id'] == BEN and r['subject'] == 'reading'][0]
        assert worked_only['skills_mastered'] == 0
        assert worked_only['id'] not in repo.attached

    def test_only_yesterday_claims_the_lifetime_hours(self, made_tasks, monkeypatch):
        monkeypatch.setattr(svc, 'replay_dates', lambda today=None: ['2026-09-30', '2026-10-04'])
        repo = FakeRepo()
        svc.sync_org(ORG, client=self._client(), repo=repo)
        hours = {(r['user_id'], r['activity_date']): r['learning_hours_total'] for r in repo.rows}
        assert hours[(KAYA, '2026-09-30')] is None
        assert hours[(BEN, '2026-10-04')] == 3.0

    def test_a_second_run_writes_nothing(self, made_tasks, monkeypatch):
        monkeypatch.setattr(svc, 'replay_dates', lambda today=None: ['2026-09-30', '2026-10-04'])
        repo = FakeRepo()
        svc.sync_org(ORG, client=self._client(), repo=repo)
        before = len(made_tasks)
        again = svc.sync_org(ORG, client=self._client(), repo=repo)
        assert len(made_tasks) == before
        assert again['tasks'] == 0 and again['days_new'] == 0

    def test_a_failed_task_forgets_the_day_so_the_next_run_retries(self, monkeypatch):
        monkeypatch.setattr(svc, 'replay_dates', lambda today=None: ['2026-09-30'])
    
        def boom(*a, **k):
            raise RuntimeError('insert failed')

        monkeypatch.setattr(svc, '_make_task', boom)
        repo = FakeRepo()
        with pytest.raises(RuntimeError):
            svc.sync_org(ORG, client=self._client(), repo=repo)
        assert not any(r['user_id'] == KAYA for r in repo.rows)
        assert repo.deleted

    def test_a_refused_key_is_reported_not_raised(self, made_tasks):
        class Refusing(FakeClient):
            def students(self):
                raise BloomyError('Bloomy answered 401', status=401)

        repo = FakeRepo()
        summary = svc.sync_org(ORG, client=Refusing({}), repo=repo)
        assert summary['error'] == 'Bloomy refused the saved key.'
        assert repo.synced == ['error']


class TestWeekSummary:
    def test_mastered_by_subject_days_active_and_hours_between_snapshots(self):
        class Repo(FakeRepo):
            def latest_hours_before(self, org_id, platform, user_ids, before):
                return {KAYA: 10.0}

        repo = Repo([
            {'user_id': KAYA, 'subject': 'math', 'activity_date': '2026-09-29',
             'skills_worked': 3, 'skills_mastered': 2, 'learning_hours_total': None},
            {'user_id': KAYA, 'subject': 'reading', 'activity_date': '2026-09-29',
             'skills_worked': 1, 'skills_mastered': 1, 'learning_hours_total': 11.0},
            {'user_id': KAYA, 'subject': 'math', 'activity_date': '2026-10-01',
             'skills_worked': 2, 'skills_mastered': 0, 'learning_hours_total': 12.25},
        ])
        out = svc.week_summaries(ORG, [KAYA], '2026-09-28', repo=repo)[KAYA]
        assert out['mastered'] == {'math': 2, 'reading': 1}
        assert out['days'] == 2
        assert out['hours'] == 2.2


class TestLinks:
    def test_a_student_linked_at_another_school_is_refused(self, monkeypatch):
        class Repo(FakeRepo):
            def link_for_platform_user(self, platform, platform_user_id):
                return {'user_id': 'x', 'organization_id': 'other-org'}

        with pytest.raises(svc.BloomySetupError):
            svc.set_link(ORG, 'b-kaya', KAYA, repo=Repo())


class FakeResponse:
    def __init__(self, status, payload=None):
        self.status_code = status
        self._payload = payload
        self.headers = {}

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, params=None, headers=None, timeout=None):
        self.calls.append(dict(params or {}))
        return self.responses.pop(0)


class TestClient:
    def test_follows_every_cursor(self):
        session = FakeSession([
            FakeResponse(200, {'records': [{'n': 1}], 'pagination': {'next_cursor': 'c2'}}),
            FakeResponse(200, {'records': [{'n': 2}], 'pagination': {'next_cursor': None}}),
        ])
        records = BloomyClient('key', session=session).students()
        assert records == [{'n': 1}, {'n': 2}]
        assert session.calls[1]['cursor'] == 'c2'

    def test_too_large_halves_the_page_and_retries_the_same_cursor(self):
        session = FakeSession([
            FakeResponse(413),
            FakeResponse(200, {'records': [], 'pagination': {'next_cursor': None}}),
        ])
        BloomyClient('key', session=session).student_progress('2026-09-30')
        assert [c['limit'] for c in session.calls] == [200, 100]

    def test_a_repeated_cursor_stops_instead_of_looping(self):
        page = {'records': [], 'pagination': {'next_cursor': 'same'}}
        session = FakeSession([FakeResponse(200, page), FakeResponse(200, page)])
        with pytest.raises(BloomyError):
            BloomyClient('key', session=session).students()

    def test_a_refused_key_carries_its_status(self):
        session = FakeSession([FakeResponse(401)])
        with pytest.raises(BloomyError) as e:
            BloomyClient('key', session=session).students()
        assert e.value.status == 401


class TestRecentActivity:
    def test_counts_a_skill_once_a_day_and_finds_the_last_active_day(self):
        days = [
            ('2026-10-01', [_rec('b-kaya', 'math', 'M1', mastered=True),
                            _rec('b-kaya', 'math', 'M1', mastered=True),   # second classroom
                            _rec('b-kaya', 'reading', 'R1')]),
            ('2026-09-29', [_rec('b-kaya', 'math', 'M2', mastered=True),
                            {'student_id': 'b-ben', 'subject': 'math', 'task_id': None,
                             'task_mastered_on_date': False}]),
        ]
        out = svc._recent_activity(days)
        assert out['b-kaya'] == {'mastered': {'math': 2, 'reading': 0}, 'worked': 3,
                                 'days': 2, 'last_active': '2026-10-01'}
        assert 'b-ben' not in out


class TestSkillDetails:
    def test_tier_and_score_reach_the_task_and_skills_are_read_once_per_student(self, monkeypatch):
        captured = []

        def fake_make_task(repo, org_id, user_id, subject, activity_date, skills, quest_ids):
            captured.append(skills)
            return 'task'

        monkeypatch.setattr(svc, '_make_task', fake_make_task)
        monkeypatch.setattr(svc, 'replay_dates', lambda today=None: ['2026-09-30', '2026-10-01'])
        client = FakeClient({
            '2026-09-30': [_rec('b-kaya', 'math', 'M1', mastered=True)],
            '2026-10-01': [_rec('b-kaya', 'math', 'M2', mastered=True),
                           _rec('b-ben', 'reading', 'R1')],          # nothing mastered: no read
        })
        svc.sync_org(ORG, client=client, repo=FakeRepo())
        assert captured[0] == [{'code': 'M1', 'title': 'Skill M1', 'grade': 2, 'domain': 'number_base_ten',
                                'tier': 'proficient', 'score': 80}]
        assert captured[1][0]['tier'] is None          # no record: title and code only
        assert client.skill_reads == ['b-kaya']

    def test_the_evidence_text_carries_the_details(self):
        text = svc._evidence('math', '2026-09-30', [
            {'code': 'NBT-G2-005', 'title': 'Compare numbers', 'grade': 2,
             'domain': 'number_base_ten', 'tier': 'proficient', 'score': 80}])
        assert text == ('Skills mastered in Bloomy Math on Sep 30:\n'
                        '- Compare numbers (NBT-G2-005): Grade 2 · Number base ten · Proficient · 80%')


class TestCard:
    def test_draws_a_png(self):
        from services.bloomy_card import render_day_card
        png = render_day_card('Reading', 'Oct 1', [{'code': 'R1', 'title': 'A skill'}] * 15, year=2026)
        assert png[:8] == b'\x89PNG\r\n\x1a\n'
