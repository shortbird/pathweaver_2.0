"""
Getting a curriculum's teaching material in front of the students in its classes.

The curriculum library (routes/sis/curriculum.py) is where an admin attaches
quests and courses to a curriculum; the curriculum is attached to classes; the
students are enrolled in those classes. Until this module existed, that chain
stopped one link short of the student: /curriculum wrote sis_curriculum_quests
and nothing else, while students read class_quests. The only bridge was a button
a teacher had to press on the class's Quests tab, so a quest an admin attached in
/curriculum was invisible to every enrolled student until somebody noticed.

Observed in production (iCreate, 2026-09-02): every quest added from the CLASS
side had a matching class_quests row within a fraction of a second -- the
class->curriculum direction has auto-attached since 2026-08-31
(routes/sis/class_quests.py). The two added from the LIBRARY side, "The iCreate
Launch Challenge" and "Mastering the Cricut Maker Machine", had none. Twelve
enrolled students saw nothing. Horizon runs the identical path.

The two sets stay asymmetric, because they always were:

  - QUESTS are copied onto each class. A class quest carries its own publish_at
    and due_date and can be removed from one section without touching another,
    so it has to be a row of its own. The copy here is ADDITIVE ONLY: attaching
    pushes, detaching never pulls. Removing a quest from the library must not
    delete a section's due dates or yank work out from under students mid-term;
    pruning a class stays a decision made on that class.
  - COURSES are read live. A course carries no per-section state, so there is
    nothing to copy and nothing to go stale -- fixing the library fixes every
    class at once. curriculum_courses_for_class() is that read.
  - RESOURCES (links and documents, 2026-09-02) are read live for the same
    reason, and gated per row on visible_to_students -- a curriculum is also
    where answer keys live. curriculum_materials_for_class() is that read.
"""

from utils.logger import get_logger

logger = get_logger(__name__)


def assignable_quest_ids(admin, quest_ids, org_id):
    """Of `quest_ids`, the ones `org_id` may actually assign, in the given order.

    A curriculum link can outlive what it points at (the quest was deleted,
    archived, or a school-owned quest changed hands), so the set is re-checked on
    every push rather than trusted from when it was saved. Allowed: the org's own
    active quests, plus the public Optio library.
    """
    if not quest_ids:
        return []
    rows = (admin.table('quests')
            .select('id, organization_id, is_public, is_active')
            .in_('id', list(quest_ids)).execute()).data or []
    ok = set()
    for q in rows:
        if q.get('is_active') is False:
            continue
        if q.get('organization_id') == org_id or (
                q.get('organization_id') is None and q.get('is_public')):
            ok.add(q['id'])
    return [qid for qid in quest_ids if qid in ok]


def _active_class_ids(admin, curriculum_id):
    """Active classes attached to this curriculum.

    Archived sections are skipped: they are last year's, and the student view
    hides them anyway (ClassService.get_student_classes), so a row there would be
    invisible clutter that still shows up in a teacher's quest list.
    """
    links = (admin.table('sis_curriculum_classes').select('class_id')
             .eq('curriculum_id', curriculum_id).execute()).data or []
    ids = [l['class_id'] for l in links]
    if not ids:
        return []
    rows = (admin.table('org_classes').select('id')
            .in_('id', ids).eq('status', 'active').execute()).data or []
    return [r['id'] for r in rows]


def _curriculum_quest_ids(admin, curriculum_id):
    rows = (admin.table('sis_curriculum_quests').select('quest_id, sequence_order')
            .eq('curriculum_id', curriculum_id)
            .order('sequence_order').execute()).data or []
    return [r['quest_id'] for r in rows]


