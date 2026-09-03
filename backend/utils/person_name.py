"""One way to render a person's name.

iCreate, 2026-08-25: "Can we resolve that students' names are different in
their directory compared to the CLP tab? We've got nicknames and proper flying
around."

Two separate causes, both fixed here:

1. **Ten copies of the same function.** `_full_name` / `_student_name` was
   pasted into ten SIS services with two different fallback orders — some let
   `display_name` win over `first last`, some the reverse. Every one of them now
   delegates to `full_name` below.

2. **The nickname wasn't loaded.** Fifty-odd queries selected
   `first_name, last_name, display_name` and no `preferred_name`, so the helper
   never saw the nickname and rendered the legal name. A screen's name depended
   on whether its query happened to ask for the column. `USER_NAME_FIELDS` is
   the select list that always asks; `tests/unit/test_person_name_fields.py`
   fails the build when a SIS query drops it.

Deliberately NOT applied to official records — transcripts, report cards, signed
forms, enrollment paperwork. Those carry the legal name on purpose, and
`legal_name` is how they say so.
"""

from typing import Any, Dict, Optional

# The columns `full_name` reads. Add this to a `.select(...)` rather than listing
# name columns by hand — that is how the nickname went missing in the first place.
USER_NAME_FIELDS = 'first_name, last_name, display_name, preferred_name, username, email'


def full_name(u: Optional[Dict[str, Any]], fallback: str = 'Unnamed') -> str:
    """What to call this person on screen.

    A preferred name replaces the first name, never the last: "Montie" for
    Monroe Adams renders "Montie Adams", so the office can still find the family
    it belongs to. A preferred name that already ends in the surname (someone who
    typed their whole name into the box) is used as-is rather than doubled.
    """
    if not u:
        return fallback
    pref = (u.get('preferred_name') or '').strip()
    first = (u.get('first_name') or '').strip()
    last = (u.get('last_name') or '').strip()
    if pref:
        if last and not pref.lower().endswith(last.lower()):
            return f'{pref} {last}'
        return pref
    # A complete first + last wins: it is the same shape the preferred-name
    # branch above builds, so a family reads the same way whether or not one of
    # its members has a nickname. A half-filled record falls back to
    # display_name, which on those rows is usually the more complete string
    # ("Gina" on file, "Gina One" in display_name).
    if first and last:
        return f'{first} {last}'
    return ((u.get('display_name') or '').strip() or first or last
            or u.get('username') or u.get('email') or fallback)


def legal_name(u: Optional[Dict[str, Any]], fallback: str = 'Unnamed') -> str:
    """The name for an official record: first + last, never the nickname.

    Transcripts, report cards and signed forms use this. A student known as
    Montie all year is still Monroe Adams on the document that leaves the
    building.
    """
    if not u:
        return fallback
    name = f"{(u.get('first_name') or '').strip()} {(u.get('last_name') or '').strip()}".strip()
    return name or (u.get('display_name') or '').strip() or u.get('username') or u.get('email') or fallback
