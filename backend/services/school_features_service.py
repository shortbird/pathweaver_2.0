"""The features a school switches on and off itself (the Settings "Features"
card, docs/MICROSCHOOL_FIRST_PLAN.md part 3).

Until 2026-10-07 only a superadmin could change an org's modules (the Blocks
panel, routes/admin/org_modules.py). Horizon had every office module on and
used none of them, and could not turn them off. This is the school's own list:
every module a school may decide for itself, in the school's words.

What a school may NOT switch here, and why:

  - core modules: they cannot be off for anyone.
  - SUPERADMIN_ONLY: what Optio sells, certifies or wires up for a school --
    the console itself, AI (parental-consent columns), credits and
    transcripts, prior learning (Optio Academy reviews it), the course
    builder, Bloomy (needs the school's key), kiosk devices.
  - NOT_HERE: student_chat has its own Settings card with its own help text
    (settings/cards/StudentChatCard.jsx); goals rewires the registration
    funnel's next step (post_registration_flow), which is Optio's setup work;
    clp shows in the console only with sis_settings.clp_enabled as well
    (web/src/pages/sis/sisModules.js isClpEnabled), so a switch here would
    look like it did nothing.

Writes go through modules.toggle.apply_changes, the one path the Blocks panel
and the school setup form use: it refuses a change that breaks a `requires`
(409), and it keeps sis_settings.hidden_modules agreeing with the map (a
module switched on leaves the list, one switched off joins it), so the two
never contradict (memory: sis-module-settings-authoritative).

tests/unit/test_school_features.py fails when a new non-core module is in
none of FEATURES, SUPERADMIN_ONLY or NOT_HERE, so whoever adds a module
decides whether a school can switch it.
"""

from typing import Any, Dict, List, Optional, Tuple

from modules.enabled import module_enabled_for_row
from modules.registry import MODULES
from modules.toggle import ModuleChangeError, apply_changes
from utils.logger import get_logger

# admin client justified: admin_audit_logs accepts INSERT from service_role
#   only; the row is a system record written after the route's own org-admin
#   gate, never user-supplied data
from utils.admin_client import admin_client as _admin

logger = get_logger(__name__)

SUPERADMIN_ONLY = frozenset({
    'sis', 'ai', 'credits', 'transcripts', 'prior_learning', 'course_builder',
    'bloomy', 'kiosk',
})
NOT_HERE = frozenset({'student_chat', 'goals', 'clp'})

GROUPS: Tuple[Tuple[str, str], ...] = (
    ('teaching', 'Teaching'),
    ('families', 'Families and registration'),
    ('money', 'Money'),
    ('office', 'Office'),
)

# key -> (group, name, one plain sentence). No "SIS", "module" or "org": the
# reader is a school's own administrator.
FEATURES: Dict[str, Tuple[str, str, str]] = {
    'classes': ('teaching', 'Classes', 'Build classes with times, rooms and rosters.'),
    'attendance': ('teaching', 'Attendance', 'Take roll each day and let families report absences.'),
    'individual_work': ('teaching', 'Individual students', 'Teachers give quests to one student at a time, set due dates and add tasks just for them.'),
    'submissions': ('teaching', 'Work to review', 'One list of student work waiting for a teacher to review it.'),
    'curriculum': ('teaching', 'Curriculum library', "Keep your school's projects and lessons in one place to reuse in classes."),
    'courses': ('teaching', 'Courses', 'Students work through courses made of projects and lessons.'),
    'journal': ('teaching', 'Learning journal', 'Students write about what they are learning.'),
    'bounties': ('teaching', 'Bounty board', 'Students take on posted challenges for XP.'),
    'bounty_management': ('teaching', 'School bounties', 'Staff post bounties for students and review what they turn in.'),
    'weekly_goals': ('teaching', 'Weekly goals', 'Coaches set goals with each student every week and check on them.'),
    'registration': ('families', 'Registration', 'Families apply and enroll online, with waitlists and age limits.'),
    'catalog': ('families', 'Class catalog', 'Show your classes on your website so families can browse them.'),
    'onboarding': ('families', 'New family checklist', 'New families fill in forms and sign documents before they start.'),
    'calendar': ('families', 'School calendar', 'Events and days off that families see on their phones.'),
    'community': ('families', 'Family directory', 'Families find and connect with each other.'),
    'observer': ('families', 'Observers', "Relatives and mentors can follow a student's work."),
    'friends': ('families', 'Friends', 'Students connect with classmates when their family allows it.'),
    'billing': ('money', 'Tuition and invoices', 'Bill families and run monthly autopay by bank account or card.'),
    'tasks': ('office', 'Tasks', 'Give staff and families tasks and follow them to done.'),
    'secure_documents': ('office', 'Private staff documents', 'Keep staff paperwork in one private place.'),
    'resources': ('office', 'Resources', 'Share links and files with staff and families.'),
    'training': ('office', 'Training', 'Give staff and families short trainings to finish.'),
    'reports': ('office', 'Reports', 'Download rosters, attendance and more as spreadsheets.'),
}


