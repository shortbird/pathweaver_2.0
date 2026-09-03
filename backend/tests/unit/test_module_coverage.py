"""Guard: every SIS route is owned by a building-block module.

The module gate only means something if nothing slips past it. This test walks
the real url_map and asserts every rule under /api/sis is covered one of three
ways: its blueprint carries a module_guard (BLUEPRINT_MODULES), its view
carries @require_module (_module_keys), or its blueprint is on the explicit
exemption list below with a reason. A new SIS blueprint that is none of the
three is a red CI run, not a silently ungated surface.

Same app fixture as test_no_duplicate_routes.py.
"""

import pytest

# Deliberate exemptions -- keep the reasons current with routes/sis/__init__.py.
EXEMPT_BLUEPRINTS = {
    'sis_pay': 'unauthenticated by design; the signed token is the authorization',
    'sis_school': 'the discovery endpoint that reports the module set',
}

# Individual rules deliberately left ungated on an otherwise-tagged blueprint
# (parent.py's module docstring carries the same list with the reasons).
EXEMPT_RULES = {
    '/api/sis/parent/context': 'reports the module set; asked pre-render',
    '/api/sis/parent/required-documents': 'access gate; asked pre-render',
    '/api/sis/parent/photo': 'profile basics (sis people core)',
    '/api/sis/parent/students/<student_id>/photo': 'profile basics (sis people core)',
    '/api/sis/parent/quests': 'school-wide family engagement; no single module owns it',
}


@pytest.fixture(scope='module')
def flask_app():
    from app import app
    return app


def test_every_sis_rule_is_module_owned_or_exempt(flask_app):
    from modules.gate import BLUEPRINT_MODULES

    uncovered = []
    for rule in flask_app.url_map.iter_rules():
        path = str(rule)
        if not path.startswith('/api/sis'):
            continue
        blueprint = rule.endpoint.split('.')[0]
        view = flask_app.view_functions[rule.endpoint]
        if blueprint in BLUEPRINT_MODULES:
            continue
        if getattr(view, '_module_keys', None):
            continue
        if blueprint in EXEMPT_BLUEPRINTS:
            continue
        if path in EXEMPT_RULES:
            continue
        uncovered.append(f'{path}  ({rule.endpoint})')

    assert not uncovered, (
        'SIS rules with no module owner -- add the blueprint to the gating '
        'table in register_sis_routes, tag the route with @require_module, or '
        'exempt it here WITH a reason:\n  ' + '\n  '.join(sorted(uncovered))
    )


def test_gated_blueprint_modules_exist_in_the_registry(flask_app):
    from modules.gate import BLUEPRINT_MODULES
    from modules.registry import MODULES

    unknown = {name: key for name, key in BLUEPRINT_MODULES.items()
               if key not in MODULES}
    assert not unknown, f'module_guard references unknown module keys: {unknown}'


def test_exemptions_do_not_overlap_the_gated_set(flask_app):
    from modules.gate import BLUEPRINT_MODULES

    overlap = set(EXEMPT_BLUEPRINTS) & set(BLUEPRINT_MODULES)
    assert not overlap, (
        f'blueprints both gated and exempted: {sorted(overlap)} -- '
        'drop them from the exemption list'
    )


def test_the_wave_actually_attached(flask_app):
    """At least the known single-module blueprints are gated -- catches the
    mapping being emptied or register_sis_routes bypassing module_guard."""
    from modules.gate import BLUEPRINT_MODULES

    for name, key in (('sis', 'sis'), ('sis_billing', 'billing'),
                      ('sis_attendance', 'attendance'),
                      ('sis_prior_learning', 'prior_learning'),
                      ('sis_community', 'community')):
        assert BLUEPRINT_MODULES.get(name) == key, (
            f'expected blueprint {name!r} gated by {key!r}, '
            f'got {BLUEPRINT_MODULES.get(name)!r}'
        )
