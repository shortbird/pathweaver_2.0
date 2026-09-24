"""Who a school notice is for, in one vocabulary.

Three composers grew three vocabularies for the same question. The community
board says school / families / teachers; the announcement send says
students / parents / advisors; the calendar says school / teachers / admins;
and the archive kept a role tuple of its own to decide who reads everything.
A board post that "also notifies" had to translate between the first two by
hand (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, D2), and the composer
greyed a checkbox out to explain the value with nothing behind it.

This module is the translation, once. Stored values do not change -- board
rows keep their audience words and send rows keep their role tokens -- but
every writer reads the words from here and every reader asks here what a
word means.

  BOARD_AUDIENCES     what a post on the community board is FOR.
  RECIPIENT_ROLES     who a send is DELIVERED to (a role token per person).
  recipient_roles_for the roles a board audience notifies, when the poster
                      ticks "also notify". Families are the parents: students
                      read the board and are not the audience of a notice
                      addressed to the people who run the household.
  EVENT_AUDIENCES     what a calendar event is for. 'admins' survives here and
                      nowhere else: a staff-only meeting is a real thing on a
                      calendar and a nonsense on a notice board (a stored
                      board row saying 'admins' is read as 'teachers').
"""

from typing import Dict, List, Tuple

#: The community board's audiences, and the words the office reads for them.
BOARD_AUDIENCES: Tuple[str, ...] = ('school', 'families', 'teachers')
BOARD_LABELS: Dict[str, str] = {
    'school': 'Whole school',
    'families': 'Families',
    'teachers': 'Teachers and staff',
}

#: Retired board values, mapped to their nearest survivor. Mapped rather than
#: dropped: the fallback for an unrecognised audience is 'school', and quietly
#: widening a staff notice to every family is the mistake this column exists
#: to prevent.
LEGACY_BOARD_AUDIENCES: Dict[str, str] = {'admins': 'teachers'}

#: The role tokens a send is delivered to.
RECIPIENT_ROLES: Tuple[str, ...] = ('students', 'parents', 'advisors')
RECIPIENT_LABELS: Dict[str, str] = {
    'students': 'Students',
    'parents': 'Parents',
    'advisors': 'Teachers',
}

#: Which recipient roles a board audience notifies.
_NOTIFY: Dict[str, Tuple[str, ...]] = {
    'school': ('parents', 'students', 'advisors'),
    'families': ('parents',),
    'teachers': ('advisors',),
}

#: The roles a board post can name, several at once (iCreate, 2026-09-23,
#: 9a335881: "announcements should have multi-role select options"). Stored in
#: sis_announcements.audiences (text[]); the single `audience` word above keeps
#: being written beside it -- the nearest word that covers the roles -- so old
#: code and older app builds read what they always read.
#:
#: Staff read every post on the board whatever it names (the staff list is not
#: filtered by audience), so 'teachers' decides who is NOTIFIED and whether the
#: post is staff-only, not who may read it in the console.
BOARD_ROLES: Tuple[str, ...] = ('parents', 'students', 'teachers')
BOARD_ROLE_LABELS: Dict[str, str] = {
    'parents': 'Parents',
    'students': 'Students',
    'teachers': 'Teachers and staff',
}

#: The roles each single board word always meant. 'school' is everybody;
#: 'families' is the parents only (students read 'school' posts, never
#: 'families' ones -- sis_community_service.family_feed).
_ROLES_OF_AUDIENCE: Dict[str, Tuple[str, ...]] = {
    'school': ('parents', 'students', 'teachers'),
    'families': ('parents',),
    'teachers': ('teachers',),
}

#: A board role, as the send's recipient role.
_RECIPIENT_OF_BOARD_ROLE: Dict[str, str] = {
    'parents': 'parents', 'students': 'students', 'teachers': 'advisors',
}


def board_roles(value, fallback_audience=None) -> List[str]:
    """Clean a requested role list, in BOARD_ROLES order. Nothing usable falls
    back to the roles of `fallback_audience` (the old single word), and then to
    everybody -- the same default the single word has always had."""
    if isinstance(value, str):
        value = [value]
    chosen = {v for v in (value or []) if v in BOARD_ROLES}
    if chosen:
        return [r for r in BOARD_ROLES if r in chosen]
    return list(_ROLES_OF_AUDIENCE[board_audience(fallback_audience)])


def row_board_roles(row) -> List[str]:
    """The roles a stored board post is for: its `audiences` when it has them,
    otherwise what its single word meant (a row written before 2026-09-24)."""
    return board_roles((row or {}).get('audiences'), (row or {}).get('audience'))


def board_audience_for_roles(roles) -> str:
    """The single word to store beside a role list, for readers of the old
    column. The narrowest word that covers every chosen role: staff-only is
    'teachers', parents without students is 'families' (staff read every post
    anyway), and anything with students is 'school'."""
    roles = set(board_roles(roles))
    if roles == {'teachers'}:
        return 'teachers'
    if 'students' not in roles:
        return 'families'
    return 'school'


