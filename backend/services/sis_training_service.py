"""
The training catalog's service half.

routes/sis/staff_training.py owns the catalog's routes — building the quests,
the admin screens, the progress report. What lives here:

  student_in_age_window  the "12 and up" gate, which both the route module and
                         the catch-up below have to agree on exactly.
  catch_up_students      enrolling students into the auto-assign quests set for
                         them, called from the family portal.
  the link half          a training that is a video or a document rather than
                         a quest (M18, 2026-09-17): an org_resources row
                         flagged `is_training`, read and written through
                         repositories/training_link_repository.py. Until M18
                         these had their own route file (training_links.py)
                         with a second list, a second targeting model and a
                         second progress report beside the quests'; now the
                         Training page's routes serve both kinds from one
                         catalog and a link is the `kind='link'` branch.

Students are the one audience with no page of their own in the SIS: a quest
set for them simply turns up on their account in the learning app, so nothing
they load can catch them up the way the training page catches up a teacher.
Their guardian's portal does it instead — and a service reaching into routes/
to do that is a layer violation (tests/unit/test_import_layers.py fails on a
new one), which is why the catch-up lives here.
"""

import logging
from typing import Any, Dict, Iterable, List, Optional

from database import get_supabase_admin_client
from services import sis_age
from services import sis_service
# admin client justified: the SIS console acts for the whole school -- the
#   catalog and its acks belong to every staff member in the org, which no
#   single caller can see under RLS; the route's role+org gate is the
#   authorization, and every row is re-checked against the resolved org.
from utils.admin_client import admin_client as _admin
from utils.sis_roles import clean_visible_roles
from utils.validation import validate_uuid
from repositories import training_link_repository

logger = logging.getLogger(__name__)


def student_in_age_window(item: Dict[str, Any], person: Dict[str, Any]) -> bool:
    """Whether a student falls inside a catalog row's age window.

    A student whose date of birth the school has never recorded is left OUT of
    any row with a window on it. "12 and up" has to mean it: guessing would put
    an orientation quest written for teenagers on a six-year-old's account, and
    the admin has no way to see that it happened.
    """
    lo, hi = item.get('student_min_age'), item.get('student_max_age')
    if lo is None and hi is None:
        return True
    age = person.get('age')
    if age is None:
        return False
    return (lo is None or age >= lo) and (hi is None or age <= hi)


def student_auto_assign_rows(org_id: str) -> List[Dict[str, Any]]:
    """Live catalog rows set for students that put themselves on accounts.

    Drafts are excluded here rather than downstream: a draft is not on anybody's
    account yet, which is the whole of what makes it a draft.
    """
    if not org_id:
        return []
    # admin client justified: reads another org's catalog on behalf of a guardian
    # whose membership the caller has already checked; the row is org-scoped below.
    rows = (get_supabase_admin_client().table('sis_staff_training')
            .select('quest_id, auto_assign, student_min_age, student_max_age, '
                    'quests(is_active)')
            .eq('organization_id', org_id).eq('auto_assign', True)
            .contains('audiences', ['student']).execute()).data or []
    return [r for r in rows if (r.get('quests') or {}).get('is_active')]


def catch_up_students(org_id: str, student_ids: Optional[Iterable[str]]) -> int:
    """Enroll these students into the auto-assign quests set for students.

    Called from their guardian's family portal — bounded work, on a page a
    parent loads anyway, and the family that registered on Thursday is exactly
    the family whose children were missed.

    Ages are read here rather than passed in: a row aimed at 12-and-up has to
    pick up the student who turned 12 last week, without anybody re-assigning
    anything.
    """
    from utils.quest_assignment import assign_quest_to_users

    ids = list(student_ids or [])
    if not org_id or not ids:
        return 0
    catalog = student_auto_assign_rows(org_id)
    if not catalog:
        return 0

    # admin client justified: enrolling somebody ELSE (a guardian's child) is a
    # cross-user write, and reading their DOB to gate it is the same act.
    admin = get_supabase_admin_client()
    rows = (admin.table('users').select('id, date_of_birth')
            .in_('id', ids).execute()).data or []
    age = sis_age.ages_for(org_id)
    people = [{'id': r['id'], 'age': age(r.get('date_of_birth'))} for r in rows]

    created = 0
    for row in catalog:
        wanted = [p['id'] for p in people if student_in_age_window(row, p)]
        if not wanted:
            continue
        try:
            created += assign_quest_to_users(admin, row['quest_id'], wanted)['enrolled']
        except Exception as e:  # noqa: BLE001 — reading the portal is the point
            logger.warning(f"Student catch-up failed for quest {row['quest_id']}: {e}")
    return created


