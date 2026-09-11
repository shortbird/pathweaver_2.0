"""Asking the model for a draft, and assembling the story row around it.

Two halves, deliberately separate:

`StoryDrafter.draft` is the one model call. Temperature 0.7 because this is
prose, not a checklist; the response schema keeps the shape honest.

`assemble` turns the answer into the row. The model wrote the words; Python
supplies every fact -- label, subject, XP, credit, grade band, setting, the
criteria and the rounds copied verbatim from the source -- and validates the
closed choices (activity slug, receipt icon). A drafter cannot misstate the
credit a story is about, because it never gets to state it.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from app_config import Config
from services.base_ai_service import BaseAIService
from utils.evidence_labels import strip_markdown
from utils.logger import get_logger
from utils.timestamps import now_iso

from services.stories import prompt as prompt_mod
from services.stories.activities import normalize_activity_slug, valid_icon
from services.stories.anonymize import Scrubber
from services.stories.safety import ImageVerdict, ItemVerdict
from services.stories.schema import RESPONSE_SCHEMA
from services.stories.source import (
    ImageCandidate,
    StorySource,
    credit_display,
    credit_fraction_for,
    subject_display,
    subject_split_rows,
)

#: What the founder's email and the editor say about a quote or link left out.
ITEM_REASONS = {
    'text_leak': 'the text still identified someone after a re-scrub',
    'external_link_identifies': 'an external link identifies the student in an anonymized story',
    'social_profile': 'the link is a social media profile',
    'insecure_url': 'the link is not https',
    'empty': 'there was nothing left to quote',
}

logger = get_logger(__name__)

GENERATION_CONFIG = {
    'temperature': 0.7,
    'top_p': 0.9,
    'max_output_tokens': 8192,
}

AUTHOR_NAME = 'Dr. Tanner Bowman'
AUTHOR_TITLE = 'Founder, Optio'

MAX_TITLE_CHARS = 90
MAX_DEK_CHARS = 300


@dataclass
class DraftResult:
    data: Dict[str, Any]
    model: str
    prompt_version: str
    usage: Dict[str, Any] = field(default_factory=dict)
    drafted_at: str = ''


class StoryDrafter(BaseAIService):
    """One call. Model name from Config.GEMINI_MODEL, never here."""

    def draft(self, source: StorySource, *, student_label: str,
              safe_images: List[ImageCandidate], tier: str = 'anonymized') -> DraftResult:
        text = prompt_mod.build_prompt(source, student_label=student_label,
                                       safe_images=safe_images, tier=tier)
        parts = prompt_mod.build_parts(text, safe_images)
        result = self.generate_json_multimodal(
            parts,
            generation_config=GENERATION_CONFIG,
            response_schema=RESPONSE_SCHEMA,
            timeout=Config.STORY_DRAFT_TIMEOUT,
        )
        data = result.data if isinstance(result.data, dict) else {}
        return DraftResult(
            data=data,
            model=result.model_name,
            prompt_version=prompt_mod.PROMPT_VERSION,
            usage={
                'input_tokens': result.input_tokens,
                'output_tokens': result.output_tokens,
                'elapsed_ms': result.elapsed_ms,
                'attempts': result.attempts,
                'schema_used': result.schema_used,
                'notes': list(result.notes or []),
            },
            drafted_at=now_iso(),
        )


# ── assembly ─────────────────────────────────────────────────────────────────

def slugify(title: str) -> str:
    slug = (title or '').lower().strip()
    slug = re.sub(r"['’]", '', slug)
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'\s+', '-', slug)
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug[:80].rstrip('-') or 'story'


def unique_slug(title: str, exists: Callable[[str], bool]) -> str:
    """The title's slug, suffixed -2, -3 ... while a story already has it."""
    base = slugify(title)
    candidate = base
    n = 2
    while exists(candidate):
        candidate = f'{base}-{n}'
        n += 1
        if n > 500:
            candidate = f'{base}-{uuid.uuid4().hex[:6]}'
            break
    return candidate


