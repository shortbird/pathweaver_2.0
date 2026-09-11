"""What an anonymized story may say about a student, and the scrubber that keeps it so.

Pure: no database, no model, no Flask. Everything here is decided from values
the caller already holds, so every rule has a unit test and none of them can
quietly depend on a row that was not read.

The label is generic on purpose. `poe._short_name` (first name plus last
initial) is not used: a last initial next to a small school's name identifies a
child. The grade band is the only age information the anonymized tier gives,
and `grade_band_from_dob` never guesses -- no date of birth means no band, not
"probably high school".

The scrubber over-scrubs by design. A story that says "[name]" where a reviewer
wrote a first name is slightly worse prose; a story that keeps the name is a
published child. Whole words only, so "Al" does not eat "Also".
"""

from __future__ import annotations

import io
import re
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

#: Story columns that never reach the public endpoint, whatever the projection
#: is asked for. The public test asserts none of these appear as keys.
NEVER_PUBLISHED = (
    'student_user_id', 'consent_id', 'source_id', 'source_ref', 'ai_draft',
    'safety', 'blockers', 'created_by', 'recorded_by', 'updated_by',
    'claim_token', 'error', 'attempts', 'started_at', 'mode', 'hero_asset_id',
    'granted_by_user_id', 'recorded_by_user_id',
)

GRADE_BANDS = ('elementary', 'middle', 'high')

ANONYMIZED_LABELS = {
    'elementary': 'An elementary student',
    'middle': 'A middle schooler',
    'high': 'A high school student',
    None: 'A student',
}

#: Grade levels as academy_enrollments records them (K, 1..12).
_ELEMENTARY_GRADES = ('k', 'kindergarten', '1', '2', '3', '4', '5')
_MIDDLE_GRADES = ('6', '7', '8')
_HIGH_GRADES = ('9', '10', '11', '12')


# ── age and grade ────────────────────────────────────────────────────────────

def _parse_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value).split('T')[0], '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return None


def age_at(dob: Any, at: Any = None) -> Optional[int]:
    """Whole years old on `at` (default today). None if the date is unknown."""
    born = _parse_date(dob)
    if born is None:
        return None
    when = _parse_date(at) or date.today()
    years = when.year - born.year - ((when.month, when.day) < (born.month, born.day))
    return years if years >= 0 else None


def grade_band_from_dob(dob: Any, at: Any = None) -> Optional[str]:
    """elementary under 11, middle 11-13, high 14-18, else None. Never guesses."""
    years = age_at(dob, at)
    if years is None:
        return None
    if years < 11:
        return 'elementary'
    if years <= 13:
        return 'middle'
    if years <= 18:
        return 'high'
    return None


def grade_band_from_grade_level(grade_level: Any) -> Optional[str]:
    """K-5 elementary, 6-8 middle, 9-12 high. Anything else is unknown."""
    if grade_level is None:
        return None
    text = str(grade_level).strip().lower()
    text = re.sub(r'^(grade|gr\.?)\s*', '', text)
    text = text.rstrip('.').replace('th', '').replace('st', '').replace('nd', '').replace('rd', '')
    text = text.strip()
    if text in _ELEMENTARY_GRADES:
        return 'elementary'
    if text in _MIDDLE_GRADES:
        return 'middle'
    if text in _HIGH_GRADES:
        return 'high'
    return None


def grade_band(dob: Any, grade_level: Any = None, at: Any = None) -> Optional[str]:
    """The date of birth first, the enrolment grade as the fallback."""
    return grade_band_from_dob(dob, at) or grade_band_from_grade_level(grade_level)


# ── the label ────────────────────────────────────────────────────────────────

def student_label(tier: str, scope: Optional[Dict[str, Any]], first_name: Optional[str],
                  grade_band_value: Optional[str], age: Optional[int] = None) -> str:
    """What the story calls the student.

    Anonymized: a generic label by grade band, nothing else. Named: the first
    name when the consent covers it, the age only when it covers that too.
    A named-tier consent that covers neither falls back to the generic label.
    """
    scope = scope or {}
    if tier == 'named' and scope.get('first_name') and (first_name or '').strip():
        name = first_name.strip()
        if scope.get('age') and isinstance(age, int) and age > 0:
            return f'{name}, {age}'
        return name
    band = grade_band_value if grade_band_value in GRADE_BANDS else None
    return ANONYMIZED_LABELS[band]