# ── Links: a training that is a video or a document ───────────────────────────
#
# iCreate, 2026-09-15: "I still dont' have a way to add resources to the
# teacher training. I need to get some trainings up asap!"; Marika, same day:
# "the ability to add training as links and not just as new quests". A
# recorded training on Loom or a district PDF has no tasks to invent, so it is
# a link: open it, press done. "Done" is a sis_resource_acks row, the same
# record a required document uses. Staff only at first; families got a portal
# surface on 2026-09-22 (routes/sis/parent.py /training) and students the same
# day (routes/sis/student_training.py, on their /school page) -- ae16c5da.

_MAX_TITLE_LEN = 300
_MAX_URL_LEN = 2048


def _repo():
    # admin client justified: the SIS console acts for the whole school -- the
    #   catalog and its acks belong to every staff member in the org, which no
    #   single caller can see under RLS; the route's role+org gate is the
    #   authorization, and every row is re-checked against the resolved org.
    return training_link_repository.TrainingLinkRepository(client=_admin())


def clean_url(raw):
    """(url, error). A training link opens in a new tab from a button, so it
    has to be something a browser can open -- not a bare filename, and not a
    javascript: URL somebody pasted by mistake."""
    url = (raw or '').strip()
    if not url:
        return None, 'Paste the link to the training.'
    if len(url) > _MAX_URL_LEN:
        return None, 'That link is too long.'
    if not (url.startswith('http://') or url.startswith('https://')):
        return None, 'The link must start with http:// or https://.'
    return url, None


def clean_people(value, org_id):
    """(ids, error) for visible_to_user_ids on either kind of training. None
    means nobody in particular. A stranger's id would be visible to nobody and
    look like a bug, so every id has to be a person in this school."""
    if not value:
        return None, None
    if not isinstance(value, (list, tuple)):
        return None, 'visible_to_user_ids must be a list of people'
    wanted = [str(v) for v in value if v]
    if not wanted:
        return None, None
    for v in wanted:
        ok, _ = validate_uuid(v)
        if not ok:
            return None, 'Invalid person id'
    known = _repo().member_ids(org_id, wanted)
    if any(w not in known for w in wanted):
        return None, 'Those people are not in this school'
    return sorted(known), None


def link_done(link, ack):
    """Whether an ack counts as having done this version of the link."""
    if not ack:
        return False
    return (link.get('version_date') or '') <= (ack.get('version_date') or '')


def shape_link(link, ack=None):
    """The link as the Training page reads it, in the catalog row's vocabulary:
    `kind` says which branch, `sequence_order` is the shared position the
    page orders both kinds on, `is_required` is the page's word for
    requires_ack (a required link nags in the inbox; an optional one is simply
    there to be done)."""
    return {
        'kind': 'link',
        'id': link['id'],
        'title': link.get('title') or 'Untitled',
        'url': link.get('url'),
        'description': link.get('description'),
        'category': link.get('category'),
        'is_required': bool(link.get('requires_ack')),
        'visible_to_roles': link.get('visible_to_roles'),
        'visible_to_user_ids': link.get('visible_to_user_ids'),
        'sequence_order': link.get('sort_order') or 0,
        # The row's own audience, back in the training vocabulary the page
        # speaks. Hardcoded 'staff' until 2026-09-22, which was true then
        # because create_link wrote nothing else (ae16c5da).
        'audience': training_audience(link.get('audience')),
        'audiences': [training_audience(link.get('audience'))],
        'my_done': ({'done_at': ack.get('acknowledged_at')} if link_done(link, ack) else None),
    }


#: The reverse of _RESOURCE_AUDIENCE, for reads. 'all' is a document-library
#: value no link is written with; an older row carrying it reads as staff,
#: which is what it behaved as.
_TRAINING_AUDIENCE = {'staff': 'staff', 'families': 'family', 'students': 'student',
                      'all': 'staff'}


def training_audience(value):
    """An org_resources audience as the training page names it."""
    return _TRAINING_AUDIENCE.get(str(value or 'staff').strip().lower(), 'staff')


