"""Bloomy work becomes quest tasks: one task per student, per subject, per day.

Apogee Cache Valley's students do Math and Reading in Bloomy
(bloomylearning.com), which tracks the skills they master. The school wanted
that work in Optio without anybody retyping it (2026-09-29). The decisions,
from the owner on 2026-10-05:

  - One task per student per subject per Pacific day on which they mastered at
    least one skill: "Bloomy Math, Sep 30: 3 skills mastered", the skill list
    as its evidence. XP is 25 a skill, snapped to the task sizes, at most 100 --
    a student who masters eighteen easy skills in one sitting (it happens) gets
    a 100 XP day, not 450.
  - Tasks land in two quests per school, "Bloomy Math" and "Bloomy Reading",
    created the first time they are needed. Math is STEM and the Math subject;
    Reading is Communication and Language Arts. Credit still waits for a
    credit request, as every task's does.
  - Only students a coach has linked. Bloomy sends no roster id Optio knows,
    so the link screen suggests matches by name and a person confirms them; an
    automatic name match would one day put a child's work on another child.
  - The weekly check-in only shows the Bloomy numbers. It never ticks a goal.

The sync reads the seven finished Pacific days before today on every run (the
API serves no older day), so a missed night or a student linked late catches
up. external_learning_days is what makes a re-run write nothing: a day row is
written before its task, and removed again if the task could not be made, so
the next run retries it.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from repositories.external_learning_repository import ExternalLearningRepository
from services.bloomy_client import BloomyClient, BloomyError
from utils import org_secrets
from utils.logger import get_logger
from utils.task_xp import snap_to_task_size
from utils.timestamps import now_iso

logger = get_logger(__name__)

PLATFORM = 'bloomy'
MODULE_KEY = 'bloomy'
PACIFIC = ZoneInfo('America/Los_Angeles')
REPLAY_DAYS = 7
XP_PER_SKILL = 25
MAX_DAY_XP = 100
MAX_SKILLS_IN_EVIDENCE = 40
QUEST_TAG = 'bloomy_subject'  # quests.metadata key naming the school's Bloomy quest

SUBJECTS: Dict[str, Dict[str, Any]] = {
    'math': {
        'label': 'Math',
        'quest_title': 'Bloomy Math',
        'pillar': 'stem',
        'diploma_subjects': ['math'],
    },
    'reading': {
        'label': 'Reading',
        'quest_title': 'Bloomy Reading',
        'pillar': 'communication',
        'diploma_subjects': ['language_arts'],
    },
}


class BloomySetupError(ValueError):
    """Something the school can fix: no key, a refused key, a bad link."""


def pacific_today() -> datetime:
    return datetime.now(PACIFIC)


def replay_dates(today: Optional[datetime] = None) -> List[str]:
    """The finished Pacific days the API still serves, oldest first. Today is
    left out: a day still in progress would be written before it ended."""
    day = (today or pacific_today()).date()
    return [(day - timedelta(days=n)).isoformat() for n in range(REPLAY_DAYS, 0, -1)]


def day_xp(mastered: int) -> int:
    return snap_to_task_size(min(mastered * XP_PER_SKILL, MAX_DAY_XP), default=XP_PER_SKILL,
                             hi=MAX_DAY_XP)


def _fmt_day(iso: str) -> str:
    d = datetime.fromisoformat(iso)
    return f"{d.strftime('%b')} {d.day}"


def _norm_name(name: Optional[str]) -> str:
    return ' '.join((name or '').lower().split())


def client_for(org_id: str) -> BloomyClient:
    key = org_secrets.get_org_secret(org_id, org_secrets.BLOOMY_API_KEY)
    if not key:
        raise BloomySetupError('Bloomy is not connected for this school.')
    return BloomyClient(key)


# --- connection and links ---------------------------------------------------

def save_key(org_id: str, api_key: str, staff_id: str) -> int:
    """Check the key against Bloomy, then store it. Returns the roster size.
    A key Bloomy refuses is never stored."""
    api_key = (api_key or '').strip()
    if not api_key:
        org_secrets.set_org_secret(org_id, org_secrets.BLOOMY_API_KEY, None, staff_id)
        _PAGE_CACHE.pop(org_id, None)
        return 0
    try:
        roster = BloomyClient(api_key).students()
    except BloomyError as e:
        if e.status in (401, 403):
            raise BloomySetupError('Bloomy did not accept that key. Check that it was copied whole '
                                   'and has not been revoked.') from e
        raise BloomySetupError('Could not reach Bloomy to check the key. Try again shortly.') from e
    org_secrets.set_org_secret(org_id, org_secrets.BLOOMY_API_KEY, api_key, staff_id)
    _PAGE_CACHE.pop(org_id, None)
    return len(roster)


def _optio_students(org_id: str, repo: ExternalLearningRepository) -> List[Dict[str, Any]]:
    """The school's students for the link picker. Not sis_service.get_roster:
    that builds the whole People page (households, staff, enrollments) and
    took five of the page's seconds."""
    from utils import person_name
    return [{'id': r['id'], 'name': person_name.full_name(r, '')} for r in repo.org_students(org_id)]


