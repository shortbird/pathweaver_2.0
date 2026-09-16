"""The record of a known-CSAM hash match on an upload (csam_incidents).

One row per refused upload: who, where on the platform, the provider that
matched, the hash and the quarantine path. Written by upload_safety_service;
read by the superadmin tracker and by whoever files the CyberTipline report
(docs/CHILD_SAFETY_REPORTING.md), who records the report id and time here so
the row says whether the legal duty was discharged.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.timestamps import now_iso


class CsamIncidentRepository(BaseRepository):
    table_name = 'csam_incidents'

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: the table has RLS and no policies on
            # purpose; only the service writes it and only a superadmin
            # route reads it.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    def record(self, *, user_id: Optional[str], purpose: str, filename: Optional[str],
               mime: str, byte_size: int, sha256: str, provider: str,
               details: Dict[str, Any], storage_path: Optional[str]) -> Optional[str]:
        row = {
            'user_id': user_id,
            'purpose': purpose,
            'filename': (filename or '')[:255] or None,
            'mime': mime[:100],
            'byte_size': byte_size,
            'sha256': sha256,
            'provider': provider,
            'details': details or {},
            'storage_path': storage_path,
        }
        data = self.client.table(self.table_name).insert(row).execute().data
        return data[0]['id'] if data else None

    def recent(self, limit: int = 50) -> List[Dict[str, Any]]:
        return self.client.table(self.table_name) \
            .select('id, user_id, purpose, filename, provider, created_at, reported_at, report_reference') \
            .order('created_at', desc=True).limit(limit).execute().data or []

    def mark_reported(self, incident_id: str, *, reference: str, by_user_id: str) -> None:
        self.client.table(self.table_name).update({
            'reported_at': now_iso(), 'report_reference': reference[:200], 'reported_by': by_user_id,
        }).eq('id', incident_id).execute()
