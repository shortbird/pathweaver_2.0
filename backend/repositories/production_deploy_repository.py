"""
Production Deploy Repository - the last release report per surface.

`production_deploys` holds one row for 'web' and one for 'mobile': the commit
production serves on that surface and the SHAs in its history, as release.yml
last reported them to the ticket deploy sweep. The sweep writes it on every
report and the cron replays it every ten minutes, so a ticket marked `fixed`
after a release still resolves once its commit is seen to be live, without
waiting for the next push. Deny-all RLS; read and written on the admin client.
"""

from typing import Any, Dict, List

from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository, DatabaseError
from utils.logger import get_logger

logger = get_logger(__name__)


class ProductionDeployRepository(BaseRepository):
    """Repository for the production_deploys table."""

    table_name = 'production_deploys'
    id_column = 'surface'

    def record(self, surface: str, sha: str, commits: List[str]) -> Dict[str, Any]:
        """Overwrite the row for `surface` with this report."""
        try:
            response = (
                self.client.table(self.table_name)
                .upsert({'surface': surface, 'sha': sha, 'commits': list(commits)}, on_conflict='surface')
                .execute()
            )
            return response.data[0] if response.data else {}
        except APIError as e:
            logger.error(f"Error recording production deploy for {surface}: {e}")
            raise DatabaseError("Failed to record production deploy") from e

    def latest(self) -> List[Dict[str, Any]]:
        """Every surface's last report (at most one row each)."""
        try:
            response = (
                self.client.table(self.table_name)
                .select('surface, sha, commits, reported_at')
                .order('surface')
                .execute()
            )
            return response.data or []
        except APIError as e:
            logger.error(f"Error reading production deploys: {e}")
            raise DatabaseError("Failed to read production deploys") from e
