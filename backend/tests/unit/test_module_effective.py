"""
Effective-module evaluation: the compat guarantee, tested against the real
storage shapes orgs carry in production (fixtures mirror the P0 parity
baseline, docs/blocks/PARITY_BASELINE_2026-08-22.json).

The invariant these tests pin: an org with no feature_flags.modules key
behaves exactly as it did before the registry existed -- the legacy flags
decide -- and an explicit modules entry beats the legacy answer. These are
permanent tests, not migration scaffolding.
"""

from modules.enabled import (
    effective_modules_for_row,
    module_enabled_for_row,
)
from modules.registry import MODULES

CORE = {k for k, m in MODULES.items() if m.default == 'core'}
LMS_ON = {'journal', 'courses', 'bounties', 'observer'}

# The 14 opt-out SIS module keys plus the no-legacy defaults that ride along
# once `sis` is on.
SIS_DEFAULT_ON = {
    'attendance', 'billing', 'calendar', 'classes', 'clp', 'curriculum',
    'forms', 'onboarding', 'reports', 'resources', 'secure_documents',
    'tasks', 'timesheets', 'training',
    'catalog', 'registration', 'submissions',
}


def org(flags=None, ai=True):
    return {'id': 'org-1', 'feature_flags': flags or {}, 'ai_features_enabled': ai}


# ---------------------------------------------------------------------------
# The real production shapes
# ---------------------------------------------------------------------------

def test_icreate_shape_everything_on_plus_community():
    row = org({'sis_enabled': True,
               'sis_settings': {'community_enabled': True}})
    got = effective_modules_for_row(row)
    assert got == CORE | LMS_ON | {'ai', 'sis', 'community'} | SIS_DEFAULT_ON


def test_optio_academy_shape_twelve_hidden_plus_optins():
    hidden = ['attendance', 'calendar', 'classes', 'clp', 'curriculum',
              'forms', 'onboarding', 'reports', 'resources',
              'secure_documents', 'timesheets', 'training']
    row = org({'sis_enabled': True,
               'registration': {'fee_cents': 0},
               'sis_settings': {'hidden_modules': hidden,
                                'post_registration_flow': 'goals',
                                'prior_learning_enabled': True}})
    got = effective_modules_for_row(row)
    sis_part = {'sis', 'billing', 'tasks', 'goals', 'prior_learning',
                'registration', 'submissions', 'catalog'}
    assert got == CORE | LMS_ON | {'ai'} | sis_part
    # catalog stays on at read time even though classes is hidden: `requires`
    # is toggle-time validation only, by design (ARCHITECTURE_BLOCKS 4.3).
    assert module_enabled_for_row(row, 'catalog')
    assert not module_enabled_for_row(row, 'classes')


def test_gryffin_shape_goals_mode_and_kiosk():
    row = org({'sis_enabled': True, 'kiosk': True,
               'sis_settings': {'hidden_modules': ['clp', 'forms',
                                                   'onboarding', 'timesheets'],
                                'post_registration_flow': 'goals'}})
    got = effective_modules_for_row(row)
    assert {'goals', 'kiosk', 'attendance', 'billing', 'classes'} <= got
    assert {'clp', 'forms', 'onboarding', 'timesheets'} & got == set()


def test_lms_only_shape_no_sis_modules_at_all():
    row = org({})
    got = effective_modules_for_row(row)
    assert got == CORE | LMS_ON | {'ai'}
    assert not any(MODULES[k].parent == 'sis' or k == 'sis' for k in got)


def test_hearthwood_shape_oea_enabled_grants_credits():
    row = org({'oea_enabled': True, 'registration': {'fee_cents': 0}})
    assert module_enabled_for_row(row, 'credits')
    assert not module_enabled_for_row(row, 'transcripts')  # opt-in, no legacy
    assert not module_enabled_for_row(row, 'sis')
    # P0 finding: a registration config dict must NOT enable the module
    # when sis itself is off.
    assert not module_enabled_for_row(row, 'registration')


# ---------------------------------------------------------------------------
# The veneer semantics
# ---------------------------------------------------------------------------

def test_explicit_modules_entry_beats_the_legacy_answer():
    row = org({'sis_enabled': True,
               'modules': {'billing': True},
               'sis_settings': {'hidden_modules': ['billing']}})
    assert module_enabled_for_row(row, 'billing')

    row = org({'sis_enabled': True, 'modules': {'billing': False}})
    assert not module_enabled_for_row(row, 'billing')


def test_parent_cascade_silences_children_regardless_of_their_entry():
    row = org({'modules': {'community': True}})  # sis absent -> off
    assert not module_enabled_for_row(row, 'community')

    row = org({'modules': {'sis': True}})
    assert module_enabled_for_row(row, 'community') is False  # opt-in default
    assert module_enabled_for_row(row, 'billing')             # opt-out default


def test_core_modules_are_on_without_an_org_and_cannot_be_disabled():
    assert module_enabled_for_row(None, 'quests')
    assert module_enabled_for_row(org({'modules': {'quests': False}}), 'quests')
    assert effective_modules_for_row(None) == CORE


def test_ai_gates_on_the_dedicated_column_not_flags():
    assert not module_enabled_for_row(org({}, ai=False), 'ai')
    assert module_enabled_for_row(org({'modules': {'ai': False}}, ai=True), 'ai')


def test_unknown_key_fails_loudly():
    try:
        module_enabled_for_row(org({}), 'not_a_module')
    except KeyError:
        pass
    else:
        raise AssertionError('unknown module key should raise, not default off')


def test_non_core_answers_false_without_an_org_row():
    for key in ('sis', 'billing', 'journal', 'ai'):
        assert module_enabled_for_row(None, key) is False