RECENT_DAYS = 7
DETAIL_SKILLS = 25
DETAIL_ATTEMPTS = 25


def _subjects(r: Dict[str, Any]) -> Dict[str, Any]:
    """subject -> counts and per-domain counts, each domain with Bloomy's
    estimated grade for it. Placed skills are ones the placement test awarded,
    not ones the student earned in Bloomy."""
    levels = r.get('domain_grade_levels') or {}
    out: Dict[str, Any] = {}
    for subj in r.get('subjects') or []:
        out[subj.get('subject')] = {
            'mastered': int(subj.get('skills_mastered') or 0),
            'in_progress': int(subj.get('skills_in_progress') or 0),
            'placed': int(subj.get('skills_placed') or 0),
            'domains': [{
                'domain': d.get('domain'),
                'mastered': int(d.get('skills_mastered') or 0),
                'in_progress': int(d.get('skills_in_progress') or 0),
                'placed': int(d.get('skills_placed') or 0),
                'grade_level': levels.get(d.get('domain')),
            } for d in (subj.get('domains') or [])],
        }
    return out


# org_id -> (read at, roster, recent). Every Bloomy call takes about six
# seconds (measured 2026-10-05) and the page reloads after each link, so the
# reads are kept a few minutes. Per process; a stale minute shows yesterday's
# numbers, never another school's.
_PAGE_CACHE: Dict[str, Tuple[float, List[Dict[str, Any]], Dict[str, Dict[str, Any]]]] = {}
PAGE_CACHE_SECONDS = 300


def _page_reads(org_id: str, client: BloomyClient, refresh: bool = False
                ) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """The roster and the last seven days, all eight reads side by side."""
    import time
    from concurrent.futures import ThreadPoolExecutor
    cached = _PAGE_CACHE.get(org_id)
    if cached and not refresh and time.time() - cached[0] < PAGE_CACHE_SECONDS:
        return cached[1], cached[2]
    today = pacific_today().date()
    dates = [(today - timedelta(days=n)).isoformat() for n in range(RECENT_DAYS)]
    with ThreadPoolExecutor(max_workers=RECENT_DAYS + 1) as pool:
        roster_future = pool.submit(client.students)
        day_futures = [(d, pool.submit(client.student_progress, d)) for d in dates]
        roster = roster_future.result()
        days: List[Tuple[str, List[Dict[str, Any]]]] = []
        for d, f in day_futures:
            try:
                days.append((d, f.result()))
            except BloomyError as e:
                logger.warning(f'Bloomy day {d} read failed for org {org_id[:8]}: {e}')
    recent = _recent_activity(days)
    _PAGE_CACHE[org_id] = (time.time(), roster, recent)
    return roster, recent


def _recent_activity(days: List[Tuple[str, List[Dict[str, Any]]]]) -> Dict[str, Dict[str, Any]]:
    """Bloomy student_id -> the given Pacific days: skills mastered per
    subject, skills worked, days active, last active day."""
    out: Dict[str, Dict[str, Any]] = {}
    for activity_date, records in days:
        worked: Dict[str, set] = {}
        for r in records:
            sid, task_id = r.get('student_id'), r.get('task_id')
            if not sid or not task_id:
                continue
            a = out.setdefault(sid, {'mastered': {k: 0 for k in SUBJECTS}, 'worked': 0,
                                     'days': set(), 'last_active': None})
            key = f"{r.get('subject')}:{task_id}"
            if key in worked.setdefault(sid, set()):
                continue
            worked[sid].add(key)
            a['worked'] += 1
            a['days'].add(activity_date)
            if not a['last_active'] or activity_date > a['last_active']:
                a['last_active'] = activity_date
            if r.get('task_mastered_on_date') is True and r.get('subject') in SUBJECTS:
                a['mastered'][r['subject']] += 1
    for a in out.values():
        a['days'] = len(a['days'])
    return out


