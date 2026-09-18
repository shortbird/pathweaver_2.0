"""
"Is this the same person as that one?" -- the two answers the platform gives.

Until M16 (2026-09-17) the staff-facing matcher lived in sis_service and the
registration funnel's own-dependent matcher in registration_accounts_service,
and two one-off scripts carried inline copies (docs/icreate/
FRANKENSTEIN_AUDIT_2026-09-17.md, K4). They are deliberately two rules, not
one, because they answer different questions with different stakes:

  likely_same_student(a, b)   a LOOK-ALIKE, for a warning. Fuzzy on the first
                              name (Zach/Zachary) and tolerant of a mistyped
                              DOB, tuned so that twins never match. The office
                              sees it as "this may be the same child twice"
                              and decides.
  match_own_dependent(...)    an EXACT match inside the parent's own dependents,
                              for the self-service funnel to reuse an account
                              without asking. Safe on name alone because the
                              pool is only the parent's own children.

A third rule in registration_accounts_service (_existing_org_student_by_name_dob)
looks up a pool from the database and applies the exact rule; it stays there
because it is a query, not a comparison.
"""

from typing import Any, Dict, Optional

# Look-alikes for the office. The iCreate funnel can only auto-match a re-registered kid to their existing
# Optio account by email (or the parent's own prior dependents). A parent who
# registers an under-13 kid as a fresh dependent — while that kid already has an
# account — slips past both checks and a duplicate is created. Staff then attach
# the original account to the same family and end up with the kid twice. These
# helpers flag those look-alikes so the add-member flow can warn and the Families
# view can badge them, WITHOUT tripping on twins/siblings who share a birthday.

def _norm_name(v: Any) -> str:
    return (v or '').strip().lower()


def _parse_iso_date(v: Any):
    from datetime import date
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except (ValueError, TypeError):
        return None



def _dob_gap_days(a: Any, b: Any) -> Optional[int]:
    """Absolute day gap between two DOBs, or None when either is unknown."""
    da, db = _parse_iso_date(a), _parse_iso_date(b)
    if da is None or db is None:
        return None
    return abs((da - db).days)


def likely_same_student(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    """Do two student records look like the same child entered twice?

    Compares names + DOB. Tuned for the re-registration pattern (a kid entered a
    second time, often as a dependent with the name spelled differently or the
    DOB off by a day) while deliberately NOT flagging twins/siblings, who share a
    birthday but have distinct first names:

      - Same last name is required (a duplicate of a kid keeps the surname).
      - Identical first name -> duplicate regardless of DOB. No family names two
        living children the exact same first + last name, so this safely catches
        a re-registration where the DOB was mistyped (off by a day, or a year).
      - Nickname/typo first name (one a prefix of the other, e.g. Zach/Zachary)
        -> duplicate ONLY when the DOB matches exactly, so same-birthday siblings
        with unrelated names (twins) never match.
    """
    la, lb = _norm_name(a.get('last_name')), _norm_name(b.get('last_name'))
    if la and lb and la != lb:
        return False
    fa, fb = _norm_name(a.get('first_name')), _norm_name(b.get('first_name'))
    if not fa or not fb:
        return False
    if fa == fb:
        return True
    if min(len(fa), len(fb)) >= 3 and (fa.startswith(fb) or fb.startswith(fa)):
        return _dob_gap_days(a.get('date_of_birth'), b.get('date_of_birth')) == 0
    return False


def match_own_dependent(dependents, first, last, dob):
    """Find this parent's OWN pre-existing dependent matching a submitted kid.
    Name match (case-insensitive) plus DOB when the dependent has one on file.
    Safe on name alone because the pool is limited to the parent's dependents."""
    for d in dependents:
        if ((d.get('first_name') or '').strip().lower() == first.lower()
                and (d.get('last_name') or '').strip().lower() == last.lower()):
            ddob = str(d.get('date_of_birth') or '')[:10]
            if not ddob or ddob == str(dob):
                return d
    return None
