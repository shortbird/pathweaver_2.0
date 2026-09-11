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

from services import marketing_site
from services.stories import assets as assets_mod
from services.stories.anonymize import is_generic_label
from services.stories.source import credit_display, subject_slug

logger = get_logger(__name__)

EVIDENCE_ITEM_KEYS = ('type', 'url', 'alt', 'caption', 'width', 'height')
TASK_ROW_KEYS = ('title', 'subject', 'xp', 'criteria_met', 'criteria_total', 'rounds')
CRITERION_KEYS = ('text', 'verdict', 'note')
ROUND_KEYS = ('round', 'date', 'action', 'feedback_verbatim', 'what_changed')

_AGE_RE = re.compile(r'\b(?:aged?\s+\d{1,2}|\d{1,2}[\s-]year[\s-]old|\d{1,2}\s+years\s+old)\b',
                     re.IGNORECASE)


def _repos(admin=None):
    from repositories.story_asset_repository import StoryAssetRepository
    from repositories.story_repository import StoryRepository
    return StoryRepository(client=admin), StoryAssetRepository(client=admin)


# ── the gate ─────────────────────────────────────────────────────────────────

def _section(story: Dict[str, Any], kind: str) -> Optional[Dict[str, Any]]:
    body = story.get('body') if isinstance(story.get('body'), dict) else {}
    for section in body.get('sections') or []:
        if isinstance(section, dict) and section.get('kind') == kind:
            return section
    return None


