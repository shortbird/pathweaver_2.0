"""modules/toggle.py: the one write path for module toggles.

The Blocks panel and the school setup form both go through it. What these pin
beyond the panel's own route tests: the console's hidden_modules list follows
the map (a module switched on leaves it, one switched off joins it), because
hidden_modules is what a person edits in the SIS console and must not
contradict reality; a dependency the change introduces is refused; one that was
already broken does not wedge an unrelated toggle.
"""

import pytest

from modules.toggle import ModuleChangeError, apply_changes


def org(**flags):
    return {'id': 'o1', 'feature_flags': flags, 'ai_features_enabled': False}


def test_switching_on_removes_from_hidden_and_switching_off_adds():
    row = org(sis_enabled=True, sis_settings={'hidden_modules': ['attendance', 'forms']})
    flags = apply_changes(row, {'attendance': True, 'calendar': False})
    assert flags['sis_settings']['hidden_modules'] == ['forms', 'calendar']
    assert flags['modules'] == {'attendance': True, 'calendar': False}


def test_a_module_without_a_hidden_list_gate_never_touches_the_list():
    flags = apply_changes(org(sis_enabled=True), {'catalog': False, 'submissions': False})
    assert 'sis_settings' not in flags


def test_the_legacy_flags_are_mirrored():
    flags = apply_changes(org(), {'sis': True, 'kiosk': True})
    assert flags['sis_enabled'] is True and flags['kiosk'] is True


def test_an_introduced_dependency_break_is_refused():
    with pytest.raises(ModuleChangeError) as err:
        apply_changes(org(sis_enabled=True), {'registration': False})   # billing needs it
    assert err.value.status == 409
    assert "'billing' requires 'registration'" in err.value.violations


@pytest.mark.parametrize('changes', [{'quests': False}, {'ai': True}, {'nope': True}, {'kiosk': 'yes'}, {}])
def test_bad_bodies_are_refused(changes):
    with pytest.raises(ModuleChangeError):
        apply_changes(org(), changes)
