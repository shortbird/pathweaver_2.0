"""
Turn one person's task list on a quest into the quest's authored task list.

A teacher builds a quest the way a student does: pick it up, take the AI
paths, keep what they like, add more. Those rows are user_quest_tasks on THEIR
enrollment, in whatever shape the wizard that wrote them used. The template
editor (PUT /api/admin/quests/<id>/template-tasks) wants one shape: a subject
key list plus a {subject_key: xp} split. This is the translation, with no
database in it so it can be tested on the shapes we have actually seen.
"""
from utils.school_subjects import normalize_subject_key


def _subject_keys(raw):
    """Subject keys from whatever diploma_subjects holds.

    Seen in production on the same quest: ['Electives'] from an AI path,
    {'Fine Arts': 75} from the personalization wizard, ['fine_arts'] from the
    template editor. Unrecognised names are dropped rather than guessed.
    """
    if isinstance(raw, dict):
        names = raw.keys()
    elif isinstance(raw, (list, tuple)):
        names = raw
    else:
        names = []
    keys = []
    for name in names:
        key = normalize_subject_key(str(name)) if name else None
        if key and key not in keys:
            keys.append(key)
    return keys


def _split(task, subjects):
    """{subject_key: xp} for the task.

    The stored split wins when it has one. Otherwise the pillar XP is shared
    across the named subjects, remainder to the first, which is what the
    template editor does on load so the row's total stays honest. No subjects
    at all leaves it empty for the classifier.
    """
    stored = task.get('subject_xp_distribution')
    if isinstance(stored, dict) and stored:
        split = {}
        for name, xp in stored.items():
            key = normalize_subject_key(str(name)) if name else None
            if key:
                split[key] = split.get(key, 0) + int(xp or 0)
        if split:
            return split

    xp = int(task.get('xp_value') or 0)
    if not subjects or xp <= 0:
        return {}
    per, remainder = divmod(xp, len(subjects))
    return {s: per + (remainder if i == 0 else 0) for i, s in enumerate(subjects)}


def enrollment_tasks_as_template(tasks):
    """user_quest_tasks rows -> the payload the template editor saves.

    Order is the order the person sees: order_index, then creation time for
    rows sharing one (the wizard writes several at once). Only approved rows
    count; a task still waiting on a teacher is not something to hand every
    student. order_index is renumbered from zero, as the editor does.
    """
    approved = [t for t in (tasks or [])
                if t.get('title') and t.get('approval_status') in (None, 'approved')]
    approved.sort(key=lambda t: (
        t.get('order_index') if t.get('order_index') is not None else 0,
        t.get('created_at') or '',
    ))

    rows = []
    for i, task in enumerate(approved):
        split = _split(task, _subject_keys(task.get('diploma_subjects')))
        subjects = list(split.keys()) or _subject_keys(task.get('diploma_subjects'))
        rows.append({
            'title': task['title'],
            'description': task.get('description') or '',
            'pillar': task.get('pillar') or 'stem',
            'xp_value': int(task.get('xp_value') or 0),
            'order_index': i,
            'is_required': bool(task.get('is_required')),
            'diploma_subjects': subjects,
            'subject_xp_distribution': split,
        })
    return rows
