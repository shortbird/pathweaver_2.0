"""
Who may edit a school's quest. One rule, read by every route that writes one.

Owner decision, 2026-09-23 (docs/icreate/TASKS_MESSAGING_QUESTS_PLAN_2026-09-23.md,
P6): a teacher edits only the quests THEY created, plus their own class's
settings for any quest on it (due date, release date, who it is for, and the
XP to finish when the office has not locked it). The office -- org_admin,
campus_coordinator, superadmin -- edits every quest the school owns.

That replaced a looser rule. Until then a teacher could edit any school quest
that sat on a class they taught (iCreate, 2026-08-27: "Is it because I
originally created the quest while logged in as an administrator?"), which is
also how a teacher could rename a quest the office wrote for every section and
change it for all of them. The class settings stayed theirs; the quest itself
is the author's or the office's.

A quest with no recorded author (16 school quests on 2026-09-23, all older than
the column being filled everywhere) counts as the office's: nobody can show it
is theirs, so no teacher may edit it.

An Optio-library quest (organization_id NULL) is never editable from a school:
it is shared with every school on the platform. Duplicate it to make it yours.

The class-settings half is not here. It lives on the class routes, which check
the class moderator gate and, for the XP to finish, the office's
teachers_may_change_xp lock.
"""

from typing import Any, Dict, Optional

from services import sis_service


def is_school_admin(user_id: str, org_id: Optional[str]) -> bool:
    """The office of THIS school: an admin-tier caller whose org is org_id.

    A superadmin passes for any org, which is what resolve_org_id already
    says for them when the org is named.
    """
    if not org_id:
        return False
    if not sis_service.caller_is_admin(user_id):
        return False
    return sis_service.resolve_org_id(user_id, org_id) == org_id


def can_edit_quest(user_id: str, quest: Dict[str, Any]) -> bool:
    """True when this person may change the quest itself: its title, words,
    header image, tasks, attachments, finish line and settings."""
    org_id = (quest or {}).get('organization_id')
    if not org_id:
        return False
    if is_school_admin(user_id, org_id):
        return True
    if not quest.get('created_by') or quest.get('created_by') != user_id:
        return False
    # Their own quest, and they are still at that school. resolve_org_id hands
    # a non-superadmin their own org whatever they ask for.
    return sis_service.resolve_org_id(user_id, org_id) == org_id


def refusal(quest: Dict[str, Any]) -> str:
    """What the editor says when can_edit_quest is False, in plain words."""
    if not (quest or {}).get('organization_id'):
        return ("This quest comes from the Optio library and is shared with other "
                "schools, so it can't be edited here. Duplicate it to make it yours.")
    return ("Only the person who made this quest, or your school office, can change it. "
            "You can still set its dates and who it is for on your class.")