def overview(org_id: str, repo: Optional[ExternalLearningRepository] = None,
             refresh: bool = False) -> Dict[str, Any]:
    """The Bloomy page: Bloomy's roster with what Bloomy knows about each
    student (grades, hours, skills by subject and domain, the last seven
    days), each student's link and, when unlinked, a suggested match (exact
    full name, one candidate only), beside the school's Optio students."""
    repo = repo or ExternalLearningRepository()
    connected = org_secrets.has_org_secret(org_id, org_secrets.BLOOMY_API_KEY)
    optio = sorted(_optio_students(org_id, repo), key=lambda s: s['name'].lower())
    if not connected:
        return {'connected': False, 'students': [], 'optio_students': optio, 'last_sync_at': None}

    recent: Dict[str, Dict[str, Any]] = {}
    try:
        roster, recent = _page_reads(org_id, client_for(org_id), refresh=refresh)
        error = None
    except BloomyError as e:
        logger.warning(f'Bloomy roster read failed for org {org_id[:8]}: {e}')
        roster, error = [], ('Bloomy refused the saved key. Ask Bloomy for a new one.'
                             if e.status in (401, 403) else 'Could not reach Bloomy just now.')

    links = repo.links(org_id, PLATFORM)
    linked = {l['lms_user_id']: l['user_id'] for l in links}
    taken = set(linked.values())
    by_name: Dict[str, List[str]] = {}
    for s in optio:
        by_name.setdefault(_norm_name(s['name']), []).append(s['id'])

    students: List[Dict[str, Any]] = []
    for r in roster:
        sid = str(r.get('student_id') or '')
        user_id = linked.get(sid)
        suggestion = None
        if not user_id:
            matches = [m for m in by_name.get(_norm_name(r.get('student_name')), []) if m not in taken]
            suggestion = matches[0] if len(matches) == 1 else None
        subjects = _subjects(r)
        students.append({
            'bloomy_student_id': sid,
            'name': r.get('student_name'),
            'grade': r.get('enrolled_grade_level'),
            'estimated_grade': r.get('estimated_grade_level'),
            'learning_hours': r.get('learning_hours'),
            'skills_mastered': sum(v['mastered'] for v in subjects.values()),
            'subjects': subjects,
            'classrooms': sorted({c.get('classroom_name') for c in (r.get('classrooms') or [])
                                  if c.get('classroom_name')}),
            'recent': recent.get(sid) or {'mastered': {k: 0 for k in SUBJECTS}, 'worked': 0,
                                          'days': 0, 'last_active': None},
            'user_id': user_id,
            'suggested_user_id': suggestion,
        })
    students.sort(key=lambda s: str(s.get('name') or '').lower())
    last = max((l.get('last_sync_at') or '' for l in links), default='') or None
    return {'connected': True, 'error': error, 'students': students, 'optio_students': optio,
            'last_sync_at': last, 'recent_days': RECENT_DAYS}


