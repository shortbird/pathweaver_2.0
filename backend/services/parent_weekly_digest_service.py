"""The weekly parent digest: what a child did this week, and what is still open.

Dallin Bird (Gryffin), 2026-09-07: "I don't think the parents are regularly
logging in to check how their kid is doing, it's just not part of their to-do
list. I'm guessing they stop at 'how was school today.'"

Four shape decisions worth knowing before you change this:

**The week leads; late work is a short block at the end.** A digest that opens
with what is late trains a family to dread the email, and what was actually
asked for is awareness, not enforcement.

**The email never carries evidence media.** Student photos and video live in
private buckets and are served through short-lived signed URLs
(utils/storage_urls) that expire before a message is read and, once forwarded,
hand a stranger a minor's work. So the digest NAMES the work and COUNTS the
media, and the media stays behind a login. That is also what makes the "get the
app" block honest rather than an advertisement: the photos really are only in
the app.

**"Late" uses the teacher's completion rule** (utils/quest_completion), not
`completed_at`. The difference between the two readings, measured at Gryffin on
2026-09-08, is the difference between telling a family their child has 15 late
assignments and telling them the truth.

**Off until a school turns it on**, and each school picks its own day and hour
in its own timezone. `feature_flags.sis_settings.parent_weekly_digest`.

Who counts as a current student: anyone with an ACTIVE class enrollment in the
org. `users` carries no enrolled/withdrawn status, so the roster is the only
honest answer to "is this child still at this school" — and a withdrawn family
that keeps receiving school email is the complaint you do not want.

Every query lives in repositories/parent_digest_repository; this module holds the
rules and the fan-out.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from database import get_supabase_admin_client
from repositories.parent_digest_repository import ParentDigestRepository
from utils.logger import get_logger
from utils.quest_completion import is_quest_done

logger = get_logger(__name__)

SETTINGS_KEY = 'parent_weekly_digest'
NOTIFICATION_TYPE = 'parent_weekly_digest'

DEFAULT_TZ = 'America/Denver'
DEFAULT_DAY = 'sunday'
DEFAULT_HOUR = 17

WEEKDAYS = ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')

# How much of the week the email shows before it summarises. A parent skims;
# forty task rows is a spreadsheet, not a letter.
MAX_TASKS_SHOWN = 12
# The late block is deliberately smaller than the week block. Five items and a
# count says "here is the shape of it" without reading as an indictment.
MAX_LATE_SHOWN = 5

_VIDEO_SUFFIXES = ('.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv')
_IMAGE_SUFFIXES = ('.jpg', '.jpeg', '.png', '.gif', '.heic', '.heif', '.webp')

# What a completion's evidence_text says when the real evidence is a
# multi-format document (blocks), not a note. Counting this string as writing is
# how "32 photos" becomes "123 written notes" — every Gryffin completion in the
# week of 2026-09-08 was one of these, and none of them had an evidence_url.
_BLOCK_DOC_PREFIX = 'Multi-format evidence document'

# evidence_document_blocks.block_type -> the bucket a parent understands.
_BLOCK_BUCKETS = {
    'text': 'reflections',
    'image': 'photos',
    'video': 'videos',
    'link': 'links',
}


def _repo() -> ParentDigestRepository:
    # admin client justified: the digest speaks for the whole school — it reads
    #   roster, work and guardian rows belonging to every family in the org,
    #   which no single caller can see under RLS, and it runs on a cron with no
    #   caller session at all. The org's own opt-in is the authorization.
    return ParentDigestRepository(client=get_supabase_admin_client())


# ── Settings ─────────────────────────────────────────────────────────────────

def digest_settings(org_row: Dict[str, Any]) -> Dict[str, Any]:
    """Normalized {enabled, day, hour} for an organizations row.

    Tolerant on read because this is edited by hand in the database as often as
    through the settings card: an unknown weekday or an out-of-range hour falls
    back to the default rather than skipping the org silently.
    """
    settings = ((org_row.get('feature_flags') or {}).get('sis_settings') or {})
    raw = settings.get(SETTINGS_KEY)
    if isinstance(raw, bool):  # an older/hand-written `parent_weekly_digest: true`
        raw = {'enabled': raw}
    if not isinstance(raw, dict):
        raw = {}

    day = str(raw.get('day') or DEFAULT_DAY).strip().lower()
    if day not in WEEKDAYS:
        day = DEFAULT_DAY

    try:
        hour = int(raw.get('hour', DEFAULT_HOUR))
    except (TypeError, ValueError):
        hour = DEFAULT_HOUR
    if not 0 <= hour <= 23:
        hour = DEFAULT_HOUR

    return {'enabled': bool(raw.get('enabled')), 'day': day, 'hour': hour}


def _zone(org_row: Dict[str, Any]) -> ZoneInfo:
    name = org_row.get('timezone') or DEFAULT_TZ
    try:
        return ZoneInfo(name)
    except Exception:  # noqa: BLE001 — unknown tz string on the org row
        return ZoneInfo(DEFAULT_TZ)


def in_send_window(org_row: Dict[str, Any], now: datetime) -> bool:
    """Is `now` inside this school's send hour, in this school's timezone?

    The hour, not the minute: the dispatcher ticks every ~10 minutes and we want
    every tick in that hour to be a chance to send. parent_digest_sends makes
    the repeats free, and a tick lost to a deploy does not lose the week.
    """
    conf = digest_settings(org_row)
    local = now.astimezone(_zone(org_row))
    return WEEKDAYS[local.weekday()] == conf['day'] and local.hour == conf['hour']


def _parse_ts(value: Any) -> Optional[datetime]:
    """A timestamptz from PostgREST as an aware datetime, or None."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _days_late(due_date: Optional[str], now: datetime) -> Optional[int]:
    due = _parse_ts(due_date)
    return max(0, (now - due).days) if due else None


