"""
OEA HS Diploma Phase 2 — admin compliance sweep ("flag me as admin").

Runs on the shared cron dispatcher. After a quarter's close date, for each OEA org
it checks every enrolled student's in-progress direct courses against the quarterly
upload minimums (9 logs / 3 artifacts / 1 summary) and flags org admins about any
course that fell short. Notifications reuse the existing pipeline (sis_notifications
-> in-app + push). Alerts are deduped per (student, course, quarter) via
oea_compliance_alerts so an admin is flagged at most once per course per quarter,
even though the dispatcher runs many times.

Modeled directly on services/sis_attendance_sweep_service.py.
"""

from datetime import date
from typing import Any, Dict, List

from database import get_supabase_admin_client
from services import sis_notifications
from services import oea_compliance_service as compliance
from utils import oea_rules
from utils.logger import get_logger

logger = get_logger(__name__)


def _admin():
    return get_supabase_admin_client()


def _oea_org_ids() -> List[str]:
    """Orgs running the diploma program (oea_enabled flag or a hearthwood slug)."""
    rows = _admin().table('organizations').select('id, slug, feature_flags').execute().data or []
    out = []
    for r in rows:
        flags = r.get('feature_flags') or {}
        if flags.get('oea_enabled') or r.get('slug', '').startswith('hearthwood'):
            out.append(r['id'])
    return out


def _org_admins(org_id: str) -> List[Dict[str, Any]]:
    rows = _admin().table('users').select('id, email, first_name, org_role, org_roles') \
        .eq('organization_id', org_id).execute().data or []
    admins = []
    for u in rows:
        roles = set()
        if u.get('org_role'):
            roles.add(u['org_role'])
        if isinstance(u.get('org_roles'), list):
            roles.update(u['org_roles'])
        if 'org_admin' in roles:
            admins.append(u)
    return admins


def _student_name(student_id: str) -> str:
    rows = _admin().table('users').select('display_name, first_name, last_name') \
        .eq('id', student_id).limit(1).execute().data or []
    if not rows:
        return 'Student'
    u = rows[0]
    return u.get('display_name') or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip() or 'Student'


def _missing_text(missing: Dict[str, int]) -> str:
    """Human list of what a course is short, omitting zero items."""
    parts = []
    if missing.get('logs'):
        parts.append(f"{missing['logs']} learning log(s)")
    if missing.get('artifacts'):
        parts.append(f"{missing['artifacts']} artifact(s)")
    if missing.get('summaries'):
        parts.append('the quarterly summary')
    return ' and '.join([', '.join(parts[:-1]), parts[-1]]) if len(parts) > 2 else ' and '.join(parts)


def _enrolled_students(org_id: str) -> List[str]:
    rows = _admin().table('school_enrollments').select('student_user_id') \
        .eq('organization_id', org_id).eq('status', 'enrolled').execute().data or []
    return [r['student_user_id'] for r in rows]


def _already_alerted(student_id: str, credit_id: str, school_year: str, term_index: int) -> bool:
    rows = _admin().table('oea_compliance_alerts').select('id') \
        .eq('student_id', student_id).eq('credit_id', credit_id) \
        .eq('school_year', school_year).eq('term_index', term_index).limit(1).execute().data or []
    return bool(rows)


def _record_alert(org_id, student_id, credit_id, school_year, term_index, context) -> bool:
    try:
        _admin().table('oea_compliance_alerts').insert({
            'organization_id': org_id, 'student_id': student_id, 'credit_id': credit_id,
            'school_year': school_year, 'term_index': term_index, 'context': context,
        }).execute()
        return True
    except Exception:
        return False


def _closed_quarters(settings: Dict[str, Any], today: str) -> List[int]:
    """Quarter indexes whose end date has passed (so missing uploads are now final)."""
    closed = []
    for q in settings['terms'].get('quarters', []):
        if q.get('end') and q['end'] < today:
            closed.append(int(q['index']))
    return closed


