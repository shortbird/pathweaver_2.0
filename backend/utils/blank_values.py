"""Is this free-text answer actually saying anything?

Families type "None", "N/A", "-" into optional fields as often as they leave
them empty. Treating those as content is how a class roster ends up flagging a
red allergy Alert on a student with no allergies (iCreate, 2026-07-30) — 55 of
their students had `allergies = 'None'`.

Anything a person meant as "nothing here" is blank. Keep the list conservative:
a real answer must never be swallowed, so only exact matches count — "no nuts"
and "none except dairy" are content.
"""

BLANK_VALUES = {
    '', 'none', 'no', 'n/a', 'na', 'n.a.', 'n.a', 'nope', 'nan', 'null',
    '-', '--', 'none.', 'no.', 'not applicable', 'nil', 'nothing',
    'none known', 'no known allergies', 'nka', 'none at this time',
    'none currently', 'no allergies', 'no medications', 'n/a.', '0',
}


def has_value(v) -> bool:
    """True when v is a real, non-empty, non-'none' answer.

    Recurses into lists/dicts so a structured answer counts when any leaf does.
    """
    if v is None:
        return False
    if isinstance(v, (list, tuple, set)):
        return any(has_value(x) for x in v)
    if isinstance(v, dict):
        return any(has_value(x) for x in v.values())
    return str(v).strip().lower().rstrip('.') not in BLANK_VALUES


def clean(v):
    """The stripped text, or None when it means nothing. Use when the value is
    about to be *displayed* — a roster that prints "Allergies: None" is noise."""
    if not has_value(v):
        return None
    return str(v).strip()
