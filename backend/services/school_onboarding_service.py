"""School setup links: a new school's first step into Optio.

Optio staff make a single-use link and send it to a school operator. The
operator opens it, creates their own Optio account (or signs in), and fills the
setup form. Submitting creates the organization and makes the submitter its
org_admin, in one step, with no staff action between.

What the form decides and what it only records:

  - Applied to the new org: name, slug (from the name), time zone, logo, the
    library choice (quest and course visibility), and AI on or off. Each is a
    setting the school can already change itself in its settings.
  - The features the school picks are turned on (FEATURE_MODULES), through
    the same toggle path as the Blocks panel (modules/toggle.py). Every
    school may use every feature; the picks only decide what is on at the
    start. A console feature turns on the school console.
  - Recorded only, in the link's `answers`: everything else.
    accreditation_source is never set here: 'optio' puts the accredited mark
    on transcripts, and a school does not grant itself that by filling a form.

Who may submit: any signed-in account that is not yet in an organization and is
not the superadmin. A brand-new account from /register is a platform student;
it becomes org_managed with org_role org_admin. A platform parent or advisor
keeps that role beside org_admin. The account must have a phone number
verified by text message first; the form uses the phone-verification flow.
"""

import re
import secrets
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from repositories.organization_repository import OrganizationRepository
from repositories.school_onboarding_repository import SchoolOnboardingRepository
from services.organization_service import new_org_row
from utils.logger import get_logger
from utils.timestamps import utcnow

logger = get_logger(__name__)

GRADES = ('PreK', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'Adult')
MAX_PER_GRADE = 10000

# Optional answers: key -> longest accepted text. Anything not listed here (or
# required below) is dropped, so the stored answers are only what the form asks.
OPTIONAL_TEXT = {
    'website': 200,
    'address': 200,
    'mission': 500,
    'school_type': 60,
    'teaching_approach': 60,
    'days_per_week': 20,
    'year_start': 10,
    'year_end': 10,
    'term_structure': 40,
    'staff_count': 20,
    'students_next_year': 20,
    'accreditation': 200,
    'optio_credit_interest': 20,
    'tuition_model': 40,
    'funding_programs': 200,
    'has_stripe': 20,
    'ai_choice': 10,
    'library_choice': 20,
    'launch_date': 10,
    'current_tools': 300,
    'referral_source': 200,
    'billing_contact_name': 120,
    'billing_contact_email': 200,
    'notes': 1500,
}
OPTIONAL_LISTS = {'features': 40}   # key -> longest accepted item
LIST_MAX_ITEMS = 40

LIBRARY_POLICIES = {'all_optio': 'all_optio', 'private_only': 'private_only'}
LOGO_MAX_CHARS = 3_000_000   # a 2MB image as a base64 data URL
LINK_DAYS = 30