def link_fields_from(data, org_id, partial=False):
    """(fields, error) -- the columns a create or edit may set.

    `partial` is the PATCH case: only keys the client sent are touched, so a
    client that does not know a field cannot blank it.
    """
    fields = {}

    def wants(key):
        return (not partial) or (key in data)

    if wants('title'):
        title = (data.get('title') or '').strip()
        if not title:
            return None, 'Give the training a title.'
        if len(title) > _MAX_TITLE_LEN:
            return None, 'Title is too long.'
        fields['title'] = title
    if wants('url'):
        url, err = clean_url(data.get('url'))
        if err:
            return None, err
        fields['url'] = url
    if wants('description'):
        fields['description'] = (data.get('description') or '').strip() or None
    if wants('category'):
        fields['category'] = (data.get('category') or '').strip() or None
    if wants('is_required'):
        fields['requires_ack'] = bool(data.get('is_required'))
    if wants('visible_to_roles'):
        roles, err = clean_visible_roles(data.get('visible_to_roles'))
        if err:
            return None, err
        fields['visible_to_roles'] = roles
    if wants('visible_to_user_ids'):
        people, err = clean_people(data.get('visible_to_user_ids'), org_id)
        if err:
            return None, err
        fields['visible_to_user_ids'] = people
    if wants('sequence_order') and 'sequence_order' in data:
        try:
            fields['sort_order'] = int(data.get('sequence_order') or 0)
        except (TypeError, ValueError):
            return None, 'sequence_order must be a number'
    if wants('audience') and 'audience' in data:
        resolved, err = resource_audience(data.get('audience'))
        if err:
            return None, err
        fields['audience'] = resolved
    return fields, None


#: Training speaks staff/family/student; org_resources.audience speaks
#: families/staff/all/students. One row, two vocabularies, so the translation
#: lives here rather than at each call site.
#:
#: 'student' was refused here until migration
#: 20260922200100_org_resources_audience_students.sql added 'students' to the
#: org_resources_audience_check constraint. THAT MIGRATION MUST BE APPLIED
#: (migrate-prod.yml) BEFORE THIS CODE DEPLOYS: until it is, every student link
#: insert fails the CHECK and the admin sees a 500 instead of the old message
#: (ae16c5da, students half, 2026-09-22).
_RESOURCE_AUDIENCE = {'staff': 'staff', 'family': 'families', 'families': 'families',
                      'student': 'students', 'students': 'students'}


def resource_audience(value):
    """(org_resources audience, error) for a training audience."""
    key = str(value or 'staff').strip().lower()
    resolved = _RESOURCE_AUDIENCE.get(key)
    if not resolved:
        return None, 'Choose who the training is for.'
    return resolved, None


#: The org_resources audiences a training audience reads. 'all' is a document
#: library value no training link is written with, but an older row could carry
#: it, so the staff and family readers accept it. Students do NOT read 'all':
#: in the document library 'all' has always meant families and staff, and no
#: row carrying it was ever written with a student in mind.
_AUDIENCE_READS = {'staff': ('staff', 'all'), 'family': ('families', 'all'),
                   'student': ('students',)}


def links_for_org(org_id, audience='staff'):
    """Every link the school has set for this audience, raw rows in the
    admin's order."""
    wanted = _AUDIENCE_READS.get(audience, ())
    return [r for r in _repo().list_for_org(org_id)
            if (r.get('audience') or 'staff') in wanted]


def list_links(org_id, user_id, audience='staff'):
    """The school's training links as the caller sees them, with whether they
    have done each. Admins see every row (they curate the list); a teacher
    sees the rows aimed at them, by role or by name -- the same narrowing the
    document library applies.

    The role narrowing is a STAFF idea: visible_to_roles is constrained to
    org_admin/campus_coordinator/advisor, so applying it to a family list would
    ask whether a parent holds a staff role and hide everything. A family link
    reaches every family."""
    repo = _repo()
    rows = links_for_org(org_id, audience)
    if audience == 'staff':
        rows = sis_service.filter_role_visible(user_id, rows)
    acks = repo.acks_for_user(user_id, [r['id'] for r in rows])
    return [shape_link(r, acks.get(r['id'])) for r in rows]


def owned_link(org_id, link_id):
    """The raw row, only if this school owns it (the id came from the browser)."""
    ok, _ = validate_uuid(link_id)
    if not ok:
        return None
    return _repo().get_owned(org_id, link_id)


