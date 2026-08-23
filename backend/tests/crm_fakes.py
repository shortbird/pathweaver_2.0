"""
In-memory Supabase double for the CRM test suite.

Implements just enough of the postgrest query-builder chain for the code
paths in services/crm_service.py, services/crm_funnel_engine.py, and
routes/crm.py: filters (eq/neq/in_/contains/ilike/lt/gte), order/limit/range,
count='exact', insert/update/delete/upsert, per-table column defaults, the
unique constraints the CRM design leans on (raised as postgrest APIError so
production except-clauses fire), and the three embedded-resource joins the
CRM queries use.

Not a general PostgREST emulator — extend it when a new CRM query needs more.
"""
import re
import uuid
from datetime import datetime, timezone

from postgrest.exceptions import APIError


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


TABLE_DEFAULTS = {
    'crm_leads': lambda: {'status': 'active', 'unsubscribe_token': str(uuid.uuid4()),
                          'created_at': _now_iso(), 'updated_at': _now_iso(),
                          'first_name': None, 'last_name': None, 'phone': None,
                          'lead_type': None, 'lead_source': None, 'user_id': None,
                          'converted_at': None, 'conversion_event': None, 'notes': None},
    'crm_funnels': lambda: {'status': 'paused', 'funnel_type': 'nurture',
                            'entry_types': [], 'description': None,
                            'created_at': _now_iso(), 'updated_at': _now_iso()},
    'crm_funnel_steps': lambda: {'is_active': True, 'text_body': None,
                                 'updated_at': _now_iso(), 'updated_by': None},
    'crm_funnel_memberships': lambda: {'status': 'active', 'last_step_sent': 0,
                                       'entered_at': _now_iso(), 'last_sent_at': None,
                                       'exit_reason': None, 'exited_at': None,
                                       'created_at': _now_iso()},
    'crm_sends': lambda: {'status': 'sending', 'provider_message_id': None,
                          'error': None, 'created_at': _now_iso(), 'sent_at': None,
                          'subject': None},
    'crm_suppressions': lambda: {'source': None, 'created_at': _now_iso()},
    'crm_events': lambda: {'detail': {}, 'created_at': _now_iso()},
    'crm_email_events': lambda: {'send_id': None, 'lead_id': None, 'email': None,
                                 'payload': {}, 'occurred_at': None,
                                 'created_at': _now_iso(), 'sg_event_id': None},
    'crm_calendar_bookings': lambda: {'matched_lead_id': None, 'event_start': None,
                                      'created_at': _now_iso()},
    'crm_settings': lambda: {'updated_at': _now_iso()},
}

# (table, embedded relation) -> foreign-key column on the child row
EMBEDS = {
    ('crm_funnel_memberships', 'crm_funnels'): 'funnel_id',
    ('crm_funnel_memberships', 'crm_leads'): 'lead_id',
    ('crm_sends', 'crm_funnel_steps'): 'step_id',
    ('crm_leads', 'crm_funnel_memberships'): None,  # reverse: children list
}

UNIQUE_CONSTRAINTS = {
    'crm_leads': [('email',)],
    'crm_funnels': [('key',)],
    'crm_sends': [('membership_id', 'step_id')],
    'crm_suppressions': [('email',)],
    'crm_funnel_steps': [('funnel_id', 'step_order')],
    'crm_email_events': [('sg_event_id',)],
    'crm_calendar_bookings': [('gcal_event_id', 'attendee_email')],
}


