"""GET /api/quests/<id>/enrollment-status is gone, and stays gone.

It read user_quests with the anonymous client, which RLS hides every row
from, so it answered "not_enrolled" for everyone, enrolled or not. Nothing in
web/ or mobile/ called it (checked 2026-09-24). A route that is always wrong
and never called is removed rather than repaired; enrollment state comes with
the quest detail (GET /api/quests/<id>) instead.
"""

import pytest


@pytest.mark.unit
def test_the_enrollment_status_route_is_not_registered():
    from app import app

    rules = {str(r) for r in app.url_map.iter_rules()}
    assert '/api/quests/<quest_id>/enrollment-status' not in rules
