"""Friends policy: who decided a child may have friends, and on what terms.

Until 2026-09-16 every peer connection needed both students' parents to answer
in-app or by email. The parent was on the critical path of every social act,
and one month after launch the whole platform held one active connection.
COPPA does not ask for that: it asks for verifiable parental consent to the
PRACTICE of disclosing a child's information to other users. So the consent is
now one act per child -- a parent turns Friends on and sets the boundaries --
and the connection lifecycle reads that decision instead of asking again.

This module is the one place that answers "what did this child's family
decide". Three questions, three functions:

  * ``effective_policy`` -- the policy in force for a student, resolved in a
    fixed order: the school's module switch, then the child's own row, then
    (for an org student with no parent linked) the org's default, then off.
    Off says WHO could turn it on, so the client can point the student at
    the right adult rather than a dead end.
  * ``set_policy`` -- the write, and the consent record that goes with it.
    Enabling writes one parental_consent_log row naming the adult; changing
    a mode or a source writes none; disabling revokes every live connection
    the child is on, because "off" has to mean what a parent thinks it means.
  * ``setter_kind`` -- who may set it. A parent, by any of the three links.
    The org admin, only for a student with no parent linked (the same
    standing-in rule portfolio_access.find_approver applies). An adult
    student, for themselves. A minor never for themselves.

Nothing here touches a table directly: reads and writes go through
repositories.peer_policy_repository, and the relationship predicates are the
ones utils.portfolio_access already owns.
"""

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

from modules.enabled import module_enabled, org_flags
from utils import portfolio_access as pa
from utils.logger import get_logger
from utils.timestamps import now_iso

logger = get_logger(__name__)

MODULE_KEY = 'friends'

APPROVAL_MODES = ('auto', 'ask_first')
REQUEST_SOURCES = ('classmates', 'code', 'link', 'school')
#: 'message' arrived with phase 3 (2026-09-17), together with the safety work
#: it waited for: the peer text screen, message reporting, a send rate limit
#: and the parent's read-only view of the thread. Chat opens only when BOTH
#: sides' policies carry it (peer_connection_service.friends_can_message).
FRIENDS_CAN = ('see', 'comment', 'message')

DEFAULT_REQUEST_SOURCES = ['classmates', 'code', 'link']
#: Messaging is part of what a friend gets by default (owner, 2026-09-16):
#: the safety screen, the send limit and the parent's read-only view of the
#: thread are what made it safe to hand out with the rest. The parent's
#: switch to take it away is on the child's Friends settings.
DEFAULT_FRIENDS_CAN = ['see', 'comment', 'message']

CONSENT_SCOPE = 'peer_friends'
CONSENT_STATEMENT_VERSION = 'peer_friends_v1'
CONSENT_METHOD = 'in_app_toggle'

#: Where the policy came from.
ORIGIN_CHILD = 'child'
ORIGIN_ORG = 'org'
ORIGIN_NONE = 'none'
ORIGIN_MODULE_OFF = 'module_off'

REVOKE_REASON_OFF = 'friends_off'


class PeerPolicyError(Exception):
    """A rule in this module said no. The message is user-facing."""


@dataclass
class EffectivePolicy:
    student_id: str
    enabled: bool
    approval_mode: str = 'auto'
    request_sources: List[str] = field(default_factory=lambda: list(DEFAULT_REQUEST_SOURCES))
    friends_can: List[str] = field(default_factory=lambda: list(DEFAULT_FRIENDS_CAN))
    origin: str = ORIGIN_NONE
    #: User-facing, set when not enabled.
    reason: Optional[str] = None
    #: 'parent' | 'org_admin' | 'self' | 'nobody' | None -- who could enable it.
    who_can_enable: Optional[str] = None
    #: The adult accountable under this policy: {'user_id', 'kind'}. Under a
    #: child row that is whoever set it; under an org default, the org admin
    #: find_approver names. None when nobody is.
    approver: Optional[Dict[str, Any]] = None
    #: Of the student, for callers that route a notification to the parents
    #: of a child with no login of their own.
    is_dependent: bool = False
    organization_id: Optional[str] = None
    set_by_user_id: Optional[str] = None
    set_at: Optional[str] = None

    def allows_source(self, source: str) -> bool:
        # A guardian asking on their own child's behalf is the safe path and
        # is always allowed; it is not a source a family can turn off.
        return source == 'parent' or source in self.request_sources

    def to_dict(self) -> Dict[str, Any]:
        out = asdict(self)
        # Not the client's business, and the approver's id is not to be shown
        # to the other family.
        out.pop('approver', None)
        return out


