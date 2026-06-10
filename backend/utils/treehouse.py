"""
Shared helpers for The Treehouse program, kept out of routes/ to avoid circular
imports (completion / bounties / personalization all need the membership check).

Org gating is by organizations.slug = 'treehouse'. These read with whatever client
is passed (routes pass the admin client).
"""

TREEHOUSE_SLUG = 'treehouse'
_cache = {}


def get_treehouse_org_id(client):
    """Return the Treehouse org id (cached per process), or None if it doesn't exist."""
    if 'org_id' in _cache:
        return _cache['org_id']
    res = client.table('organizations').select('id').eq('slug', TREEHOUSE_SLUG).limit(1).execute()
    org_id = res.data[0]['id'] if res.data else None
    _cache['org_id'] = org_id
    return org_id


def is_treehouse_member(client, user_id):
    """True if the user belongs to the Treehouse organization."""
    if not user_id:
        return False
    org_id = get_treehouse_org_id(client)
    if not org_id:
        return False
    u = client.table('users').select('organization_id').eq('id', user_id).limit(1).execute()
    return bool(u.data) and u.data[0].get('organization_id') == org_id


def notify_facilitators_of_completion(client, notifications, student_id, org_id,
                                      task_title, quest_completed, quest_title=None):
    """Notify all Treehouse facilitators (org_admin/advisor) that a student completed work."""
    s = client.table('users').select('first_name, display_name').eq('id', student_id).limit(1).execute()
    sname = 'A student'
    if s.data:
        sname = s.data[0].get('first_name') or s.data[0].get('display_name') or sname
    facs = client.table('users').select('id, org_role, org_roles').eq('organization_id', org_id).execute().data or []
    if quest_completed:
        ntype = 'treehouse_quest_completed'
        title = f"{sname} finished a quest!"
        message = quest_title or 'A quest is complete — time to celebrate.'
    else:
        ntype = 'treehouse_task_completed'
        title = f"{sname} completed a task"
        message = task_title or 'A task was completed.'
    for f in facs:
        roles = set([f.get('org_role')]) | set(f.get('org_roles') or [])
        if roles & {'org_admin', 'advisor'}:
            try:
                notifications.create_notification(
                    user_id=f['id'], notification_type=ntype, title=title, message=message,
                    link='/treehouse/facilitator', organization_id=org_id,
                    metadata={'student_id': student_id})
            except Exception:
                pass