# ── Guardians ────────────────────────────────────────────────────────────────

def _guardians(repo: ParentDigestRepository, student_ids: List[str]) -> Dict[str, List[str]]:
    """{student_id: [parent_user_id]} from both linkage mechanisms.

    Under 13 the guardian is `users.managed_by_parent_id`; 13 and over it is an
    approved `parent_student_links` row. A digest that knew only one of the two
    would silently skip half the school — the same trap
    NotificationService.get_parents_for_student documents.
    """
    out: Dict[str, List[str]] = {sid: [] for sid in student_ids}
    for student_id, parent_id in (repo.managing_parents(student_ids)
                                  + repo.approved_links(student_ids)):
        if student_id in out and parent_id not in out[student_id]:
            out[student_id].append(parent_id)
    return out


# ── The week ─────────────────────────────────────────────────────────────────

def _classify_evidence(url: Optional[str], text: Optional[str], counts: Dict[str, int]) -> None:
    """Count the OLD evidence shape: a URL and/or a note on the completion row."""
    if text and text.strip() and not text.startswith(_BLOCK_DOC_PREFIX):
        counts['reflections'] += 1
    if not url:
        return
    lowered = url.split('?')[0].lower()
    if lowered.endswith(_VIDEO_SUFFIXES):
        counts['videos'] += 1
    elif lowered.endswith(_IMAGE_SUFFIXES):
        counts['photos'] += 1
    elif '/storage/v1/object/' in lowered:
        counts['files'] += 1
    else:
        counts['links'] += 1


def _week_work(repo: ParentDigestRepository, student_ids: List[str],
               since: datetime) -> Dict[str, Dict[str, Any]]:
    """Per student: the tasks finished this week, with evidence counts."""
    from utils.pillar_utils import get_pillar_name

    # A student (or an observer acting for them) marked this private. It is not
    # ours to forward to a mailbox.
    completions = [c for c in repo.completions_since(student_ids, since.isoformat())
                   if not c.get('is_confidential')]

    task_ids = [c['task_id'] for c in completions if c.get('task_id')]
    tasks = repo.tasks_by_ids(task_ids)
    quests = repo.quest_titles([c['quest_id'] for c in completions if c.get('quest_id')])

    out: Dict[str, Dict[str, Any]] = {
        sid: {'tasks': [], 'xp': 0,
              'evidence': {'photos': 0, 'videos': 0, 'files': 0, 'links': 0, 'reflections': 0}}
        for sid in student_ids
    }
    for c in sorted(completions, key=lambda r: r.get('completed_at') or ''):
        bucket = out.get(c['user_id'])
        if bucket is None:
            continue
        task = tasks.get(c.get('task_id') or '') or {}
        bucket['tasks'].append({
            'title': task.get('title') or 'A task',
            'quest': quests.get(c.get('quest_id') or ''),
            'pillar': get_pillar_name(task['pillar']) if task.get('pillar') else None,
            'xp': task.get('xp_value') or 0,
            'completed_at': c.get('completed_at'),
        })
        bucket['xp'] += task.get('xp_value') or 0
        _classify_evidence(c.get('evidence_url'), c.get('evidence_text'), bucket['evidence'])

    _add_block_evidence(repo, out, task_ids)
    return out


