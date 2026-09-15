"""Deciding whether a story may go live, and making it so.

`blockers` is the gate, and it is a list rather than a boolean because the
editor shows every reason at once. The hard blockers hold in both tiers; the
anonymized tier adds three more, because a story with no consent behind it
must not carry a name, an age, or a face.

`auto_publish` is what the grader's one click ends in: apply the safety
verdicts, fix what can be fixed without a human (a hero that points at an
excluded image), compute the blockers, and either publish -- copy images,
stamp the row, rebuild the site, email the founder -- or park the story in
`review` with the reasons. `unpublish` is the reverse and deletes the public
objects FIRST, so a story can be off the internet even when the rebuild hook
is down.

`public_view` is the only projection the public endpoint serves. It is an
allowlist, built field by field; nothing in NEVER_PUBLISHED can reach it by
accident because nothing is copied wholesale.
"""

from __future__ import annotations

import html
import re
from typing import Any, Dict, List, Optional, Tuple

from app_config import Config
from utils.error_reporting import report_error
from utils.logger import get_logger
from utils.timestamps import now_iso

from generated.credits import XP_PER_CREDIT
from services import marketing_site
from services.stories import assets as assets_mod
from services.stories.anonymize import is_generic_label
from services.stories.source import CREDIT_AWARDED, CREDIT_PENDING, credit_display, subject_slug

logger = get_logger(__name__)

EVIDENCE_ITEM_KEYS = ('type', 'url', 'alt', 'caption', 'width', 'height')
#: The two evidence item types that are not backed by a `story_assets` row.
#: They carry their own `included` flag and `safety` record on the item.
STANDALONE_ITEM_TYPES = ('quote', 'link')
TASK_ROW_KEYS = ('title', 'subject', 'xp', 'criteria_met', 'criteria_total')
CRITERION_KEYS = ('text', 'verdict', 'note')
#: Body sections the public page renders, in the order the drafter writes
#: them. `how_it_went` (the review rounds) is still on older rows and is
#: deliberately not here: the page stopped showing it on 2026-09-12.
PUBLIC_SECTION_KINDS = ('what_they_did', 'tasks', 'evidence', 'what_reviewer_looked_for',
                        'what_it_counted_for')

#: Below this many credits the receipt's transcript row says the XP instead.
#: One task is 0.05 credit, which is true and reads as a joke; "100 XP" is the
#: same fact in the unit Optio actually awards, and the explainer beside the
#: receipt says what the XP is worth. A semester class (0.5) and up keeps the
#: credit, because that is what a transcript row really shows.
RECEIPT_XP_BELOW_CREDITS = 0.5


def credit_state_of(story: Dict[str, Any]) -> str:
    """`awarded` or `pending`, off the receipt the drafter wrote. A story from
    before the state existed (2026-09-15) was gated on finalized credit, so
    the absence of the field means awarded."""
    raw_receipt = story.get('receipt')
    receipt: Dict[str, Any] = raw_receipt if isinstance(raw_receipt, dict) else {}
    return CREDIT_PENDING if receipt.get('state') == CREDIT_PENDING else CREDIT_AWARDED


def receipt_credit_line(story: Dict[str, Any]) -> Optional[str]:
    """What the receipt's second line says: the stored credit line, or the XP
    when the credit is a sliver of one. Whether that line is earned or still
    under review is `credit_state` beside it; the page renders the state, the
    line stays a number."""
    raw_receipt = story.get('receipt')
    receipt: Dict[str, Any] = raw_receipt if isinstance(raw_receipt, dict) else {}
    try:
        fraction = float(story.get('credit_fraction') or 0)
    except (TypeError, ValueError):
        fraction = 0.0
    xp = story.get('xp_awarded')
    if xp and 0 < fraction < RECEIPT_XP_BELOW_CREDITS:
        return f'{int(xp):,} XP'
    return receipt.get('credit')


_AGE_RE = re.compile(r'\b(?:aged?\s+\d{1,2}|\d{1,2}[\s-]year[\s-]old|\d{1,2}\s+years\s+old)\b',
                     re.IGNORECASE)


def _repos(admin=None):
    from repositories.story_asset_repository import StoryAssetRepository
    from repositories.story_repository import StoryRepository
    return StoryRepository(client=admin), StoryAssetRepository(client=admin)


# ── the gate ─────────────────────────────────────────────────────────────────