# ---------------------------------------------------------------------------
# Plumbing
# ---------------------------------------------------------------------------

def _repo():
    from repositories.peer_policy_repository import PeerPolicyRepository
    return PeerPolicyRepository()


def _cache() -> Dict[str, EffectivePolicy]:
    """Per-request memo. A request that settles both sides of a connection
    asks about the same two students several times."""
    try:
        from flask import g, has_app_context
        if has_app_context():
            return g.setdefault('_peer_policies', {})
    except ImportError:
        # optional import; the fallback below is the answer
        ...
    return {}


def _invalidate(student_id: str) -> None:
    _cache().pop(student_id, None)


def org_friends_settings(org_id: Optional[str]) -> Dict[str, Any]:
    """The org's defaults for students with no parent linked, plus the
    school-wide pool switch. Missing or malformed -> the platform defaults
    (off, auto, no school pool)."""
    raw = org_flags(org_id).get('friends_settings')
    raw = raw if isinstance(raw, dict) else {}
    mode = raw.get('default_approval_mode')
    return {
        'default_enabled': bool(raw.get('default_enabled')),
        'default_approval_mode': mode if mode in APPROVAL_MODES else 'auto',
        'school_pool': bool(raw.get('school_pool')),
    }


# ---------------------------------------------------------------------------
# Reading the policy
# ---------------------------------------------------------------------------

def effective_policy(student_id: str) -> EffectivePolicy:
    """The Friends policy in force for this student.

    Resolution order, first answer wins:
      1. the school turned the Friends module off -> off, for everyone there
      2. the child's own peer_policies row -> it
      3. no row, org student with no parent linked -> the org's defaults
      4. no row, anyone else -> off, naming who could turn it on
    """
    cache = _cache()
    if student_id in cache:
        return cache[student_id]

    repo = _repo()
    student = repo.user_row(
        student_id,
        'id, organization_id, is_dependent, date_of_birth, managed_by_parent_id',
    )
    if not student:
        policy = EffectivePolicy(student_id=student_id, enabled=False,
                                 reason='Account not found')
        cache[student_id] = policy
        return policy

    org_id = student.get('organization_id')
    base = dict(student_id=student_id, is_dependent=bool(student.get('is_dependent')),
                organization_id=org_id)

    if org_id and not module_enabled(org_id, MODULE_KEY):
        policy = EffectivePolicy(enabled=False, origin=ORIGIN_MODULE_OFF,
                                 reason='Friends is not turned on at your school.',
                                 **base)
        cache[student_id] = policy
        return policy

    row = repo.get(student_id)
    if row:
        approver = None
        if row.get('set_by_user_id'):
            approver = {'user_id': row['set_by_user_id'],
                        'kind': row.get('set_by_kind') or 'parent'}
        policy = EffectivePolicy(
            enabled=bool(row.get('enabled')),
            approval_mode=row.get('approval_mode') or 'auto',
            request_sources=list(row.get('request_sources') or DEFAULT_REQUEST_SOURCES),
            friends_can=list(row.get('friends_can') or DEFAULT_FRIENDS_CAN),
            origin=ORIGIN_CHILD,
            approver=approver,
            set_by_user_id=row.get('set_by_user_id'),
            set_at=row.get('set_at'),
            **base,
        )
        if not policy.enabled:
            policy.who_can_enable, policy.reason = _who_can_enable(student)
        cache[student_id] = policy
        return policy

    # No row. Who is accountable for this student decides what "no row" means.
    approver = pa.find_approver(student_id)
    if approver and approver.get('kind') == 'org_admin':
        settings = org_friends_settings(org_id)
        sources = list(DEFAULT_REQUEST_SOURCES) + (['school'] if settings['school_pool'] else [])
        policy = EffectivePolicy(
            enabled=settings['default_enabled'],
            approval_mode=settings['default_approval_mode'],
            request_sources=sources,
            origin=ORIGIN_ORG,
            approver={'user_id': approver['user_id'], 'kind': 'org_admin'},
            **base,
        )
        if not policy.enabled:
            policy.who_can_enable = 'org_admin'
            policy.reason = 'Ask your school to turn on Friends.'
        cache[student_id] = policy
        return policy

    policy = EffectivePolicy(enabled=False, origin=ORIGIN_NONE, **base)
    policy.who_can_enable, policy.reason = _who_can_enable(student, approver)
    cache[student_id] = policy
    return policy


