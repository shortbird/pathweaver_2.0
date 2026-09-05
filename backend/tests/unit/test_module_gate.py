"""
The module gate's contract (modules/gate.py):

  - passes through whatever it cannot attribute (no identity, no org) --
    the gate is org configuration, not authorization;
  - a disabled module 404s with a generic body in enforce mode, and only
    logs in log mode (the P1 rollout default);
  - MODULE_ENFORCEMENT=off disarms it entirely;
  - module_guard gates every route on a blueprint; require_module composes
    per-route, with any_of semantics for shared surfaces.
"""

from unittest.mock import patch

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


# ── shadow-mode reporting: one gap, one report ────────────────────────────────
#
# Log mode exists to produce a list of gaps to explain before enforcement goes
# on (module docstring). That list is about routes and orgs, not traffic: one
# Hearthwood quest page reported the same disabled `classes` module 31 times in
# two days (Sentry OPTIO-BACKEND-7W), which is one line of review work told 31
# times. These pin the deduping and the route-shaped key it depends on.

@pytest.fixture
def reported(app):
    """The (org, denied, mode) tuples the real _report sends to Sentry."""
    from modules.gate import reset_reported_gaps
    reset_reported_gaps()
    with patch('modules.gate.logger'), \
         patch('sentry_sdk.capture_message') as capture:
        yield capture
    reset_reported_gaps()


def test_a_repeated_gap_is_reported_once(client, monkeypatch, reported):
    for _ in range(3):
        _run(client, monkeypatch, '/guarded/invoices', mode='log')
    assert reported.call_count == 1


def test_the_same_gap_in_a_different_org_is_its_own_report(client, monkeypatch, reported):
    _run(client, monkeypatch, '/guarded/invoices', mode='log', org='org-1')
    _run(client, monkeypatch, '/guarded/invoices', mode='log', org='org-2')
    assert reported.call_count == 2


def test_a_different_route_in_the_same_org_is_its_own_report(client, monkeypatch, reported):
    _run(client, monkeypatch, '/guarded/invoices', mode='log')
    _run(client, monkeypatch, '/shared/billing-thing', mode='log')
    assert reported.call_count == 2


def test_the_report_names_the_route_not_the_url(app, monkeypatch, reported):
    # request.path carries record ids; keying on it would open one issue per
    # record and dedupe would never hit.
    ids = Blueprint('ids', __name__, url_prefix='/ids')
    module_guard(ids, 'classes')

    @ids.route('/quest/<quest_id>/materials')
    def materials(quest_id):
        return {'success': True}

    app.register_blueprint(ids)
    client = app.test_client()

    _run(client, monkeypatch, '/ids/quest/quest-aaa/materials', mode='log')
    _run(client, monkeypatch, '/ids/quest/quest-bbb/materials', mode='log')

    assert reported.call_count == 1
    assert '/ids/quest/<quest_id>/materials' in reported.call_args[0][0]
