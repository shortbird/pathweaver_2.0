"""Peer connections: two students, each family's rules, one mutual link.

The safety argument for this feature lives in four places, and all four are in
this module so they can be read together rather than reconstructed from six
route handlers:

  * ``age_check`` -- a neutral, one-shot age screen for the one population
    that has nobody else to answer for them (a platform student with no
    parent linked and no date of birth on file). It records the answer it is
    given, including "under 13", and locks it. An age screen that rejects the
    honest answer and leaves the form open is not a gate, it is a hint.
  * ``request`` -- discovery without a directory. A student is reached by a
    code handed over in person or by link, by being in the same class, by the
    school's own pool where the school turned that on, or by their parent. No
    one can look a child up by name, and a student whose family has not
    turned Friends on cannot be reached at all.
  * ``_side_consent`` -- one accountable adult per side, never one family
    consenting for another. Since 2026-09-16 that adult's answer is usually
    already on file: the parent set a per-child policy
    (services/peer_policy_service) and this reads it. A side whose policy
    says "ask me first" still waits for an explicit answer; a side whose
    policy is off ends the request. The school stands in only for a student
    with no parent linked, and only for a peer at the same school.
  * ``_maybe_activate`` -- the single place a connection becomes 'active', so
    there is exactly one answer to "what did we require before these two
    children could see each other's work". It is also where the parents who
    did not answer explicitly are told, after the fact, that it happened.

Everything downstream (portfolio_access.is_peer_of, the comment endpoints)
reads the resulting status and re-derives nothing.

ADMIN CLIENT USAGE: this service uses get_supabase_admin_client() throughout.
Every operation is inherently cross-user -- a student writing a row about
another student, a parent answering for a child, a service resolving who a
child's accountable adult is -- and none of it is expressible as the caller's
own RLS scope. Access control is the explicit gating in each function: the
caller must be a participant (``_require_participant``), a parent of one
(``pa.is_parent_of``), or the named approver of the row they are touching.
"""

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
import secrets

from utils.logger import get_logger
from utils.validation.sanitizers import pgrst_uuid
from utils import portfolio_access as pa
from services import peer_policy_service as policy_svc

logger = get_logger(__name__)


# How long a share code stays usable. Long enough to hand over at school and
# have the other student type it in that evening; short enough that a code
# written on a whiteboard in September is dead by October.
CODE_TTL = timedelta(days=7)

# Ambiguous glyphs removed: children type these by hand off a screen, and
# 0/O and 1/I/L collisions turn a safety mechanism into a support ticket.
CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
CODE_LENGTH = 8

MAX_COMMENT_LENGTH = 1000

# Eligibility states returned to the frontend. Each says what the student is
# asked to do next, which is the distinction the old portfolio gate got wrong
# by showing an under-18 explanation to people whose age was simply unknown.
ELIGIBLE = 'eligible'          # Friends is on for this student
NEEDS_DOB = 'needs_dob'        # nobody to answer for them and no age on file
FRIENDS_OFF = 'friends_off'    # off; `who_can_enable` says who could turn it on
MODULE_OFF = 'module_off'      # the school switched the feature off

# Where a request came from. Recorded on the row, checked against the
# addressee's request_sources.
SOURCE_CODE = 'code'
SOURCE_LINK = 'link'
SOURCE_CLASSMATES = 'classmates'
SOURCE_SCHOOL = 'school'
SOURCE_PARENT = 'parent'
PEER_ID_SOURCES = (SOURCE_CLASSMATES, SOURCE_SCHOOL)

# The text a student sees for every reason a code did not work. One message
# for "no such code", "expired", "that family has Friends off" and "blocked":
# a differentiated error turns the code field into an oracle.
CODE_REFUSED = 'That code is not valid or has expired.'


class PeerConnectionError(Exception):
    """A rule in this module said no. The message is user-facing."""


# admin client justified: a connection joins two students in different
#   families, so every rule here reads rows on both sides that neither caller
#   can see
from utils.admin_client import admin_client as _admin


from utils.timestamps import utcnow as _now  # noqa: E402


def _iso(dt):
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Eligibility and the age screen
# ---------------------------------------------------------------------------

def eligibility(user_id: str) -> Dict[str, Any]:
    """What state is this student in with respect to Friends?

    Returns {'state', 'reason', 'who_can_enable', 'policy'}. The entry point
    is shown for every state; what differs is what the student is asked to do
    next: nothing (eligible), tell us their age (needs_dob), or ask a named
    adult (friends_off).
    """
    user = _admin().table('users').select(
        'id, date_of_birth, date_of_birth_locked_at, is_dependent'
    ).eq('id', user_id).limit(1).execute().data
    user = user[0] if user else None

    if not user:
        return {'state': FRIENDS_OFF, 'reason': 'Account not found',
                'who_can_enable': None, 'policy': None}

    policy = policy_svc.effective_policy(user_id)

    if policy.origin == policy_svc.ORIGIN_MODULE_OFF:
        return {'state': MODULE_OFF, 'reason': policy.reason,
                'who_can_enable': None, 'policy': None}

    if policy.enabled:
        return {'state': ELIGIBLE, 'reason': None, 'who_can_enable': None,
                'policy': policy.to_dict()}

    # Off. A platform student with nobody to answer for them and no age on
    # file is the one case where the student can still do something
    # themselves: tell us their age. An adult may then turn Friends on; a
    # minor is pointed at linking a parent.
    if (policy.who_can_enable == 'nobody' and not user.get('date_of_birth')
            and not user.get('is_dependent')):
        return {'state': NEEDS_DOB, 'reason': 'We need your date of birth first.',
                'who_can_enable': None, 'policy': None}

    return {'state': FRIENDS_OFF, 'reason': policy.reason,
            'who_can_enable': policy.who_can_enable, 'policy': None}


