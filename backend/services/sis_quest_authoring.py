"""
Building a school's own quest: the rules, in one place.

A quest a school authors is a `quests` row plus its preset `quest_template_tasks`
— the tasks every learner receives when they start it. Two screens now create
one: a class's Quests tab (routes/sis/class_quests.py) and the curriculum library
(routes/sis/curriculum.py). They differ only in what the finished quest is
attached to, so the creation itself lives here rather than in either of them.

The rules this file owns are the ones a second copy would drift on: the pillar
key the DB actually stores, the diploma subjects the work earns credit toward,
the XP floor, the task cap, and the fact that the quest row is written before
its tasks (a failure part-way leaves a reachable quest with fewer tasks, not an
orphaned task set).
"""


from utils.logger import get_logger
from utils.school_subjects import default_subjects_for_pillar, normalize_subject_key
from utils.subject_xp import get_subject_xp_distribution

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

# Matches validate_school_subjects in utils/school_subjects.
MAX_SUBJECTS = 5


class QuestAuthoringError(Exception):
    """A rejection the caller should return verbatim to the client."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


from utils.timestamps import now_iso  # noqa: E402


from utils.template_tasks import _title_key


def norm_pillar(value):
    return PILLAR_ALIASES.get((value or '').strip().lower(), DEFAULT_PILLAR)


def clean_subjects(raw_subjects, raw_distribution, xp_value, pillar):
    """(diploma_subjects, subject_xp_distribution) for one preset task.

    The SIS task editors wrote neither column until 2026-09-09. Both tables
    DEFAULT diploma_subjects to ['Electives'], so every task a school typed in
    was credited as an elective -- Gryffin's whole US History unit among them,
    and 1041 XP of one student's pending credit with it. Nothing on screen said
    so, because the screens had no subject field to disagree with.

    The split is stored as XP AMOUNTS, not percentages: that is what
    utils.subject_xp reads back at credit-request and finalize time. Producing
    it through get_subject_xp_distribution rather than dividing here is
    deliberate -- rounding to fives and making the parts sum to xp_value is
    exactly what the read path does, so a second copy of that arithmetic is a
    second answer to "how much Social Studies is this worth".

    An empty or unrecognized subject list falls back to the pillar rather than
    to Electives. Sending subjects with no split divides the XP evenly.
    """
    keys = []
    for raw in (raw_subjects or []):
        key = normalize_subject_key(raw if isinstance(raw, str) else '')
        if key and key not in keys:
            keys.append(key)
    if not keys:
        keys = default_subjects_for_pillar(pillar)
    keys = keys[:MAX_SUBJECTS]

    # Amounts the caller gave for subjects it actually asked for. Anything else
    # in the dict is ignored: a stale entry for a subject just removed would
    # otherwise keep drawing XP.
    amounts = {}
    if isinstance(raw_distribution, dict):
        for raw, value in raw_distribution.items():
            key = normalize_subject_key(raw if isinstance(raw, str) else '')
            if key in keys and isinstance(value, (int, float)) and value > 0:
                amounts[key] = amounts.get(key, 0) + value

    # Scale to the task's XP by SHARE before handing over. Amounts that already
    # sum to xp_value pass through untouched; ones that do not are a ratio, and
    # get_subject_xp_distribution would not treat them as one -- its correction
    # puts the whole difference on the largest entry, which is right for a
    # rounding remainder and badly wrong for a rescale. A 75/25 task edited from
    # 100 XP to 200 came out 175/25 that way instead of 150/50.
    total = sum(amounts.values())
    if total and total != xp_value:
        amounts = {k: v * xp_value / total for k, v in amounts.items()}

    task_data = {'diploma_subjects': keys, 'subject_xp_distribution': amounts}
    distribution = get_subject_xp_distribution(task_data, xp_value)
    # get_subject_xp_distribution drops a subject whose share rounds to nothing,
    # so the list follows the split rather than promising credit that is not
    # there.
    return list(distribution.keys()) or keys, distribution


def subject_updates(current, data, updates):
    """The subject columns a task PATCH should also write, or {}.

    Shared by the class and curriculum task editors, which are the same editor
    against two different parents. `current` is the row as it stands, `data` the
    request body, `updates` the columns already being written.

    Two things move the split:

      - the caller named subjects, or
      - the caller changed the XP. The split is stored as amounts, so a task
        edited from 100 XP to 200 would otherwise keep a 100 XP split and the
        credit shown on the task would stop matching the credit paid for it.
    """
    named_subjects = 'diploma_subjects' in data
    named_split = 'subject_xp_distribution' in data
    if not named_subjects and not named_split and 'xp_value' not in updates:
        return {}

    if named_subjects:
        raw_subjects = data['diploma_subjects']
        # A changed subject list with no amounts means "divide it across these".
        # Carrying the old amounts forward would hand a newly added subject
        # nothing, which is the opposite of what adding it asked for.
        raw_split = data.get('subject_xp_distribution')
    else:
        raw_subjects = current.get('diploma_subjects')
        raw_split = (data['subject_xp_distribution'] if named_split
                     else current.get('subject_xp_distribution'))

    subjects, distribution = clean_subjects(
        raw_subjects, raw_split,
        updates.get('xp_value', current.get('xp_value') or DEFAULT_XP),
        updates.get('pillar', current.get('pillar')))
    return {'diploma_subjects': subjects, 'subject_xp_distribution': distribution}


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
    pillar = norm_pillar(raw.get('pillar'))
    # Accepts school_subjects too: that is the name the AI drafter's task shape
    # uses, and a draft goes straight into this form.
    subjects, distribution = clean_subjects(
        raw.get('diploma_subjects') or raw.get('school_subjects'),
        raw.get('subject_xp_distribution'), xp, pillar)
    return {
        'title': title[:MAX_TITLE_LEN],
        'description': (raw.get('description') or '').strip(),
        'pillar': pillar,
        'xp_value': xp,
        'is_required': bool(raw.get('is_required', True)),
        'order_index': order_index,
        'ai_generated': bool(raw.get('ai_generated', False)),
        # Explicit, never left to the column default -- see clean_subjects.
        'diploma_subjects': subjects,
        'subject_xp_distribution': distribution,
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
    # Without these two a duplicate silently re-defaults to Electives, so
    # copying a correctly-credited task produced a wrongly-credited one.
    'diploma_subjects', 'subject_xp_distribution',
)


def _copy_task_fields(source):
    """The columns a duplicated preset task takes from the one it copies.

    Copying the subject columns by name is not enough on its own: a source row
    written before the SIS wrote subjects has them NULL, and a NULL copied
    EXPLICITLY skips the column default and lands as NULL, which reads back as
    no credit at all. So a source with nothing to copy is filled in from its
    pillar, the same way a freshly typed task is.
    """
    copy = {k: source.get(k) for k in _COPIED_TASK_FIELDS}
    subjects, distribution = clean_subjects(
        copy.get('diploma_subjects'), copy.get('subject_xp_distribution'),
        copy.get('xp_value') or DEFAULT_XP, copy.get('pillar'))
    copy['diploma_subjects'] = subjects
    copy['subject_xp_distribution'] = distribution
    return copy


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
        copy = _copy_task_fields(t)
        copy.update({
            'quest_id': quest_id,
            # Renumbered from 0: the source's indexes can have gaps after
            # deletes, and the copy has no reason to inherit them.
            'order_index': i,
            'created_at': now_iso(),
            'updated_at': now_iso(),
        })
        copies.append(copy)
    new_tasks = []
    if copies:
        new_tasks = (admin.table('quest_template_tasks').insert(copies)
                     .execute()).data or []

    # Carry the attachments across. A duplicate whose tasks arrive without their
    # worksheets is not a duplicate -- and the teacher who made it has no way to
    # tell, because the copy looks complete until a student opens step 3.
    #
    # Matched by ORDER INDEX, which is the only thing the source task and its
    # copy share (the copy has a new id, and titles repeat). Best-effort: a
    # duplicate that exists without its files is still usable; one that failed
    # outright is not.
    resource_count = 0
    try:
        task_id_map = {}
        for source_task, new_task in zip(source_tasks, new_tasks):
            if source_task.get('id') and new_task.get('id'):
                task_id_map[source_task['id']] = new_task['id']
        from services import quest_resource_service
        resource_count = quest_resource_service.copy_for_quest(
            source_quest_id, quest_id, task_id_map, org_id, user_id, admin=admin)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not copy resources onto quest {quest_id}: {e}')

    return {'quest_id': quest_id, 'title': new_title, 'task_count': len(copies),
            'resource_count': resource_count}


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
    copy = _copy_task_fields(source_task)
    copy.update({
        'quest_id': quest_id,
        'order_index': next_order,
        'created_at': now_iso(),
        'updated_at': now_iso(),
    })
    rows = admin.table('quest_template_tasks').insert(copy).execute().data
    return rows[0] if rows else None


def replace_template_tasks(admin, quest_id, cleaned):
    """Save an edited preset-task list WITHOUT churning the task ids.

    The training editor used to delete every quest_template_tasks row for the
    quest and insert the list again. Correct as far as the words on the page
    went, and quietly destructive of everything keyed on a task:

      * user_quest_tasks.source_template_task_id is FK'd to these rows, so every
        save NULLed the link between a student's copy and the template it came
        from. utils/template_tasks._title_key exists only to re-find them
        afterwards by matching titles -- which fails the moment a title is what
        the edit changed.
      * quest_resources hangs off task_id ON DELETE CASCADE. A teacher saving a
        typo in a quest description would have silently taken every file and
        link attached to its tasks with it.

    So: pair each submitted row to an existing one, update those, insert what is
    new, delete only what is genuinely gone. Pairing is by id when the form
    round-trips one, then by title, then by position -- three keys because the
    form has historically sent none, some, or all of them.

    `cleaned` is a list of insertable rows (see _clean_task / clean_task).
    Returns {'kept': n, 'added': n, 'removed': n}.
    """
    existing = (admin.table('quest_template_tasks')
                .select('id, title, order_index')
                .eq('quest_id', quest_id).order('order_index').execute()).data or []

    # A row with no id cannot be updated in place, so it is not a pairing
    # candidate at all -- fall through and let it be replaced.
    existing = [r for r in existing if r.get('id')]
    by_id = {r['id']: r for r in existing}
    by_title = {}
    for r in existing:
        by_title.setdefault(_title_key(r.get('title')), []).append(r)
    unclaimed = [r for r in existing]

    def _claim(row):
        if row in unclaimed:
            unclaimed.remove(row)
            return row
        return None

    paired, added = [], []
    for position, task in enumerate(cleaned):
        submitted_id = task.pop('id', None)
        match = None
        if submitted_id and submitted_id in by_id:
            match = _claim(by_id[submitted_id])
        if match is None:
            for candidate in by_title.get(_title_key(task.get('title')), []):
                match = _claim(candidate)
                if match:
                    break
        if match is None and position < len(existing):
            # Position last: a renamed task at the same place is still that task,
            # and its resources and its students' copies should follow the rename.
            match = _claim(existing[position])
        if match:
            paired.append((match['id'], task))
        else:
            added.append(task)

    for task_id, fields in paired:
        patch = {k: v for k, v in fields.items() if k != 'created_at'}
        admin.table('quest_template_tasks').update(patch).eq('id', task_id).execute()

    if added:
        for task in added:
            task['quest_id'] = quest_id
        admin.table('quest_template_tasks').insert(added).execute()

    removed_ids = [r['id'] for r in unclaimed]
    if removed_ids:
        # These really are gone from the list, so the cascade is what should
        # happen: their resources go with them.
        (admin.table('quest_template_tasks').delete()
         .in_('id', removed_ids).execute())

    return {'kept': len(paired), 'added': len(added), 'removed': len(removed_ids)}
