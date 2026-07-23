"""
SIS Schedule AI — staff edit the class schedule with plain-English prompts.

Two-phase, human-in-the-loop:
  propose(org_id, prompt) -> Gemini turns the prompt + current schedule into a
      list of structured operations, which are validated/annotated here. The AI
      NEVER writes to the database.
  apply(org_id, operations, user_id) -> executes staff-confirmed operations
      through SisClassRepository (same write paths as the manual editors).

Operations:
  {action: 'create_class', name, description?, location?, capacity?, min_age?,
   max_age?, price_cents?, instructor_name?, meetings: [{day_of_week, start_time, end_time}]}
  {action: 'update_class', class_id, fields: {name?, description?, location?,
   capacity?, min_age?, max_age?, price_cents?, instructor_name?}}
  {action: 'set_meetings', class_id, meetings: [...]}   # replaces the schedule
  {action: 'archive_class', class_id}
"""

import re
from typing import Any, Dict, List, Optional, Tuple

from services.base_ai_service import BaseAIService
from services.sis_eligibility import meetings_overlap
from services import sis_service
from repositories.sis_class_repository import SisClassRepository
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

ALLOWED_FIELDS = ('name', 'description', 'location', 'capacity', 'min_age',
                  'max_age', 'price_cents', 'supply_fee', 'instructor_name')
INT_FIELDS = ('capacity', 'min_age', 'max_age', 'price_cents')
# Dollar amounts (numeric), NOT cents — supply_fee is stored as e.g. 35.00.
FLOAT_FIELDS = ('supply_fee',)


def _repo():
    return SisClassRepository(client=get_supabase_admin_client())


def _org_snapshot(org_id: str) -> Dict[str, Any]:
    """Current classes (with meetings), staff, and time blocks for the prompt."""
    repo = _repo()
    classes = repo.list_for_org(org_id)
    meetings = repo.meetings_for_classes([c['id'] for c in classes])
    by_class: Dict[str, List[Dict[str, Any]]] = {}
    for m in meetings:
        by_class.setdefault(m['class_id'], []).append(m)
    staff = sis_service.list_org_staff(org_id) or []
    org = (get_supabase_admin_client().table('organizations')
           .select('feature_flags').eq('id', org_id).single().execute()).data or {}
    blocks = ((org.get('feature_flags') or {}).get('sis_settings') or {}).get('time_blocks') or []
    staff_by_id = {s['id']: s.get('name') for s in staff}
    return {
        'classes': [{
            'id': c['id'], 'name': c.get('name'), 'location': c.get('location'),
            'capacity': c.get('capacity'), 'min_age': c.get('min_age'), 'max_age': c.get('max_age'),
            'price_cents': c.get('price_cents'),
            'supply_fee': (float(c['supply_fee']) if c.get('supply_fee') is not None else None),
            'description': c.get('description'),
            'instructor': staff_by_id.get(c.get('primary_instructor_id')),
            'meetings': [{'day_of_week': m.get('day_of_week'),
                          'start_time': str(m.get('start_time') or '')[:5],
                          'end_time': str(m.get('end_time') or '')[:5]}
                         for m in by_class.get(c['id'], [])],
        } for c in classes],
        'staff': [{'id': s['id'], 'name': s.get('name')} for s in staff],
        'time_blocks': blocks,
    }