def age_check(user_id: str, dob_str: str) -> Dict[str, Any]:
    """Record a self-attested date of birth, once, and answer eligibility.

    This is deliberately NOT ``PUT /api/users/profile``. That endpoint raises a
    validation error on an under-13 date, which for a profile editor is right
    and for an age screen is precisely backwards: the child gets an error and a
    form still waiting for input, so they try 2010 instead. Here the honest
    answer is accepted, stored, and locked, and the student is told what
    happens next -- an adult may turn Friends on for themselves; a minor is
    asked to link a parent.

    The lock is what makes the gate real. Without it a blocked student walks to
    Account Settings and edits their birthday (see the matching refusal in
    routes/users/profile.py).
    """
    admin = _admin()
    rows = admin.table('users').select(
        'id, date_of_birth, date_of_birth_locked_at, is_dependent'
    ).eq('id', user_id).limit(1).execute().data
    user = rows[0] if rows else None
    if not user:
        raise PeerConnectionError('Account not found')

    if user.get('date_of_birth_locked_at'):
        raise PeerConnectionError(
            'Your date of birth is already on file. Ask a parent or your '
            'school to correct it if it is wrong.'
        )

    if user.get('is_dependent'):
        raise PeerConnectionError(
            'Your parent or guardian manages your date of birth. '
            'Ask them to add it from their account.'
        )

    try:
        dob = datetime.strptime((dob_str or '').strip(), '%Y-%m-%d').date()
    except (ValueError, TypeError) as _exc:
        raise PeerConnectionError('Please enter a valid date of birth.') from _exc

    today = date.today()
    if dob > today:
        raise PeerConnectionError('Date of birth cannot be in the future.')
    if today.year - dob.year > 120:
        raise PeerConnectionError('Please enter a valid date of birth.')

    update = {
        'date_of_birth': dob.isoformat(),
        'date_of_birth_locked_at': _iso(_now()),
    }
    admin.table('users').update(update).eq('id', user_id).execute()

    under_13 = pa.is_under_13({'date_of_birth': dob.isoformat()})
    logger.info(
        "[peer-connections] age screen for user %s: %s",
        str(user_id)[:8], 'under_13' if under_13 else 'thirteen_plus'
    )

    # Crossing into adulthood removes the parental portfolio gate, which is a
    # consequence of this write worth recording rather than discovering later.
    # Mirrors the FERPA note in routes/users/profile.py.
    if (today - dob).days / 365.25 >= 18:
        logger.warning(
            "[FERPA] User %s set an adult date of birth via the peer "
            "connection age screen; parental approval no longer applies to "
            "their portfolio.", str(user_id)[:8]
        )

    policy_svc._invalidate(user_id)
    return eligibility(user_id)


def _require_eligible(user_id: str) -> policy_svc.EffectivePolicy:
    """Friends must be on for this student. Returns the policy in force."""
    policy = policy_svc.effective_policy(user_id)
    if not policy.enabled:
        raise PeerConnectionError(policy.reason or 'Friends is not turned on for you yet.')
    return policy


# ---------------------------------------------------------------------------
# Share codes
# ---------------------------------------------------------------------------

def _generate_code() -> str:
    return ''.join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def issue_code(user_id: str) -> Dict[str, Any]:
    """Mint a fresh share code, retiring any previous live one.

    Rotating on issue rather than accumulating codes means a student who thinks
    a code got out can invalidate it by pressing the button again -- there is
    never more than one live inbound channel per student.
    """
    _require_eligible(user_id)
    admin = _admin()

    admin.table('peer_connect_codes').update({'revoked_at': _iso(_now())}) \
        .eq('user_id', user_id).is_('revoked_at', 'null').execute()

    expires = _now() + CODE_TTL
    # The live-code index is unique over a small keyspace, so a collision is
    # rare but not impossible. Retry rather than surfacing a 500.
    for _ in range(5):
        code = _generate_code()
        try:
            row = admin.table('peer_connect_codes').insert({
                'user_id': user_id,
                'code': code,
                'expires_at': _iso(expires),
            }).execute().data[0]
            return {'code': row['code'], 'expires_at': row['expires_at']}
        except Exception as e:
            logger.warning("[peer-connections] code collision, retrying: %s", e)
    raise PeerConnectionError('Could not create a code. Please try again.')


def _resolve_code(code: str) -> Optional[str]:
    """The user a live code belongs to, or None."""
    rows = _admin().table('peer_connect_codes').select('user_id, expires_at') \
        .eq('code', (code or '').strip().upper()) \
        .is_('revoked_at', 'null').limit(1).execute().data or []
    if not rows:
        return None
    try:
        expires = datetime.fromisoformat(rows[0]['expires_at'].replace('Z', '+00:00'))
    except Exception:
        return None
    if expires < _now():
        return None
    return rows[0]['user_id']


# ---------------------------------------------------------------------------
# Consent resolution
# ---------------------------------------------------------------------------

def _same_org(student_id: str, other_student_id: str) -> bool:
    orgs = _admin().table('users').select('id, organization_id') \
        .in_('id', [student_id, other_student_id]).execute().data or []
    org_by_user = {r['id']: r.get('organization_id') for r in orgs}
    a_org, b_org = org_by_user.get(student_id), org_by_user.get(other_student_id)
    return bool(a_org and a_org == b_org)


