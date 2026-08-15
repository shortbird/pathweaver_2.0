"""Peer connections: two students, both families' consent, one mutual link.

The safety argument for this feature lives in four places, and all four are in
this module so they can be read together rather than reconstructed from six
route handlers:

  * ``age_check`` -- a neutral, one-shot age screen. It records the answer it is
    given, including "under 13", and locks it. An age screen that rejects the
    honest answer and leaves the form open is not a gate, it is a hint.
  * ``request_by_code`` -- discovery without a directory. Students exchange a
    short code in person; nobody can look a child up by name.
  * ``_resolve_approver`` -- one accountable adult per side, never one family
    consenting for another, and the school standing in only where the school
    exception actually applies.
  * ``_maybe_activate`` -- the single place a connection becomes 'active', so
    there is exactly one answer to "what did we require before these two
    children could see each other's work".

Everything downstream (portfolio_access.is_peer_of, the comment endpoints) reads
the resulting status and re-derives nothing.

ADMIN CLIENT USAGE: this service uses get_supabase_admin_client() throughout.
Every operation is inherently cross-user -- a student writing a row about
another student, a parent answering for a child, a service resolving who a
child's accountable adult is -- and none of it is expressible as the caller's
own RLS scope. Access control is the explicit gating in each function: the
caller must be a participant (``_require_participant``) or the named approver
(``_require_approver``) of the row they are touching.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import secrets

from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.validation.sanitizers import pgrst_uuid
from utils import portfolio_access as pa

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

# Eligibility states returned to the frontend. The entry point is shown for
# every state except 'under_13' -- an ineligible student should meet a clear,
# warm explanation, not a menu item that silently does nothing.
ELIGIBLE = 'eligible'
NEEDS_DOB = 'needs_dob'
UNDER_13 = 'under_13'
NEEDS_PARENT_DOB = 'needs_parent_dob'


class PeerConnectionError(Exception):
    """A rule in this module said no. The message is user-facing."""


def _admin():
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Eligibility and the age screen
# ---------------------------------------------------------------------------

def eligibility(user_id: str) -> Dict[str, Any]:
    """What state is this student in with respect to peer connections?

    Returns {'state', 'reason'}. The frontend shows the entry point for every
    state but UNDER_13; the states differ in what the student is asked to do
    next, which is the distinction the old portfolio gate got wrong by showing
    an under-18 explanation to people whose age was simply unknown.
    """
    user = _admin().table('users').select(
        'id, date_of_birth, date_of_birth_locked_at, is_dependent'
    ).eq('id', user_id).limit(1).execute().data
    user = user[0] if user else None

    if not user:
        return {'state': UNDER_13, 'reason': 'Account not found'}

    if not user.get('date_of_birth'):
        # A dependent cannot set their own date of birth (their parent manages
        # it), so pointing them at the age screen would be a dead end.
        if user.get('is_dependent'):
            return {
                'state': NEEDS_PARENT_DOB,
                'reason': ('Your parent needs to add your date of birth before '
                           'you can connect with other students.'),
            }
        return {'state': NEEDS_DOB, 'reason': 'We need your date of birth first.'}

    if pa.is_under_13(user):
        return {
            'state': UNDER_13,
            'reason': ('Connecting with other students is available once '
                       'you turn 13.'),
        }

    return {'state': ELIGIBLE, 'reason': None}


def age_check(user_id: str, dob_str: str) -> Dict[str, Any]:
    """Record a self-attested date of birth, once, and answer eligibility.

    This is deliberately NOT ``PUT /api/users/profile``. That endpoint raises a
    validation error on an under-13 date, which for a profile editor is right
    and for an age screen is precisely backwards: the child gets an error and a
    form still waiting for input, so they try 2010 instead. Here the honest
    answer is accepted, stored, and locked, and the student is told no.

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
    except (ValueError, TypeError):
        raise PeerConnectionError('Please enter a valid date of birth.')

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
        str(user_id)[:8], 'under_13' if under_13 else 'eligible'
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

    return eligibility(user_id)


def _require_eligible(user_id: str) -> None:
    state = eligibility(user_id)
    if state['state'] != ELIGIBLE:
        raise PeerConnectionError(state['reason'] or 'Not eligible')


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
# Approver resolution
# ---------------------------------------------------------------------------

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
    admin = _admin()
    orgs = admin.table('users').select('id, organization_id') \
        .in_('id', [student_id, other_student_id]).execute().data or []
    org_by_user = {r['id']: r.get('organization_id') for r in orgs}
    a_org, b_org = org_by_user.get(student_id), org_by_user.get(other_student_id)

    if a_org and a_org == b_org:
        return approver

    raise PeerConnectionError(
        'Connecting with a student outside your school needs a parent or '
        'guardian to approve it. Ask an adult to link their account to yours.'
    )


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