def run_sweep(today: str = None) -> Dict[str, Any]:
    """Flag org admins about courses that missed a closed quarter's upload minimums."""
    today = today or date.today().isoformat()
    summary = {'orgs': 0, 'flags': 0}

    for org_id in _oea_org_ids():
        summary['orgs'] += 1
        try:
            settings = oea_rules.load_oea_settings(_admin(), org_id)
            school_year = settings['school_year']
            closed = _closed_quarters(settings, today)
            if not closed:
                continue
            admins = _org_admins(org_id)
            if not admins:
                continue

            flagged = []  # this run's new flags, for the admin email digest
            for student_id in _enrolled_students(org_id):
                credits = _admin().table('oea_credits').select('*') \
                    .eq('student_id', student_id).eq('status', 'in_progress').execute().data or []
                for c in credits:
                    if (c.get('credit_source') or 'direct') != 'direct':
                        continue
                    for term_index in closed:
                        result = compliance.evaluate_course_quarter(
                            _admin(), c, settings, school_year, term_index)
                        if result['is_compliant']:
                            continue
                        if _already_alerted(student_id, c['id'], school_year, term_index):
                            continue
                        if not _record_alert(org_id, student_id, c['id'], school_year,
                                             term_index, result['missing']):
                            continue
                        student_name = _student_name(student_id)
                        short = _missing_text(result['missing'])
                        msg = f"{student_name} — {c.get('course_name')}: Q{term_index} is missing {short}."
                        for admin in admins:
                            sis_notifications.notify(
                                admin['id'], 'Diploma plan: missing quarterly uploads', msg,
                                organization_id=org_id,
                                metadata={'student_id': student_id, 'credit_id': c['id'],
                                          'term_index': term_index})
                        flagged.append({'student_name': student_name,
                                        'course_name': c.get('course_name'),
                                        'term_index': term_index, 'missing_text': short})
                        summary['flags'] += 1

            if flagged:
                _email_digest(admins, flagged, settings)
                summary['emails'] = summary.get('emails', 0) + len([a for a in admins if a.get('email')])
        except Exception as e:
            logger.warning(f"OEA compliance sweep failed for org {org_id}: {e}")

    return summary


def _email_digest(admins: List[Dict[str, Any]], flagged: List[Dict[str, Any]], settings: Dict[str, Any]) -> None:
    """
    One email per org admin summarizing this run's NEW flags (in-app/push already
    sent per course). Dedup comes from oea_compliance_alerts: a course/quarter that
    was flagged in a previous run is never re-emailed.
    """
    try:
        from services.email_service import email_service
    except Exception as e:  # email misconfigured: in-app flags still delivered
        logger.warning(f"OEA sweep email skipped (email service unavailable): {e}")
        return

    from html import escape
    minimums_text = oea_rules.describe_minimums(settings['minimums'])
    rows = ''.join(
        f"<tr><td style='padding:6px 12px 6px 0'>{escape(str(f['student_name']))}</td>"
        f"<td style='padding:6px 12px 6px 0'>{escape(str(f['course_name']))}</td>"
        f"<td style='padding:6px 12px 6px 0'>Q{f['term_index']}</td>"
        f"<td style='padding:6px 0'>missing {escape(f['missing_text'])}</td></tr>"
        for f in flagged
    )
    count = len(flagged)
    subject = f"Hearthwood Academy: {count} course{'s' if count != 1 else ''} missing quarterly uploads"
    html = (
        "<p>A quarter has closed and the following courses did not meet the "
        f"required quarterly uploads ({minimums_text} per course per quarter):</p>"
        f"<table style='border-collapse:collapse;font-size:14px'>{rows}</table>"
        "<p>You can review each student's uploads and grades from the organization "
        "dashboard. Parents have not been notified automatically.</p>"
    )
    text = "\n".join(
        f"{f['student_name']} — {f['course_name']}: Q{f['term_index']} missing {f['missing_text']}"
        for f in flagged
    )
    for admin in admins:
        email = (admin.get('email') or '').strip()
        if not email:
            continue
        try:
            email_service.send_email(to_email=email, subject=subject, html_body=html, text_body=text)
        except Exception as e:
            logger.warning(f"OEA sweep digest email to {email} failed: {e}")
