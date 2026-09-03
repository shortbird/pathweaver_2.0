"""
Shared registration-funnel completion (blocks P4).

`finish_fee_step` and `org_funnel_config` lived as private helpers in
routes/registration_funnel.py, and routes/sis/__init__.py's waive-fee endpoint
imported them route-to-route — the exact import shape the layering rules forbid
the other way around. Both funnels' shared half now lives here; the funnel
routes and the SIS waive-fee route call the service.

Bodies here are the main-branch versions as of the 2026-09-03 merge, which
carry the icreate_registrations -> registrations rename, the org-neutral email
copy, and the Optio Academy enrollment hand-off. Do not re-derive them from the
pre-merge blocks branch.
"""

import re
from datetime import datetime

from repositories.registration_repository import REGISTRATIONS_TABLE
from services import academy_enrollment_service as academy_enrollment
from services.email_service import email_service
from utils.registration_config import get_registration_config
from utils.logger import get_logger

logger = get_logger(__name__)


def _abs_url(v):
    """Config URLs saved without a scheme would render as relative links."""
    s = (v or '').strip()
    if not s:
        return ''
    return s if re.match(r'^https?://', s, re.I) else f'https://{s}'


def _parent_row(admin, parent_id):
    r = admin.table('users').select('id, email, first_name, last_name, avatar_url, phone_number').eq('id', parent_id).maybe_single().execute()
    return (r.data if r else None) or {}


def org_funnel_config(admin, org_id):
    # maybe_single(): a missing org row returns {} instead of raising PGRST116
    # (which surfaced as a confirm_payment error in Sentry).
    #
    # This returns PUBLIC funnel config only. The Stripe secret key used to live
    # in here (the registration flag's stripe_secret_key) and was readable over
    # the public anon key -- see AUDIT.md C1. It now lives in
    # organization_secrets; fetch it explicitly with _org_stripe_key().
    r = admin.table('organizations').select('feature_flags').eq('id', org_id).maybe_single().execute()
    return get_registration_config(((r.data if r else None) or {}).get('feature_flags'))


def finish_fee_step(admin, reg, cfg, extra_fields=None):
    """Shared fee completion: email the post-registration next step and complete
    the registration. Which next step depends on the org's
    sis_settings.post_registration_flow:
      'schedule' (default) — the iCreate flow: Schedule Builder + CLP
        appointment link (only sent when a scheduling_url is configured);
      'goals' — set-your-student-goals email pointing at /family/goals (sent
        regardless of scheduling_url, which goals orgs typically leave empty).
    Either way the emailed-at moment lands in scheduling_emailed_at (in goals
    mode it simply means "completion email sent"). Returns the response payload."""
    scheduling_url = _abs_url(cfg.get('scheduling_url'))
    now = datetime.utcnow().isoformat()

    emailed_at = None
    parent = _parent_row(admin, reg['parent_user_id'])
    org = admin.table('organizations').select('name, feature_flags') \
        .eq('id', reg['organization_id']).single().execute().data
    flow = ((((org or {}).get('feature_flags') or {}).get('sis_settings') or {})
            .get('post_registration_flow') or 'schedule')
    if flow == 'goals':
        if parent.get('email'):
            try:
                from app_config import Config
                org_name = (org or {}).get('name') or 'your school'
                goals_url = f"{Config.FRONTEND_URL.rstrip('/')}/family/goals"
                html = (
                    f"<p>Hi {parent.get('first_name') or 'there'},</p>"
                    f"<p>Thanks for registering with {org_name}!</p>"
                    f"<p>Your next step: sit down with each of your kids and set a direction "
                    f"and goals for the year together. You'll then review those goals in a "
                    f"meeting with {org_name} staff.</p>"
                    f"<p><a href=\"{goals_url}\">Set your student's goals</a></p>"
                    f"<p>If the link doesn't work, copy and paste this into your browser:<br>{goals_url}</p>"
                )
                if email_service.send_email(parent['email'], f'{org_name}: set your student goals', html):
                    emailed_at = now
            except Exception as e:  # noqa: BLE001
                logger.warning(f'registration: goals email failed for registration {reg["id"]}: {e}')
    elif scheduling_url and parent.get('email'):
        try:
            from app_config import Config
            org_name = (org or {}).get('name') or 'your school'
            builder_url = f"{Config.FRONTEND_URL.rstrip('/')}/schedule-builder"
            html = (
                f"<p>Hi {parent.get('first_name') or 'there'},</p>"
                f"<p>Thanks for registering with {org_name}! Don't forget to book your "
                f"appointment with {org_name} staff to build your Customized Learning Plan.</p>"
                f"<p><a href=\"{scheduling_url}\">Book your appointment</a></p>"
                f"<p>Before the meeting, please use the "
                f"<a href=\"{builder_url}\">Schedule Builder</a> to create your family's "
                f"schedule for the coming school year so our team can review it with you.</p>"
                f"<p>If a link doesn't work, copy and paste this into your browser:<br>{scheduling_url}</p>"
            )
            if email_service.send_email(parent['email'], f'{org_name}: book your appointment', html):
                emailed_at = now
        except Exception as e:  # noqa: BLE001
            logger.warning(f'registration: scheduling email failed for registration {reg["id"]}: {e}')

    payload = {
        'fee_recorded_at': now, 'scheduling_emailed_at': emailed_at,
        'status': 'completed', 'completed_at': now, 'updated_at': now,
        **(extra_fields or {}),
    }
    admin.table(REGISTRATIONS_TABLE).update(payload).eq('id', reg['id']).execute()

    academy_enrollment.enroll_registration_kids(reg, cfg, client=admin)

    # A release put this household on hold until the deferred fee was settled —
    # settling it clears the hold (only OUR hold; a school-set hold stays).
    # Skipped while the fee is still deferred (all-waitlisted family finishing
    # the funnel unpaid — no hold exists yet).
    if not reg.get('fee_deferred'):
        try:
            from services.sis_enrollment_waitlist_service import FEE_HOLD_REASON
            admin.table('households').update({
                'registration_hold': False, 'registration_hold_reason': None,
            }).eq('organization_id', reg['organization_id']) \
                .eq('primary_contact_user_id', reg['parent_user_id']) \
                .eq('registration_hold_reason', FEE_HOLD_REASON).execute()
        except Exception as e:  # noqa: BLE001
            logger.warning(f'registration fee: hold clear failed for {reg["id"]}: {e}')

    return {
        'success': True, 'status': 'completed',
        'scheduling_url': scheduling_url,
        'scheduling_emailed': bool(emailed_at),
    }
