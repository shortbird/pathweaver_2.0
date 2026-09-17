"""The SIS cron endpoints, declared once.

Every `/api/sis/internal/<name>` is the same shape: a POST the Render cron
(`jobs/cron_dispatch.py`) hits with `X-Cron-Secret`, or a signed-in
superadmin triggers by hand; it runs one service sweep across every org and
answers `{'success': True, **summary}`. Seven of them grew up in five route
modules, each with its own copy of the authorisation block and its own
`.table('users')` read for the superadmin check
(docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, K6). This module is the one
declaration: the table below is the whole cron surface, and a new sweep is a
new row, not a new forty-line route.

Not module-gated on purpose. The gate (modules/gate.py) answers "is this
module on for the org this request is about", and a sweep is about every org
at once -- the service filters per org. That is the same exemption the old
routes had in practice (an unauthenticated request passes the gate), stated
here in one place and in tests/unit/test_module_coverage.py's exemption list.

The URL paths are unchanged, so the cron dispatcher and its Render schedule
are untouched (a half-applied cron change took every job down for two days in
July 2026; see docs/OPS_HISTORY.md).
"""

from flask import Blueprint, jsonify, request

from services import sis_service
from utils.cron_auth import is_valid_cron_secret
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('sis_internal', __name__, url_prefix='/api/sis/internal')


def _authorized() -> bool:
    """X-Cron-Secret, or a signed-in superadmin for manual triggering."""
    if is_valid_cron_secret(request.headers.get('X-Cron-Secret')):
        return True
    from utils.session_manager import session_manager
    uid = session_manager.get_effective_user_id()
    if not uid:
        return False
    # One read, through the same helper every SIS role decision uses; a
    # superadmin "viewing as" another role is that role here too.
    return sis_service.get_user_org_context(uid).get('role') == 'superadmin'


def _run_attendance_sweep():
    """Start-of-class reminders and attendance-gap alerts."""
    from services import sis_attendance_sweep_service as sweep
    return sweep.run_sweep()


def _run_billing_reminders():
    """Payment-reminder sweep across every org.

    The online-payment sweep rides on this daily run rather than getting a
    cron entry of its own: a new schedule means new Render config, and a
    half-applied cron change already took every job down for two days
    (CRON_SECRET, July 2026). It runs first so a payment made yesterday is
    recorded before we consider nagging that family about it.
    """
    from services import sis_billing_service as billing
    swept = billing.sweep_online_payments()
    return {'payment_sweep': swept, **billing.run_payment_reminders()}


def _run_tuition_autopay():
    """Charge every due auto-charge installment (saved-card payment plans)."""
    from services import sis_billing_service as billing
    return billing.charge_due_installments()


def _run_recurring_tuition():
    """Bill every household whose open-ended monthly tuition falls due today:
    one invoice and one charge per household, with a line per student.
    Idempotent within a day -- a billed row's next_charge_on has already moved
    to next month, so a re-run finds nothing due."""
    from services import sis_recurring_tuition_service as recurring
    return recurring.charge_due()


def _run_engagement_sweep():
    """Quest-inactivity alerts for teachers."""
    from services import sis_engagement_service as engagement
    return engagement.run_sweep()


def _run_publish_class_quests():
    """Enroll students in class quests whose publish time has passed.

    Assigning a quest enrolls the class, but a quest scheduled for LATER
    deliberately doesn't -- so this is what enrolls it when its time arrives.
    Idempotent, so running it every cycle is safe.
    """
    from database import get_supabase_admin_client
    from services.class_quest_enrollment import publish_due_class_quests
    # admin client justified: publishes due class quests across every org on
    #   a schedule, with no caller session
    return publish_due_class_quests(get_supabase_admin_client())


def _run_waitlist_offer_sweep():
    """Expire per-class waitlist offers past their TTL and re-alert admins
    that the seat is open."""
    from services import sis_waitlist_service as waitlist
    return waitlist.expire_stale_offers()


#: name -> the sweep. The path is /api/sis/internal/<name>; the dispatcher's
#: schedule (jobs/cron_dispatch.py) names the same seven.
CRON_SWEEPS = {
    'attendance-sweep': _run_attendance_sweep,
    'billing-reminders': _run_billing_reminders,
    'tuition-autopay': _run_tuition_autopay,
    'recurring-tuition': _run_recurring_tuition,
    'engagement-sweep': _run_engagement_sweep,
    'publish-class-quests': _run_publish_class_quests,
    'waitlist-offer-sweep': _run_waitlist_offer_sweep,
}


def cron_route(name: str, run) -> None:
    """Declare POST /api/sis/internal/<name>: authorise, run, answer."""
    def view():
        if not _authorized():
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        summary = run()
        logger.info(f'sis cron {name}: {summary}')
        return jsonify({'success': True, **summary})
    view.__name__ = name.replace('-', '_')
    view.__doc__ = run.__doc__
    bp.add_url_rule(f'/{name}', endpoint=view.__name__, view_func=view, methods=['POST'])


for _name, _run in CRON_SWEEPS.items():
    cron_route(_name, _run)
