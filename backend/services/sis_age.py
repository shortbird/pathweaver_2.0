"""
One age for a student, everywhere in the SIS.

A child's age for the school year is judged as of the org's first day of
school (feature_flags.sis_settings.first_day_of_school). The enrollment gates
and the parent's Schedule Builder already counted it that way; the roster,
the CLP, the teacher's class page, the reports and the training catalog each
kept their own copy of the arithmetic and counted from today, so a child who
turned 10 in October was 9 on one screen and 10 on the next, and the office
and the family were offered different classes for her
(docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, E5; M11 in
docs/sis/CONSOLIDATION_PLAN.md; rule chosen 2026-09-17: first day of school,
everywhere). With no first day configured the age is as of today.

The arithmetic itself is services.sis_eligibility.age_on, the pure function;
this module only decides the date. Questions that are not "how old is this
student for the school year" -- is a registrant an adult, may a child hold her
own login -- are about today and keep calling age_on directly.
"""

from datetime import date
from typing import Any, Callable, Optional

from repositories.organization_repository import OrganizationRepository
from services.sis_eligibility import _coerce_date, age_on
from utils.logger import get_logger

logger = get_logger(__name__)


def school_year_start(org_id: str) -> Optional[date]:
    """The org's first day of school, or None when it has not set one."""
    try:
        org = OrganizationRepository().find_by_id(org_id) or {}
    except Exception as e:  # noqa: BLE001 -- an unreadable setting means "today", the old rule
        logger.warning(f'[sis_age] could not read first_day_of_school for org {org_id}: {e}')
        return None
    settings = ((org.get('feature_flags') or {}).get('sis_settings') or {})
    return _coerce_date(settings.get('first_day_of_school'))


def ages_for(org_id: str) -> Callable[[Any], Optional[int]]:
    """A dob -> age function pinned to the org's school year: read the first
    day once, then age a whole roster with it."""
    as_of = school_year_start(org_id)
    return lambda dob: age_on(dob, as_of)


def school_age(org_id: str, dob: Any) -> Optional[int]:
    """Whole years old as of the org's first day of school; None without a dob."""
    return age_on(dob, school_year_start(org_id))
