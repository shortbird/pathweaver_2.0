"""Writing module toggles: the one path that changes feature_flags.modules.

Used by the superadmin Blocks panel (routes/admin/org_modules.py) and by the
school setup form (services/school_onboarding_service.py), which turns on the
features a new school picks. Both must validate the same way, refuse the same
dependency breaks, and mirror the same legacy flags, so the logic lives here
rather than in either caller.

The change is a merge into feature_flags.modules ONLY -- callers never
round-trip the blob through here. Dependencies are validated at toggle time;
only violations a change INTRODUCES block it, so a legacy state that already
violates a dependency never wedges a later toggle. ARCHITECTURE_BLOCKS
sections 4.2 and 4.7.
"""

from typing import Any, Dict, List, Optional

from modules.enabled import module_enabled_for_row
from modules.registry import MODULES


class ModuleChangeError(Exception):
    def __init__(self, message: str, status: int = 400, violations: Optional[List[str]] = None):
        super().__init__(message)
        self.message, self.status, self.violations = message, status, violations or []


def requires_violations(org_row: Dict[str, Any]) -> List[str]:
    """For every effectively-on module, its requires/requires_any must hold.
    Returns human-readable violations."""
    out = []
    for key, m in MODULES.items():
        if not module_enabled_for_row(org_row, key):
            continue
        for req in m.requires:
            if not module_enabled_for_row(org_row, req):
                out.append(f"'{key}' requires '{req}'")
        if m.requires_any and not any(module_enabled_for_row(org_row, r)
                                      for r in m.requires_any):
            out.append(f"'{key}' requires one of {sorted(m.requires_any)}")
    return out


def mirror_legacy_flags(flags: Dict[str, Any], sis_settings: Dict[str, Any],
                        changes: Dict[str, bool]) -> None:
    """Transition-window mirroring (dropped in P4): these keys have legacy
    flags with live readers not yet on the module system (sis_enabled sweeps
    and parent-service checks, routes/kiosk.py, the prior-learning and
    community bespoke gates, the goals family flow). The module map stays
    authoritative -- an explicit entry beats the legacy answer -- the mirror
    just keeps un-migrated readers agreeing in the meantime.

    hidden_modules is the list a human edits in the SIS console and the
    authoritative statement of what a school has, so it must not contradict
    the map: a module switched on leaves the list, one switched off joins it."""
    hidden = list(sis_settings.get('hidden_modules') or [])
    for key, value in changes.items():
        if key == 'sis':
            flags['sis_enabled'] = value
        elif key == 'kiosk':
            flags['kiosk'] = value
        elif key == 'community':
            sis_settings['community_enabled'] = value
        elif key == 'prior_learning':
            sis_settings['prior_learning_enabled'] = value
        elif key == 'goals':
            if value:
                sis_settings['post_registration_flow'] = 'goals'
            elif sis_settings.get('post_registration_flow') == 'goals':
                sis_settings['post_registration_flow'] = None
        if MODULES[key].legacy == 'hidden_modules':
            if value and key in hidden:
                hidden.remove(key)
            elif not value and key not in hidden:
                hidden.append(key)
    if hidden != list(sis_settings.get('hidden_modules') or []):
        sis_settings['hidden_modules'] = hidden


def check_changes(changes: Any) -> Dict[str, bool]:
    """The body's shape: known, non-core, non-AI module keys mapped to
    booleans. Raises ModuleChangeError naming the first problem."""
    if not changes or not isinstance(changes, dict):
        raise ModuleChangeError('Body must map module keys to booleans')
    for key, value in changes.items():
        if key not in MODULES:
            raise ModuleChangeError(f'Unknown module: {key}')
        if not isinstance(value, bool):
            raise ModuleChangeError(f'Module {key}: value must be true or false')
        if MODULES[key].default == 'core':
            raise ModuleChangeError(f'{MODULES[key].name} is part of the core platform '
                                    'and cannot be turned off')
        if MODULES[key].gate == 'ai_columns':
            raise ModuleChangeError('AI tools are controlled by the AI settings '
                                    '(parental-consent columns), not the module map')
    return changes


def apply_changes(org_row: Dict[str, Any], changes: Dict[str, bool]) -> Dict[str, Any]:
    """The org's new feature_flags with `changes` merged into the module map
    and the legacy flags mirrored. Pure: the caller writes the result. Raises
    ModuleChangeError (409) when the change breaks a dependency."""
    check_changes(changes)
    flags = dict(org_row.get('feature_flags') or {})
    merged = {**(flags.get('modules') or {}), **changes}
    post = {**org_row, 'feature_flags': {**flags, 'modules': merged}}

    introduced = sorted(set(requires_violations(post)) - set(requires_violations(org_row)))
    if introduced:
        raise ModuleChangeError('That change breaks a dependency: ' + '; '.join(introduced),
                                status=409, violations=introduced)

    sis_settings = dict(flags.get('sis_settings') or {})
    mirror_legacy_flags(flags, sis_settings, changes)
    if sis_settings != (flags.get('sis_settings') or {}):
        flags['sis_settings'] = sis_settings
    flags['modules'] = merged
    return flags
