"""
Registry invariants + the Python <-> moduleKeys.json parity tripwire.

The registry (backend/modules/registry.py) is the single source of truth for
the building blocks; web/src/modules/moduleKeys.json mirrors its gating
fields for the JS fallback evaluator. These tests hold the two in lockstep and
pin the promises the registry makes to existing org configs.
"""

import json
import os

import pytest

from modules.registry import (
    CATEGORIES, DEFAULTS, GATES, MICROSCHOOL_OFF, MICROSCHOOL_ON, MODULES, STARTER_KEEPS,
    STARTER_OFF, TIERS,
)

# The 12 opt-out keys are a promise already made: they are the values orgs
# carry in sis_settings.hidden_modules today (mirrors sisModules.js). Renaming
# or removing one silently un-hides a module for a school that hid it. (The
# 14th, 'timesheets', was removed with its feature on 2026-09-18, and the
# 13th, 'forms', with requests and forms on 2026-09-24 -- nothing to un-hide
# in either case; a stale key in an org's array is ignored.)
# clp left this list on 2026-10-08: it is opt-in on sis_settings.clp_enabled.
HIDDEN_MODULES_KEYS = {
    'attendance', 'billing', 'calendar', 'classes', 'curriculum',
    'onboarding', 'reports', 'resources', 'secure_documents',
    'tasks', 'training',
}

MODULE_KEYS_JSON = os.path.join(
    os.path.dirname(__file__), '..', '..', '..',
    'web', 'src', 'modules', 'moduleKeys.json',
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
        assert entry['starter_off'] == (key in STARTER_OFF), key
        expected = ('off' if key in MICROSCHOOL_OFF
                    else 'on' if key in MICROSCHOOL_ON else None)
        assert entry['microschool'] == expected, key


# ---------------------------------------------------------------------------
# The guard for new work (docs/MICROSCHOOL_FIRST_PLAN.md, part 5)
# ---------------------------------------------------------------------------

# The non-core modules that are on for a school that has not turned them off.
# Seeded 2026-10-07 with every module that was on by default that day. Adding
# a key here is a PRODUCT decision, not a code one: 97% of a quarter's feature
# tickets came from one school, and features built from its tickets shipped on
# for every other school. A new module defaults 'off' unless someone decides
# every school should have it.
ON_BY_DEFAULT_ALLOWLIST = {
    'attendance', 'billing', 'bounties', 'calendar', 'catalog', 'classes',
    'clp', 'courses', 'curriculum', 'friends', 'individual_work', 'journal', 'observer',
    'onboarding', 'prior_learning', 'registration', 'reports', 'resources',
    'secure_documents', 'student_chat', 'submissions', 'tasks', 'training',
}


def test_a_new_module_defaults_off_unless_someone_decided_otherwise():
    on = {k for k, m in MODULES.items() if m.default == 'on'}
    unexpected = sorted(on - ON_BY_DEFAULT_ALLOWLIST)
    assert not unexpected, (
        f'{unexpected} default on for every school. Make them default=\'off\', '
        'or add them to ON_BY_DEFAULT_ALLOWLIST if that is the product decision.')


def test_every_non_core_module_is_classified_for_the_starter_baseline():
    non_core = {k for k, m in MODULES.items() if m.default != 'core'}
    unclassified = sorted(non_core - STARTER_OFF - STARTER_KEEPS)
    assert not unclassified, (
        f'{unclassified} are not in STARTER_OFF or STARTER_KEEPS '
        '(modules/registry.py). Decide whether a new school starts with them.')
    assert not STARTER_OFF & STARTER_KEEPS


def test_the_starter_baseline_turns_off_the_planned_office_side():
    assert STARTER_OFF == {
        'registration', 'catalog', 'billing', 'tasks', 'onboarding',
        'secure_documents', 'clp', 'resources', 'training',
    }
