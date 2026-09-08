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


from utils.timestamps import now_iso  # noqa: E402


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


# ── Duplicating an existing quest ─────────────────────────────────────────────
# iCreate, 2026-09-07 (45c7ced1): "Can I please duplicate quests so I don't have
# to start over every time?" A school's quests are mostly variations on each
# other -- the same shape of work with a different subject -- and the only way
# to make the second one was to retype the first, tasks and all.
#
# The copy is ALWAYS org-owned, whatever the source was. That is what makes
# duplicating an Optio-library quest safe and useful at the same time: the
# school gets an editable quest of its own, and the shared original is not
# touched. It is also why this cannot be a plain row copy -- is_public and
# organization_id have to be forced, not inherited.

# Copied verbatim onto the new quest. Everything absent from this list is
# deliberately not copied: identity (id, created_*), anything that belongs to a
# particular delivery of the quest (lms_*, lti_*, class_review_*), and the
# lifecycle flags a copy should start clean on (archived_at, deactivated_at,
# requires_review).
_COPIED_QUEST_FIELDS = (
    'description', 'big_idea', 'header_image_url', 'image_url',
    'image_search_term', 'material_link', 'curriculum_content',
    'topics', 'topic_primary', 'approach_examples', 'allow_custom_tasks',
    'xp_threshold', 'transcript_subject', 'recommended_age', 'source_material',
    'is_v3', 'quest_type', 'metadata',
)

_COPIED_TASK_FIELDS = (
    'title', 'description', 'pillar', 'xp_value', 'is_required', 'ai_generated',
)


def copy_title(existing_titles, title):
    """"Watercolor Basics" -> "Watercolor Basics (copy)", then "(copy 2)"...

    Teachers duplicate the same quest more than once, and two rows with the same
    name in the library is the thing that makes a duplicate feature useless.
    """
    base = (title or 'Untitled quest').strip()[:MAX_TITLE_LEN]
    taken = {t.strip().lower() for t in existing_titles if t}
    candidate = f'{base} (copy)'
    n = 1
    while candidate.strip().lower() in taken:
        n += 1
        candidate = f'{base} (copy {n})'
    return candidate[:MAX_TITLE_LEN]


def duplicate_org_quest(admin, *, org_id, user_id, source_quest_id, title=None):
    """Copy a quest and its preset tasks into a new quest owned by `org_id`.

    Returns {'quest_id', 'title', 'task_count'}. Raises QuestAuthoringError.

    The caller decides what the copy is attached to (a curriculum, a class),
    exactly as with create_org_quest -- this writes the quest and its tasks and
    nothing else.
    """
    rows = (admin.table('quests').select('*')
            .eq('id', source_quest_id).limit(1).execute()).data
    if not rows:
        raise QuestAuthoringError('Quest not found.', 404)
    source = rows[0]

    if title:
        new_title = (title or '').strip()[:MAX_TITLE_LEN]
        if not new_title:
            raise QuestAuthoringError('A quest title is required.')
    else:
        # Only this org's own titles: a library quest's name being taken
        # somewhere else is not this school's problem.
        mine = (admin.table('quests').select('title')
                .eq('organization_id', org_id).execute()).data or []
        new_title = copy_title([r.get('title') for r in mine], source.get('title'))

    payload = {k: source.get(k) for k in _COPIED_QUEST_FIELDS if source.get(k) is not None}
    payload.update({
        'title': new_title,
        # Forced, never inherited -- see the note above.
        'organization_id': org_id,
        'is_public': False,
        'is_active': True,
        'created_by': user_id,
        'created_at': now_iso(),
        'updated_at': now_iso(),
    })
    quest_row = admin.table('quests').insert(payload).execute().data
    if not quest_row:
        raise QuestAuthoringError('Could not duplicate the quest.', 500)
    quest_id = quest_row[0]['id']

    # Tasks after the quest row, for the same reason create_org_quest does it:
    # a failure part-way leaves a reachable quest with fewer tasks, not orphans.
    source_tasks = (admin.table('quest_template_tasks').select('*')
                    .eq('quest_id', source_quest_id).order('order_index').execute()).data or []
    copies = []
    for i, t in enumerate(source_tasks):
        copy = {k: t.get(k) for k in _COPIED_TASK_FIELDS}
        copy.update({
            'quest_id': quest_id,
            # Renumbered from 0: the source's indexes can have gaps after
            # deletes, and the copy has no reason to inherit them.
            'order_index': i,
            'created_at': now_iso(),
            'updated_at': now_iso(),
        })
        copies.append(copy)
    if copies:
        admin.table('quest_template_tasks').insert(copies).execute()

    return {'quest_id': quest_id, 'title': new_title, 'task_count': len(copies)}


def duplicate_template_task(admin, source_task, quest_id):
    """Copy one preset task to the end of `quest_id`. Returns the new row.

    iCreate, 2026-09-07 (4da3680d): "I'd also like to be able to duplicate
    tasks." Shared by the curriculum and class routes, which had two copies of
    the "what is the next order_index" read already.
    """
    last = (admin.table('quest_template_tasks').select('order_index')
            .eq('quest_id', quest_id).order('order_index', desc=True)
            .limit(1).execute()).data
    next_order = ((last[0]['order_index'] or 0) + 1) if last else 0
    copy = {k: source_task.get(k) for k in _COPIED_TASK_FIELDS}
    copy.update({
        'quest_id': quest_id,
        'order_index': next_order,
        'created_at': now_iso(),
        'updated_at': now_iso(),
    })
    rows = admin.table('quest_template_tasks').insert(copy).execute().data
    return rows[0] if rows else None
