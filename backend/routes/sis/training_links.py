"""
SIS training links -- training that is a video or a document, not a quest.

The Training page (routes/sis/staff_training.py) is built out of quests, which
is right for an orientation course with tasks and wrong for what iCreate has
most of: a recorded training on Loom, a slide deck, a district PDF. Making each
of those a quest meant inventing tasks for a video, so the office stopped
adding them (iCreate, 2026-09-15: "I still dont' have a way to add resources
to the teacher training. I need to get some trainings up asap!"; Marika, same
day: "the ability to add training as links and not just as new quests").

A training link is an org_resources row flagged `is_training`
(repositories/training_link_repository.py). It carries the library's
targeting -- which roles, and which named people ("some trainings are general
and others are specific to certain teachers or staff") -- and "done" is a
sis_resource_acks row, the same record a required document uses. This module
only adds the Training page's view of those rows: the list beside the quests,
the done button, and the who-has-done-what columns.

Staff only. A link for families would need a portal surface that does not
exist; the family portal reads families/all resources and never sees these.

NEW, additive (/api/sis/training/links). Registered after staff_training_bp;
no rule here collides with its `/training/<training_id>` rules because every
path below has the static segment `links` where those have the id.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from utils.validation import validate_uuid
from services import sis_service
from utils.sis_roles import STAFF_ROLES, ADMIN_ROLES, clean_visible_roles
from repositories.training_link_repository import TrainingLinkRepository

logger = get_logger(__name__)

bp = Blueprint('sis_training_links', __name__, url_prefix='/api/sis')

# admin client justified: the SIS console acts for the whole school -- the
#   catalog and its acks belong to every staff member in the org, which no
#   single caller can see under RLS; the route's role+org gate is the
#   authorization, and every row is re-checked against the resolved org.
from utils.admin_client import admin_client as _admin

_MAX_TITLE_LEN = 300
_MAX_URL_LEN = 2048


def _repo():
    return TrainingLinkRepository(client=_admin())


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    requested = request.args.get('organization_id') or body.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


def _clean_url(raw):
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


def _clean_people(value, org_id, repo):
    """(ids, error) for visible_to_user_ids. None means nobody in particular."""
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
    known = repo.member_ids(org_id, wanted)
    if any(w not in known for w in wanted):
        return None, 'Those people are not in this school'
    return sorted(known), None


def _done(link, ack):
    """Whether an ack counts as having done this version of the link."""
    if not ack:
        return False
    return (link.get('version_date') or '') <= (ack.get('version_date') or '')


def _shape(link, ack=None):
    """The link as the page reads it. `is_required` is the Training page's
    word for requires_ack: a required link nags in the inbox, an optional one
    is simply there to be done."""
    return {
        'id': link['id'],
        'title': link.get('title') or 'Untitled',
        'url': link.get('url'),
        'description': link.get('description'),
        'category': link.get('category'),
        'is_required': bool(link.get('requires_ack')),
        'visible_to_roles': link.get('visible_to_roles'),
        'visible_to_user_ids': link.get('visible_to_user_ids'),
        'sort_order': link.get('sort_order') or 0,
        'my_done': ({'done_at': ack.get('acknowledged_at')} if _done(link, ack) else None),
    }


def _applies_to(link, person):
    """Whether one staff member is somebody this link was set for.

    Roles and named people are ORed, as sis_service.filter_role_visible reads
    them; untargeted means everyone. Unlike a training QUEST, an admin is not
    always in: a link shared with one teacher by name is that teacher's to do,
    and a report claiming every admin still owes it would be wrong.
    """
    roles, people = link.get('visible_to_roles'), link.get('visible_to_user_ids')
    if not roles and not people:
        return True
    held = set(person.get('roles') or [])
    return bool((roles and held & set(roles)) or (people and person['id'] in people))


def _owned_link(user_id, link_id):
    """(org_id, link, repo, error) for one link this caller's school owns."""
    org_id, err = _org_or_error(user_id)
    if err:
        return None, None, None, err
    ok, _ = validate_uuid(link_id)
    if not ok:
        return None, None, None, (jsonify({'success': False, 'error': 'Invalid id'}), 400)
    repo = _repo()
    link = repo.get_owned(org_id, link_id)
    if not link:
        return None, None, None, (jsonify({'success': False, 'error': 'Not found'}), 404)
    return org_id, link, repo, None


def _fields_from(data, org_id, repo, partial=False):
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
        url, err = _clean_url(data.get('url'))
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
        people, err = _clean_people(data.get('visible_to_user_ids'), org_id, repo)
        if err:
            return None, err
        fields['visible_to_user_ids'] = people
    if wants('sort_order') and 'sort_order' in data:
        try:
            fields['sort_order'] = int(data.get('sort_order') or 0)
        except (TypeError, ValueError):
            return None, 'sort_order must be a number'
    return fields, None


