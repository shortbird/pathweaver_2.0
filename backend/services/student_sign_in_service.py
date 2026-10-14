"""Staff give a parent-managed child profile its own sign-in (ticket cd61587c).

A child under 13 added through a family is a managed profile: no email, no
login, run from the parent's account (DependentRepository.create_dependent).
The only way to give one a login was the PARENT's "add login" on Family
Settings (routes/dependents.py add_dependent_login), so a school that wanted
its students on Optio on Monday had to wait for every family to find the
button. Apogee Cache Valley had 27 such students (2026-10-14): "Can I have
logins created for all the students that don't currently have one? ... Or do
we have to wait for them?"

This gives the school's front office the same thing the office already makes
for a new student with no email: a username and a generated "PIN + word"
password (organization_users.create_username_student). No email is put on the
child (COPPA: check_dependent_no_email forbids one while is_dependent).

The profile is updated IN PLACE: the same users row, the same auth user, so
the parent link (managed_by_parent_id), the family, the work and the XP stay
exactly where they are. The org login (routes/auth/login/core.py org_login)
finds the username inside the school and signs in with whatever email the
auth user carries, which for a managed profile is its placeholder. That
placeholder was created unconfirmed, and GoTrue refuses a password sign-in on
an unconfirmed email, so the update confirms it.

Refused, never guessed:
  - a profile in another school (the route also checks the caller's org);
  - an account that is not a managed profile (it has, or should get, its own
    login some other way);
  - a managed profile that already has a username, or whose parent already
    gave it a real email login (add_dependent_login): resetting that password
    would lock the child out of the login the family set up.

The parent gets an in-app notice that the school set this up. The child is
never emailed; they have no address to send to.
"""

from typing import Any, Dict, Iterable, List, Optional, Set

from utils.logger import get_logger
from utils.org_student_credentials import (
    USERNAME_PATTERN,
    generate_simple_password,
    generate_username,
)

logger = get_logger(__name__)

PLACEHOLDER_DOMAIN = '@optio-internal-placeholder.local'
MAX_BULK = 100

PROFILE_COLUMNS = ('id, first_name, last_name, display_name, username, email, '
                   'organization_id, is_dependent, managed_by_parent_id')