class FakeResult:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class FakeQuery:
    def __init__(self, db, table):
        self.db = db
        self.table_name = table
        self.op = 'select'
        self.payload = None
        self.filters = []
        self.order_col = None
        self.order_desc = False
        self.limit_n = None
        self.range_ = None
        self.want_count = False
        self.select_str = '*'

    # -- builders -----------------------------------------------------------
    def select(self, cols='*', count=None):
        self.op = 'select' if self.op == 'select' else self.op
        self.select_str = cols
        self.want_count = count == 'exact'
        return self

    def insert(self, payload):
        self.op = 'insert'
        self.payload = payload
        return self

    def update(self, payload):
        self.op = 'update'
        self.payload = payload
        return self

    def delete(self):
        self.op = 'delete'
        return self

    def upsert(self, payload):
        self.op = 'upsert'
        self.payload = payload
        return self

    def eq(self, col, val):
        self.filters.append(('eq', col, val))
        return self

    def neq(self, col, val):
        self.filters.append(('neq', col, val))
        return self

    def in_(self, col, vals):
        self.filters.append(('in', col, list(vals)))
        return self

    def contains(self, col, vals):
        self.filters.append(('contains', col, list(vals)))
        return self

    def ilike(self, col, pattern):
        self.filters.append(('ilike', col, pattern))
        return self

    def lt(self, col, val):
        self.filters.append(('lt', col, val))
        return self

    def gte(self, col, val):
        self.filters.append(('gte', col, val))
        return self

    def or_(self, expr):
        self.filters.append(('or', None, expr))
        return self

    def order(self, col, desc=False):
        self.order_col = col
        self.order_desc = desc
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    def range(self, start, end):
        self.range_ = (start, end)
        return self

    # -- execution ----------------------------------------------------------
    def _matches(self, row, skip_embedded=True):
        for kind, col, val in self.filters:
            if col and '.' in col and skip_embedded:
                continue  # embedded-resource filter: not emulated
            if kind == 'eq' and row.get(col) != val:
                return False
            if kind == 'neq' and row.get(col) == val:
                return False
            if kind == 'in' and row.get(col) not in val:
                return False
            if kind == 'contains':
                have = row.get(col) or []
                if not all(v in have for v in val):
                    return False
            if kind == 'ilike':
                pattern = '^' + re.escape(val).replace('%', ' ').replace(
                    ' ', '.*') + '$'
                if not re.match(pattern, str(row.get(col) or ''), re.IGNORECASE):
                    return False
            if kind == 'lt' and not (str(row.get(col) or '') < str(val)):
                return False
            if kind == 'gte' and not (str(row.get(col) or '') >= str(val)):
                return False
            if kind == 'or':
                # crude: match any ilike clause inside the or() expression
                clauses = [c.split('.ilike.') for c in val.split(',') if '.ilike.' in c]
                ok = False
                for ccol, cpat in clauses:
                    pattern = '^' + re.escape(cpat).replace('%', ' ').replace(
                        ' ', '.*') + '$'
                    if re.match(pattern, str(row.get(ccol) or ''), re.IGNORECASE):
                        ok = True
                if clauses and not ok:
                    return False
        return True

    def _attach_embeds(self, row):
        out = dict(row)
        for match in re.finditer(r'(\w+)\s*\(', self.select_str):
            rel = match.group(1)
            fk = EMBEDS.get((self.table_name, rel), 'missing')
            if fk == 'missing':
                continue
            if fk is None:  # reverse embed: list of children referencing us
                children = [dict(c) for c in self.db.data.get(rel, [])
                            if c.get(self.table_name[:-1] + '_id') == row.get('id')
                            or c.get('lead_id') == row.get('id')]
                out[rel] = children
            else:
                parent_table = rel
                parent = next((p for p in self.db.data.get(parent_table, [])
                               if p.get('id') == row.get(fk)), None)
                out[rel] = dict(parent) if parent else None
        return out

    def _check_unique(self, rows, payload, exclude_id=None):
        for cols in UNIQUE_CONSTRAINTS.get(self.table_name, []):
            if not all(c in payload or c in TABLE_DEFAULTS.get(self.table_name, dict)()
                       for c in cols):
                continue
            for row in rows:
                if exclude_id and row.get('id') == exclude_id:
                    continue
                if all(row.get(c) == payload.get(c) for c in cols) and \
                        all(payload.get(c) is not None for c in cols):
                    raise APIError({'message': f'duplicate key: {cols}',
                                    'code': '23505', 'hint': '', 'details': ''})

    def execute(self):
        rows = self.db.data.setdefault(self.table_name, [])
        if self.op == 'insert':
            payloads = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for p in payloads:
                self._check_unique(rows, p)
                row = TABLE_DEFAULTS.get(self.table_name, dict)()
                row.update({'id': str(uuid.uuid4())})
                row.update(p)
                # partial unique index: one ACTIVE membership per lead
                if self.table_name == 'crm_funnel_memberships' and \
                        row.get('status', 'active') == 'active':
                    if any(r.get('lead_id') == row['lead_id'] and r.get('status') == 'active'
                           for r in rows):
                        raise APIError({'message': 'duplicate key: one active membership',
                                        'code': '23505', 'hint': '', 'details': ''})
                rows.append(row)
                inserted.append(dict(row))
            return FakeResult(inserted)
        if self.op == 'upsert':
            key = self.payload.get('key')
            existing = next((r for r in rows if r.get('key') == key), None)
            if existing:
                existing.update(self.payload)
                return FakeResult([dict(existing)])
            row = TABLE_DEFAULTS.get(self.table_name, dict)()
            row.update({'id': str(uuid.uuid4())})
            row.update(self.payload)
            rows.append(row)
            return FakeResult([dict(row)])
        if self.op == 'update':
            updated = []
            for row in rows:
                if self._matches(row):
                    row.update(self.payload)
                    updated.append(dict(row))
            return FakeResult(updated)
        if self.op == 'delete':
            keep = [r for r in rows if not self._matches(r)]
            deleted = [r for r in rows if self._matches(r)]
            self.db.data[self.table_name] = keep
            return FakeResult(deleted)

        # select
        matched = [r for r in rows if self._matches(r)]
        if self.order_col:
            matched.sort(key=lambda r: str(r.get(self.order_col) or ''),
                         reverse=self.order_desc)
        count = len(matched) if self.want_count else None
        if self.range_:
            matched = matched[self.range_[0]:self.range_[1] + 1]
        if self.limit_n is not None:
            matched = matched[:self.limit_n]
        matched = [self._attach_embeds(r) for r in matched]
        return FakeResult(matched, count=count)


