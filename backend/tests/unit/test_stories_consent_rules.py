"""Who may say a student's work can be shown.

A minor cannot say it for themselves, unknown age is a minor, a parent
outranks the school, and a superadmin recording a signed form has to say
where it came from. Revocation takes the named stories down.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pytest

from services.stories import consent_service
from services.stories.consent_service import ConsentRefused

pytestmark = pytest.mark.unit

STUDENT = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
PARENT = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
ORG_ADMIN = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
STRANGER = 'cccccccc-cccc-cccc-cccc-cccccccccccc'


class FakeConsentRepo:
    def __init__(self, active: Optional[Dict[str, Any]] = None):
        self.rows: List[Dict[str, Any]] = [active] if active else []
        self.revoked: List[str] = []

    def active_for_student(self, sid):
        return next((r for r in self.rows if r['student_user_id'] == sid and not r.get('revoked_at')), None)

    def list_for_student(self, sid):
        return [r for r in self.rows if r['student_user_id'] == sid]

    def get(self, cid):
        return next((r for r in self.rows if r['id'] == cid), None)

    def create(self, row):
        row = {**row, 'id': f'consent-{len(self.rows) + 1}'}
        self.rows.append(row)
        return row

    def revoke(self, cid, *, revoked_by, revoked_at):
        row = self.get(cid)
        if row and not row.get('revoked_at'):
            row.update({'revoked_at': revoked_at, 'revoked_by_user_id': revoked_by})
            self.revoked.append(cid)
            return row
        return None


class FakeSourceRepo:
    def __init__(self, *, student_dob=None, student_org=None):
        self.users = {
            STUDENT: {'id': STUDENT, 'role': 'student', 'org_role': None,
                      'organization_id': student_org, 'date_of_birth': student_dob,
                      'is_dependent': False, 'first_name': 'Anna'},
            PARENT: {'id': PARENT, 'role': 'parent', 'organization_id': None},
            ADMIN: {'id': ADMIN, 'role': 'superadmin', 'organization_id': None},
            ORG_ADMIN: {'id': ORG_ADMIN, 'role': 'org_managed', 'org_role': 'org_admin',
                        'organization_id': student_org or 'org-x'},
            STRANGER: {'id': STRANGER, 'role': 'parent', 'organization_id': None},
        }

    def student(self, uid):
        return self.users.get(uid)


@pytest.fixture(autouse=True)
def _seams(monkeypatch):
    """The relationship predicates and the side effects, stubbed."""
    state = {'parents': {PARENT}, 'approver': {'user_id': PARENT, 'kind': 'parent'},
             'logged': [], 'unpublished': []}
    monkeypatch.setattr(consent_service, 'is_parent_of',
                        lambda caller, sid: caller in state['parents'])
    monkeypatch.setattr(consent_service, 'find_approver', lambda sid: state['approver'])
    monkeypatch.setattr(consent_service.AccessLogger, 'log_student_data_access',
                        staticmethod(lambda *a, **k: state['logged'].append((a, k)) or True))
    monkeypatch.setattr('services.stories.publish.unpublish_all_for_student',
                        lambda sid, **k: state['unpublished'].append((sid, k)) or 2)
    return state


def _grant(caller, *, repo=None, source_repo=None, scope=None, **kw):
    return consent_service.grant(
        student_id=STUDENT, caller_id=caller,
        scope={'work': True} if scope is None else scope,
        source=kw.pop('source', 'written'), repo=repo or FakeConsentRepo(),
        source_repo=source_repo or FakeSourceRepo(student_dob='2000-01-01'), **kw)


class TestGrant:
    def test_adult_self_grant(self):
        row = _grant(STUDENT, scope={'work': True, 'first_name': True})
        assert row['approver_kind'] == 'self_adult'
        assert row['granted_by_user_id'] == STUDENT
        assert row['recorded_by_user_id'] == STUDENT
        assert (row['scope_work'], row['scope_first_name'], row['scope_image_voice'],
                row['scope_age']) == (True, True, False, False)

    def test_minor_self_grant_refused(self):
        with pytest.raises(ConsentRefused) as e:
            _grant(STUDENT, source_repo=FakeSourceRepo(student_dob='2014-01-01'))
        assert e.value.code == 'minor_self_grant'

    def test_unknown_age_is_a_minor(self):
        with pytest.raises(ConsentRefused) as e:
            _grant(STUDENT, source_repo=FakeSourceRepo(student_dob=None))
        assert e.value.code == 'minor_self_grant'

    def test_parent_gives_parent(self):
        row = _grant(PARENT, source_repo=FakeSourceRepo(student_dob='2014-01-01'))
        assert row['approver_kind'] == 'parent'
        assert row['granted_by_user_id'] == PARENT

    def test_org_admin_only_when_no_parent(self, _seams):
        _seams['parents'] = set()
        _seams['approver'] = None
        row = _grant(ORG_ADMIN, source_repo=FakeSourceRepo(student_dob='2014-01-01',
                                                            student_org='org-x'))
        assert row['approver_kind'] == 'org_admin'

    def test_parent_outranks_org_admin(self, _seams):
        with pytest.raises(ConsentRefused) as e:
            _grant(ORG_ADMIN, source_repo=FakeSourceRepo(student_dob='2014-01-01',
                                                          student_org='org-x'))
        assert e.value.code == 'parent_outranks_org'

    def test_stranger_refused(self):
        with pytest.raises(ConsentRefused) as e:
            _grant(STRANGER)
        assert e.value.code == 'not_authorized'

    def test_superadmin_records_on_behalf_naming_the_approver(self):
        row = _grant(ADMIN, source='academy_agreement', source_ref='Agreement signed 2026-08-20',
                     source_repo=FakeSourceRepo(student_dob='2014-01-01'))
        assert row['approver_kind'] == 'parent'
        assert row['granted_by_user_id'] == PARENT
        assert row['recorded_by_user_id'] == ADMIN
        assert row['source_ref'] == 'Agreement signed 2026-08-20'

    def test_superadmin_needs_a_source_ref(self):
        with pytest.raises(ConsentRefused) as e:
            _grant(ADMIN, source_repo=FakeSourceRepo(student_dob='2014-01-01'))
        assert e.value.code == 'source_ref_required'

    def test_superadmin_with_no_approver_and_a_minor_is_refused(self, _seams):
        _seams['approver'] = None
        with pytest.raises(ConsentRefused) as e:
            _grant(ADMIN, source_ref='x', source_repo=FakeSourceRepo(student_dob='2014-01-01'))
        assert e.value.code == 'no_approver'

    def test_superadmin_with_no_approver_and_an_adult_records_self_adult(self, _seams):
        _seams['approver'] = None
        row = _grant(ADMIN, source_ref='email 2026-09-01')
        assert row['approver_kind'] == 'self_adult'
        assert row['granted_by_user_id'] == STUDENT

    def test_one_active_consent_at_a_time(self):
        repo = FakeConsentRepo(active={'id': 'c0', 'student_user_id': STUDENT, 'scope_work': True})
        with pytest.raises(ConsentRefused) as e:
            _grant(PARENT, repo=repo)
        assert e.value.code == 'already_active'

    def test_empty_scope_and_bad_source_refused(self):
        with pytest.raises(ConsentRefused) as e:
            _grant(PARENT, scope={})
        assert e.value.code == 'empty_scope'
        with pytest.raises(ConsentRefused) as e:
            _grant(PARENT, source='verbal')
        assert e.value.code == 'bad_source'

    def test_grant_is_logged(self, _seams):
        _grant(PARENT)
        assert _seams['logged'][0][0][:3] == (STUDENT, PARENT, 'promotional_consent')


class TestStatusAndTier:
    def test_tier_is_named_only_with_scope_work(self):
        assert consent_service.tier_for(None) == 'anonymized'
        assert consent_service.tier_for({'scope_work': False, 'scope_first_name': True}) == 'anonymized'
        assert consent_service.tier_for({'scope_work': True}) == 'named'

    def test_status_for(self):
        repo = FakeConsentRepo(active={'id': 'c0', 'student_user_id': STUDENT, 'scope_work': True,
                                       'scope_age': True})
        status = consent_service.status_for(STUDENT, repo=repo)
        assert status['tier'] == 'named'
        assert status['scope'] == {'work': True, 'first_name': False, 'image_voice': False,
                                   'age': True}
        assert status['active']['id'] == 'c0'
        assert len(status['history']) == 1


class TestRevoke:
    def _repo(self):
        return FakeConsentRepo(active={'id': 'c0', 'student_user_id': STUDENT, 'scope_work': True,
                                       'granted_by_user_id': PARENT, 'recorded_by_user_id': PARENT})

    def test_parent_revokes_and_named_stories_come_down(self, _seams):
        repo = self._repo()
        out = consent_service.revoke('c0', caller_id=PARENT, repo=repo,
                                     source_repo=FakeSourceRepo(student_dob='2014-01-01'))
        assert repo.revoked == ['c0']
        assert out['stories_unpublished'] == 2
        assert _seams['unpublished'] == [(STUDENT, {'reason': 'consent_revoked', 'tier': 'named',
                                                    'admin': None})]
        assert any(k.get('purpose') == 'consent_revoked' for _, k in _seams['logged'])

    def test_superadmin_may_revoke(self):
        repo = self._repo()
        consent_service.revoke('c0', caller_id=ADMIN, repo=repo, source_repo=FakeSourceRepo())
        assert repo.revoked == ['c0']

    def test_stranger_may_not(self, _seams):
        with pytest.raises(ConsentRefused) as e:
            consent_service.revoke('c0', caller_id=STRANGER, repo=self._repo(),
                                   source_repo=FakeSourceRepo())
        assert e.value.code == 'not_authorized'
        assert _seams['unpublished'] == []

    def test_revoking_twice_is_a_no_op(self, _seams):
        repo = self._repo()
        consent_service.revoke('c0', caller_id=PARENT, repo=repo, source_repo=FakeSourceRepo())
        again = consent_service.revoke('c0', caller_id=PARENT, repo=repo, source_repo=FakeSourceRepo())
        assert again['revoked_at']
        assert len(_seams['unpublished']) == 1