def create_link(org_id, user_id, data):
    """(shaped row, error)."""
    fields, err = link_fields_from(data, org_id)
    if err:
        return None, err
    row = _repo().create_link({**fields, 'organization_id': org_id, 'created_by': user_id})
    if not row:
        raise RuntimeError('Training link insert returned no row')
    logger.info(f"Training link {row['id']} added by {user_id} for org {org_id}")
    return shape_link(row), None


def update_link(org_id, link, data):
    """(shaped row, error) for a PATCH on a row owned_link() returned."""
    fields, err = link_fields_from(data, org_id, partial=True)
    if err:
        return None, err
    if not fields:
        return None, 'Nothing to update'
    row = _repo().update_link(link['id'], fields) or {**link, **fields}
    return shape_link(row), None


def delete_link(link):
    """Take a link off the catalog. Its acks go with it (the FK cascades),
    which is right: there is nothing left to have done."""
    _repo().delete_link(link['id'])


def set_link_done(link, user_id, done):
    """The caller's own mark -- the user id is the caller's, from the
    decorator, never from the body. `done=False` is the undo, for the row
    somebody pressed by mistake."""
    repo = _repo()
    if done:
        ack = repo.mark_done(link['id'], user_id, link.get('version_date'))
        return shape_link(link, ack)
    repo.unmark_done(link['id'], user_id)
    return shape_link(link)


def link_acks_by_user(link_ids):
    """{user_id: {link_id: ack}} across every ack on these links, for the
    who-has-done-what report."""
    out: Dict[str, Dict[str, Any]] = {}
    for a in _repo().acks_for_links(list(link_ids)):
        out.setdefault(a['user_id'], {})[a['resource_id']] = a
    return out


# ── The catalog's vocabulary ─────────────────────────────────────────────────
# Pure helpers the route module and the family portal both read (moved out
# of routes/sis/staff_training.py in M18, when it crossed the route-file cap).

# Who a catalog row can be set for. Listed in the order a row's PRIMARY group is
# picked when it targets several -- see primary_audience.
AUDIENCES = ('staff', 'family', 'student')
# The XP floor since the scale was halved (2026-06-15).
MIN_XP = 25


def clean_xp_threshold(raw):
    """The XP somebody must earn before the quest counts as finished.

    Stored on the quest itself (`quests.xp_threshold`), which the ordinary
    completion route already enforces — POST /api/quests/<id>/end refuses with
    XP_THRESHOLD_NOT_MET below it (routes/quest/completion.py). So training
    inherits the same gate every other quest uses rather than inventing one.

    Returns (value, error). None/0/'' means no requirement, which is how every
    quest behaved before an admin set one.
    """
    if raw is None or raw == '':
        return None, None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None, 'XP required must be a number.'
    if value < 0:
        return None, 'XP required cannot be negative.'
    return (value or None), None




def norm_audience(value):
    """Normalise an audience, defaulting to the original 'staff' meaning."""
    v = (str(value or '').strip().lower())
    return v if v in AUDIENCES else 'staff'


def audiences(value, fallback=None):
    """Every group a row is set for, in AUDIENCES order, never empty.

    iCreate, 2026-08-17: "assign to 12+ students and all parents". One quest,
    two groups — so who a row is for is a set, not a value. `fallback` is the
    row's old single `audience`, which is what a catalog nobody has edited since
    still carries.
    """
    if isinstance(value, str):
        value = [value]
    if isinstance(value, (list, tuple)):
        wanted = {str(v).strip().lower() for v in value if v}
        picked = [a for a in AUDIENCES if a in wanted]
        if picked:
            return picked
    return [norm_audience(fallback)]


def primary_audience(audiences):
    """The one value the `audience` column keeps holding.

    It carries the one-row-per-quest unique index, and the guardian family
    portal still reads on it — so a row that includes parents must resolve to
    'family' rather than to whatever happens to sort first.
    """
    return audiences[0]


def row_audiences(row):
    """A catalog row's groups, tolerating a row written before the column."""
    return audiences(row.get('audiences'), row.get('audience'))


def _clean_age(raw, label):
    """(age, error) for one end of the student age window."""
    if raw is None or raw == '':
        return None, None
    try:
        age = int(raw)
    except (TypeError, ValueError):
        return None, f'{label} must be a number.'
    if age < 0 or age > 120:
        return None, f'{label} must be between 0 and 120.'
    return age, None


