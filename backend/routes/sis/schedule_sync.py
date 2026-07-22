"""
SIS Schedule Sync routes — Google Sheet master schedule as source of truth.

GET  /api/sis/schedule-sync/config  -> {sheet_url} (stored per-org)
POST /api/sis/schedule-sync/propose {sheet_url?} -> {summary, operations, warnings}

propose NEVER writes to the schedule: staff review the diff in the UI and apply
the selected operations through the existing /api/sis/schedule-ai/apply endpoint
(same operation vocabulary, same ownership re-checks, same undo). A sheet_url
passed to propose is persisted to feature_flags.sis_settings.master_schedule_url
so the next sync is one click.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from middleware.rate_limiter import rate_limit
from routes.sis import _org_or_error, ADMIN_ROLES
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_schedule_sync', __name__, url_prefix='/api/sis/schedule-sync')


def _stored_sheet_url(org_id):
    org = (get_supabase_admin_client().table('organizations')
           .select('feature_flags').eq('id', org_id).single().execute()).data or {}
    settings = (org.get('feature_flags') or {}).get('sis_settings') or {}
    return (org.get('feature_flags') or {}), settings, settings.get('master_schedule_url') or ''


@bp.route('/config', methods=['GET'])
@require_role(*ADMIN_ROLES)
def config(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    _, _, sheet_url = _stored_sheet_url(org_id)
    return jsonify({'success': True, 'sheet_url': sheet_url})


@bp.route('/propose', methods=['POST'])
@require_role(*ADMIN_ROLES)
@rate_limit(max_requests=15, window_seconds=300)
def propose(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err

    from services.sis_schedule_sync_service import propose_sync, SheetSyncError, csv_export_url

    feature_flags, settings, stored = _stored_sheet_url(org_id)
    sheet_url = ((request.json or {}).get('sheet_url') or '').strip() or stored
    if not sheet_url:
        return jsonify({'success': False,
                        'error': 'Paste the Google Sheet link for your master schedule.'}), 400

    try:
        result = propose_sync(org_id, sheet_url)
    except SheetSyncError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:  # noqa: BLE001
        logger.error(f'schedule sync propose failed for org {org_id}: {e}')
        return jsonify({'success': False,
                        'error': 'Could not read the master schedule — try again.'}), 502

    # Remember a working URL for next time (only after a successful parse,
    # and only once it validated as a real Google Sheets link).
    if sheet_url != stored:
        try:
            csv_export_url(sheet_url)
            get_supabase_admin_client().table('organizations').update({
                'feature_flags': {**feature_flags,
                                  'sis_settings': {**settings, 'master_schedule_url': sheet_url}},
            }).eq('id', org_id).execute()
        except Exception as e:  # noqa: BLE001
            logger.warning(f'schedule sync: could not persist sheet url for org {org_id}: {e}')

    return jsonify({'success': True, 'sheet_url': sheet_url, **result})
