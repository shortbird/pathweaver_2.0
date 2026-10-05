"""The picture on a Bloomy task: one card listing the skills a student mastered
in Bloomy on one day, with each skill's grade, area, tier and score.

Bloomy's API sends no images -- no screenshots, no work samples -- so a
Bloomy task would otherwise be the only text-only card in a portfolio of
photos and videos (owner, 2026-10-05: "any chance we could get an image?").
Optio draws this one from the same data as the task's text evidence; it
claims nothing the text does not.

No student name on the card: the portfolio around it already says whose it is,
and an image is the one piece of evidence that travels on its own once saved.
"""

import io
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image, ImageDraw, ImageFont

FONT_DIR = Path(__file__).resolve().parent.parent / 'assets' / 'fonts'
PURPLE = (109, 70, 155)        # optio-purple #6D469B
PINK = (239, 89, 123)          # optio-pink #EF597B
INK = (31, 31, 46)
MUTED = (107, 107, 128)
RULE = (229, 229, 236)
WHITE = (255, 255, 255)
PANEL = (248, 246, 251)

WIDTH = 1200
PAD = 64
HEADER_H = 220
MAX_ROWS = 12


def _font(weight: str, size: int) -> Any:
    name = 'Poppins-SemiBold.ttf' if weight == 'bold' else 'Poppins-Regular.ttf'
    try:
        return ImageFont.truetype(str(FONT_DIR / name), size)
    except OSError:
        return ImageFont.load_default(size=size)


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, width: int) -> List[str]:
    lines: List[str] = []
    line = ''
    for word in (text or '').split():
        trial = f'{line} {word}'.strip()
        if draw.textlength(trial, font=font) <= width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines[:3]


def meta_line(skill: Dict[str, Any]) -> str:
    """"Grade 2 · Number base ten · Proficient · 80%" -- whatever is known."""
    parts = []
    if skill.get('grade') is not None:
        parts.append('Kindergarten' if skill['grade'] == 0 else f"Grade {skill['grade']}")
    if skill.get('domain'):
        words = str(skill['domain']).replace('_', ' ')
        parts.append(words[0].upper() + words[1:])
    if skill.get('tier'):
        parts.append(str(skill['tier']).capitalize())
    if skill.get('score') is not None:
        parts.append(f"{skill['score']}%")
    return ' · '.join(parts)


def render_day_card(subject_label: str, day_label: str, skills: List[Dict[str, Any]],
                    year: Optional[int] = None) -> bytes:
    """PNG bytes. `skills` are {title, code, grade, domain, tier, score}."""
    title_font = _font('bold', 56)
    sub_font = _font('regular', 30)
    skill_font = _font('bold', 32)
    meta_font = _font('regular', 26)
    foot_font = _font('regular', 24)

    scratch = ImageDraw.Draw(Image.new('RGB', (10, 10)))
    text_w = WIDTH - 2 * PAD - 48
    rows = []
    for s in skills[:MAX_ROWS]:
        lines = _wrap(scratch, s.get('title') or s.get('code') or '', skill_font, text_w)
        rows.append((lines, meta_line(s)))
    more = max(len(skills) - MAX_ROWS, 0)
    row_heights = [len(lines) * 44 + (36 if meta else 0) + 52 for lines, meta in rows]
    height = HEADER_H + PAD + sum(row_heights) + (50 if more else 0) + 110

    img = Image.new('RGB', (WIDTH, height), WHITE)
    draw = ImageDraw.Draw(img)

    # Brand gradient header, purple to pink, left to right.
    for x in range(WIDTH):
        t = x / (WIDTH - 1)
        color = tuple(int(PURPLE[i] + (PINK[i] - PURPLE[i]) * t) for i in range(3))
        draw.line([(x, 0), (x, HEADER_H)], fill=color)
    n = len(skills)
    draw.text((PAD, 52), f'Bloomy {subject_label}', font=title_font, fill=WHITE)
    when = f'{day_label}, {year}' if year else day_label
    draw.text((PAD, 132), f"{n} skill{'' if n == 1 else 's'} mastered · {when}",
              font=sub_font, fill=WHITE)

    y = HEADER_H + PAD // 2
    for (lines, meta), h in zip(rows, row_heights, strict=True):
        draw.rounded_rectangle([PAD, y, WIDTH - PAD, y + h - 16], radius=18, fill=PANEL)
        ty = y + 14
        for line in lines:
            draw.text((PAD + 24, ty), line, font=skill_font, fill=INK)
            ty += 44
        if meta:
            draw.text((PAD + 24, ty), meta, font=meta_font, fill=MUTED)
        y += h
    if more:
        draw.text((PAD, y), f'and {more} more', font=meta_font, fill=MUTED)
        y += 50

    draw.line([(PAD, height - 84), (WIDTH - PAD, height - 84)], fill=RULE, width=2)
    draw.text((PAD, height - 66), 'Mastered in Bloomy (bloomylearning.com). Recorded by Optio.',
              font=foot_font, fill=MUTED)

    out = io.BytesIO()
    img.save(out, format='PNG', optimize=True)
    return out.getvalue()