# ── The list ──────────────────────────────────────────────────────────────────

@bp.route('/training/links', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_training_links(user_id):
    """The school's training links, with whether the caller has done each.

    Admins see every row (they curate the list); a teacher sees the rows aimed
    at them, by role or by name -- the same narrowing the document library
    applies, so a coordinator-only training does not appear on a teacher's
    page.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    repo = _repo()
    rows = sis_service.filter_role_visible(user_id, repo.list_for_org(org_id))
    acks = repo.acks_for_user(user_id, [r['id'] for r in rows])
    return jsonify({'success': True,
                    'links': [_shape(r, acks.get(r['id'])) for r in rows]})


@bp.route('/training/links', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_training_link(user_id):
    """Add a link to the training catalog.

    Body: {title, url, description?, category?, is_required?,
           visible_to_roles?, visible_to_user_ids?}
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    repo = _repo()
    fields, field_err = _fields_from(data, org_id, repo)
    if field_err:
        return jsonify({'success': False, 'error': field_err}), 400
    row = repo.create({**fields, 'organization_id': org_id, 'created_by': user_id})
    if not row:
        raise RuntimeError('Training link insert returned no row')
    logger.info(f"Training link {row['id']} added by {user_id} for org {org_id}")
    return jsonify({'success': True, 'link': _shape(row)}), 201


@bp.route('/training/links/<link_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_training_link(user_id, link_id):
    org_id, link, repo, err = _owned_link(user_id, link_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    fields, field_err = _fields_from(data, org_id, repo, partial=True)
    if field_err:
        return jsonify({'success': False, 'error': field_err}), 400
    if not fields:
        return jsonify({'success': False, 'error': 'Nothing to update'}), 400
    row = repo.update(link['id'], fields) or {**link, **fields}
    return jsonify({'success': True, 'link': _shape(row)})


@bp.route('/training/links/<link_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_training_link(user_id, link_id):
    """Take a link off the catalog. Its acks go with it (the FK cascades), which
    is right: there is nothing left to have done."""
    _org_id, link, repo, err = _owned_link(user_id, link_id)
    if err:
        return err
    repo.delete(link['id'])
    return jsonify({'success': True})


# ── Doing it ──────────────────────────────────────────────────────────────────

@bp.route('/training/links/<link_id>/done', methods=['POST'])
@require_role(*STAFF_ROLES)
def mark_training_link_done(user_id, link_id):
    """The caller has watched or read it. Self-scoped: the user id is the
    caller's own, from the decorator, never from the body."""
    _org_id, link, repo, err = _owned_link(user_id, link_id)
    if err:
        return err
    ack = repo.mark_done(link['id'], user_id, link.get('version_date'))
    return jsonify({'success': True, 'link': _shape(link, ack)})


@bp.route('/training/links/<link_id>/done', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def unmark_training_link_done(user_id, link_id):
    """The undo, for the row somebody pressed by mistake."""
    _org_id, link, repo, err = _owned_link(user_id, link_id)
    if err:
        return err
    repo.unmark_done(link['id'], user_id)
    return jsonify({'success': True, 'link': _shape(link)})


# ── Who has done what ─────────────────────────────────────────────────────────

@bp.route('/training/links/progress', methods=['GET'])
@require_role(*ADMIN_ROLES)
def training_links_progress(user_id):
    """Every staff member against every link, for the report beside the quest
    columns. A cell `applies` only where the link was aimed at that person,
    so nobody is shown as behind on a training they were never given."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    repo = _repo()
    links = repo.list_for_org(org_id)
    staff = sis_service.list_org_staff(org_id)
    by_user = {}
    for a in repo.acks_for_links([l['id'] for l in links]):
        by_user.setdefault(a['user_id'], {})[a['resource_id']] = a

    rows = []
    for s in staff:
        acks = by_user.get(s['id'], {})
        cells = []
        for l in links:
            ack = acks.get(l['id'])
            done = _done(l, ack)
            cells.append({'link_id': l['id'], 'applies': _applies_to(l, s),
                          'done': done,
                          'done_at': ack.get('acknowledged_at') if done else None})
        rows.append({
            'user_id': s['id'], 'name': s['name'], 'cells': cells,
            'required_completed': len([
                c for c, l in zip(cells, links, strict=False)
                if l.get('requires_ack') and c['applies'] and c['done']]),
            'required_total': len([
                c for c, l in zip(cells, links, strict=False)
                if l.get('requires_ack') and c['applies']]),
        })
    return jsonify({'success': True, 'links': [_shape(l) for l in links], 'staff': rows,
                    'required_total': len([l for l in links if l.get('requires_ack')])})
