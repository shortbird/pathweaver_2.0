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

import uuid
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from services import sis_service
from services import sis_catalog_service as catalog
from services import sis_billing_service as billing
from services import sis_payment_profile as payment_profile
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger
from utils import person_name

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
    """Delegates to utils.person_name.full_name — one rule for the whole SIS.
    Ten copies of this function with two different fallback orders is half of
    why names differed screen to screen (iCreate, 2026-08-25)."""
    return person_name.full_name(u, 'Unknown')


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


def supply_fee_cents(supply_fee: Any) -> int:
    """org_classes.supply_fee (numeric DOLLARS, nullable) as whole cents.

    The column is dollars while every money column on an invoice is cents, and
    PostgREST hands numerics back as strings — so the conversion is spelled out
    once here rather than open-coded at each call site.
    """
    try:
        return max(0, int(round(float(supply_fee or 0) * 100)))
    except (TypeError, ValueError):
        return 0


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


def _household_plan_preference(household_id: Optional[str]) -> Optional[str]:
    """The in-full-or-monthly plan staff recorded for a family, if any."""
    if not household_id:
        return None
    try:
        row = (_admin().table('households').select('payment_plan_preference')
               .eq('id', household_id).limit(1).execute()).data
        return (row[0].get('payment_plan_preference') if row else None)
    except Exception as e:  # noqa: BLE001 — context, never a blocker
        logger.warning(f'tuition: payment plan lookup failed for {household_id[:8]}: {e}')
        return None


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
            'supply_fee_cents': supply_fee_cents(c.get('supply_fee')),
            'meetings': c.get('meetings') or [],
            'primary_instructor': pi.get('name') if isinstance(pi, dict) else None,
        })
    out.sort(key=lambda c: (c['name'] or '').lower())
    return out


# How a class's materials fee is described on the invoice. The class name is
# repeated so a family (and UFA, reading the same invoice) can tell which
# supply charge belongs to which class instead of seeing a row of bare "Supply
# fee" lines that only differ by amount.
SUPPLY_LINE_SUFFIX = ' — supplies'

# class_meetings.day_of_week is Sunday=0, matching the front end's DAY_LETTER.
_DAY_LETTERS = {0: 'Su', 1: 'M', 2: 'T', 3: 'W', 4: 'Th', 5: 'F', 6: 'Sa'}


def class_label(cls: Dict[str, Any]) -> str:
    """A class name with the days it meets, e.g. "Ukelele Jam (T/Th)".

    The same class name repeats across sections -- iCreate runs three Reading
    Tutorings and two Ukelele Jams -- so a bare name on a bill does not say which
    one a family is being charged for (2026-08-26: "If classes could always show
    the initials of which day, that would be helpful on billing and tuition
    pages"). The attendance page has labelled classes this way for a while;
    this is the same idea on the money.
    """
    name = cls.get('name') or 'Class'
    days, seen = [], set()
    for m in (cls.get('meetings') or []):
        dow = m.get('day_of_week')
        letter = _DAY_LETTERS.get(dow)
        if letter and letter not in seen:
            seen.add(letter)
            days.append((dow, letter))
    if not days:
        return name
    # A name that already carries its day ("Ukelele Jam (Thurs Block 3)") does
    # not need it twice.
    ordered = '/'.join(l for _, l in sorted(days))
    if ordered.lower() in name.lower():
        return name
    return f'{name} ({ordered})'


