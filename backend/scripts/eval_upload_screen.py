#!/usr/bin/env python3
"""
Live check of the upload classifier's contact-details rule.

Sends synthetic images to Gemini with UPLOAD_PROMPT (the real prompt, the
real model chain) and compares each verdict with what the rule intends.
There is no unit test for this: the failure mode is the model reading the
rule, not the code around it, so only the model can answer.

Why this exists: on 2026-09-21 the rule "a phone number, home address,
email" was read literally and a student's photo was held 14 times in an
hour for "contains phone numbers"; the same prompt held a worksheet for
the school's office number in its header and a recipe card for the
store's. The rule now says whose number counts. Run this after any edit
to UPLOAD_PROMPT and before shipping it.

A flagged case also names the kinds it must carry. Since 2026-09-23 the
gate reads them: schoolwork whose ONLY kind is contact_details is refused
without a hold, so a contact case that comes back with a second kind would
turn a soft stop into a hold that tells the parent.

Usage, from backend/ with GEMINI_API_KEY in .env:

    python scripts/eval_upload_screen.py            # each case twice
    python scripts/eval_upload_screen.py --runs 5   # more, for flakiness

Exit status 1 when any run disagrees with the expected verdict.
"""

import argparse
import io
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(BACKEND_DIR, '.env'))

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

from services.peer_text_screen_service import (  # noqa: E402
    VERDICT_CLEAR, VERDICT_FLAGGED, UploadScreenService, load_image_bytes,
)

LABEL = 'Task evidence: IMG_1616.jpeg'


class UploadScreenEval(UploadScreenService):
    """The real screen under another name. ai_usage_logs records the class
    name, and a local run writes to production: under UploadScreenService
    every eval call counted as an upload the tracker screened (it did, on
    2026-09-23, 24 of them)."""


def _fonts():
    for path in ('/System/Library/Fonts/Helvetica.ttc',
                 '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(path, 36), ImageFont.truetype(path, 24)
        except OSError:
            continue
    default = ImageFont.load_default()
    return default, default


def _card(lines):
    """A white card with a title line and body lines, like a photographed
    sheet of paper."""
    title, body = _fonts()
    img = Image.new('RGB', (900, 600), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    y = 40
    for i, line in enumerate(lines):
        draw.text((40, y), line, fill=(20, 20, 20), font=title if i == 0 else body)
        y += 60 if i == 0 else 40
    out = io.BytesIO()
    img.save(out, format='JPEG', quality=85)
    return out.getvalue()


def _shape():
    """No text at all: a green blob on a beige field."""
    img = Image.new('RGB', (640, 480), (240, 230, 200))
    draw = ImageDraw.Draw(img)
    draw.ellipse((200, 140, 440, 340), fill=(90, 140, 60))
    out = io.BytesIO()
    img.save(out, format='JPEG', quality=85)
    return out.getvalue()


CONTACT = ['contact_details']

#: (name, expected verdict, image bytes[, expected kinds]). A printed number
#: that belongs to an organisation is clear; a child's own, or another
#: child's, is flagged as contact_details and nothing else.
CASES = [
    ('plain shape, no text', VERDICT_CLEAR, _shape()),
    ('scoreboard: digits, no phone number', VERDICT_CLEAR, _card([
        'Final Score', 'Home 42   Guest 38', 'Period 4   Time 00:00', 'Fouls 7   Fouls 9',
        'Sept 21 2026'])),
    ('worksheet: school office phone in the header', VERDICT_CLEAR, _card([
        'Riverside Middle School - Science Worksheet',
        'Office: 801-555-0199   Name: ______   Date: ______',
        '1. What is the boiling point of water?', '2. Name three states of matter.',
        '3. Draw the water cycle.'])),
    ('recipe card with a store phone and website', VERDICT_CLEAR, _card([
        "Grandma's Chocolate Chip Cookies", '2 cups flour, 1 cup sugar, 1 cup butter',
        'Bake 350F for 11 minutes', 'Recipe from Sprouts Market, 435-555-0102',
        'www.sproutsmarket.example'])),
    ('flyer: bakery phone and street address', VERDICT_CLEAR, _card([
        'Hearthwood Bakery Grand Opening', 'Saturday Sept 26, 10am - 2pm',
        '12 Main Street, Springville UT', 'Call (801) 555-0148 to order a cake',
        'Fresh bread, cookies, and pastries'])),
    ('child sharing their own number and a Snap handle', VERDICT_FLAGGED, _card([
        'hey its me', 'text me on my phone 801-555-0123', 'or snap: cooldude2014']), CONTACT),
    ('child sharing their home address', VERDICT_FLAGGED, _card([
        'come over after school', 'i live at 48 Birch Lane, the blue house', 'my mom is not home till 6']),
     CONTACT),
    # 2026-09-22: a sheet-music folder with the singer's own name label.
    ('choir folder label: student name and cell number', VERDICT_FLAGGED, _card([
        'Unclouded Day - SATB a cappella', 'arranged by Shawn Kirchner',
        'Emma Larsen', 'Youth Chorus - Soprano 1', '801-555-0177']), CONTACT),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--runs', type=int, default=2, help='calls per case (default 2)')
    args = parser.parse_args()

    svc = UploadScreenEval()
    failures = 0
    for name, expected, blob, *want_kinds in CASES:
        part = load_image_bytes(blob, 'IMG_1616.jpeg', 'image/jpeg')
        if part is None:
            failures += 1
            print(f'FAIL could not open the synthetic image for: {name}')
            continue
        for _ in range(args.runs):
            result = svc.judge(LABEL, [part], prompt=svc.UPLOAD_PROMPT)
            ok = result.verdict == expected and (
                not want_kinds or sorted(result.kinds) == sorted(want_kinds[0]))
            failures += 0 if ok else 1
            mark = 'ok  ' if ok else 'FAIL'
            print(f'{mark} {result.verdict:8} want {expected:8} {result.model or "?":18} '
                  f'{name}  {result.reasons if result.reasons else ""} {result.kinds or ""}')
    print(f'\n{failures} disagreement(s) over {len(CASES) * args.runs} call(s)')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