def _plain(text: Any, limit: int) -> str:
    if not isinstance(text, str):
        return ''
    return ' '.join(strip_markdown(text).split())[:limit].strip()


def _md(text: Any) -> str:
    return text.strip() if isinstance(text, str) else ''


def _faq(raw: Any) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        q, a = _plain(item.get('q'), 200), _md(item.get('a'))
        if q and a:
            out.append({'q': q, 'a': a})
    return out[:5]


def _criteria_rows(source: StorySource) -> List[Dict[str, Any]]:
    """What the reviewer looked for, copied from the source, never drafted.

    A finalized submission was approved by a human, so a criterion the AI
    review called anything other than met is shown as partial: the human
    judged the whole; the note says what the AI saw.
    """
    rows: List[Dict[str, Any]] = []
    for task in source.tasks:
        if task.ai_criteria:
            for c in task.ai_criteria:
                text = (c.get('criterion') or '').strip()
                if not text:
                    continue
                rows.append({
                    'text': text,
                    'verdict': 'met' if c.get('verdict') == 'met' else 'partial',
                    'note': (c.get('note') or '').strip() or None,
                })
        else:
            for text in task.criteria:
                rows.append({'text': text, 'verdict': 'met', 'note': None})
    return rows


def _round_rows(source: StorySource) -> List[Dict[str, Any]]:
    if len(source.tasks) != 1:
        return []
    return [{
        'round': r.round_number,
        'date': r.date,
        'action': r.action,
        'feedback_verbatim': r.feedback,
        'what_changed': r.what_changed,
    } for r in source.tasks[0].rounds]


def _task_rows(source: StorySource, summaries: Dict[int, str]) -> List[Dict[str, Any]]:
    rows = []
    for task in source.tasks:
        rows.append({
            'title': task.title,
            'subject': subject_display(task.primary_subject) if task.primary_subject else 'Electives',
            'xp': task.xp,
            'criteria_met': task.criteria_met if task.ai_criteria else len(task.criteria),
            'criteria_total': len(task.ai_criteria) if task.ai_criteria else len(task.criteria),
            'rounds': len(task.rounds),
            'summary': summaries.get(task.index) or None,
        })
    return rows


def _quote_items(source: StorySource, verdicts: List[ItemVerdict]
                 ) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Evidence items for the quotes, in the order the student wrote them.

    Each carries `included` and a `safety` record so the editor can toggle it
    and see why it was left out. An excluded quote becomes a concern, never a
    blocker: one quotation with a leak is not a reason to hold the page.
    """
    by_index = {v.index: v for v in verdicts or []}
    items: List[Dict[str, Any]] = []
    concerns: List[str] = []
    for quote in source.quote_candidates:
        verdict = by_index.get(quote.index)
        safe = bool(verdict and verdict.safe)
        text = (verdict.text if verdict and verdict.text is not None else quote.text)
        safety: Dict[str, Any] = (verdict.safety_record() if verdict
                                  else {'verdict': 'excluded', 'reason': 'not_checked'})
        if verdict and verdict.leaks:
            safety['leaks'] = verdict.leaks
        items.append({
            'type': 'quote', 'text': text, 'caption': quote.caption,
            'source_block_id': quote.block_id, 'source_item_index': quote.item_index,
            'included': safe, 'safety': safety,
        })
        if not safe:
            reason = ITEM_REASONS.get(safety.get('reason') or '', safety.get('reason') or 'not checked')
            concerns.append(f'Quote [Q{quote.index}] left out: {reason}.')
    return items, concerns


def _link_items(source: StorySource, verdicts: List[ItemVerdict]
                ) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Evidence items for the external links. Nothing is copied; the URL is
    the student's, and `alt` is the title the card shows."""
    by_index = {v.index: v for v in verdicts or []}
    items: List[Dict[str, Any]] = []
    concerns: List[str] = []
    for link in source.link_candidates:
        verdict = by_index.get(link.index)
        safe = bool(verdict and verdict.safe)
        safety = (verdict.safety_record() if verdict
                  else {'verdict': 'excluded', 'reason': 'not_checked'})
        items.append({
            'type': 'link', 'url': link.url, 'alt': link.title, 'caption': None,
            'source_block_id': link.block_id, 'source_item_index': link.item_index,
            'included': safe, 'safety': safety,
        })
        if not safe:
            reason = ITEM_REASONS.get(safety.get('reason') or '', safety.get('reason') or 'not checked')
            concerns.append(f'Link [L{link.index}] ({link.host or "a link"}) left out: {reason}.')
    return items, concerns


