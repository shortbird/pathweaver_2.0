"""Links into the family dashboard that name the child they are about.

Every notification about a child's Friends used to link to bare ``/family``.
That is the page a parent is already on when they open the bell, so
"View details" navigated to itself and looked broken (Penny, 2026-09-16).
The link now carries the child: the web dashboard opens that child's
Friends explainer when the switch is off and their settings tab when it is
on (pages/home/FamilyHome.jsx), and mobile's deepLinkRouter sends it to the
child's Friends screen.
"""


def family_friends_link(child_id: str) -> str:
    """The family dashboard, opened on this child's Friends."""
    return f'/family?friends={child_id}'