class FakeSupabase:
    def __init__(self, data=None):
        self.data = data or {}

    def table(self, name):
        return FakeQuery(self, name)


def make_world(**overrides):
    """A FakeSupabase preloaded with one active funnel (2 steps: 1h and 48h),
    settings with a postal address, and empty lead tables. Tests mutate from
    here."""
    db = FakeSupabase()
    funnel_id = 'funnel-1'
    db.data['crm_funnels'] = [{
        'id': funnel_id, 'key': 'free_class_nurture', 'name': 'Free Class Nurture',
        'status': 'active', 'funnel_type': 'nurture',
        'entry_types': ['claim_free_class'], 'description': None,
        'created_at': _now_iso(), 'updated_at': _now_iso(),
    }]
    db.data['crm_funnel_steps'] = [
        {'id': 'step-1', 'funnel_id': funnel_id, 'step_order': 1, 'name': 'Step one',
         'subject': 'Hi {{first_name}}', 'html_body': '<p>Hello {{first_name}}</p>',
         'text_body': None, 'delay_hours': 1, 'is_active': True,
         'updated_at': _now_iso(), 'updated_by': None},
        {'id': 'step-2', 'funnel_id': funnel_id, 'step_order': 2, 'name': 'Step two',
         'subject': 'Still there?', 'html_body': '<p>Follow up</p>',
         'text_body': None, 'delay_hours': 48, 'is_active': True,
         'updated_at': _now_iso(), 'updated_by': None},
    ]
    db.data['crm_settings'] = [
        {'key': 'send_window', 'value': {'tz': 'America/Denver',
                                         'start_hour': 0, 'end_hour': 24},
         'updated_at': _now_iso()},
        {'key': 'postal_address', 'value': '123 Test St, Salt Lake City, UT',
         'updated_at': _now_iso()},
        {'key': 'sweep_batch_cap', 'value': 50, 'updated_at': _now_iso()},
    ]
    for table in ('crm_leads', 'crm_funnel_memberships', 'crm_sends',
                  'crm_suppressions', 'crm_events', 'crm_email_events',
                  'crm_calendar_bookings', 'users'):
        db.data.setdefault(table, [])
    db.data.update(overrides)
    return db