class SisScheduleAIService(BaseAIService):
    def propose(self, org_id: str, prompt: str) -> Dict[str, Any]:
        snapshot = _org_snapshot(org_id)
        import json
        ai_prompt = f"""You are a school schedule editor. A staff member describes a change to the
class schedule in plain English; you translate it into structured operations.

CURRENT SCHEDULE (JSON):
{json.dumps(snapshot['classes'], indent=1)}

STAFF (teachers): {json.dumps([s['name'] for s in snapshot['staff']])}
SCHOOL TIME BLOCKS: {json.dumps(snapshot['time_blocks'])}

Conventions:
- day_of_week: 0=Sunday, 1=Monday ... 6=Saturday. School days are Mon-Fri.
- Times are 24-hour "HH:MM". If the staff member says "1-2" style times during a
  school day, interpret as afternoon (13:00-14:00) unless clearly morning.
- If a time matches a school time block, snap exactly to that block.
- "set_meetings" REPLACES the class's whole weekly schedule, so include every
  meeting the class should keep, not just the changed one.
- price_cents is the TUITION in US cents (e.g. $75 -> 7500).
- supply_fee is a SEPARATE supply/materials fee in US DOLLARS, not cents
  (e.g. "$35 supply fee" -> 35). Do not confuse it with tuition/price_cents.
- To change a class's text, put it in update_class fields as "description".
- A request that names several classes (e.g. "all 4 Open Art Studio classes")
  must emit one update_class operation PER matching class_id from CURRENT SCHEDULE.
- Never invent classes to archive or update; use exact class_id values from the
  CURRENT SCHEDULE. Use instructor names exactly as listed in STAFF.
- If the request is ambiguous or impossible, return an empty operations list and
  explain in "summary".

STAFF REQUEST: {prompt}

Respond with ONLY this JSON:
{{
  "summary": "one or two sentences describing what you will change",
  "operations": [
    {{"action": "create_class", "name": "...", "description": "...", "location": "...",
      "capacity": 12, "min_age": 8, "max_age": 12, "price_cents": 7500,
      "instructor_name": "...", "meetings": [{{"day_of_week": 1, "start_time": "09:30", "end_time": "10:30"}}]}},
    {{"action": "update_class", "class_id": "...", "fields": {{"location": "Room 3", "supply_fee": 35, "description": "New class description"}}}},
    {{"action": "set_meetings", "class_id": "...", "meetings": [{{"day_of_week": 2, "start_time": "13:00", "end_time": "14:00"}}]}},
    {{"action": "archive_class", "class_id": "..."}}
  ]
}}
Include only the operations needed. Omit fields you are not changing."""

        # Bulk edits ("move every morning class 30 min later") can emit an
        # operation per class — size the output for a few hundred operations.
        raw = self.generate_json(ai_prompt, generation_config_preset='structured_output',
                                 max_output_tokens=16384, strict=True)
        summary = str(raw.get('summary') or '').strip()
        ops, errors = _validate_operations(org_id, raw.get('operations') or [], snapshot)
        warnings = _conflict_warnings(snapshot, ops) + errors
        return {'summary': summary, 'operations': ops, 'warnings': warnings}


