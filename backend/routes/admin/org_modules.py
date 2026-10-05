"""
The Blocks panel API: per-org building-block toggles (superadmin only).

GET  /api/admin/organizations/<org_id>/modules   every registry module with its
                                                 config value + effective answer
PATCH /api/admin/organizations/<org_id>/modules  {"community": true, ...}

The PATCH is a server-side merge into feature_flags.modules ONLY — the client
never round-trips the blob here, so this write cannot clobber settings, and the
blob write path restores `modules` against stale tabs (guard_org_flags_write in
utils/org_finance_flags.py). The validation, the dependency check (409 naming
the conflict) and the legacy-flag mirror live in modules/toggle.py, shared with
the school setup form. Core modules and the AI master (dedicated consent
columns) refuse politely.
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
        raise


@bp.route('/<org_id>/modules', methods=['PATCH'])
@require_superadmin
def patch_organization_modules(superadmin_user_id, org_id):
    """Toggle building blocks: body {"community": true, "billing": false}."""
    try:
        from modules.toggle import ModuleChangeError, apply_changes, check_changes

        changes = request.get_json(silent=True) or {}
        try:
            check_changes(changes)
        except ModuleChangeError as err:
            return jsonify({'error': err.message}), err.status

        from repositories.organization_repository import OrganizationRepository
        repo = OrganizationRepository()
        org = repo.find_by_id(org_id)
        if not org:
            return jsonify({'error': 'Organization not found'}), 404

        try:
            flags = apply_changes(org, changes)
        except ModuleChangeError as err:
            return jsonify({'error': err.message, 'violations': err.violations}), err.status
        post = {**org, 'feature_flags': flags}
        updated = repo.update_organization(org_id, {'feature_flags': flags})

        logger.info(f"[Blocks] superadmin {superadmin_user_id} set modules for "
                    f"org {org_id}: {changes}")
        rows = _module_rows(updated or post)
        if rows.get('billing', {}).get('effective'):
            rows['billing']['open_invoices'] = _open_invoice_count(org_id)
        return jsonify({'success': True, 'modules': rows}), 200
    except Exception as e:
        logger.error(f"Error updating modules for org {org_id}: {e}")
        raise
