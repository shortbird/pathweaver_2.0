"""
Effective-module evaluation: the compat guarantee, tested against the real
storage shapes orgs carry in production (fixtures mirror the P0 parity
baseline, docs/blocks/PARITY_BASELINE_2026-09-03.json).

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
LMS_ON = {'journal', 'courses', 'bounties', 'observer', 'friends', 'student_chat'}

# The 13 opt-out SIS module keys plus the no-legacy defaults that ride along
# once `sis` is on.
# clp is not here since 2026-10-08: opt-in on sis_settings.clp_enabled (iCreate).
SIS_DEFAULT_ON = {
    'attendance', 'billing', 'calendar', 'classes', 'curriculum',
    'onboarding', 'reports', 'resources', 'secure_documents',
    'tasks', 'training',
    'catalog', 'registration', 'submissions',
    # A teacher working with one student outside any class (2026-10-07).
    'individual_work',
}


def org(flags=None, ai=True, accreditation='none'):
    return {'id': 'org-1', 'feature_flags': flags or {}, 'ai_features_enabled': ai,
            'accreditation_source': accreditation}


# ---------------------------------------------------------------------------
# The real production shapes
# ---------------------------------------------------------------------------

def test_icreate_shape_everything_on_plus_community():
    row = org({'sis_enabled': True,
               'sis_settings': {'community_enabled': True, 'clp_enabled': True}})
    got = effective_modules_for_row(row)
    assert got == CORE | LMS_ON | {'ai', 'sis', 'community', 'clp'} | SIS_DEFAULT_ON


def test_clp_is_on_only_where_clp_enabled_is_set():
    """CLPs are iCreate's workflow (2026-10-08): no other school gets the
    module, and hiding it still wins over the setting."""
    assert 'clp' not in effective_modules_for_row(org({'sis_enabled': True}))
    assert 'clp' in effective_modules_for_row(
        org({'sis_enabled': True, 'sis_settings': {'clp_enabled': True}}))
    assert 'clp' not in effective_modules_for_row(
        org({'sis_enabled': True, 'sis_settings': {'clp_enabled': True, 'hidden_modules': ['clp']}}))


def test_optio_academy_shape_twelve_hidden_plus_optins():
    # 'timesheets' and 'forms' stay in the org's stored array: those modules
    # were removed (2026-09-18, 2026-09-24), and a key nothing registers is
    # ignored, not an error.
    hidden = ['attendance', 'calendar', 'classes', 'clp', 'curriculum',
              'forms', 'onboarding', 'reports', 'resources',
              'secure_documents', 'timesheets', 'training']
    row = org({'sis_enabled': True,
               'registration': {'fee_cents': 0},
               'sis_settings': {'hidden_modules': hidden,
                                'post_registration_flow': 'goals',
                                'prior_learning_enabled': True}},
              accreditation='optio')
    got = effective_modules_for_row(row)
    sis_part = {'sis', 'billing', 'tasks', 'goals', 'prior_learning',
                'registration', 'submissions', 'catalog', 'individual_work'}
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
    assert {'clp', 'forms', 'onboarding', 'timesheets'} & got == set()  # timesheets: no such module any more


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


def test_kiosk_is_a_platform_block_with_no_sis_parent():
    """An LMS-only school (no SIS console) can run classroom kiosks: the flat
    legacy flag and the explicit modules entry both turn it on without `sis`,
    an explicit off beats the flat flag, and it is off by default. Arete
    Academy was the first such school (2026-09-07); with parent='sis' the
    device card was unreachable for them."""
    assert MODULES['kiosk'].parent is None
    assert not module_enabled_for_row(org({}), 'kiosk')
    assert module_enabled_for_row(org({'kiosk': True}), 'kiosk')
    assert module_enabled_for_row(org({'modules': {'kiosk': True}}), 'kiosk')
    assert not module_enabled_for_row(org({'kiosk': True, 'modules': {'kiosk': False}}), 'kiosk')
    got = effective_modules_for_row(org({'modules': {'kiosk': True}}))
    assert 'kiosk' in got and 'sis' not in got


def test_prior_learning_exists_only_where_the_diploma_is_optio_academys():
    """2026-10-07: a school without the diploma setting has no reviewer for
    prior learning, so the module is off there whatever its flags say."""
    sis = {'sis_enabled': True}
    assert module_enabled_for_row(org(sis, accreditation='optio'), 'prior_learning')
    assert not module_enabled_for_row(org(sis, accreditation='none'), 'prior_learning')
    assert not module_enabled_for_row(org(sis, accreditation='self'), 'prior_learning')
    assert not module_enabled_for_row(
        org({**sis, 'sis_settings': {'prior_learning_enabled': True}}), 'prior_learning')
    # A row read without the column fails closed.
    assert not module_enabled_for_row({'id': 'o', 'feature_flags': sis}, 'prior_learning')
    # And a diploma school may still switch it off.
    assert not module_enabled_for_row(
        org({**sis, 'sis_settings': {'prior_learning_enabled': False}}, accreditation='optio'),
        'prior_learning')


# ---------------------------------------------------------------------------
# The starter baseline (docs/MICROSCHOOL_FIRST_PLAN.md, part 1)
# ---------------------------------------------------------------------------

STARTER_OFF_KEYS = {'registration', 'catalog', 'billing', 'tasks', 'onboarding',
                    'secure_documents', 'clp', 'resources', 'training'}


def test_the_starter_baseline_turns_the_office_side_off():
    row = org({'sis_enabled': True, 'module_baseline': 'starter'})
    got = effective_modules_for_row(row)
    assert got == CORE | LMS_ON | {'ai', 'sis'} | (SIS_DEFAULT_ON - STARTER_OFF_KEYS)
    # The teaching side stays.
    assert {'classes', 'attendance', 'submissions', 'curriculum', 'calendar',
            'reports'} <= got


def test_under_the_baseline_an_explicit_entry_still_wins():
    row = org({'sis_enabled': True, 'module_baseline': 'starter',
               'modules': {'billing': True, 'registration': True, 'classes': False}})
    assert module_enabled_for_row(row, 'billing')
    assert module_enabled_for_row(row, 'registration')
    assert not module_enabled_for_row(row, 'classes')
    assert not module_enabled_for_row(row, 'tasks')


def test_the_baseline_beats_the_legacy_hidden_modules_answer():
    """hidden_modules is an opt-out list: a module absent from it reads on.
    Under the baseline, absence from the list is not an opt-in."""
    row = org({'sis_enabled': True, 'module_baseline': 'starter',
               'sis_settings': {'hidden_modules': ['attendance']}})
    assert not module_enabled_for_row(row, 'tasks')
    assert not module_enabled_for_row(row, 'attendance')
    assert module_enabled_for_row(row, 'calendar')


def test_the_baseline_does_not_turn_on_the_console():
    row = org({'module_baseline': 'starter'})
    assert effective_modules_for_row(row) == CORE | LMS_ON | {'ai'}


def test_an_unknown_baseline_value_changes_nothing():
    row = org({'sis_enabled': True, 'module_baseline': 'everything'})
    assert module_enabled_for_row(row, 'billing')


def test_orgs_without_a_baseline_are_exactly_as_before():
    """The rollout promise: no existing school moves. iCreate (console on,
    nothing hidden) and Horizon (console on, every office module on, a
    leftover icreate_registration config) carry no module_baseline key."""
    icreate = org({'sis_enabled': True,
                   'sis_settings': {'community_enabled': True, 'clp_enabled': True}})
    assert effective_modules_for_row(icreate) == \
        CORE | LMS_ON | {'ai', 'sis', 'community', 'clp'} | SIS_DEFAULT_ON

    horizon = org({'sis_enabled': True,
                   'icreate_registration': {'enabled': True},
                   'modules': {'student_chat': False}})
    assert effective_modules_for_row(horizon) == \
        CORE | (LMS_ON - {'student_chat'}) | {'ai', 'sis'} | SIS_DEFAULT_ON


def test_the_microschool_baseline_starts_one_child_at_a_time():
    """Orgs created from 2026-10-08 (docs/sis/SIS_SIMPLIFICATION.md, decision
    2): no classes, timetable, roll, curriculum or reports, and the coach's
    weekly goals on. An explicit modules entry still wins either way."""
    from modules.registry import MICROSCHOOL_OFF
    row = org({'sis_enabled': True, 'module_baseline': 'microschool'})
    got = effective_modules_for_row(row)
    assert not (got & MICROSCHOOL_OFF)
    assert {'weekly_goals', 'individual_work', 'submissions'} <= got
    row = org({'sis_enabled': True, 'module_baseline': 'microschool',
               'modules': {'classes': True, 'weekly_goals': False}})
    got = effective_modules_for_row(row)
    assert 'classes' in got and 'weekly_goals' not in got


def test_starter_orgs_keep_what_they_had():
    """New schools only (Tanner, 2026-10-08): a 'starter' org still has
    classes and no weekly goals unless it turned them on."""
    got = effective_modules_for_row(org({'sis_enabled': True, 'module_baseline': 'starter'}))
    assert 'classes' in got and 'weekly_goals' not in got
