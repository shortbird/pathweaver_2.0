"""
The Blocks panel API: per-org building-block toggles (superadmin only).

GET  /api/admin/organizations/<org_id>/modules   every registry module with its
                                                 config value + effective answer
PATCH /api/admin/organizations/<org_id>/modules  {"community": true, ...}

The PATCH is a server-side merge into feature_flags.modules ONLY — the client
never round-trips the blob here, so this write cannot clobber settings, and the
blob write path restores `modules` against stale tabs (guard_org_flags_write in
utils/org_finance_flags.py). Dependencies are validated at toggle time with a
409 naming the conflict; only violations a change INTRODUCES block it, so a
legacy state that already violates a dependency never wedges the panel. Core
modules and the AI master (dedicated consent columns) refuse politely.
ARCHITECTURE_BLOCKS sections 4.2 and 4.7.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_superadmin
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('org_modules', __name__)


def _module_rows(org):
    """Every registry module with its config value and effective answer for
    this org row -- the Blocks panel's data."""
    from modules import MODULES, module_enabled_for_row
    raw = (org.get('feature_flags') or {}).get('modules') or {}
    rows = {}
    for key, m in MODULES.items():
        rows[key] = {
            'name': m.name,
            'category': m.category,
            'blocks': list(m.blocks),
            'default': m.default,
            'parent': m.parent,
            'requires': list(m.requires),
            'requires_any': list(m.requires_any),
            'min_tier': m.min_tier,
            'gate': m.gate,
            'raw': raw.get(key) if key in raw else None,
            'effective': module_enabled_for_row(org, key),
            'blocked_by_parent': bool(m.parent) and not module_enabled_for_row(org, m.parent),
        }
    return rows


def _requires_violations(org_row):
    """Toggle-time dependency check: for every effectively-on module, its
    requires/requires_any must hold. Returns human-readable violations."""
    from modules import MODULES, module_enabled_for_row
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


def _open_invoice_count(org_id):
    """How many invoices are still collecting money — the number a superadmin
    should see before turning billing off (v2 of the panel). Count-only and
    best-effort: a billing hiccup must not break the toggle."""
    try:
        from database import get_supabase_admin_client
        from services.sis_billing_service import OPEN_INVOICE_STATUSES
        # admin client justified: superadmin-only route; a count for a warning
        return (get_supabase_admin_client().table('sis_invoices')
                .select('id', count='exact')
                .eq('organization_id', org_id)
                .in_('status', list(OPEN_INVOICE_STATUSES))
                .execute().count or 0)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'[Blocks] open-invoice count failed for {org_id}: {e}')
        return None


def _mirror_legacy_flags(flags, sis_settings, changes):
    """Transition-window mirroring (dropped in P4): these keys have legacy
    flags with live readers not yet on the module system (sis_enabled sweeps
    and parent-service checks, routes/kiosk.py, the prior-learning and
    community bespoke gates, the goals family flow). The module map stays
    authoritative -- an explicit entry beats the legacy answer -- the mirror
    just keeps un-migrated readers agreeing in the meantime."""
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


@bp.route('/<org_id>/modules', methods=['GET'])
@require_superadmin
def get_organization_modules(superadmin_user_id, org_id):
    """The org's building blocks (superadmin only — org admins see their
    enabled set read-only via effective_modules on the org payloads)."""
    try:
        from repositories.organization_repository import OrganizationRepository
        org = OrganizationRepository().find_by_id(org_id)
        if not org:
            return jsonify({'error': 'Organization not found'}), 404
        rows = _module_rows(org)
        # Blocks panel v2: name the consequence before the superadmin turns
        # billing off — families mid-payment lose their portal view of these.
        if rows.get('billing', {}).get('effective'):
            rows['billing']['open_invoices'] = _open_invoice_count(org_id)
        return jsonify({'success': True, 'modules': rows}), 200
    except Exception as e:
        logger.error(f"Error reading modules for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/modules', methods=['PATCH'])
@require_superadmin
def patch_organization_modules(superadmin_user_id, org_id):
    """Toggle building blocks: body {"community": true, "billing": false}."""
    try:
        from modules import MODULES

        changes = request.get_json(silent=True) or {}
        if not changes or not isinstance(changes, dict):
            return jsonify({'error': 'Body must map module keys to booleans'}), 400
        for key, value in changes.items():
            if key not in MODULES:
                return jsonify({'error': f'Unknown module: {key}'}), 400
            if not isinstance(value, bool):
                return jsonify({'error': f'Module {key}: value must be true or false'}), 400
            if MODULES[key].default == 'core':
                return jsonify({'error': f'{MODULES[key].name} is part of the core platform '
                                         'and cannot be turned off'}), 400
            if MODULES[key].gate == 'ai_columns':
                return jsonify({'error': 'AI tools are controlled by the AI settings '
                                         '(parental-consent columns), not the module map'}), 400

        from repositories.organization_repository import OrganizationRepository
        repo = OrganizationRepository()
        org = repo.find_by_id(org_id)
        if not org:
            return jsonify({'error': 'Organization not found'}), 404

        flags = dict(org.get('feature_flags') or {})
        merged = {**(flags.get('modules') or {}), **changes}
        post = {**org, 'feature_flags': {**flags, 'modules': merged}}

        introduced = sorted(set(_requires_violations(post)) - set(_requires_violations(org)))
        if introduced:
            return jsonify({'error': 'That change breaks a dependency: '
                                     + '; '.join(introduced),
                            'violations': introduced}), 409

        sis_settings = dict(flags.get('sis_settings') or {})
        _mirror_legacy_flags(flags, sis_settings, changes)
        if sis_settings != (flags.get('sis_settings') or {}):
            flags['sis_settings'] = sis_settings

        flags['modules'] = merged
        updated = repo.update_organization(org_id, {'feature_flags': flags})

        logger.info(f"[Blocks] superadmin {superadmin_user_id} set modules for "
                    f"org {org_id}: {changes}")
        rows = _module_rows(updated or post)
        if rows.get('billing', {}).get('effective'):
            rows['billing']['open_invoices'] = _open_invoice_count(org_id)
        return jsonify({'success': True, 'modules': rows}), 200
    except Exception as e:
        logger.error(f"Error updating modules for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500
