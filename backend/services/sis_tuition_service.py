"""
SIS tuition approval — the CLP-finished -> approve tuition -> send invoice flow.

After a CLP (Customized Learning Plan) meeting an admin marks the CLP done
(sis_clp_records.finished_at). This service drives the Tuition Approver screen:

  - tuition_queue:   the finished-but-not-yet-invoiced students, with a total
                     seeded from each one's finalized schedule.
  - tuition_preview: one student's tuition previewed for verification — the
                     per-class breakdown (org_classes.price_cents) or, for a
                     flat-plan UFA academy student, a single annual-tuition line,
                     plus family + funding context and the branded org identity.
  - send_tuition_invoice: create ONE 'sent' invoice per student from the
                     approver-verified line items and email the family a link to
                     the /family/billing portal.

Billing itself is the existing record-only sis_billing_service; this module is
the CLP-driven workflow + preview seeding on top of it. UFA-funded families
(funding_source 'ufa' / 'ufa_private') pay THROUGH UFA, not by card — the invoice
is still generated for their records, and the portal shows a "pay through UFA"
message instead of the card button (see the parent billing overview / frontend).

Admin (service_role) client — SIS tables are RLS-locked to backend-only;
authorization is the FINANCE_ROLES gate on the /api/sis/tuition routes.
"""

from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from services import sis_service
from services import sis_catalog_service as catalog
from services import sis_billing_service as billing
from utils.logger import get_logger

# sis_clp_service is imported lazily inside the functions that use it (same idiom
# as the rest of the SIS services), so the pure helpers here don't pull it in.

logger = get_logger(__name__)

# Household funding sources that pay THROUGH UFA rather than by card in Optio.
UFA_FUNDING_SOURCES = ('ufa', 'ufa_private')

# A flat tuition-plan flag (users.sis_tuition_plan) -> its block_pricing key.
_PLAN_PRICING_KEY = {'ufa_academy': 'ufa'}


def _admin():
    return get_supabase_admin_client()


def _full_name(u: Dict[str, Any]) -> str:
    name = f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
    return name or u.get('display_name') or u.get('username') or u.get('email') or 'Unknown'


def _sis_settings(org_id: str) -> Dict[str, Any]:
    row = (_admin().table('organizations').select('feature_flags')
           .eq('id', org_id).limit(1).execute()).data
    flags = (row[0].get('feature_flags') or {}) if row else {}
    return flags.get('sis_settings') or {}


def _org_private_school_name(org_id: str) -> Optional[str]:
    row = (_admin().table('organizations').select('branding_config')
           .eq('id', org_id).limit(1).execute()).data
    cfg = (row[0].get('branding_config') or {}) if row else {}
    return (cfg.get('private_school_name') or '').strip() or None


def _student_household(org_id: str, student_id: str):
    """(household_id, household_name, funding_source) for a student; Nones if solo."""
    hh = sis_service._household_by_user(org_id).get(student_id)
    if not hh:
        return None, None, None
    fs = None
    try:
        row = (_admin().table('households').select('funding_source')
               .eq('id', hh['household_id']).limit(1).execute()).data
        fs = (row[0].get('funding_source') if row else None)
    except Exception:  # noqa: BLE001 — funding is context, never a blocker
        fs = None
    return hh['household_id'], hh.get('household_name'), fs