def _section(story: Dict[str, Any], kind: str) -> Optional[Dict[str, Any]]:
    raw_body = story.get('body')
    body: Dict[str, Any] = raw_body if isinstance(raw_body, dict) else {}
    for section in body.get('sections') or []:
        if isinstance(section, dict) and section.get('kind') == kind:
            return section
    return None


def _blocker(code: str, field: str, message: str) -> Dict[str, str]:
    return {'code': code, 'field': field, 'message': message}


def _is_video(asset: Optional[Dict[str, Any]]) -> bool:
    return (asset or {}).get('kind') == 'video'


def _is_document(asset: Optional[Dict[str, Any]]) -> bool:
    return (asset or {}).get('kind') == 'document'


def _is_still(asset: Optional[Dict[str, Any]]) -> bool:
    return bool(asset) and not _is_video(asset) and not _is_document(asset)


def _is_standalone(item: Any) -> bool:
    """A quote or a link: an evidence item with no asset row behind it."""
    return isinstance(item, dict) and item.get('type') in STANDALONE_ITEM_TYPES


def _is_frame(asset: Optional[Dict[str, Any]]) -> bool:
    """An image or a video: something the page can lead with. A PDF is not."""
    return bool(asset) and not _is_document(asset)


def _hero_candidates(assets: List[Dict[str, Any]], *, published_only: bool = False) -> List[str]:
    """Asset ids that may be the hero, images first, then videos, each in row
    order, so `[0]` is the same fallback drafter.choose_hero picks. A document
    is never a hero: the card and the og:image need a frame."""
    def ok(a: Dict[str, Any]) -> bool:
        return bool(a.get('included')) and _is_frame(a) and (
            bool(a.get('public_path')) or not published_only)
    stills = [a['id'] for a in assets if ok(a) and _is_still(a)]
    videos = [a['id'] for a in assets if ok(a) and _is_video(a)]
    return stills + videos


