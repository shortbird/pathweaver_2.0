"""An Optio account that already exists joins a school.

Two doors, one write:

  - The superadmin's "add users" (POST /api/admin/organizations/<org>/users/add,
    routes/admin/organization_users.py), which attaches accounts directly.
  - A connect request (ticket af8469aa, 2026-10-14). A school admin who adds
    someone whose email already has a platform account used to be told to use
    "the school's connect flow", which did not exist; Mandie at Apogee Cache
    Valley hit that wall three times in three days and emailed support each
    time. Now the add wizard offers "Ask to connect": the school sends a
    request, the account's owner (or, for a minor student, their parent)
    accepts it signed in, and only then does the account join.

Never silently claim an account: nothing here attaches anyone on the school's
word alone. An account in ANOTHER school is refused outright -- only a
superadmin may move one (IDOR-H6).

Connect requests are rows in org_invitations (metadata.invitation_type =
'connect'), the table the school's email invitations already use, so the
admin's invitation list, cancel and expiry already cover them. They differ from
an email invitation in who may accept: the account the request names, or its
parent, signed in -- never whoever holds the email (see accept()).
"""

import secrets
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from repositories.org_account_repository import CONNECT_TYPE, OrgAccountRepository
from utils.logger import get_logger
from utils.timestamps import utcnow as _now

logger = get_logger(__name__)

# admin client justified: a connect request joins a school and an account that
#   is not yet in it, so neither side can read the other under RLS; every entry
#   point is gated first (front-office route, or the signed-in owner/parent).
from utils.admin_client import admin_client as _admin

EXPIRY_DAYS = 14
# Roles a school may ask an existing account to take. org_admin is not here:
# an admin is made on the staff record by an admin. Observers are not here: a
# parent invites them, not the school.
CONNECTABLE_ROLES = ('student', 'parent', 'advisor')
PLATFORM_ROLES = ('student', 'parent', 'advisor', 'observer')
ADULT_AGE = 18

USER_COLUMNS = ('id, email, role, org_role, org_roles, organization_id, first_name, last_name, '
                'display_name, date_of_birth, is_dependent, managed_by_parent_id')


class ConnectRequestError(Exception):
    """A rule here said no. The message is user-facing."""

    def __init__(self, message: str, status: int = 400, code: Optional[str] = None):
        super().__init__(message)
        self.status = status
        self.code = code


def _repo(client=None) -> OrgAccountRepository:
    return OrgAccountRepository(client=client or _admin())


def _name(user: Optional[Dict[str, Any]], fallback: str = 'Someone') -> str:
    if not user:
        return fallback
    full = f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip()
    return full or user.get('display_name') or fallback


# ── The one write ────────────────────────────────────────────────────────────

def attach_account_to_org(user_id: str, org_id: str, org_role: str, *,
                          keep_platform_role: bool, allow_move: bool,
                          client=None) -> Optional[str]:
    """Make an existing account a member of the school. Returns None when it
    joined, else why it did not (and nothing was written).

    keep_platform_role: the superadmin add path's rule -- a platform student,
        parent, advisor or observer keeps that role in the school, and
        `org_role` is only the fallback. A connect request passes False: the
        role the admin asked for, which the owner saw and accepted.
    allow_move: an account already in another school moves only when True,
        which only the superadmin path passes.
    """
    repo = _repo(client)
    user = repo.user(user_id, 'id, role, organization_id')
    if not user:
        return 'not_found'
    current_role = user.get('role') or 'student'
    current_org = user.get('organization_id')
    if current_role == 'superadmin':
        return 'superadmin'
    if current_org and current_org != org_id and not allow_move:
        return 'other_org'
    if current_role == 'org_managed':
        # Already an org member somewhere (this school, or a superadmin move):
        # they keep their org role.
        repo.update_user(user_id, {'organization_id': org_id})
        return None
    role = current_role if keep_platform_role and current_role in PLATFORM_ROLES else org_role
    repo.update_user(user_id, {'organization_id': org_id, 'role': 'org_managed',
                               'org_role': role, 'org_roles': [role]})
    return None


# ── Who the account is, to a school ──────────────────────────────────────────

def classify_email(org_id: str, email: str, client=None) -> Dict[str, Any]:
    """What adding this email would meet. For staff-gated callers only: it
    says whether an address has an account (never which school it is in).

    Returns {'state': 'none'|'here'|'connectable'|'other_school'|'not_connectable',
    'user': row or None}.
    """
    email = (email or '').strip().lower()
    return classify_user(org_id, _repo(client).by_email(email, USER_COLUMNS) if email else None)