def _add_block_evidence(repo: ParentDigestRepository, out: Dict[str, Dict[str, Any]],
                        task_ids: List[str]) -> None:
    """Count the CURRENT evidence shape: blocks in a multi-format document.

    The completion row for one of these carries no URL and a placeholder for a
    note, so the row alone says a student wrote something and attached nothing.
    Every completion at Gryffin in the week of 2026-09-08 was this shape, and 32
    of the blocks behind them were photos — the exact thing the email is trying
    to send a parent to the app to look at.
    """
    if not task_ids:
        return

    owner_by_doc = {d['id']: d['user_id'] for d in repo.evidence_documents(task_ids)
                    if not d.get('is_confidential')}
    if not owner_by_doc:
        return

    for block in repo.evidence_blocks(list(owner_by_doc.keys())):
        # A private block is hidden from the family view; it is not counted here
        # either, or the numbers would not match the page.
        if block.get('is_private'):
            continue
        owner = owner_by_doc.get(block.get('document_id') or '')
        bucket = out.get(owner) if owner else None
        if bucket is None:
            continue
        bucket['evidence'][_BLOCK_BUCKETS.get(block.get('block_type') or '', 'files')] += 1


def _week_moments(repo: ParentDigestRepository, student_ids: List[str],
                  since_date: date) -> Dict[str, List[str]]:
    """Learning moments logged this week, by student.

    Counted as activity on purpose (the owner's call, 2026-09-08): a moment a
    parent logged is the parent's own contribution to the record, and seeing it
    in the digest is what teaches the family that the app is where it goes.
    """
    out: Dict[str, List[str]] = {sid: [] for sid in student_ids}
    for row in repo.learning_events_since(student_ids, since_date.isoformat()):
        if row.get('is_confidential'):
            continue
        if row['user_id'] in out and row.get('title'):
            out[row['user_id']].append(row['title'])
    return out


# ── What is still open ───────────────────────────────────────────────────────

def _late_work(repo: ParentDigestRepository, enrollments: Dict[str, List[str]],
               class_names: Dict[str, str], now: datetime) -> Dict[str, List[Dict[str, Any]]]:
    """Per student: published class quests past their due date and not done.

    Batched across the whole org rather than per student (the shape
    routes/sis/class_quests._student_work uses one student at a time), because a
    school-wide sweep cannot afford a query per child per class.
    """
    class_ids = sorted({cid for ids in enrollments.values() for cid in ids})
    if not class_ids:
        return {}

    # Compared as datetimes, never as strings: PostgREST returns both "…Z" and
    # "…+00:00" shapes depending on the column, and lexicographic order puts
    # every "+00:00" timestamp before every "Z" one. That comparison silently
    # decides who is late.
    def _due_and_published(link):
        due = _parse_ts(link.get('due_date'))
        if not due or due >= now:
            return False
        published = _parse_ts(link.get('publish_at'))
        return published is None or published <= now

    links = [l for l in repo.dated_class_quests(class_ids) if _due_and_published(l)]
    if not links:
        return {}

    quest_ids = sorted({l['quest_id'] for l in links if l.get('quest_id')})
    student_ids = sorted(enrollments.keys())
    titles = {qid: (title or 'Untitled quest')
              for qid, title in repo.quest_titles(quest_ids).items()}

    user_quests = repo.user_quests(student_ids, quest_ids)
    uq_by_pair = {(uq['user_id'], uq['quest_id']): uq for uq in user_quests}

    tasks_by_uq: Dict[str, List[str]] = {}
    for row in repo.tasks_for_user_quests([uq['id'] for uq in user_quests]):
        tasks_by_uq.setdefault(row['user_quest_id'], []).append(row['id'])
    done_ids = repo.completed_task_ids([tid for ids in tasks_by_uq.values() for tid in ids])

    from utils.class_assignments import assigned_to

    out: Dict[str, List[Dict[str, Any]]] = {}
    for student_id, student_classes in enrollments.items():
        for link in links:
            if link['class_id'] not in student_classes:
                continue
            # A quest the teacher kept to other students is not late for this one.
            if not assigned_to(link, student_id):
                continue
            uq = uq_by_pair.get((student_id, link['quest_id']))
            own = tasks_by_uq.get(uq['id'], []) if uq else []
            if is_quest_done(uq, len([t for t in own if t in done_ids]), len(own)):
                continue
            out.setdefault(student_id, []).append({
                'title': titles.get(link['quest_id'], 'Untitled quest'),
                'quest_id': link['quest_id'],
                'class_name': class_names.get(link['class_id']),
                'due_date': link['due_date'],
                'days_late': _days_late(link['due_date'], now),
                'started': bool(uq),
            })
    for items in out.values():
        items.sort(key=lambda i: _parse_ts(i['due_date']) or now)
    return out