def _blocker(code: str, field: str, message: str) -> Dict[str, str]:
    return {'code': code, 'field': field, 'message': message}


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

    safety = story.get('safety') if isinstance(story.get('safety'), dict) else {}
    text_report = safety.get('text') if isinstance(safety.get('text'), dict) else {}
    if 'text_leak' in (text_report.get('blockers') or []):
        out.append(_blocker('text_leak', 'body',
                            'The text still identified someone after one rescrub: '
                            + ', '.join(text_report.get('leaks_after') or [])[:200]))

    by_id = {a.get('id'): a for a in assets}
    hero = story.get('hero_asset_id')
    if hero and not (by_id.get(hero) or {}).get('included'):
        out.append(_blocker('hero_excluded', 'hero_asset_id',
                            'The hero image is an excluded asset.'))

    evidence = _section(story, 'evidence') or {}
    for item in evidence.get('items') or []:
        url = item.get('url') if isinstance(item, dict) else None
        if url and not str(url).startswith('https://'):
            out.append(_blocker('insecure_url', 'evidence', f'Not an https URL: {url}'))

    receipt = story.get('receipt') if isinstance(story.get('receipt'), dict) else {}
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
    said. A hero that points at an excluded asset is re-pointed at the first
    included one, or cleared. Evidence items for excluded assets are dropped.
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
    hero = story.get('hero_asset_id')
    new_hero = hero if hero in included_ids else (included_ids[0] if included_ids else None)

    body = dict(story.get('body') or {})
    sections = []
    for section in body.get('sections') or []:
        if isinstance(section, dict) and section.get('kind') == 'evidence':
            items = [i for i in (section.get('items') or [])
                     if isinstance(i, dict) and i.get('asset_id') in included_ids]
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
    """Evidence items get their public URL, size and nothing else."""
    by_id = {a.get('id'): a for a in assets}
    body = dict(story.get('body') or {})
    sections = []
    for section in body.get('sections') or []:
        if isinstance(section, dict) and section.get('kind') == 'evidence':
            items = []
            for item in section.get('items') or []:
                asset = by_id.get((item or {}).get('asset_id')) if isinstance(item, dict) else None
                if not asset or not asset.get('public_path') or not asset.get('included'):
                    continue
                items.append({
                    **item,
                    'url': assets_mod.public_url_for(asset['public_path']),
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
        update = {'status': 'review', 'blockers': found}
        if updated_by:
            update['updated_by'] = updated_by
        story_repo.patch(story['id'], update)
        return {**story, **update}, found

    assets = assets_mod.copy_to_public(story, assets, admin=admin, repo=asset_repo)
    body = _fill_urls(story, assets)
    included_ids = [a['id'] for a in assets if a.get('included') and a.get('public_path')]
    hero = story.get('hero_asset_id')
    if hero not in included_ids:
        hero = included_ids[0] if included_ids else None
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

    body = _fill_urls(story, [{**a, 'public_path': None} for a in assets])
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
    body = story.get('body') if isinstance(story.get('body'), dict) else {}
    sections: List[Dict[str, Any]] = []
    task_count = 1
    for section in body.get('sections') or []:
        if not isinstance(section, dict):
            continue
        kind = section.get('kind')
        if kind in ('what_they_did', 'what_it_counted_for'):
            sections.append({'kind': kind, 'body_md': section.get('body_md') or ''})
        elif kind == 'tasks':
            rows = [_pick(r, TASK_ROW_KEYS) for r in section.get('rows') or [] if _included(r)]
            task_count = max(1, len(rows))
            sections.append({'kind': kind, 'rows': rows})
        elif kind == 'evidence':
            items = []
            for item in section.get('items') or []:
                if not isinstance(item, dict):
                    continue
                asset = by_id.get(item.get('asset_id')) or {}
                url = (assets_mod.public_url_for(asset.get('public_path'))
                       if asset.get('included') and asset.get('public_path') else item.get('url'))
                if not url:
                    continue
                items.append({
                    'type': item.get('type') or 'image',
                    'url': url,
                    'alt': item.get('alt') or asset.get('alt') or '',
                    'caption': item.get('caption') if item.get('caption') is not None else asset.get('caption'),
                    'width': asset.get('width') or item.get('width'),
                    'height': asset.get('height') or item.get('height'),
                })
            sections.append({'kind': kind, 'items': items})
        elif kind == 'what_reviewer_looked_for':
            sections.append({'kind': kind,
                             'criteria': [_pick(c, CRITERION_KEYS)
                                          for c in section.get('criteria') or [] if _included(c)]})
        elif kind == 'how_it_went':
            sections.append({'kind': kind,
                             'rounds': [_pick(r, ROUND_KEYS)
                                        for r in section.get('rounds') or [] if _included(r)]})
    return sections, task_count


def public_view(story: Dict[str, Any], assets: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Exactly what the marketing site's zod schema expects. Nothing else."""
    by_id = {a.get('id'): a for a in assets or []}
    sections, task_count = _public_sections(story, by_id)
    body = story.get('body') if isinstance(story.get('body'), dict) else {}
    faq = [{'q': f.get('q'), 'a': f.get('a')} for f in body.get('faq') or []
           if isinstance(f, dict) and f.get('q') and f.get('a')]

    hero = by_id.get(story.get('hero_asset_id')) or {}
    hero_url = (assets_mod.public_url_for(hero.get('public_path'))
                if hero.get('included') and hero.get('public_path') else None)

    receipt = story.get('receipt') if isinstance(story.get('receipt'), dict) else {}
    subject = story.get('subject') or 'Electives'
    return {
        'slug': story.get('slug'),
        'title': story.get('title'),
        'dek': story.get('dek'),
        'status': 'published',
        'published_at': story.get('published_at'),
        'updated_at': story.get('updated_at'),
        'author': {'name': story.get('author_name'), 'title': story.get('author_title')},
        'student': {
            'label': story.get('student_label'),
            'setting': story.get('setting'),
            'grade_band': story.get('grade_band'),
        },
        'activity': {'slug': story.get('activity_slug') or 'other',
                     'label': story.get('activity_label')},
        'receipt': {
            'activity': receipt.get('activity'),
            'course': receipt.get('course'),
            'credit': receipt.get('credit'),
            'icon': receipt.get('icon'),
        },
        'subject': subject,
        'subject_slug': subject_slug(subject),
        'subject_split': [{'subject': r.get('subject'), 'xp': r.get('xp')}
                          for r in (story.get('subject_split') or []) if isinstance(r, dict)],
        'xp_awarded': story.get('xp_awarded'),
        'credit_fraction': credit_display(story.get('credit_fraction')),
        'task_count': task_count,
        'sections': sections,
        'faq': faq,
        'hero_image_url': hero_url,
        'hero_alt': hero.get('alt') if hero_url else None,
        'og_image_url': None,
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
                    stray = [a for a in assets if a.get('public_path') and not a.get('included')]
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
                    if any(a.get('public_path') for a in assets):
                        counts['removed'] += assets_mod.delete_public(
                            row, assets, admin=admin, repo=asset_repo)
            except Exception as e:  # noqa: BLE001
                counts['errors'] += 1
                report_error(e, 'Story reconcile failed for one story', story_id=row.get('id'))
    except Exception as e:  # noqa: BLE001
        report_error(e, 'Story reconcile failed')
        counts['errors'] += 1
    return counts
