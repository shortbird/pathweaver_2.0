"""Formatted message bodies — announcements written with the editor.

iCreate, 2026-08-01: "A rich text editor would be nice on the announcements and
on the messages."

The editor is the easy half. The hard half is that a message body stops being
plain text everywhere it is *consumed*: the family-facing page renders it, the
notification preview truncates it, the email fan-out wraps it, and each of those
gets it wrong in a different way — a parent reading `<p>Early dismissal</p>` in
their inbox is the failure this module exists to prevent.

So there are exactly two operations, and every consumer uses one of them:

- `sanitize()` for anything that will be rendered as HTML. An allow-list, run on
  the way IN, so nothing dangerous is ever stored. Deliberately narrow: the tags
  the editor can produce, and nothing that carries script, style, or a src.
- `to_text()` for anything that will be read as text — previews, truncation,
  the plain-text half of an email, search. Block boundaries become newlines so
  a list doesn't collapse into one run-on line.

Bodies written before the editor existed are plain text and stay that way:
`is_html()` tells them apart, and `to_text()` passes plain text through
unchanged.
"""

import html as html_lib
import re
from typing import Optional

from utils.logger import get_logger

logger = get_logger(__name__)

# What the editor can produce, plus <a> so a pasted link survives. No <img>,
# <span style>, <table>, or anything with a URL other than a link href — an
# announcement is a paragraph of school news, not a web page.
ALLOWED_TAGS = [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del',
    'h1', 'h2', 'h3', 'h4',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'a',
]
ALLOWED_ATTRS = {'a': ['href', 'title']}
ALLOWED_PROTOCOLS = ['http', 'https', 'mailto', 'tel']

# Tags whose end means a line ended.
_BLOCK_TAGS = ('p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
               'blockquote', 'pre', 'tr', 'br', 'hr')
_BLOCK_RE = re.compile(r'</?(?:%s)\b[^>]*>' % '|'.join(_BLOCK_TAGS), re.I)
_TAG_RE = re.compile(r'<[^>]+>')
_HTML_RE = re.compile(r'<(?:[a-z][a-z0-9]*)\b[^>]*>', re.I)
_SCRIPTISH_RE = re.compile(
    r'<(script|style|iframe|object|embed)\b[^>]*>.*?</\1\s*>|<(?:script|style|iframe|object|embed)\b[^>]*/?>',
    re.I | re.S,
)


def is_html(text: Optional[str]) -> bool:
    """True when this body was written with the editor rather than typed plain."""
    return bool(text) and bool(_HTML_RE.search(text))


def sanitize(text: Optional[str]) -> str:
    """An editor body, safe to render. Plain text is returned untouched.

    Runs on the way in so nothing unsafe is ever stored — a renderer that
    forgets to sanitize is then a formatting bug, not a hole.
    """
    if not text:
        return text or ''
    if not is_html(text):
        return text
    # bleach strips the tag but keeps what was between it, which would turn a
    # script body into visible text ("alert(1)") on the page. These elements
    # have no readable content worth keeping, so they go whole.
    text = _SCRIPTISH_RE.sub('', text)
    try:
        import bleach
    except ImportError:  # pragma: no cover - bleach is a hard requirement
        logger.error('rich_text.sanitize: bleach unavailable, storing as plain text')
        return to_text(text)
    return bleach.clean(text, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS,
                        protocols=ALLOWED_PROTOCOLS, strip=True)


def to_text(text: Optional[str]) -> str:
    """The readable text of a body, for previews, truncation and plain-text email.

    Block boundaries become newlines, so a bulleted list reads as lines rather
    than one run-on sentence. Plain text passes through unchanged.
    """
    if not text:
        return ''
    if not is_html(text):
        return text
    with_breaks = _BLOCK_RE.sub('\n', text)
    stripped = _TAG_RE.sub('', with_breaks)
    unescaped = html_lib.unescape(stripped)
    # Collapse the runs of blank lines that block tags leave behind, and the
    # spaces the editor puts around them, without flattening real paragraphs.
    lines = [ln.strip() for ln in unescaped.split('\n')]
    return '\n'.join([ln for ln in lines if ln])


def preview(text: Optional[str], limit: int = 200) -> str:
    """A one-glance summary for a notification: text only, truncated."""
    flat = ' '.join(to_text(text).split())
    return (flat[:limit] + '…') if len(flat) > limit else flat