def supply_line_items(classes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """PURE. One line item per enrolled class that charges a materials fee.

    Split out from tuition rather than folded into the class's own line: the
    office reconciles supply money separately (families pay it to UFA as its own
    item), so it has to be a row somebody can point at.
    """
    out = []
    for c in classes:
        fee = int(c.get('supply_fee_cents') or 0)
        if fee <= 0:
            continue
        out.append({'class_id': c.get('class_id'),
                    'description': f"{class_label(c)}{SUPPLY_LINE_SUFFIX}",
                    'amount_cents': fee,
                    'kind': 'supply'})
    return out


def seed_line_items(classes: List[Dict[str, Any]], tuition_plan: Optional[str],
                    block_pricing: Optional[Dict[str, Any]],
                    private_school_name: Optional[str]) -> List[Dict[str, Any]]:
    """PURE. Seed invoice line items from a student's finalized schedule.

    A flat-plan student (e.g. sis_tuition_plan='ufa_academy', when the org has
    block_pricing for that plan) bills a single annual-tuition line; everyone
    else bills per class from org_classes.price_cents. The approver can edit,
    add, or remove any line before sending.

    Either way the class supply fees follow as their own lines. They are NOT
    covered by a flat plan — the parent-facing Schedule Builder has always
    quoted tuition + supplies (ScheduleBuilderPage `totalYearCents`), so an
    invoice that left them off billed a number the family was never shown, and
    the office had to open all 198 classes to find the fees by hand.
    """
    plan_key = _PLAN_PRICING_KEY.get(tuition_plan or '', tuition_plan)
    plan_cfg = (block_pricing or {}).get(plan_key) if plan_key else None
    year_cents = plan_cfg.get('year_cents') if isinstance(plan_cfg, dict) else None
    if tuition_plan and isinstance(year_cents, int) and year_cents > 0:
        label = (f"{private_school_name} annual tuition" if private_school_name
                 else 'Annual tuition')
        tuition = [{'class_id': None, 'description': label,
                    'amount_cents': year_cents, 'kind': 'tuition'}]
    else:
        tuition = [{'class_id': c['class_id'],
                    'description': class_label(c),
                    'amount_cents': int(c.get('price_cents') or 0),
                    'kind': 'tuition'} for c in classes]
    return tuition + supply_line_items(classes)


def _enrolled_student_ids(org_id: str) -> List[str]:
    """Every student with an active enrollment in one of this org's classes.

    Paged: one row per enrollment across the whole school is exactly the read
    that silently truncates at the PostgREST cap once an org grows, and a
    truncated tuition queue is a family who never gets a bill.
    """
    class_ids = [c['id'] for c in catalog.list_classes(org_id)]
    if not class_ids:
        return []
    rows = fetch_all_rows(lambda: (
        _admin().table('class_enrollments').select('id, student_id')
        .in_('class_id', class_ids).eq('status', 'active')
    ))
    seen, out = set(), []
    for r in rows:
        sid = r.get('student_id')
        if sid and sid not in seen:
            seen.add(sid)
            out.append(sid)
    return out


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


def pending_count(org_id: str) -> int:
    """How many students are waiting to be invoiced — the number without the queue.

    Counts the same set tuition_queue() lists, CLP included or not; a tile that
    disagrees with the page it links to is worse than no tile.

    tuition_queue() answers the same question, but to do it it prices every
    student's schedule: the catalog, their enrollments, their household and its
    funding source. That is the right work for the page and 8x the work for a
    dashboard tile, which needs one integer.
    """
    invoiced = _invoiced_student_ids(org_id)
    return len([sid for sid in _enrolled_student_ids(org_id) if sid not in invoiced])


def tuition_queue(org_id: str) -> Dict[str, Any]:
    """The tuition-approver queue: every enrolled student not yet invoiced, each
    with a total seeded from their schedule and a flag for whether their CLP is
    finished.

    The CLP used to be a gate — an unfinished plan meant the family did not
    appear here at all. iCreate asked for it off ("Can I have everyone show up on
    the tuition page whether or not they have completed their CLP, please?",
    87d32ab1): the office knows which families are still mid-plan and would
    rather see them and decide, than have the page silently omit them and be
    unable to tell an empty queue from a hidden one. It rides along as
    `clp_finished` so the page can badge and filter on it.
    """
    from services import sis_clp_service as clp
    finished = clp.finished_student_ids(org_id)
    invoiced = _invoiced_student_ids(org_id)
    enrolled = _enrolled_student_ids(org_id)
    pending = [sid for sid in enrolled if sid not in invoiced]
    if not pending:
        return {'students': [], 'count': 0}

    settings = _sis_settings(org_id)
    block_pricing = settings.get('block_pricing') or {}
    school_name = _org_private_school_name(org_id)
    by_id = {c['id']: c for c in catalog.list_classes(org_id)}

    # Paged: one row per enrollment across every pending student is exactly the
    # read that silently truncates at the PostgREST cap. A dropped tail here does
    # not hide a family — `pending` already listed them — it prices them at $0,
    # which is worse: the queue shows a real student with no classes and nothing
    # owed. (Sentry OPTIO-BACKEND-72, at 1268 active enrollments.)
    enrollments = fetch_all_rows(lambda: (
        _admin().table('class_enrollments').select('id, student_id, class_id, status')
        .in_('student_id', pending).eq('status', 'active')
    ))
    classes_by_student: Dict[str, List[str]] = {}
    for e in enrollments:
        classes_by_student.setdefault(e['student_id'], []).append(e['class_id'])

    users = {u['id']: u for u in (_admin().table('users')
             .select('id, first_name, last_name, display_name, username, email, sis_tuition_plan, preferred_name')
             .in_('id', pending).execute()).data or []}
    hh_map = sis_service._household_by_user(org_id)
    hh_ids = list({(hh_map.get(sid) or {}).get('household_id')
                   for sid in pending if hh_map.get(sid)})
    funding, plan_pref = {}, {}
    if hh_ids:
        for h in (_admin().table('households')
                  .select('id, funding_source, payment_plan_preference')
                  .in_('id', hh_ids).execute()).data or []:
            funding[h['id']] = h.get('funding_source')
            plan_pref[h['id']] = h.get('payment_plan_preference')
    # What the family themselves said at registration. The approver needs it
    # here: `funding_source` is staff-set and usually blank, so without this the
    # queue cannot answer "is this family on UFA?" — the question that decides
    # what gets sent, and when.
    profiles = payment_profile.profiles_for_org(org_id)

    students = []
    for sid in pending:
        u = users.get(sid, {})
        cls = [{'class_id': cid,
                'name': (by_id.get(cid) or {}).get('name'),
                'price_cents': (by_id.get(cid) or {}).get('price_cents'),
                'supply_fee_cents': supply_fee_cents((by_id.get(cid) or {}).get('supply_fee'))}
               for cid in classes_by_student.get(sid, []) if by_id.get(cid)]
        cls.sort(key=lambda c: (c['name'] or '').lower())
        seeds = seed_line_items(cls, u.get('sis_tuition_plan'), block_pricing, school_name)
        hh = hh_map.get(sid) or {}
        hh_id = hh.get('household_id')
        fs = funding.get(hh_id)
        prof = profiles.get(hh_id) or {}
        students.append({
            'student_id': sid,
            'name': _full_name(u),
            'household_id': hh.get('household_id'),
            'household_name': hh.get('household_name'),
            'class_count': len(cls),
            'estimated_total_cents': sum(li['amount_cents'] for li in seeds),
            'supply_total_cents': sum(li['amount_cents'] for li in seeds
                                      if li.get('kind') == 'supply'),
            'tuition_plan': u.get('sis_tuition_plan'),
            'funding_source': fs,
            'pay_through_ufa': fs in UFA_FUNDING_SOURCES,
            'stated_payment_methods': prof.get('methods') or [],
            'stated_ufa_private': prof.get('ufa_private'),
            'payment_plan': plan_pref.get(hh_id) or prof.get('plan'),
            'clp_finished': sid in finished,
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
            .select('id, first_name, last_name, display_name, username, email, sis_tuition_plan, preferred_name')
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
    profile = payment_profile.profile_for_household(org_id, household_id)
    plan = _household_plan_preference(household_id) or profile.get('plan')

    clp_finished = False
    try:
        from services import sis_clp_service as clp
        clp_finished = bool(clp.get_clp_record(org_id, student_id).get('finished'))
    except Exception as e:  # noqa: BLE001 — decoration, never a blocker
        logger.warning(f'tuition preview: CLP record lookup failed for {student_id[:8]}: {e}')

    return {
        # Reserved here so the PDF the approver previews carries the very
        # invoice number and pay link the family will receive. Nothing is
        # written until they send; an id they never use costs nothing.
        'provisional_invoice_id': str(uuid.uuid4()),
        'student': {'id': student_id, 'name': _full_name(u)},
        'household_id': household_id,
        'household_name': household_name,
        'funding_source': funding,
        'funding_label': billing._FUNDING_LABELS.get(funding) if funding else None,
        'pay_through_ufa': funding in UFA_FUNDING_SOURCES,
        'stated_payment_methods': profile.get('methods') or [],
        'stated_ufa_private': profile.get('ufa_private'),
        'payment_plan': plan,
        'tuition_plan': u.get('sis_tuition_plan'),
        'clp_finished': clp_finished,
        'organization': billing._org_branding([org_id]).get(org_id) or {},
        'classes': classes,
        'line_items': line_items,
        'supply_total_cents': sum(li['amount_cents'] for li in line_items
                                  if li.get('kind') == 'supply'),
        'subtotal_cents': subtotal,
        'discount_cents': 0,
        'total_cents': subtotal,
        'already_invoiced': bool(_existing_invoice(org_id, student_id)),
        'existing_invoice': _existing_invoice(org_id, student_id),
    }


def preview_invoice_document(org_id: str, student_id: str,
                             line_items: List[Dict[str, Any]],
                             discount_cents: int = 0,
                             due_date: Optional[str] = None,
                             invoice_id: Optional[str] = None) -> Dict[str, Any]:
    """The invoice document for a student who has NOT been invoiced yet.

    Same shape sis_billing_service.invoice_document() returns for a real
    invoice, assembled from the approver's edited line items instead of from
    saved rows — so the PDF the approver previews is rendered by the same code,
    from the same shape, as the one the family will receive. A preview built any
    other way is a drawing of an invoice rather than the invoice.

    `invoice_id` is the id the approver RESERVED when they opened this student
    (tuition_preview returns one). Both the invoice number and the pay link are
    derived from the id, so reserving it up front is what lets the preview show
    the real number and a working pay link instead of blanks — and what makes
    the preview and the sent PDF the same document rather than two similar ones.
    """
    if not sis_service.student_in_org(student_id, org_id):
        return {'error': 'Student not found'}
    urow = (_admin().table('users')
            .select('id, first_name, last_name, display_name, username, email, preferred_name')
            .eq('id', student_id).limit(1).execute()).data
    if not urow:
        return {'error': 'Student not found'}

    household_id, household_name, funding = _student_household(org_id, student_id)
    address = None
    if household_id:
        rows = (_admin().table('households')
                .select('name, address_line1, address_line2, city, state, postal_code')
                .eq('id', household_id).limit(1).execute()).data
        address = rows[0] if rows else None

    items = [{'description': (li.get('description') or 'Charge'),
              'amount_cents': int(li.get('amount_cents') or 0)}
             for li in (line_items or [])]
    subtotal = sum(li['amount_cents'] for li in items)
    discount = max(0, min(int(discount_cents or 0), subtotal))
    total = subtotal - discount

    return {'document': {
        'organization': billing._org_branding([org_id]).get(org_id) or {},
        'invoice_number': billing._make_invoice_number(invoice_id) if invoice_id else None,
        'status': 'preview',
        # Issued when it is sent, so a preview showing today's date would be
        # wrong for any invoice reviewed today and sent tomorrow.
        'issued_at': None,
        'due_date': due_date,
        'family': {'name': household_name, 'address': address},
        'student_name': _full_name(urow[0]),
        'funding_source': funding,
        'funding_label': billing._FUNDING_LABELS.get(funding) if funding else None,
        'line_items': items,
        'subtotal_cents': subtotal,
        'discount_cents': discount,
        'processing_fee_cents': 0,
        'total_cents': total,
        'amount_due_cents': total,
        'amount_paid_cents': 0,
        'payments': [],
    }}


def send_tuition_invoice(org_id: str, student_id: str, actor_id: str,
                         line_items: List[Dict[str, Any]], discount_cents: int = 0,
                         note: Optional[str] = None,
                         due_date: Optional[str] = None,
                         invoice_id: Optional[str] = None) -> Dict[str, Any]:
    """Create one 'sent' tuition invoice for the student from the approver-verified
    line items and email the family. Returns {invoice, emailed} or {error}."""
    if not sis_service.student_in_org(student_id, org_id):
        return {'error': 'Student not found'}
    household_id, _, _ = _student_household(org_id, student_id)
    result = billing.create_tuition_invoice(
        org_id, student_user_id=student_id, household_id=household_id,
        line_items=line_items, discount_cents=discount_cents, note=note,
        due_date=due_date, status='sent', actor_user_id=actor_id,
        # The id the approver reserved at preview, so the invoice they checked
        # is the invoice that goes out — same number, same pay link.
        invoice_id=invoice_id)
    if result.get('error'):
        return result
    invoice = result['invoice']
    emailed = 0
    try:
        emailed = billing.email_invoice_to_family(org_id, invoice['id']).get('emailed', 0)
    except Exception as e:  # noqa: BLE001 — a failed email must not undo a created invoice
        logger.warning(f"tuition invoice {invoice['id']}: family email failed: {e}")
    return {'invoice': invoice, 'emailed': emailed}
