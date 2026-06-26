"""
Program Repository - SIS program catalog data access.

A Program groups Classes (the unified org_classes registration unit) into an
offering families enroll into: Full-Day Microschool, Half-Day, Workshop, Camp, etc.
New SIS code uses the repository pattern (CLAUDE.md). Composed reads that join
programs to their classes live in services/sis_catalog_service.py.
"""

from typing import Optional, Dict, List, Any

from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class ProgramRepository(BaseRepository):
    table_name = 'programs'

    def list_for_org(self, organization_id: str,
                     include_archived: bool = False) -> List[Dict[str, Any]]:
        query = (
            self.client.table(self.table_name)
            .select('*')
            .eq('organization_id', organization_id)
        )
        if not include_archived:
            query = query.neq('status', 'archived')
        resp = query.order('name').execute()
        return resp.data or []

    def create_for_org(self, organization_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
        payload = {'organization_id': organization_id, **fields}
        resp = self.client.table(self.table_name).insert(payload).execute()
        return resp.data[0] if resp.data else None

    def update_fields(self, program_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        from datetime import datetime, timezone
        fields = {**fields, 'updated_at': datetime.now(timezone.utc).isoformat()}
        resp = (
            self.client.table(self.table_name)
            .update(fields)
            .eq('id', program_id)
            .execute()
        )
        return resp.data[0] if resp.data else None

    def archive(self, program_id: str) -> Optional[Dict[str, Any]]:
        return self.update_fields(program_id, {'status': 'archived'})
