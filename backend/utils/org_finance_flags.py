"""
The money inside organizations.feature_flags, and how to keep it away from a
campus coordinator without taking the rest of the blob with it.

A coordinator runs the front office — the registration funnel, the school's
rooms and blocks, the calendar — and every one of those settings lives in the
same JSON column as the prices. Withholding the whole endpoint would take the
operational settings away with the financial ones, so it is redacted per FIELD,
the same shape as staff pay (`sis_staff_service.PAY_FIELDS`).

Redacting a read creates a hazard the pay fields do not have: the settings UI
round-trips the whole blob, so a redacted read followed by a plain write would
DELETE the keys it never received. That is why writes from a caller without
finance access are MERGED into the stored blob rather than replacing it, and why
the finance paths are restored from storage afterwards. Between them, a
coordinator's save cannot blank a price and cannot change one.
"""

from copy import deepcopy
from typing import Any, Dict, Iterable, List, Tuple

# Paths (top-level key, nested key) that only FINANCE_ROLES may see or set.
# `registration` is the org-neutral funnel config; `icreate_registration` is its
# legacy mirror, still written by the settings UI — both carry the same fees, so
# both are listed or the mirror becomes a way around the guard.
_FUNNEL_MONEY = ('fee_mode', 'registration_fee_cents', 'per_student_fee_cents', 'payment_url')

FINANCE_FLAG_PATHS: Tuple[Tuple[str, str], ...] = (
    ('sis_settings', 'optio_course_tuition_cents'),
    ('sis_settings', 'block_pricing'),
    ('sis_settings', 'supply_budget_per_student'),
    *(('registration', k) for k in _FUNNEL_MONEY),
    *(('icreate_registration', k) for k in _FUNNEL_MONEY),
)


def _paths() -> Iterable[Tuple[str, str]]:
    return FINANCE_FLAG_PATHS


def redact_finance_flags(feature_flags: Any) -> Any:
    """The blob with every finance field removed. Non-dicts pass through."""
    if not isinstance(feature_flags, dict):
        return feature_flags
    out = deepcopy(feature_flags)
    for section, key in _paths():
        node = out.get(section)
        if isinstance(node, dict):
            node.pop(key, None)
    return out


def redact_org_finance(org: Any) -> Any:
    """An organization row whose feature_flags carry no prices."""
    if not isinstance(org, dict) or not isinstance(org.get('feature_flags'), dict):
        return org
    return {**org, 'feature_flags': redact_finance_flags(org['feature_flags'])}


def _deep_merge(stored: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    """incoming wins, dict-vs-dict merges, everything else replaces.

    A null replaces rather than deletes: the settings cards write `null` to mean
    "cleared", and every reader treats null and missing the same.
    """
    out = deepcopy(stored)
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = deepcopy(value)
    return out


def changed_finance_fields(stored: Any, incoming: Any) -> List[str]:
    """Finance fields whose value the caller is trying to change.

    Absent means "not submitted" — the read never handed it over — and is not a
    change. Only a present, different value counts.
    """
    if not isinstance(incoming, dict):
        return []
    stored = stored if isinstance(stored, dict) else {}
    changed = []
    for section, key in _paths():
        node = incoming.get(section)
        if not isinstance(node, dict) or key not in node:
            continue
        stored_section = stored.get(section)
        stored_value = stored_section.get(key) if isinstance(stored_section, dict) else None
        if node[key] != stored_value:
            changed.append(f'{section}.{key}')
    return changed


def merge_without_finance(stored: Any, incoming: Any) -> Dict[str, Any]:
    """The blob to store for a caller who may not touch the money.

    Merge (so a redacted read cannot delete what it never saw), then put every
    finance field back the way it was found (so a stale tab holding old prices
    cannot rewrite them either).
    """
    stored = stored if isinstance(stored, dict) else {}
    incoming = incoming if isinstance(incoming, dict) else {}
    merged = _deep_merge(stored, incoming)
    for section, key in _paths():
        stored_section = stored.get(section)
        has_stored = isinstance(stored_section, dict) and key in stored_section
        node = merged.get(section)
        if not isinstance(node, dict):
            continue
        if has_stored:
            node[key] = deepcopy(stored_section[key])
        else:
            node.pop(key, None)
    return merged


def guarded_flags_for_front_office(stored_flags: Any, incoming_flags: Any):
    """What to store for a caller outside FINANCE_ROLES: (flags, blocked).

    `blocked` names the finance fields the payload tried to CHANGE — a 403, not
    a silent drop, so a coordinator editing a price learns why it did not save.
    Otherwise the merge above keeps every price exactly as it was found.
    """
    blocked = changed_finance_fields(stored_flags, incoming_flags)
    if blocked:
        return None, blocked
    return merge_without_finance(stored_flags, incoming_flags), []


def guard_org_flags_write(stored_flags, incoming_flags, sees_finance):
    """One gate for browser feature_flags round-trips by NON-superadmin writers.

    Two preservations against the settings UI's whole-blob read-modify-write:
    - `modules` is superadmin-owned (the Blocks panel writes it via
      PATCH .../modules), so a stale org-admin tab must not clobber it: the
      stored value always replaces whatever the browser sent
      (ARCHITECTURE_BLOCKS section 4.2);
    - the finance paths merge rather than replace for non-finance writers,
      exactly as guarded_flags_for_front_office always did.

    The caller supplies the STORED flags (utils never reach into
    repositories -- test_import_layers). Returns (flags, blocked_fields);
    flags is None when a non-finance caller changed a price.
    """
    stored = stored_flags or {}

    out = dict(incoming_flags)
    if 'modules' in stored:
        out['modules'] = stored['modules']
    else:
        out.pop('modules', None)

    if not sees_finance:
        return guarded_flags_for_front_office(stored, out)
    return out, []