def _who_can_enable(student: Dict[str, Any],
                    approver: Optional[Dict[str, Any]] = None):
    """Who could turn Friends on for this student, and the sentence that
    tells the student so. `approver` is find_approver's answer when the
    caller already has it."""
    if approver is None:
        approver = pa.find_approver(student['id'])
    if approver and approver.get('kind') == 'parent':
        name = approver.get('first_name') or 'your parent'
        return 'parent', f'Ask {name} to turn on Friends for you.'
    if approver and approver.get('kind') == 'org_admin':
        return 'org_admin', 'Ask your school to turn on Friends.'
    if not pa.is_minor(student):
        return 'self', 'Turn on Friends to connect with other students.'
    return 'nobody', ('Connecting with other students needs a parent or '
                      'guardian to turn it on. Ask an adult to link their '
                      'account to yours.')


# ---------------------------------------------------------------------------
# Writing the policy
# ---------------------------------------------------------------------------

def setter_kind(setter_id: str, student_id: str) -> str:
    """Who is this caller to the student, for the purpose of setting policy.

    'self' only for an adult: a minor's Friends policy belongs to their
    parent, the same rule can_manage_privacy applies to publishing.
    'org_admin' only when no parent is linked: where a parent exists, the
    parent is the accountable adult and the school does not speak over them
    (find_approver's ordering, applied to the write).
    """
    if not setter_id or not student_id:
        raise PeerPolicyError('Not authorized')

    if setter_id == student_id:
        if pa.is_minor_by_id(student_id):
            raise PeerPolicyError(
                'Your parent or guardian controls Friends for you. '
                'You can ask them to turn it on.')
        return 'self'

    if pa.is_parent_of(setter_id, student_id):
        return 'parent'

    repo = _repo()
    caller = repo.user_row(setter_id, 'id, role, org_role, org_roles, organization_id')
    if caller and caller.get('role') == 'superadmin':
        return 'superadmin'

    student = repo.user_row(student_id, 'id, organization_id')
    if caller and student and pa.is_org_admin_over(caller, student):
        approver = pa.find_approver(student_id)
        if approver and approver.get('kind') == 'parent':
            raise PeerPolicyError(
                'This student has a parent or guardian linked, and Friends '
                'is their decision.')
        return 'org_admin'

    raise PeerPolicyError('Not authorized')


def _as_list(value, allowed, default, label) -> List[str]:
    if value is None:
        return list(default)
    if not isinstance(value, (list, tuple)):
        raise PeerPolicyError(f'{label} must be a list.')
    out = []
    for item in value:
        if item not in allowed:
            raise PeerPolicyError(f'{label}: {item!r} is not a valid value.')
        if item not in out:
            out.append(item)
    return out


def set_policy(student_id: str, setter_id: str, body: Dict[str, Any], *,
               ip_address: Optional[str] = None,
               user_agent: Optional[str] = None) -> Dict[str, Any]:
    """Write the child's policy. Returns {'policy', 'revoked_count',
    'consent_recorded'}.

    Three consequences, each deliberate:
      * off -> on writes ONE parental_consent_log row naming the adult, unless
        an adult is setting their own. That row is the COPPA consent for
        disclosing the child's work to peers. A later change of mode or
        sources is not a new consent and writes nothing.
      * on -> off revokes every active connection the child is on, with the
        reason recorded. A parent who turns Friends off expects the friends
        to be gone, not hidden behind a switch that could flip back.
      * 'message' in friends_can opens chat with a friend whose family also
        allows it; it is never a grant on its own.
    """
    kind = setter_kind(setter_id, student_id)
    body = body or {}
    repo = _repo()
    current = repo.get(student_id) or {}

    enabled = body.get('enabled')
    if enabled is None:
        enabled = bool(current.get('enabled'))
    if not isinstance(enabled, bool):
        raise PeerPolicyError('enabled must be true or false.')

    mode = body.get('approval_mode') or current.get('approval_mode') or 'auto'
    if mode not in APPROVAL_MODES:
        raise PeerPolicyError('approval_mode must be "auto" or "ask_first".')

    sources = _as_list(body.get('request_sources'), REQUEST_SOURCES,
                       current.get('request_sources') or DEFAULT_REQUEST_SOURCES,
                       'request_sources')
    friends_can = _as_list(body.get('friends_can'), FRIENDS_CAN,
                           current.get('friends_can') or DEFAULT_FRIENDS_CAN,
                           'friends_can')
    if 'see' not in friends_can:
        # Comments on work you cannot see is not a setting; seeing is the floor.
        friends_can.insert(0, 'see')

    was_enabled = bool(current.get('enabled'))
    consent_log_id = current.get('consent_log_id')
    consent_recorded = False
    if enabled and not was_enabled and kind != 'self':
        consent_log_id = _write_consent(repo, student_id, setter_id, kind,
                                        ip_address, user_agent)
        consent_recorded = consent_log_id is not None

    now = now_iso()
    row = {
        'student_id': student_id,
        'enabled': enabled,
        'approval_mode': mode,
        'request_sources': sources,
        'friends_can': friends_can,
        'set_by_user_id': setter_id,
        'set_by_kind': kind,
        'set_at': now,
        'consent_log_id': consent_log_id,
        'updated_at': now,
    }
    repo.upsert(row)
    _invalidate(student_id)

    revoked = 0
    if was_enabled and not enabled:
        from repositories.peer_connection_repository import PeerConnectionRepository
        revoked = PeerConnectionRepository().revoke_all_active_for(
            student_id, revoked_by=setter_id, reason=REVOKE_REASON_OFF)
        logger.info('[friends] %s turned Friends off for %s; %d connection(s) revoked',
                    str(setter_id)[:8], str(student_id)[:8], revoked)
    elif enabled and not was_enabled:
        logger.info('[friends] %s (%s) turned Friends on for %s',
                    str(setter_id)[:8], kind, str(student_id)[:8])

    return {
        'policy': effective_policy(student_id).to_dict(),
        'revoked_count': revoked,
        'consent_recorded': consent_recorded,
    }


