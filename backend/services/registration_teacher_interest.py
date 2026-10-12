"""
The "tell me about an Optio teacher" email (2026-10-12).

Optio Academy's registration asks, per student, whether the family is
interested in an Optio teacher (the `teacher_support` intake question). The
paid add-on of the same key sits on the payment step; most families tick the
interest box and pay only the program fee, and until now nothing followed up:
the answer showed in the school's alert and the family heard nothing. This
email goes to the parent when the registration completes, says how a teacher
works and what it costs, and offers a call to talk it over.

A student whose family already bought the add-on is left out (they have a
teacher; a sales note would read as a mistake). The copy is signed by the
Head of School and names Optio Academy, so it is gated on that org's slug
rather than on the question key, which another school could copy.

The price comes from the registration config's add-on, the same number the
payment step charges, so the email cannot quote a stale price.
"""

from typing import Any, Dict, List, Optional

from services.registration_pricing import monthly_plan
from utils.logger import get_logger
from utils.money import format_cents

logger = get_logger(__name__)

ORG_SLUG = 'optio-academy'
QUESTION_KEY = 'teacher_support'
ADD_ON_KEY = 'teacher_support'
BOOKING_URL = 'https://calendar.app.google/nnJP1nZiDhHLp4Tq8'
REPLY_TO = 'tanner@optioeducation.com'
TEMPLATE = 'academy_teacher_interest'


def _ticked(answer: Any) -> bool:
    if isinstance(answer, list):
        return any(str(a).strip() for a in answer)
    return bool(str(answer or '').strip())


def interested_students(reg: Dict[str, Any]) -> List[str]:
    """First names of the students the family asked about, minus any who
    already have the add-on. Handles a per-student answer ({kid_id: [...]})
    and a family-wide one (one answer for everybody)."""
    answer = ((reg.get('answers') or {}) if isinstance(reg.get('answers'), dict) else {}).get(QUESTION_KEY)
    if not answer:
        return []
    names = []
    for kid in reg.get('kids') or []:
        if ADD_ON_KEY in (kid.get('add_ons') or []):
            continue
        ticked = _ticked(answer.get(kid.get('user_id'))) if isinstance(answer, dict) else _ticked(answer)
        if ticked:
            names.append(kid.get('preferred_name') or kid.get('first_name')
                         or (kid.get('name') or '').split(' ')[0] or 'your student')
    return names


def _join(names: List[str]) -> str:
    if len(names) <= 2:
        return ' and '.join(names)
    return ', '.join(names[:-1]) + ', and ' + names[-1]


def _price_line(cfg: Dict[str, Any]) -> Optional[str]:
    add_on = next((a for a in (monthly_plan(cfg) or {}).get('add_ons', [])
                   if a.get('key') == ADD_ON_KEY), None)
    if not add_on or not add_on.get('amount_cents'):
        return None
    line = f"An Optio teacher costs {format_cents(add_on['amount_cents'])} per month for each student."
    per_student = (monthly_plan(cfg) or {}).get('per_student_cents')
    if add_on.get('includes_program_fee') and per_student:
        line += f" That includes the {format_cents(per_student)} monthly program fee, so it is not added on top."
    return line


def email_context(parent: Dict[str, Any], names: List[str], cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Variables for the academy_teacher_interest template in email_copy.yaml,
    which carries the copy and the branded Optio layout."""
    return {
        'parent_first_name': parent.get('first_name') or 'there',
        'students': _join(names),
        'price_line': _price_line(cfg) or '',
        'booking_url': BOOKING_URL,
    }


def send_if_interested(reg: Dict[str, Any], cfg: Dict[str, Any], org: Dict[str, Any],
                       parent: Dict[str, Any]) -> bool:
    """Send the teacher email when this registration asked for one. Returns
    True when an email went out. Never raises: the registration is already
    complete."""
    try:
        if (org or {}).get('slug') != ORG_SLUG or not parent.get('email'):
            return False
        names = interested_students(reg)
        if not names:
            return False
        from services.email_service import email_service
        context = email_context(parent, names, cfg)
        return bool(email_service.send_templated_email(
            to_email=parent['email'], subject=f"About an Optio teacher for {context['students']}",
            template_name=TEMPLATE, context=context, reply_to=REPLY_TO))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'registration: teacher email failed for registration {reg.get("id")}: {e}')
        return False