class SchoolSetupError(Exception):
    def __init__(self, message: str, status: int = 400, code: Optional[str] = None,
                 field: Optional[str] = None):
        super().__init__(message)
        self.message, self.status, self.code, self.field = message, status, code, field

    def payload(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {'error': self.message}
        if self.code:
            out['code'] = self.code
        if self.field:
            out['field'] = self.field
        return out


# ── links ─────────────────────────────────────────────────────────────────────

def _parse_ts(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None


def link_status(link: Dict[str, Any]) -> str:
    if link.get('used_at'):
        return 'used'
    if link.get('revoked_at'):
        return 'revoked'
    expires = _parse_ts(link.get('expires_at'))
    if expires and expires <= utcnow():
        return 'expired'
    return 'open'


def create_link(repo: SchoolOnboardingRepository, created_by: str, school_name_hint: str = '',
                contact_email: str = '', note: str = '') -> Dict[str, Any]:
    row = {
        'token': secrets.token_urlsafe(24),
        'school_name_hint': (school_name_hint or '').strip()[:120] or None,
        'contact_email': (contact_email or '').strip().lower()[:200] or None,
        'note': (note or '').strip()[:500] or None,
        'created_by': created_by,
    }
    return repo.create_link(row)


def staff_view(link: Dict[str, Any], link_base: str) -> Dict[str, Any]:
    return {**link, 'status': link_status(link), 'url': f"{link_base}/start-school/{link['token']}"}


def public_view(repo: SchoolOnboardingRepository, token: str) -> Dict[str, Any]:
    """What the setup page shows before it knows who the visitor is."""
    link = repo.by_token((token or '').strip())
    if not link:
        raise SchoolSetupError('This setup link is not valid.', status=404, code='not_found')
    return {'status': link_status(link), 'school_name_hint': link.get('school_name_hint')}


def revoke_link(repo: SchoolOnboardingRepository, link_id: str) -> None:
    link = repo.by_id(link_id)
    if not link:
        raise SchoolSetupError('Link not found.', status=404)
    if link.get('used_at'):
        raise SchoolSetupError('This link was already used to create a school.', status=409)
    repo.revoke(link_id)


# ── answers ───────────────────────────────────────────────────────────────────

def _text(data: Dict[str, Any], key: str, limit: int) -> str:
    value = data.get(key)
    if value is None or isinstance(value, (dict, list)):
        return ''
    return str(value).strip()[:limit]


def _required(data: Dict[str, Any], key: str, limit: int, label: str) -> str:
    value = _text(data, key, limit)
    if not value:
        raise SchoolSetupError(f'{label} is required.', field=key)
    return value


def clean_answers(data: Dict[str, Any]) -> Dict[str, Any]:
    """The form's answers, checked and trimmed. Raises SchoolSetupError naming
    the first field that is missing or wrong."""
    data = data or {}
    out: Dict[str, Any] = {
        'school_name': _required(data, 'school_name', 120, 'School name'),
        'contact_title': _required(data, 'contact_title', 80, 'Your role'),
    }

    online_only = data.get('online_only') is True
    out['online_only'] = online_only
    if online_only:
        out['city'] = _text(data, 'city', 80)
        out['region'] = _text(data, 'region', 80)
    else:
        out['city'] = _required(data, 'city', 80, 'City')
        out['region'] = _required(data, 'region', 80, 'State or region')
    out['country'] = _text(data, 'country', 80) or 'United States'

    tz = _required(data, 'timezone', 64, 'Time zone')
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise SchoolSetupError('Pick a time zone from the list.', field='timezone') from None
    out['timezone'] = tz

    # {grade: number of students now}. The grades served are the ones with
    # students; the total is their sum.
    raw_counts = data.get('grade_counts')
    if not isinstance(raw_counts, dict):
        raw_counts = {}
    counts: Dict[str, int] = {}
    for grade, value in raw_counts.items():
        if grade not in GRADES:
            raise SchoolSetupError('Enter students only for the grades listed.', field='grade_counts')
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= MAX_PER_GRADE:
            raise SchoolSetupError('Enter a whole number of students for each grade.', field='grade_counts')
        if value:
            counts[grade] = value
    if not counts:
        raise SchoolSetupError('Enter how many students you have in at least one grade.', field='grade_counts')
    out['grade_counts'] = {g: counts[g] for g in GRADES if g in counts}   # canonical order
    out['grades'] = list(out['grade_counts'])
    out['student_count'] = sum(counts.values())

    for key, limit in OPTIONAL_TEXT.items():
        value = _text(data, key, limit)
        if value:
            out[key] = value
    for key, limit in OPTIONAL_LISTS.items():
        items = data.get(key)
        if isinstance(items, list):
            cleaned = [str(i).strip()[:limit] for i in items[:LIST_MAX_ITEMS]
                       if isinstance(i, str) and i.strip()]
            if cleaned:
                out[key] = cleaned
    return out


def clean_logo(value: Any) -> Optional[str]:
    """A data URL from the form's file picker, the same shape the org settings
    page stores in branding_config.logo_url."""
    if not value:
        return None
    if not isinstance(value, str) or not value.startswith('data:image/'):
        raise SchoolSetupError('The logo must be an image file.', field='logo')
    if len(value) > LOGO_MAX_CHARS:
        raise SchoolSetupError('The logo must be under 2MB.', field='logo')
    return value


def slugify(name: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', (name or '').lower()).strip('-')[:40].strip('-')
    return slug or 'school'


def free_slug(repo: SchoolOnboardingRepository, name: str) -> str:
    base = slugify(name)
    for n in range(1, 100):
        slug = base if n == 1 else f'{base}-{n}'
        if not repo.slug_taken(slug):
            return slug
    return f'{base}-{secrets.token_hex(3)}'


def library_policy(answers: Dict[str, Any]) -> str:
    """Optio's public library and the school's own work, or only the school's."""
    return LIBRARY_POLICIES.get(str(answers.get('library_choice') or ''), 'all_optio')


def org_fields(answers: Dict[str, Any], logo: Optional[str]) -> Dict[str, Any]:
    """The organizations columns the answers set, beyond name/slug/policy."""
    fields: Dict[str, Any] = {
        'timezone': answers['timezone'],
        'course_visibility_policy': library_policy(answers),
    }
    if logo:
        fields['branding_config'] = {'logo_url': logo}
    changes = module_changes(answers.get('features') or [])
    if changes:
        from modules.toggle import apply_changes
        fields['feature_flags'] = apply_changes(new_org_row('', '', 'all_optio'), changes)
    if answers.get('ai_choice') == 'off':
        fields.update({
            'ai_features_enabled': False,
            'ai_chatbot_enabled': False,
            'ai_lesson_helper_enabled': False,
            'ai_task_generation_enabled': False,
        })
    return fields


# The form's feature checkboxes and the modules each one turns on. A pick
# that lives under the school console (parent 'sis') turns the console on.
# Picks with no module (mobile_app) are recorded only: the app is there for
# every school.
FEATURE_MODULES: Dict[str, Tuple[str, ...]] = {
    'registration': ('registration',),
    'billing': ('billing', 'registration'),   # billing requires registration
    'classes': ('classes', 'catalog'),        # catalog requires classes
    'attendance': ('attendance',),
    'calendar': ('calendar',),
    'credits': ('credits', 'transcripts'),
    'weekly_goals': ('weekly_goals',),
    'secure_documents': ('secure_documents',),
    'community': ('community',),
    'reports': ('reports',),
    'kiosk': ('kiosk',),
    'mobile_app': (),
}


def module_changes(features: List[str]) -> Dict[str, bool]:
    """The module toggles for a new school's picks.

    Once the console is on, every console module a checkbox controls is set
    explicitly, on or off, so one that defaults on (attendance, calendar) is
    off unless picked. Modules outside the console default off and are
    written only when picked. The console itself turns on only when a console module was
    picked; a school that picked none stays on the learning platform, and
    its console modules are left unset."""
    from modules import MODULES
    picked = {m for f in features for m in FEATURE_MODULES.get(f, ())}
    controlled = {m for mods in FEATURE_MODULES.values() for m in mods}
    console_on = any(MODULES[m].parent == 'sis' for m in picked)
    changes: Dict[str, bool] = {}
    for m in sorted(controlled):
        if MODULES[m].parent == 'sis':
            if console_on:
                changes[m] = m in picked
        elif m in picked:   # the rest default off, so only a pick is written
            changes[m] = True
    if console_on:
        changes['sis'] = True
    return changes


def _org_roles(user: Dict[str, Any]) -> List[str]:
    roles = ['org_admin']
    if user.get('role') in ('parent', 'advisor'):
        roles.append(user['role'])
    return roles


# ── submit ────────────────────────────────────────────────────────────────────

def submit(repo: SchoolOnboardingRepository, org_repo: OrganizationRepository,
           token: str, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    link = repo.by_token((token or '').strip())
    if not link:
        raise SchoolSetupError('This setup link is not valid.', status=404, code='not_found')
    status = link_status(link)
    if status != 'open':
        raise SchoolSetupError({
            'used': 'This setup link was already used to create a school.',
            'revoked': 'This setup link was turned off. Ask Optio for a new one.',
            'expired': 'This setup link has expired. Ask Optio for a new one.',
        }[status], status=410, code=status)

    user = repo.user(user_id)
    if not user:
        raise SchoolSetupError('Sign in to continue.', status=401)
    if user.get('role') == 'superadmin':
        raise SchoolSetupError(
            'The Optio superadmin account cannot run a school. Sign in with the school '
            "administrator's own account.", status=403, code='superadmin')
    if user.get('organization_id'):
        raise SchoolSetupError(
            'This account already belongs to a school. Sign in with a different account, '
            'or ask Optio to move this one.', status=409, code='already_in_school')

    answers = clean_answers(data)
    logo = clean_logo((data or {}).get('logo'))
    # The number comes from the account, where the SMS check put it
    # (services/phone_verification_service.py), never from the form body.
    if not user.get('phone_verified_at') or not user.get('phone_number'):
        raise SchoolSetupError('Verify your phone number.', field='contact_phone')
    answers['contact_phone'] = user['phone_number']

    if not repo.claim(link['id'], user_id):
        raise SchoolSetupError('This setup link was already used to create a school.',
                               status=410, code='used')
    try:
        slug = free_slug(repo, answers['school_name'])
        policy = library_policy(answers)
        org = org_repo.create_organization(
            new_org_row(answers['school_name'], slug, policy, **org_fields(answers, logo)))
    except Exception:
        repo.release(link['id'])
        raise

    # The link records the org before the account changes, so a failure below
    # leaves a used link that names its org rather than an org nobody can find.
    repo.finish(link['id'], org['id'], {**answers, 'has_logo': bool(logo)})
    repo.make_org_admin(user_id, org['id'], _org_roles(user))
    logger.info(f"School setup: org {org['id']} ({slug}) created by user {user_id} from link {link['id']}")

    _notify_staff(org, answers, user)
    return {'organization_id': org['id'], 'slug': slug, 'name': org['name']}


def _notify_staff(org: Dict[str, Any], answers: Dict[str, Any], user: Dict[str, Any]) -> None:
    """Tell Optio a school finished setup. Best effort: the school exists
    whether or not the email leaves."""
    from app_config import Config
    to = (Config.SUPERADMIN_EMAIL or '').strip()
    if not to:
        return
    try:
        from html import escape
        from services.email_service import email_service
        who = f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip() or user.get('email')
        place = 'Online only' if answers.get('online_only') else \
            ', '.join(p for p in (answers.get('city'), answers.get('region')) if p)
        lines = [
            ('School', answers['school_name']),
            ('Admin', f"{who} ({user.get('email')}), {answers['contact_title']}"),
            ('Where', place),
            ('Students', f"{answers['student_count']} ("
                         + ', '.join(f'{g}: {n}' for g, n in answers['grade_counts'].items()) + ')'),
            ('Wants', ', '.join(answers.get('features') or []) or 'Not answered'),
        ]
        html = '<p>A school finished the setup form.</p><ul>' + ''.join(
            f'<li><strong>{escape(k)}:</strong> {escape(str(v))}</li>' for k, v in lines) + \
            '</ul><p>All answers are on the Organizations page under School setup links.</p>'
        text = 'A school finished the setup form.\n' + '\n'.join(f'{k}: {v}' for k, v in lines)
        email_service.send_email(to, f"New school on Optio: {answers['school_name']}", html, text)
    except Exception as e:  # noqa: BLE001 -- the notice must not undo the setup
        logger.warning(f"School setup notice for org {org.get('id')} not sent: {e}")
