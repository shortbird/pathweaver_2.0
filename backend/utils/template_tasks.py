"""
Shared helper for materializing a quest's facilitator-authored template tasks
into a student's enrollment. Every path that creates a user_quests row outside
the student-initiated enroll endpoint (advisor direct assignment, invitation
accept) must use this so assigned students land on the creator's task list
instead of the personalization wizard.
"""
import logging

logger = logging.getLogger(__name__)


def get_valid_source_template_ids(admin, template_tasks):
    """
    Return the subset of the given tasks' ids that currently exist in
    quest_template_tasks.

    user_quest_tasks.source_template_task_id has a foreign key to
    quest_template_tasks(id), but get_template_tasks() can return rows from the
    legacy fallback tables (course_quest_tasks / quest_sample_tasks) whose ids
    don't exist there, and a concurrent bulk task edit deletes-and-recreates a
    quest's template tasks, invalidating ids fetched moments earlier. Any id
    not returned here must be inserted as NULL or the whole insert fails with
    an FK violation (source_task_id has no FK and still records provenance).
    """
    candidate_ids = [t.get('id') for t in (template_tasks or []) if t.get('id')]
    if not candidate_ids:
        return set()
    try:
        result = admin.table('quest_template_tasks')\
            .select('id')\
            .in_('id', candidate_ids)\
            .execute()
        return {r['id'] for r in (result.data or [])}
    except Exception as e:
        logger.warning(f"Could not validate template task ids, inserting without source refs: {e}")
        return set()


def load_template_tasks(quest_id):
    """A quest's authored task list, including the legacy fallback tables.

    Exists so a caller enrolling several people can load once and pass the
    result into each copy, without every such caller reaching into routes/ for
    itself (utils -> routes is a layer violation; this module is already the
    one place that does it).
    """
    from routes.quest_types import get_template_tasks

    return get_template_tasks(quest_id, filter_type='all') or []


def copy_template_tasks_to_enrollment(admin, quest_id, user_id, user_quest_id,
                                      template_tasks=None):
    """
    Copy a quest's template tasks into user_quest_tasks for one enrollment and,
    when any were copied, mark the enrollment's personalization as complete so
    the wizard never shows. Returns the number of tasks inserted.

    template_tasks may be passed in when the caller already loaded them (bulk
    assignment loads once per quest); otherwise they are fetched here.
    """
    if template_tasks is None:
        template_tasks = load_template_tasks(quest_id)
    if not template_tasks:
        return 0

    valid_template_ids = get_valid_source_template_ids(admin, template_tasks)

    tasks_to_insert = [{
        'user_id': user_id,
        'quest_id': quest_id,
        'user_quest_id': user_quest_id,
        'title': t['title'],
        'description': t.get('description', ''),
        'pillar': t['pillar'],
        'xp_value': t.get('xp_value', 100),
        'order_index': t.get('order_index', 0),
        'is_required': t.get('is_required', False),
        'is_manual': False,
        'approval_status': 'approved',
        'diploma_subjects': t.get('diploma_subjects', ['Electives']),
        'subject_xp_distribution': t.get('subject_xp_distribution'),
        'source_template_task_id': t.get('id') if t.get('id') in valid_template_ids else None,
        'source_task_id': t.get('id'),
    } for t in template_tasks]

    try:
        admin.table('user_quest_tasks').insert(tasks_to_insert).execute()
    except Exception as task_err:
        logger.error(
            f"Error copying template tasks for user {user_id} on quest {quest_id}: {task_err}",
            exc_info=True,
        )
        return 0

    try:
        admin.table('user_quests')\
            .update({'personalization_completed': True})\
            .eq('id', user_quest_id)\
            .execute()
    except Exception as e:
        logger.warning(f"Failed to mark personalization complete for enrollment {user_quest_id}: {e}")

    return len(tasks_to_insert)

def _title_key(title):
    """How a template task and an already-copied one are recognised as the same
    thing. Ids cannot do it: saving a training quest deletes and recreates the
    whole template, so every id changes on every save, and the copies'
    source_template_task_id is set to NULL by the FK as the old rows go."""
    return ' '.join((title or '').split()).casefold()


