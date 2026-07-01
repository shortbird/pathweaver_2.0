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
    """Orgs running the OEA diploma program (feature flag or the 'oea' slug)."""
    rows = _admin().table('organizations').select('id, slug, feature_flags').execute().data or []
    out = []
    for r in rows:
        flags = r.get('feature_flags') or {}
        if flags.get('oea_enabled') or r.get('slug') == 'oea' or r.get('slug', '').startswith('hearthwood'):
            out.append(r['id'])
    return out


def _org_admins(org_id: str) -> List[str]:
    rows = _admin().table('users').select('id, org_role, org_roles') \
        .eq('organization_id', org_id).execute().data or []
    admins = []
    for u in rows:
        roles = set()
        if u.get('org_role'):
            roles.add(u['org_role'])
        if isinstance(u.get('org_roles'), list):
            roles.update(u['org_roles'])
        if 'org_admin' in roles:
            admins.append(u['id'])
    return admins


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
                        m = result['missing']
                        msg = (f"{c.get('course_name')}: Q{term_index} is missing "
                               f"{m['logs']} learning log(s), {m['artifacts']} artifact(s), "
                               f"{m['summaries']} quarterly summary.")
                        for admin_id in admins:
                            sis_notifications.notify(
                                admin_id, 'OEA: missing quarterly uploads', msg,
                                organization_id=org_id,
                                metadata={'student_id': student_id, 'credit_id': c['id'],
                                          'term_index': term_index})
                        summary['flags'] += 1
        except Exception as e:
            logger.warning(f"OEA compliance sweep failed for org {org_id}: {e}")

    return summary