def student_detail(org_id: str, bloomy_student_id: str) -> Dict[str, Any]:
    """One Bloomy student's skills and test attempts, newest first: what they
    earned recently, what they are working on, and their Climb and Summit
    results. Bloomy answers 404 for a student outside this school's key."""
    client = client_for(org_id)
    try:
        skills = client.skills(bloomy_student_id)
        attempts = client.assessment_attempts(bloomy_student_id)
    except BloomyError as e:
        if e.status == 404:
            raise BloomySetupError('Bloomy does not have that student at this school.') from e
        raise BloomySetupError('Could not reach Bloomy just now.') from e

    def skill_out(k: Dict[str, Any]) -> Dict[str, Any]:
        return {key: k.get(key) for key in (
            'task_id', 'task_title', 'subject', 'domain', 'grade', 'status', 'mastery_tier',
            'best_passing_summit_score_pct', 'mastered_at', 'updated_at')}

    earned = [k for k in skills if k.get('status') == 'completed' and k.get('mastered_at')]
    earned.sort(key=lambda k: str(k.get('mastered_at')), reverse=True)
    working = [k for k in skills if k.get('status') in ('in_progress', 'paused')]
    working.sort(key=lambda k: str(k.get('updated_at') or ''), reverse=True)
    attempts.sort(key=lambda a: str(a.get('last_activity_at') or a.get('started_at') or ''), reverse=True)
    return {
        'bloomy_student_id': bloomy_student_id,
        'counts': {
            'earned': len(earned),
            'in_progress': len(working),
            'placed': sum(1 for k in skills if k.get('status') == 'placed'),
            'attempts': len(attempts),
            'attempts_passed': sum(1 for a in attempts if a.get('passed') is True),
        },
        'recent_mastered': [skill_out(k) for k in earned[:DETAIL_SKILLS]],
        'in_progress': [skill_out(k) for k in working[:DETAIL_SKILLS]],
        'attempts': [{key: a.get(key) for key in (
            'task_id', 'task_title', 'subject', 'stage', 'mode', 'status', 'score_pct', 'passed',
            'started_at', 'completed_at', 'last_activity_at')} for a in attempts[:DETAIL_ATTEMPTS]],
    }


def set_link(org_id: str, bloomy_student_id: str, user_id: Optional[str],
             repo: Optional[ExternalLearningRepository] = None) -> None:
    """Link one Bloomy student to one Optio student, or unlink (user_id None).
    Each side has at most one link: a new link replaces both old ones."""
    from services import sis_service
    repo = repo or ExternalLearningRepository()
    bloomy_student_id = (bloomy_student_id or '').strip()
    if not bloomy_student_id:
        raise BloomySetupError('Which Bloomy student?')
    existing = repo.link_for_platform_user(PLATFORM, bloomy_student_id)
    if existing and existing.get('organization_id') != org_id:
        raise BloomySetupError('That Bloomy student is linked at another school.')
    if user_id:
        student = repo.student_row(user_id)
        if not student or student.get('organization_id') != org_id \
                or not sis_service.is_student(student):
            raise BloomySetupError('That student is not at this school.')
    repo.delete_links(org_id, PLATFORM, platform_user_id=bloomy_student_id)
    if user_id:
        repo.delete_links(org_id, PLATFORM, user_id=user_id)
        repo.insert_link(org_id, PLATFORM, user_id, bloomy_student_id)


# --- the sync -----------------------------------------------------------------

def _group_day(records: List[Dict[str, Any]], linked: Dict[str, str]
               ) -> Dict[Tuple[str, str], Dict[str, Any]]:
    """(user_id, subject) -> {worked, mastered: [{task_id, title}]} for one day.

    A record is one skill worked on; the same skill can repeat across a
    student's classrooms, so skills are counted by task_id. Coverage records
    (task_id null) say "no activity" and add nothing.
    """
    out: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for r in records:
        user_id = linked.get(str(r.get('student_id') or ''))
        subject = r.get('subject')
        task_id = r.get('task_id')
        if not user_id or subject not in SUBJECTS or not task_id:
            continue
        g = out.setdefault((user_id, subject), {'worked': {}, 'mastered': {}})
        g['worked'][task_id] = r.get('task_title') or task_id
        if r.get('task_mastered_on_date') is True:
            g['mastered'][task_id] = r.get('task_title') or task_id
    return out


def _ensure_quest(repo: ExternalLearningRepository, org_id: str, subject: str) -> str:
    """The school's Bloomy quest for a subject, created on first use."""
    existing = repo.quest_tagged(org_id, QUEST_TAG, subject)
    if existing:
        return existing
    from services.sis_quest_authoring import create_org_quest
    spec = SUBJECTS[subject]
    created = create_org_quest(
        repo.client, org_id=org_id, user_id=None, title=spec['quest_title'],
        description=(f"{spec['label']} skills mastered in Bloomy. A task appears here on its own "
                     f"for each day you master a skill there."),
        extra_fields={'allow_custom_tasks': False},
    )
    quest_id = created['quest_id']
    repo.tag_quest(quest_id, QUEST_TAG, subject)
    return quest_id