def _validate_operations(org_id: str, raw_ops: List[Dict[str, Any]],
                         snapshot: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Whitelist, type-check, and annotate operations; bad ones become errors."""
    classes_by_id = {c['id']: c for c in snapshot['classes']}
    staff_by_name = {(s.get('name') or '').strip().lower(): s['id'] for s in snapshot['staff']}
    ops: List[Dict[str, Any]] = []
    errors: List[str] = []

    def resolve_instructor(name) -> Optional[str]:
        key = str(name or '').strip().lower()
        if not key:
            return None
        if key in staff_by_name:
            return staff_by_name[key]
        partial = [sid for n, sid in staff_by_name.items() if key in n or n in key]
        return partial[0] if len(partial) == 1 else None

    def norm_time(v) -> str:
        m = re.match(r'^(\d{1,2}):(\d{2})', str(v or '').strip())
        return f'{int(m.group(1)):02d}:{m.group(2)}' if m else ''

    def clean_meetings(raw) -> Optional[List[Dict[str, Any]]]:
        out = []
        for m in raw or []:
            try:
                day = int(m.get('day_of_week'))
            except (TypeError, ValueError):
                return None
            start = norm_time(m.get('start_time'))
            end = norm_time(m.get('end_time'))
            if day < 0 or day > 6 or not start or not end or end <= start:
                return None
            out.append({'day_of_week': day, 'start_time': f'{start}:00', 'end_time': f'{end}:00'})
        return out

    for i, op in enumerate(raw_ops):
        action = op.get('action')
        if action == 'create_class':
            name = str(op.get('name') or '').strip()
            if not name:
                errors.append(f'Operation {i + 1}: create_class needs a name — skipped.')
                continue
            meetings = clean_meetings(op.get('meetings'))
            if meetings is None:
                errors.append(f'Operation {i + 1} ({name}): invalid meeting times — skipped.')
                continue
            fields = {'name': name}
            for k in ('description', 'location'):
                if op.get(k):
                    fields[k] = str(op[k]).strip()
            for k in INT_FIELDS:
                if op.get(k) is not None:
                    try:
                        fields[k] = int(op[k])
                    except (TypeError, ValueError):
                        pass
            for k in FLOAT_FIELDS:
                if op.get(k) is not None:
                    try:
                        fields[k] = round(float(op[k]), 2)
                    except (TypeError, ValueError):
                        pass
            instructor_id = resolve_instructor(op.get('instructor_name'))
            if instructor_id:
                fields['primary_instructor_id'] = instructor_id
            elif op.get('instructor_name'):
                errors.append(f"Operation {i + 1} ({name}): couldn't match teacher "
                              f"\"{op['instructor_name']}\" — leaving unassigned.")
            ops.append({'action': 'create_class', 'fields': fields, 'meetings': meetings,
                        'label': f'Create class "{name}"'})

        elif action in ('update_class', 'set_meetings', 'archive_class'):
            class_id = op.get('class_id')
            klass = classes_by_id.get(class_id)
            if not klass:
                errors.append(f'Operation {i + 1}: unknown class — skipped.')
                continue
            if action == 'archive_class':
                ops.append({'action': 'archive_class', 'class_id': class_id,
                            'label': f'Archive "{klass["name"]}"'})
            elif action == 'set_meetings':
                meetings = clean_meetings(op.get('meetings'))
                if meetings is None:
                    errors.append(f'Operation {i + 1} ({klass["name"]}): invalid meeting times — skipped.')
                    continue
                ops.append({'action': 'set_meetings', 'class_id': class_id, 'meetings': meetings,
                            'label': f'Reschedule "{klass["name"]}"'})
            else:
                raw_fields = op.get('fields') or {}
                fields = {}
                for k in ALLOWED_FIELDS:
                    if k not in raw_fields:
                        continue
                    v = raw_fields[k]
                    if k == 'instructor_name':
                        instructor_id = resolve_instructor(v)
                        if instructor_id:
                            fields['primary_instructor_id'] = instructor_id
                        else:
                            errors.append(f'Operation {i + 1} ({klass["name"]}): '
                                          f'couldn\'t match teacher "{v}" — skipped that field.')
                    elif k in INT_FIELDS:
                        try:
                            fields[k] = int(v) if v is not None else None
                        except (TypeError, ValueError):
                            pass
                    elif k in FLOAT_FIELDS:
                        try:
                            fields[k] = round(float(v), 2) if v is not None else None
                        except (TypeError, ValueError):
                            pass
                    else:
                        fields[k] = str(v).strip()
                if not fields:
                    errors.append(f'Operation {i + 1} ({klass["name"]}): nothing valid to change — skipped.')
                    continue
                ops.append({'action': 'update_class', 'class_id': class_id, 'fields': fields,
                            'label': f'Update "{klass["name"]}" ({", ".join(fields.keys())})'})
        else:
            errors.append(f'Operation {i + 1}: unknown action "{action}" — skipped.')

    return ops, errors


def _conflict_warnings(snapshot: Dict[str, Any], ops: List[Dict[str, Any]]) -> List[str]:
    """Warn when the resulting schedule double-books a teacher or a classroom."""
    # Build the post-apply picture: class_id -> {name, instructor, location, meetings}
    state = {c['id']: {'name': c['name'], 'instructor': c.get('instructor'),
                       'location': c.get('location'), 'meetings': list(c['meetings'])}
             for c in snapshot['classes']}
    staff_names = {s['id']: s.get('name') for s in snapshot['staff']}
    new_idx = 0
    for op in ops:
        if op['action'] == 'archive_class':
            state.pop(op['class_id'], None)
        elif op['action'] == 'set_meetings':
            if op['class_id'] in state:
                state[op['class_id']]['meetings'] = op['meetings']
        elif op['action'] == 'update_class':
            if op['class_id'] in state:
                f = op['fields']
                if 'location' in f:
                    state[op['class_id']]['location'] = f['location']
                if 'primary_instructor_id' in f:
                    state[op['class_id']]['instructor'] = staff_names.get(f['primary_instructor_id'])
        elif op['action'] == 'create_class':
            new_idx += 1
            state[f'new-{new_idx}'] = {
                'name': op['fields']['name'],
                'instructor': staff_names.get(op['fields'].get('primary_instructor_id')),
                'location': op['fields'].get('location'),
                'meetings': op['meetings'],
            }

    warnings: List[str] = []
    items = list(state.values())
    for i, a in enumerate(items):
        for b in items[i + 1:]:
            same_teacher = a['instructor'] and a['instructor'] == b['instructor']
            same_room = a['location'] and a['location'] == b['location']
            if not (same_teacher or same_room):
                continue
            for ma in a['meetings']:
                for mb in b['meetings']:
                    if meetings_overlap(ma, mb):
                        what = 'Teacher' if same_teacher else 'Classroom'
                        who = a['instructor'] if same_teacher else a['location']
                        warnings.append(
                            f'{what} conflict: {who} has "{a["name"]}" and "{b["name"]}" '
                            f'overlapping (day {ma["day_of_week"]}).')
                        break
                else:
                    continue
                break
    return warnings


def _meeting_snapshot(meetings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [{'day_of_week': m.get('day_of_week'), 'specific_date': m.get('specific_date'),
             'start_time': m.get('start_time'), 'end_time': m.get('end_time'),
             'location': m.get('location')} for m in meetings]


def apply_operations(org_id: str, user_id: str,
                     operations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Execute staff-confirmed operations. Re-validates ownership per class.

    Also returns `undo_operations`: the inverse of what was actually applied
    (prior field values, prior meetings, un-archive), in reverse order, so the
    UI can offer one-click undo by posting them back through this same path.
    `restore_class` only ever appears in undo sets — it un-archives a class.
    """
    repo = _repo()
    own = {c['id'] for c in repo.list_for_org(org_id, include_archived=True)}
    applied, errors, undo = [], [], []

    for op in operations or []:
        action = op.get('action')
        try:
            if action == 'create_class':
                fields = op.get('fields') or {}
                created = repo.create_for_org(org_id, user_id, fields)
                for m in op.get('meetings') or []:
                    repo.add_meeting(created['id'], org_id, m)
                own.add(created['id'])
                applied.append(op.get('label') or f"Created {fields.get('name')}")
                undo.append({'action': 'archive_class', 'class_id': created['id'],
                             'label': f'Remove "{fields.get("name")}"'})
            elif action in ('update_class', 'set_meetings', 'archive_class', 'restore_class'):
                class_id = op.get('class_id')
                if class_id not in own:
                    errors.append('Skipped an operation on a class outside this organization.')
                    continue
                before = repo.find_by_id(class_id) or {}
                if action == 'update_class':
                    fields = op.get('fields') or {}
                    repo.update_sis_fields(class_id, fields)
                    prior = {k: before.get(k) for k in fields}
                    undo.append({'action': 'update_class', 'class_id': class_id, 'fields': prior,
                                 'label': f'Restore "{before.get("name")}" ({", ".join(fields.keys())})'})
                elif action == 'archive_class':
                    repo.archive(class_id)
                    undo.append({'action': 'restore_class', 'class_id': class_id,
                                 'status': before.get('status') or 'active',
                                 'label': f'Un-archive "{before.get("name")}"'})
                elif action == 'restore_class':
                    repo.client.table('org_classes').update(
                        {'status': op.get('status') or 'active'}).eq('id', class_id).execute()
                    undo.append({'action': 'archive_class', 'class_id': class_id,
                                 'label': f'Archive "{before.get("name")}"'})
                else:  # set_meetings
                    prior_meetings = _meeting_snapshot(repo.list_meetings(class_id))
                    for m in repo.list_meetings(class_id):
                        repo.delete_meeting(m['id'])
                    for m in op.get('meetings') or []:
                        repo.add_meeting(class_id, org_id, m)
                    undo.append({'action': 'set_meetings', 'class_id': class_id,
                                 'meetings': prior_meetings,
                                 'label': f'Restore "{before.get("name")}" schedule'})
                applied.append(op.get('label') or action)
            else:
                errors.append(f'Skipped unknown action "{action}".')
        except Exception as e:  # noqa: BLE001
            logger.error(f'schedule AI apply: {action} failed: {e}')
            errors.append(f'{op.get("label") or action} failed.')

    # Undo in reverse order so dependent changes unwind cleanly.
    return {'applied': applied, 'errors': errors, 'undo_operations': list(reversed(undo))}
