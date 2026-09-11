"""Data access for `story_assets` -- the images a story considered, and the verdict on each.

`source_ref` is the canonical private URL of the original in `quest-evidence`.
It exists so an editor can be shown a thumbnail and so the publish step can
download the bytes; it never reaches the public endpoint. `public_path` is
where the scrubbed copy sits in the public `story-assets` bucket once the story
is published, and it is null until then.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository

COLUMNS = (
    'id, story_id, source_block_id, source_item_index, source_ref, public_path, alt, '
    'caption, width, height, order_index, safety, included, created_at, updated_at'
)


class StoryAssetRepository(BaseRepository):
    table_name = 'story_assets'

    def __init__(self, client: Any = None):
        # admin client justified: service-role-only table holding private
        # evidence pointers; callers are superadmin routes and the story worker.
        super().__init__(user_id=None, client=client)

    def for_story(self, story_id: str) -> List[Dict[str, Any]]:
        return self.client.table(self.table_name).select(COLUMNS).eq(
            'story_id', story_id).order('order_index').execute().data or []

    def for_stories(self, story_ids: List[str]) -> List[Dict[str, Any]]:
        """Assets for a page of stories at once. Bounded by the story list, so
        a plain read is fine; the public list is at most a few hundred rows."""
        ids = [s for s in (story_ids or []) if s]
        if not ids:
            return []
        return self.client.table(self.table_name).select(COLUMNS).in_(
            'story_id', ids).order('order_index').execute().data or []

    def get(self, asset_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select(COLUMNS).eq(
            'id', asset_id).limit(1).execute().data
        return rows[0] if rows else None

    def replace_for_story(self, story_id: str, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """A regenerate starts the asset list over. Delete, then insert."""
        self.client.table(self.table_name).delete().eq('story_id', story_id).execute()
        if not rows:
            return []
        inserted = self.client.table(self.table_name).insert(rows).execute().data
        return inserted or list(rows)

    def patch(self, asset_id: str, changes: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).update(changes).eq(
            'id', asset_id).execute().data
        return rows[0] if rows else None

    def clear_public_paths(self, story_id: str) -> None:
        """After the public copies are deleted, forget where they were."""
        self.client.table(self.table_name).update({'public_path': None}).eq(
            'story_id', story_id).execute()
