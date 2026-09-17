"""UFA learning-day selections: sis_learning_day_selections.

services/sis_learning_day_service still reads and writes one student's row
directly; the school-wide read lands here. It is what the tuition queue
needs to price every pending student's week in one pass (M5), and a read
that spans the whole school is exactly the kind that has to page.
"""

from __future__ import annotations

from typing import Dict, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows


class SisLearningDayRepository(BaseRepository):
    table_name = 'sis_learning_day_selections'

    def choices_for_org(self, organization_id: str) -> Dict[str, Optional[str]]:
        """{student_user_id: choice} for every student with a saved learning day."""
        rows = fetch_all_rows(lambda: (
            self.client.table(self.table_name)
            .select('student_user_id, choice')
            .eq('organization_id', organization_id)))
        return {r['student_user_id']: r.get('choice') for r in rows}