# ── The sweep ────────────────────────────────────────────────────────────────

def _display_name(row: Optional[Dict[str, Any]], fallback: str) -> str:
    if not row:
        return fallback
    first = (row.get('first_name') or '').strip()
    if first:
        return first
    full = (row.get('display_name') or '').strip()
    return full.split(' ')[0] if full else fallback


def build_org_digests(org_row: Dict[str, Any], now: datetime) -> List[Dict[str, Any]]:
    """Everything this org would send right now, one entry per parent.

    Separated from the sending so a dry run is the same code path as a real one.
    A digest you cannot inspect before it reaches 300 families is a digest
    nobody dares turn on.
    """
    repo = _repo()
    class_names = repo.classes_for_org(org_row['id'])
    if not class_names:
        return []

    enrollments = repo.active_enrollments(list(class_names.keys()))
    student_ids = sorted(enrollments.keys())
    if not student_ids:
        return []

    students = repo.users_by_ids(student_ids, 'id, first_name, last_name, display_name')
    guardians = _guardians(repo, student_ids)

    parent_ids = sorted({pid for ids in guardians.values() for pid in ids})
    if not parent_ids:
        return []
    parents = repo.users_by_ids(parent_ids, 'id, email, first_name, last_name, display_name')
    skip = repo.opted_out(parent_ids, NOTIFICATION_TYPE)

    since = now - timedelta(days=7)
    work = _week_work(repo, student_ids, since)
    moments = _week_moments(repo, student_ids, since.astimezone(_zone(org_row)).date())
    late = _late_work(repo, enrollments, class_names, now)

    by_parent: Dict[str, List[Dict[str, Any]]] = {}
    for student_id in student_ids:
        summary = work.get(student_id) or {'tasks': [], 'xp': 0, 'evidence': {}}
        child = {
            'student_id': student_id,
            'name': _display_name(students.get(student_id), 'Your child'),
            'tasks': summary['tasks'],
            'xp': summary['xp'],
            'evidence': summary['evidence'],
            'moments': moments.get(student_id) or [],
            'late': late.get(student_id) or [],
        }
        for parent_id in guardians.get(student_id, []):
            if parent_id in skip:
                continue
            parent = parents.get(parent_id)
            if not parent or not (parent.get('email') or '').strip():
                continue
            by_parent.setdefault(parent_id, []).append(child)

    digests = []
    for parent_id, children in by_parent.items():
        parent = parents[parent_id]
        children.sort(key=lambda c: c['name'])
        digests.append({
            'organization_id': org_row['id'],
            'organization_name': org_row.get('name') or 'your school',
            'parent_user_id': parent_id,
            'parent_email': parent['email'].strip(),
            'parent_name': _display_name(parent, 'there'),
            'children': children,
        })
    digests.sort(key=lambda d: d['parent_email'])
    return digests