class FeatureChangeError(Exception):
    def __init__(self, message: str, status: int = 400, violations: Optional[List[str]] = None):
        super().__init__(message)
        self.message, self.status, self.violations = message, status, violations or []


def features_for_row(org: Dict[str, Any]) -> Dict[str, Any]:
    """The card's data: the groups in order, and one row per feature with its
    effective answer and what it needs."""
    rows = []
    for key, (group, name, description) in FEATURES.items():
        m = MODULES[key]
        rows.append({
            'key': key,
            'group': group,
            'name': name,
            'description': description,
            'enabled': module_enabled_for_row(org, key),
            'requires': [r for r in m.requires if r in FEATURES],
        })
    return {'groups': [{'key': k, 'name': n} for k, n in GROUPS], 'features': rows}


def check_feature_changes(changes: Any) -> Dict[str, bool]:
    """The body: feature keys mapped to booleans. A key the school may not
    switch is refused by name, before anything is read or written."""
    if not changes or not isinstance(changes, dict):
        raise FeatureChangeError('Send at least one feature and true or false')
    for key, value in changes.items():
        if key not in FEATURES:
            if key in MODULES:
                raise FeatureChangeError(
                    f'{MODULES[key].name} is set up by Optio. Ask Optio to change it.',
                    status=403)
            raise FeatureChangeError(f'Unknown feature: {key}')
        if not isinstance(value, bool):
            raise FeatureChangeError(f'{FEATURES[key][1]}: send true or false')
    return changes


def _plain_violation(org: Dict[str, Any], changes: Dict[str, bool]) -> str:
    """The 409 in the school's words: which feature needs which."""
    for key, value in changes.items():
        if value:
            for req in MODULES[key].requires:
                if req in FEATURES and changes.get(req) is not True \
                        and not module_enabled_for_row(org, req):
                    return f'{FEATURES[key][1]} needs {FEATURES[req][1]}. Turn that on first.'
        else:
            for other, (_, name, _) in FEATURES.items():
                if key in MODULES[other].requires and module_enabled_for_row(org, other) \
                        and changes.get(other) is not False:
                    return f'{name} needs {FEATURES[key][1]}. Turn {name} off first.'
    return 'That change breaks a feature another feature needs.'


def audit_feature_change(org_id: str, actor_id: Optional[str], org_before: Dict[str, Any],
                         changes: Dict[str, bool], *, source: str) -> None:
    """One admin_audit_logs row per feature save: who, which school, and each
    switched feature's value before and after.

    Until 2026-10-07 no switch left a trace. Testing this card on localhost
    (which reads production) changed six of Apogee Cache Valley's features,
    and nothing recorded what they had been, so they could not be put back
    with certainty. Same row shape and failure rule as
    sis_person_service._audit: the save already happened, so a failed insert
    is logged, not raised."""
    if not actor_id:
        return
    entry = {
        'user_id': actor_id,
        'organization_id': org_id,
        'action_type': 'school_features_changed',
        'resource_type': 'organization',
        'resource_id': org_id,
        'changes': {
            'source': source,
            'features': {key: {'before': module_enabled_for_row(org_before, key), 'after': bool(value)}
                         for key, value in changes.items()},
        },
    }
    try:
        from repositories.admin_audit_repository import AdminAuditRepository
        AdminAuditRepository(client=_admin()).create(entry)
    except Exception as e:  # noqa: BLE001 -- see docstring
        logger.warning(f'[school_features] audit insert failed for org {str(org_id)[:8]}: {e}')


def get_features(org_id: str) -> Dict[str, Any]:
    from repositories.organization_repository import OrganizationRepository
    org = OrganizationRepository().find_by_id(org_id)
    if not org:
        raise LookupError('Organization not found')
    return features_for_row(org)


def set_features(org_id: str, changes: Any, *, actor_id: str) -> Dict[str, Any]:
    """Switch features on or off for one school, through modules.toggle."""
    changes = check_feature_changes(changes)
    from repositories.organization_repository import OrganizationRepository
    repo = OrganizationRepository()
    org = repo.find_by_id(org_id)
    if not org:
        raise LookupError('Organization not found')
    try:
        flags = apply_changes(org, changes)
    except ModuleChangeError as e:
        raise FeatureChangeError(_plain_violation(org, changes), status=e.status,
                                 violations=e.violations) from None
    repo.update_organization(org_id, {'feature_flags': flags})
    audit_feature_change(org_id, actor_id, org, changes, source='settings_features_card')
    # The per-request module cache holds the old row; drop it so later reads
    # on this request see the stored one.
    try:
        from flask import g, has_app_context
        if has_app_context():
            g.setdefault('_module_org_rows', {}).pop(org_id, None)
    except ImportError:
        ...
    logger.info(f'[school_features] {actor_id} set {changes} for org {org_id}')
    return features_for_row({**org, 'feature_flags': flags})
