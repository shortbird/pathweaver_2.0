"""
Registry invariants + the Python <-> moduleKeys.json parity tripwire.

The registry (backend/modules/registry.py) is the single source of truth for
the building blocks; frontend/src/modules/moduleKeys.json mirrors its gating
fields for the JS fallback evaluator. These tests hold the two in lockstep and
pin the promises the registry makes to existing org configs.
"""

import json
import os

import pytest

from modules.registry import CATEGORIES, DEFAULTS, GATES, MODULES, TIERS

# The 14 opt-out keys are a promise already made: they are the values orgs
# carry in sis_settings.hidden_modules today (mirrors sisModules.js). Renaming
# or removing one silently un-hides a module for a school that hid it.
HIDDEN_MODULES_KEYS = {
    'attendance', 'billing', 'calendar', 'classes', 'clp', 'curriculum',
    'forms', 'onboarding', 'reports', 'resources', 'secure_documents',
    'tasks', 'timesheets', 'training',
}

MODULE_KEYS_JSON = os.path.join(
    os.path.dirname(__file__), '..', '..', '..',
    'frontend', 'src', 'modules', 'moduleKeys.json',
)


def test_registry_fields_are_valid():
    for m in MODULES.values():
        assert m.category in CATEGORIES
        assert m.default in DEFAULTS
        assert m.min_tier in TIERS
        assert m.gate in GATES


def test_every_reference_targets_a_known_module():
    for m in MODULES.values():
        for ref in (m.parent,) + m.requires + m.requires_any:
            if ref is not None:
                assert ref in MODULES, f'{m.key} references unknown module {ref}'


def test_sis_modules_all_cascade_from_sis():
    """Today's shape: the only parent is 'sis'. If nesting ever deepens,
    loosen this deliberately -- read-time cascade cost grows with depth."""
    for m in MODULES.values():
        if m.parent is not None:
            assert m.parent == 'sis', f'{m.key} has unexpected parent {m.parent}'
    assert MODULES['sis'].parent is None


def test_hidden_modules_legacy_matches_the_promised_key_set():
    from_registry = {k for k, m in MODULES.items() if m.legacy == 'hidden_modules'}
    assert from_registry == HIDDEN_MODULES_KEYS


def test_core_modules_carry_no_legacy_or_parent():
    """A core module is unconditionally on; a legacy source or parent would
    imply it can be off."""
    for m in MODULES.values():
        if m.default == 'core':
            assert m.legacy is None, f'{m.key} is core but has a legacy source'
            assert m.parent is None, f'{m.key} is core but has a parent'


def test_the_sis_switch_and_money_floors_hold():
    assert MODULES['sis'].default == 'off'
    assert MODULES['sis'].legacy == 'sis_enabled'
    assert MODULES['billing'].min_tier == 'finance'
    assert MODULES['timesheets'].min_tier == 'finance'
    assert MODULES['secure_documents'].min_tier == 'hr'


def test_registration_has_no_legacy_source():
    """P0 finding: icreate and gryffin run live funnels with no registration
    config in feature_flags -- the gate must not key on the config dict."""
    assert MODULES['registration'].legacy is None
    assert MODULES['registration'].default == 'on'


@pytest.mark.skipif(not os.path.exists(MODULE_KEYS_JSON),
                    reason='frontend checkout not present')
def test_module_keys_json_mirrors_the_registry():
    with open(MODULE_KEYS_JSON) as f:
        mirror = json.load(f)

    assert set(mirror) == set(MODULES), (
        'moduleKeys.json and backend/modules/registry.py disagree on the key '
        'set -- regenerate the JSON from the registry'
    )
    for key, m in MODULES.items():
        entry = mirror[key]
        assert entry['default'] == m.default, key
        assert entry['parent'] == m.parent, key
        assert entry['legacy'] == m.legacy, key
        assert entry['requires'] == list(m.requires), key
        assert entry['requires_any'] == list(m.requires_any), key
        assert entry['gate'] == m.gate, key