def assemble(source: StorySource, draft: DraftResult, *, student_label: str, tier: str,
             verdicts: List[ImageVerdict], scrubber: Scrubber,
             slug_exists: Callable[[str], bool],
             story_id: Optional[str] = None,
             quote_verdicts: Optional[List[ItemVerdict]] = None,
             link_verdicts: Optional[List[ItemVerdict]] = None) -> Dict[str, Any]:
    """The story row's fields, plus the asset rows to insert.

    Returns {'story': {...columns...}, 'assets': [...rows...]}. The draft is
    scrubbed once more here (scrub_structure) before anything is read from it:
    the prompt forbids names, and the scrubber is what makes that a rule.

    Files (images, videos, PDFs) become asset rows and asset-backed evidence
    items. Quotes and links become evidence items only, each with `included`
    and `safety`, after the files and in the student's order. Their verdicts
    are computed here when the caller did not (they need no model call).
    """
    from services.stories import safety as safety_mod

    if quote_verdicts is None:
        quote_verdicts = safety_mod.check_quotes(source.quote_candidates, scrubber)
    if link_verdicts is None:
        link_verdicts = safety_mod.check_links(source.link_candidates, tier=tier,
                                               scrubber=scrubber)
    data = scrubber.scrub_structure(draft.data or {})
    split = source.subject_split
    primary_key = source.primary_subject
    subject = subject_display(primary_key) if primary_key else 'Electives'
    fraction = credit_fraction_for(source.xp_total)
    activity_slug = normalize_activity_slug(data.get('activity_slug'))

    receipt_raw = data.get('receipt') if isinstance(data.get('receipt'), dict) else {}
    receipt = {
        'activity': _plain(receipt_raw.get('activity'), 60) or _plain(data.get('activity_label'), 60)
        or source.quest.title[:60],
        'course': subject,
        'credit': credit_display(fraction),
        'icon': valid_icon(receipt_raw.get('icon'), activity_slug, primary_key),
    }

    title = _plain(data.get('title'), MAX_TITLE_CHARS)
    dek = _plain(data.get('dek'), MAX_DEK_CHARS)

    # Images: the model chose among the SAFE ones only; an excluded verdict wins
    # over any use=true the model returned for it (it never saw it, but a
    # hallucinated index is cheap and a face on the site is not).
    by_index = {v.index: v for v in verdicts}
    model_images: Dict[int, Dict[str, Any]] = {}
    for item in data.get('images') if isinstance(data.get('images'), list) else []:
        if isinstance(item, dict):
            index = item.get('index')
            if index is None:
                continue
            try:
                model_images[int(index)] = item
            except (TypeError, ValueError):
                continue

    assets: List[Dict[str, Any]] = []
    evidence_items: List[Dict[str, Any]] = []
    hero_asset_id: Optional[str] = None
    try:
        hero_index = int(data.get('hero_index') or 0)
    except (TypeError, ValueError):
        hero_index = 0

    for order, candidate in enumerate(source.image_candidates):
        verdict = by_index.get(candidate.index)
        choice = model_images.get(candidate.index) or {}
        safe = bool(verdict and verdict.safe)
        if candidate.is_document:
            # A safe PDF the student submitted is evidence by definition; the
            # model may leave it off the page (use=false) but not by silence.
            included = safe and bool(choice.get('use', True))
            alt = candidate.label or _plain(choice.get('alt'), 200) or None
        else:
            included = safe and bool(choice.get('use'))
            alt = _plain(choice.get('alt'), 200) or None
        asset_id = str(uuid.uuid4())
        caption = _plain(choice.get('caption'), 300) or None
        kind = candidate.kind if candidate.kind in ('video', 'document') else 'image'
        assets.append({
            'id': asset_id,
            'story_id': story_id,
            'source_block_id': candidate.block_id,
            'source_item_index': candidate.item_index,
            'source_ref': candidate.source_ref,
            'kind': kind,
            'mime_type': candidate.mime_type or None,
            'public_path': None,
            'alt': alt,
            'caption': caption,
            'width': None,
            'height': None,
            'order_index': order,
            'safety': verdict.safety_record() if verdict else {'verdict': 'excluded',
                                                                 'reason': 'not_checked'},
            'included': included,
        })
        if included:
            evidence_items.append({
                'type': kind, 'asset_id': asset_id, 'url': None,
                'alt': alt or '', 'caption': caption, 'width': None, 'height': None,
            })
            # The hero is a still. The model was told so; this is the rule.
            if candidate.index == hero_index and candidate.is_image:
                hero_asset_id = asset_id
    if hero_asset_id is None:
        first_image = next((i for i in evidence_items if i['type'] == 'image'), None)
        hero_asset_id = first_image['asset_id'] if first_image else None

    quote_items, quote_concerns = _quote_items(source, quote_verdicts)
    link_items, link_concerns = _link_items(source, link_verdicts)
    evidence_items.extend(quote_items)
    evidence_items.extend(link_items)

    summaries: Dict[int, str] = {}
    for item in data.get('tasks') if isinstance(data.get('tasks'), list) else []:
        if isinstance(item, dict):
            index = item.get('index')
            if index is None:
                continue
            try:
                summaries[int(index)] = _plain(item.get('summary'), 300)
            except (TypeError, ValueError):
                continue

    sections: List[Dict[str, Any]] = [
        {'kind': 'what_they_did', 'body_md': _md(data.get('what_they_did'))},
    ]
    if source.source_type == 'quest':
        sections.append({'kind': 'tasks', 'rows': _task_rows(source, summaries)})
    sections.append({'kind': 'evidence', 'items': evidence_items})
    sections.append({'kind': 'what_reviewer_looked_for', 'criteria': _criteria_rows(source)})
    rounds = _round_rows(source)
    if rounds:
        sections.append({'kind': 'how_it_went', 'rounds': rounds})
    sections.append({'kind': 'what_it_counted_for', 'body_md': _md(data.get('what_it_counted_for'))})

    concerns = [_plain(c, 300) for c in (data.get('concerns') or []) if isinstance(c, str)]
    concerns = [c for c in concerns if c]
    for task in source.tasks:
        for flag in task.evidence_flags:
            concerns.append(f'Evidence not read: {flag}')
    concerns.extend(quote_concerns)
    concerns.extend(link_concerns)

    story = {
        'slug': unique_slug(title or source.quest.title, slug_exists),
        'tier': tier,
        'title': title,
        'dek': dek,
        'body': {
            'sections': sections,
            'faq': _faq(data.get('faq')),
            'title_options': [_plain(t, MAX_TITLE_CHARS) for t in (data.get('title_options') or [])
                              if isinstance(t, str)][:3],
            'search_phrases': [_plain(p, 120) for p in (data.get('search_phrases') or [])
                               if isinstance(p, str)][:6],
        },
        'student_label': student_label,
        'setting': source.student.setting,
        'grade_band': source.student.grade_band,
        'activity_slug': activity_slug,
        'activity_label': _plain(data.get('activity_label'), 80) or receipt['activity'],
        'receipt': receipt,
        'subject': subject,
        'subject_split': subject_split_rows(split),
        'xp_awarded': source.xp_total,
        'credit_fraction': fraction,
        'hero_asset_id': hero_asset_id,
        'og_image_url': None,
        'author_name': AUTHOR_NAME,
        'author_title': AUTHOR_TITLE,
        'ai_draft': {
            'data': data,
            'model': draft.model,
            'prompt_version': draft.prompt_version,
            'usage': draft.usage,
            'drafted_at': draft.drafted_at,
        },
        'concerns': concerns,
    }
    return {'story': story, 'assets': assets}
