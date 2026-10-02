"""
A teacher's own copy of a quest on their class.

iCreate, 2026-10-01. Marika (167ba6df): "Teachers can't attach videos or links
any more. And can't edit the quests. I know we didn't want master library
quests edited, but we talked about allowing them to edit it and save it as
their own Teacher created ones?" Karin (60ffe195): "How can I copy a current
quest, so I can repeat the assignment for the next week/weeks?"

Since the P6 edit rule (services/quest_edit_rules, 2026-09-23) a teacher edits
only the quests they wrote. The way out the owner agreed is a copy: the
teacher duplicates the quest, becomes its author, and so may edit it -- words,
tasks, files and links. The original stays exactly as it was, on this class and
everywhere else, because it is somebody else's (or the whole platform's).

The copy starts as a DRAFT on this class (owner, 2026-10-02): no student gets
it until the teacher publishes it. A copy is made to be changed, and the first
version had it on the class and in students' accounts the moment it existed,
before the teacher had changed a word. So it uses the quest editor's own draft
(sis_quest_authoring: inactive, metadata.draft = {context 'class', target_id
the class}) -- the same thing "Create new" on a class starts -- which sits in
the class's Drafts list and goes on the class through the editor's "Publish to
class" (routes/sis/class_quests.publish_class_quest), with the class's normal
attach step: the class_quests link, the class's curricula, enrollment of the
students it is for.

The draft marker also carries the class settings the publish form starts from
(`class_settings`): the original's audience on this class -- a quest kept to
three students is copied for those three -- and none of its dates, since a
repeat for next week wants next week's dates, which the request may carry.
"""

from typing import Any, Dict, Optional

from repositories.class_quest_audience_repository import ClassQuestAudienceRepository
from repositories.quest_editor_repository import QuestEditorRepository
from services.sis_quest_authoring import QuestAuthoringError, duplicate_org_quest


def copyable(quest: Optional[Dict[str, Any]], org_id: str) -> bool:
    """The quests a class can copy: the school's own, or the public Optio
    library -- the same set a class may assign. A student's private quest made
    for the class (no school, not public) is theirs, never copied."""
    if not quest:
        return False
    if quest.get('organization_id') == org_id:
        return True
    return quest.get('organization_id') is None and bool(quest.get('is_public'))


def copy_class_quest(admin, *, class_row: Dict[str, Any], quest_id: str, user_id: str,
                     row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Copy a quest on `class_row` for `user_id`, as a draft for this class.

    `row` holds the class_quests fields the request named (publish_at,
    due_date, student_ids), already checked. They are kept on the draft as the
    publish form's starting values; nothing is put on the class, and nobody is
    enrolled, until the draft is published.

    Returns {'quest_id', 'title', 'task_count', 'resource_count',
    'source_quest_id', 'is_draft', 'publish_at', 'due_date', 'student_ids'}.
    Raises QuestAuthoringError before anything is written when the quest is not
    on this class (404) or cannot be copied (403).
    """
    org_id = class_row['organization_id']
    link = ClassQuestAudienceRepository(admin).link(class_row['id'], quest_id)
    if not link:
        raise QuestAuthoringError('That quest is not on this class.', 404)
    quest = QuestEditorRepository(client=admin).get_quest(quest_id)
    if not copyable(quest, org_id):
        raise QuestAuthoringError(
            "A student's own quest can't be copied. Open their work instead.", 403)

    fields = dict(row or {})
    if 'student_ids' not in fields and link.get('student_ids') is not None:
        fields['student_ids'] = link['student_ids']
    marker = {'context': 'class', 'target_id': class_row['id'], 'started_by': user_id,
              'copied_from': quest_id, 'class_settings': fields}
    out = duplicate_org_quest(admin, org_id=org_id, user_id=user_id,
                              source_quest_id=quest_id, draft_marker=marker)
    return {
        **out,
        'source_quest_id': quest_id,
        'is_draft': True,
        'publish_at': fields.get('publish_at'),
        'due_date': fields.get('due_date'),
        'student_ids': fields.get('student_ids'),
    }