def _task_fields(tmpl, valid_template_ids):
    """The columns a user_quest_tasks row takes from a template task."""
    return {
        'title': tmpl['title'],
        'description': tmpl.get('description', ''),
        'pillar': tmpl['pillar'],
        'xp_value': tmpl.get('xp_value', 100),
        'order_index': tmpl.get('order_index', 0),
        'is_required': tmpl.get('is_required', False),
        'diploma_subjects': tmpl.get('diploma_subjects', ['Electives']),
        'subject_xp_distribution': tmpl.get('subject_xp_distribution'),
        'source_template_task_id': (tmpl.get('id')
                                    if tmpl.get('id') in valid_template_ids else None),
        'source_task_id': tmpl.get('id'),
    }


def _tasks_carrying_work(admin, quest_id, task_ids):
    """Task ids with a completion or an evidence document (drafts included).

    Read fresh at every call, which is the point: families submit while this
    runs. Raises rather than returning a partial set — a caller that cannot see
    the work must not go on to delete anything.
    """
    from utils.db_fetch import fetch_all_rows

    ids = set()
    for row in fetch_all_rows(lambda: (
        admin.table('quest_task_completions').select('id, user_quest_task_id')
        .eq('quest_id', quest_id)
    )):
        if row.get('user_quest_task_id'):
            ids.add(row['user_quest_task_id'])

    # No quest_id of its own, so this one is asked by task id, chunked because
    # in_() goes into the URL.
    task_ids = list(task_ids)
    for i in range(0, len(task_ids), 200):
        rows = (admin.table('user_task_evidence_documents').select('task_id')
                .in_('task_id', task_ids[i:i + 200]).execute()).data or []
        ids.update(r['task_id'] for r in rows if r.get('task_id'))
    return ids


