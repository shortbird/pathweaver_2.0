"""
The module gate's contract (modules/gate.py):

  - passes through whatever it cannot attribute (no identity, no org) --
    the gate is org configuration, not authorization;
  - a disabled module 404s with a generic body in enforce mode, and only
    logs in log mode (the P1 rollout default);
  - MODULE_ENFORCEMENT=off disarms it entirely;
  - module_guard gates every route on a blueprint; require_module composes
    per-route, with any_of semantics for shared surfaces;
  - a would-be block reports to Sentry keyed on the view and the modules, with
    the org on a tag -- the enforcement rollout is driven by reading these.
"""

import sys
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask, Blueprint

from modules.gate import (
    BLUEPRINT_MODULES,
    enforcement_mode,
    module_guard,
    require_module,
)


@pytest.fixture
def app():
    app = Flask(__name__)

    guarded = Blueprint('guarded', __name__, url_prefix='/guarded')
    module_guard(guarded, 'billing')

    @guarded.route('/invoices')
    def invoices():
        return {'success': True, 'via': 'blueprint'}

    shared = Blueprint('shared', __name__, url_prefix='/shared')

    @shared.route('/billing-thing')
    @require_module('billing')
    def billing_thing():
        return {'success': True, 'via': 'decorator'}

    @shared.route('/either')
    @require_module('clp', 'goals', any_of=True)
    def either():
        return {'success': True}

    # A path carrying an id, so the reporting test can prove the Sentry issue
    # keys on the view rather than on whichever quest happened to arrive.
    @shared.route('/materials/<quest_id>')
    @require_module('classes')
    def materials(quest_id):
        return {'success': True}

    app.register_blueprint(guarded)
    app.register_blueprint(shared)
    return app


@pytest.fixture
def client(app):
    return app.test_client()


def _gated(monkeypatch, mode='enforce', identity='user-1', org='org-1',
           enabled=lambda org_id, key: False):
    """Context: set the mode and patch the gate's three seams."""
    monkeypatch.setenv('MODULE_ENFORCEMENT', mode)
    return (
        patch('modules.gate._request_identity', return_value=identity),
        patch('modules.gate._request_org', return_value=org),
        patch('modules.gate.module_enabled', side_effect=enabled),
    )


def _run(client, monkeypatch, path, **kw):
    a, b, c = _gated(monkeypatch, **kw)
    with a, b, c:
        return client.get(path)


def test_disabled_module_404s_with_a_generic_body(client, monkeypatch):
    for path in ('/guarded/invoices', '/shared/billing-thing'):
        resp = _run(client, monkeypatch, path)
        assert resp.status_code == 404
        assert resp.get_json() == {'success': False, 'error': 'Not found'}


def test_enabled_module_passes(client, monkeypatch):
    resp = _run(client, monkeypatch, '/guarded/invoices',
                enabled=lambda o, k: True)
    assert resp.status_code == 200
    assert resp.get_json()['via'] == 'blueprint'


def test_log_mode_reports_but_passes(client, monkeypatch):
    with patch('modules.gate._report') as report:
        resp = _run(client, monkeypatch, '/guarded/invoices', mode='log')
    assert resp.status_code == 200
    report.assert_called_once()
    assert report.call_args[0][1] == ['billing']


def test_off_mode_never_evaluates(client, monkeypatch):
    with patch('modules.gate._request_identity') as ident:
        monkeypatch.setenv('MODULE_ENFORCEMENT', 'off')
        resp = client.get('/guarded/invoices')
    assert resp.status_code == 200
    ident.assert_not_called()


def test_unauthenticated_passes_through_to_the_routes_own_auth(client, monkeypatch):
    resp = _run(client, monkeypatch, '/guarded/invoices', identity=None)
    assert resp.status_code == 200


def test_unresolvable_org_passes_through(client, monkeypatch):
    resp = _run(client, monkeypatch, '/guarded/invoices', org=None)
    assert resp.status_code == 200