def _resolve_approver(student_id: str, other_student_id: str) -> Dict[str, Any]:
    """The adult who may consent to THIS student joining THIS connection.

    Delegates to portfolio_access.find_approver for the parent-then-org-admin
    ordering, then narrows it: the org admin fallback is only valid when both
    students belong to that same organization.

    That narrowing is the whole reason this isn't a bare find_approver call.
    The COPPA school exception lets a school consent on a parent's behalf for
    *educational* purposes within the school. A principal can reasonably speak
    for "these two children in my building"; nobody appointed them to consent to
    a child connecting with a stranger at another school. Where that leaves no
    approver, the honest answer is that the connection cannot be formed.
    """
    approver = pa.find_approver(student_id)
    if not approver:
        raise PeerConnectionError(
            'We could not find a parent or guardian to approve this. '
            'Ask an adult to link their account to yours first.'
        )

    if approver['kind'] == 'parent':
        return approver

    # org_admin fallback -- same-org only.
    if _same_org(student_id, other_student_id):
        return approver

    raise PeerConnectionError(
        'Connecting with a student outside your school needs a parent or '
        'guardian to approve it. Ask an adult to link their account to yours.'
    )


def _side_consent(student_id: str, other_student_id: str) -> Dict[str, Any]:
    """How THIS student's side of a connection gets its adult's answer.

    Returns {'mode': 'auto' | 'ask_first', 'approver': {...}} -- or raises
    when the side cannot consent at all (policy off, or a school standing in
    for a peer at another school).

    The policy is the parent's answer on file. 'auto' means it was given when
    they turned Friends on and set no further condition; the approval row is
    written approved, attributed to them, method 'policy'. 'ask_first' means
    they asked to be asked; the row is written pending and they are notified,
    exactly as every connection worked before 2026-09-16.
    """
    policy = policy_svc.effective_policy(student_id)
    if not policy.enabled:
        name = _display_name(student_id)
        raise PeerConnectionError(
            f"{name}'s family hasn't turned on Friends yet.")

    approver = policy.approver
    if not approver:
        # A child row with no setter on record (the setter's account was
        # erased) or an org default with no admin: fall back to the same
        # resolution the old flow used, narrowing included.
        approver = _resolve_approver(student_id, other_student_id)
    elif approver.get('kind') == 'org_admin' and not _same_org(student_id, other_student_id):
        raise PeerConnectionError(
            'Connecting with a student outside your school needs a parent or '
            'guardian to approve it. Ask an adult to link their account to yours.'
        )

    return {'mode': policy.approval_mode, 'approver': approver}


# ---------------------------------------------------------------------------
# The connection lifecycle
# ---------------------------------------------------------------------------

def _get_connection(connection_id: str) -> Dict[str, Any]:
    rows = _admin().table('peer_connections').select('*') \
        .eq('id', connection_id).limit(1).execute().data or []
    if not rows:
        raise PeerConnectionError('Connection not found')
    return rows[0]


def _require_participant(connection: Dict[str, Any], user_id: str) -> str:
    """Return the OTHER student's id, or refuse. Membership is the gate."""
    if connection['requester_id'] == user_id:
        return connection['addressee_id']
    if connection['addressee_id'] == user_id:
        return connection['requester_id']
    raise PeerConnectionError('Connection not found')


def _verify_pool(requester_id: str, peer_id: str, source: str) -> None:
    """A request by id must come from a pool the platform vouches for.

    'classmates': the two share an ACTIVE class, the same definition the class
    student chat uses (utils.class_membership). 'school': same org, and the
    school turned its pool on. Anything else is a directory lookup wearing a
    different name, and there is no directory here.
    """
    from utils import class_membership as cm

    if source == SOURCE_CLASSMATES:
        if cm.student_class_ids(requester_id) & cm.student_class_ids(peer_id):
            return
        raise PeerConnectionError('You can only add classmates this way.')

    if source == SOURCE_SCHOOL:
        requester_policy = policy_svc.effective_policy(requester_id)
        settings = policy_svc.org_friends_settings(requester_policy.organization_id)
        if settings['school_pool'] and _same_org(requester_id, peer_id):
            return
        raise PeerConnectionError('Your school has not turned on school-wide Friends.')

    raise PeerConnectionError('That is not a way to add a friend.')