def classify_user(org_id: str, user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """classify_email for a caller that already holds the account's row."""
    if not user:
        return {'state': 'none', 'user': None}
    if user.get('organization_id') == org_id:
        return {'state': 'here', 'user': user}
    if user.get('organization_id'):
        return {'state': 'other_school', 'user': user}
    if user.get('role') == 'superadmin':
        return {'state': 'not_connectable', 'user': user}
    return {'state': 'connectable', 'user': user}


def refusal_for(org_id: str, email: str, role: str, household_id: Optional[str] = None,
                client=None, user: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """The 409 an add door returns when the email already has an account, or
    None when it does not. A platform account is offered "Ask to connect"
    ({'code': 'connectable', 'connect': {...}}); an account at another school is
    refused without naming the school. `user`: the row, when the caller has it."""
    found = classify_user(org_id, user) if user else classify_email(org_id, email, client=client)
    state = found['state']
    if state == 'none':
        return None
    if state == 'connectable':
        return {'error': f'{email} already has an Optio account. You can send them a request '
                         'to join your school.',
                'code': 'connectable', 'status': 409,
                'connect': {'email': email, 'role': role, 'household_id': household_id}}
    if state == 'other_school':
        return {'error': f'{email} belongs to an account at another school, so it cannot be '
                         'added here.', 'code': 'other_school', 'status': 409}
    if state == 'here':
        return {'error': f'{email} is already in your school. Open their record instead.',
                'code': 'already_here', 'status': 409}
    return {'error': f'{email} cannot be added to a school.', 'code': 'not_connectable', 'status': 409}


def member_for_email(org_id: str, email: str, household_id: str,
                     client=None) -> Tuple[Optional[str], Optional[Dict[str, Any]], int]:
    """The family record's "+ Add member" by a student's account email.

    Until 2026-10-14 that door attached any platform account the email named
    straight into the school -- the silent claim this module exists to stop.
    An account already in the school is still connected at once; a platform
    account gets the "Ask to connect" answer instead.

    Returns (user_id, None, 200) or (None, refusal, status).
    """
    found = classify_email(org_id, email, client=client)
    if found['state'] == 'here':
        return found['user']['id'], None, 200
    if found['state'] == 'none':
        return None, {'error': 'No Optio account uses that email'}, 404
    refusal = dict(refusal_for(org_id, email, 'student', household_id, client=client) or {})
    status = refusal.pop('status', 409)
    return None, refusal, status


def _age(dob_value: Any) -> Optional[int]:
    if not dob_value:
        return None
    try:
        dob = date.fromisoformat(str(dob_value)[:10])
    except ValueError:
        return None
    # Whole years today (is this person a minor now?), not the school-year
    # age sis_age computes: the same rule family_student_service applies.
    from services.family_student_service import calculate_age
    return calculate_age(dob)


def approvers_for(user: Dict[str, Any], role: str, client=None) -> List[str]:
    """Who accepts. A student who is a minor (or whose age is unknown) and
    has a parent on Optio is the parent's to decide; otherwise the account's
    owner decides."""
    if role == 'student':
        age = _age(user.get('date_of_birth'))
        if age is None or age < ADULT_AGE:
            parents: List[str] = []
            if user.get('managed_by_parent_id'):
                parents.append(user['managed_by_parent_id'])
            parents += [p for p in _repo(client).approved_parent_ids(user['id']) if p not in parents]
            if parents:
                return parents
    return [user['id']]


def _is_student_account(user: Dict[str, Any]) -> bool:
    return user.get('role') == 'student' or bool(user.get('is_dependent'))


# ── The request ──────────────────────────────────────────────────────────────

def create_request(org_id: str, actor_id: str, email: str, role: str,
                   household_id: Optional[str] = None, client=None) -> Dict[str, Any]:
    """The school asks an existing platform account to join. Writes nothing to
    the account. Replaces an earlier pending request for the same address.

    Returns {'request_id', 'sent_to': 'owner'|'parent', 'email_sent'}.
    """
    repo = _repo(client)
    email = (email or '').strip().lower()
    if role not in CONNECTABLE_ROLES:
        raise ConnectRequestError('Choose student, parent or teacher')
    found = classify_email(org_id, email, client=client)
    state, user = found['state'], found['user']
    if state == 'none':
        raise ConnectRequestError('No Optio account uses that email. Add them as a new person instead.',
                                  404, 'none')
    if state != 'connectable':
        refusal = refusal_for(org_id, email, role, client=client) or {}
        raise ConnectRequestError(refusal.get('error') or 'This account cannot be connected.',
                                  409, refusal.get('code'))
    # A student account joins as a student, and only a student account does:
    # the request must not turn a parent into a pupil or a teen into a teacher.
    if (role == 'student') != _is_student_account(user):
        raise ConnectRequestError(
            'That account is a student account.' if role != 'student'
            else 'That account is not a student account.', 409, 'role_mismatch')
    if household_id:
        from repositories.household_repository import HouseholdRepository
        household = HouseholdRepository(client=repo.client).find_by_id(household_id)
        if not household or household.get('organization_id') != org_id:
            raise ConnectRequestError('Family not found', 404)

    for old in repo.pending_invitations_for(org_id, email):
        if (old.get('metadata') or {}).get('invitation_type') == CONNECT_TYPE:
            repo.set_invitation_status(old['id'], {'status': 'expired'})

    approvers = approvers_for(user, role, client=client)
    code = secrets.token_urlsafe(32)
    row = repo.insert_invitation({
        'organization_id': org_id,
        'email': email,
        'invited_name': _name(user, ''),
        'role': role,
        'invitation_code': code,
        'invited_by': actor_id,
        'status': 'pending',
        'expires_at': (_now() + timedelta(days=EXPIRY_DAYS)).isoformat(),
        'metadata': {'invitation_type': CONNECT_TYPE, 'target_user_id': user['id'],
                     'approver_user_ids': approvers, 'household_id': household_id},
    })
    org = repo.org(org_id) or {}
    email_sent = _tell_approvers(repo, approvers, user, org, role, code)
    logger.info(f"connect request {row['id'][:8]}: org {org_id[:8]} asked {user['id'][:8]} "
                f"to join as {role} (approvers {len(approvers)}) by {actor_id[:8]}")
    return {'request_id': row['id'], 'email_sent': email_sent,
            'sent_to': 'owner' if approvers == [user['id']] else 'parent'}


def _tell_approvers(repo, approvers: List[str], user: Dict[str, Any], org: Dict[str, Any],
                    role: str, code: str) -> bool:
    """Email and an in-app notice to each approver. Never to a child who has a
    parent deciding for them."""
    from app_config import Config
    from services.email_service import email_service
    from services.notification_service import NotificationService
    school = org.get('name') or 'A school'
    person = _name(user, 'your student')
    link = f'{Config.FRONTEND_URL}/invitation/{code}'
    rows = {r['id']: r for r in repo.users(approvers, 'id, email, first_name, last_name, display_name')}
    any_sent = False
    for approver_id in approvers:
        approver = rows.get(approver_id) or {}
        for_self = approver_id == user['id']
        what = (f'{school} asked you to join on Optio as {_article(role)}.' if for_self
                else f'{school} asked to add {person} to the school on Optio as {_article(role)}.')
        try:
            if approver.get('email'):
                any_sent = email_service.send_templated_email(
                    to_email=approver['email'],
                    subject=f'{school} asked to connect {"your account" if for_self else person} on Optio',
                    template_name='org_connect_request',
                    context={'user_name': approver.get('first_name') or 'there', 'what': what,
                             'org_name': school, 'accept_url': link, 'expiry_days': EXPIRY_DAYS},
                ) or any_sent
        except Exception as e:  # noqa: BLE001 — the in-app notice still goes
            logger.warning(f'connect request: email to {approver_id[:8]} failed: {e}')
        try:
            NotificationService().create_notification(
                user_id=approver_id, notification_type='announcement',
                title=f'{school} asked to connect' + ('' if for_self else f' {person}'),
                message=what + ' Nothing changes until you accept.',
                link=f'/invitation/{code}',
            )
        except Exception as e:  # noqa: BLE001
            logger.warning(f'connect request: notice to {approver_id[:8]} failed: {e}')
    return any_sent


def _article(role: str) -> str:
    return {'student': 'a student', 'parent': 'a parent', 'advisor': 'a teacher'}.get(role, role)


def _open(code: str, repo) -> Dict[str, Any]:
    inv = repo.invitation_by_code(code or '')
    meta = (inv or {}).get('metadata') or {}
    if not inv or meta.get('invitation_type') != CONNECT_TYPE:
        raise ConnectRequestError('This link is not valid.', 404)
    if inv['status'] != 'pending':
        raise ConnectRequestError(f"This request was already {'accepted' if inv['status'] == 'accepted' else inv['status']}.", 400)
    if inv['expires_at'] < _now().isoformat():
        repo.set_invitation_status(inv['id'], {'status': 'expired'})
        raise ConnectRequestError('This request has expired. Ask the school to send a new one.', 400)
    return inv


def public_preview(inv: Dict[str, Any], client=None) -> Dict[str, Any]:
    """What the accept page shows before sign-in (the code is the credential).
    Used by /invitations/validate for a connect request."""
    meta = inv.get('metadata') or {}
    user = _repo(client).user(meta.get('target_user_id') or '', 'id, first_name, last_name, display_name')
    return {'is_connect_request': True,
            'person_name': _name(user, 'this account'),
            'for_parent': meta.get('approver_user_ids') != [meta.get('target_user_id')]}


def _who_may_decide(inv: Dict[str, Any], user_id: str) -> None:
    meta = inv.get('metadata') or {}
    if user_id not in (meta.get('approver_user_ids') or []):
        raise ConnectRequestError(
            'This request was sent to a different Optio account. Sign out, then sign in '
            'with the account the email went to.', 403, 'wrong_account')


def accept(code: str, user_id: str, client=None) -> Dict[str, Any]:
    """The owner, or the minor's parent, signed in, accepts. Only now does the
    account join the school, with the role the school asked for."""
    repo = _repo(client)
    inv = _open(code, repo)
    _who_may_decide(inv, user_id)
    meta = inv['metadata']
    target_id = meta['target_user_id']
    org_id = inv['organization_id']

    target = repo.user(target_id, USER_COLUMNS)
    if not target:
        raise ConnectRequestError('This account no longer exists.', 404)
    if target.get('organization_id') and target['organization_id'] != org_id:
        raise ConnectRequestError('This account already belongs to another school, so it '
                                  'cannot join this one.', 409, 'other_school')

    # Conditional on status so two clicks cannot both accept.
    if not repo.set_invitation_status(inv['id'], {'status': 'accepted', 'accepted_by': user_id,
                                                  'accepted_at': _now().isoformat()},
                                      only_if_status='pending'):
        raise ConnectRequestError('This request was already used.', 400)

    why = attach_account_to_org(target_id, org_id, inv['role'], keep_platform_role=False,
                                allow_move=False, client=repo.client)
    if why:
        repo.set_invitation_status(inv['id'], {'status': 'pending', 'accepted_by': None,
                                               'accepted_at': None})
        raise ConnectRequestError('This account cannot join a school.', 409, why)

    _place_in_family(org_id, target, inv['role'], meta.get('household_id'), repo.client)
    org = repo.org(org_id) or {}
    _tell_school(inv, target, org)
    if user_id != target_id:
        _notice(target_id, f"You joined {org.get('name') or 'your school'}",
                f"Your parent accepted {org.get('name') or 'the school'}'s request. "
                'Your work and XP are unchanged.')
    logger.info(f"connect request {inv['id'][:8]} accepted by {user_id[:8]}: "
                f"{target_id[:8]} joined org {org_id[:8]} as {inv['role']}")
    return {'status': 'accepted', 'org_name': org.get('name'), 'role': inv['role'],
            'self': user_id == target_id}


def decline(code: str, user_id: str, client=None) -> Dict[str, Any]:
    repo = _repo(client)
    inv = _open(code, repo)
    _who_may_decide(inv, user_id)
    repo.set_invitation_status(inv['id'], {'status': 'cancelled'}, only_if_status='pending')
    target = repo.user(inv['metadata']['target_user_id'], 'id, first_name, last_name, display_name')
    if inv.get('invited_by'):
        _notice(inv['invited_by'], 'Connect request declined',
                f'{_name(target)} declined the request to join your school.')
    return {'status': 'declined'}


def _place_in_family(org_id: str, target: Dict[str, Any], role: str,
                     household_id: Optional[str], client) -> None:
    """The family step of the door the admin started from. A student asked
    for from a family's record joins that family; a parent gets their own
    family, as a parent added on People would."""
    from services import sis_attach_service
    try:
        if household_id and role == 'student':
            sis_attach_service.attach_student(org_id, target['id'], household_id,
                                              source='connect_request', client=client)
        elif household_id and role == 'parent':
            sis_attach_service.attach_guardian(org_id, target['id'], household_id,
                                               source='connect_request', client=client)
        elif role == 'parent':
            last = (target.get('last_name') or '').strip() or 'New'
            sis_attach_service.attach_family(org_id, target['id'], [],
                                             household_fields={'name': f'{last} Family'},
                                             source='connect_request', client=client)
    except Exception as e:  # noqa: BLE001 — the account joined; the office can place them
        logger.warning(f"connect request: family placement failed for {target['id'][:8]}: {e}")


def _tell_school(inv: Dict[str, Any], target: Dict[str, Any], org: Dict[str, Any]) -> None:
    if inv.get('invited_by'):
        _notice(inv['invited_by'], f'{_name(target)} joined',
                f"{_name(target)} accepted the request and joined {org.get('name') or 'your school'} "
                f"as {_article(inv['role'])}.", link=f"/people?student={target['id']}")


def _notice(user_id: str, title: str, message: str, link: Optional[str] = None) -> None:
    try:
        from services.notification_service import NotificationService
        NotificationService().create_notification(user_id=user_id, notification_type='announcement',
                                                  title=title, message=message, link=link)
    except Exception as e:  # noqa: BLE001 — a lost notice must not undo the change
        logger.warning(f'connect request: notice to {user_id[:8]} failed: {e}')
