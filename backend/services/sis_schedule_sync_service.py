"""
SIS Schedule Sync — the org's Google Sheet master schedule as source of truth.

The school keeps its master schedule in a Google Sheet laid out as a grid:
columns are teachers, row groups are DAY -> "Block N - Class Title / Ages /
Room" triplets. "Sync from Sheet" fetches the sheet's CSV export, parses that
grid deterministically, diffs it against the org's classes, and PROPOSES
operations in the exact vocabulary of sis_schedule_ai_service
(create_class / update_class / set_meetings / archive_class). Nothing is
written here — staff review the diff and apply through the existing
/api/sis/schedule-ai/apply endpoint (which also provides undo).

Design rules:
  - Fetch + parse + diff are deterministic. A cell can never be hallucinated
    or dropped, and re-running a sync after applying yields an empty diff.
  - AI (Gemini) is used ONLY to pair leftover unmatched sheet classes with
    leftover unmatched Optio classes (typo/rename detection). Its pairings are
    labeled in the diff and, like everything else, only applied after review.
  - Archive proposals (class in Optio but not in the sheet) are emitted with
    default_selected=False — the reviewer must opt in.
  - The sheet only carries name/teacher/ages/room/meetings; all other class
    fields (price, capacity, description, ...) are never touched.
"""

import csv
import io
import re
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

from services.base_ai_service import BaseAIService
from utils.logger import get_logger

logger = get_logger(__name__)

DAY_TO_DOW = {'SUNDAY': 0, 'MONDAY': 1, 'TUESDAY': 2, 'WEDNESDAY': 3,
              'THURSDAY': 4, 'FRIDAY': 5, 'SATURDAY': 6}
BLOCK_ROW_RE = re.compile(r'^block\s*(\d+)\s*-\s*(class\s*title|ages|room)$', re.I)
DAY_ROW_RE = re.compile(r'^(sun|mon|tues|wednes|thurs|fri|satur)day$', re.I)
PLACEHOLDER_RE = re.compile(r'placeholder', re.I)
# Blocks labeled as breaks don't count when mapping "Block N" to times.
BREAK_LABEL_RE = re.compile(r'lunch|break|recess|transition', re.I)
SHEET_URL_RE = re.compile(
    r'^https://docs\.google\.com/spreadsheets/d/([a-zA-Z0-9_-]+)')


class SheetSyncError(Exception):
    """User-facing failure (bad URL, sheet not shared, unrecognizable layout)."""


# ── Fetch ─────────────────────────────────────────────────────────────────────

def csv_export_url(sheet_url: str) -> str:
    """Build the CSV export URL from a Google Sheets link.

    Only docs.google.com spreadsheet URLs are accepted, and the export URL is
    rebuilt from the extracted id (never fetched verbatim) so this can't be
    pointed at internal services.
    """
    m = SHEET_URL_RE.match((sheet_url or '').strip())
    if not m:
        raise SheetSyncError('That is not a Google Sheets link. Paste the '
                             'spreadsheet URL from your browser.')
    gid = re.search(r'[#?&]gid=(\d+)', sheet_url)
    url = f'https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv'
    return f'{url}&gid={gid.group(1)}' if gid else url


def fetch_sheet_csv(sheet_url: str) -> str:
    import httpx
    try:
        resp = httpx.get(csv_export_url(sheet_url), follow_redirects=True, timeout=20)
    except httpx.HTTPError as e:
        raise SheetSyncError(f'Could not reach Google Sheets: {e}') from e
    content_type = resp.headers.get('content-type', '')
    if resp.status_code != 200 or 'html' in content_type:
        raise SheetSyncError('Could not read the sheet. Make sure link sharing is on '
                             '("Anyone with the link can view").')
    return resp.text


# ── Parse ─────────────────────────────────────────────────────────────────────

def parse_ages(raw: str) -> Tuple[Optional[int], Optional[int]]:
    """'8-12' -> (8, 12); '14+' -> (14, None); 'all ages'/'' -> (None, None)."""
    s = (raw or '').strip().lower()
    if not s or 'all' in s:
        return None, None
    m = re.match(r'^(\d{1,2})\s*-\s*(\d{1,2})$', s)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.match(r'^(\d{1,2})\s*\+$', s)
    if m:
        return int(m.group(1)), None
    return None, None