def request(requester_id: str, *, code: Optional[str] = None,
            peer_id: Optional[str] = None, source: Optional[str] = None,
            acting_user_id: Optional[str] = None) -> Dict[str, Any]:
    """Start a connection: by another student's share code, or by naming a
    student from a vetted pool.

    ``acting_user_id`` is the guardian when the request is made on the
    student's behalf through student scope; the row records them and the
    source is 'parent', which the other family's policy always admits.
    """
    _require_eligible(requester_id)
    delegated = bool(acting_user_id and acting_user_id != requester_id)

    if code:
        addressee_id = _resolve_code(code)
        if not addressee_id:
            raise PeerConnectionError(CODE_REFUSED)
        pool = SOURCE_LINK if source == SOURCE_LINK else SOURCE_CODE
        refusal = CODE_REFUSED
    elif peer_id:
        if source not in PEER_ID_SOURCES:
            raise PeerConnectionError('That is not a way to add a friend.')
        try:
            addressee_id = pgrst_uuid(peer_id, 'peer_id')
        except Exception as _exc:
            raise PeerConnectionError('Student not found') from _exc
        if addressee_id == requester_id:
            raise PeerConnectionError('That is you.')
        _verify_pool(requester_id, addressee_id, source)
        pool = source
        refusal = None   # a classmate is someone you already know
    else:
        raise PeerConnectionError('Enter a code or pick a classmate.')

    if addressee_id == requester_id:
        raise PeerConnectionError('That is your own code.')

    if pa.is_blocked_between(requester_id, addressee_id):
        raise PeerConnectionError(refusal or 'Student not found')

    # The other family's rules. Off means unreachable; a source they did not
    # allow means unreachable by THIS route. A code holder with Friends off is
    # indistinguishable from an invalid code on purpose.
    addressee_policy = policy_svc.effective_policy(addressee_id)
    recorded_source = SOURCE_PARENT if delegated else pool
    if not addressee_policy.enabled:
        raise PeerConnectionError(
            refusal or f"{_display_name(addressee_id)}'s family hasn't turned on Friends yet.")
    if not addressee_policy.allows_source(recorded_source):
        raise PeerConnectionError(
            refusal or f"{_display_name(addressee_id)}'s family only accepts "
                       "requests another way.")

    admin = _admin()
    existing = admin.table('peer_connections').select('id, status').or_(
        f'and(requester_id.eq.{pgrst_uuid(requester_id, "requester_id")},'
        f'addressee_id.eq.{pgrst_uuid(addressee_id, "addressee_id")}),'
        f'and(requester_id.eq.{pgrst_uuid(addressee_id, "addressee_id")},'
        f'addressee_id.eq.{pgrst_uuid(requester_id, "requester_id")})'
    ).limit(1).execute().data or []
    if existing:
        status = existing[0]['status']
        if status == 'active':
            raise PeerConnectionError('You are already friends.')
        if status in ('pending_addressee', 'pending_approval'):
            raise PeerConnectionError('There is already a request between you.')
        # 'declined' / 'revoked': a previous answer was no. Reusing the row
        # rather than inserting keeps the pair unique and makes the retry
        # visible to both sides' approvers instead of looking brand new.
        conn = admin.table('peer_connections').update({
            'requester_id': requester_id,
            'addressee_id': addressee_id,
            'status': 'pending_addressee',
            'source': recorded_source,
            'created_by_user_id': acting_user_id if delegated else None,
            'updated_at': _iso(_now()),
            'responded_at': None,
            'activated_at': None,
            'revoked_at': None,
            'revoked_by': None,
            'revoke_reason': None,
        }).eq('id', existing[0]['id']).execute().data[0]
        admin.table('peer_connection_approvals').delete() \
            .eq('connection_id', conn['id']).execute()
    else:
        conn = admin.table('peer_connections').insert({
            'requester_id': requester_id,
            'addressee_id': addressee_id,
            'status': 'pending_addressee',
            'source': recorded_source,
            'created_by_user_id': acting_user_id if delegated else None,
        }).execute().data[0]

    if code:
        # The code has done its job. Retiring it here means a code handed to one
        # person cannot be reused by whoever else saw it over their shoulder.
        admin.table('peer_connect_codes').update({'revoked_at': _iso(_now())}) \
            .eq('user_id', addressee_id).is_('revoked_at', 'null').execute()

    requester_name = _display_name(requester_id)
    who = f"{requester_name}'s parent" if delegated else requester_name
    if addressee_policy.is_dependent:
        # No login of their own; the request is answered by their parent, from
        # the Family tab, on their behalf.
        for guardian_id in _guardians_of(addressee_id):
            _notify(guardian_id, 'peer_connection_request',
                    f"A friend request for {_display_name(addressee_id)}",
                    f"{who} sent {_display_name(addressee_id)} a friend request.",
                    link='/family')
    else:
        _notify(addressee_id, 'peer_connection_request',
                'A student wants to be friends',
                f"{who} sent you a friend request.",
                link='/connections')

    return conn


def _decline(admin, connection_id: str) -> Dict[str, Any]:
    """A request that ends before anyone's adult is asked: the student said
    no, or a side turned out unable to consent."""
    return admin.table('peer_connections').update({
        'status': 'declined',
        'responded_at': _iso(_now()),
        'updated_at': _iso(_now()),
    }).eq('id', connection_id).execute().data[0]


def respond_to_request(addressee_id: str, connection_id: str,
                       accept: bool,
                       acting_user_id: Optional[str] = None) -> Dict[str, Any]:
    """The receiving student accepts or declines.

    Accepting settles each side against its family's policy. Where both are
    'auto' the connection is active before this returns; where a side is
    'ask_first' it waits for that adult, as every connection did before
    2026-09-16. Where a side's policy is off -- it was on when the request
    was made and is not now -- the request is declined outright.

    ``acting_user_id`` is the guardian when a parent accepts on a child's
    behalf. Their own side's 'ask_first' is satisfied by the act: the parent
    just said yes, and asking them again would be a form for its own sake.
    """
    conn = _get_connection(connection_id)
    if conn['addressee_id'] != addressee_id:
        raise PeerConnectionError('Connection not found')
    if conn['status'] != 'pending_addressee':
        raise PeerConnectionError('This request has already been answered.')

    admin = _admin()
    if not accept:
        return _decline(admin, connection_id)

    _require_eligible(addressee_id)
    requester_id = conn['requester_id']

    # Resolve BOTH sides before writing either. If one side cannot consent,
    # the connection must not sit half-consented in a parent's inbox -- that
    # would ask a real parent to approve something that can never complete,
    # and their "yes" would be on record for a link that never formed.
    try:
        sides = {
            addressee_id: _side_consent(addressee_id, requester_id),
            requester_id: _side_consent(requester_id, addressee_id),
        }
    except PeerConnectionError:
        _decline(admin, connection_id)
        raise

    admin.table('peer_connections').update({
        'status': 'pending_approval',
        'responded_at': _iso(_now()),
        'updated_at': _iso(_now()),
    }).eq('id', connection_id).execute()

    delegated = bool(acting_user_id and acting_user_id != addressee_id)
    for student_id, side in sides.items():
        approver = side['approver']
        other = requester_id if student_id == addressee_id else addressee_id
        row = {
            'connection_id': connection_id,
            'student_id': student_id,
            'approver_id': approver['user_id'],
            'approver_kind': approver['kind'],
        }
        parent_is_answering = (delegated and student_id == addressee_id
                               and pa.is_parent_of(acting_user_id, student_id))
        settled = side['mode'] == 'auto' or parent_is_answering
        if settled:
            row.update({
                'status': 'approved',
                'method': 'explicit' if parent_is_answering else 'policy',
                'decided_by_user_id': acting_user_id if parent_is_answering else None,
                'responded_at': _iso(_now()),
            })
        else:
            row.update({'status': 'pending', 'method': 'explicit'})
        admin.table('peer_connection_approvals').insert(row).execute()
        if settled:
            continue

        _notify(
            approver['user_id'], 'peer_connection_needs_approval',
            'A friend request needs your approval',
            f"{_display_name(student_id)} wants to be friends with "
            f"{_display_name(other)}. They would be able to see and comment on "
            f"each other's work.",
            link='/family' if approver['kind'] == 'parent' else '/connections/approvals',
        )

        # And out of band. The in-app notification only reaches an approver who
        # signs in, and many parents never do -- the child's account is the one
        # in daily use. Without the email the request would sit unanswered and
        # look, to two students, like a silent refusal.
        _email_approver(approver, student_id, other)

    return _maybe_activate(connection_id)