def push_curriculum_quests_to_classes(admin, curriculum_id, org_id, user_id,
                                      quest_ids=None, class_ids=None):
    """Put a curriculum's quests on its classes so enrolled students see them.

    Additive and idempotent. A quest already on a class is left exactly as it is,
    publish_at and due_date included -- re-running this changes nothing, which is
    what makes it safe to call on every library edit.

    quest_ids: which quests to push (default: the curriculum's whole set).
    class_ids: which classes to push onto (default: every active attached class).
               Passed explicitly when classes are newly attached, so an existing
               class isn't re-scanned for no reason.

    Returns {'classes': n, 'assignments': m} -- how many classes gained at least
    one quest, and how many rows were written. Callers surface these; an admin
    who attaches a quest should be told it reached 3 classes, not left guessing
    the way this bug left them guessing before.
    """
    wanted = quest_ids if quest_ids is not None else _curriculum_quest_ids(admin, curriculum_id)
    wanted = assignable_quest_ids(admin, wanted, org_id)
    if not wanted:
        return {'classes': 0, 'assignments': 0}

    targets = _active_class_ids(admin, curriculum_id)
    if class_ids is not None:
        # Narrowed by the caller (a class newly attached, say), but still only
        # the active ones -- the "active" rule is the module's, not the caller's.
        wanted_classes = {c for c in class_ids if c}
        targets = [c for c in targets if c in wanted_classes]
    if not targets:
        return {'classes': 0, 'assignments': 0}

    existing = (admin.table('class_quests').select('class_id, quest_id, sequence_order')
                .in_('class_id', targets).execute()).data or []
    have, next_order = {}, {}
    for r in existing:
        have.setdefault(r['class_id'], set()).add(r['quest_id'])
        order = r.get('sequence_order') or 0
        next_order[r['class_id']] = max(next_order.get(r['class_id'], -1), order)

    rows = []
    touched = set()
    for class_id in targets:
        seq = next_order.get(class_id, -1) + 1
        for quest_id in wanted:
            if quest_id in have.get(class_id, ()):
                continue
            rows.append({'class_id': class_id, 'quest_id': quest_id,
                         'added_by': user_id, 'sequence_order': seq})
            seq += 1
            touched.add(class_id)

    if rows:
        admin.table('class_quests').upsert(
            rows, on_conflict='class_id,quest_id').execute()
        # An assignment the student can't find isn't an assignment. Enroll each
        # affected class so the quest lands in their accounts like any other.
        from services.class_quest_enrollment import enroll_class_in_quests, enroll_safe
        by_class = {}
        for r in rows:
            by_class.setdefault(r['class_id'], []).append(r['quest_id'])
        for class_id, qids in by_class.items():
            enroll_safe(enroll_class_in_quests, admin, class_id, qids)
    return {'classes': len(touched), 'assignments': len(rows)}


def push_curriculum_quests_safe(admin, curriculum_id, org_id, user_id,
                                quest_ids=None, class_ids=None):
    """push_curriculum_quests_to_classes, but never raising.

    The library write has already committed by the time this runs. A failure to
    reach the classes must not turn a saved curriculum into a 500 the admin reads
    as "nothing saved" -- they would retry, and the retry is a no-op on the part
    that worked. Logged loudly instead, and the returned zeros are honest: the
    caller reports "0 classes", which is the signal that something needs a look.
    """
    try:
        return push_curriculum_quests_to_classes(
            admin, curriculum_id, org_id, user_id,
            quest_ids=quest_ids, class_ids=class_ids)
    except Exception as e:  # noqa: BLE001
        logger.warning(
            f'Curriculum {curriculum_id} saved but pushing its quests to classes failed: {e}')
        return {'classes': 0, 'assignments': 0}


