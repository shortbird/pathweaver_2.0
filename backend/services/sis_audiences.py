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
#: The inbox is staff only. A family is messaged from "Message Families",
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
        return 'Families are messaged from "Message Families", not from here'
    if narrowed:
        if audience != 'teachers':
            return 'Choosing people is for staff-only sends'
        if not any(d in chosen for d in ('inbox', 'email')):
            # A board post is read by every staff member whoever was picked, so
            # a narrowed board-only post would promise something it cannot do.
            return ('Every staff member reads the staff board. Choose Optio inbox '
                    'or Email to reach only the people you picked')
    return None