def _email_approver(approver: Dict[str, Any], student_id: str,
                    other_id: str) -> None:
    """Send the approval request email. Best-effort, like _notify: the in-app
    notification is already written, so a bounced email must not roll back an
    accept the two students already made."""
    rows = _admin().table('users').select('id, email, first_name, display_name') \
        .eq('id', approver['user_id']).limit(1).execute().data or []
    if not rows or not rows[0].get('email'):
        return
    adult = rows[0]
    try:
        from services.email_service import email_service
        email_service.send_peer_connection_approval_email(
            approver_email=adult['email'],
            approver_name=adult.get('first_name') or adult.get('display_name') or 'there',
            child_name=_display_name(student_id),
            peer_name=_display_name(other_id),
            approver_kind=approver.get('kind') or 'parent',
        )
    except Exception as e:
        logger.warning("[peer-connections] approval email to %s failed: %s",
                       str(approver.get('user_id'))[:8], e)


def approver_decision(approver_id: str, connection_id: str,
                      approve: bool) -> Dict[str, Any]:
    """An adult answers for one side.

    The recorded approver may answer, and so may any current parent of that
    side's student: a policy set by one parent must not lock the other parent
    out of a request the family is being asked about. Who actually answered
    is stamped on the row.
    """
    admin = _admin()
    rows = admin.table('peer_connection_approvals').select('*') \
        .eq('connection_id', connection_id).eq('status', 'pending') \
        .execute().data or []

    approval = None
    for row in rows:
        if row.get('approver_id') == approver_id or pa.is_parent_of(approver_id, row['student_id']):
            approval = row
            break
    if approval is None:
        # Either nothing is pending or this adult is not one who may answer.
        # The two are told apart below only for the adult who IS entitled.
        raise PeerConnectionError('Approval request not found')

    conn = _get_connection(connection_id)
    if conn['status'] != 'pending_approval':
        raise PeerConnectionError('This request is no longer awaiting approval.')

    admin.table('peer_connection_approvals').update({
        'status': 'approved' if approve else 'declined',
        'decided_by_user_id': approver_id,
        'responded_at': _iso(_now()),
    }).eq('id', approval['id']).execute()

    if not approve:
        # One "no" ends it. There is no majority here.
        conn = admin.table('peer_connections').update({
            'status': 'declined',
            'updated_at': _iso(_now()),
        }).eq('id', connection_id).execute().data[0]
        for uid in (conn['requester_id'], conn['addressee_id']):
            _notify(uid, 'peer_connection_declined', 'Friend request not approved',
                    'A parent or guardian did not approve the request.',
                    link='/connections')
        return conn

    return _maybe_activate(connection_id)


def _maybe_activate(connection_id: str) -> Dict[str, Any]:
    """Flip to 'active' only when every side's approval is in.

    The single writer of 'active'. portfolio_access.is_peer_of trusts this
    status and re-derives nothing, so this function is the complete answer to
    what was required before two children could see each other's work: both
    students said yes, and both students' own accountable adults said yes --
    on file in advance under a policy, or explicitly for this request.
    """
    admin = _admin()
    approvals = admin.table('peer_connection_approvals') \
        .select('status, student_id, method, decided_by_user_id') \
        .eq('connection_id', connection_id).execute().data or []

    if len(approvals) < 2 or any(a['status'] != 'approved' for a in approvals):
        return _get_connection(connection_id)

    conn = admin.table('peer_connections').update({
        'status': 'active',
        'activated_at': _iso(_now()),
        'updated_at': _iso(_now()),
    }).eq('id', connection_id).execute().data[0]

    for uid in (conn['requester_id'], conn['addressee_id']):
        other = conn['addressee_id'] if uid == conn['requester_id'] else conn['requester_id']
        _notify(uid, 'peer_connection_approved', 'You are now friends',
                f"You and {_display_name(other)} can now see and comment on "
                f"each other's work.",
                link='/connections')

    _tell_parents_after_the_fact(conn, approvals)
    return conn


def _guardians_of(student_id: str) -> List[str]:
    """Every guardian of one student, through all three link types."""
    from utils.class_membership import guardians_by_student
    return sorted(guardians_by_student([student_id]).get(student_id) or ())