def request_by_code(requester_id: str, code: str) -> Dict[str, Any]:
    """Start a connection by entering another student's share code."""
    _require_eligible(requester_id)

    addressee_id = _resolve_code(code)
    if not addressee_id:
        # Deliberately identical message for "no such code" and "expired": a
        # differentiated error turns the code field into an oracle for probing
        # which codes exist.
        raise PeerConnectionError('That code is not valid or has expired.')

    if addressee_id == requester_id:
        raise PeerConnectionError('That is your own code.')

    if pa.is_under_13_by_id(addressee_id):
        raise PeerConnectionError('That code is not valid or has expired.')

    if pa.is_blocked_between(requester_id, addressee_id):
        raise PeerConnectionError('That code is not valid or has expired.')

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
            raise PeerConnectionError('You are already connected.')
        if status in ('pending_addressee', 'pending_approval'):
            raise PeerConnectionError('There is already a request between you.')
        # 'declined' / 'revoked': a previous answer was no. Reusing the row
        # rather than inserting keeps the pair unique and makes the retry
        # visible to both sides' approvers instead of looking brand new.
        conn = admin.table('peer_connections').update({
            'requester_id': requester_id,
            'addressee_id': addressee_id,
            'status': 'pending_addressee',
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
        }).execute().data[0]

    # The code has done its job. Retiring it here means a code handed to one
    # person cannot be reused by whoever else saw it over their shoulder.
    admin.table('peer_connect_codes').update({'revoked_at': _iso(_now())}) \
        .eq('user_id', addressee_id).is_('revoked_at', 'null').execute()

    _notify(addressee_id, 'peer_connection_request',
            'A student wants to connect',
            f"{_display_name(requester_id)} sent you a connection request.",
            link='/connections')

    return conn


def respond_to_request(addressee_id: str, connection_id: str,
                       accept: bool) -> Dict[str, Any]:
    """The receiving student accepts or declines.

    Accepting does not connect anyone. It moves the request to the grown-ups,
    and creates one pending approval per side.
    """
    conn = _get_connection(connection_id)
    if conn['addressee_id'] != addressee_id:
        raise PeerConnectionError('Connection not found')
    if conn['status'] != 'pending_addressee':
        raise PeerConnectionError('This request has already been answered.')

    admin = _admin()
    if not accept:
        updated = admin.table('peer_connections').update({
            'status': 'declined',
            'responded_at': _iso(_now()),
            'updated_at': _iso(_now()),
        }).eq('id', connection_id).execute().data[0]
        return updated

    _require_eligible(addressee_id)

    requester_id = conn['requester_id']

    # Resolve BOTH approvers before writing either. If one side has no eligible
    # approver, the connection must not sit half-consented in a parent's inbox
    # -- that would ask a real parent to approve something that can never
    # complete, and their "yes" would be on record for a link that never formed.
    approvers = {
        addressee_id: _resolve_approver(addressee_id, requester_id),
        requester_id: _resolve_approver(requester_id, addressee_id),
    }

    updated = admin.table('peer_connections').update({
        'status': 'pending_approval',
        'responded_at': _iso(_now()),
        'updated_at': _iso(_now()),
    }).eq('id', connection_id).execute().data[0]

    for student_id, approver in approvers.items():
        admin.table('peer_connection_approvals').insert({
            'connection_id': connection_id,
            'student_id': student_id,
            'approver_id': approver['user_id'],
            'approver_kind': approver['kind'],
        }).execute()

        other = requester_id if student_id == addressee_id else addressee_id
        _notify(
            approver['user_id'], 'peer_connection_needs_approval',
            'A connection needs your approval',
            f"{_display_name(student_id)} wants to connect with "
            f"{_display_name(other)}. They would be able to see and comment on "
            f"each other's work.",
            link='/connections/approvals',
        )

        # And out of band. The in-app notification only reaches an approver who
        # signs in, and many parents never do -- the child's account is the one
        # in daily use. Without the email the request would sit unanswered and
        # look, to two students, like a silent refusal.
        _email_approver(approver, student_id, other)

    return updated