class SignInSetupError(Exception):
    """A rule here said no. The message is shown to staff as it is."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _name_parts(profile: Dict[str, Any]) -> tuple:
    first = (profile.get('first_name') or '').strip()
    last = (profile.get('last_name') or '').strip()
    if not first and not last:
        parts = (profile.get('display_name') or '').strip().split(' ', 1)
        first = parts[0] if parts else ''
        last = parts[1] if len(parts) > 1 else ''
    return first, last


def display_name(profile: Dict[str, Any]) -> str:
    first, last = _name_parts(profile)
    return f'{first} {last}'.strip() or profile.get('display_name') or 'Student'


def _repo(client):
    from repositories.org_account_repository import OrgAccountRepository
    return OrgAccountRepository(client=client)


def taken_usernames(client, org_id: str) -> Set[str]:
    """Every username already used in the school, lowercased."""
    return _repo(client).org_usernames(org_id)


def _load_profile(client, org_id: str, student_id: str) -> Dict[str, Any]:
    row = _repo(client).user(student_id, PROFILE_COLUMNS)
    if not row or row.get('organization_id') != org_id:
        raise SignInSetupError('Student not found in this school', 404)
    return row


def _check_eligible(client, profile: Dict[str, Any]) -> None:
    """Raise unless this is a managed profile with no sign-in of any kind."""
    if not profile.get('is_dependent'):
        raise SignInSetupError(
            'Only a profile a parent manages can be set up here. This account '
            'already has its own sign-in; use Reset password instead.')
    if profile.get('username'):
        raise SignInSetupError(
            'This student already signs in with a username. Use Reset password for a new one.', 409)
    try:
        auth_user = client.auth.admin.get_user_by_id(profile['id'])
        auth_email = (getattr(getattr(auth_user, 'user', None), 'email', None) or '').lower()
    except Exception as e:  # noqa: BLE001
        logger.error(f"sign-in setup: auth lookup failed for {profile['id'][:8]}: {e}")
        raise SignInSetupError('Could not check this account. Try again in a minute.', 502) from e
    if auth_email and not auth_email.endswith(PLACEHOLDER_DOMAIN):
        # The parent already gave the child an email login (add_dependent_login).
        raise SignInSetupError(
            "This student's parent already set up a sign-in for them. Ask the parent "
            'for it, or the parent can change it from their family settings.', 409)


def suggest(client, org_id: str, student_id: str) -> Dict[str, Any]:
    """The username the modal offers first. Refuses what setup would refuse."""
    profile = _load_profile(client, org_id, student_id)
    _check_eligible(client, profile)
    first, last = _name_parts(profile)
    return {'suggested_username': generate_username(first, last, taken_usernames(client, org_id)),
            'name': display_name(profile)}


def _org_login(client, org_id: str) -> Dict[str, Optional[str]]:
    org = _repo(client).org(org_id) or {}
    slug = org.get('slug')
    return {'organization_slug': slug, 'org_name': org.get('name'),
            'login_url': f'/login/{slug}' if slug else '/login'}


def _notify_parent(profile: Dict[str, Any], org_name: Optional[str], org_id: str) -> bool:
    """An in-app notice to the parent who manages the profile. Never the child."""
    parent_id = profile.get('managed_by_parent_id')
    if not parent_id:
        return False
    school = org_name or 'Your school'
    try:
        from services.notification_service import NotificationService
        NotificationService().create_notification(
            user_id=parent_id,
            notification_type='announcement',
            title=f'{school} set up sign-in for {display_name(profile)}',
            message=(f'{display_name(profile)} can now sign in with a username and password '
                     f'that {school} gave them. Their work and XP are unchanged, and you still '
                     'manage their account. Ask the school if you need the login.'),
            organization_id=org_id,
        )
        return True
    except Exception as e:  # noqa: BLE001 — a lost notice must not undo the sign-in
        logger.warning(f"sign-in setup: parent notice failed for {profile['id'][:8]}: {e}")
        return False


def setup(client, org_id: str, student_id: str, actor_id: str,
          username: Optional[str] = None, *, taken: Optional[Set[str]] = None,
          org_login: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Give one managed profile a username and a generated password.

    Returns {'user_id', 'name', 'username', 'password', 'login_url',
    'organization_slug', 'parent_notified'}. The password is returned once and
    stored nowhere but the auth hash. Raises SignInSetupError.

    `taken` and `org_login` let the bulk path read them once for the batch;
    `taken` is updated in place with the username this call claims.
    """
    profile = _load_profile(client, org_id, student_id)
    _check_eligible(client, profile)
    taken = taken if taken is not None else taken_usernames(client, org_id)

    chosen = (username or '').strip().lower()
    if chosen:
        if not USERNAME_PATTERN.match(chosen):
            raise SignInSetupError(
                'Usernames use letters, numbers, dots, dashes or underscores, up to 30 '
                'characters, and start and end with a letter or number.')
        if chosen in taken:
            first, last = _name_parts(profile)
            raise SignInSetupError(
                f'The username "{chosen}" is already used at this school. '
                f'Try "{generate_username(first, last, taken)}".', 409)
    else:
        first, last = _name_parts(profile)
        chosen = generate_username(first, last, taken)

    # Claim the username first, only while the profile still has none.
    if not _repo(client).claim_username(student_id, org_id, chosen):
        raise SignInSetupError('This student already has a sign-in. Refresh and try again.', 409)

    password = generate_simple_password()
    try:
        client.auth.admin.update_user_by_id(student_id, {
            'password': password,
            # The managed profile's placeholder was created unconfirmed; GoTrue
            # refuses a password sign-in on an unconfirmed email.
            'email_confirm': True,
        })
    except Exception as e:  # noqa: BLE001
        logger.error(f'sign-in setup: password write failed for {student_id[:8]}: {e}')
        try:
            _repo(client).release_username(student_id)
        except Exception as undo_error:  # noqa: BLE001
            logger.error(f'sign-in setup: username undo failed for {student_id[:8]}: {undo_error}')
        raise SignInSetupError('Could not set the password. Try again.', 502) from e

    taken.add(chosen)
    login = org_login or _org_login(client, org_id)
    notified = _notify_parent(profile, login.get('org_name'), org_id)
    logger.info(f'sign-in setup: {actor_id[:8]} gave managed profile {student_id[:8]} '
                f'a username at org {org_id[:8]}')
    return {
        'user_id': student_id,
        'name': display_name(profile),
        'username': chosen,
        'password': password,
        'login_url': login['login_url'],
        'organization_slug': login['organization_slug'],
        'parent_notified': notified,
    }


def setup_many(client, org_id: str, student_ids: Iterable[str], actor_id: str) -> Dict[str, Any]:
    """The bulk door: each id set up in turn, each refusal reported per student.

    Returns {'results': [...], 'failed': [{user_id, name, error}],
    'login_url', 'organization_slug'} — the results in the shape
    PrintLoginCardsModal's cards and CSV already read (name, username, password).
    """
    ids: List[str] = list(dict.fromkeys(i for i in student_ids if isinstance(i, str) and i))
    if not ids:
        raise SignInSetupError('Choose at least one student')
    if len(ids) > MAX_BULK:
        raise SignInSetupError(f'Set up at most {MAX_BULK} students at once')
    taken = taken_usernames(client, org_id)
    login = _org_login(client, org_id)
    results: List[Dict[str, Any]] = []
    failed: List[Dict[str, Any]] = []
    for sid in ids:
        try:
            results.append(setup(client, org_id, sid, actor_id, taken=taken, org_login=login))
        except SignInSetupError as e:
            failed.append({'user_id': sid, 'error': str(e)})
    logger.info(f'sign-in setup (bulk): org {org_id[:8]} by {actor_id[:8]}: '
                f'{len(results)} set up, {len(failed)} refused')
    return {'results': results, 'failed': failed,
            'login_url': login['login_url'], 'organization_slug': login['organization_slug']}
