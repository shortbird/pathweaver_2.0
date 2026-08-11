"""
SIS reporting — enrollment, revenue, and attendance summaries for the admin console.

The aggregation math is pure (testable without a DB); thin wrappers fetch the rows.
Revenue is record-only (billed vs. collected vs. outstanding) — Optio reports money,
it doesn't move it. See SIS_IMPLEMENTATION_PLAN.md (M7).
"""

from typing import Dict, List, Any

from database import get_supabase_admin_client
from services import sis_attendance_service as attendance
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)


def _admin():
    return get_supabase_admin_client()


# ── Pure aggregators (unit-tested) ───────────────────────────────────────────
def aggregate_revenue(invoices: List[Dict[str, Any]]) -> Dict[str, Any]:
    billed = sum(i.get('total_cents', 0) for i in invoices)
    collected = sum(i.get('amount_paid_cents', 0) for i in invoices)
    by_status: Dict[str, int] = {}
    for i in invoices:
        by_status[i.get('status', 'unknown')] = by_status.get(i.get('status', 'unknown'), 0) + 1
    return {
        'invoice_count': len(invoices),
        'billed_cents': billed,
        'collected_cents': collected,
        'outstanding_cents': max(0, billed - collected),
        'by_status': by_status,
    }


def aggregate_enrollment(school_enrollments: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_status: Dict[str, int] = {}
    for e in school_enrollments:
        by_status[e.get('status', 'unknown')] = by_status.get(e.get('status', 'unknown'), 0) + 1
    return {'total': len(school_enrollments), 'by_status': by_status}


# ── DB wrappers ──────────────────────────────────────────────────────────────
# Every read here spans a whole organization, so each one is paged with
# fetch_all_rows: PostgREST silently caps a single response at 1000 rows, and a
# truncated read makes these reports quietly wrong (the enrollment report's
# class_enrollments read was the first to cross the cap — OPTIO-BACKEND-4K,
# 1000 of 1248 rows). Attendance grows per student per day, so it gets there
# fastest of all.

def enrollment_report(org_id: str) -> Dict[str, Any]:
    enrollments = fetch_all_rows(lambda: (
        _admin().table('school_enrollments').select('status')
        .eq('organization_id', org_id)
    ))
    active_classes = (
        _admin().table('org_classes').select('id', count='exact')
        .eq('organization_id', org_id).neq('status', 'archived').execute()
    ).count or 0
    report = aggregate_enrollment(enrollments)
    report['active_classes'] = active_classes
    return report


def revenue_report(org_id: str) -> Dict[str, Any]:
    invoices = fetch_all_rows(lambda: (
        _admin().table('sis_invoices')
        .select('status, total_cents, amount_paid_cents')
        .eq('organization_id', org_id)
    ))
    return aggregate_revenue(invoices)


def attendance_report(org_id: str) -> Dict[str, Any]:
    records = fetch_all_rows(lambda: (
        _admin().table('sis_attendance').select('status, class_id')
        .eq('organization_id', org_id)
    ))
    overall = attendance.summarize(records)
    # per-class breakdown
    by_class: Dict[str, List[Dict[str, Any]]] = {}
    for r in records:
        by_class.setdefault(r['class_id'], []).append(r)
    per_class = [{'class_id': cid, **attendance.summarize(rs)} for cid, rs in by_class.items()]
    return {'overall': overall, 'per_class': per_class}