def resync_enrollments_to_template(admin, quest_id, template_tasks=None):
    """Bring every existing enrollment onto the quest's current template.

    Saving a training quest used to change only what FUTURE enrollees received.
    For a school's orientation quest that is the wrong default: the admin edits
    it *because* the families holding it need the new wording, and there was no
    way to give it to them — iCreate saved a fix mid-orientation and all 152
    families stayed on the previous copy (2026-08-18).

    Rows are REWRITTEN IN PLACE rather than deleted and recreated, and that is
    the whole safety argument:

        quest_task_completions.user_quest_task_id and
        user_task_evidence_documents.task_id are both ON DELETE CASCADE.
        Deleting a task row destroys the completion, the XP it awarded and any
        uploaded evidence with it. Families submit work while this runs, so a
        row that looked safe when it was read can carry somebody's photo by the
        time a delete lands. An UPDATE cannot cascade, so the worst a race can
        do here is retitle a task somebody just finished — recoverable, where a
        cascade is not.

    A row already carrying work is not touched at all, and the template task
    matching its title is not written over the top of it. Surplus rows — tasks
    the admin removed — are the only deletes, and each is re-checked for work
    immediately beforehand.

    Returns {'enrollments', 'updated', 'inserted', 'removed', 'kept'}.
    """
    from utils.db_fetch import fetch_all_rows

    if template_tasks is None:
        template_tasks = load_template_tasks(quest_id)

    result = {'enrollments': 0, 'updated': 0, 'inserted': 0, 'removed': 0, 'kept': 0}

    enrollments = fetch_all_rows(lambda: (
        admin.table('user_quests').select('id, user_id, completed_at').eq('quest_id', quest_id)
    ))
    if not enrollments:
        return result
    result['enrollments'] = len(enrollments)

    existing = fetch_all_rows(lambda: (
        admin.table('user_quest_tasks').select('id, user_id, user_quest_id, title, order_index')
        .eq('quest_id', quest_id)
    ))

    try:
        protected = _tasks_carrying_work(admin, quest_id, [t['id'] for t in existing])
    except Exception as e:  # noqa: BLE001 — no probe, no writes
        logger.error(f"Could not read prior work for quest {quest_id}; "
                     f"leaving enrollments untouched: {e}")
        result['error'] = str(e)
        return result

    valid_template_ids = get_valid_source_template_ids(admin, template_tasks)

    by_enrollment = {}
    for row in existing:
        by_enrollment.setdefault(row['user_quest_id'], []).append(row)

    updates, inserts, surplus = [], [], []
    for enrollment in enrollments:
        mine = sorted(by_enrollment.get(enrollment['id'], []),
                      key=lambda r: (r.get('order_index') or 0, r['id']))
        keep_titles, free = set(), []
        for row in mine:
            if row['id'] in protected:
                keep_titles.add(_title_key(row['title']))
                result['kept'] += 1
            else:
                free.append(row)

        # Template tasks this person does not already hold as finished work.
        needed = [t for t in template_tasks if _title_key(t['title']) not in keep_titles]

        for row, tmpl in zip(free, needed):
            updates.append((row['id'], tmpl))
        for tmpl in needed[len(free):]:
            inserts.append((enrollment['user_id'], enrollment['id'], tmpl))
        surplus.extend(r['id'] for r in free[len(needed):])

    for task_id, tmpl in updates:
        try:
            admin.table('user_quest_tasks').update(
                _task_fields(tmpl, valid_template_ids)).eq('id', task_id).execute()
            result['updated'] += 1
        except Exception as e:  # noqa: BLE001 — one row must not stop the rest
            logger.error(f"Could not rewrite task {task_id} on quest {quest_id}: {e}")

    if inserts:
        rows = [{'user_id': uid, 'quest_id': quest_id, 'user_quest_id': uqid,
                 'is_manual': False, 'approval_status': 'approved',
                 **_task_fields(tmpl, valid_template_ids)}
                for uid, uqid, tmpl in inserts]
        for i in range(0, len(rows), 200):
            chunk = rows[i:i + 200]
            try:
                admin.table('user_quest_tasks').insert(chunk).execute()
                result['inserted'] += len(chunk)
            except Exception as e:  # noqa: BLE001
                logger.error(f"Could not add tasks on quest {quest_id}: {e}")

        # An enrollment that was already finished is not finished any more once
        # the template grew — without this, a student who completed the quest
        # before the teacher added a task keeps a "complete" quest carrying an
        # unfinished task, and the new task never surfaces as work to do
        # (Gryffin, 2026-08-28). Completion re-stamps itself when the student
        # finishes the added task; the completion bonus is 0 so nothing can be
        # double-awarded.
        reopened = {uqid for _uid, uqid, _t in inserts
                    if next((e for e in enrollments if e['id'] == uqid), {}).get('completed_at')}
        if reopened:
            try:
                admin.table('user_quests').update({'completed_at': None})\
                    .in_('id', list(reopened)).execute()
                result['reopened'] = len(reopened)
            except Exception as e:  # noqa: BLE001
                logger.error(f"Could not reopen completed enrollments on quest {quest_id}: {e}")

    # Re-read work immediately before deleting: somebody may have submitted
    # since the snapshot, and a cascade is the one unrecoverable outcome here.
    if surplus:
        try:
            fresh = _tasks_carrying_work(admin, quest_id, surplus)
        except Exception as e:  # noqa: BLE001
            logger.error(f"Could not re-check work before removing surplus tasks "
                         f"on quest {quest_id}; keeping them: {e}")
            fresh = set(surplus)
        safe = [i for i in surplus if i not in fresh]
        if len(safe) != len(surplus):
            logger.warning(f"{len(surplus) - len(safe)} surplus tasks on quest "
                           f"{quest_id} gained work mid-run and were kept")
        for i in range(0, len(safe), 100):
            chunk = safe[i:i + 100]
            try:
                admin.table('user_quest_tasks').delete().in_('id', chunk).execute()
                result['removed'] += len(chunk)
            except Exception as e:  # noqa: BLE001
                logger.error(f"Could not remove surplus tasks on quest {quest_id}: {e}")

    try:
        admin.table('user_quests').update({'personalization_completed': True})\
            .eq('quest_id', quest_id).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Could not mark personalization complete for {quest_id}: {e}")

    return result