def _tell_parents_after_the_fact(conn: Dict[str, Any],
                                 approvals: List[Dict[str, Any]]) -> None:
    """Tell each side's parents that a friend was added.

    The policy model moves the parent off the critical path, and this is the
    other half of that bargain: they are told every time, with a link to the
    Family tab where the list and the off switch live. A parent who answered
    THIS request explicitly already knows and is skipped. Best-effort, like
    every notification here: the connection is already active.
    """
    answered = {a.get('decided_by_user_id') for a in approvals if a.get('decided_by_user_id')}
    for student_id in (conn['requester_id'], conn['addressee_id']):
        other = conn['addressee_id'] if student_id == conn['requester_id'] else conn['requester_id']
        try:
            guardians = [g for g in _guardians_of(student_id) if g not in answered]
            if not guardians:
                continue
            child_name = _display_name(student_id)
            peer_name = _display_name(other)
            for guardian_id in guardians:
                _notify(guardian_id, 'peer_friend_added',
                        f"{child_name} added a friend",
                        f"{child_name} and {peer_name} are now friends on Optio. "
                        f"They can see and comment on each other's work.",
                        link='/family')
            _email_friend_added(guardians, child_name, peer_name)
        except Exception as e:  # noqa: BLE001
            logger.warning("[peer-connections] after-the-fact notice for %s failed: %s",
                           str(student_id)[:8], e)


