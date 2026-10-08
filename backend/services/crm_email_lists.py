"""Who is who, for the email lists at /admin/crm/lists.

A superadmin builds a recipient list (every org admin, every Optio Academy
parent, the parents of one class...), copies the emails and pastes them into
BCC on a Gmail draft. Nothing here sends mail.

The page filters in the browser, so the server's job is one honest directory:
every user with an email, their roles, their org, and the classes that tie
them to a school -- a student's own active classes, a guardian's children's.
At ~1,200 users that is one read per table; move the filtering server-side if
the directory ever grows past a few thousand rows.

Guardians come from utils.class_membership.guardians_by_student, the one
definition of "parent of" (managed accounts, approved links AND households).
A household-only guardian -- most families who registered through a school's
funnel -- is invisible to a read of parent_student_links alone.
"""
from typing import Any, Dict, Iterable, List, Set

from utils.roles import get_effective_roles

LIST_FIELDS = ('name', 'description', 'filters', 'include_ids', 'exclude_ids')


def roles_of(user: Dict[str, Any]) -> List[str]:
    """Every role this account holds; org admin comes from the derived flag
    so a parent who is also an org admin reads as both."""
    roles = set(get_effective_roles(user))
    if user.get('is_org_admin'):
        roles.add('org_admin')
    return sorted(roles)


def display_name(user: Dict[str, Any]) -> str:
    full = f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip()
    return full or (user.get('display_name') or '').strip() or (user.get('email') or '')


def build_directory(users: Iterable[Dict[str, Any]],
                    classes_by_student: Dict[str, Set[str]],
                    guardians: Dict[str, Set[str]],
                    suppressed: Set[str]) -> List[Dict[str, Any]]:
    """One row per user with an email.

    users               user rows (id, names, email, role, org_role(s), ...)
    classes_by_student  {student_id: {class_id, ...}} active enrollments
    guardians           {student_id: {guardian_id, ...}}
    suppressed          lower-cased emails on crm_suppressions
    """
    users = list(users)
    by_id = {u['id']: u for u in users}

    children: Dict[str, Set[str]] = {}
    for student_id, parent_ids in guardians.items():
        for parent_id in parent_ids:
            children.setdefault(parent_id, set()).add(student_id)

    people = []
    for u in users:
        email = (u.get('email') or '').strip()
        if not email:
            continue
        kids = sorted(children.get(u['id'], ()))
        class_ids = set(classes_by_student.get(u['id'], ()))
        child_class_ids: Set[str] = set()
        for kid in kids:
            child_class_ids |= classes_by_student.get(kid, set())
        people.append({
            'id': u['id'],
            'name': display_name(u),
            'email': email,
            'roles': roles_of(u),
            'organization_id': u.get('organization_id'),
            'class_ids': sorted(class_ids),
            'child_class_ids': sorted(child_class_ids),
            'children': [display_name(by_id[k]) for k in kids if k in by_id],
            'last_active': u.get('last_active'),
            'created_at': u.get('created_at'),
            'suppressed': email.lower() in suppressed,
            'deleting': (u.get('deletion_status') or 'none') != 'none',
        })
    people.sort(key=lambda p: (p['name'] or '').lower())
    return people


def clean_list_payload(data: Dict[str, Any], *, partial: bool = False) -> Dict[str, Any]:
    """The writable fields of a saved list, validated. Raises ValueError with
    a message the route returns as a 400."""
    out: Dict[str, Any] = {}
    if 'name' in data or not partial:
        name = (data.get('name') or '').strip()
        if not name:
            raise ValueError('A list needs a name')
        out['name'] = name[:200]
    if 'description' in data:
        out['description'] = (data.get('description') or '').strip() or None
    if 'filters' in data or not partial:
        filters = data.get('filters') or {}
        if not isinstance(filters, dict):
            raise ValueError('filters must be an object')
        out['filters'] = filters
    for key in ('include_ids', 'exclude_ids'):
        if key in data or not partial:
            ids = data.get(key) or []
            if not isinstance(ids, list) or not all(isinstance(i, str) and i for i in ids):
                raise ValueError(f'{key} must be a list of user ids')
            out[key] = sorted(set(ids))
    return out
