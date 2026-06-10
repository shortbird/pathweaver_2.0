"""
Data access for The Treehouse program (program-specific tab, OEA-style).

All methods take a Supabase client (the routes pass the admin client, mirroring
routes/oea.py — Optio uses custom JWT auth, not auth.uid(), and these tables have
RLS enabled with no public policies). Org gating is the caller's responsibility;
this layer just reads/writes the treehouse_* tables.
"""

from typing import Any, Dict, List, Optional


class TreehouseRepository:
    def __init__(self, client):
        self.client = client

    # ── signals (I Need Help / I'm Proud) ────────────────────────────────────
    def create_signal(self, data: Dict[str, Any]) -> Dict[str, Any]:
        res = self.client.table('treehouse_signals').insert(data).execute()
        return res.data[0] if res.data else {}

    def list_open_signals(self, organization_id: str) -> List[Dict[str, Any]]:
        res = (self.client.table('treehouse_signals')
               .select('*')
               .eq('organization_id', organization_id)
               .eq('status', 'open')
               .order('created_at', desc=True)
               .execute())
        return res.data or []

    def resolve_signal(self, signal_id: str, resolved_by: str) -> Dict[str, Any]:
        from datetime import datetime, timezone
        res = (self.client.table('treehouse_signals')
               .update({'status': 'resolved', 'resolved_by': resolved_by,
                        'resolved_at': datetime.now(timezone.utc).isoformat()})
               .eq('id', signal_id).execute())
        return res.data[0] if res.data else {}

    def get_signal(self, signal_id: str) -> Optional[Dict[str, Any]]:
        res = self.client.table('treehouse_signals').select('*').eq('id', signal_id).limit(1).execute()
        return res.data[0] if res.data else None

    # ── pins (only marked-created/distributed are stored) ────────────────────
    def list_marked_pins(self, organization_id: str) -> List[Dict[str, Any]]:
        res = (self.client.table('treehouse_pins')
               .select('*').eq('organization_id', organization_id).execute())
        return res.data or []

    def upsert_pin(self, student_id: str, quest_id: str, organization_id: str,
                   status: str, marked_by: str) -> Dict[str, Any]:
        from datetime import datetime, timezone
        row = {
            'student_id': student_id, 'quest_id': quest_id,
            'organization_id': organization_id, 'status': status,
            'marked_by': marked_by, 'marked_at': datetime.now(timezone.utc).isoformat(),
        }
        res = (self.client.table('treehouse_pins')
               .upsert(row, on_conflict='student_id,quest_id').execute())
        return res.data[0] if res.data else {}

    # ── showcase events + participants ───────────────────────────────────────
    def list_events(self, organization_id: str) -> List[Dict[str, Any]]:
        res = (self.client.table('treehouse_showcase_events')
               .select('*').eq('organization_id', organization_id)
               .order('showcase_date', desc=False).execute())
        return res.data or []

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        res = self.client.table('treehouse_showcase_events').select('*').eq('id', event_id).limit(1).execute()
        return res.data[0] if res.data else None

    def create_event(self, data: Dict[str, Any]) -> Dict[str, Any]:
        res = self.client.table('treehouse_showcase_events').insert(data).execute()
        return res.data[0] if res.data else {}

    def update_event(self, event_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        from datetime import datetime, timezone
        data['updated_at'] = datetime.now(timezone.utc).isoformat()
        res = self.client.table('treehouse_showcase_events').update(data).eq('id', event_id).execute()
        return res.data[0] if res.data else {}

    def list_participants(self, event_id: str) -> List[Dict[str, Any]]:
        res = (self.client.table('treehouse_showcase_participants')
               .select('*').eq('event_id', event_id)
               .order('joined_at', desc=False).execute())
        return res.data or []

    def join_event(self, data: Dict[str, Any]) -> Dict[str, Any]:
        res = (self.client.table('treehouse_showcase_participants')
               .upsert(data, on_conflict='event_id,student_id').execute())
        return res.data[0] if res.data else {}

    # ── kiosk devices ────────────────────────────────────────────────────────
    def create_kiosk_device(self, data: Dict[str, Any]) -> Dict[str, Any]:
        res = self.client.table('treehouse_kiosk_devices').insert(data).execute()
        return res.data[0] if res.data else {}

    def get_active_device_by_hash(self, token_hash: str) -> Optional[Dict[str, Any]]:
        res = (self.client.table('treehouse_kiosk_devices')
               .select('*').eq('token_hash', token_hash).eq('is_active', True).limit(1).execute())
        return res.data[0] if res.data else None

    def touch_device(self, device_id: str) -> None:
        from datetime import datetime, timezone
        (self.client.table('treehouse_kiosk_devices')
         .update({'last_used_at': datetime.now(timezone.utc).isoformat()})
         .eq('id', device_id).execute())
