"""Naming a piece of student evidence without leaking a link to it.

Two rules live here, both learned the hard way.

**A storage URL must never enter an AI prompt.** `quest-evidence` is a private
bucket, so the URL in the database is a durable pointer rather than a fetchable
link -- but handing one to a third-party model still hands over a permanent,
unauthenticated pointer to a minor's schoolwork, and signing it first would be
strictly worse: that is a live capability leaving the platform. A model only
needs to know a file is attached and what it is called. So anything that resolves
to one of our buckets is reduced to its filename, and only genuinely external
links (a YouTube video the student cited) survive as URLs.

**A block's declared type is a hint, not a fact.** `block_type` records which
picker the student happened to open. A student who pastes the URL of a photo into
the "Link" picker produces a `link` block holding a .jpg. The frontend learned
this on 2026-09-02 (see web/src/utils/evidenceItems.js) when a teacher was shown
a URL where a picture belonged; the backend needs the same discipline the moment
it starts deciding what to send a model.

Extracted from services/credit_feedback_ai_service.py so the AI credit reviewer
and the Grow This drafter cannot drift apart on either rule.
"""

from __future__ import annotations

import json
import re
from typing import Any, List, Optional

DEFAULT_TEXT_LIMIT = 2000

# Fields that hold a URL rather than content. Dropped wholesale from any
# fallback JSON dump of an item, so a shape we have not seen before cannot
# smuggle a storage link into a prompt through the catch-all branch.
_URL_FIELDS = ('url', 'thumbnail_url', 'poster_url', 'src', 'signed_url',
               'preview_image', 'download_url', 'file_url')


def block_items(content: Any) -> List[Any]:
    """The individual pieces inside one evidence block.

    Block content is a bare string, ``{"text": ...}``, a single
    ``{"url": ..., ...}``, or the current ``{"items": [...]}`` shape. Port of
    ``blockItems`` in web/src/utils/evidenceItems.js, kept deliberately
    permissive: rows written by three generations of the editor all still exist.
    """
    if content is None:
        return []
    if isinstance(content, str):
        return [content] if content.strip() else []
    if isinstance(content, list):
        return [item for item in content if item]
    if isinstance(content, dict):
        items = content.get('items')
        if isinstance(items, list):
            return [item for item in items if item]
        if content.get('url') or content.get('text'):
            return [content]
        return []
    return []


def describable_ref(item: Any) -> str:
    """A human label for an attachment -- never a storage URL.

    External links are content and stay. Anything ``parse_object_ref`` resolves
    to one of our buckets is reduced to its filename, and an object with no
    recorded filename is named by its object path's last segment rather than by
    its link.
    """
    if not isinstance(item, dict):
        return ''

    from utils.storage_urls import parse_object_ref

    filename = item.get('filename') or item.get('file_name')
    url = item.get('url')
    if url and not parse_object_ref(url):
        return str(url)
    if filename:
        return str(filename)
    if url:
        ref = parse_object_ref(url)
        return ref[1].rsplit('/', 1)[-1] if ref else ''
    return ''


def truncate(text: Any, limit: int = DEFAULT_TEXT_LIMIT) -> str:
    """Trim to ``limit`` characters and say so, rather than trailing off."""
    if text is None:
        return ''
    s = str(text).strip()
    if len(s) <= limit:
        return s
    return s[:limit] + '… [truncated]'


def describe_item(item: Any, text_limit: int = DEFAULT_TEXT_LIMIT) -> str:
    """One line describing an evidence item, safe to put in a prompt."""
    if isinstance(item, str):
        return truncate(item, text_limit)
    if not isinstance(item, dict):
        return truncate(str(item), text_limit)

    title = item.get('title') or item.get('caption') or item.get('alt')
    ref = describable_ref(item)
    text = item.get('text')
    if text:
        return truncate(text, text_limit)
    if title and ref:
        return f"{truncate(title, 200)} ({ref})"
    if title:
        return truncate(title, 400)
    if ref:
        return str(ref)
    # Unrecognized shape. Dump what is left with every URL-ish field removed --
    # the catch-all must not be the one path that leaks a link.
    return truncate(json.dumps({
        k: v for k, v in item.items() if k not in _URL_FIELDS
    }), text_limit)


