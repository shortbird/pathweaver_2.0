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
