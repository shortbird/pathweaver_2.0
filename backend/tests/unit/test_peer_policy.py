"""The Friends policy -- who decided, what it says, and what "off" does.

Each test names the way the model could be unsafe rather than the branch it
covers. What must stay true:

  * resolution order is fixed: the school's switch, then the child's row,
    then the org default (only for an org student with NO parent linked),
    then off -- and off says who could turn it on
  * enabling writes exactly one consent row, attributed to a named adult;
    changing a mode or a source writes none
  * a minor never sets their own; the school never speaks over a parent
  * turning Friends off revokes the child's live connections
  * 'message' is refused until phase 3 ships its safety work
"""

from unittest.mock import Mock, patch

import pytest

from services import peer_policy_service as ps
from services.peer_policy_service import EffectivePolicy, PeerPolicyError


class FakeRepo:
    """The repository surface the service uses, with a dict per table."""

    def __init__(self, users=None, policies=None):
        self.users = users or {}
        self.policies = policies or {}
        self.consents = []
        self.upserts = []

    def get(self, student_id):
        return self.policies.get(student_id)

    def get_many(self, ids):
        return {i: self.policies[i] for i in ids if i in self.policies}

    def upsert(self, row):
        self.upserts.append(row)
        self.policies[row['student_id']] = dict(row)
        return row

    def write_consent(self, row):
        self.consents.append(row)
        return f'consent-{len(self.consents)}'

    def user_row(self, user_id, columns):
        return self.users.get(user_id)

    def users_by_ids(self, ids, columns):
        return {i: self.users[i] for i in ids if i in self.users}


KID = {'id': 'kid', 'organization_id': None, 'is_dependent': True,
       'date_of_birth': '2016-01-01', 'managed_by_parent_id': 'mum',
       'email': 'kid@x', 'first_name': 'Kit', 'display_name': 'Kit'}
MUM = {'id': 'mum', 'role': 'parent', 'org_role': None, 'org_roles': None,
       'organization_id': None, 'email': 'mum@x', 'first_name': 'Mo',
       'last_name': 'P', 'display_name': 'Mo P'}
ORG_KID = {'id': 'okid', 'organization_id': 'org1', 'is_dependent': False,
           'date_of_birth': '2014-01-01', 'managed_by_parent_id': None}
ADULT = {'id': 'grown', 'organization_id': None, 'is_dependent': False,
         'date_of_birth': '1990-01-01', 'managed_by_parent_id': None}
NO_DOB = {'id': 'nodob', 'organization_id': None, 'is_dependent': False,
          'date_of_birth': None, 'managed_by_parent_id': None}


def _resolve(repo, *, module_on=True, approver=None, org_settings=None):
    """Run effective_policy with the world stubbed around the repo."""
    flags = {'friends_settings': org_settings} if org_settings is not None else {}
    return patch.multiple(
        ps,
        _repo=Mock(return_value=repo),
        module_enabled=Mock(return_value=module_on),
        org_flags=Mock(return_value=flags),
    ), patch.object(ps.pa, 'find_approver', return_value=approver)


# ---------------------------------------------------------------------------
# Resolution order
# ---------------------------------------------------------------------------

def test_the_school_switch_beats_a_child_row():
    """An org that turned Friends off turned it off for every family there,
    whatever a parent set before. The module gate is the school's word."""
    repo = FakeRepo(users={'okid': ORG_KID},
                    policies={'okid': {'student_id': 'okid', 'enabled': True,
                                       'set_by_user_id': 'mum', 'set_by_kind': 'parent'}})
    a, b = _resolve(repo, module_on=False)
    with a, b:
        policy = ps.effective_policy('okid')
    assert policy.enabled is False
    assert policy.origin == ps.ORIGIN_MODULE_OFF


def test_a_child_row_is_the_answer_when_present():
    repo = FakeRepo(users={'kid': KID},
                    policies={'kid': {'student_id': 'kid', 'enabled': True,
                                      'approval_mode': 'ask_first',
                                      'request_sources': ['code'],
                                      'friends_can': ['see'],
                                      'set_by_user_id': 'mum', 'set_by_kind': 'parent'}})
    a, b = _resolve(repo)
    with a, b:
        policy = ps.effective_policy('kid')
    assert policy.enabled and policy.origin == ps.ORIGIN_CHILD
    assert policy.approval_mode == 'ask_first'
    assert policy.request_sources == ['code']
    assert policy.friends_can == ['see']
    assert policy.approver == {'user_id': 'mum', 'kind': 'parent'}
    assert policy.is_dependent is True


