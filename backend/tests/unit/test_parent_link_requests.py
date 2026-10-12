"""Student-initiated parent links (services/parent_link_request_service.py).

What is tested is what would be unsafe or a dead end if it broke: the link is
written only by a superadmin's approval, the parent must hold the invited
address, a token works once, every superadmin hears about a waiting request,
and a school's student or an already-linked student is turned away.
"""
from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest

from services import parent_link_request_service as svc
from utils.timestamps import utcnow


class _Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters = db, table, []
        self.op, self.payload, self.limit_n = 'select', None, None

    def select(self, *_):
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def eq(self, col, val):
        self.filters.append(lambda r: r.get(col) == val)
        return self

    def in_(self, col, vals):
        self.filters.append(lambda r: r.get(col) in vals)
        return self

    def gte(self, col, val):
        self.filters.append(lambda r: (r.get(col) or '') >= val)
        return self

    def order(self, *_, **__):
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    def execute(self):
        rows = self.db.setdefault(self.table, [])
        if self.op == 'insert':
            row = {'id': f'{self.table}-{len(rows) + 1}', 'created_at': utcnow().isoformat(),
                   'parent_user_id': None, 'accepted_at': None, 'decided_at': None, **self.payload}
            rows.append(row)
            return MagicMock(data=[row])
        hit = [r for r in rows if all(f(r) for f in self.filters)]
        if self.op == 'update':
            for r in hit:
                r.update(self.payload)
        return MagicMock(data=hit[: self.limit_n] if self.limit_n else hit)


class _FakeAdmin:
    def __init__(self, db):
        self.db = db
        self.rpc_calls = []

    def table(self, name):
        return _Query(self.db, name)

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        self.db.setdefault('parent_student_links', []).append({
            'id': 'link-1', 'parent_user_id': params['p_parent_id'],
            'student_user_id': params['p_student_id'], 'status': 'approved',
        })
        return MagicMock(execute=lambda: MagicMock(data='link-1'))


STUDENT = {'id': 'kid', 'role': 'student', 'organization_id': None, 'is_dependent': False,
           'managed_by_parent_id': None, 'email': 'kid@example.com', 'first_name': 'Elanor',
           'last_name': 'T', 'display_name': None}
PARENT = {'id': 'mom', 'role': 'student', 'organization_id': None, 'email': 'mom@example.com',
          'first_name': 'Sarah', 'last_name': 'T', 'display_name': None}
ADMIN = {'id': 'boss', 'role': 'superadmin', 'organization_id': None, 'email': 'boss@example.com'}


@pytest.fixture
def env():
    db = {'users': [dict(STUDENT), dict(PARENT), dict(ADMIN)], 'parent_student_links': []}
    admin = _FakeAdmin(db)
    sent = []
    notes = MagicMock()
    email = MagicMock()
    email.send_parent_link_request_email.side_effect = lambda **kw: sent.append(kw) or True
    with patch.object(svc, '_admin', return_value=admin), \
            patch('services.email_service.email_service', email), \
            patch('services.notification_service.NotificationService', return_value=notes):
        yield {'db': db, 'admin': admin, 'sent': sent, 'notes': notes}


def _token(env):
    return env['sent'][-1]['accept_url'].rsplit('/', 1)[1]


def test_the_link_is_written_only_by_a_superadmin_approval(env):
    svc.create('kid', 'Mom@Example.com')
    assert env['sent'][0]['parent_email'] == 'mom@example.com'

    svc.accept(_token(env), 'mom')
    assert env['db']['parent_student_links'] == [], 'accepting must not link: a student could name any adult'
    assert env['admin'].rpc_calls == []

    request_id = env['db']['parent_link_requests'][0]['id']
    svc.decide('boss', request_id, approve=True)
    assert env['admin'].rpc_calls[0][1]['p_parent_id'] == 'mom'
    assert env['admin'].rpc_calls[0][1]['p_student_id'] == 'kid'
    assert env['db']['parent_link_requests'][0]['status'] == 'approved'
    # Many adults hold 'student' and learn on Optio themselves; the link alone
    # opens the family pages, so the role is not touched.
    assert next(u for u in env['db']['users'] if u['id'] == 'mom')['role'] == 'student'


def test_every_superadmin_is_notified_when_a_parent_accepts(env):
    svc.create('kid', 'mom@example.com')
    svc.accept(_token(env), 'mom')

    calls = [c.kwargs for c in env['notes'].create_notification.call_args_list]
    to_admin = [c for c in calls if c['user_id'] == 'boss']
    assert len(to_admin) == 1
    assert to_admin[0]['link'] == '/admin/parent-links'
    assert 'Sarah' in to_admin[0]['message'] and 'Elanor' in to_admin[0]['message']


def test_the_parent_must_sign_in_with_the_invited_address(env):
    env['db']['users'].append({'id': 'friend', 'role': 'student', 'organization_id': None,
                               'email': 'friend@example.com', 'first_name': 'F'})
    svc.create('kid', 'mom@example.com')
    with pytest.raises(svc.ParentLinkRequestError, match='mom@example.com'):
        svc.accept(_token(env), 'friend')
    with pytest.raises(svc.ParentLinkRequestError, match='for your parent'):
        svc.accept(_token(env), 'kid')


def test_a_token_works_once_and_not_after_it_expires(env):
    svc.create('kid', 'mom@example.com')
    token = _token(env)
    svc.accept(token, 'mom')
    env['db']['users'].append({'id': 'mom2', 'role': 'parent', 'organization_id': None,
                               'email': 'mom@example.com'})
    with pytest.raises(svc.ParentLinkRequestError, match='already been used'):
        svc.accept(token, 'mom2')

    svc.cancel('kid')
    svc.create('kid', 'mom@example.com')
    env['db']['parent_link_requests'][-1]['expires_at'] = (utcnow() - timedelta(days=1)).isoformat()
    with pytest.raises(svc.ParentLinkRequestError, match='expired'):
        svc.accept(_token(env), 'mom')


def test_a_new_request_replaces_the_open_one(env):
    svc.create('kid', 'mom@example.com')
    svc.create('kid', 'dad@example.com')
    statuses = [r['status'] for r in env['db']['parent_link_requests']]
    assert statuses == ['cancelled', 'invited']


def test_declining_writes_no_link(env):
    svc.create('kid', 'mom@example.com')
    svc.accept(_token(env), 'mom')
    svc.decide('boss', env['db']['parent_link_requests'][0]['id'], approve=False)
    assert env['admin'].rpc_calls == []
    assert env['db']['parent_link_requests'][0]['status'] == 'declined'


@pytest.mark.parametrize('change, state', [
    ({'organization_id': 'org-1'}, svc.STATE_SCHOOL),
    ({'managed_by_parent_id': 'mom'}, svc.STATE_HAS_PARENT),
    ({'role': 'parent'}, svc.STATE_NOT_STUDENT),
])
def test_only_a_platform_student_with_no_parent_may_ask(env, change, state):
    next(u for u in env['db']['users'] if u['id'] == 'kid').update(change)
    assert svc.status_for_student('kid')['state'] == state
    with pytest.raises(svc.ParentLinkRequestError):
        svc.create('kid', 'mom@example.com')


def test_a_student_cannot_name_their_own_address(env):
    with pytest.raises(svc.ParentLinkRequestError, match='your own email'):
        svc.create('kid', 'kid@example.com')