def _write_consent(repo, student_id: str, setter_id: str, kind: str,
                   ip_address: Optional[str], user_agent: Optional[str]) -> Optional[str]:
    """One parental_consent_log row for this enable. Attributed to a named
    adult -- a consent you cannot attribute is not a consent (the reasoning
    the 2026-08-14 migration recorded for the per-side approval rows)."""
    people = repo.users_by_ids([student_id, setter_id],
                               'id, email, first_name, last_name, display_name')
    child = people.get(student_id) or {}
    setter = people.get(setter_id) or {}
    signature = (setter.get('display_name')
                 or ' '.join(p for p in (setter.get('first_name'), setter.get('last_name')) if p)
                 or setter.get('email') or '')
    now = now_iso()
    row = {
        'user_id': student_id,
        'child_email': child.get('email') or '',
        'parent_email': setter.get('email') or '',
        'consent_token': None,
        'consent_sent_at': now,
        'consent_verified_at': now,
        'ip_address': ip_address or None,
        'user_agent': (user_agent or '')[:500] or None,
        'consent_method': CONSENT_METHOD,
        'signature_name': signature[:200] or None,
        'consent_statement_version': CONSENT_STATEMENT_VERSION,
        'consent_scope': CONSENT_SCOPE,
        'granted_by_user_id': setter_id,
    }
    try:
        return repo.write_consent(row)
    except Exception as e:  # noqa: BLE001
        # The consent record is the point. Do not enable without it.
        logger.error('[friends] consent log write failed for %s: %s', str(student_id)[:8], e)
        raise PeerPolicyError('Could not record your consent. Please try again.') from e


# ---------------------------------------------------------------------------
# The org's defaults
# ---------------------------------------------------------------------------

def set_org_friends_settings(org_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Write feature_flags.friends_settings, merging into the stored blob
    key-by-key so a stale tab cannot clobber the rest of feature_flags."""
    body = body or {}
    current = org_friends_settings(org_id)
    settings = dict(current)
    if 'default_enabled' in body:
        if not isinstance(body['default_enabled'], bool):
            raise PeerPolicyError('default_enabled must be true or false.')
        settings['default_enabled'] = body['default_enabled']
    if 'default_approval_mode' in body:
        if body['default_approval_mode'] not in APPROVAL_MODES:
            raise PeerPolicyError('default_approval_mode must be "auto" or "ask_first".')
        settings['default_approval_mode'] = body['default_approval_mode']
    if 'school_pool' in body:
        if not isinstance(body['school_pool'], bool):
            raise PeerPolicyError('school_pool must be true or false.')
        settings['school_pool'] = body['school_pool']

    from repositories.organization_repository import OrganizationRepository
    repo = OrganizationRepository()
    org = repo.find_by_id(org_id)
    if not org:
        raise PeerPolicyError('Organization not found')
    flags = dict(org.get('feature_flags') or {})
    flags['friends_settings'] = settings
    repo.update_organization(org_id, {'feature_flags': flags})

    # Every cached policy resolved under the old defaults is stale now.
    _cache().clear()
    try:
        from flask import g, has_app_context
        if has_app_context():
            g.pop('_module_org_rows', None)
    except ImportError:
        ...
    return settings