def test_the_org_default_applies_only_to_a_student_with_no_parent():
    """The school stands in where nobody else can. A student with a parent
    linked gets the parent's answer, and 'no row' from a parent is 'off'."""
    with_parent = FakeRepo(users={'okid': ORG_KID})
    a, b = _resolve(with_parent, approver={'user_id': 'mum', 'kind': 'parent', 'first_name': 'Mo'},
                    org_settings={'default_enabled': True})
    with a, b:
        policy = ps.effective_policy('okid')
    assert policy.enabled is False
    assert policy.who_can_enable == 'parent'
    assert 'Mo' in policy.reason

    no_parent = FakeRepo(users={'okid': ORG_KID})
    a, b = _resolve(no_parent, approver={'user_id': 'head', 'kind': 'org_admin', 'first_name': 'H'},
                    org_settings={'default_enabled': True, 'default_approval_mode': 'ask_first',
                                  'school_pool': True})
    with a, b:
        policy = ps.effective_policy('okid')
    assert policy.enabled is True
    assert policy.origin == ps.ORIGIN_ORG
    assert policy.approval_mode == 'ask_first'
    assert 'school' in policy.request_sources
    assert policy.approver == {'user_id': 'head', 'kind': 'org_admin'}


def test_an_org_default_that_is_off_names_the_school():
    repo = FakeRepo(users={'okid': ORG_KID})
    a, b = _resolve(repo, approver={'user_id': 'head', 'kind': 'org_admin', 'first_name': 'H'},
                    org_settings={'default_enabled': False})
    with a, b:
        policy = ps.effective_policy('okid')
    assert policy.enabled is False
    assert policy.who_can_enable == 'org_admin'


def test_off_with_nobody_accountable_says_so():
    """A platform minor with no parent linked: nobody can turn it on, and the
    reason says to link an adult rather than pretending a button exists."""
    repo = FakeRepo(users={'nodob': NO_DOB})
    a, b = _resolve(repo, approver=None)
    with a, b:
        policy = ps.effective_policy('nodob')
    assert policy.enabled is False
    assert policy.who_can_enable == 'nobody'


def test_an_adult_with_no_parent_may_turn_it_on_themselves():
    repo = FakeRepo(users={'grown': ADULT})
    a, b = _resolve(repo, approver=None)
    with a, b:
        policy = ps.effective_policy('grown')
    assert policy.who_can_enable == 'self'


def test_no_row_still_carries_the_default_permissions():
    """The one connection that predates the policy model: its students have
    no row. What a friend may do must still have an answer, and it is the
    default, not an empty list that silently mutes them."""
    repo = FakeRepo(users={'grown': ADULT})
    a, b = _resolve(repo, approver=None)
    with a, b:
        policy = ps.effective_policy('grown')
    assert 'comment' in policy.friends_can


def test_a_parent_asking_is_always_an_allowed_source():
    policy = EffectivePolicy(student_id='x', enabled=True, request_sources=['classmates'])
    assert policy.allows_source('parent') is True
    assert policy.allows_source('code') is False
    assert policy.allows_source('classmates') is True


def test_the_approver_is_not_serialized_to_the_client():
    """The other family's parent id is nobody's business."""
    policy = EffectivePolicy(student_id='x', enabled=True,
                             approver={'user_id': 'mum', 'kind': 'parent'})
    assert 'approver' not in policy.to_dict()


# ---------------------------------------------------------------------------
# Who may set it
# ---------------------------------------------------------------------------

def test_a_minor_may_not_set_their_own_policy():
    with patch.object(ps.pa, 'is_minor_by_id', return_value=True):
        with pytest.raises(PeerPolicyError, match='parent or guardian controls'):
            ps.setter_kind('kid', 'kid')


def test_an_adult_may_set_their_own():
    with patch.object(ps.pa, 'is_minor_by_id', return_value=False):
        assert ps.setter_kind('grown', 'grown') == 'self'


def test_a_parent_by_any_link_may_set_it():
    with patch.object(ps.pa, 'is_parent_of', return_value=True):
        assert ps.setter_kind('mum', 'kid') == 'parent'


def test_the_school_may_not_speak_over_a_linked_parent():
    """find_approver's ordering, applied to the write: where a parent is
    linked, the parent is the accountable adult."""
    repo = FakeRepo(users={'head': {'id': 'head', 'role': 'org_managed', 'org_role': 'org_admin',
                                    'org_roles': ['org_admin'], 'organization_id': 'org1'},
                           'okid': ORG_KID})
    with patch.object(ps, '_repo', return_value=repo), \
         patch.object(ps.pa, 'is_parent_of', return_value=False), \
         patch.object(ps.pa, 'is_org_admin_over', return_value=True), \
         patch.object(ps.pa, 'find_approver',
                      return_value={'user_id': 'mum', 'kind': 'parent', 'first_name': 'Mo'}):
        with pytest.raises(PeerPolicyError, match='parent or guardian linked'):
            ps.setter_kind('head', 'okid')

    with patch.object(ps, '_repo', return_value=repo), \
         patch.object(ps.pa, 'is_parent_of', return_value=False), \
         patch.object(ps.pa, 'is_org_admin_over', return_value=True), \
         patch.object(ps.pa, 'find_approver',
                      return_value={'user_id': 'head', 'kind': 'org_admin', 'first_name': 'H'}):
        assert ps.setter_kind('head', 'okid') == 'org_admin'