def _ensure_enrollment(repo: ExternalLearningRepository, user_id: str, quest_id: str) -> str:
    existing = repo.enrollment_id(user_id, quest_id)
    if existing:
        return existing
    from services.class_quest_enrollment import enroll_students_in_quests
    enroll_students_in_quests(repo.client, [user_id], [quest_id])
    enrolled = repo.enrollment_id(user_id, quest_id)
    if not enrolled:
        raise RuntimeError('Could not enroll the student in the Bloomy quest')
    return enrolled


def _skill_list(mastered: Dict[str, str], details: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The day's mastered skills with what Bloomy's skill record adds: grade,
    area, tier (Proficient or Mastered) and the best passing Summit score.
    A skill with no record keeps its title and code only."""
    out = []
    for code, title in mastered.items():
        d = details.get(code) or {}
        out.append({
            'code': code,
            'title': d.get('task_title') or title,
            'grade': d.get('grade'),
            'domain': d.get('domain'),
            'tier': d.get('mastery_tier'),
            'score': d.get('best_passing_summit_score_pct'),
        })
    out.sort(key=lambda k: str(k['title']).lower())
    return out


def _evidence(subject: str, activity_date: str, skills: List[Dict[str, Any]]) -> str:
    from services.bloomy_card import meta_line
    lines = [f"Skills mastered in Bloomy {SUBJECTS[subject]['label']} on {_fmt_day(activity_date)}:"]
    for k in skills[:MAX_SKILLS_IN_EVIDENCE]:
        meta = meta_line(k)
        lines.append(f"- {k['title']} ({k['code']})" + (f': {meta}' if meta else ''))
    if len(skills) > MAX_SKILLS_IN_EVIDENCE:
        lines.append(f'- and {len(skills) - MAX_SKILLS_IN_EVIDENCE} more')
    return '\n'.join(lines)


def _attach_card(repo: ExternalLearningRepository, user_id: str, task_id: str, quest_id: str,
                 subject: str, activity_date: str, skills: List[Dict[str, Any]], evidence: str) -> None:
    """The task's evidence document: the skill list as text, then the day's
    card as an image. Best effort: a task with text evidence only is still a
    whole task, so a failed picture is logged, not raised."""
    try:
        from io import BytesIO

        from werkzeug.datastructures import FileStorage

        from repositories.evidence_document_repository import EvidenceDocumentRepository
        from services.bloomy_card import render_day_card
        from services.media_upload_service import MediaUploadService

        docs = EvidenceDocumentRepository(client=repo.client)
        doc = docs.create_document(user_id, task_id, quest_id, status='completed')
        docs.create_block(doc['id'], 'text', {'text': evidence}, 0)

        day = datetime.fromisoformat(activity_date)
        png = render_day_card(SUBJECTS[subject]['label'], _fmt_day(activity_date), skills, year=day.year)
        filename = f'bloomy-{subject}-{activity_date}.png'
        upload = MediaUploadService(repo.client).upload_evidence_file(
            FileStorage(stream=BytesIO(png), filename=filename, content_type='image/png'),
            user_id=user_id, context_type='task_evidence', context_id=task_id, block_type='image')
        if not upload.success:
            logger.warning(f'Bloomy card upload refused for task {task_id}: {upload.error_code}')
            return
        docs.create_block(doc['id'], 'image', {'url': upload.file_url, 'filename': filename}, 1)
    except Exception as e:  # noqa: BLE001 -- the task and its XP already stand
        logger.warning(f'Bloomy card for task {task_id} not attached: {e}')


def _make_task(repo: ExternalLearningRepository, org_id: str, user_id: str, subject: str, activity_date: str,
               skills: List[Dict[str, Any]], quest_ids: Dict[str, str]) -> str:
    """Create the day's task and complete it. Returns the user_quest_task id."""
    from repositories.task_repository import TaskCompletionRepository
    from services.sis_quest_authoring import clean_subjects
    from services.xp_service import XPService

    spec = SUBJECTS[subject]
    if subject not in quest_ids:
        quest_ids[subject] = _ensure_quest(repo, org_id, subject)
    quest_id = quest_ids[subject]
    user_quest_id = _ensure_enrollment(repo, user_id, quest_id)

    n = len(skills)
    xp = day_xp(n)
    subjects, distribution = clean_subjects(spec['diploma_subjects'], None, xp, spec['pillar'])
    evidence = _evidence(subject, activity_date, skills)
    task = repo.insert_task({
        'user_id': user_id,
        'quest_id': quest_id,
        'user_quest_id': user_quest_id,
        'title': f"Bloomy {spec['label']}, {_fmt_day(activity_date)}: "
                 f"{n} skill{'' if n == 1 else 's'} mastered",
        'description': evidence,
        'pillar': spec['pillar'],
        'xp_value': xp,
        # Oldest day first, so the quest reads as a log.
        'order_index': datetime.fromisoformat(activity_date).toordinal(),
        'is_required': False,
        'is_manual': False,
        'approval_status': 'approved',
        'diploma_subjects': subjects,
        'subject_xp_distribution': distribution,
    })
    task_id = task['id']

    TaskCompletionRepository(client=repo.client).create_completion({
        'user_id': user_id,
        'quest_id': quest_id,
        'task_id': task_id,
        'user_quest_task_id': task_id,
        'evidence_text': evidence,
        'evidence_url': None,
        'is_confidential': False,
        'completed_by_user_id': None,
        'diploma_status': 'none',
        'revision_number': 1,
    })
    if not XPService().award_xp(user_id, spec['pillar'], xp, f'task_completion:{task_id}'):
        logger.error(f'Bloomy task {task_id} completed but XP award failed')
        try:
            repo.record_xp_failure({
                'user_id': user_id, 'task_id': task_id, 'pillar': spec['pillar'],
                'xp_amount': xp, 'reason': 'Bloomy sync: award_xp returned False',
            })
        except Exception as e:  # noqa: BLE001
            logger.error(f'Could not record the failed Bloomy XP award: {e}')
    _attach_card(repo, user_id, task_id, quest_id, subject, activity_date, skills, evidence)
    return task_id


def sync_org(org_id: str, *, dates: Optional[List[str]] = None,
             client: Optional[BloomyClient] = None,
             repo: Optional[ExternalLearningRepository] = None) -> Dict[str, Any]:
    """Read the replay window for one school and write what is new.

    Returns counts for the log and the "Sync now" button. Raises
    BloomySetupError when the school has no key; a Bloomy failure part-way
    keeps what was written and reports the error.
    """
    repo = repo or ExternalLearningRepository()
    links = [l for l in repo.links(org_id, PLATFORM) if l.get('sync_enabled') is not False]
    summary: Dict[str, Any] = {'students': len(links), 'days_read': 0, 'days_new': 0, 'tasks': 0, 'error': None}
    if not links:
        return summary
    client = client or client_for(org_id)
    linked = {l['lms_user_id']: l['user_id'] for l in links}
    bloomy_id = {user: sid for sid, user in linked.items()}
    dates = dates or replay_dates()
    yesterday = replay_dates()[-1]
    details_cache: Dict[str, Dict[str, Dict[str, Any]]] = {}

    def details(user_id: str) -> Dict[str, Dict[str, Any]]:
        """code -> Bloomy's skill record, read once per student per run and
        only for students with something mastered. A failed read costs the
        tier and score, not the task."""
        if user_id not in details_cache:
            try:
                details_cache[user_id] = {str(k['task_id']): k for k in client.skills(bloomy_id[user_id])
                                          if k.get('task_id')}
            except BloomyError as e:
                logger.warning(f'Bloomy skill details failed for one student: {e}')
                details_cache[user_id] = {}
        return details_cache[user_id]

    try:
        hours = {r.get('student_id'): r.get('learning_hours') for r in client.students()}
        hours_by_user = {linked[sid]: h for sid, h in hours.items() if sid in linked}
        existing = {(r['user_id'], r['subject'], r['activity_date'])
                    for r in repo.days(org_id, PLATFORM, linked.values(), dates[0], dates[-1])}
        quest_ids: Dict[str, str] = {}
        for activity_date in dates:
            groups = _group_day(client.student_progress(activity_date), linked)
            summary['days_read'] += 1
            for (user_id, subject), g in groups.items():
                if (user_id, subject, activity_date) in existing:
                    continue
                day = repo.insert_day({
                    'organization_id': org_id,
                    'user_id': user_id,
                    'platform': PLATFORM,
                    'subject': subject,
                    'activity_date': activity_date,
                    'skills_worked': len(g['worked']),
                    'skills_mastered': len(g['mastered']),
                    'skills': [{'task_id': k, 'title': v, 'mastered': k in g['mastered']}
                               for k, v in sorted(g['worked'].items())],
                    # Lifetime hours are "now"; only yesterday's row may claim them.
                    'learning_hours_total': hours_by_user.get(user_id)
                    if activity_date == yesterday else None,
                    'created_at': now_iso(),
                })
                if not day:
                    continue
                summary['days_new'] += 1
                if not g['mastered']:
                    continue
                try:
                    task_id = _make_task(repo, org_id, user_id, subject, activity_date,
                                         _skill_list(g['mastered'], details(user_id)), quest_ids)
                except Exception:
                    # Forget the day so the next run tries it again.
                    repo.delete_day(day['id'])
                    raise
                repo.attach_task(day['id'], task_id)
                summary['tasks'] += 1
        repo.mark_synced(org_id, PLATFORM)
    except BloomyError as e:
        logger.warning(f'Bloomy sync for org {org_id[:8]} stopped: {e}')
        summary['error'] = ('Bloomy refused the saved key.' if e.status in (401, 403)
                            else 'Could not reach Bloomy.')
        repo.mark_synced(org_id, PLATFORM, status='error')
    return summary


def run_due() -> Dict[str, Any]:
    """The nightly sweep: every school with the Bloomy block on and a key."""
    from modules.enabled import module_enabled
    repo = ExternalLearningRepository()
    out: Dict[str, Any] = {'orgs': 0, 'tasks': 0, 'errors': 0}
    for org_id in repo.orgs_with_module(MODULE_KEY):
        if not module_enabled(org_id, MODULE_KEY) \
                or not org_secrets.has_org_secret(org_id, org_secrets.BLOOMY_API_KEY):
            continue
        try:
            result = sync_org(org_id, repo=repo)
        except Exception as e:  # noqa: BLE001 -- one school's failure must not stop the next
            logger.error(f'Bloomy sync failed for org {org_id[:8]}: {e}')
            out['errors'] += 1
            continue
        out['orgs'] += 1
        out['tasks'] += result['tasks']
        out['errors'] += 1 if result['error'] else 0
    return out


# --- the weekly check-in ------------------------------------------------------

def week_summaries(org_id: str, user_ids: List[str], week_start: str,
                   repo: Optional[ExternalLearningRepository] = None) -> Dict[str, Dict[str, Any]]:
    """user_id -> what Bloomy recorded Monday to Sunday of one week: skills
    mastered per subject, days active and, when two snapshots allow it, hours.
    Only linked students with something recorded appear."""
    repo = repo or ExternalLearningRepository()
    start = datetime.fromisoformat(week_start).date()
    end = (start + timedelta(days=6)).isoformat()
    rows = repo.days(org_id, PLATFORM, user_ids, start.isoformat(), end)
    if not rows:
        return {}
    out: Dict[str, Any] = {}
    latest_hours: Dict[str, Tuple[str, float]] = {}
    for r in rows:
        s = out.setdefault(r['user_id'], {'mastered': {k: 0 for k in SUBJECTS}, 'days': set(),
                                          'hours': None})
        s['mastered'][r['subject']] = s['mastered'].get(r['subject'], 0) + (r.get('skills_mastered') or 0)
        if r.get('skills_worked'):
            s['days'].add(r['activity_date'])
        h = r.get('learning_hours_total')
        if h is not None:
            prev = latest_hours.get(r['user_id'])
            if not prev or r['activity_date'] > prev[0]:
                latest_hours[r['user_id']] = (r['activity_date'], float(h))
    before = repo.latest_hours_before(org_id, PLATFORM, list(latest_hours), start.isoformat())
    for uid, s in out.items():
        if uid in latest_hours and uid in before:
            s['hours'] = round(max(latest_hours[uid][1] - before[uid], 0.0), 1)
        s['days'] = len(s['days'])
    return out