def is_generic_label(label: Optional[str]) -> bool:
    return (label or '').strip() in set(ANONYMIZED_LABELS.values())


# ── the scrubber ─────────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
# A phone number: ten digits with the usual separators, a country code only
# behind a '+'. Bounded on both sides by "not a digit and not a hyphen": a uuid
# is hyphen-delimited groups of hex, and one whose last group happens to be all
# digits must not come out as [phone] -- that group is an asset id the publish
# step has to look up. A year or an XP figure is 3-4 digits and never matches.
_PHONE_RE = re.compile(
    r'(?<![\d-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?![\d-])')
_HANDLE_RE = re.compile(r'(?<![A-Za-z0-9])@[A-Za-z0-9_.]{2,}')
_URL_RE = re.compile(r'https?://[^\s<>"\')\]]+')

#: Tokens of a person's name too short or too common to match on their own.
_NAME_STOPWORDS = {'the', 'and', 'of', 'de', 'la', 'le', 'van', 'von', 'da', 'del',
                   'jr', 'sr', 'ii', 'iii', 'mr', 'mrs', 'ms', 'dr', 'miss'}


def _name_tokens(names: Iterable[Optional[str]]) -> List[str]:
    tokens: List[str] = []
    for name in names or []:
        if not name:
            continue
        for token in re.split(r'[\s,\-]+', str(name)):
            cleaned = re.sub(r"[^\w']", '', token).strip("'")
            if len(cleaned) < 2 or cleaned.lower() in _NAME_STOPWORDS:
                continue
            tokens.append(cleaned)
    # Longest first, so "Annabelle" is replaced before "Anna" gets a chance.
    return sorted(set(tokens), key=len, reverse=True)


def _name_pattern(tokens: Sequence[str]) -> Optional[re.Pattern]:
    if not tokens:
        return None
    # Case-sensitive for capitalised and upper-case forms of each token. A
    # first name that is also an ordinary word (Will, May, Rose, Hope) would
    # otherwise take every lower-case "will" with it. The possessive is part of
    # the match so "Anna's" does not leave "'s" behind.
    forms: List[str] = []
    for token in tokens:
        escaped = re.escape(token)
        forms.append(escaped)
        forms.append(re.escape(token.capitalize()))
        forms.append(re.escape(token.upper()))
    alternation = '|'.join(dict.fromkeys(forms))
    return re.compile(rf"\b(?:{alternation})(?:['’]s)?\b")


def _org_pattern(names: Sequence[str]) -> Optional[re.Pattern]:
    cleaned = [re.escape(str(n).strip()) for n in names if n and str(n).strip()]
    if not cleaned:
        return None
    cleaned.sort(key=len, reverse=True)
    return re.compile(r'\b(?:' + '|'.join(cleaned) + r")(?:['’]s)?\b", re.IGNORECASE)