def test_any_of_passes_when_one_module_is_on(client, monkeypatch):
    resp = _run(client, monkeypatch, '/shared/either',
                enabled=lambda o, k: k == 'goals')
    assert resp.status_code == 200
    resp = _run(client, monkeypatch, '/shared/either')
    assert resp.status_code == 404


def test_introspection_for_the_coverage_test(app):
    assert BLUEPRINT_MODULES['guarded'] == 'billing'
    view = app.view_functions['shared.billing_thing']
    assert view._module_keys == ('billing',)
    assert app.view_functions['shared.either']._module_keys == ('clp', 'goals')


def test_enforcement_mode_defaults_to_log(monkeypatch):
    monkeypatch.delenv('MODULE_ENFORCEMENT', raising=False)
    assert enforcement_mode() == 'log'
    monkeypatch.setenv('MODULE_ENFORCEMENT', 'nonsense')
    assert enforcement_mode() == 'log'


def test_require_module_refuses_zero_keys():
    with pytest.raises(ValueError):
        require_module()


class _Scope:
    """Stand-in for the Sentry scope, recording what _report puts on it."""

    def __init__(self):
        self.tags = {}
        self.contexts = {}
        self.fingerprint = None

    def set_tag(self, key, value):
        self.tags[key] = value

    def set_context(self, key, value):
        self.contexts[key] = value


def _capture(client, monkeypatch, path):
    """Drive one logged block and return (scope, captured message)."""
    scope = _Scope()
    sentry = MagicMock()
    sentry.push_scope.return_value.__enter__.return_value = scope
    sentry.push_scope.return_value.__exit__.return_value = False
    with patch.dict(sys.modules, {'sentry_sdk': sentry}):
        resp = _run(client, monkeypatch, path, mode='log')
    assert resp.status_code == 200
    sentry.capture_message.assert_called_once()
    return scope, sentry.capture_message.call_args[0][0]


def test_report_keys_on_the_view_not_the_url(client, monkeypatch):
    """Two requests differing only by id are one issue, not two."""
    scope_a, message_a = _capture(client, monkeypatch, '/shared/materials/quest-aaa')
    scope_b, message_b = _capture(client, monkeypatch, '/shared/materials/quest-bbb')

    assert scope_a.fingerprint == scope_b.fingerprint
    assert scope_a.fingerprint == ['module_gate', 'log', 'shared.materials', 'classes']
    assert message_a == message_b
    assert 'quest-aaa' not in message_a
    assert message_a == '[ModuleGate] would block GET shared.materials: classes disabled'


def test_report_tags_the_org_so_one_issue_can_be_sliced_by_it(client, monkeypatch):
    """The org must not be what splits issues -- it must be what filters them."""
    scope = _Scope()
    sentry = MagicMock()
    sentry.push_scope.return_value.__enter__.return_value = scope
    sentry.push_scope.return_value.__exit__.return_value = False
    with patch.dict(sys.modules, {'sentry_sdk': sentry}):
        _run(client, monkeypatch, '/shared/materials/quest-aaa', mode='log',
             org='org-9')

    assert scope.tags['module_gate_org'] == 'org-9'
    assert scope.tags['module_gate_view'] == 'shared.materials'
    assert scope.tags['source'] == 'module_gate'
    assert scope.tags['gate_mode'] == 'log'
    # The concrete request still travels with the event, just not in its title.
    assert scope.contexts['module_gate']['path'] == '/shared/materials/quest-aaa'
    assert scope.contexts['module_gate']['organization_id'] == 'org-9'


def test_report_survives_a_sentry_that_blows_up(client, monkeypatch):
    """Instrumentation must never turn a passing request into a 500."""
    sentry = MagicMock()
    sentry.push_scope.side_effect = RuntimeError('no sentry here')
    with patch.dict(sys.modules, {'sentry_sdk': sentry}):
        resp = _run(client, monkeypatch, '/shared/materials/quest-aaa', mode='log')
    assert resp.status_code == 200