def blockers(story: Dict[str, Any], assets: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Every reason this story may not be published right now."""
    out: List[Dict[str, str]] = []
    if not (story.get('title') or '').strip():
        out.append(_blocker('empty_title', 'title', 'The story has no title.'))
    if not (story.get('dek') or '').strip():
        out.append(_blocker('empty_dek', 'dek', 'The story has no dek.'))
    did = _section(story, 'what_they_did') or {}
    if not (did.get('body_md') or '').strip():
        out.append(_blocker('empty_body', 'what_they_did',
                            'The "what they did" section is empty.'))

    raw_safety = story.get('safety')
    safety: Dict[str, Any] = raw_safety if isinstance(raw_safety, dict) else {}
    raw_text_report = safety.get('text')
    text_report: Dict[str, Any] = raw_text_report if isinstance(raw_text_report, dict) else {}
    if 'text_leak' in (text_report.get('blockers') or []):
        out.append(_blocker('text_leak', 'body',
                            'The text still identified someone after one rescrub: '
                            + ', '.join(text_report.get('leaks_after') or [])[:200]))

    by_id = {a.get('id'): a for a in assets}
    hero = story.get('hero_asset_id')
    if hero and not (by_id.get(hero) or {}).get('included'):
        out.append(_blocker('hero_excluded', 'hero_asset_id',
                            'The hero is an excluded asset.'))
    elif hero and not _is_frame(by_id.get(hero)):
        out.append(_blocker('hero_is_document', 'hero_asset_id',
                            'The hero must be an image or a video, not a document.'))

    evidence = _section(story, 'evidence') or {}
    for item in evidence.get('items') or []:
        if not isinstance(item, dict) or item.get('included') is False:
            continue
        url = item.get('url')
        if url and not str(url).startswith('https://'):
            out.append(_blocker('insecure_url', 'evidence', f'Not an https URL: {url}'))

    raw_receipt = story.get('receipt')
    receipt: Dict[str, Any] = raw_receipt if isinstance(raw_receipt, dict) else {}
    included = [a for a in assets if a.get('included')]
    if not included and not receipt.get('icon'):
        out.append(_blocker('no_image_no_icon', 'receipt',
                            'No safe image and no receipt icon.'))

    if (story.get('tier') or 'anonymized') != 'named':
        label = story.get('student_label') or ''
        if not is_generic_label(label):
            out.append(_blocker('label_not_generic', 'student_label',
                                'An anonymized story must use a generic student label.'))
        for field_name in ('student_label', 'title', 'dek'):
            if _AGE_RE.search(story.get(field_name) or ''):
                out.append(_blocker('age_text', field_name,
                                    'An anonymized story may not state an age.'))
                break
        for asset in included:
            faces = (asset.get('safety') or {}).get('faces')
            try:
                if int(faces or 0) > 0:
                    out.append(_blocker('faces_in_anonymized', 'assets',
                                        'An included image shows a face.'))
                    break
            except (TypeError, ValueError):
                out.append(_blocker('faces_in_anonymized', 'assets',
                                    'An included image has an unreadable face count.'))
                break
    return out


# ── the fixes a machine may make ─────────────────────────────────────────────

def apply_verdicts(story: Dict[str, Any], assets: List[Dict[str, Any]], *,
                   asset_repo=None, story_repo=None) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Make the row agree with the safety verdicts. Returns the updated pair.

    An asset whose verdict is not `safe` is not included, whatever the drafter
    said. A hero that points at an excluded asset, or at a document, is
    re-pointed at the first included image, else the first included video, or
    cleared. Evidence items for excluded assets are dropped. Quotes and links
    carry their own `included` flag and are left as they are.
    """
    changed_assets: List[Dict[str, Any]] = []
    for asset in assets:
        verdict = (asset.get('safety') or {}).get('verdict')
        if asset.get('included') and verdict != 'safe' and not (asset.get('safety') or {}).get('override'):
            if asset_repo is not None:
                asset_repo.patch(asset['id'], {'included': False})
            asset = {**asset, 'included': False}
        changed_assets.append(asset)

    included_ids = [a['id'] for a in changed_assets if a.get('included')]
    hero_ids = _hero_candidates(changed_assets)
    hero = story.get('hero_asset_id')
    new_hero = hero if hero in hero_ids else (hero_ids[0] if hero_ids else None)

    body = dict(story.get('body') or {})
    sections = []
    for section in body.get('sections') or []:
        if isinstance(section, dict) and section.get('kind') == 'evidence':
            items = [i for i in (section.get('items') or [])
                     if _is_standalone(i)
                     or (isinstance(i, dict) and i.get('asset_id') in included_ids)]
            section = {**section, 'items': items}
        sections.append(section)
    body['sections'] = sections

    updates: Dict[str, Any] = {}
    if new_hero != hero:
        updates['hero_asset_id'] = new_hero
    if body != story.get('body'):
        updates['body'] = body
    if updates and story_repo is not None:
        story_repo.patch(story['id'], updates)
    return ({**story, **updates} if updates else story), changed_assets


def _fill_urls(story: Dict[str, Any], assets: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Asset-backed evidence items get their public URL, size and nothing
    else. Quotes and links have nothing to fill and pass through unchanged."""
    by_id = {a.get('id'): a for a in assets}
    body = dict(story.get('body') or {})
    sections = []
    for section in body.get('sections') or []:
        if isinstance(section, dict) and section.get('kind') == 'evidence':
            items = []
            for item in section.get('items') or []:
                if _is_standalone(item):
                    items.append(item)
                    continue
                asset = by_id.get((item or {}).get('asset_id')) if isinstance(item, dict) else None
                if not asset or not asset.get('public_path') or not asset.get('included'):
                    continue
                items.append({
                    **item,
                    'url': assets_mod.public_url_for(asset['public_path']),
                    'poster_url': assets_mod.public_url_for(asset.get('poster_path')),
                    'width': asset.get('width'),
                    'height': asset.get('height'),
                    'alt': item.get('alt') or asset.get('alt') or '',
                    'caption': item.get('caption') if item.get('caption') is not None else asset.get('caption'),
                })
            section = {**section, 'items': items}
        sections.append(section)
    body['sections'] = sections
    return body


# ── publishing ───────────────────────────────────────────────────────────────

def _publish(story: Dict[str, Any], assets: List[Dict[str, Any]], *, admin=None,
             story_repo=None, asset_repo=None, updated_by: Optional[str] = None,
             ) -> Tuple[Dict[str, Any], List[Dict[str, str]]]:
    """Publish if nothing blocks it. Returns (story, blockers)."""
    story, assets = apply_verdicts(story, assets, asset_repo=asset_repo, story_repo=story_repo)
    found = blockers(story, assets)
    if found:
        update: Dict[str, Any] = {'status': 'review', 'blockers': found}
        if updated_by:
            update['updated_by'] = updated_by
        story_repo.patch(story['id'], update)
        return {**story, **update}, found

    assets = assets_mod.copy_to_public(story, assets, admin=admin, repo=asset_repo)
    body = _fill_urls(story, assets)
    hero_ids = _hero_candidates(assets, published_only=True)
    hero = story.get('hero_asset_id')
    if hero not in hero_ids:
        hero = hero_ids[0] if hero_ids else None
    stamp = now_iso()
    update = {
        'status': 'published',
        'published_at': story.get('published_at') or stamp,
        'unpublished_at': None,
        'blockers': [],
        'body': body,
        'hero_asset_id': hero,
    }
    if updated_by:
        update['updated_by'] = updated_by
    story_repo.patch(story['id'], update)
    published = {**story, **update}

    marketing_site.request_rebuild('story_published')
    notify_published(published)
    logger.info(f'Story {str(story["id"])[:8]} published as /stories/{published.get("slug")}/')
    return published, []


def auto_publish(story_id: str, *, admin=None) -> Dict[str, Any]:
    """The automatic path. Returns {'status': 'published' | 'review', ...}."""
    story_repo, asset_repo = _repos(admin)
    story = story_repo.get(story_id)
    if not story:
        return {'status': 'missing'}
    assets = asset_repo.for_story(story_id)
    published, found = _publish(story, assets, admin=admin,
                                story_repo=story_repo, asset_repo=asset_repo)
    return {'status': published.get('status'), 'blockers': found, 'slug': published.get('slug')}


def publish_from_review(story_id: str, *, user_id: str, admin=None
                        ) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, str]]]:
    """The editor's Publish button. Returns (story, blockers); blockers non-empty means 400."""
    story_repo, asset_repo = _repos(admin)
    story = story_repo.get(story_id)
    if not story:
        return None, [_blocker('not_found', 'id', 'Story not found.')]
    if story.get('status') not in ('review', 'unpublished', 'published'):
        return story, [_blocker('wrong_status', 'status',
                                f'A story in status {story.get("status")} cannot be published.')]
    assets = asset_repo.for_story(story_id)
    return _publish(story, assets, admin=admin, story_repo=story_repo,
                    asset_repo=asset_repo, updated_by=user_id)


def unpublish(story_id: str, *, user_id: Optional[str] = None, reason: str = 'story_unpublished',
              admin=None, rebuild: bool = True) -> Optional[Dict[str, Any]]:
    """Take a story down. Objects first, row second, rebuild last."""
    story_repo, asset_repo = _repos(admin)
    story = story_repo.get(story_id)
    if not story:
        return None
    assets = asset_repo.for_story(story_id)
    try:
        assets_mod.delete_public(story, assets, admin=admin, repo=asset_repo)
    except Exception as e:  # noqa: BLE001
        # Recorded, not fatal: the row still goes to unpublished and the
        # nightly reconcile retries the objects.
        report_error(e, 'Could not delete public story assets', story_id=story_id)

    body = _fill_urls(story, [{**a, 'public_path': None, 'poster_path': None} for a in assets])
    update = {
        'status': 'unpublished',
        'unpublished_at': now_iso(),
        'body': body,
    }
    if user_id:
        update['updated_by'] = user_id
    story_repo.patch(story_id, update)
    if rebuild:
        marketing_site.request_rebuild(reason)
    logger.info(f'Story {str(story_id)[:8]} unpublished ({reason})')
    return {**story, **update}


def unpublish_all_for_student(student_id: str, *, reason: str = 'consent_revoked',
                              tier: Optional[str] = None, admin=None) -> int:
    """Every published story about this student comes down. Returns how many.

    `tier='named'` limits it to the stories that used the consent being
    revoked; an anonymized story never depended on one. Erasure passes None.
    """
    story_repo, _ = _repos(admin)
    rows = story_repo.list_for_student(student_id, statuses=['published'])
    count = 0
    for row in rows:
        if tier and row.get('tier') != tier:
            continue
        if unpublish(row['id'], reason=reason, admin=admin, rebuild=False):
            count += 1
    if count:
        marketing_site.request_rebuild(reason)
    return count


# ── the founder's email ──────────────────────────────────────────────────────

def notify_published(story: Dict[str, Any]) -> bool:
    """Tell the founder a page went live. Never raises; failure is logged."""
    try:
        from services.email_service import EmailService

        www = marketing_site.story_url(story.get('slug') or '')
        title = story.get('title') or 'Untitled story'
        concerns = [c for c in (story.get('concerns') or []) if isinstance(c, str) and c.strip()]
        admin_url = None
        frontend = getattr(Config, 'FRONTEND_URL', None)
        if frontend:
            admin_url = f'{str(frontend).rstrip("/")}/admin/stories/{story.get("id")}'

        lines_html = [f'<p>A story was published: <a href="{html.escape(www)}">{html.escape(www)}</a></p>',
                      f'<p><strong>{html.escape(title)}</strong><br>'
                      f'{html.escape(story.get("dek") or "")}</p>']
        lines_text = [f'A story was published: {www}', '', title, story.get('dek') or '', '']
        if concerns:
            lines_html.append('<p>The drafter flagged these for you:</p><ul>'
                              + ''.join(f'<li>{html.escape(c)}</li>' for c in concerns) + '</ul>')
            lines_text.append('The drafter flagged these for you:')
            lines_text.extend(f'  - {c}' for c in concerns)
            lines_text.append('')
        else:
            lines_html.append('<p>The drafter flagged nothing.</p>')
            lines_text.append('The drafter flagged nothing.')
            lines_text.append('')
        if admin_url:
            lines_html.append(f'<p>Edit or unpublish: <a href="{html.escape(admin_url)}">'
                              f'{html.escape(admin_url)}</a></p>')
            lines_text.append(f'Edit or unpublish: {admin_url}')

        return bool(EmailService().send_email(
            to_email=Config.ADMIN_EMAIL,
            subject=f'Story published: {title}',
            html_body='\n'.join(lines_html),
            text_body='\n'.join(lines_text),
            categories=['stories'],
        ))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Story published but the notification email failed: {e}')
        return False


# ── the public projection ────────────────────────────────────────────────────

def _pick(item: Any, keys: Tuple[str, ...]) -> Dict[str, Any]:
    if not isinstance(item, dict):
        return {}
    return {k: item.get(k) for k in keys}


def _included(row: Any) -> bool:
    """An editor can switch a criterion, round or task row off. Off means gone."""
    return isinstance(row, dict) and row.get('included') is not False


def _public_sections(story: Dict[str, Any], by_id: Dict[str, Dict[str, Any]]
                     ) -> Tuple[List[Dict[str, Any]], int]:
    raw_body = story.get('body')
    body: Dict[str, Any] = raw_body if isinstance(raw_body, dict) else {}
    sections: List[Dict[str, Any]] = []
    task_count = 1
    for section in body.get('sections') or []:
        if not isinstance(section, dict):
            continue
        kind = section.get('kind')
        if kind not in PUBLIC_SECTION_KINDS:
            # how_it_went on rows drafted before 2026-09-12, or anything new
            # the site does not know: not a public section.
            continue
        if kind in ('what_they_did', 'what_it_counted_for'):
            sections.append({'kind': kind, 'body_md': section.get('body_md') or ''})
        elif kind == 'tasks':
            rows = [_pick(r, TASK_ROW_KEYS) for r in section.get('rows') or [] if _included(r)]
            task_count = max(1, len(rows))
            sections.append({'kind': kind, 'rows': rows})
        elif kind == 'evidence':
            items = []
            seen_assets: set = set()
            for item in section.get('items') or []:
                if not isinstance(item, dict) or not _included(item):
                    continue
                if item.get('type') == 'quote':
                    # The student's words. `included` and `safety` stay behind;
                    # so does everything else on the item.
                    text = item.get('text')
                    if isinstance(text, str) and text.strip():
                        items.append({'type': 'quote', 'text': text,
                                      'caption': item.get('caption') or None})
                    continue
                if item.get('type') == 'link':
                    url = item.get('url')
                    if isinstance(url, str) and url.strip():
                        items.append({'type': 'link', 'url': url,
                                      'alt': item.get('alt') or '',
                                      'caption': item.get('caption') or None})
                    continue
                asset_id = item.get('asset_id')
                asset = (by_id.get(asset_id) or {}) if asset_id else {}
                if asset_id:
                    seen_assets.add(asset_id)
                public_item = _asset_public_item(asset, item)
                if public_item is not None:
                    items.append(public_item)
            # An asset a superadmin included AFTER the draft (the model
            # excluded it; a human looked and disagreed) has no body item,
            # because the drafter writes items for included assets only.
            # The asset row is the record of what is public, so it goes on
            # the page too, after the drafted items, in upload order.
            for asset_id, asset in by_id.items():
                if asset_id in seen_assets or not asset.get('included'):
                    continue
                public_item = _asset_public_item(asset, {})
                if public_item is not None:
                    items.append(public_item)
            sections.append({'kind': kind, 'items': items})
        elif kind == 'what_reviewer_looked_for':
            sections.append({'kind': kind,
                             'criteria': [_pick(c, CRITERION_KEYS)
                                          for c in section.get('criteria') or [] if _included(c)]})
    return sections, task_count


def _asset_public_item(asset: Dict[str, Any], item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """One image, video or document as the page shows it, or None when there
    is nothing public to show. The asset row decides the type (a video is a
    video and a PDF a document whatever the item says) and the URL; the body
    item may carry the editor's alt and caption."""
    url = (assets_mod.public_url_for(asset.get('public_path'))
           if asset.get('included') and asset.get('public_path')
           else asset.get('preview_url') or item.get('url'))
    if not url:
        return None
    if _is_video(asset):
        item_type = 'video'
    elif _is_document(asset):
        item_type = 'document'
    else:
        item_type = item.get('type') or 'image'
    public_item: Dict[str, Any] = {
        'type': item_type,
        'url': url,
        'alt': item.get('alt') or asset.get('alt') or '',
        'caption': item.get('caption') if item.get('caption') is not None else asset.get('caption'),
    }
    width = asset.get('width') or item.get('width')
    height = asset.get('height') or item.get('height')
    if width is not None:
        public_item['width'] = width
    if height is not None:
        public_item['height'] = height
    if item_type == 'video':
        public_item['thumb_url'] = (assets_mod.public_url_for(asset.get('poster_path'))
                                    if asset.get('poster_path') else None)
        public_item['duration_seconds'] = asset.get('duration_seconds')
    return public_item


def _public_hero(story: Dict[str, Any], by_id: Dict[str, Dict[str, Any]]
                 ) -> Optional[Dict[str, Any]]:
    """The page's lead evidence, or None. An image, or a video with its poster
    frame when the publish step could extract one."""
    hero_id = story.get('hero_asset_id')
    hero = (by_id.get(str(hero_id)) if hero_id else None) or {}
    if not _is_frame(hero) or not hero.get('included') or not hero.get('public_path'):
        return None
    url = assets_mod.public_url_for(hero.get('public_path'))
    if not url:
        return None
    out: Dict[str, Any] = {
        'type': 'video' if _is_video(hero) else 'image',
        'url': url,
        'alt': hero.get('alt') or None,
        'caption': hero.get('caption') or None,
        'width': hero.get('width'),
        'height': hero.get('height'),
    }
    if _is_video(hero):
        out['poster_url'] = (assets_mod.public_url_for(hero.get('poster_path'))
                             if hero.get('poster_path') else None)
        out['duration_seconds'] = hero.get('duration_seconds')
    return out


def public_view(story: Dict[str, Any], assets: List[Dict[str, Any]],
                *, preview: bool = False) -> Dict[str, Any]:
    """Exactly what the marketing site's zod schema expects. Nothing else.

    ``preview`` is the local-only path behind ``?preview=1``: a story still in
    review has no public copies of its media, so included assets are shown
    through short-lived signed URLs of the private originals instead. The
    route refuses the flag in production, so those URLs never leave a dev box.
    """
    if preview:
        from utils.storage_urls import sign_stored_url
        assets = [
            {**a, 'preview_url': (sign_stored_url(a.get('source_ref'))
                                  if a.get('included') and not a.get('public_path') else None)}
            for a in (assets or [])
        ]
    by_id = {a['id']: a for a in assets or [] if a.get('id')}
    sections, task_count = _public_sections(story, by_id)
    raw_body = story.get('body')
    body: Dict[str, Any] = raw_body if isinstance(raw_body, dict) else {}
    faq = [{'q': f.get('q'), 'a': f.get('a')} for f in body.get('faq') or []
           if isinstance(f, dict) and f.get('q') and f.get('a')]

    hero = _public_hero(story, by_id)
    # The still the card, the og:image and Article.image use: the image
    # itself, or a video's poster frame. `hero_image_url` is the name the
    # site's schema had before `hero` existed and is kept for it.
    still_url = None
    if hero:
        still_url = hero['url'] if hero['type'] == 'image' else hero.get('poster_url')

    # An anonymized story names nobody, not even generically: the page says
    # the grade band and the school in its facts instead. The stored label
    # stays on the row for the prompt and the label_not_generic blocker.
    named = (story.get('tier') or 'anonymized') == 'named'

    raw_receipt = story.get('receipt')
    receipt: Dict[str, Any] = raw_receipt if isinstance(raw_receipt, dict) else {}
    subject = story.get('subject') or 'Electives'
    return {
        'slug': story.get('slug'),
        'title': story.get('title'),
        'dek': story.get('dek'),
        'status': 'published' if story.get('status') == 'published' else 'review',
        'published_at': story.get('published_at') or story.get('updated_at') or story.get('created_at'),
        'updated_at': story.get('updated_at'),
        'author': {'name': story.get('author_name'), 'title': story.get('author_title')},
        'student': {
            'label': story.get('student_label') if named else None,
            'setting': story.get('setting'),
            'grade_band': story.get('grade_band'),
        },
        'activity': {'slug': story.get('activity_slug') or 'other',
                     'label': story.get('activity_label')},
        'receipt': {
            'activity': receipt.get('activity'),
            'course': receipt.get('course'),
            'credit': receipt_credit_line(story),
            'icon': receipt.get('icon'),
        },
        'subject': subject,
        'subject_slug': subject_slug(subject),
        'subject_split': [{'subject': r.get('subject'), 'xp': r.get('xp')}
                          for r in (story.get('subject_split') or []) if isinstance(r, dict)],
        'xp_awarded': story.get('xp_awarded'),
        'credit_fraction': credit_display(story.get('credit_fraction')),
        'credit_rule': {'xp_per_credit': XP_PER_CREDIT},
        # awarded | pending. The card and the receipt on www read it; a payload
        # from before 2026-09-15 has no field and every such story was awarded.
        'credit_state': credit_state_of(story),
        'task_count': task_count,
        'sections': sections,
        'faq': faq,
        'hero': hero,
        'hero_image_url': still_url,
        'hero_alt': (hero.get('alt') if hero else None) if still_url else None,
        'og_image_url': still_url,
        'source': {'type': story.get('source_type')},
    }


# ── the nightly ──────────────────────────────────────────────────────────────

def reconcile(*, admin=None) -> Dict[str, Any]:
    """Make the bucket agree with the rows. Returns counts. Never raises.

    Published stories get any missing public copy made; anything not published
    gets its public objects removed. This is what makes an unpublish whose
    delete failed eventually true.
    """
    counts = {'checked': 0, 'copied': 0, 'removed': 0, 'errors': 0}
    try:
        story_repo, asset_repo = _repos(admin)
        stories = story_repo.list_all(limit=1000)
        for row in stories:
            counts['checked'] += 1
            try:
                assets = asset_repo.for_story(row['id'])
                if row.get('status') == 'published':
                    missing = [a for a in assets if a.get('included') and not a.get('public_path')]
                    stray = [a for a in assets if not a.get('included')
                             and (a.get('public_path') or a.get('poster_path'))]
                    if missing:
                        story = story_repo.get(row['id']) or row
                        updated = assets_mod.copy_to_public(story, assets, admin=admin, repo=asset_repo)
                        counts['copied'] += sum(1 for a in updated if a.get('public_path')) - (
                            len(assets) - len(missing) - len(stray))
                        story_repo.patch(row['id'], {'body': _fill_urls(story, updated)})
                    if stray:
                        counts['removed'] += assets_mod.delete_public(
                            row, stray, admin=admin, repo=asset_repo)
                        story = story_repo.get(row['id']) or row
                        assets = asset_repo.for_story(row['id'])
                        story_repo.patch(row['id'], {'body': _fill_urls(story, assets)})
                else:
                    if any(a.get('public_path') or a.get('poster_path') for a in assets):
                        counts['removed'] += assets_mod.delete_public(
                            row, assets, admin=admin, repo=asset_repo)
            except Exception as e:  # noqa: BLE001
                counts['errors'] += 1
                report_error(e, 'Story reconcile failed for one story', story_id=row.get('id'))
    except Exception as e:  # noqa: BLE001
        report_error(e, 'Story reconcile failed')
        counts['errors'] += 1
    return counts
