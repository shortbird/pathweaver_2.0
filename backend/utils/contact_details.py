"""The one deterministic safety rule: a way to reach a child off the platform.

A phone number, an email, a URL, or a street address with the child (or the
reader) placed at it. Held on sight by the message screen
(services/peer_text_screen_service) and refused on save in a name or a bio
(utils/validation/profile_text). Lives in utils/ so both can read it; the
model-side judgement stays in the service.

Kept narrow on purpose. Every pattern here is a way to reach a child OFF the
platform; nothing here judges tone or topic (the model does that, and gets
context the regex cannot).
"""

import re
from typing import List

_PHONE = re.compile(r'(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)')
_EMAIL = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
_URL = re.compile(r'(?:https?://|www\.)\S+', re.IGNORECASE)
# A street address only counts when the child is placing THEMSELVES or the
# reader at it. "1600 Pennsylvania Ave" in a project about the White House
# is homework; "come to 123 Maple Street" is not. The model still judges
# the bare address on its own, with the context the regex cannot see.
_ADDRESS = re.compile(
    r'\b(?:i live|we live|my (?:house|home) is|my address is|come (?:over|to)|'
    r'meet (?:me|us)|i\'m at|im at|we\'re at|were at)\b[^.\n]{0,40}?'
    r'\d{1,5}\s+(?:[A-Za-z]+\s+){1,3}'
    r'(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|way|place|pl)\b\.?',
    re.IGNORECASE,
)
CONTACT_PATTERNS = (
    ('phone number', _PHONE),
    ('email address', _EMAIL),
    ('link', _URL),
    ('street address', _ADDRESS),
)


def contact_details(text: str, *, links: bool = True) -> List[str]:
    """The kinds of contact detail this text carries, or [].

    `links=False` leaves URLs out. A teacher sending a class a link to a
    tool, a reading or a video is the job, not a way off the platform; the
    regex held every one of them until 2026-09-24 (an iCreate teacher's
    Base44 link to her five students, held five times). The adult prompt
    still judges the link, with the words around it.
    """
    found = []
    for label, pattern in CONTACT_PATTERNS:
        if not links and pattern is _URL:
            continue
        if pattern.search(text or ''):
            found.append(f'shares a {label}')
    return found