def test_a_stranger_may_not_set_it():
    repo = FakeRepo(users={'x': {'id': 'x', 'role': 'student', 'organization_id': None},
                           'kid': KID})
    with patch.object(ps, '_repo', return_value=repo), \
         patch.object(ps.pa, 'is_parent_of', return_value=False), \
         patch.object(ps.pa, 'is_org_admin_over', return_value=False):
        with pytest.raises(PeerPolicyError, match='Not authorized'):
            ps.setter_kind('x', 'kid')


# ---------------------------------------------------------------------------
# The write and its consequences
# ---------------------------------------------------------------------------

def _writing(repo, kind='parent'):
    """set_policy with the setter resolved and the resolution stubbed so the
    returned policy reads back from the fake repo."""
    return (
        patch.object(ps, '_repo', return_value=repo),
        patch.object(ps, 'setter_kind', return_value=kind),
        patch.object(ps, 'module_enabled', return_value=True),
        patch.object(ps.pa, 'find_approver', return_value=None),
    )


def test_enabling_writes_exactly_one_consent_row_naming_the_adult():
    """THE central test. The flip to on IS the COPPA consent. It must exist,
    it must name who gave it, and it must be the one written for this scope
    -- not the account-creation consent reused."""
    repo = FakeRepo(users={'kid': KID, 'mum': MUM})
    a, b, c, d = _writing(repo)
    with a, b, c, d:
        out = ps.set_policy('kid', 'mum', {'enabled': True},
                            ip_address='1.2.3.4', user_agent='UA')

    assert out['consent_recorded'] is True
    assert len(repo.consents) == 1
    consent = repo.consents[0]
    assert consent['user_id'] == 'kid'
    assert consent['granted_by_user_id'] == 'mum'
    assert consent['consent_scope'] == 'peer_friends'
    assert consent['consent_method'] == 'in_app_toggle'
    assert consent['consent_verified_at'] is not None
    assert consent['consent_token'] is None
    assert consent['signature_name'] == 'Mo P'
    assert consent['ip_address'] == '1.2.3.4'
    assert repo.policies['kid']['consent_log_id'] == 'consent-1'
    assert repo.policies['kid']['set_by_user_id'] == 'mum'
    assert repo.policies['kid']['set_by_kind'] == 'parent'


def test_changing_the_rules_is_not_a_new_consent():
    repo = FakeRepo(users={'kid': KID, 'mum': MUM},
                    policies={'kid': {'student_id': 'kid', 'enabled': True,
                                      'approval_mode': 'auto',
                                      'consent_log_id': 'consent-0'}})
    a, b, c, d = _writing(repo)
    with a, b, c, d:
        out = ps.set_policy('kid', 'mum', {'approval_mode': 'ask_first',
                                           'request_sources': ['classmates']})
    assert out['consent_recorded'] is False
    assert repo.consents == []
    assert repo.policies['kid']['approval_mode'] == 'ask_first'
    assert repo.policies['kid']['request_sources'] == ['classmates']
    assert repo.policies['kid']['consent_log_id'] == 'consent-0', \
        'the original consent stays attached'


def test_off_then_on_again_is_a_fresh_consent():
    repo = FakeRepo(users={'kid': KID, 'mum': MUM},
                    policies={'kid': {'student_id': 'kid', 'enabled': False,
                                      'consent_log_id': 'consent-0'}})
    a, b, c, d = _writing(repo)
    with a, b, c, d:
        ps.set_policy('kid', 'mum', {'enabled': True})
    assert len(repo.consents) == 1
    assert repo.policies['kid']['consent_log_id'] == 'consent-1'


def test_an_adult_enabling_their_own_writes_no_parental_consent():
    repo = FakeRepo(users={'grown': ADULT})
    a, b, c, d = _writing(repo, kind='self')
    with a, b, c, d:
        out = ps.set_policy('grown', 'grown', {'enabled': True})
    assert out['consent_recorded'] is False
    assert repo.consents == []


def test_a_failed_consent_write_refuses_to_enable():
    """Enabling without the record would be the disclosure without the
    consent. Fail the request, not the record."""
    repo = FakeRepo(users={'kid': KID, 'mum': MUM})
    repo.write_consent = Mock(side_effect=RuntimeError('db down'))
    a, b, c, d = _writing(repo)
    with a, b, c, d:
        with pytest.raises(PeerPolicyError, match='record your consent'):
            ps.set_policy('kid', 'mum', {'enabled': True})
    assert repo.upserts == []