class Scrubber:
    """Removes the names, contacts and storage links that identify a student.

    ``names`` are person names (the student, every linked parent); each token
    of each name is scrubbed as a whole word. ``org_names`` are matched as
    whole phrases, case-insensitively. Emails, phone numbers, @handles and any
    URL that resolves to one of our storage buckets are always scrubbed.
    """

    #: Dict keys that hold identifiers, never prose. Skipped by the structure
    #: walkers so an id can never be rewritten into a placeholder.
    SKIP_KEYS = frozenset({'id', 'asset_id', 'story_id', 'block_id', 'source_block_id',
                           'hero_asset_id', 'consent_id', 'source_id', 'student_user_id'})

    NAME_TOKEN = '[name]'
    ORG_TOKEN = '[school]'
    EMAIL_TOKEN = '[email]'
    PHONE_TOKEN = '[phone]'
    HANDLE_TOKEN = '[handle]'
    LINK_TOKEN = '[link]'

    def __init__(self, names: Iterable[Optional[str]] = (),
                 org_names: Iterable[Optional[str]] = ()):
        self.tokens = _name_tokens(names)
        self.org_names = [str(n) for n in (org_names or []) if n]
        self._name_re = _name_pattern(self.tokens)
        self._org_re = _org_pattern(self.org_names)

    # -- storage links ---------------------------------------------------------

    @staticmethod
    def _is_storage_link(url: str) -> bool:
        from utils.storage_urls import parse_object_ref
        return parse_object_ref(url) is not None

    # -- the two operations ----------------------------------------------------

    def find_leaks(self, text: Any) -> List[str]:
        """Everything in `text` the scrubber would remove. Empty means clean."""
        if not isinstance(text, str) or not text:
            return []
        hits: List[str] = []
        if self._name_re:
            hits.extend(self._name_re.findall(text))
        if self._org_re:
            hits.extend(self._org_re.findall(text))
        hits.extend(_EMAIL_RE.findall(text))
        hits.extend(_PHONE_RE.findall(text))
        hits.extend(_HANDLE_RE.findall(text))
        hits.extend(u for u in _URL_RE.findall(text) if self._is_storage_link(u))
        return [h for h in hits if h]

    def scrub(self, text: Any) -> Any:
        """`text` with every leak replaced by a bracketed placeholder."""
        if not isinstance(text, str) or not text:
            return text
        out = _EMAIL_RE.sub(self.EMAIL_TOKEN, text)
        out = _URL_RE.sub(lambda m: self.LINK_TOKEN if self._is_storage_link(m.group(0))
                          else m.group(0), out)
        out = _HANDLE_RE.sub(self.HANDLE_TOKEN, out)
        out = _PHONE_RE.sub(self.PHONE_TOKEN, out)
        if self._org_re:
            out = self._org_re.sub(self.ORG_TOKEN, out)
        if self._name_re:
            out = self._name_re.sub(self.NAME_TOKEN, out)
        return out

    def scrub_structure(self, value: Any) -> Any:
        """`scrub` applied to every string inside a dict or list, recursively."""
        if isinstance(value, str):
            return self.scrub(value)
        if isinstance(value, dict):
            return {k: (v if k in self.SKIP_KEYS else self.scrub_structure(v))
                    for k, v in value.items()}
        if isinstance(value, list):
            return [self.scrub_structure(v) for v in value]
        if isinstance(value, tuple):
            return tuple(self.scrub_structure(v) for v in value)
        return value

    def find_leaks_in(self, value: Any) -> List[str]:
        """`find_leaks` over every string inside a structure."""
        if isinstance(value, str):
            return self.find_leaks(value)
        if isinstance(value, dict):
            return [h for k, v in value.items() if k not in self.SKIP_KEYS
                    for h in self.find_leaks_in(v)]
        if isinstance(value, (list, tuple)):
            return [h for v in value for h in self.find_leaks_in(v)]
        return []


# ── images ───────────────────────────────────────────────────────────────────

PUBLIC_IMAGE_MAX_PX = 1600
PUBLIC_IMAGE_QUALITY = 85


def prepare_public_image(blob: bytes) -> Tuple[bytes, int, int]:
    """A copy of `blob` fit to publish: rotated upright, metadata gone, JPEG.

    EXIF is the reason this exists. A phone photo carries the GPS position it
    was taken at, the device, sometimes the owner's name; `Image.save` on a
    fresh image writes none of it. Returns (bytes, width, height).

    Raises ValueError when the bytes are not an image the pipeline can read.
    """
    from PIL import Image, ImageOps

    from services.credit_ai_review.evidence_loader import sniff_mime

    mime = sniff_mime(blob or b'')
    if not mime.startswith('image/'):
        raise ValueError(f'not an image ({mime})')

    if mime in ('image/heic', 'image/heif'):
        # The iPhone default. Pillow cannot open it without the HEIF plugin,
        # which image_utils wraps; an unconvertible file fails at Image.open
        # below with a real error rather than a silent skip.
        from utils.image_utils import convert_heif_if_needed
        blob, _, _ = convert_heif_if_needed(blob, 'image.heic', mime)

    opened = Image.open(io.BytesIO(blob))
    img = ImageOps.exif_transpose(opened) or opened
    if img.mode != 'RGB':
        img = img.convert('RGB')
    img.thumbnail((PUBLIC_IMAGE_MAX_PX, PUBLIC_IMAGE_MAX_PX))
    # Copy the pixels into a new image so no `info` dict (EXIF, ICC, XMP)
    # travels with them; save() writes what is on the image it is given.
    clean = Image.new('RGB', img.size)
    clean.putdata(list(img.getdata()))
    out = io.BytesIO()
    clean.save(out, format='JPEG', quality=PUBLIC_IMAGE_QUALITY, optimize=True)
    return out.getvalue(), clean.width, clean.height