def _digest_counts(digest: Dict[str, Any]) -> Dict[str, int]:
    children = digest['children']
    return {
        'children': len(children),
        'tasks': sum(len(c['tasks']) for c in children),
        'late': sum(len(c['late']) for c in children),
    }


def _claim(org_id: str, parent_user_id: str, week_date: date,
           digest: Dict[str, Any]) -> bool:
    """Take this week's slot for one parent, or report that another tick has it.

    The insert comes BEFORE the send, so a crash mid-send costs a family one
    digest rather than sending six. Losing one is recoverable; the school can
    see the row. Sending six is the thing that gets the domain marked as spam.
    """
    counts = _digest_counts(digest)
    return _repo().claim_week(org_id, parent_user_id, week_date.isoformat(),
                              counts['children'], counts['tasks'], counts['late'])


def _mark_failed(org_id: str, parent_user_id: str, week_date: date) -> None:
    _repo().mark_undelivered(org_id, parent_user_id, week_date.isoformat())


def send_one(digest: Dict[str, Any]) -> bool:
    """Send one parent's digest. Best effort; never raises into the sweep."""
    from services.email_service import EmailService
    from services import parent_digest_links
    from utils.access_logger import AccessLogger

    try:
        sent = EmailService().send_parent_weekly_digest(
            to_email=digest['parent_email'],
            parent_name=digest['parent_name'],
            org_name=digest['organization_name'],
            children=digest['children'],
            unsubscribe_url=parent_digest_links.unsubscribe_url(digest['parent_user_id']),
        )
    except Exception as e:  # noqa: BLE001 — one bad address must not stop the school
        logger.warning(f"digest to {digest['parent_user_id'][:8]} raised: {e}")
        return False

    if sent:
        # This email quotes an education record (what the child completed, what
        # is outstanding), disclosed to a guardian. FERPA wants that on the
        # record, and never at the cost of the send.
        for child in digest['children']:
            AccessLogger.log_student_data_access(
                student_id=child['student_id'],
                accessor_id=digest['parent_user_id'],
                data_type='activity',
                purpose='parent_request',
                fields=['completed_tasks', 'learning_events', 'late_class_quests'],
                endpoint='parent-weekly-digest',
            )
    return bool(sent)


def _sweep_org(org_row: Dict[str, Any], now: datetime, dry_run: bool) -> Dict[str, Any]:
    digests = build_org_digests(org_row, now)
    week_date = now.astimezone(_zone(org_row)).date()
    result: Dict[str, Any] = {'organization': org_row.get('name'), 'parents': len(digests),
                              'sent': 0, 'skipped': 0, 'failed': 0}
    if dry_run:
        result['preview'] = digests
        return result

    for digest in digests:
        if not _claim(org_row['id'], digest['parent_user_id'], week_date, digest):
            result['skipped'] += 1
            continue
        if send_one(digest):
            result['sent'] += 1
        else:
            _mark_failed(org_row['id'], digest['parent_user_id'], week_date)
            result['failed'] += 1
    return result


def run_sweep(now: Optional[datetime] = None, org_id: Optional[str] = None,
              force: bool = False, dry_run: bool = False) -> Dict[str, Any]:
    """Cron entrypoint. Sends each enabled org's digest inside its own window.

    `force` ignores the day/hour window (a superadmin sending this week's digest
    by hand after an outage). It does NOT ignore parent_digest_sends, so forcing
    twice still sends once.
    """
    now = now or datetime.now(timezone.utc)
    results = []
    for org in _repo().organizations(org_id):
        if not digest_settings(org)['enabled']:
            continue
        if not force and not in_send_window(org, now):
            continue
        try:
            results.append(_sweep_org(org, now, dry_run))
        except Exception as e:  # noqa: BLE001 — one school's data must not stop the rest
            logger.error(f"parent digest sweep failed for {org.get('name')}: {e}", exc_info=True)
            results.append({'organization': org.get('name'), 'error': str(e)})

    return {
        'orgs': len(results),
        'sent': sum(r.get('sent', 0) for r in results),
        'results': results,
    }