def test_turning_friends_off_revokes_every_live_connection():
    """A parent who turns Friends off expects the friends to be gone."""
    repo = FakeRepo(users={'kid': KID, 'mum': MUM},
                    policies={'kid': {'student_id': 'kid', 'enabled': True}})
    conn_repo = Mock()
    conn_repo.revoke_all_active_for.return_value = 3
    a, b, c, d = _writing(repo)
    with a, b, c, d, patch('repositories.peer_connection_repository.PeerConnectionRepository',
                           return_value=conn_repo):
        out = ps.set_policy('kid', 'mum', {'enabled': False})

    assert out['revoked_count'] == 3
    conn_repo.revoke_all_active_for.assert_called_once_with(
        'kid', revoked_by='mum', reason='friends_off')
    assert repo.policies['kid']['enabled'] is False


def test_a_change_that_leaves_it_on_revokes_nothing():
    repo = FakeRepo(users={'kid': KID, 'mum': MUM},
                    policies={'kid': {'student_id': 'kid', 'enabled': True}})
    conn_repo = Mock()
    a, b, c, d = _writing(repo)
    with a, b, c, d, patch('repositories.peer_connection_repository.PeerConnectionRepository',
                           return_value=conn_repo):
        ps.set_policy('kid', 'mum', {'friends_can': ['see']})
    conn_repo.revoke_all_active_for.assert_not_called()


def test_message_is_refused_until_phase_3():
    repo = FakeRepo(users={'kid': KID, 'mum': MUM})
    a, b, c, d = _writing(repo)
    with a, b, c, d:
        with pytest.raises(PeerPolicyError, match='not available yet'):
            ps.set_policy('kid', 'mum', {'enabled': True, 'friends_can': ['see', 'message']})


def test_seeing_is_the_floor_of_what_friends_can_do():
    repo = FakeRepo(users={'kid': KID, 'mum': MUM})
    a, b, c, d = _writing(repo)
    with a, b, c, d:
        ps.set_policy('kid', 'mum', {'enabled': True, 'friends_can': ['comment']})
    assert repo.policies['kid']['friends_can'] == ['see', 'comment']


@pytest.mark.parametrize('body,message', [
    ({'enabled': 'yes'}, 'true or false'),
    ({'approval_mode': 'sometimes'}, 'approval_mode'),
    ({'request_sources': ['directory']}, 'request_sources'),
    ({'request_sources': 'code'}, 'must be a list'),
    ({'friends_can': ['edit']}, 'friends_can'),
])
def test_malformed_settings_are_refused(body, message):
    repo = FakeRepo(users={'kid': KID, 'mum': MUM})
    a, b, c, d = _writing(repo)
    with a, b, c, d:
        with pytest.raises(PeerPolicyError, match=message):
            ps.set_policy('kid', 'mum', body)


# ---------------------------------------------------------------------------
# The org's defaults
# ---------------------------------------------------------------------------

def test_org_settings_fall_back_to_platform_defaults():
    with patch.object(ps, 'org_flags', return_value={}):
        assert ps.org_friends_settings('org1') == {
            'default_enabled': False, 'default_approval_mode': 'auto', 'school_pool': False}
    with patch.object(ps, 'org_flags', return_value={'friends_settings': 'garbage'}):
        assert ps.org_friends_settings('org1')['default_enabled'] is False
    with patch.object(ps, 'org_flags',
                      return_value={'friends_settings': {'default_approval_mode': 'whenever'}}):
        assert ps.org_friends_settings('org1')['default_approval_mode'] == 'auto'


def test_org_settings_write_merges_into_the_stored_flags():
    """Key-by-key into the stored blob, so a stale tab cannot clobber the
    rest of feature_flags (the whole-blob round-trip guard_org_flags_write
    exists to catch)."""
    repo = Mock()
    repo.find_by_id.return_value = {'id': 'org1', 'feature_flags': {
        'sis_enabled': True, 'modules': {'billing': False},
        'friends_settings': {'default_enabled': False, 'school_pool': True}}}
    with patch('repositories.organization_repository.OrganizationRepository', return_value=repo), \
         patch.object(ps, 'org_flags', return_value=repo.find_by_id.return_value['feature_flags']):
        out = ps.set_org_friends_settings('org1', {'default_enabled': True})

    written = repo.update_organization.call_args.args[1]['feature_flags']
    assert written['sis_enabled'] is True
    assert written['modules'] == {'billing': False}
    assert written['friends_settings'] == {
        'default_enabled': True, 'default_approval_mode': 'auto', 'school_pool': True}
    assert out == written['friends_settings']
