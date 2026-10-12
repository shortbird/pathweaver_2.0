"""
The class each of a student's quests came to them through.

iCreate, 2026-10-01 (d8a2a8d4, Marika): the Learning Snapshot was "super
chaotic" -- every active quest in one list with no hint of where it came from,
so an elementary class's quests on a high schooler's overview could not be told
apart from his own work. The three overviews (the home page's dashboard, the
advisor/admin student overview and the parent child overview) attach this as
`source_class` on each active quest, and the snapshot groups by it.
"""

from typing import Any, Dict, List, Optional

from repositories.class_quest_audience_repository import ClassQuestAudienceRepository
from utils.class_assignments import assigned_to, student_class_assignments
from utils.logger import get_logger

logger = get_logger(__name__)


def quest_source_classes(client, student_id: str, quest_ids: List[str],
                         assignments: Optional[Dict[str, Dict[str, Any]]] = None
                         ) -> Dict[str, Dict[str, Any]]:
    """{quest_id: {'id', 'name', 'enrolled'}}. A quest missing from the result
    is the student's own (null on the overview: "Personal").

    A class the student is still in wins (enrolled True), and among those the
    one whose assignment the student is held to (student_class_assignments). A
    quest only on a class they have LEFT, or one archived at term end, still
    names that class: those are exactly the leftovers an admin is looking for,
    and calling them "Personal" would hide where they came from. `enrolled` is
    whether their enrollment row in that class is still active.

    Only classes that gave the quest to THIS student count (their audience):
    a quest a class kept to other students is not credited to it.

    `assignments` is student_class_assignments' answer when the caller already
    holds it (the home page does), to save its reads.
    """
    wanted = [q for q in dict.fromkeys(quest_ids or []) if q]
    if not wanted or not student_id:
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    if assignments is None:
        assignments = student_class_assignments(client, student_id)
    for qid, a in assignments.items():
        if qid in wanted and a.get('class_id'):
            out[qid] = {'id': a['class_id'], 'name': a.get('class_name'), 'enrolled': True}
    rest = [q for q in wanted if q not in out]
    if not rest:
        return out
    repo = ClassQuestAudienceRepository(client)
    try:
        enrollments = repo.student_class_enrollments(student_id)
        still_in = {e['class_id'] for e in enrollments if e.get('status') == 'active'}
        classes = sorted({e['class_id'] for e in enrollments if e.get('class_id')})
        links = [r for r in repo.links_for_quests(classes, rest) if assigned_to(r, student_id)]
        names = repo.class_names(sorted({r['class_id'] for r in links}))
    except Exception as e:  # noqa: BLE001 — a missing label must not cost the page
        logger.warning(f'Could not resolve source classes for {student_id}: {e}')
        return out
    for r in sorted(links, key=lambda r: r['class_id']):
        out.setdefault(r['quest_id'], {'id': r['class_id'], 'name': names.get(r['class_id']),
                                       'enrolled': r['class_id'] in still_in})
    return out


def attach_curriculum_order(client, enrollments: List[Dict[str, Any]]) -> None:
    """Add the curriculum heading and the class's order to each enrollment's
    `source_class`, in place.

    iCreate, ticket 4cc854cd (2026-10-12, approved by the owner): "Is there a
    way to see the quests by class as a student? ... We still wanted to have
    these be able to be sorted. By date, order of quest, class, priority." The
    home page groups Current quests by class, then by the curriculum inside the
    class, and its "Class order" sort walks the work in the order the school
    laid it out. Adds to each source_class:

      curriculum_id / curriculum_title  the heading (null: under the class)
      curriculum_rank                   the curriculum's place on the class
      curriculum_position               the quest's place in the curriculum
      class_position                    class_quests.sequence_order

    Kept apart from quest_source_classes, whose {id, name, enrolled} three
    overviews read as is. Two reads per class plus one for the class order;
    a student has a handful of classes. A failed read leaves the fields null:
    an ordering hint must not cost the page.
    """
    by_class: Dict[str, List[Dict[str, Any]]] = {}
    for e in enrollments or []:
        src = e.get('source_class')
        if src and src.get('id'):
            for key in ('curriculum_id', 'curriculum_title', 'curriculum_rank',
                        'curriculum_position', 'class_position'):
                src.setdefault(key, None)
            by_class.setdefault(src['id'], []).append(e)
    if not by_class:
        return
    # Deferred: class_curriculum_assign imports the enrollment services, which
    # import this module's neighbours.
    from repositories.class_curriculum_repository import ClassCurriculumRepository
    from services.class_curriculum_assign import curriculum_placement
    try:
        quest_ids = sorted({str(en['quest_id']) for es in by_class.values()
                            for en in es if en.get('quest_id')})
        rows = ClassCurriculumRepository(client).quest_positions(sorted(by_class), quest_ids)
        position = {(r['class_id'], r['quest_id']): r.get('sequence_order') for r in rows}
    except Exception as err:  # noqa: BLE001
        logger.warning(f'Could not read class quest order: {err}')
        position = {}
    for class_id, es in by_class.items():
        try:
            placement = curriculum_placement(client, class_id)
        except Exception as ex:  # noqa: BLE001
            logger.warning(f'Could not resolve curricula for class {class_id}: {ex}')
            placement = {}
        for en in es:
            src = en['source_class']
            src.update(placement.get(str(en.get('quest_id'))) or {})
            src['class_position'] = position.get((class_id, en.get('quest_id')))