def recipient_roles_for_board_roles(roles) -> List[str]:
    """The send's recipient roles for a board post's roles, in RECIPIENT_ROLES
    order."""
    wanted = {_RECIPIENT_OF_BOARD_ROLE[r] for r in board_roles(roles)}
    return [r for r in RECIPIENT_ROLES if r in wanted]


def board_roles_label(roles) -> str:
    """"Parents and students", for a line the office reads."""
    labels = [BOARD_ROLE_LABELS[r] for r in board_roles(roles)]
    if len(labels) <= 1:
        return ''.join(labels)
    return ', '.join(labels[:-1]) + ' and ' + labels[-1]


#: What a calendar event is for. The calendar's readers filter on these
#: (routes/sis/events.py): a teacher never sees an admins-only event, a
#: family sees school events only.
EVENT_AUDIENCES: Tuple[str, ...] = ('school', 'teachers', 'admins')
EVENT_LABELS: Dict[str, str] = {
    'school': 'Whole school',
    'teachers': 'Teachers and staff',
    'admins': 'Admins only',
}


def board_audience(value) -> str:
    """The board audience to store for a requested one: a recognised value as
    written, a retired one mapped, anything else the default."""
    text = str(value or '').strip()
    text = LEGACY_BOARD_AUDIENCES.get(text, text)
    return text if text in BOARD_AUDIENCES else 'school'


def recipient_roles_for(audience: str) -> List[str]:
    """The role tokens a board audience notifies; [] for an unknown one."""
    return list(_NOTIFY.get(board_audience(audience), ()))


def normalize_recipient_roles(audiences, fallback=None) -> List[str]:
    """Clean a requested recipient list, tolerating the old single `audience`
    field ('everyone' meaning all roles)."""
    if not audiences:
        single = fallback or 'everyone'
        audiences = list(RECIPIENT_ROLES) if single == 'everyone' else [single]
    if isinstance(audiences, str):
        audiences = [audiences]
    return [a for a in audiences if a in RECIPIENT_ROLES]


def event_audience(value) -> str:
    text = str(value or '').strip()
    return text if text in EVENT_AUDIENCES else 'school'


#: WHERE a notice goes, beside who it is for (ticket 214bbc12, iCreate,
#: 2026-09-22: "I want to be able to message just SOME of the teachers, not
#: all of them ... see options of where it could go: Community Announcement
#: Board; Teacher & Staff Announcement board; Optio Message inbox; Email").
#:
#: The two boards are one board. The "staff board" is the staff audience of the
#: same sis_announcements table, so each audience has exactly one board it can
#: go on -- everyone and families on the community board, staff on the staff
#: board -- and a whole-school post is on the staff board already, because
#: staff read every post. Two board rows for one notice is the double-write
#: the 2026-09-17 audit spent a section on (D1); this vocabulary cannot ask
#: for one.
#:
#: The inbox is staff only. A family is messaged from Compose on the Messaging page,
#: which writes from the school account so replies land in the School Inbox;
#: a DM from here would come from the office member personally and bypass it.
DESTINATIONS: Tuple[str, ...] = ('community_board', 'staff_board', 'inbox', 'email')
BOARD_DESTINATIONS: Tuple[str, ...] = ('community_board', 'staff_board')
DESTINATION_LABELS: Dict[str, str] = {
    'community_board': 'Community board',
    'staff_board': 'Staff board',
    'inbox': 'Optio inbox',
    'email': 'Email',
}


def destination_error(destinations, audience: str, narrowed: bool = False):
    """Why this combination of destinations cannot be sent, or None.

    Pure: the membership of any chosen people is checked by the caller, which
    has the org. Everything here is a mistake the composer should never let
    through, said in words the office can act on.
    """
    chosen = list(destinations or [])
    if not chosen:
        return 'Choose at least one place to send it'
    for d in chosen:
        if d not in DESTINATIONS:
            return f'There is no place to send called "{d}"'
    audience = board_audience(audience)
    if 'community_board' in chosen and audience == 'teachers':
        return 'A staff-only post goes on the staff board, not the community board'
    if 'staff_board' in chosen and audience == 'families':
        return ('Families do not read the staff board. Choose "Everyone at the '
                'school" to reach families and staff with one post')
    if 'staff_board' in chosen and audience == 'school' and 'community_board' not in chosen:
        # A whole-school row IS on the community board; storing one because
        # "staff board" was ticked would put it in front of every family.
        return ('A post for everyone goes on the community board, which staff '
                'read too. Choose "Staff only" for the staff board')
    if 'inbox' in chosen and audience == 'families':
        return "Families are messaged from Compose on the Messaging page, not from here"
    if narrowed:
        if audience != 'teachers':
            return 'Choosing people is for staff-only sends'
        if not any(d in chosen for d in ('inbox', 'email')):
            # A board post is read by every staff member whoever was picked, so
            # a narrowed board-only post would promise something it cannot do.
            return ('Every staff member reads the staff board. Choose Optio inbox '
                    'or Email to reach only the people you picked')
    return None
