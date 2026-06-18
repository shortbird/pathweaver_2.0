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


def facilitators_for_student(client, org_id, student_id):
    """
    Facilitator user-ids to notify about a student's activity (A1 — cohort scoping).

    All org_admins, plus the advisors assigned to the student's active cohort(s).
    Falls back to all advisors when the student has no cohort, or the cohort has no
    assigned advisor yet, so nothing is silently dropped during setup.
    """
    facs = client.table('users').select('id, org_role, org_roles').eq('organization_id', org_id).execute().data or []
    admins, advisors = set(), set()
    for f in facs:
        roles = set([f.get('org_role')]) | set(f.get('org_roles') or [])
        if 'org_admin' in roles:
            admins.add(f['id'])
        elif 'advisor' in roles:
            advisors.add(f['id'])
    enr = (client.table('class_enrollments').select('class_id')
           .eq('student_id', student_id).eq('status', 'active').execute().data or [])
    class_ids = [e['class_id'] for e in enr]
    assigned = set()
    if class_ids:
        ca = (client.table('class_advisors').select('advisor_id')
              .in_('class_id', class_ids).eq('is_active', True).execute().data or [])
        assigned = {r['advisor_id'] for r in ca} & advisors
    # Cohort-assigned advisors if any, else every advisor (fallback); admins always.
    return list(admins | (assigned if assigned else advisors))


def notify_facilitators_of_completion(client, notifications, student_id, org_id,
                                      task_title, quest_completed, quest_title=None):
    """Notify the student's Treehouse facilitators (cohort-scoped) that they completed work."""
    s = client.table('users').select('first_name, display_name').eq('id', student_id).limit(1).execute()
    sname = 'A student'
    if s.data:
        sname = s.data[0].get('first_name') or s.data[0].get('display_name') or sname
    target_ids = facilitators_for_student(client, org_id, student_id)
    if quest_completed:
        ntype = 'treehouse_quest_completed'
        title = f"{sname} finished a quest!"
        message = quest_title or 'A quest is complete — time to celebrate.'
    else:
        ntype = 'treehouse_task_completed'
        title = f"{sname} completed a task"
        message = task_title or 'A task was completed.'
    for fid in target_ids:
        try:
            notifications.create_notification(
                user_id=fid, notification_type=ntype, title=title, message=message,
                link='/treehouse/facilitator', organization_id=org_id,
                metadata={'student_id': student_id})
        except Exception:
            pass
