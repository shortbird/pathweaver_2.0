"""A partner's credit class: giving a buyer their own copy, and counting them.

A partner (Raleigh Williams, 2026-09-30) sells a course; Optio turns it into a
credit class (quest_type='class', one transcript_subject, a 1,000 XP goal). The
partner keeps one TEMPLATE class in its org and edits it from /organization ->
Quests. Every buyer gets their own copy, because a class's review status lives
on the quests row: students sharing one class would share one review result.

Two doors reach provision():

  - the public link /offer/<slug>, where a signed-in student claims the class
    for themselves (source 'link')
  - the partner's "Add a student" form, which finds or creates the student's
    login first (source 'partner')

Rules both doors share, so neither can skip one:

  - students only, 13 and older (CLASS_MIN_AGE, shared/data/credits.json).
    The age is the account's date of birth; a claim may supply one when the
    account has none, and it is saved.
  - one copy per student per offering. A second claim returns the first copy.
  - the copy is frozen at the moment it is made. A later edit to the template
    reaches new students only: a student's work is judged against the task
    list they started with.
  - each task's Definition of Done comes from its description. The template's
    task editor rewrites rows on save, so the checklist is kept where the
    partner can see and edit it -- under a "Definition of done:" line at the
    end of the description -- and is lifted into user_quest_tasks.
    success_criteria here, where the credit review reads it.

Billing: Optio invoices the partner monthly_fee_cents for every student whose
copy was open at any point in the month (billable_students). A student stops
counting when the partner removes them (ended_at) or when their class has been
awarded credit.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from generated.credits import CLASS_MIN_AGE
from repositories.partner_enrollment_repository import PartnerEnrollmentRepository
from repositories.partner_offering_repository import PartnerOfferingRepository
from services import partner_accounts
from services.sis_eligibility import age_on
from utils.logger import get_logger
from utils.personalization_helpers import sanitize_success_criteria
from utils.school_subjects import get_display_name
from utils.timestamps import now_iso

logger = get_logger(__name__)

DOD_HEADING = 'definition of done:'
CREDIT_AWARDED = 'credit_awarded'
SOURCES = ('link', 'partner')


class OfferingError(Exception):
    """A refusal the route returns as is. `code` lets a page react to it."""

    def __init__(self, message, status=400, code=None, **extra):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.extra = extra

    def payload(self):
        body = {'error': self.message}
        if self.code:
            body['code'] = self.code
        body.update(self.extra)
        return body


# ── pure rules ────────────────────────────────────────────────────────────────

def split_definition_of_done(description: Optional[str]) -> Tuple[str, List[str]]:
    """(description without the checklist, checklist items).

    The checklist is every non-blank line after a line reading "Definition of
    done:" (any case), with a leading "-", "*" or bullet stripped. No such line
    means no checklist, and the description comes back untouched.
    """
    text = description or ''
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if line.strip().lower() == DOD_HEADING:
            body = '\n'.join(lines[:i]).rstrip()
            items = []
            for raw in lines[i + 1:]:
                item = raw.strip()
                if item[:1] in ('-', '*', '•'):
                    item = item[1:].strip()
                if item:
                    items.append(item)
            return body, sanitize_success_criteria(items)
    return text.strip(), []


def parse_dob(value: Any) -> Optional[date]:
    """A YYYY-MM-DD birthday, or None. Refuses the future."""
    if not value:
        return None
    try:
        dob = datetime.strptime(str(value)[:10], '%Y-%m-%d').date()
    except ValueError:
        raise OfferingError('Enter the date of birth as YYYY-MM-DD.') from None
    if dob > date.today():
        raise OfferingError('The date of birth cannot be in the future.')
    return dob


def check_age(dob: Optional[date], today: Optional[date] = None) -> date:
    """The birthday back, once it is known to be old enough."""
    if dob is None:
        raise OfferingError('We need the student\'s date of birth before adding the class.',
                            code='dob_required')
    age = age_on(dob, today)
    if age is None or age < CLASS_MIN_AGE:
        raise OfferingError(f'Credit classes are for students {CLASS_MIN_AGE} and older.',
                            status=403, code='under_age')
    return dob


def month_bounds(month: Optional[str]) -> Tuple[datetime, datetime]:
    """[first instant, first instant of next month) in UTC for 'YYYY-MM'
    (default: this month)."""
    if month:
        try:
            first = datetime.strptime(month, '%Y-%m').replace(tzinfo=timezone.utc)
        except ValueError:
            raise OfferingError('Month must be YYYY-MM.') from None
    else:
        now = datetime.now(timezone.utc)
        first = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    nxt = datetime(first.year + (first.month == 12), first.month % 12 + 1, 1, tzinfo=timezone.utc)
    return first, nxt


def _ts(value) -> Optional[datetime]:
    if not value:
        return None
    return datetime.fromisoformat(str(value).replace('Z', '+00:00'))


def is_billable(enrollment: Dict[str, Any], class_state: Optional[Dict[str, Any]],
                start: datetime, end: datetime) -> bool:
    """Was this student's copy open at some point in [start, end)?

    Open means: joined before the month ended, not removed before it began,
    and the class not yet awarded credit. An awarded class stops counting from
    the month after it is awarded; without the award date on the row, an
    awarded class simply does not count.
    """
    joined = _ts(enrollment.get('created_at'))
    ended = _ts(enrollment.get('ended_at'))
    if joined and joined >= end:
        return False
    if ended and ended < start:
        return False
    if (class_state or {}).get('class_review_status') == CREDIT_AWARDED:
        return False
    return True


# ── provisioning ──────────────────────────────────────────────────────────────

def _repo(admin) -> PartnerOfferingRepository:
    return PartnerOfferingRepository(client=admin)


def _require(offering: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not offering or not offering.get('is_active'):
        raise OfferingError('This class is not available.', status=404, code='not_found')
    return offering


def _active_offering(repo, offering: Optional[Dict[str, Any]]):
    offering = _require(offering)
    template = repo.template(offering['template_quest_id'])
    if not template or template.get('quest_type') != 'class' or not template.get('transcript_subject'):
        logger.error(f"Offering {offering['id']} points at a template that is not a credit class")
        raise OfferingError('This class is not available.', status=404, code='not_found')
    return template


def _template_tasks(admin, template_quest_id: str) -> List[Dict[str, Any]]:
    from utils.template_tasks import load_template_tasks
    tasks = []
    for t in load_template_tasks(template_quest_id):
        body, criteria = split_definition_of_done(t.get('description'))
        tasks.append({**t, 'description': body, 'success_criteria': criteria})
    return tasks


def _copy_class(admin, template: Dict[str, Any], user_id: str, offering_id: str,
                enrolled_by: Optional[str]) -> str:
    """Create the student's own class quest, enroll them, copy the tasks.
    Returns the new quest id. Cleans up after itself on failure."""
    from utils.template_tasks import copy_template_tasks_to_enrollment

    tasks = _template_tasks(admin, template['id'])
    if not tasks:
        raise OfferingError('This class has no tasks yet.', status=409, code='no_tasks')

    metadata = dict(template.get('metadata') or {})
    metadata.pop('draft', None)
    metadata['partner_offering_id'] = offering_id
    metadata['template_quest_id'] = template['id']
    repo = _repo(admin)
    quest = repo.insert_quest({
        'title': template.get('title'),
        'big_idea': template.get('big_idea') or template.get('description'),
        'description': template.get('description'),
        'is_v3': True,
        'quest_type': 'class',
        'transcript_subject': template['transcript_subject'],
        'header_image_url': template.get('header_image_url'),
        'image_url': template.get('image_url'),
        'metadata': metadata,
        # The student's own class, like any Custom Class they start: private,
        # in no org, created by them. The partner reaches it through
        # partner_offering_enrollments, not through ownership.
        'is_active': True,
        'is_public': False,
        'organization_id': None,
        'created_by': user_id,
        'created_at': now_iso(),
    })
    quest_id = quest['id']
    try:
        now = now_iso()
        user_quest = repo.insert_user_quest({
            'user_id': user_id,
            'quest_id': quest_id,
            'started_at': now,
            'is_active': True,
            'status': 'picked_up',
            'times_picked_up': 1,
            'last_picked_up_at': now,
            'personalization_completed': True,
            'enrolled_by_user_id': enrolled_by or user_id,
        })
        copied = copy_template_tasks_to_enrollment(admin, quest_id, user_id, user_quest['id'],
                                                   template_tasks=tasks)
        if copied != len(tasks):
            raise RuntimeError(f'copied {copied} of {len(tasks)} tasks')
    except Exception:
        # A class with no tasks would sit on the student's dashboard looking
        # finished. Remove it (user_quests and tasks cascade) and let the
        # caller retry.
        try:
            repo.delete_quest(quest_id)
        except Exception as cleanup_err:  # noqa: BLE001
            logger.error(f'Could not remove half-made class {quest_id}: {cleanup_err}')
        raise
    return quest_id


def provision(admin, offering: Dict[str, Any], user_id: str, *, source: str,
              enrolled_by: Optional[str] = None, dob_value: Any = None) -> Dict[str, Any]:
    """Give one student their own copy of the offering's class.

    Idempotent: a student who already has a copy gets it back with
    created=False. A student the partner removed gets their old copy back,
    reopened, if it still exists. Raises OfferingError.
    """
    if source not in SOURCES:
        raise ValueError(f'unknown source {source!r}')
    repo = _repo(admin)
    template = _active_offering(repo, offering)

    student = repo.user(user_id)
    if not student:
        raise OfferingError('Account not found.', status=404)
    if partner_accounts.effective_role(student) != 'student':
        raise OfferingError('Classes go on a student account. Sign in with the student\'s own login.',
                            status=403, code='not_a_student')

    on_file = parse_dob(student.get('date_of_birth'))
    if on_file is None and dob_value:
        repo.set_date_of_birth(user_id, check_age(parse_dob(dob_value)).isoformat())
    else:
        check_age(on_file)

    existing = repo.enrollment(offering['id'], user_id)
    if existing and existing.get('class_quest_id'):
        if existing.get('ended_at'):
            repo.update_enrollment(existing['id'], {'ended_at': None})
        return {'enrollment_id': existing['id'], 'quest_id': existing['class_quest_id'], 'created': False}

    # Claim the (offering, student) pair first: the unique constraint makes two
    # clicks, or the link and the partner form at once, create one copy.
    if existing:
        claim = existing
    else:
        try:
            claim = repo.insert_enrollment({'offering_id': offering['id'], 'user_id': user_id,
                                            'source': source, 'enrolled_by': enrolled_by})
        except Exception:
            again = repo.enrollment(offering['id'], user_id)
            if again and again.get('class_quest_id'):
                return {'enrollment_id': again['id'], 'quest_id': again['class_quest_id'], 'created': False}
            raise
    try:
        quest_id = _copy_class(admin, template, user_id, offering['id'], enrolled_by)
    except Exception:
        if not existing:
            repo.delete_enrollment(claim['id'])
        raise
    repo.update_enrollment(claim['id'], {'class_quest_id': quest_id, 'ended_at': None})
    logger.info(f"Partner offering {offering['slug']}: class {quest_id[:8]} for {user_id[:8]} ({source})")
    return {'enrollment_id': claim['id'], 'quest_id': quest_id, 'created': True}


# ── the public page ───────────────────────────────────────────────────────────

def public_view(admin, slug: str) -> Dict[str, Any]:
    """What /offer/<slug> shows before anyone signs in."""
    repo = _repo(admin)
    offering = _require(repo.by_slug((slug or '').strip().lower()))
    template = _active_offering(repo, offering)
    body, _ = split_definition_of_done(template.get('description'))
    return {
        'slug': offering['slug'],
        'title': template.get('title'),
        'description': body,
        'image_url': template.get('header_image_url') or template.get('image_url'),
        'subject': template['transcript_subject'],
        'subject_name': get_display_name(template['transcript_subject']),
        'partner_name': repo.org_name(offering['organization_id']),
        'min_age': CLASS_MIN_AGE,
    }


def claim_by_slug(admin, slug: str, user_id: str, dob_value: Any = None) -> Dict[str, Any]:
    repo = _repo(admin)
    offering = _require(repo.by_slug((slug or '').strip().lower()))
    return provision(admin, offering, user_id, source='link', dob_value=dob_value)


# ── the partner's side ────────────────────────────────────────────────────────

def offering_for_partner(admin, offering_id: str, org_id: Optional[str]) -> Dict[str, Any]:
    """The offering, if it belongs to `org_id` (None = superadmin, any org)."""
    offering = _repo(admin).by_id(offering_id)
    if not offering or (org_id and offering['organization_id'] != org_id):
        raise OfferingError('Class not found.', status=404)
    return offering


def dashboard(admin, org_id: str, link_base: str) -> List[Dict[str, Any]]:
    """Each offering with its link, its students and their progress."""
    repo = _repo(admin)
    offerings = repo.for_org(org_id)
    if not offerings:
        return []
    templates = repo.templates([o['template_quest_id'] for o in offerings])
    enrollments = repo.enrollments([o['id'] for o in offerings])
    users = repo.users(sorted({e['user_id'] for e in enrollments}))
    quest_ids = [e['class_quest_id'] for e in enrollments if e.get('class_quest_id')]
    states = repo.class_states(quest_ids)
    xp = repo.completed_xp(quest_ids)

    out = []
    for o in offerings:
        template = templates.get(o['template_quest_id']) or {}
        students = []
        for e in enrollments:
            if e['offering_id'] != o['id']:
                continue
            u = users.get(e['user_id']) or {}
            qid = e.get('class_quest_id')
            students.append({
                'enrollment_id': e['id'],
                'user_id': e['user_id'],
                'name': partner_accounts.display_name(u) if u else 'Unknown student',
                'email': u.get('email'),
                'joined_at': e.get('created_at'),
                'source': e.get('source'),
                'removed_at': e.get('ended_at'),
                'xp': xp.get(qid, 0) if qid else 0,
                'review_status': (states.get(qid) or {}).get('class_review_status') if qid else None,
            })
        students.sort(key=lambda s: s['joined_at'] or '', reverse=True)
        out.append({
            'id': o['id'],
            'slug': o['slug'],
            'link': f"{link_base.rstrip('/')}/offer/{o['slug']}",
            'title': template.get('title'),
            'template_quest_id': o['template_quest_id'],
            'is_active': o['is_active'],
            'subject_name': get_display_name(template.get('transcript_subject') or ''),
            'target_xp': 1000,
            'students': students,
        })
    return out


def add_student(admin, offering: Dict[str, Any], *, actor_id: str, first_name: str, last_name: str,
                email: str, dob_value: Any = None, student_id: Optional[str] = None,
                frontend_url: str) -> Dict[str, Any]:
    """The partner's "Add a student" form.

    New address: a platform student account is created and emailed a
    set-your-password link. An address that already logs in: the class goes on
    the student behind it -- the account itself, or one of a parent's children,
    chosen by the partner (OnFire's rule; partner_accounts.students_behind_email)
    -- and nothing on that account changes except its date of birth when it had
    none. Raises OfferingError or partner_accounts.PartnerAccountError.
    """
    first_name, last_name = (first_name or '').strip(), (last_name or '').strip()
    email = (email or '').strip().lower()
    if not first_name or not last_name:
        raise OfferingError('First and last name are required.')
    if '@' not in email or '.' not in email.split('@')[-1]:
        raise OfferingError('A valid email is required.')
    template = _active_offering(_repo(admin), offering)

    lookup = PartnerEnrollmentRepository(client=admin)
    account = lookup.account_by_email(email)
    if account:
        candidates = partner_accounts.students_behind_email(lookup, account)
        if not candidates:
            raise OfferingError(
                f'{email} already signs in to Optio, but that account is not a student and has no '
                f'student on it. Add the student under their own email address.',
                status=409, code='existing_account_no_student')
        if len(candidates) == 1 and candidates[0]['relationship'] == 'self':
            chosen = candidates[0]
        else:
            if not student_id:
                raise OfferingError(f'{email} already has an Optio account. Choose who the class is for.',
                                    status=409, code='existing_account', students=candidates)
            chosen = next((c for c in candidates if c['id'] == student_id), None)
            if not chosen:
                raise OfferingError(f'That student is no longer on the Optio account for {email}.',
                                    status=409, code='student_not_on_account', students=candidates)
        result = provision(admin, offering, chosen['id'], source='partner', enrolled_by=actor_id,
                           dob_value=dob_value)
        if result['created']:
            _send_added_email(admin, email, chosen['name'].split()[0] if chosen.get('name') else first_name,
                              template, offering, frontend_url)
        return {**result, 'is_new_account': False, 'student': chosen}

    # A new login. Check the age before an account exists, so an under-age
    # student never gets one from this form.
    dob = check_age(parse_dob(dob_value))
    user = partner_accounts.create_invited_student(
        admin, email=email, first_name=first_name, last_name=last_name,
        dob_iso=dob.isoformat(), created_via='partner_class_registration')
    try:
        result = provision(admin, offering, user['id'], source='partner', enrolled_by=actor_id)
    except Exception:
        logger.error(f"Created {user['id']} for {email} but could not add the class", exc_info=True)
        raise
    email_sent = _send_welcome_email(admin, user, template, offering, frontend_url)
    return {**result, 'is_new_account': True, 'email_sent': email_sent,
            'student': {'id': user['id'], 'name': partner_accounts.display_name(user), 'relationship': 'self'}}


def remove_student(admin, offering: Dict[str, Any], enrollment_id: str) -> None:
    """Stop billing a student. Their class and their work stay theirs."""
    repo = _repo(admin)
    enrollment = repo.enrollment_by_id(enrollment_id)
    if not enrollment or enrollment['offering_id'] != offering['id']:
        raise OfferingError('Student not found on this class.', status=404)
    if not enrollment.get('ended_at'):
        repo.update_enrollment(enrollment_id, {'ended_at': now_iso()})


def _send_welcome_email(admin, user, template, offering, frontend_url) -> bool:
    from urllib.parse import quote

    from services.email_service import email_service
    from utils.invite_tokens import INVITE_EXPIRY_DAYS, mint_invite_token
    try:
        token = mint_invite_token(user['id'], admin=admin)
        if not token:
            logger.error(f"Could not mint invite token for {user['id']}; welcome email skipped")
            return False
        base = frontend_url.rstrip('/')
        return bool(email_service.send_templated_email(
            to_email=user['email'],
            subject='Welcome to Optio - your class is ready',
            template_name='partner_class_welcome',
            context={
                'student_name': user.get('first_name') or 'there',
                'student_email': user['email'],
                'invite_link': f"{base}/student/welcome?token={token}&email={quote(user['email'])}",
                'org_name': _repo(admin).org_name(offering['organization_id']),
                'class_title': template.get('title'),
                'subject_name': get_display_name(template['transcript_subject']),
                'expiry_days': INVITE_EXPIRY_DAYS,
            }))
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Partner class welcome email to {user.get('email')} failed: {e}")
        return False


def _send_added_email(admin, to_email, student_name, template, offering, frontend_url) -> bool:
    from services.email_service import email_service
    try:
        return bool(email_service.send_templated_email(
            to_email=to_email,
            subject='A new class is on your Optio account',
            template_name='partner_class_added',
            context={
                'student_name': student_name or 'there',
                'org_name': _repo(admin).org_name(offering['organization_id']),
                'class_title': template.get('title'),
                'subject_name': get_display_name(template['transcript_subject']),
                'login_url': f"{frontend_url.rstrip('/')}/login",
            }))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Partner class added email to {to_email} failed: {e}')
        return False


# ── billing ───────────────────────────────────────────────────────────────────

def billable_students(admin, org_id: str, month: Optional[str] = None) -> Dict[str, Any]:
    """Per offering: how many students to invoice for `month`, and the amount."""
    start, end = month_bounds(month)
    repo = _repo(admin)
    offerings = repo.for_org(org_id)
    templates = repo.templates([o['template_quest_id'] for o in offerings])
    enrollments = repo.enrollments([o['id'] for o in offerings])
    states = repo.class_states([e['class_quest_id'] for e in enrollments if e.get('class_quest_id')])
    lines = []
    for o in offerings:
        count = sum(1 for e in enrollments
                    if e['offering_id'] == o['id'] and e.get('class_quest_id')
                    and is_billable(e, states.get(e['class_quest_id']), start, end))
        lines.append({
            'offering_id': o['id'],
            'title': (templates.get(o['template_quest_id']) or {}).get('title') or o['slug'],
            'students': count,
            'unit_amount_cents': o['monthly_fee_cents'],
            'amount_cents': count * o['monthly_fee_cents'],
        })
    return {'month': start.strftime('%Y-%m'), 'month_label': start.strftime('%B %Y'), 'offerings': lines}