def summarize_block_content(content: Any, text_limit: int = DEFAULT_TEXT_LIMIT) -> str:
    """A one-line summary of a whole block's content."""
    if content is None:
        return '(empty)'
    if isinstance(content, str):
        return truncate(content, text_limit) or '(empty)'
    items = block_items(content)
    if not items:
        if isinstance(content, dict):
            return describe_item(content, text_limit) or '(empty)'
        return truncate(str(content), text_limit)
    parts = [describe_item(item, text_limit) for item in items]
    parts = [p for p in parts if p]
    return '; '.join(parts) if parts else '(empty)'


# ── markdown stripping ───────────────────────────────────────────────────────
#
# Models ignore "no markdown" instructions often enough that the reviewer's
# textarea -- and then the student's feedback banner -- fills with literal
# asterisks. Strip it after the fact rather than trusting the instruction.

_MARKDOWN_PATTERNS = [
    (r"\*\*(.+?)\*\*", r"\1"),
    (r"__(.+?)__", r"\1"),
    # Italics: require non-space on the inside so multiplication and
    # measurements ("3 * 4", "5_000") aren't mangled.
    (r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"\1"),
    (r"(?<!_)_(?!\s)(.+?)(?<!\s)_(?!_)", r"\1"),
    (r"(?m)^[\-\*•]\s+", ""),
    (r"(?m)^\d+\.\s+", ""),
    (r"(?m)^#+\s+", ""),
]


def strip_markdown(text: str) -> str:
    """Remove markdown emphasis, bullets and headers from model prose."""
    if not text:
        return ''
    out = text
    for pattern, repl in _MARKDOWN_PATTERNS:
        out = re.sub(pattern, repl, out)
    return out


def plain_paragraph(text: Optional[str], limit: int = 900) -> Optional[str]:
    """Model prose reduced to one plain paragraph, or None if nothing is left."""
    if not isinstance(text, str):
        return None
    cleaned = ' '.join(strip_markdown(text).strip().split())
    if not cleaned:
        return None
    return cleaned[:limit].rstrip()


def contains_storage_url(value: Any) -> bool:
    """True if a string (or any string inside a structure) points at our storage.

    The assertion behind the first rule in this module's docstring, available to
    tests and to a belt-and-braces check before a prompt is sent.
    """
    from utils.storage_urls import parse_object_ref

    if isinstance(value, str):
        return parse_object_ref(value) is not None
    if isinstance(value, dict):
        return any(contains_storage_url(v) for v in value.values())
    if isinstance(value, (list, tuple)):
        return any(contains_storage_url(v) for v in value)
    return False


def contains_private_storage_url(value: Any) -> bool:
    """True if a string (or any string inside a structure) points at a PRIVATE bucket.

    The narrower check, for content that legitimately carries URLs: a published
    story's body holds public `story-assets` copies and the external links a
    student submitted, and neither is a leak. A `quest-evidence` pointer is.
    """
    from utils.storage_urls import is_private_bucket, parse_object_ref

    if isinstance(value, str):
        ref = parse_object_ref(value)
        return ref is not None and is_private_bucket(ref[0])
    if isinstance(value, dict):
        return any(contains_private_storage_url(v) for v in value.values())
    if isinstance(value, (list, tuple)):
        return any(contains_private_storage_url(v) for v in value)
    return False


__all__ = [
    'DEFAULT_TEXT_LIMIT',
    'block_items',
    'contains_private_storage_url',
    'contains_storage_url',
    'describable_ref',
    'describe_item',
    'plain_paragraph',
    'strip_markdown',
    'summarize_block_content',
    'truncate',
]