def _enrolled_classes(org_id: str, student_id: str,
                      by_id: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """The student's active class enrollments, with name/price/meetings from the
    catalog (pass a prefetched `by_id` catalog map to avoid re-fetching)."""
    enrolled_ids = {e['class_id'] for e in (
        _admin().table('class_enrollments').select('class_id, status')
        .eq('student_id', student_id).eq('status', 'active').execute()
    ).data or []}
    if not enrolled_ids:
        return []
    if by_id is None:
        by_id = {c['id']: c for c in catalog.list_classes(org_id)}
    out = []
    for cid in enrolled_ids:
        c = by_id.get(cid)
        if not c:
            continue
        pi = c.get('primary_instructor')
        out.append({
            'class_id': cid,
            'name': c.get('name'),
            'price_cents': c.get('price_cents'),
            'meetings': c.get('meetings') or [],
            'primary_instructor': pi.get('name') if isinstance(pi, dict) else None,
        })
    out.sort(key=lambda c: (c['name'] or '').lower())
    return out


def seed_line_items(classes: List[Dict[str, Any]], tuition_plan: Optional[str],
                    block_pricing: Optional[Dict[str, Any]],
                    private_school_name: Optional[str]) -> List[Dict[str, Any]]:
    """PURE. Seed invoice line items from a student's finalized schedule.

    A flat-plan student (e.g. sis_tuition_plan='ufa_academy', when the org has
    block_pricing for that plan) bills a single annual-tuition line; everyone
    else bills per class from org_classes.price_cents. The approver can edit,
    add, or remove any line before sending.
    """
    plan_key = _PLAN_PRICING_KEY.get(tuition_plan or '', tuition_plan)
    plan_cfg = (block_pricing or {}).get(plan_key) if plan_key else None
    year_cents = plan_cfg.get('year_cents') if isinstance(plan_cfg, dict) else None
    if tuition_plan and isinstance(year_cents, int) and year_cents > 0:
        label = (f"{private_school_name} annual tuition" if private_school_name
                 else 'Annual tuition')
        return [{'class_id': None, 'description': label, 'amount_cents': year_cents}]
    return [{'class_id': c['class_id'],
             'description': c.get('name') or 'Class',
             'amount_cents': int(c.get('price_cents') or 0)} for c in classes]


def _invoiced_student_ids(org_id: str) -> set:
    """Student ids with any non-void invoice — they're out of the approve queue."""
    rows = (_admin().table('sis_invoices').select('student_user_id, status')
            .eq('organization_id', org_id).neq('status', 'void').execute()).data or []
    return {r['student_user_id'] for r in rows if r.get('student_user_id')}


def _existing_invoice(org_id: str, student_id: str) -> Optional[Dict[str, Any]]:
    """The student's most recent non-void invoice (so the UI can warn before
    double-invoicing), or None."""
    rows = (_admin().table('sis_invoices')
            .select('id, invoice_number, status, total_cents, created_at')
            .eq('organization_id', org_id).eq('student_user_id', student_id)
            .neq('status', 'void').order('created_at', desc=True).limit(1).execute()).data or []
    if not rows:
        return None
    r = rows[0]
    return {'id': r['id'], 'invoice_number': r.get('invoice_number'),
            'status': r.get('status'), 'total_cents': r.get('total_cents')}


def tuition_queue(org_id: str) -> Dict[str, Any]:
    """The tuition-approver queue: every CLP-finished student who has NOT yet been
    invoiced, each with a total seeded from their finalized schedule."""
    from services import sis_clp_service as clp
    finished = clp.finished_student_ids(org_id)
    if not finished:
        return {'students': [], 'count': 0}
    invoiced = _invoiced_student_ids(org_id)
    pending = [sid for sid in finished if sid not in invoiced]
    if not pending:
        return {'students': [], 'count': 0}

    settings = _sis_settings(org_id)
    block_pricing = settings.get('block_pricing') or {}
    school_name = _org_private_school_name(org_id)
    by_id = {c['id']: c for c in catalog.list_classes(org_id)}

    enrollments = (_admin().table('class_enrollments').select('student_id, class_id, status')
                   .in_('student_id', pending).eq('status', 'active').execute()).data or []
    classes_by_student: Dict[str, List[str]] = {}
    for e in enrollments:
        classes_by_student.setdefault(e['student_id'], []).append(e['class_id'])

    users = {u['id']: u for u in (_admin().table('users')
             .select('id, first_name, last_name, display_name, username, email, sis_tuition_plan')
             .in_('id', pending).execute()).data or []}
    hh_map = sis_service._household_by_user(org_id)
    hh_ids = list({(hh_map.get(sid) or {}).get('household_id')
                   for sid in pending if hh_map.get(sid)})
    funding = {}
    if hh_ids:
        funding = {h['id']: h.get('funding_source') for h in (_admin().table('households')
                   .select('id, funding_source').in_('id', hh_ids).execute()).data or []}

    students = []
    for sid in pending:
        u = users.get(sid, {})
        cls = [{'class_id': cid,
                'name': (by_id.get(cid) or {}).get('name'),
                'price_cents': (by_id.get(cid) or {}).get('price_cents')}
               for cid in classes_by_student.get(sid, []) if by_id.get(cid)]
        cls.sort(key=lambda c: (c['name'] or '').lower())
        seeds = seed_line_items(cls, u.get('sis_tuition_plan'), block_pricing, school_name)
        hh = hh_map.get(sid) or {}
        fs = funding.get(hh.get('household_id'))
        students.append({
            'student_id': sid,
            'name': _full_name(u),
            'household_id': hh.get('household_id'),
            'household_name': hh.get('household_name'),
            'class_count': len(cls),
            'estimated_total_cents': sum(li['amount_cents'] for li in seeds),
            'tuition_plan': u.get('sis_tuition_plan'),
            'funding_source': fs,
            'pay_through_ufa': fs in UFA_FUNDING_SOURCES,
        })
    students.sort(key=lambda s: (s['name'] or '').lower())
    return {'students': students, 'count': len(students)}


def tuition_preview(org_id: str, student_id: str) -> Dict[str, Any]:
    """One student's tuition previewed for the approver: schedule + per-class (or
    flat) seeded line items, subtotal, family + funding context, branded org
    identity, and whether they've already been invoiced."""
    if not sis_service.student_in_org(student_id, org_id):
        return {'error': 'Student not found'}
    urow = (_admin().table('users')
            .select('id, first_name, last_name, display_name, username, email, sis_tuition_plan')
            .eq('id', student_id).limit(1).execute()).data
    if not urow:
        return {'error': 'Student not found'}
    u = urow[0]

    settings = _sis_settings(org_id)
    block_pricing = settings.get('block_pricing') or {}
    school_name = _org_private_school_name(org_id)
    classes = _enrolled_classes(org_id, student_id)
    line_items = seed_line_items(classes, u.get('sis_tuition_plan'), block_pricing, school_name)
    subtotal = sum(li['amount_cents'] for li in line_items)
    household_id, household_name, funding = _student_household(org_id, student_id)

    clp_finished = False
    try:
        from services import sis_clp_service as clp
        clp_finished = bool(clp.get_clp_record(org_id, student_id).get('finished'))
    except Exception as e:  # noqa: BLE001 — decoration, never a blocker
        logger.warning(f'tuition preview: CLP record lookup failed for {student_id[:8]}: {e}')

    return {
        'student': {'id': student_id, 'name': _full_name(u)},
        'household_id': household_id,
        'household_name': household_name,
        'funding_source': funding,
        'funding_label': billing._FUNDING_LABELS.get(funding) if funding else None,
        'pay_through_ufa': funding in UFA_FUNDING_SOURCES,
        'tuition_plan': u.get('sis_tuition_plan'),
        'clp_finished': clp_finished,
        'organization': billing._org_branding([org_id]).get(org_id) or {},
        'classes': classes,
        'line_items': line_items,
        'subtotal_cents': subtotal,
        'discount_cents': 0,
        'total_cents': subtotal,
        'already_invoiced': bool(_existing_invoice(org_id, student_id)),
        'existing_invoice': _existing_invoice(org_id, student_id),
    }


def send_tuition_invoice(org_id: str, student_id: str, actor_id: str,
                         line_items: List[Dict[str, Any]], discount_cents: int = 0,
                         note: Optional[str] = None,
                         due_date: Optional[str] = None) -> Dict[str, Any]:
    """Create one 'sent' tuition invoice for the student from the approver-verified
    line items and email the family. Returns {invoice, emailed} or {error}."""
    if not sis_service.student_in_org(student_id, org_id):
        return {'error': 'Student not found'}
    household_id, _, _ = _student_household(org_id, student_id)
    result = billing.create_tuition_invoice(
        org_id, student_user_id=student_id, household_id=household_id,
        line_items=line_items, discount_cents=discount_cents, note=note,
        due_date=due_date, status='sent', actor_user_id=actor_id)
    if result.get('error'):
        return result
    invoice = result['invoice']
    emailed = 0
    try:
        emailed = billing.email_invoice_to_family(org_id, invoice['id']).get('emailed', 0)
    except Exception as e:  # noqa: BLE001 — a failed email must not undo a created invoice
        logger.warning(f"tuition invoice {invoice['id']}: family email failed: {e}")
    return {'invoice': invoice, 'emailed': emailed}