def _email_approver(approver: Dict[str, Any], student_id: str,
                    other_id: str) -> None:
    """Best-effort approval email. A send failure must not fail the accept.

    The in-app notification is already written by the time this runs, so the
    request is never lost -- worst case the approver has to find it by signing
    in, which is exactly where they were before this email existed.
    """
    try:
        rows = _admin().table('users').select('id, email, first_name, display_name') \
            .eq('id', approver['user_id']).limit(1).execute().data or []
        if not rows or not rows[0].get('email'):
            logger.warning(
                "[peer-connections] no email for approver %s; in-app only",
                str(approver['user_id'])[:8])
            return
        row = rows[0]

        from services.email_service import email_service
        email_service.send_peer_connection_approval_email(
            approver_email=row['email'],
            approver_name=(row.get('first_name') or row.get('display_name')
                           or 'there'),
            child_name=_display_name(student_id),
            peer_name=_display_name(other_id),
            approver_kind=approver.get('kind') or 'parent',
        )
    except Exception as e:
        logger.warning("[peer-connections] approval email to %s failed: %s",
                       str(approver.get('user_id'))[:8], e)


def approver_decision(approver_id: str, connection_id: str,
                      approve: bool) -> Dict[str, Any]:
    """A parent (or same-org admin) answers for their own side."""
    admin = _admin()
    rows = admin.table('peer_connection_approvals').select('*') \
        .eq('connection_id', connection_id).eq('approver_id', approver_id) \
        .limit(1).execute().data or []
    if not rows:
        raise PeerConnectionError('Approval request not found')
    approval = rows[0]

    if approval['status'] != 'pending':
        raise PeerConnectionError('You have already answered this request.')

    conn = _get_connection(connection_id)
    if conn['status'] != 'pending_approval':
        raise PeerConnectionError('This request is no longer awaiting approval.')

    admin.table('peer_connection_approvals').update({
        'status': 'approved' if approve else 'declined',
        'responded_at': _iso(_now()),
    }).eq('id', approval['id']).execute()

    if not approve:
        # One "no" ends it. There is no majority here: each approver speaks for
        # one child, and a family declining is not outvoted by the other family.
        admin.table('peer_connections').update({
            'status': 'declined',
            'updated_at': _iso(_now()),
        }).eq('id', connection_id).execute()
        for uid in (conn['requester_id'], conn['addressee_id']):
            _notify(uid, 'peer_connection_declined', 'Connection not approved',
                    'A parent or guardian did not approve this connection.',
                    link='/connections')
        return _get_connection(connection_id)

    return _maybe_activate(connection_id)


def _maybe_activate(connection_id: str) -> Dict[str, Any]:
    """Flip to 'active' only when every side's approval is in.

    The single writer of 'active'. portfolio_access.is_peer_of trusts this
    status and re-derives nothing, so this function is the complete answer to
    what was required before two children could see each other's work: both
    students said yes, and both students' own accountable adults said yes.
    """
    admin = _admin()
    approvals = admin.table('peer_connection_approvals').select('status') \
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
        _notify(uid, 'peer_connection_approved', 'You are connected',
                f"You and {_display_name(other)} can now see and comment on "
                f"each other's work.",
                link='/connections')

    return conn


def revoke(user_id: str, connection_id: str,
           reason: Optional[str] = None) -> Dict[str, Any]:
    """End an active connection.

    Available to either student and to either side's recorded approver. A
    parent who approved must be able to withdraw as easily as they consented;
    consent that can only be granted is not consent. Mirrors the symmetry
    portfolio_access documents for publishing.
    """
    conn = _get_connection(connection_id)
    admin = _admin()

    allowed = user_id in (conn['requester_id'], conn['addressee_id'])
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
    """Everything this student needs to render the connections page."""
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
            'created_at': conn['created_at'],
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
        ),
        'peer_count': len(peers),
    }


def pending_approvals(approver_id: str) -> List[Dict[str, Any]]:
    """Connection approvals waiting on this adult."""
    admin = _admin()
    rows = admin.table('peer_connection_approvals').select(
        'id, connection_id, student_id, approver_kind, created_at'
    ).eq('approver_id', approver_id).eq('status', 'pending').execute().data or []

    out = []
    for row in rows:
        try:
            conn = _get_connection(row['connection_id'])
        except PeerConnectionError:
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
    afterwards. Revocation was available in the API from the start (``revoke``
    accepts either side's recorded approver) but had no surface, which meant a
    parent who changed their mind had to ask support -- a right you can only
    exercise by emailing someone is not much of a right.

    Scoped to connections THIS adult approved. A parent sees their own child's
    links and nothing about the other family beyond who their child is
    connected to.
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
    sync.
    """
    if not pa.is_peer_of(author_id, student_id):
        raise PeerConnectionError('You are not connected with this student.')

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

    _notify(student_id, 'peer_comment', 'A student commented on your work',
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