def _email_friend_added(guardian_ids: List[str], child_name: str,
                        peer_name: str) -> None:
    """Email the guardians who will not get it any other way.

    Org parents get a line in the school's weekly digest; platform parents
    have no digest, so this is their only out-of-band signal. A guardian with
    an org on their account is skipped here and picked up by the digest.
    """
    from repositories.peer_policy_repository import PeerPolicyRepository
    people = PeerPolicyRepository().users_by_ids(
        guardian_ids, 'id, email, first_name, display_name, organization_id')
    for guardian_id in guardian_ids:
        adult = people.get(guardian_id) or {}
        if adult.get('organization_id') or not adult.get('email'):
            continue
        try:
            from services.email_service import email_service
            email_service.send_peer_friend_added_email(
                parent_email=adult['email'],
                parent_name=adult.get('first_name') or adult.get('display_name') or 'there',
                child_name=child_name,
                peer_name=peer_name,
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("[peer-connections] friend-added email to %s failed: %s",
                           str(guardian_id)[:8], e)


def revoke(user_id: str, connection_id: str,
           reason: Optional[str] = None) -> Dict[str, Any]:
    """End a connection.

    Available to either student, to either student's parents, and to either
    side's recorded approver. A parent who consented -- by policy or by
    answering -- must be able to withdraw as easily as they consented;
    consent that can only be granted is not consent. Mirrors the symmetry
    portfolio_access documents for publishing.
    """
    conn = _get_connection(connection_id)
    admin = _admin()

    allowed = user_id in (conn['requester_id'], conn['addressee_id'])
    if not allowed:
        allowed = (pa.is_parent_of(user_id, conn['requester_id'])
                   or pa.is_parent_of(user_id, conn['addressee_id']))
    if not allowed:
        approvers = admin.table('peer_connection_approvals') \
            .select('approver_id').eq('connection_id', connection_id) \
            .execute().data or []
        allowed = any(a.get('approver_id') == user_id for a in approvers)
    if not allowed:
        raise PeerConnectionError('Connection not found')

    if conn['status'] in ('revoked', 'declined'):
        return conn

    return admin.table('peer_connections').update({
        'status': 'revoked',
        'revoked_at': _iso(_now()),
        'revoked_by': user_id,
        'revoke_reason': reason,
        'updated_at': _iso(_now()),
    }).eq('id', connection_id).execute().data[0]


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

def _peer_profile(user_id: str) -> Dict[str, Any]:
    """The only shape of another student a peer ever sees.

    Display name and avatar, nothing else. Not email, not legal first/last
    name, not date of birth -- a connection is consent to show your work, not
    your identity documents. routes/public.py makes the same call for public
    portfolios; this keeps peers no better informed than the public view.
    """
    rows = _admin().table('users').select('id, display_name, first_name, avatar_url') \
        .eq('id', user_id).limit(1).execute().data or []
    if not rows:
        return {'id': user_id, 'display_name': 'A student', 'avatar_url': None}
    u = rows[0]
    profile = {
        'id': u['id'],
        'display_name': u.get('display_name') or u.get('first_name') or 'A student',
        'avatar_url': u.get('avatar_url'),
    }
    # The avatar lives in a private bucket; a peer gets the expiring twin.
    from utils.storage_urls import sign_in_place
    sign_in_place([profile], ['avatar_url'])
    return profile


def _display_name(user_id: str) -> str:
    return _peer_profile(user_id)['display_name']


def list_connections(user_id: str) -> Dict[str, Any]:
    """Everything this student needs to render the friends page."""
    admin = _admin()
    rows = admin.table('peer_connections').select('*').or_(
        f'requester_id.eq.{pgrst_uuid(user_id, "user_id")},'
        f'addressee_id.eq.{pgrst_uuid(user_id, "user_id")}'
    ).execute().data or []

    active, incoming, outgoing, awaiting = [], [], [], []
    for conn in rows:
        other_id = (conn['addressee_id'] if conn['requester_id'] == user_id
                    else conn['requester_id'])
        item = {
            'id': conn['id'],
            'status': conn['status'],
            'peer': _peer_profile(other_id),
            'source': conn.get('source'),
            'created_at': conn['created_at'],
            'activated_at': conn.get('activated_at'),
        }
        if conn['status'] == 'active':
            active.append(item)
        elif conn['status'] == 'pending_addressee':
            (incoming if conn['addressee_id'] == user_id else outgoing).append(item)
        elif conn['status'] == 'pending_approval':
            awaiting.append(item)

    return {
        'active': active,
        'incoming': incoming,
        'outgoing': outgoing,
        'awaiting_approval': awaiting,
    }


def active_peer_ids(user_id: str) -> List[str]:
    """Ids of everyone this student is actively connected to."""
    rows = _admin().table('peer_connections').select(
        'requester_id, addressee_id'
    ).eq('status', 'active').or_(
        f'requester_id.eq.{pgrst_uuid(user_id, "user_id")},'
        f'addressee_id.eq.{pgrst_uuid(user_id, "user_id")}'
    ).execute().data or []

    peers = [
        r['addressee_id'] if r['requester_id'] == user_id else r['requester_id']
        for r in rows
    ]
    # A block hides the feed as well as the comment box, without unwinding the
    # connection and asking two parents to approve it again.
    return [p for p in peers if not pa.is_blocked_between(user_id, p)]


def feed(user_id: str, limit: int = 20,
         cursor: Optional[str] = None) -> Dict[str, Any]:
    """The student's own work and their connected peers' work, interleaved.

    This is why the page is called "Feed" and not "My Feed": once a student has
    connections it stops being only theirs.

    The confidentiality scope is the load-bearing argument. ``is_confidential``
    is the flag a student sets to hide an item from their observers, and on
    their own feed they still see it (greyed, so they can unhide it). Widening
    the feed to peers must not widen that: ``confidential_ok_for={user_id}``
    means my hidden items stay visible to me and my classmate's hidden items are
    dropped before assembly, not filtered at render time where a future caller
    could forget.

    ``author_shape='peer'`` keeps every author on this feed to the shape
    _peer_profile promises: display name and avatar, never a legal surname.
    """
    from services.activity_feed_service import build_activity_feed

    peers = active_peer_ids(user_id)
    return {
        **build_activity_feed(
            _admin(),
            [user_id] + peers,
            limit=limit,
            cursor=cursor,
            confidential_ok_for={user_id},
            author_shape='peer',
        ),
        'peer_count': len(peers),
    }


def pending_approvals(approver_id: str) -> List[Dict[str, Any]]:
    """Connection approvals waiting on this adult: the ones naming them, plus
    any for a child they are a parent of (so a co-parent can answer)."""
    from repositories.peer_connection_repository import PeerConnectionRepository
    from utils.class_membership import children_of_parent

    rows = PeerConnectionRepository().pending_approvals_for(
        approver_id, children_of_parent(approver_id))

    out = []
    for row in rows:
        try:
            conn = _get_connection(row['connection_id'])
        except PeerConnectionError:
            # unreadable connection: skip it
            continue
        if conn['status'] != 'pending_approval':
            continue
        other_id = (conn['addressee_id'] if conn['requester_id'] == row['student_id']
                    else conn['requester_id'])
        out.append({
            'id': row['id'],
            'connection_id': row['connection_id'],
            'approver_kind': row['approver_kind'],
            'child': _peer_profile(row['student_id']),
            'peer': _peer_profile(other_id),
            'requested_at': row['created_at'],
        })
    return out


def approved_connections(approver_id: str) -> List[Dict[str, Any]]:
    """Live connections this adult approved, so they can withdraw one.

    Approval is not the end of a parent's involvement, and a consent screen that
    disappears the moment you click Approve leaves them with nothing to manage
    afterwards. Scoped to connections THIS adult approved -- by answering, or
    by the policy they set. A parent sees their own child's links and nothing
    about the other family beyond who their child is connected to. The
    per-child list on the Family tab (list_connections through student scope)
    is the fuller view; this one serves the school-admin approvals page.
    """
    admin = _admin()
    rows = admin.table('peer_connection_approvals').select(
        'id, connection_id, student_id, approver_kind, responded_at'
    ).eq('approver_id', approver_id).eq('status', 'approved').execute().data or []

    out = []
    for row in rows:
        try:
            conn = _get_connection(row['connection_id'])
        except PeerConnectionError:
            # unreadable connection: skip it
            continue
        if conn['status'] != 'active':
            continue
        other_id = (conn['addressee_id'] if conn['requester_id'] == row['student_id']
                    else conn['requester_id'])
        out.append({
            'connection_id': row['connection_id'],
            'approver_kind': row['approver_kind'],
            'child': _peer_profile(row['student_id']),
            'peer': _peer_profile(other_id),
            'approved_at': row['responded_at'],
            'connected_since': conn.get('activated_at'),
        })
    return out


def peer_activity(student_id: str, days: int = 30) -> Dict[str, Any]:
    """What happened between this student and their friends lately, for the
    parent's oversight view: friends added and removed, comments given and
    received. Read-only. Reactions join this in phase 2."""
    from repositories.peer_connection_repository import PeerConnectionRepository
    from repositories.peer_policy_repository import PeerPolicyRepository
    from utils.storage_urls import sign_in_place

    days = max(1, min(int(days or 30), 90))
    since = _iso(_now() - timedelta(days=days))
    repo = PeerConnectionRepository()
    connections = repo.connections_touching(student_id, since)
    comments = repo.comments_involving(student_id, since)

    other_ids = set()
    for c in connections:
        other_ids.add(c['addressee_id'] if c['requester_id'] == student_id else c['requester_id'])
    for c in comments:
        other_ids.add(c['author_id'] if c['author_id'] != student_id else c['student_id'])
    other_ids.discard(student_id)

    people = PeerPolicyRepository().users_by_ids(
        list(other_ids) + [student_id], 'id, display_name, first_name, avatar_url')
    profiles = {
        uid: {'id': uid,
              'display_name': u.get('display_name') or u.get('first_name') or 'A student',
              'avatar_url': u.get('avatar_url')}
        for uid, u in people.items()
    }
    sign_in_place(list(profiles.values()), ['avatar_url'])

    def _profile(uid):
        return profiles.get(uid) or {'id': uid, 'display_name': 'A student', 'avatar_url': None}

    return {
        'since': since,
        'days': days,
        'connections': [
            {
                'id': c['id'],
                'status': c['status'],
                'source': c.get('source'),
                'peer': _profile(c['addressee_id'] if c['requester_id'] == student_id
                                 else c['requester_id']),
                'created_at': c.get('created_at'),
                'activated_at': c.get('activated_at'),
                'revoked_at': c.get('revoked_at'),
                'revoke_reason': c.get('revoke_reason'),
            }
            for c in connections
        ],
        'comments': [
            {
                'id': c['id'],
                'direction': 'given' if c['author_id'] == student_id else 'received',
                'peer': _profile(c['author_id'] if c['author_id'] != student_id else c['student_id']),
                'text': c.get('comment_text'),
                'created_at': c.get('created_at'),
                'hidden_at': c.get('hidden_at'),
                'learning_event_id': c.get('learning_event_id'),
                'task_completion_id': c.get('task_completion_id'),
                'quest_id': c.get('quest_id'),
            }
            for c in comments
        ],
    }


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

def add_comment(author_id: str, student_id: str, text: str,
                learning_event_id: Optional[str] = None,
                task_completion_id: Optional[str] = None,
                quest_id: Optional[str] = None) -> Dict[str, Any]:
    """Leave a comment on a connected peer's work.

    The gate is is_peer_of, which is also what let the author see the work in
    the first place -- so a revoked connection or a fresh block silences the
    comment box on the next request, with no separate permission to keep in
    sync. On top of that, the work owner's family decides whether friends
    may comment at all (friends_can).
    """
    if not pa.is_peer_of(author_id, student_id):
        raise PeerConnectionError('You are not connected with this student.')

    if 'comment' not in policy_svc.effective_policy(student_id).friends_can:
        raise PeerConnectionError("This student's family has turned off comments.")

    text = (text or '').strip()
    if not text:
        raise PeerConnectionError('Comment cannot be empty.')
    if len(text) > MAX_COMMENT_LENGTH:
        raise PeerConnectionError(
            f'Comment must be {MAX_COMMENT_LENGTH} characters or fewer.')

    targets = [t for t in (learning_event_id, task_completion_id, quest_id) if t]
    if len(targets) != 1:
        raise PeerConnectionError('A comment must be on exactly one item.')

    row = _admin().table('peer_comments').insert({
        'author_id': author_id,
        'student_id': student_id,
        'learning_event_id': learning_event_id,
        'task_completion_id': task_completion_id,
        'quest_id': quest_id,
        'comment_text': text,
    }).execute().data[0]

    _notify(student_id, 'peer_comment', 'A friend commented on your work',
            f"{_display_name(author_id)} left a comment.",
            link='/connections')

    return {**row, 'author': _peer_profile(author_id)}


def list_comments(caller_id: str, student_id: str,
                  learning_event_id: Optional[str] = None,
                  task_completion_id: Optional[str] = None,
                  quest_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Peer comments on one item.

    Readable by the student whose work it is, by a connected peer, and by the
    adults who can already see that student's portfolio -- a parent asking
    "what are other kids saying to my child" needs an answer, and this is it.
    """
    if caller_id != student_id and not pa.can_view_portfolio(caller_id, student_id):
        raise PeerConnectionError('Not authorized')

    query = _admin().table('peer_comments').select('*') \
        .eq('student_id', student_id).is_('hidden_at', 'null')
    if learning_event_id:
        query = query.eq('learning_event_id', learning_event_id)
    elif task_completion_id:
        query = query.eq('task_completion_id', task_completion_id)
    elif quest_id:
        query = query.eq('quest_id', quest_id)

    rows = query.order('created_at', desc=False).execute().data or []

    # A block hides past comments as well as future ones. Leaving them visible
    # would make blocking feel like it half-worked.
    return [
        {**r, 'author': _peer_profile(r['author_id'])}
        for r in rows
        if not pa.is_blocked_between(caller_id, r['author_id'])
    ]


def delete_comment(caller_id: str, comment_id: str) -> None:
    """Remove a comment.

    The author may delete their own. The student whose work it is may remove
    anything left on their work -- they do not have to justify it or wait for a
    moderator, which is the difference between a report queue and control over
    your own page.
    """
    admin = _admin()
    rows = admin.table('peer_comments').select('id, author_id, student_id') \
        .eq('id', comment_id).limit(1).execute().data or []
    if not rows:
        raise PeerConnectionError('Comment not found')
    comment = rows[0]

    if caller_id not in (comment['author_id'], comment['student_id']):
        raise PeerConnectionError('Comment not found')

    admin.table('peer_comments').delete().eq('id', comment_id).execute()


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def _notify(user_id: str, ntype: str, title: str, message: str,
            link: Optional[str] = None) -> None:
    """Best-effort notification. A delivery failure must not fail the action.

    Losing a notification is a bad experience; failing the parent's approval
    click because a push token expired is a broken feature.
    """
    try:
        from services.notification_service import NotificationService
        NotificationService().create_notification(
            user_id=user_id, notification_type=ntype,
            title=title, message=message, link=link,
        )
    except Exception as e:
        logger.warning("[peer-connections] notification %s to %s failed: %s",
                       ntype, str(user_id)[:8], e)