def curriculum_courses_for_class(admin, class_id, published_only=True):
    """The courses a class inherits from its curricula, in library order.

    A live read, not a copy -- see the module docstring. Ordered by curriculum,
    then by the sequence the admin arranged, and de-duplicated: two curricula on
    one class may well carry the same course, and a student should see it once.

    published_only hides drafts and archived courses from students. Staff pass
    False, the same split get_class_quests makes for scheduled quests.
    """
    links = (admin.table('sis_curriculum_classes').select('curriculum_id')
             .eq('class_id', class_id).execute()).data or []
    curriculum_ids = [l['curriculum_id'] for l in links]
    if not curriculum_ids:
        return []

    # An archived curriculum stops teaching: its courses shouldn't keep showing.
    live = (admin.table('sis_curriculum').select('id, title')
            .in_('id', curriculum_ids).eq('is_active', True)
            .order('title').execute()).data or []
    if not live:
        return []
    titles = {c['id']: c.get('title') for c in live}
    order = {c['id']: i for i, c in enumerate(live)}

    course_links = (admin.table('sis_curriculum_courses')
                    .select('curriculum_id, course_id, sequence_order')
                    .in_('curriculum_id', list(titles))
                    .order('sequence_order').execute()).data or []
    if not course_links:
        return []
    course_links.sort(key=lambda l: (order.get(l['curriculum_id'], 0),
                                     l.get('sequence_order') or 0))

    courses = {c['id']: c for c in (
        admin.table('courses')
        .select('id, title, description, status, cover_image_url')
        .in_('id', list({l['course_id'] for l in course_links})).execute()).data or []}

    out, seen = [], set()
    for link in course_links:
        course = courses.get(link['course_id'])
        if not course or course['id'] in seen:  # link outlived the course
            continue
        if published_only and course.get('status') != 'published':
            continue
        seen.add(course['id'])
        out.append({
            'id': course['id'],
            'title': course.get('title'),
            'description': course.get('description'),
            'status': course.get('status'),
            'cover_image_url': course.get('cover_image_url'),
            'curriculum_id': link['curriculum_id'],
            'curriculum_title': titles.get(link['curriculum_id']),
        })
    return out


def _live_curriculum_ids(admin, class_id):
    """The active curricula attached to a class, in title order.

    Shared by the course and resource reads. An archived curriculum stops
    teaching: what it carries drops out with it.
    """
    links = (admin.table('sis_curriculum_classes').select('curriculum_id')
             .eq('class_id', class_id).execute()).data or []
    ids = [l['curriculum_id'] for l in links]
    if not ids:
        return []
    return (admin.table('sis_curriculum').select('id, title')
            .in_('id', ids).eq('is_active', True)
            .order('title').execute()).data or []


def curriculum_materials_for_class(admin, class_id, visible_only=True):
    """Links and documents a class inherits from its curricula.

    visible_only is the student read: only rows a teacher ticked
    visible_to_students. Staff pass False to see the whole list, the same split
    the course read makes for drafts.

    Uploaded files come back as the stored canonical pointer; the caller signs
    them (routes/sis/class_materials._serialize_many does it in one batch for the
    merged list). Signing here would sign twice for staff.
    """
    live = _live_curriculum_ids(admin, class_id)
    if not live:
        return []
    titles = {c['id']: c.get('title') for c in live}
    order = {c['id']: i for i, c in enumerate(live)}

    query = (admin.table('sis_curriculum_materials')
             .select('id, curriculum_id, kind, title, url, visible_to_students, created_at')
             .in_('curriculum_id', list(titles)))
    if visible_only:
        query = query.eq('visible_to_students', True)
    rows = query.order('created_at', desc=True).execute().data or []

    rows.sort(key=lambda r: (order.get(r['curriculum_id'], 0),
                             r.get('created_at') or ''))
    return [{
        'id': r['id'],
        'kind': r.get('kind'),
        'title': r.get('title'),
        'url': r.get('url'),
        'visible_to_students': bool(r.get('visible_to_students')),
        'curriculum_id': r['curriculum_id'],
        'curriculum_title': titles.get(r['curriculum_id']),
        # Where it came from, so the class screen can say so and can refuse to
        # offer a delete control for something the library owns.
        'source': 'curriculum',
    } for r in rows]