def parse_master_grid(csv_text: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Parse the day/block/teacher grid into flat entries.

    Returns (entries, warnings). Each entry:
      {day_of_week, block, teacher, is_placeholder, title, ages_raw, room}
    """
    rows = list(csv.reader(io.StringIO(csv_text)))
    if not rows or len(rows[0]) < 2:
        raise SheetSyncError('The sheet is empty or not laid out as a schedule grid.')

    teachers = [(c or '').strip() for c in rows[0][1:]]
    warnings: List[str] = []
    entries: List[Dict[str, Any]] = []
    day: Optional[int] = None
    day_name = ''
    # cells[(block, col)] accumulates {title, ages_raw, room} per block group.
    cells: Dict[Tuple[int, int], Dict[str, str]] = {}
    pending_day_cells: List[Tuple[int, Dict[Tuple[int, int], Dict[str, str]]]] = []

    def flush_day():
        nonlocal cells
        if day is None:
            cells = {}
            return
        for (block, col), c in cells.items():
            title = (c.get('title') or '').strip()
            if not title:
                continue
            entries.append({
                'day_of_week': day, 'block': block,
                'teacher': teachers[col] if col < len(teachers) else '',
                'is_placeholder': bool(PLACEHOLDER_RE.search(teachers[col] if col < len(teachers) else '')),
                'title': title,
                'ages_raw': (c.get('ages') or '').strip(),
                'room': (c.get('room') or '').strip(),
            })
        cells = {}

    for row in rows[1:]:
        first = (row[0] or '').strip() if row else ''
        if DAY_ROW_RE.match(first):
            flush_day()
            day = DAY_TO_DOW.get(first.upper())
            day_name = first.title()
            continue
        m = BLOCK_ROW_RE.match(first)
        if not m:
            # Blank separators and anything unrecognized are skipped; only warn
            # for rows that LOOK like data (non-empty first cell).
            if first:
                warnings.append(f'Skipped unrecognized row "{first}".')
            continue
        if day is None:
            warnings.append(f'Skipped "{first}" — it appears before any day heading.')
            continue
        block = int(m.group(1))
        kind = re.sub(r'\s', '', m.group(2)).lower()  # classtitle | ages | room
        key = {'classtitle': 'title', 'ages': 'ages', 'room': 'room'}[kind]
        for col, val in enumerate(row[1:]):
            if (val or '').strip():
                cells.setdefault((block, col), {})[key] = val
    flush_day()

    if not entries:
        raise SheetSyncError('No classes found — expected day headings (e.g. TUESDAY) '
                             'with "Block N - Class Title / Ages / Room" rows.')
    return entries, warnings


# ── Desired state (group grid cells into classes) ─────────────────────────────

def _norm(s: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', (s or '').lower())).strip()


def teaching_blocks(time_blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The org's time blocks minus breaks — 'Block N' means the Nth of these."""
    return [b for b in (time_blocks or [])
            if b.get('start') and b.get('end') and not BREAK_LABEL_RE.search(b.get('label') or '')]


def build_desired_classes(entries: List[Dict[str, Any]],
                          time_blocks: List[Dict[str, Any]],
                          staff: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Group grid cells into desired classes with concrete meeting times.

    Identity rule (confirmed with the school): a class is (title, teacher,
    age range) — the same title+teacher at a different age range is a separate
    class. Room is NOT identity: the same class may meet in different rooms on
    different days (room lands on the meeting; the most common room becomes the
    class location).
    """
    warnings: List[str] = []
    blocks = teaching_blocks(time_blocks)
    if not blocks:
        raise SheetSyncError('No time blocks configured for this school — set them '
                             'on the Settings page first so "Block 1..N" map to times.')

    staff_by_norm: Dict[str, Dict[str, Any]] = {}
    for s in staff or []:
        staff_by_norm[_norm(s.get('name') or '')] = s

    def resolve_teacher(name: str) -> Optional[str]:
        key = _norm(name)
        if not key:
            return None
        if key in staff_by_norm:
            return staff_by_norm[key]['id']
        hits = [s for n, s in staff_by_norm.items() if n.startswith(key) or key in n.split()]
        if len(hits) == 1:
            return hits[0]['id']
        return None

    unmatched_teachers = set()
    bad_blocks = set()
    groups: Dict[Tuple, Dict[str, Any]] = {}

    for e in entries:
        min_age, max_age = parse_ages(e['ages_raw'])
        if e['ages_raw'] and (min_age, max_age) == (None, None) and 'all' not in e['ages_raw'].lower():
            warnings.append(f'"{e["title"]}": could not read ages "{e["ages_raw"]}" — leaving unset.')
        if e['block'] < 1 or e['block'] > len(blocks):
            bad_blocks.add(e['block'])
            continue
        block = blocks[e['block'] - 1]
        instructor_id = None
        if not e['is_placeholder'] and e['teacher']:
            instructor_id = resolve_teacher(e['teacher'])
            if not instructor_id:
                unmatched_teachers.add(e['teacher'])

        key = (_norm(e['title']), _norm(e['teacher']), min_age, max_age)
        g = groups.setdefault(key, {
            'name': e['title'], 'teacher': e['teacher'],
            'is_placeholder': e['is_placeholder'],
            'instructor_id': instructor_id,
            'min_age': min_age, 'max_age': max_age,
            'rooms': Counter(), 'meetings': [],
        })
        if e['room']:
            g['rooms'][e['room']] += 1
        g['meetings'].append({
            'day_of_week': e['day_of_week'],
            'start_time': f"{block['start']}:00",
            'end_time': f"{block['end']}:00",
            'room': e['room'] or None,
        })

    for b in sorted(bad_blocks):
        warnings.append(f'Sheet uses "Block {b}" but only {len(blocks)} teaching '
                        f'blocks are configured — those cells were skipped.')
    for t in sorted(unmatched_teachers):
        warnings.append(f'Teacher column "{t}" matches no staff member — their '
                        f'classes will be created/left unassigned.')

    desired = []
    for g in groups.values():
        location = g['rooms'].most_common(1)[0][0] if g['rooms'] else None
        meetings = []
        for m in sorted(g['meetings'], key=lambda x: (x['day_of_week'], x['start_time'])):
            meeting = {'day_of_week': m['day_of_week'],
                       'start_time': m['start_time'], 'end_time': m['end_time']}
            if m['room'] and m['room'] != location:
                meeting['location'] = m['room']
            meetings.append(meeting)
        desired.append({
            'name': g['name'], 'teacher': g['teacher'],
            'instructor_id': g['instructor_id'],
            'min_age': g['min_age'], 'max_age': g['max_age'],
            'location': location, 'meetings': meetings,
        })
    return desired, warnings


# ── Diff ──────────────────────────────────────────────────────────────────────

def _meeting_key(m: Dict[str, Any], default_location: Optional[str] = None) -> Tuple:
    """Comparable meeting identity. A meeting without its own location
    effectively happens at the class's location, so compare that — existing
    meetings often store the room explicitly while the sheet puts it on the
    class, and that must not read as a schedule change."""
    return (m.get('day_of_week'), str(m.get('start_time') or '')[:5],
            str(m.get('end_time') or '')[:5],
            (m.get('location') or default_location) or None)


# A trailing parenthetical naming days: "(Tuesday)", "(Tue/Thu)", "(Mon/Wed)".
# "(maker access)" or "(non-competition)" must NOT match.
DAY_SUFFIX_RE = re.compile(
    r'\s*\((?=[^)]*\b(?:mon|tue|wed|thu|fri|sat|sun))[^)]*\)\s*$', re.I)


def _day_stripped_norm(name: str) -> str:
    return _norm(DAY_SUFFIX_RE.sub('', name or ''))


def reconcile_leftovers(new_classes: List[Dict[str, Any]],
                        missing: List[Dict[str, Any]]) -> Tuple[
                            List[Tuple[Dict, Dict]], List[str],
                            List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Handle the per-day naming convention before anything drastic happens.

    Some schools keep "Choir (Tuesday)" and "Choir (Thursday)" as separate
    classes where the sheet has one "Choir" meeting twice. Turning that into
    create+archive would duplicate the class and strand enrollments. So among
    the unmatched leftovers, compare day-suffix-stripped names:
      - exactly 1 sheet class <-> 1 Optio class: treat as a rename pair.
      - anything N<->M: leave BOTH sides untouched and explain why — moving
        enrollments between classes is a manual decision, not a sync.
    Returns (pairs, warnings, remaining_new, remaining_missing).
    """
    d_groups: Dict[str, List[Dict]] = {}
    e_groups: Dict[str, List[Dict]] = {}
    for d in new_classes:
        d_groups.setdefault(_day_stripped_norm(d['name']), []).append(d)
    for e in missing:
        e_groups.setdefault(_day_stripped_norm(e.get('name') or ''), []).append(e)

    pairs, warnings = [], []
    remaining_new, remaining_missing = list(new_classes), list(missing)
    for key, ds in d_groups.items():
        es = e_groups.get(key) or []
        if not key or not es:
            continue
        if len(ds) == 1 and len(es) == 1:
            pairs.append((ds[0], es[0]))
            remaining_new.remove(ds[0])
            remaining_missing.remove(es[0])
        else:
            existing_names = ', '.join(f'"{e.get("name")}"' for e in es)
            warnings.append(
                f'Left "{ds[0]["name"]}" untouched: the sheet has {len(ds)} class(es) '
                f'under this name but Optio has {len(es)} ({existing_names}). '
                f'Moving student enrollments between them is a manual decision — '
                f'reconcile manually, then sync again.')
            for d in ds:
                remaining_new.remove(d)
            for e in es:
                remaining_missing.remove(e)
    return pairs, warnings, remaining_new, remaining_missing


def _match_and_reconcile(desired: List[Dict[str, Any]],
                         existing: List[Dict[str, Any]]) -> Tuple[
                             List[Tuple[Dict, Dict]], set, List[str],
                             List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Full deterministic matching: exact keys, then safety guards.

    Count guard: when the sheet and Optio hold DIFFERENT numbers of classes
    under the same (day-stripped) name — e.g. one "Reading Tutoring" in the
    sheet vs five in Optio — any exact 'match' between them is arbitrary and
    the unmatched siblings would become bogus archives. Suppress the whole
    name (no pairs, no creates, no archives) and say why.

    Returns (pairs, fuzzy_matched_ids, warnings, leftover_desired, leftover_existing).
    """
    pairs, d_left, e_left = _match(desired, existing)

    d_all = Counter(_day_stripped_norm(d['name']) for d in desired)
    e_all = Counter(_day_stripped_norm(e.get('name') or '') for e in existing)
    suppressed = {n for n, dc in d_all.items()
                  if n and e_all.get(n) and e_all[n] != dc}
    warnings = []
    if suppressed:
        rep = {}  # representative display name + counts per suppressed key
        for d in desired:
            rep.setdefault(_day_stripped_norm(d['name']), d['name'])
        for n in sorted(suppressed):
            warnings.append(
                f'Left "{rep.get(n, n)}" untouched: the sheet maps to {d_all[n]} '
                f'class(es) under this name but Optio has {e_all[n]}. Moving student '
                f'enrollments between them is a manual decision — reconcile manually, '
                f'then sync again.')
        pairs = [(d, e) for d, e in pairs if _day_stripped_norm(d['name']) not in suppressed]
        d_left = [d for d in d_left if _day_stripped_norm(d['name']) not in suppressed]
        e_left = [e for e in e_left
                  if _day_stripped_norm(e.get('name') or '') not in suppressed]

    name_pairs, w2, d_left, e_left = reconcile_leftovers(d_left, e_left)
    pairs += name_pairs
    return pairs, {e['id'] for _, e in name_pairs}, warnings + w2, d_left, e_left


def _match(desired: List[Dict[str, Any]],
           existing: List[Dict[str, Any]]) -> Tuple[List[Tuple[Dict, Dict]], List[Dict], List[Dict]]:
    """Pair desired classes with existing ones, most-specific key first."""
    pairs: List[Tuple[Dict, Dict]] = []
    d_left = list(desired)
    e_left = list(existing)

    def run(keyfn, require_unique):
        nonlocal d_left, e_left
        d_by, e_by = {}, {}
        for d in d_left:
            d_by.setdefault(keyfn(d, True), []).append(d)
        for e in e_left:
            e_by.setdefault(keyfn(e, False), []).append(e)
        for k, ds in d_by.items():
            es = e_by.get(k) or []
            if not k or not es:
                continue
            if require_unique and (len(ds) > 1 or len(es) > 1):
                continue
            for d, e in zip(ds, es):
                pairs.append((d, e))
                d_left.remove(d)
                e_left.remove(e)

    # K1: name + instructor + ages (handles same class at two age ranges)
    run(lambda c, is_d: (_norm(c['name']), c.get('instructor_id') or c.get('primary_instructor_id'),
                         c.get('min_age'), c.get('max_age')), False)
    # K2: name + instructor (unique on both sides)
    run(lambda c, is_d: (_norm(c['name']), c.get('instructor_id') or c.get('primary_instructor_id')), True)
    # K3: name only (unique on both sides)
    run(lambda c, is_d: (_norm(c['name']),), True)
    return pairs, d_left, e_left


def build_operations(desired: List[Dict[str, Any]],
                     existing: List[Dict[str, Any]],
                     existing_meetings: Dict[str, List[Dict[str, Any]]],
                     staff: List[Dict[str, Any]],
                     ai_pairs: Optional[List[Tuple[Dict, Dict]]] = None,
                     enrollment_counts: Optional[Dict[str, int]] = None) -> Dict[str, Any]:
    """Deterministic diff -> operations compatible with schedule-ai apply.

    Extra keys (`group`, `default_selected`, `detail`) annotate the review UI;
    apply_operations ignores them.
    """
    staff_names = {s['id']: s.get('name') for s in staff or []}
    pairs, fuzzy_matched_ids, warnings, new_classes, missing = _match_and_reconcile(desired, existing)
    for d, e in (ai_pairs or []):
        if d in new_classes and e in missing:
            pairs.append((d, e))
            new_classes.remove(d)
            missing.remove(e)
            fuzzy_matched_ids.add(e['id'])

    ops: List[Dict[str, Any]] = []

    for d in sorted(new_classes, key=lambda x: _norm(x['name'])):
        fields = {'name': d['name']}
        for k in ('location', 'min_age', 'max_age'):
            if d.get(k) is not None:
                fields[k] = d[k]
        if d.get('instructor_id'):
            fields['primary_instructor_id'] = d['instructor_id']
        days = len(d['meetings'])
        ops.append({'action': 'create_class', 'fields': fields, 'meetings': d['meetings'],
                    'group': 'create', 'default_selected': True,
                    'label': f'Create "{d["name"]}" ({d["teacher"] or "no teacher"}, '
                             f'{days} meeting{"s" if days != 1 else ""}/week)'})

    for d, e in sorted(pairs, key=lambda p: _norm(p[0]['name'])):
        detail = []
        fields = {}
        if d['name'] != e.get('name'):
            fields['name'] = d['name']
            detail.append(f'rename "{e.get("name")}" → "{d["name"]}"')
        for k in ('min_age', 'max_age', 'location'):
            if d.get(k) is not None and d.get(k) != e.get(k):
                fields[k] = d[k]
                detail.append(f'{k.replace("_", " ")}: {e.get(k) or "—"} → {d[k]}')
        if d.get('instructor_id') and d['instructor_id'] != e.get('primary_instructor_id'):
            fields['primary_instructor_id'] = d['instructor_id']
            detail.append(f'teacher: {staff_names.get(e.get("primary_instructor_id")) or "—"} '
                          f'→ {staff_names.get(d["instructor_id"])}')
        ai_note = ' (fuzzy match — confirm)' if e['id'] in fuzzy_matched_ids else ''
        if fields:
            ops.append({'action': 'update_class', 'class_id': e['id'], 'fields': fields,
                        'group': 'update', 'default_selected': True, 'detail': detail,
                        'label': f'Update "{e.get("name")}"{ai_note}'})

        current = {_meeting_key(m, e.get('location'))
                   for m in existing_meetings.get(e['id'], [])
                   if m.get('day_of_week') is not None}
        wanted = {_meeting_key(m, d.get('location')) for m in d['meetings']}
        if current != wanted:
            ops.append({'action': 'set_meetings', 'class_id': e['id'], 'meetings': d['meetings'],
                        'group': 'schedule', 'default_selected': True,
                        'detail': [f'{len(current)} meeting(s) → {len(wanted)} meeting(s)'],
                        'label': f'Reschedule "{d["name"]}"{ai_note}'})

    for e in sorted(missing, key=lambda x: _norm(x.get('name') or '')):
        teacher = staff_names.get(e.get('primary_instructor_id'))
        enrolled = (enrollment_counts or {}).get(e['id']) or 0
        enrolled_note = f', {enrolled} enrolled' if enrolled else ''
        ops.append({'action': 'archive_class', 'class_id': e['id'],
                    'group': 'archive', 'default_selected': False,
                    'label': f'Archive "{e.get("name")}"'
                             f'{f" ({teacher}{enrolled_note})" if teacher or enrolled else ""}'
                             f' — not in the sheet'})

    counts = Counter(op['group'] for op in ops)
    summary_bits = []
    for group, word in (('create', 'new'), ('update', 'changed'), ('schedule', 'rescheduled'),
                        ('archive', 'not in the sheet')):
        if counts.get(group):
            summary_bits.append(f'{counts[group]} {word}')
    return {'operations': ops, 'warnings': warnings,
            'summary': ('Sheet and Optio schedule already match.' if not ops
                        else 'Compared the sheet against Optio: ' + ', '.join(summary_bits) + '.')}


# ── AI assist: pair leftovers (typos / renames) ───────────────────────────────

class _SyncAI(BaseAIService):
    def match_leftovers(self, unmatched_desired: List[Dict[str, Any]],
                        unmatched_existing: List[Dict[str, Any]]) -> List[Tuple[int, int]]:
        import json
        prompt = f"""These class names come from a school's master schedule spreadsheet and from its
database. Lists A and B failed exact matching. Identify pairs that are clearly the
SAME class (typo, punctuation, abbreviation, or a deliberate rename). Only pair
items you are confident about; leave genuinely new/removed classes unpaired.

A (from the spreadsheet): {json.dumps([{'i': i, 'name': d['name'], 'teacher': d.get('teacher')}
                                       for i, d in enumerate(unmatched_desired)])}
B (in the database): {json.dumps([{'j': j, 'name': e.get('name')}
                                  for j, e in enumerate(unmatched_existing)])}

Respond with ONLY JSON: {{"pairs": [{{"i": 0, "j": 2}}]}} (empty list if none)."""
        raw = self.generate_json(prompt, generation_config_preset='structured_output',
                                 max_output_tokens=2048, strict=True)
        out = []
        for p in (raw or {}).get('pairs') or []:
            try:
                out.append((int(p['i']), int(p['j'])))
            except (KeyError, TypeError, ValueError):
                continue
        return out


def ai_match_leftovers(unmatched_desired, unmatched_existing):
    """Best-effort AI pairing; failures degrade to 'no matches'."""
    if not unmatched_desired or not unmatched_existing:
        return []
    try:
        idx_pairs = _SyncAI().match_leftovers(unmatched_desired, unmatched_existing)
        pairs, used_i, used_j = [], set(), set()
        for i, j in idx_pairs:
            if i in used_i or j in used_j:
                continue
            if 0 <= i < len(unmatched_desired) and 0 <= j < len(unmatched_existing):
                pairs.append((unmatched_desired[i], unmatched_existing[j]))
                used_i.add(i)
                used_j.add(j)
        return pairs
    except Exception as e:  # noqa: BLE001
        logger.warning(f'schedule sync: AI leftover matching failed (continuing without): {e}')
        return []


# ── Entry point ───────────────────────────────────────────────────────────────

def propose_sync(org_id: str, sheet_url: str) -> Dict[str, Any]:
    """Fetch the sheet, diff against the org's classes, return a reviewable plan."""
    from services.sis_schedule_ai_service import _org_snapshot, _conflict_warnings
    from repositories.sis_class_repository import SisClassRepository
    from database import get_supabase_admin_client

    csv_text = fetch_sheet_csv(sheet_url)
    entries, warnings = parse_master_grid(csv_text)

    snapshot = _org_snapshot(org_id)
    desired, w2 = build_desired_classes(entries, snapshot['time_blocks'], snapshot['staff'])
    warnings += w2

    repo = SisClassRepository(client=get_supabase_admin_client())
    existing = repo.list_for_org(org_id)
    class_ids = [c['id'] for c in existing]
    meetings = repo.meetings_for_classes(class_ids)
    by_class: Dict[str, List[Dict[str, Any]]] = {}
    for m in meetings:
        by_class.setdefault(m['class_id'], []).append(m)
    try:
        enrollment_counts = repo.enrollment_counts_for_classes(class_ids)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'schedule sync: enrollment counts unavailable: {e}')
        enrollment_counts = {}

    # AI pairing runs only on leftovers that survive exact matching AND the
    # name-count/per-day reconciliation guards (true typos/renames).
    _, _, _, d_left, e_left = _match_and_reconcile(desired, existing)
    ai_pairs = ai_match_leftovers(d_left, e_left)

    result = build_operations(desired, existing, by_class, snapshot['staff'],
                              ai_pairs, enrollment_counts)
    # Conflict check on the post-apply picture (teacher/room double-booking),
    # excluding unselected-by-default archive ops from the simulation.
    selected = [op for op in result['operations'] if op.get('default_selected', True)]
    warnings = warnings + result.pop('warnings', []) + _conflict_warnings(snapshot, selected)
    return {**result, 'warnings': warnings, 'class_count': len(desired),
            'entry_count': len(entries)}