def clean_age_window(data):
    """(min, max, error). An inverted window assigns to nobody, which looks
    exactly like a broken assign button, so it is refused here."""
    lo, err = _clean_age(data.get('student_min_age'), 'The youngest age')
    if err:
        return None, None, err
    hi, err = _clean_age(data.get('student_max_age'), 'The oldest age')
    if err:
        return None, None, err
    if lo is not None and hi is not None and lo > hi:
        return None, None, 'The youngest age cannot be above the oldest age.'
    return lo, hi, None




# Whoever runs the school. Always assignable, whatever a row targets.
ADMIN_ORG_ROLES = ('org_admin', 'campus_coordinator')


def roles_of(user):
    """Every role a user holds: the org_roles array, org_role, and the platform
    role. A person can hold several — at iCreate the admins are parents too —
    and reading only one column is how a parent-who-is-also-an-admin went
    missing from their own school's family quests.
    """
    roles = set()
    if isinstance(user.get('org_roles'), list):
        roles.update(r for r in user['org_roles'] if r)
    for key in ('org_role', 'role'):
        if user.get(key):
            roles.add(user[key])
    return roles


def item_applies_to(item, person, audience=None):
    """Whether one person, reached as one group, is in a row's audience.

    Students are narrowed by age, staff by role and by name. Guardians carry
    no targeting. The same predicate serves assignment, the catch-up and the
    progress report, for a quest and for a link, so the report cannot claim
    somebody is behind on a training they were never going to be given.

    Staff targeting is visible_to_roles OR visible_to_user_ids, as
    sis_service.filter_role_visible reads them; neither set means everyone.
    An admin is always eligible for role-targeted (or untargeted) staff
    training: a course aimed at teachers still has to be doable by the person
    who set it — to try it before it goes out, and because at a small school
    the admin teaches too. Narrowing is about not burying a teacher in
    campus-operations training, not about locking admins out. A row aimed at
    named people ONLY is theirs alone, admins included: a link shared with one
    teacher by name is that teacher's to do, and a report claiming every admin
    still owes it would be wrong. Neither rule extends to the student age
    window: an admin is not a student, and a quest for 12-year-olds should not
    land on their account because they run the school.
    """
    group = person.get('group') or norm_audience(audience)
    if group == 'student':
        # Shared with the family-portal catch-up, which has to gate on exactly
        # the same window (services/sis_training_service.py).
        return student_in_age_window(item, person)
    if group == 'family':
        return True
    targets, people = item.get('visible_to_roles'), item.get('visible_to_user_ids')
    if not targets and not people:
        return True
    if people and person['id'] in people:
        return True
    if not targets:
        return False
    roles = set(person.get('roles') or [])
    if roles & set(ADMIN_ORG_ROLES):
        return True
    return bool(set(targets) & roles)


# ── Students doing a link ─────────────────────────────────────────────────────
#
# "I would like to link to a video or document option in the 'for families'
# (and students if it's not there too)" (iCreate, Molly, 2026-09-22, ae16c5da).
# The families half is sis_parent_service.training_links; this is the student
# half. A student's org is their own users.organization_id -- there is no
# child to reach through, so no org id is taken from the request.

def _student_org(user_id):
    """The school this caller is a student at, or None. The student role
    decides, as it does for the progress report (_org_students): a person who
    holds it is reached as a student whatever else they hold."""
    ctx = sis_service.get_user_org_context(user_id)
    org_id = ctx.get('organization_id')
    if not org_id or 'student' not in roles_of(ctx):
        return None
    return org_id


def student_training_links(user_id):
    """The student-audience training links of the caller's school, with
    whether they have done each. Empty for anybody who is not a student there:
    the list sits on every member's /school page and renders nothing when
    empty, the way the class-materials card does."""
    org_id = _student_org(user_id)
    if not org_id:
        return []
    return list_links(org_id, user_id, audience='student')


def set_student_training_link_done(user_id, link_id, done):
    """Mark (or unmark) one of the caller's own student training links.

    None when the caller is not a student, the link is not their school's, or
    it is not a student link -- one answer for all three, so a guesser learns
    nothing about staff or family training ids. The user id is the caller's,
    from the decorator, never from the body."""
    org_id = _student_org(user_id)
    if not org_id:
        return None
    link = owned_link(org_id, link_id)
    if not link or link.get('audience') != 'students':
        return None
    return set_link_done(link, user_id, done)
