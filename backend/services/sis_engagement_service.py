"""
SIS engagement sweep — quest-inactivity alerts for teachers.

Runs on a cron (Render cron -> secured endpoint /api/sis/internal/engagement-sweep,
same auth pattern as the attendance sweep). For each sis_enabled org, per class and
enrolled student, it raises two alert types into sis_engagement_alerts:

  - 'unfinished_next_released': a later class quest has released (publish_at <= now,
    or no schedule) while an earlier released quest is still untouched by the student.
  - 'inactive_two_weeks': the class has released quests the student hasn't finished,
    and the student has made NO task completions in any of the class's quests for 14+
    days (never-started students count once the class has been running 14 days).

Completion rule (documented, used by both alert types):
  A student has "completed" a class quest when their user_quests row for it has
  completed_at set — the platform's canonical quest-completion marker (used by
  /completed-quests, portfolio, transcript). Because students often keep a quest
  formally open while working, 'unfinished_next_released' only fires when the earlier
  quest is UNTOUCHED (zero quest_task_completions rows for it) — a student mid-quest
  is engaged and shouldn't be flagged.

Dedupe: the partial unique index on sis_engagement_alerts
UNIQUE(organization_id, student_user_id, quest_id, alert_type) WHERE resolved_at IS NULL
means each condition alerts once until a teacher resolves it. Inserts are try/except
(ON CONFLICT DO NOTHING semantics). Notifications to the class's teachers are
best-effort via the existing sis_notifications pipeline.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from services import sis_notifications
from utils.logger import get_logger

logger = get_logger(__name__)

INACTIVITY_DAYS = 14

ALERT_UNFINISHED = 'unfinished_next_released'
ALERT_INACTIVE = 'inactive_two_weeks'


def _admin():
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc)


def _sis_enabled_org_ids() -> List[str]:
    rows = (
        _admin().table('organizations').select('id, feature_flags').execute()
    ).data or []
    return [r['id'] for r in rows if (r.get('feature_flags') or {}).get('sis_enabled')]


def _parse_ts(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def _is_released(cq: Dict[str, Any], now: datetime) -> bool:
    published = _parse_ts(cq.get('publish_at'))
    return published is None or published <= now


def _order_key(cq: Dict[str, Any]):
    """Class quests are ordered by publish_at when scheduled, else by the order
    they were added (added_at), with sequence_order as the tiebreak."""
    return (
        cq.get('publish_at') or cq.get('added_at') or '',
        cq.get('sequence_order') if cq.get('sequence_order') is not None else 0,
    )


def _chunks(items: List[Any], size: int = 100):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _class_teacher_ids(class_row: Dict[str, Any], advisors_by_class: Dict[str, set]) -> set:
    ids = set(advisors_by_class.get(class_row['id'], set()))
    if class_row.get('primary_instructor_id'):
        ids.add(class_row['primary_instructor_id'])
    return ids


def run_sweep() -> Dict[str, Any]:
    """Process every sis_enabled org. Returns per-alert-type counts."""
    summary = {'orgs': 0, 'new_alerts': 0}
    for org_id in _sis_enabled_org_ids():
        summary['orgs'] += 1
        try:
            summary['new_alerts'] += _sweep_org(org_id)
        except Exception as e:  # noqa: BLE001 — one org failing must not stop the rest
            logger.warning(f"SIS engagement sweep failed for org {org_id}: {e}")
    return summary


def _sweep_org(org_id: str) -> int:
    admin = _admin()
    now = _now()
    inactivity_cutoff = now - timedelta(days=INACTIVITY_DAYS)

    classes = (
        admin.table('org_classes').select('id, name, primary_instructor_id, status')
        .eq('organization_id', org_id).execute()
    ).data or []
    classes = [c for c in classes if c.get('status') in (None, 'active')]
    if not classes:
        return 0
    class_ids = [c['id'] for c in classes]

    # Class quests, ordered per class.
    quests_by_class: Dict[str, List[Dict[str, Any]]] = {}
    cq_rows: List[Dict[str, Any]] = []
    for chunk in _chunks(class_ids):
        cq_rows.extend((
            admin.table('class_quests')
            .select('class_id, quest_id, sequence_order, publish_at, added_at')
            .in_('class_id', chunk).execute()
        ).data or [])
    for cq in cq_rows:
        quests_by_class.setdefault(cq['class_id'], []).append(cq)
    for cid in quests_by_class:
        quests_by_class[cid].sort(key=_order_key)

    # Active enrollments.
    students_by_class: Dict[str, List[str]] = {}
    enr_rows: List[Dict[str, Any]] = []
    for chunk in _chunks(class_ids):
        enr_rows.extend((
            admin.table('class_enrollments').select('class_id, student_id, status')
            .in_('class_id', chunk).eq('status', 'active').execute()
        ).data or [])
    for e in enr_rows:
        students_by_class.setdefault(e['class_id'], []).append(e['student_id'])

    all_students = sorted({e['student_id'] for e in enr_rows})
    all_quest_ids = sorted({cq['quest_id'] for cq in cq_rows})
    if not all_students or not all_quest_ids:
        return 0

    # Task completions for these (student, quest) pairs — activity + "untouched" checks.
    completions: List[Dict[str, Any]] = []
    for s_chunk in _chunks(all_students):
        for q_chunk in _chunks(all_quest_ids):
            completions.extend((
                admin.table('quest_task_completions')
                .select('user_id, quest_id, completed_at')
                .in_('user_id', s_chunk).in_('quest_id', q_chunk).execute()
            ).data or [])
    touched = set()  # (student, quest) with >= 1 task completion
    last_activity: Dict[str, Optional[datetime]] = {}  # student -> latest completion in any class quest
    quest_ids_set = set(all_quest_ids)
    for c in completions:
        key = (c['user_id'], c['quest_id'])
        touched.add(key)
        if c['quest_id'] in quest_ids_set:
            ts = _parse_ts(c.get('completed_at'))
            if ts and (last_activity.get(c['user_id']) is None or ts > last_activity[c['user_id']]):
                last_activity[c['user_id']] = ts

    # Canonical quest completion: user_quests.completed_at set.
    quest_completed = set()  # (student, quest)
    for s_chunk in _chunks(all_students):
        for q_chunk in _chunks(all_quest_ids):
            rows = (
                admin.table('user_quests').select('user_id, quest_id, completed_at')
                .in_('user_id', s_chunk).in_('quest_id', q_chunk)
                .not_.is_('completed_at', 'null').execute()
            ).data or []
            quest_completed.update((r['user_id'], r['quest_id']) for r in rows)

    # Existing OPEN alerts, to avoid re-inserting (the unique index also protects us).
    open_alerts = (
        admin.table('sis_engagement_alerts')
        .select('student_user_id, quest_id, alert_type')
        .eq('organization_id', org_id).is_('resolved_at', 'null').execute()
    ).data or []
    open_keys = {(a['student_user_id'], a.get('quest_id'), a['alert_type']) for a in open_alerts}

    quest_titles: Dict[str, str] = {}
    for q_chunk in _chunks(all_quest_ids):
        for q in (admin.table('quests').select('id, title').in_('id', q_chunk).execute()).data or []:
            quest_titles[q['id']] = q.get('title')

    advisors_by_class: Dict[str, set] = {}
    for chunk in _chunks(class_ids):
        for r in (admin.table('class_advisors').select('class_id, advisor_id, is_active')
                  .in_('class_id', chunk).execute()).data or []:
            if r.get('is_active', True) and r.get('advisor_id'):
                advisors_by_class.setdefault(r['class_id'], set()).add(r['advisor_id'])

    new_by_class: Dict[str, List[Dict[str, Any]]] = {}
    total_new = 0

    for cls in classes:
        cid = cls['id']
        cqs = quests_by_class.get(cid, [])
        released = [cq for cq in cqs if _is_released(cq, now)]
        if not released:
            continue
        # Was any quest already released 14+ days ago? (For never-active students.)
        oldest_release = min(
            (_parse_ts(cq.get('publish_at')) or _parse_ts(cq.get('added_at')) or now)
            for cq in released
        )
        for sid in students_by_class.get(cid, []):
            # (a) later quest released while an earlier released quest is untouched
            for later_idx in range(1, len(released)):
                later = released[later_idx]
                for earlier in released[:later_idx]:
                    qid = earlier['quest_id']
                    if (sid, qid) in quest_completed or (sid, qid) in touched:
                        continue
                    key = (sid, qid, ALERT_UNFINISHED)
                    if key in open_keys:
                        continue
                    details = {
                        'class_name': cls.get('name'),
                        'quest_title': quest_titles.get(qid),
                        'later_quest_id': later['quest_id'],
                        'later_quest_title': quest_titles.get(later['quest_id']),
                    }
                    if _insert_alert(org_id, cid, sid, qid, ALERT_UNFINISHED, details):
                        open_keys.add(key)
                        new_by_class.setdefault(cid, []).append({'student': sid, 'type': ALERT_UNFINISHED})
                        total_new += 1

            # (b) inactive for 14+ days with unfinished released work
            unfinished = [cq for cq in released if (sid, cq['quest_id']) not in quest_completed]
            if not unfinished:
                continue
            last = last_activity.get(sid)
            inactive = (last is not None and last < inactivity_cutoff) or \
                       (last is None and oldest_release < inactivity_cutoff)
            if not inactive:
                continue
            # Anchor the alert to the first unfinished released quest so the
            # partial unique index can dedupe (quest_id must be non-null).
            anchor_qid = unfinished[0]['quest_id']
            key = (sid, anchor_qid, ALERT_INACTIVE)
            if key in open_keys:
                continue
            details = {
                'class_name': cls.get('name'),
                'quest_title': quest_titles.get(anchor_qid),
                'last_activity_at': last.isoformat() if last else None,
                'days_threshold': INACTIVITY_DAYS,
            }
            if _insert_alert(org_id, cid, sid, anchor_qid, ALERT_INACTIVE, details):
                open_keys.add(key)
                new_by_class.setdefault(cid, []).append({'student': sid, 'type': ALERT_INACTIVE})
                total_new += 1

    # Best-effort teacher notifications, one summary per class with new alerts.
    for cls in classes:
        new_alerts = new_by_class.get(cls['id'])
        if not new_alerts:
            continue
        n_students = len({a['student'] for a in new_alerts})
        msg = (f"{cls.get('name') or 'Your class'}: {len(new_alerts)} new engagement "
               f"alert{'s' if len(new_alerts) != 1 else ''} for "
               f"{n_students} student{'s' if n_students != 1 else ''}. "
               "Check your dashboard's Needs attention list.")
        for teacher_id in _class_teacher_ids(cls, advisors_by_class):
            sis_notifications.notify(
                teacher_id, 'Students may need attention', msg,
                organization_id=org_id,
                metadata={'class_id': cls['id']},
            )

    return total_new


def _insert_alert(org_id: str, class_id: str, student_id: str, quest_id: str,
                  alert_type: str, details: Dict[str, Any]) -> bool:
    """Insert an alert; False when it already exists (partial-unique violation)."""
    try:
        _admin().table('sis_engagement_alerts').insert({
            'organization_id': org_id,
            'class_id': class_id,
            'student_user_id': student_id,
            'quest_id': quest_id,
            'alert_type': alert_type,
            'details': details,
        }).execute()
        return True
    except Exception:
        return False


# ── Read/resolve (used by the staff routes) ──────────────────────────────────

def list_open_alerts(org_id: str, class_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Open alerts for an org (optionally scoped to an advisor's classes) with
    student / class / quest names hydrated."""
    admin = _admin()
    query = (
        admin.table('sis_engagement_alerts').select('*')
        .eq('organization_id', org_id).is_('resolved_at', 'null')
        .order('created_at', desc=True)
    )
    if class_ids is not None:
        if not class_ids:
            return []
        query = query.in_('class_id', class_ids)
    alerts = query.execute().data or []
    if not alerts:
        return []

    student_ids = sorted({a['student_user_id'] for a in alerts if a.get('student_user_id')})
    cls_ids = sorted({a['class_id'] for a in alerts if a.get('class_id')})
    quest_ids = sorted({a['quest_id'] for a in alerts if a.get('quest_id')})

    names: Dict[str, str] = {}
    if student_ids:
        for u in (admin.table('users')
                  .select('id, display_name, first_name, last_name, username, email')
                  .in_('id', student_ids).execute()).data or []:
            names[u['id']] = ((u.get('display_name') or
                               f"{u.get('first_name') or ''} {u.get('last_name') or ''}").strip()
                              or u.get('username') or u.get('email') or 'Student')
    class_names: Dict[str, str] = {}
    if cls_ids:
        for c in (admin.table('org_classes').select('id, name')
                  .in_('id', cls_ids).execute()).data or []:
            class_names[c['id']] = c.get('name')
    quest_names: Dict[str, str] = {}
    if quest_ids:
        for q in (admin.table('quests').select('id, title')
                  .in_('id', quest_ids).execute()).data or []:
            quest_names[q['id']] = q.get('title')

    out = []
    for a in alerts:
        out.append({
            'id': a['id'],
            'alert_type': a['alert_type'],
            'created_at': a.get('created_at'),
            'details': a.get('details') or {},
            'class_id': a.get('class_id'),
            'class_name': class_names.get(a.get('class_id')),
            'student_user_id': a.get('student_user_id'),
            'student_name': names.get(a.get('student_user_id'), 'Student'),
            'quest_id': a.get('quest_id'),
            'quest_title': quest_names.get(a.get('quest_id')),
        })
    return out


def resolve_alert(org_id: str, alert_id: str,
                  class_ids: Optional[List[str]] = None) -> bool:
    """Mark an alert resolved. class_ids (advisor scope) restricts which classes'
    alerts the caller may resolve; None = unrestricted (admin). Returns False when
    the alert isn't visible to the caller."""
    admin = _admin()
    rows = (
        admin.table('sis_engagement_alerts').select('id, organization_id, class_id')
        .eq('id', alert_id).limit(1).execute()
    ).data
    if not rows or rows[0].get('organization_id') != org_id:
        return False
    if class_ids is not None and rows[0].get('class_id') not in class_ids:
        return False
    admin.table('sis_engagement_alerts').update(
        {'resolved_at': _now().isoformat()}
    ).eq('id', alert_id).execute()
    return True
