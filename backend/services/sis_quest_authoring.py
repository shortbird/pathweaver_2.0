"""
Building a school's own quest: the rules, in one place.

A quest a school authors is a `quests` row plus its preset `quest_template_tasks`
— the tasks every learner receives when they start it. Two screens now create
one: a class's Quests tab (routes/sis/class_quests.py) and the curriculum library
(routes/sis/curriculum.py). They differ only in what the finished quest is
attached to, so the creation itself lives here rather than in either of them.

The rules this file owns are the ones a second copy would drift on: the pillar
key the DB actually stores, the XP floor, the task cap, and the fact that the
quest row is written before its tasks (a failure part-way leaves a reachable
quest with fewer tasks, not an orphaned task set).
"""

from datetime import datetime, timezone

from utils.logger import get_logger

logger = get_logger(__name__)

MAX_TITLE_LEN = 300
MAX_TASKS = 40

# Canonical DB pillar keys (what quest_template_tasks.pillar / user_quest_tasks
# .pillar actually store), with the friendly aliases a client may send.
PILLAR_ALIASES = {
    'art': 'art', 'creativity': 'art', 'arts_creativity': 'art',
    'stem': 'stem', 'critical_thinking': 'stem',
    'communication': 'communication',
    'wellness': 'wellness', 'practical_skills': 'wellness',
    'civics': 'civics', 'cultural_literacy': 'civics',
}
DEFAULT_PILLAR = 'art'
DEFAULT_XP = 100
MIN_XP = 25


class QuestAuthoringError(Exception):
    """A rejection the caller should return verbatim to the client."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def norm_pillar(value):
    return PILLAR_ALIASES.get((value or '').strip().lower(), DEFAULT_PILLAR)


def clean_task(raw, order_index):
    """One submitted task row -> an insertable quest_template_tasks row.

    Returns None for a task with no title: the form ships with blank rows, and
    silently dropping the untouched ones is kinder than refusing the save.
    """
    title = (raw.get('title') or '').strip()
    if not title:
        return None
    try:
        xp = int(raw.get('xp_value') or DEFAULT_XP)
    except (TypeError, ValueError):
        xp = DEFAULT_XP
    xp = max(MIN_XP, xp)
    return {
        'title': title[:MAX_TITLE_LEN],
        'description': (raw.get('description') or '').strip(),
        'pillar': norm_pillar(raw.get('pillar')),
        'xp_value': xp,
        'is_required': bool(raw.get('is_required', True)),
        'order_index': order_index,
        'ai_generated': bool(raw.get('ai_generated', False)),
        'created_at': now_iso(),
        'updated_at': now_iso(),
    }


def validate_draft(title, raw_tasks):
    """Check a draft before anything is written. Raises QuestAuthoringError."""
    if not title:
        raise QuestAuthoringError('A quest title is required.')
    if len(title) > MAX_TITLE_LEN:
        raise QuestAuthoringError('Title is too long.')
    if len(raw_tasks or []) > MAX_TASKS:
        raise QuestAuthoringError(f'A quest can have at most {MAX_TASKS} tasks.')


def create_org_quest(admin, *, org_id, user_id, title, description, raw_tasks=None):
    """Create a school-owned quest and its preset tasks.

    The quest is private to the org (is_public False, organization_id set), which
    is what keeps a school's own material out of the shared Optio library and out
    of every other school's picker.

    Returns {'quest_id', 'task_count'}. Raises QuestAuthoringError on a bad draft
    or a failed insert; the caller decides what the quest gets attached to.
    """
    title = (title or '').strip()
    description = (description or '').strip()
    raw_tasks = raw_tasks or []
    validate_draft(title, raw_tasks)

    image_url = None
    try:
        from services.image_service import search_quest_image
        image_url = search_quest_image(title, description)
    except Exception as e:
        logger.warning(f'Quest image lookup failed (non-fatal): {e}')

    quest_row = admin.table('quests').insert({
        'title': title,
        'big_idea': description,
        'description': description,
        'is_v3': True,
        'is_active': True,
        'is_public': False,
        'quest_type': 'optio',
        'header_image_url': image_url,
        'image_url': image_url,
        'created_by': user_id,
        'created_at': now_iso(),
        'organization_id': org_id,
    }).execute().data
    if not quest_row:
        raise QuestAuthoringError('Could not create the quest.', 500)
    quest_id = quest_row[0]['id']

    cleaned = [t for t in (clean_task(r, i) for i, r in enumerate(raw_tasks)) if t]
    if cleaned:
        for t in cleaned:
            t['quest_id'] = quest_id
        admin.table('quest_template_tasks').insert(cleaned).execute()

    return {'quest_id': quest_id, 'task_count': len(cleaned)}
