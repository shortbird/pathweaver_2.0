"""What a name or a bio may not carry: a way to reach the person off the
platform.

The message screen holds a phone number, an email, a link or a street
address on sight (utils.contact_details, shared with it). A display name
or a bio is read by the same children in the same places, and until
2026-09-15 it passed no check at all, so "Sam 801-555-0199" was a valid
display name. Same regex, same rule, applied on save. The words themselves
are not judged here: a name is not a conversation.
"""

from typing import Iterable, Optional, Tuple

from utils.contact_details import contact_details

#: (field, label the person reads) for every free-text profile field.
PROFILE_TEXT_FIELDS: Tuple[Tuple[str, str], ...] = (
    ('first_name', 'first name'),
    ('last_name', 'last name'),
    ('display_name', 'display name'),
    ('preferred_name', 'preferred name'),
    ('username', 'username'),
    ('bio', 'bio'),
)


def contact_detail_error(value: Optional[str], label: str) -> Optional[str]:
    """The sentence to show, or None when the text is fine."""
    found = contact_details(value or '')
    if not found:
        return None
    what = found[0].replace('shares a ', '')
    return f'Your {label} cannot include a {what}. Keep contact details off the platform.'


def contact_detail_violation(updates: dict, fields: Iterable[Tuple[str, str]] = PROFILE_TEXT_FIELDS) -> Optional[str]:
    """The error for the first profile field carrying a contact detail, or
    None. `updates` is the dict about to be written; fields absent from it
    are not checked. The route raises: a util does not import the error
    handler (tests/unit/test_import_layers.py)."""
    for field, label in fields:
        if field in updates and isinstance(updates[field], str):
            error = contact_detail_error(updates[field], label)
            if error:
                return error
    return None
