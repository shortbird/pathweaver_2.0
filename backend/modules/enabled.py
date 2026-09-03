"""
Effective-module evaluation for an organization.

The config is a veneer (docs/ARCHITECTURE_BLOCKS.md section 4.2): an explicit
`feature_flags.modules[key]` wins; an absent key derives from the module's
legacy gate (`sis_enabled`, `hidden_modules`, the opt-in booleans, goals mode);
absent everywhere, the registry default decides. An org with no `modules` key
therefore behaves exactly as it did before the registry existed, and deleting
the `modules` keys is the rollback for the whole program.

Only `parent` cascades at read time (turning `sis` off silences every SIS
module). `requires` / `requires_any` are validated when a toggle is WRITTEN,
never here -- read-time transitive enforcement could silently kill a live org's
billing over a mis-migrated dependency.

The pure functions take an organization ROW (feature_flags + the AI columns) so
tests and scripts run without a database; the org_id wrappers add a fail-closed
fetch cached on flask.g for the life of the request, mirroring
utils/org_features.py semantics.
"""

from typing import Dict, FrozenSet, List, Optional

from modules.registry import MODULES, ModuleDef
from utils.logger import get_logger

logger = get_logger(__name__)

# The columns the evaluators need from `organizations`. Callers that already
# hold an org row with these fields can use the *_for_row functions directly.
ORG_ROW_COLUMNS = 'id, feature_flags, ai_features_enabled'


def _raw_value(entry: ModuleDef, flags: Dict) -> bool:
    """The org's answer for one module, before the parent cascade."""
    modules = flags.get('modules')
    if isinstance(modules, dict) and entry.key in modules:
        return bool(modules[entry.key])

    sis_settings = flags.get('sis_settings') or {}
    legacy = entry.legacy
    if legacy == 'sis_enabled':
        return bool(flags.get('sis_enabled'))
    if legacy == 'hidden_modules':
        hidden = sis_settings.get('hidden_modules')
        return not (isinstance(hidden, list) and entry.key in hidden)
    if legacy == 'community_enabled':
        return sis_settings.get('community_enabled') is True
    if legacy == 'prior_learning_enabled':
        return sis_settings.get('prior_learning_enabled') is True
    if legacy == 'kiosk_flag':
        return bool(flags.get('kiosk'))
    if legacy == 'goals_mode':
        return sis_settings.get('post_registration_flow') == 'goals'
    if legacy == 'oea_enabled':
        return bool(flags.get('oea_enabled'))
    return entry.default == 'on'


def module_enabled_for_row(org_row: Optional[Dict], key: str) -> bool:
    """Pure evaluation against an organization row. Unknown key = KeyError,
    deliberately: a typo'd gate should fail loudly in development, not
    silently disable a feature."""
    entry = MODULES[key]
    if entry.default == 'core':
        return True
    if org_row is None:
        return False
    if entry.gate == 'ai_columns':
        return bool(org_row.get('ai_features_enabled'))
    flags = org_row.get('feature_flags') or {}
    if not _raw_value(entry, flags):
        return False
    if entry.parent:
        return module_enabled_for_row(org_row, entry.parent)
    return True


def effective_modules_for_row(org_row: Optional[Dict]) -> FrozenSet[str]:
    """Every enabled module for this org row, core modules included -- the set
    payloads carry to the frontend and fan-in services filter by."""
    return frozenset(k for k in MODULES if module_enabled_for_row(org_row, k))


def effective_modules_list(org_row: Optional[Dict]) -> List[str]:
    """Sorted list form, for JSON payloads."""
    return sorted(effective_modules_for_row(org_row))


# ---------------------------------------------------------------------------
# org_id wrappers: fetch + per-request cache, fail closed
# ---------------------------------------------------------------------------

def _org_row(org_id: str) -> Optional[Dict]:
    """Fetch the org's gating columns, cached on flask.g for the request.
    Returns None (fail closed) on a missing org or any error."""
    cache = None
    try:
        from flask import g, has_app_context
        if has_app_context():
            cache = g.setdefault('_module_org_rows', {})
            if org_id in cache:
                return cache[org_id]
    except ImportError:  # scripts without flask on the path
        pass

    row = None
    try:
        # admin client justified: reads org-level gating columns for access
        # gating; no user context, single-row read keyed by org_id. Mirrors
        # utils/org_features.org_has_feature.
        from database import get_supabase_admin_client
        result = get_supabase_admin_client().table('organizations') \
            .select(ORG_ROW_COLUMNS).eq('id', org_id).single().execute()
        row = result.data or None
    except Exception as e:
        logger.warning(f'Could not read module flags for org {org_id}: {e}')
        row = None

    if cache is not None:
        cache[org_id] = row
    return row


def module_enabled(org_id: Optional[str], key: str) -> bool:
    """Is `key` on for this org? Core modules are True without a DB read (a
    flags hiccup must not take down the LMS); everything else fails closed on
    a missing org_id, a missing org, or a read error."""
    entry = MODULES[key]
    if entry.default == 'core':
        return True
    if not org_id:
        return False
    return module_enabled_for_row(_org_row(org_id), key)


def enabled_set(org_id: Optional[str]) -> FrozenSet[str]:
    """The org's full effective module set (core included). For fan-in
    services that compose several modules' data in one pass."""
    if not org_id:
        return frozenset(k for k, m in MODULES.items() if m.default == 'core')
    return effective_modules_for_row(_org_row(org_id))
